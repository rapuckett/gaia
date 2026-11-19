# Copyright(C) 2025-2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT

"""Read a log for a person to see or share: the last lines, redacted.

Every line leaves this module redacted (API keys, bearer tokens and the like
never reach the UI, a saved file or a diagnostics bundle) and tagged with its
severity, read from whichever format wrote it: GAIA's ``| INFO |``, Lemonade's
``[Info] (Tag)``, Electron's ``INFO`` / ``[info]``, uvicorn's ``INFO:``.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

#: Most lines one read returns; older ones are dropped and counted.
MAX_LINES = 5000
DEFAULT_LINES = 1000
#: Most of a file one read scans; some logs grow without bound.
MAX_READ_BYTES = 2 * 1024 * 1024
#: A tools schema or prompt can be one 100 KB line; keep its start.
MAX_LINE_CHARS = 2000

#: ``2026-11-04 10:06:05.218 [Info] (Server) Starting HTTP server ...`` (Lemonade)
_LEMONADE_LINE_RE = re.compile(
    r"^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d(?:\.\d+)?\s+"
    r"\[(?P<sev>[A-Za-z]+)\]\s+\((?P<tag>[^)]*)\)"
)
#: A level word set off as one: ``| INFO |``, ``[info]``, ``] INFO [``, ``INFO:``.
_LEVEL_RE = re.compile(
    r"(?:^|[\[|\s])(trace|debug|info|warn|warning|error|err|critical|fatal)"
    r"(?:[\]|:]|\s[|\[])",
    re.IGNORECASE,
)
#: How far into a line its level can sit (after a timestamp and a pid).
_LEVEL_WINDOW = 64
_ANSI_RE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")

_SEVERITIES = {
    "trace": "debug",
    "debug": "debug",
    "info": "info",
    "warn": "warning",
    "warning": "warning",
    "error": "error",
    "err": "error",
    "fatal": "error",
    "critical": "error",
}

REDACTED = "[redacted]"

_REDACTIONS = (
    (
        re.compile(r"(?i)(authorization\s*[:=]\s*)(?:(?:bearer|basic)\s+)?[^\s,;\"']+"),
        r"\1" + REDACTED,
    ),
    (re.compile(r"(?i)\b(bearer\s+)[A-Za-z0-9._~+/=-]{6,}"), r"\1" + REDACTED),
    (
        re.compile(r"(?i)(--(?:api-key|api_key|token|hf-token|password)(?:=|\s+))\S+"),
        r"\1" + REDACTED,
    ),
    (
        re.compile(
            r"(?i)((?<![a-z0-9])(?:api[_-]?key|(?:access|auth|refresh|id|api|hf)[_-]?token"
            r"|client[_-]?secret|secret[_-]?key|password|passwd)[\"']?\s*[:=]\s*[\"']?)"
            r"(?![{\[\s])[^\s\"',}&]+"
        ),
        r"\1" + REDACTED,
    ),
    # A bare "token" only as key=value: llama.cpp prints "token: 1 '<eos>'" about vocabulary.
    (re.compile(r"(?i)\b(token=)[^\s\"',}&]+"), r"\1" + REDACTED),
    # An OAuth redirect's query, e.g. an access-log line for the sign-in callback.
    (
        re.compile(r"(?i)([?&](?:code|state|code_verifier|session_state)=)[^\s&\"'#]+"),
        r"\1" + REDACTED,
    ),
    (re.compile(r"\bhf_[A-Za-z0-9]{16,}\b"), REDACTED),
    (re.compile(r"\bsk-[A-Za-z0-9_-]{16,}\b"), REDACTED),
    (re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b"), REDACTED),
    (re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}\b"), REDACTED),
    (re.compile(r"\bxapp-[A-Za-z0-9-]{10,}\b"), REDACTED),
    (re.compile(r"\bfw_[A-Za-z0-9]{16,}\b"), REDACTED),
    # A paired device's token (gaia.ui.devices.DEVICE_TOKEN_PREFIX).
    (re.compile(r"\bgaiad_[A-Za-z0-9_-]{20,}"), REDACTED),
)

#: Tokens with no fixed prefix to look for first, so every line is checked.
_UNMARKED_SHAPES = (
    # Telegram bot token: the bot's id, a colon, 35 characters; in a Bot API URL after /bot.
    r"(?:(?<=/bot)|(?<![\w-]))\d{6,12}:[A-Za-z0-9_-]{35}(?![\w-])",
    # Discord bot token: the bot's id in base64 (M, N or O first), a time, an HMAC.
    r"(?<![\w.-])[MNO][A-Za-z0-9_-]{23,27}\.[A-Za-z0-9_-]{6,7}\.[A-Za-z0-9_-]{27,40}(?![\w.-])",
)
_UNMARKED = tuple(re.compile(p) for p in _UNMARKED_SHAPES)
_UNMARKED_BYTES = tuple(re.compile(p.encode()) for p in _UNMARKED_SHAPES)

#: Environment variables whose values are secrets wherever they turn up.
_SECRET_ENV_RE = re.compile(r"key|token|secret|pass(word|wd)?|credential", re.I)


#: A word one of the patterns above needs; most lines have none and skip them.
#: Plain substrings: a case-insensitive regex here costs more than the patterns.
#: llama.cpp says "n_tokens" on every other line, so only a credential's names count.
_TRIGGERS = (
    "authorization",
    "bearer",
    "key",
    "secret",
    "passw",
    "hf_",
    "sk-",
    "gh",
    "xox",
    "xapp-",
    "fw_",
    "gaiad_",
    "token=",
    "?code",
    "&code",
    "?state",
    "&state",
    "--token",
    *(
        f"{kind}{sep}token"
        for kind in ("access", "auth", "refresh", "id", "api", "hf")
        for sep in ("", "_", "-")
    ),
)


def redact(text: str, secrets: Iterable[str] = ()) -> str:
    """*text* with every known secret and anything shaped like one replaced."""
    for secret in secrets:
        if secret and _is_secret_value(secret):
            text = text.replace(secret, REDACTED)
    for pattern in _UNMARKED:
        text = pattern.sub(REDACTED, text)
    lower = text.lower()
    if not any(word in lower for word in _TRIGGERS):
        return text
    for pattern, repl in _REDACTIONS:
        text = pattern.sub(repl, text)
    return text


def redact_lines(data: bytes, secrets: Iterable[str] = ()) -> bytes:
    """*data*, a log's bytes, redacted line by line; lines with nothing to hide stay as they were.

    Finds the lines worth a look across the whole buffer first, so a 50 MB log
    costs seconds, not a regex pass per line.
    """
    for secret in secrets:
        if secret and _is_secret_value(secret):
            data = data.replace(secret.encode("utf-8"), REDACTED.encode())
    for pattern in _UNMARKED_BYTES:
        data = pattern.sub(REDACTED.encode(), data)
    lower = data.lower()  # ASCII only, so offsets match *data*
    starts = set()
    for word in _TRIGGERS:
        needle = word.encode()
        i = lower.find(needle)
        while i != -1:
            start = lower.rfind(b"\n", 0, i) + 1
            starts.add(start)
            end = lower.find(b"\n", i)
            i = -1 if end == -1 else lower.find(needle, end)
    if not starts:
        return data
    out, pos = [], 0
    for start in sorted(starts):
        end = data.find(b"\n", start)
        end = len(data) if end == -1 else end
        out.append(data[pos:start])
        line = data[start:end].decode("utf-8", errors="replace")
        out.append(redact(line).encode("utf-8"))
        pos = end
    out.append(data[pos:])
    return b"".join(out)


#: Stock placeholder keys for local servers; each is also a word in paths and module names.
_PLACEHOLDER_KEYS = frozenset({"lemonade", "ollama", "placeholder", "changeme"})


def _is_secret_value(value: str) -> bool:
    """False for a short value or a known placeholder key such as "lemonade".

    Removing a placeholder everywhere leaves a log nobody can read.
    """
    return len(value) >= 6 and value.lower() not in _PLACEHOLDER_KEYS


def env_secrets() -> List[str]:
    """Values of this process's secret-named environment variables."""
    return [
        value.strip()
        for name, value in os.environ.items()
        if _SECRET_ENV_RE.search(name) and value and _is_secret_value(value.strip())
    ]


def stored_secrets() -> Tuple[List[str], List[str]]:
    """The credentials GAIA keeps for the user, and the ones it could not read.

    Cloud provider keys, the Discord and Slack bot tokens, each connector's OAuth
    client secret and refresh token, and every MCP server's secret settings.
    Returns ``(values, unreadable)``; *unreadable* names each kind of credential
    whose store did not answer, so the caller can say it is removed only by shape.
    """
    import importlib.util

    if importlib.util.find_spec("keyring") is None:
        return [], []  # Nothing can be saved without it.
    from keyring.backends import fail, null

    from gaia.connectors._keyring import keyring
    from gaia.connectors.errors import ConnectorsError

    if isinstance(keyring.get_keyring(), (fail.Keyring, null.Keyring)):
        return [], []
    values: List[str] = []
    unreadable: List[str] = []
    for label, read in _STORED_SECRET_SOURCES:
        try:
            values.extend(v for v in read() if isinstance(v, str))
        except (
            ConnectorsError,
            keyring.errors.KeyringError,
            OSError,
            ValueError,
            RuntimeError,
        ) as e:
            unreadable.append(f"{label} ({type(e).__name__})")
    return [v.strip() for v in values if v and _is_secret_value(v.strip())], unreadable


def _keyring_slots(*usernames: str) -> List[Optional[str]]:
    from gaia.connectors._keyring import keyring
    from gaia.connectors.store import SERVICE_NAME

    return [keyring.get_password(SERVICE_NAME, name) for name in usernames]


def _cloud_keys() -> List[Optional[str]]:
    from gaia.connectors.store import peek_secret
    from gaia.llm.gateway import GATEWAY_SECRET_NAME, stored_secret_value
    from gaia.llm.lemonade_choice import API_KEY_SECRET_NAME as LEMONADE_SLOT
    from gaia.llm.providers.fireworks import API_KEY_SECRET_NAME as FIREWORKS_SLOT

    return [
        peek_secret(FIREWORKS_SLOT),
        stored_secret_value(peek_secret(GATEWAY_SECRET_NAME)),
        peek_secret(LEMONADE_SLOT),
    ]


def _messaging_tokens() -> List[Optional[str]]:
    from gaia.messaging.discord import credentials as discord
    from gaia.messaging.slack import credentials as slack

    return _keyring_slots(
        discord.BOT_TOKEN_KEY, slack.BOT_TOKEN_KEY, slack.APP_TOKEN_KEY
    )


def _connector_specs() -> list:
    # Registers the built-in specs.
    import gaia.connectors.catalog  # noqa: F401  # pylint: disable=unused-import
    from gaia.connectors.registry import REGISTRY

    return REGISTRY.all()


def _oauth_secrets() -> List[Optional[str]]:
    from gaia.connectors import store

    out: List[Optional[str]] = []
    for spec in _connector_specs():
        if spec.type != "oauth_pkce":
            continue
        client = store.peek_provider_credentials(spec.id)
        if isinstance(client, dict):
            out.append(client.get("client_secret"))
        connection = store.peek_connection(spec.id)
        if isinstance(connection, dict):
            out.extend(connection.get(f) for f in ("refresh_token", "access_token"))
    return out


def _mcp_server_secrets() -> List[Optional[str]]:
    from gaia.connectors import mcp_server
    from gaia.connectors.store import SERVICE_NAME

    out: List[Optional[str]] = []
    for spec in _connector_specs():
        if spec.type == "mcp_server":
            out.extend(mcp_server._saved_secret(spec, k) for k in spec.mcp_env_keys)
    # Servers the user added by hand keep plain values or their own keyring slots.
    for entry in mcp_server._read_mcp_servers_json().values():
        if not isinstance(entry, dict):
            continue
        for section in ("env", "headers"):
            settings = entry.get(section)
            if not isinstance(settings, dict):
                continue
            for name, value in settings.items():
                ref = value.get("$keyring") if isinstance(value, dict) else None
                if isinstance(ref, str) and ref.startswith(f"{SERVICE_NAME}:"):
                    out.extend(_keyring_slots(ref[len(SERVICE_NAME) + 1 :]))
                elif isinstance(value, str) and (
                    _SECRET_ENV_RE.search(name) or name.lower() == "authorization"
                ):
                    out.extend([value, value.split()[-1] if value.split() else ""])
    return out


_STORED_SECRET_SOURCES = (
    ("cloud provider keys", _cloud_keys),
    ("Discord and Slack bot tokens", _messaging_tokens),
    ("connector sign-ins", _oauth_secrets),
    ("MCP server settings", _mcp_server_secrets),
)


@dataclass
class LogLine:
    """One redacted line; ``severity`` is debug/info/warning/error or None."""

    text: str
    severity: Optional[str] = None
    tag: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {"text": self.text, "severity": self.severity, "tag": self.tag}


@dataclass
class LogRead:
    """What the viewer shows: the lines, or why there are none.

    ``reason`` is a code the UI words: ``no_file`` (nothing written yet),
    ``unreadable``, and for the model server ``not_running`` (the user's
    server is not answering), ``remote`` (it runs on another computer and its
    stream did not answer), ``no_stream`` (it reports no log stream) or
    ``stream_failed``. ``detail`` carries the technical cause.
    """

    owner: Optional[str] = None
    base_url: Optional[str] = None
    source: Optional[str] = None  # file | stream
    available: bool = False
    lines: List[LogLine] = field(default_factory=list)
    cursor: Optional[str] = None
    #: The cursor no longer matched (log restarted or rotated): replace, don't append.
    reset: bool = False
    #: Lines skipped because the read was over its limit.
    dropped: int = 0
    log_path: Optional[str] = None
    #: Whether the model server answered ``/health`` just now; None when not checked.
    server_answering: Optional[bool] = None
    reason: Optional[str] = None
    detail: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "owner": self.owner,
            "base_url": self.base_url,
            "source": self.source,
            "available": self.available,
            "lines": [line.to_dict() for line in self.lines],
            "cursor": self.cursor,
            "reset": self.reset,
            "dropped": self.dropped,
            "log_path": self.log_path,
            "server_answering": self.server_answering,
            "reason": self.reason,
            "detail": self.detail,
        }


def severity_of(word: str) -> Optional[str]:
    return _SEVERITIES.get(word.lower())


def parse_line(raw: str, secrets: Iterable[str] = ()) -> LogLine:
    """One line, redacted, with its level and Lemonade tag when it names them.

    A line naming no level (a traceback, a wrapped message) has none.
    """
    text = redact(_ANSI_RE.sub("", raw.rstrip("\r\n")), secrets)
    if len(text) > MAX_LINE_CHARS:
        text = (
            text[:MAX_LINE_CHARS] + f" … [{len(text) - MAX_LINE_CHARS} more characters]"
        )
    lemonade = _LEMONADE_LINE_RE.match(text)
    if lemonade:
        return LogLine(
            text=text,
            severity=severity_of(lemonade.group("sev")) or "info",
            tag=lemonade.group("tag") or None,
        )
    level = _LEVEL_RE.search(text[:_LEVEL_WINDOW])
    return LogLine(text=text, severity=severity_of(level.group(1)) if level else None)


def keep_last(items: list, limit: int) -> Tuple[list, int]:
    """The last *limit* items, and how many were dropped."""
    if len(items) <= limit:
        return items, 0
    return items[-limit:], len(items) - limit


def _at_line_start(handle, offset: int) -> bool:
    """Whether byte *offset* of *handle* begins a line (the byte before it is ``\\n``)."""
    handle.seek(offset - 1)
    return handle.read(1) == b"\n"


def read_log_file(
    path: Path,
    *,
    after: Optional[int] = None,
    limit: int = DEFAULT_LINES,
    secrets: Iterable[str] = (),
) -> LogRead:
    """The lines of *path* after byte offset *after*, or its last *limit* lines.

    The cursor is the byte offset just past the last whole line read, so a
    line still being written is read whole next time.
    """
    result = LogRead(source="file", log_path=str(path))
    try:
        with open(path, "rb") as handle:
            size = handle.seek(0, os.SEEK_END)
            start = after if after is not None else max(0, size - MAX_READ_BYTES)
            if after is not None and after > size:
                # Shorter than where we stopped: the file was replaced.
                start, result.reset = max(0, size - MAX_READ_BYTES), True
            elif after and not _at_line_start(handle, after):
                # Mid-line would split a secret past redaction: read the tail instead.
                start, result.reset = max(0, size - MAX_READ_BYTES), True
            if size - start > MAX_READ_BYTES:
                start, result.reset = size - MAX_READ_BYTES, after is not None
            handle.seek(start)
            data = handle.read(size - start)
    except FileNotFoundError:
        result.reason = "no_file"
        return result
    except OSError as e:
        result.reason, result.detail = "unreadable", f"{path}: {e}"
        return result

    end = data.rfind(b"\n") + 1
    complete = data[:end]
    if start > 0 and (after is None or result.reset):
        # Started mid-line: the first piece is half a line.
        first = complete.find(b"\n") + 1
        complete = complete[first:]
    text = complete.decode("utf-8", errors="replace")
    raw_lines, result.dropped = keep_last(
        [raw for raw in text.splitlines() if raw.strip()], limit
    )
    result.lines = [parse_line(raw, secrets) for raw in raw_lines]
    result.cursor = str(start + end)
    result.available = True
    return result
