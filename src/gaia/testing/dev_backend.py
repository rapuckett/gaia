# Copyright(C) 2025-2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT
"""A throwaway Agent UI backend for end-to-end tests.

Serves GAIA's real Agent UI API on 127.0.0.1 against a scripted, fake
OpenAI-compatible LLM, with all state under a directory the caller names::

    python -m gaia.testing.dev_backend --port 4210 --home /tmp/gaia-e2e \\
        --llm-port 4211 [--script replies.json]

It never starts a daemon or Lemonade and never downloads a model, so it can run
beside an installed GAIA without touching its ports or ``~/.gaia``.

``--script`` is a JSON list; each chat completion consumes the next entry:

* a string, or ``{"text": "..."}``: a text reply;
* ``{"tool_call": {"name": "...", "arguments": {...}}}``: a tool call, which
  lets a test drive a tool-approval prompt.

With no script every completion answers :data:`DEFAULT_REPLY`. When a script
runs out the fake LLM answers HTTP 500 instead of inventing a reply.
"""

from __future__ import annotations

import argparse
import json
import os
import signal
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

DEFAULT_REPLY = "Hello from the dev backend."
HOST = "127.0.0.1"
READY_TIMEOUT_SECONDS = 60.0
#: Exit code for a bad invocation, as ``gaia uninstall`` uses.
EX_USAGE = 64

# State variables GAIA reads, each placed under --home (mirrors the root
# conftest's _STATE_ENV, which does the same for the test suite).
_STATE_PATHS = {
    "GAIA_CONFIG_FILE": ("config", "config.json"),
    "GAIA_DAEMON_HOME": ("daemon-home",),
    "GAIA_MEMORY_DB": ("memory", "memory.db"),
    "GAIA_GATEWAY_FILE": ("gateway", "gateway.json"),
    "GAIA_POLICY_FILE": ("policy", "policy.json"),
    "GAIA_TUI_HOME": ("tui",),
    "GAIA_LOG_FILE": ("logs", "gaia.log"),
}
_STATE_DIRS = {"GAIA_DAEMON_HOME", "GAIA_TUI_HOME"}
# Inherited values that would point GAIA at a real server or credential.
_CLEARED_ENV = (
    "LEMONADE_API_KEY",
    "GAIA_LEMONADE_EMBEDDED",
    "GAIA_CONFIG_DIR",
    "GAIA_ALLOWED_PATHS",
)


class DevBackendError(Exception):
    """The invocation can't start a safe, isolated backend; the message says why."""


# ── Script ──────────────────────────────────────────────────────────────────


def load_script(path: Optional[str]) -> List[Dict[str, Any]]:
    """Parse ``--script`` into a list of ``{"text"}`` / ``{"tool_call"}`` entries."""
    if path is None:
        return [{"text": DEFAULT_REPLY}]
    try:
        raw = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        raise DevBackendError(f"Cannot read --script {path}: {e}") from e
    if not isinstance(raw, list) or not raw:
        raise DevBackendError(
            f"--script {path} must be a non-empty JSON list of replies, e.g. "
            '["hi", {"tool_call": {"name": "read_file", "arguments": {}}}].'
        )
    entries = []
    for i, item in enumerate(raw):
        if isinstance(item, str):
            item = {"text": item}
        if not isinstance(item, dict) or not (
            isinstance(item.get("text"), str)
            or (
                isinstance(item.get("tool_call"), dict)
                and isinstance(item["tool_call"].get("name"), str)
            )
        ):
            raise DevBackendError(
                f"--script {path} entry {i} must be a string, "
                '{"text": "..."} or {"tool_call": {"name": "...", "arguments": {}}}.'
            )
        entries.append(item)
    return entries


# ── Home ────────────────────────────────────────────────────────────────────


def validate_home(home: Optional[str]) -> Path:
    """The resolved ``--home``, refusing one that is missing or is/inside ``~/.gaia``."""
    from gaia.home import default_gaia_home

    if not home:
        raise DevBackendError(
            "--home is required: pass a dedicated directory for this backend's "
            "state, e.g. --home $(mktemp -d)."
        )
    resolved = Path(home).expanduser().resolve()
    real = default_gaia_home().resolve()
    if resolved == real or real in resolved.parents:
        raise DevBackendError(
            f"--home {resolved} is or is inside {real}, the installed GAIA's "
            "state. Pass a different directory."
        )
    return resolved


def isolate_environment(home: Path, llm_url: str) -> None:
    """Point every GAIA state variable at *home* and Lemonade at the fake LLM.

    Must run before anything imports ``gaia.config`` / ``gaia.logger``, which
    read these at import.
    """
    home.mkdir(parents=True, exist_ok=True)
    os.environ["GAIA_HOME"] = str(home)
    for name, parts in _STATE_PATHS.items():
        path = home.joinpath(*parts)
        (path if name in _STATE_DIRS else path.parent).mkdir(
            parents=True, exist_ok=True
        )
        os.environ[name] = str(path)
    for name in _CLEARED_ENV:
        os.environ.pop(name, None)
    os.environ["LEMONADE_BASE_URL"] = llm_url


# ── Fake LLM ────────────────────────────────────────────────────────────────


def build_fake_llm(script: List[Dict[str, Any]], model: str):
    """A FastAPI app speaking the slice of Lemonade's API a chat turn uses."""
    from fastapi import FastAPI
    from fastapi.responses import JSONResponse, StreamingResponse

    from gaia.llm.lemonade_client import GPU_CTX_SIZE
    from gaia.version import LEMONADE_VERSION

    app = FastAPI()
    lock = threading.Lock()
    state = {"next": 0}
    entry_for_default = len(script) == 1 and script[0].get("text") == DEFAULT_REPLY

    def take() -> Optional[Dict[str, Any]]:
        with lock:
            if entry_for_default:
                return script[0]
            if state["next"] >= len(script):
                return None
            entry = script[state["next"]]
            state["next"] += 1
            return entry

    loaded = {
        "type": "llm",
        "model_name": model,
        "recipe": "llamacpp",
        "recipe_options": {"ctx_size": GPU_CTX_SIZE},
    }

    @app.get("/api/v1/health")
    def health():
        return {
            "status": "ok",
            "version": LEMONADE_VERSION,
            "model_loaded": model,
            "all_models_loaded": [loaded],
        }

    @app.get("/api/v1/models")
    def models():
        return {
            "object": "list",
            "data": [
                {
                    "id": model,
                    "object": "model",
                    "downloaded": True,
                    "recipe": "llamacpp",
                    "labels": [],
                }
            ],
        }

    @app.get("/api/v1/stats")
    def stats():
        return {"input_tokens": 1, "output_tokens": 1, "time_to_first_token": 0.0}

    @app.post("/api/v1/load")
    def load():
        return {"status": "success"}

    @app.post("/api/v1/unload")
    def unload():
        return {"status": "success"}

    @app.post("/api/v1/chat/completions")
    async def chat_completions(body: Dict[str, Any]):
        entry = take()
        if entry is None:
            return JSONResponse(
                status_code=500,
                content={
                    "error": {
                        "message": (
                            f"dev_backend --script has only {len(script)} "
                            "replies and a chat completion asked for another. "
                            "Add entries to the script."
                        )
                    }
                },
            )
        message: Dict[str, Any] = {"role": "assistant", "content": ""}
        finish = "stop"
        if "tool_call" in entry:
            call = entry["tool_call"]
            message["tool_calls"] = [
                {
                    "index": 0,
                    "id": f"call_{uuid.uuid4().hex[:12]}",
                    "type": "function",
                    "function": {
                        "name": call["name"],
                        "arguments": json.dumps(call.get("arguments") or {}),
                    },
                }
            ]
            finish = "tool_calls"
        else:
            message["content"] = entry["text"]

        cid = f"chatcmpl-{uuid.uuid4().hex[:12]}"
        created = int(time.time())
        usage = {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2}

        if not body.get("stream"):
            return {
                "id": cid,
                "object": "chat.completion",
                "created": created,
                "model": model,
                "choices": [{"index": 0, "message": message, "finish_reason": finish}],
                "usage": usage,
            }

        def chunk(delta: Dict[str, Any], reason: Optional[str] = None) -> str:
            payload = {
                "id": cid,
                "object": "chat.completion.chunk",
                "created": created,
                "model": model,
                "choices": [{"index": 0, "delta": delta, "finish_reason": reason}],
            }
            return f"data: {json.dumps(payload)}\n\n"

        def events():
            yield chunk({"role": "assistant"})
            if message.get("tool_calls"):
                yield chunk({"tool_calls": message["tool_calls"]})
            else:
                yield chunk({"content": message["content"]})
            final = json.loads(chunk({}, finish)[len("data: ") :])
            final["usage"] = usage
            yield f"data: {json.dumps(final)}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(events(), media_type="text/event-stream")

    return app


# ── Flagship agent ──────────────────────────────────────────────────────────

_FLAGSHIP_ENTRY_POINT = "gaia_agent:build_gaia"


def _ensure_flagship_importable() -> None:
    """Make ``gaia_agent`` importable, from this checkout's hub package if need be."""
    import importlib.util

    if importlib.util.find_spec("gaia_agent") is not None:
        return
    package_dir = (
        Path(__file__).resolve().parents[3] / "hub" / "agents" / "gaia" / "python"
    )
    if not (package_dir / "gaia_agent").is_dir():
        raise DevBackendError(
            "The flagship agent package gaia_agent is not installed and no source "
            "checkout was found. Run `pip install -e hub/agents/gaia/python` from "
            "a GAIA checkout."
        )
    sys.path.insert(0, str(package_dir))


def _register_flagship_without_install() -> None:
    """Let registry discovery find the flagship when it has no installed entry point.

    A source checkout has the package but no dist-info, so chat would answer
    "assistant isn't installed".
    """
    import importlib.metadata

    from gaia.agents.registry import AgentRegistry

    original = AgentRegistry._discover_installed_agents

    def discover(self) -> None:
        original(self)
        if self.get("gaia") is not None:
            return
        entry_point = importlib.metadata.EntryPoint(
            name="gaia", value=_FLAGSHIP_ENTRY_POINT, group="gaia.agent"
        )
        self._register(self._load_entry_point_registration(entry_point))

    AgentRegistry._discover_installed_agents = discover


# ── Serving ─────────────────────────────────────────────────────────────────


class _Server:
    """A uvicorn server on a thread, stoppable without signals."""

    def __init__(self, app, port: int, name: str):
        import uvicorn

        config = uvicorn.Config(
            app,
            host=HOST,
            port=port,
            log_level="warning",
            access_log=False,
            # Never trust X-Forwarded-*: see gaia.ui.server.main().
            proxy_headers=False,
            forwarded_allow_ips="",
        )
        self.server = uvicorn.Server(config)
        self.thread = threading.Thread(target=self.server.run, name=name, daemon=True)

    def start(self) -> None:
        self.thread.start()

    def stop(self) -> None:
        self.server.should_exit = True
        self.thread.join(timeout=10)


def _wait_for(url: str, what: str, server: _Server, stop: threading.Event) -> None:
    deadline = time.monotonic() + READY_TIMEOUT_SECONDS
    while time.monotonic() < deadline:
        if stop.is_set():
            raise DevBackendError(f"Stopped while waiting for the {what}.")
        if not server.thread.is_alive():
            raise DevBackendError(
                f"The {what} server stopped while starting; its port is probably "
                "taken. Pick a free --port / --llm-port."
            )
        try:
            with urllib.request.urlopen(url, timeout=2) as resp:
                if resp.status == 200:
                    return
        except (urllib.error.URLError, OSError):
            pass
        time.sleep(0.2)
    raise DevBackendError(
        f"{what} did not answer at {url} within {READY_TIMEOUT_SECONDS:g}s."
    )


def run(
    port: int, home: Path, llm_port: Optional[int], script: List[Dict[str, Any]]
) -> int:
    llm_port = llm_port if llm_port is not None else port + 1
    if llm_port == port:
        raise DevBackendError("--llm-port must differ from --port.")
    llm_url = f"http://{HOST}:{llm_port}/api/v1"
    isolate_environment(home, llm_url)

    from gaia.config import UnsafeGaiaHomeError
    from gaia.llm.lemonade_client import DEFAULT_MODEL_NAME
    from gaia.logger import configure
    from gaia.ui.server import AllowedPathsEnvError, create_app

    configure()
    _ensure_flagship_importable()
    _register_flagship_without_install()
    stop = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    llm = _Server(build_fake_llm(script, DEFAULT_MODEL_NAME), llm_port, "fake-llm")
    llm.start()
    backend: Optional[_Server] = None
    try:
        _wait_for(f"{llm_url}/health", "fake LLM", llm, stop)
        try:
            app = create_app()
        except (UnsafeGaiaHomeError, AllowedPathsEnvError) as e:
            raise DevBackendError(str(e)) from e
        backend = _Server(app, port, "agent-ui")
        backend.start()
        # /api/health is the one /api route that needs no X-Gaia-UI header.
        _wait_for(f"http://{HOST}:{port}/api/health", "Agent UI backend", backend, stop)
        print(
            f"READY backend=http://{HOST}:{port} llm={llm_url} home={home}",
            flush=True,
        )
        while not stop.is_set() and backend.thread.is_alive():
            stop.wait(0.5)
    finally:
        if backend is not None:
            backend.stop()
        llm.stop()
    return 0


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python -m gaia.testing.dev_backend",
        description="Agent UI backend with a scripted fake LLM, isolated in --home.",
    )
    parser.add_argument("--port", type=int, required=True, help="Agent UI port")
    parser.add_argument(
        "--home", help="GAIA_HOME for this run (required; never ~/.gaia)"
    )
    parser.add_argument(
        "--llm-port", type=int, help="Fake LLM port (default: --port + 1)"
    )
    parser.add_argument("--script", help="JSON list of replies / tool calls")
    args = parser.parse_args(argv)
    try:
        home = validate_home(args.home)
        script = load_script(args.script)
        return run(args.port, home, args.llm_port, script)
    except DevBackendError as e:
        print(f"Error: {e}", file=sys.stderr)
        return EX_USAGE


if __name__ == "__main__":
    sys.exit(main())
