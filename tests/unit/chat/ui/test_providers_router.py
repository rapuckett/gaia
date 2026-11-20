# Copyright(C) 2025-2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT

"""AI provider and model selection for the Agent UI (``/api/providers``).

Lemonade is faked at the HTTP layer and every outgoing request is recorded, so
the tests assert the exact request shapes Lemonade must accept — the same ones
``tui/internal/lemonade/cloud.go`` sends — not merely that a call happened. The
OS credential store is never touched: ``gaia.llm.cloud_keys`` is mocked.
"""

import json
import logging
import re
import threading
import time
from pathlib import Path

import pytest
import requests
from fastapi import FastAPI
from fastapi.testclient import TestClient

from gaia import config as config_mod
from gaia.connectors import credential_wait
from gaia.connectors.errors import ConnectorsError
from gaia.llm import cloud_keys
from gaia.llm import custom_models as cm
from gaia.llm import gateway, lemonade_client, npu_linux
from gaia.llm.cloud_keys import CloudKeyError
from gaia.llm.gateway import (
    DEFAULT_AUTH_HEADER_NAME,
    DEFAULT_AUTH_HEADER_PREFIX,
    DEFAULT_GATEWAY_BASE_URL,
)
from gaia.llm.lemonade_client import DEFAULT_MODEL_NAME
from gaia.llm.recommended_models import RECOMMENDED_MODELS, rank
from gaia.ui.database import ChatDatabase
from gaia.ui.routers import providers

from ...test_custom_models import ARCH_SOURCE, SYSTEM_INFO
from ...test_custom_models import _repo as repo_payload
from ...test_npu_linux import MEMLOCK, linux_system_info

REPO_ROOT = Path(__file__).resolve().parents[4]
CLOUD_GO = REPO_ROOT / "tui" / "internal" / "lemonade" / "cloud.go"

BASE = "http://127.0.0.1:13305/api/v1"
KEY = "fw_SECRET_key_do_not_leak_123"


class _Resp:
    def __init__(self, status, body):
        self.status_code = status
        self._body = body
        self.content = b"" if body is None else json.dumps(body).encode()

    def json(self):
        return self._body


class FakeLemonade:
    """Lemonade's HTTP surface: records every request, answers from a table."""

    def __init__(self):
        self.calls = []
        self.cloud = {}  # provider -> system-info entry
        self.models = []
        self.answers = {}  # (method, path) -> (status, body) or exception
        self.down = False

    def request(self, method, url, json=None, headers=None, **kwargs):
        assert url.startswith(BASE + "/"), url
        path = url[len(BASE) + 1 :]
        self.calls.append({"method": method, "path": path, "json": json, **kwargs})
        if self.down:
            raise requests.ConnectionError("connection refused")
        answer = self.answers.get((method, path))
        if isinstance(answer, Exception):
            raise answer
        if callable(answer):
            answer = answer(json)
        if answer is not None:
            return _Resp(*answer)
        if (method, path) == ("GET", "system-info"):
            return _Resp(200, {"cloud": {"providers": list(self.cloud.values())}})
        if (method, path) == ("GET", "models?show_all=true"):
            return _Resp(200, {"data": self.models})
        if (method, path) == ("GET", "health"):
            return _Resp(200, {"all_models_loaded": []})
        if (method, path) == ("POST", "install"):
            self.cloud.setdefault(json["provider"], {"name": json["provider"]})
            for field in ("base_url", "auth_header_name", "auth_header_prefix"):
                self.cloud[json["provider"]][field] = json[field]
            return _Resp(200, {"status": "ok"})
        if (method, path) == ("POST", "cloud/auth"):
            entry = self.cloud.setdefault(json["provider"], {"name": json["provider"]})
            entry.update(runtime_key_set=True, models_discovered=True)
            return _Resp(200, {"models_discovered": True})
        if (method, path) == ("POST", "uninstall"):
            self.cloud.pop(json["provider"], None)
            return _Resp(200, {"status": "ok"})
        if method == "DELETE" and path.startswith("cloud/auth/"):
            return _Resp(200, {})
        raise AssertionError(f"unexpected Lemonade call {method} {path}")

    def paths(self, method=None):
        return [c["path"] for c in self.calls if method in (None, c["method"])]

    def call(self, method, path):
        matches = [c for c in self.calls if (c["method"], c["path"]) == (method, path)]
        assert matches, f"no {method} {path} in {self.paths()}"
        return matches[-1]


@pytest.fixture
def lemonade(monkeypatch):
    fake = FakeLemonade()
    monkeypatch.setattr(providers.requests, "request", fake.request)
    monkeypatch.setattr(providers, "_base_url", lambda: BASE)
    monkeypatch.setattr(
        lemonade_client, "resolve_lemonade_api_key", lambda *a, **k: None
    )
    return fake


@pytest.fixture
def keys(monkeypatch):
    """The OS credential store and the stored-key replay, faked."""
    state = {
        "stored": {},
        "bound": {},
        "remembered": [],
        "ensure": [],
        "ensure_result": True,
    }

    def remember_key(provider, key, base_url=None):
        if state.get("remember_error"):
            raise CloudKeyError(state["remember_error"])
        state["remembered"].append((provider, key))
        state["stored"][provider] = key
        if provider == "amd":
            assert base_url, "the gateway's key must be saved with its address"
            state["bound"][provider] = base_url

    def recall_key(provider):
        return state["stored"].get(provider)

    def recall_gateway_key():
        key = state["stored"].get("amd")
        return gateway.GatewayKey(key, state["bound"].get("amd")) if key else None

    def remember_token(token, base_url):
        state["stored"]["amd"] = token
        state["bound"]["amd"] = base_url

    def forget_key(provider):
        if state.get("forget_error"):
            raise state["forget_error"]
        return state["stored"].pop(provider, None) is not None

    def ensure_authenticated(provider, client=None, recall=None):
        state["ensure"].append(provider)
        if recall is not None:
            recall()  # as the real one reads the kept key
        if isinstance(state["ensure_result"], Exception):
            raise state["ensure_result"]
        return state["ensure_result"]

    monkeypatch.setattr(cloud_keys, "remember_key", remember_key)
    monkeypatch.setattr(cloud_keys, "recall_key", recall_key)
    monkeypatch.setattr(cloud_keys, "recall_gateway_key", recall_gateway_key)
    monkeypatch.setattr(gateway, "remember_token", remember_token)
    monkeypatch.setattr(cloud_keys, "forget_key", forget_key)
    monkeypatch.setattr(cloud_keys, "ensure_authenticated", ensure_authenticated)
    return state


@pytest.fixture(autouse=True)
def reach(monkeypatch):
    """The gateway reachability check, faked: reachable unless a test says not."""
    state = {"error": None, "asked": []}

    def check_reachable(base_url=None):
        state["asked"].append(base_url)
        if state["error"] is not None:
            raise state["error"]

    monkeypatch.setattr(providers, "check_gateway_reachable", check_reachable)
    monkeypatch.setattr("urllib.request.getproxies", lambda: {})
    return state


@pytest.fixture(autouse=True)
def _fresh_restore():
    providers.reset_restore_state()
    providers._STORED_KEY_SEEN.clear()
    providers._LAST_ERRORS.clear()
    yield
    providers.reset_restore_state()
    providers._STORED_KEY_SEEN.clear()
    providers._LAST_ERRORS.clear()


@pytest.fixture
def db():
    database = ChatDatabase(":memory:")
    yield database
    database.close()


@pytest.fixture
def client(db):
    app = FastAPI()
    app.include_router(providers.router)
    app.state.db = db
    return TestClient(app, client=("127.0.0.1", 50000), headers={"X-Gaia-UI": "1"})


def _config():
    return json.loads(config_mod.GAIA_CONFIG_FILE.read_text(encoding="utf-8"))


def _write_config(data):
    config_mod.GAIA_CONFIG_FILE.write_text(json.dumps(data), encoding="utf-8")


# ── GET /api/providers ─────────────────────────────────────────────────────


@pytest.mark.parametrize("path", ["/api/providers", "/api/providers/active"])
def test_side_effecting_reads_need_the_ui_header(client, monkeypatch, path):
    """A cross-site GET carries no X-Gaia-UI, so it must not push a key or restore."""
    called = []
    monkeypatch.setattr(providers, "_cloud_entry", lambda p: called.append(p))
    monkeypatch.setattr(providers, "restore_last_model", lambda db: called.append(db))
    resp = client.get(path, headers={"X-Gaia-UI": ""})
    assert resp.status_code == 403
    assert called == []


def test_list_when_lemonade_is_unreachable(client, lemonade, keys):
    lemonade.down = True
    body = client.get("/api/providers").json()
    assert "not reachable" in body["lemonade_error"]
    assert [p["id"] for p in body["providers"]] == ["local", "fireworks", "amd"]
    assert all(not p.get("registered") for p in body["providers"][1:])
    assert body["active"]["model"] == DEFAULT_MODEL_NAME
    assert body["active"]["is_default"] is True


def test_unreachable_lemonade_names_the_app_fix_not_a_command(
    client, lemonade, keys, monkeypatch
):
    from gaia.llm import lemonade_launcher
    from gaia.llm.surface_hints import APP_RESTART_HINT

    monkeypatch.setattr(lemonade_launcher, "gaia_runs_lemonade", lambda *a: True)
    lemonade.down = True
    error = client.get("/api/providers").json()["lemonade_error"]
    assert error.endswith(APP_RESTART_HINT)
    assert "gaia " not in error


def test_unreachable_user_run_lemonade_is_theirs_to_start_with_no_command(
    client, lemonade, keys, monkeypatch
):
    """A PC with no Lemonade of its own used to read "not installed. Run `gaia init`"."""
    from gaia.llm import lemonade_launcher
    from gaia.llm.surface_hints import APP_OTHER_SERVER_START_HINT

    hint = lemonade_launcher.StartHint(
        instruction="Lemonade Server is not installed. Run `gaia init` to install it."
    )
    monkeypatch.setattr(lemonade_launcher, "gaia_runs_lemonade", lambda *a: False)
    monkeypatch.setattr(lemonade_launcher, "describe_start_hint", lambda *a, **k: hint)
    lemonade.down = True
    error = client.get("/api/providers").json()["lemonade_error"]
    assert error.endswith(f"{APP_OTHER_SERVER_START_HINT}, then try again.")
    assert "not installed" not in error
    assert "`" not in error and "gaia init" not in error


def test_list_does_not_repeat_a_provider_when_a_later_lookup_fails(
    client, lemonade, keys, monkeypatch
):
    seen = []
    real = lemonade.request

    def flaky(method, url, **kwargs):
        seen.append(url)
        if len(seen) > 1:
            raise requests.ConnectionError("dropped")
        return real(method, url, **kwargs)

    monkeypatch.setattr(providers.requests, "request", flaky)
    body = client.get("/api/providers").json()
    assert body["lemonade_error"]
    assert [p["id"] for p in body["providers"]] == ["local", "fireworks", "amd"]


@pytest.mark.parametrize(
    "entry,stored,expected",
    [
        ({"env_var_set": True, "runtime_key_set": True}, None, "environment"),
        ({"runtime_key_set": True}, "k", "lemonade"),
        ({}, None, None),
    ],
)
def test_key_source(client, lemonade, keys, entry, stored, expected):
    lemonade.cloud["fireworks"] = {"name": "fireworks", **entry}
    if stored:
        keys["stored"]["fireworks"] = stored
    fw = client.get("/api/providers").json()["providers"][1]
    assert fw["id"] == "fireworks"
    assert fw["registered"] is True
    assert fw["key_source"] == expected
    assert fw["env_var"] == "LEMONADE_FIREWORKS_API_KEY"
    assert keys["ensure"] == []


def test_stored_key_is_handed_to_a_lemonade_that_lost_it(
    client, lemonade, keys, monkeypatch
):
    lemonade.cloud["fireworks"] = {"name": "fireworks"}
    keys["stored"]["fireworks"] = KEY

    def ensure(provider, client=None, recall=None):
        keys["ensure"].append(provider)
        lemonade.cloud[provider].update(runtime_key_set=True, models_discovered=True)
        return True

    monkeypatch.setattr(cloud_keys, "ensure_authenticated", ensure)
    resp = client.get("/api/providers")
    fw = resp.json()["providers"][1]
    assert keys["ensure"] == ["fireworks"]
    assert fw["key_source"] == "lemonade"
    assert fw["models_discovered"] is True
    assert KEY not in resp.text


def test_stored_key_replay_failure_is_reported_on_the_provider(client, lemonade, keys):
    lemonade.cloud["fireworks"] = {"name": "fireworks"}
    keys["stored"]["fireworks"] = KEY
    keys["ensure_result"] = CloudKeyError("Lemonade answered POST /cloud/auth with 500")
    fw = client.get("/api/providers").json()["providers"][1]
    assert fw["key_source"] == "stored"
    assert "500" in fw["error"]


# ── A key GAIA has, on a Lemonade with no Fireworks registered ─────────────

ENV_KEY = "fw_test_000_env_key_not_real"


@pytest.fixture(autouse=True)
def _no_fireworks_env(monkeypatch):
    """The developer's own FIREWORKS_API_KEY must not leak into these tests."""
    for name in ("FIREWORKS_API_KEY", "LEMONADE_FIREWORKS_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(providers, "_HANDED_ENV_KEYS", {})


@pytest.fixture
def replay(monkeypatch, lemonade, keys):
    """ensure_authenticated that hands over whatever key *recall* gives, as the real one does."""
    handed = []

    def ensure(provider, client=None, recall=None):
        keys["ensure"].append(provider)
        key = recall() if recall else None
        if key:
            handed.append(key)
            lemonade.cloud[provider].update(
                runtime_key_set=True, models_discovered=True
            )
        return bool(key)

    monkeypatch.setattr(cloud_keys, "ensure_authenticated", ensure)
    return handed


def test_env_key_with_no_provider_registered_is_connected_at_startup(
    client, lemonade, keys, replay, monkeypatch
):
    monkeypatch.setenv("FIREWORKS_API_KEY", ENV_KEY)
    resp = client.get("/api/providers")
    fw = resp.json()["providers"][1]
    install = lemonade.call("POST", "install")["json"]
    assert install["provider"] == "fireworks"
    assert install["base_url"] == "https://api.fireworks.ai/inference/v1"
    assert replay == [ENV_KEY]
    assert fw["models_discovered"] is True
    assert fw["key_source"] == "environment"
    assert fw["key_from_gaia_env"] is True
    assert fw["env_var"] == "FIREWORKS_API_KEY"
    assert fw["key_hint"] == ENV_KEY[-4:]
    assert ENV_KEY not in resp.text


def test_a_typed_key_gaia_could_not_keep_is_not_labelled_the_environments(
    client, lemonade, keys, replay, monkeypatch
):
    monkeypatch.setenv("FIREWORKS_API_KEY", ENV_KEY)
    assert client.get("/api/providers").json()["providers"][1]["key_source"] == (
        "environment"
    )
    keys["remember_error"] = "The OS credential store did not keep the key"
    resp = client.post("/api/providers/fireworks/connect", json={"api_key": KEY})
    assert resp.status_code == 200, resp.text
    fw = client.get("/api/providers").json()["providers"][1]
    assert fw["key_source"] == "lemonade"
    assert fw["key_from_gaia_env"] is False


def test_an_env_key_that_finds_no_models_can_be_replaced_by_a_typed_one(
    client, lemonade, keys, monkeypatch
):
    monkeypatch.setenv("FIREWORKS_API_KEY", ENV_KEY)
    monkeypatch.setitem(providers._HANDED_ENV_KEYS, "fireworks", ENV_KEY)
    lemonade.cloud["fireworks"] = {
        "name": "fireworks",
        "runtime_key_set": True,
        "models_discovered": False,
    }
    fw = client.get("/api/providers").json()["providers"][1]
    assert fw["key_source"] == "environment"
    assert fw["key_from_gaia_env"] is True
    resp = client.post("/api/providers/fireworks/connect", json={"api_key": KEY})
    assert resp.status_code == 200, resp.text
    fw = client.get("/api/providers").json()["providers"][1]
    assert fw["models_discovered"] is True
    assert fw["key_source"] == "lemonade"
    assert keys["stored"]["fireworks"] == KEY


def test_a_runtime_key_gaia_never_handed_is_not_labelled_the_environments(
    client, lemonade, keys, monkeypatch
):
    monkeypatch.setenv("FIREWORKS_API_KEY", ENV_KEY)
    lemonade.cloud["fireworks"] = {
        "name": "fireworks",
        "runtime_key_set": True,
        "models_discovered": True,
    }
    fw = client.get("/api/providers").json()["providers"][1]
    assert fw["key_source"] == "lemonade"


def test_lemonades_own_env_key_is_not_gaias_to_replace(client, lemonade, keys):
    lemonade.cloud["fireworks"] = {
        "name": "fireworks",
        "env_var_set": True,
        "models_discovered": True,
    }
    fw = client.get("/api/providers").json()["providers"][1]
    assert fw["key_source"] == "environment"
    assert fw["key_from_gaia_env"] is False


def test_env_key_hint_shows_before_lemonade_is_up(client, lemonade, keys, monkeypatch):
    monkeypatch.setenv("FIREWORKS_API_KEY", ENV_KEY)
    lemonade.down = True
    resp = client.get("/api/providers")
    fw = next(p for p in resp.json()["providers"] if p["id"] == "fireworks")
    assert fw["key_source"] == "environment"
    assert fw["key_hint"] == ENV_KEY[-4:]
    assert ENV_KEY not in resp.text


def test_no_env_hint_for_a_key_only_lemonade_holds(client, lemonade, keys, monkeypatch):
    monkeypatch.setenv("FIREWORKS_API_KEY", ENV_KEY)
    lemonade.cloud["fireworks"] = {"name": "fireworks", "env_var_set": True}
    assert _fireworks_view(client)["key_hint"] is None


def test_stored_key_with_no_provider_registered_is_connected_at_startup(
    client, lemonade, keys, replay
):
    keys["stored"]["fireworks"] = KEY
    resp = client.get("/api/providers")
    fw = resp.json()["providers"][1]
    assert lemonade.call("POST", "install")["json"]["provider"] == "fireworks"
    assert replay == [KEY]
    assert fw["models_discovered"] is True
    assert KEY not in resp.text


def test_a_saved_key_wins_over_a_process_environment_key(
    client, lemonade, keys, replay, monkeypatch
):
    monkeypatch.setenv("FIREWORKS_API_KEY", ENV_KEY)
    keys["stored"]["fireworks"] = KEY
    fw = client.get("/api/providers").json()["providers"][1]
    assert replay == [KEY]
    assert fw["key_source"] == "lemonade"
    assert fw["key_from_gaia_env"] is False


def test_a_stored_key_is_used_when_no_process_environment_key_exists(
    client, lemonade, keys, replay
):
    keys["stored"]["fireworks"] = KEY
    fw = client.get("/api/providers").json()["providers"][1]
    assert replay == [KEY]
    assert fw["key_source"] == "lemonade"


def test_no_key_anywhere_registers_nothing(client, lemonade, keys, replay):
    fw = client.get("/api/providers").json()["providers"][1]
    assert "install" not in lemonade.paths("POST")
    assert keys["ensure"] == []
    assert fw["key_source"] is None


def test_an_env_key_is_not_registered_on_a_remote_lemonade(
    client, lemonade, keys, replay, monkeypatch
):
    monkeypatch.setenv("FIREWORKS_API_KEY", ENV_KEY)
    monkeypatch.setattr(providers, "_base_url", lambda: "http://10.0.0.5:13305/api/v1")
    monkeypatch.setattr(providers, "_cloud_entry", lambda p: lemonade.cloud.get(p))
    fw = client.get("/api/providers").json()["providers"][1]
    assert lemonade.paths("POST") == [] and lemonade.paths("DELETE") == []
    assert replay == []
    assert "not on this PC" in fw["error"]


def test_an_env_key_is_not_registered_on_the_users_own_server(
    client, lemonade, keys, replay, monkeypatch
):
    from gaia.llm import lemonade_choice

    monkeypatch.setenv("FIREWORKS_API_KEY", ENV_KEY)
    monkeypatch.setattr(lemonade_choice, "is_users_server", lambda url: True)
    fw = client.get("/api/providers").json()["providers"][1]
    assert "install" not in lemonade.paths("POST")
    assert replay == []
    assert "does not change your server's setup" in fw["error"]


def test_a_key_that_finds_no_models_says_so(client, lemonade, keys, monkeypatch):
    monkeypatch.setenv("FIREWORKS_API_KEY", ENV_KEY)
    keys["ensure_result"] = False
    fw = client.get("/api/providers").json()["providers"][1]
    assert fw["models_discovered"] is False
    assert "FIREWORKS_API_KEY" in fw["error"]
    assert "no models" in fw["error"]
    assert ENV_KEY not in fw["error"]


def test_connect_blank_key_uses_the_env_key(
    client, lemonade, keys, replay, monkeypatch
):
    monkeypatch.setenv("FIREWORKS_API_KEY", ENV_KEY)
    lemonade.cloud["fireworks"] = {"name": "fireworks"}
    resp = client.post("/api/providers/fireworks/connect", json={})
    assert resp.status_code == 200, resp.text
    assert replay == [ENV_KEY]
    assert resp.json()["key_source"] == "environment"


# ── A keychain read the OS holds for permission (#5570) ────────────────────


@pytest.fixture
def keychain_prompt(monkeypatch, keys):
    """The Fireworks key read blocks, as macOS does while its access dialog is open."""
    state = {"answered": threading.Event(), "returned": threading.Event(), "reads": 0}

    def recall_key(provider):
        if provider != "fireworks":
            return keys["stored"].get(provider)
        state["reads"] += 1
        try:
            state["answered"].wait(timeout=30)
            return keys["stored"].get(provider)
        finally:
            state["returned"].set()

    monkeypatch.setattr(cloud_keys, "recall_key", recall_key)
    monkeypatch.setattr(credential_wait, "WAIT_SECONDS", 0.2)
    yield state
    state["answered"].set()
    _wait_for_reads_to_drain()
    credential_wait._in_flight.clear()  # a finished, unconsumed read


def _answered_with_the_dialog_open(prompt):
    """The response came back while the key read was still blocked on the dialog."""
    assert prompt["reads"] >= 1, "the key was never read"
    assert not prompt["returned"].is_set(), "the request waited on the keychain dialog"


def _wait_for_reads_to_drain():
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline and _credential_threads():
        time.sleep(0.01)


def _credential_threads():
    return [t for t in threading.enumerate() if t.name.startswith("credential-read:")]


def test_a_keychain_prompt_is_reported_as_waiting_not_as_no_key(
    client, lemonade, keys, keychain_prompt, caplog
):
    lemonade.cloud["fireworks"] = {"name": "fireworks"}
    keys["stored"]["fireworks"] = KEY

    with caplog.at_level(logging.WARNING):
        for _ in range(3):
            body = client.get("/api/providers").json()
            _answered_with_the_dialog_open(keychain_prompt)
            fw = body["providers"][1]
            assert fw["key_state"] == "waiting_for_os_permission"
            assert fw["key_store"] == "waiting"
            assert fw["key_source"] is None
            assert "Look for a system dialog" in fw["key_message"]
            assert body["providers"][2]["key_state"] == "read"
            assert body["providers"][2]["key_store"] is None
    # One read in flight however often the UI polls, and one warning for it.
    assert keychain_prompt["reads"] == 1
    assert len(_credential_threads()) == 1
    assert caplog.text.count("has not returned") == 1
    assert keys["ensure"] == []

    keychain_prompt["answered"].set()
    _wait_for_reads_to_drain()
    fw = client.get("/api/providers").json()["providers"][1]
    assert fw["key_state"] == "read"
    assert fw["key_message"] is None
    assert keys["ensure"] == ["fireworks"]
    assert credential_wait.in_flight_count() == 0


_REAL_RECALL_KEY = cloud_keys.recall_key


@pytest.fixture
def dismissed_keyring(monkeypatch):
    """The real store over a keyring whose unlock prompt the user cancels."""
    from gaia.connectors import store

    state = {"reads": 0}

    def get_password(service, username):
        state["reads"] += 1
        raise store.keyring.errors.InitError(
            "Failed to create the collection: Prompt dismissed.."
        )

    monkeypatch.setattr(store.keyring, "get_password", get_password)
    monkeypatch.setattr(store, "verify_keyring_backend", lambda: None)
    store.retry_keyring()
    yield state
    store.retry_keyring()
    credential_wait._in_flight.clear()


def test_a_dismissed_keyring_prompt_is_not_reopened_by_polling(
    client, lemonade, dismissed_keyring
):
    """#7227: Cancel brought the prompt straight back, about once a second."""
    lemonade.cloud["fireworks"] = {"name": "fireworks"}
    for _ in range(10):
        body = client.get("/api/providers")
        assert body.status_code == 200, body.text
    asked = dismissed_keyring["reads"]
    assert asked == 1
    for view in body.json()["providers"][1:]:
        assert view["key_state"] == "store_locked"
        assert view["key_store"] == "locked"
        assert view["key_source"] is None
        assert "won't ask again for 5 minutes" in view["key_message"]
    # The summary never reads the store, but says it is held, in both fields.
    for summary in client.get("/api/providers/list").json()["providers"][1:]:
        assert summary["key_state"] == "store_locked"
        assert summary["key_store"] == "locked"
    assert dismissed_keyring["reads"] == asked

    assert client.post("/api/providers/key-store/retry").json() == {"retrying": True}
    client.get("/api/providers")
    assert dismissed_keyring["reads"] == asked + 1


def test_connecting_with_a_locked_store_is_not_answered_as_a_wait(
    client, lemonade, keys, dismissed_keyring, monkeypatch
):
    """A 409 makes the screen ask again every two seconds, reopening the prompt."""
    monkeypatch.setattr(cloud_keys, "recall_key", _REAL_RECALL_KEY)
    lemonade.cloud["fireworks"] = {"name": "fireworks"}
    client.get("/api/providers")
    resp = client.post("/api/providers/fireworks/connect", json={})
    assert resp.status_code == 423, resp.text
    assert resp.json()["detail"]["code"] == "key_store_locked"
    assert "won't ask again for 5 minutes" in resp.json()["detail"]["message"]
    # Connect is the user's action: it asked the store once more.
    assert dismissed_keyring["reads"] == 2


def _raises(error):
    def raise_it(*args, **kwargs):
        raise error

    return raise_it


@pytest.mark.parametrize(
    "error, status, code",
    [
        (
            credential_wait.CredentialStoreWaiting("Look for a system dialog."),
            409,
            "key_store_waiting",
        ),
        (
            credential_wait.CredentialStoreLocked("The key store is locked."),
            423,
            "key_store_locked",
        ),
    ],
    ids=["waiting", "locked"],
)
@pytest.mark.parametrize("route", ["connect", "select", "gateway_move"])
def test_a_key_store_wait_or_lock_answers_with_its_code_and_the_same_message(
    client, lemonade, keys, monkeypatch, route, error, status, code
):
    if route == "connect":
        lemonade.cloud["fireworks"] = {"name": "fireworks", "models_discovered": True}
        monkeypatch.setattr(cloud_keys, "ensure_authenticated", _raises(error))
        resp = client.post("/api/providers/fireworks/connect", json={})
    elif route == "select":
        monkeypatch.setattr(providers, "_check_model_available", _raises(error))
        resp = client.post(
            "/api/providers/select",
            json={"model": "fireworks.accounts/fireworks/models/glm-5p3-flash"},
        )
    else:
        lemonade.cloud["amd"] = dict(_CUSTOM_GATEWAY)
        monkeypatch.setattr(providers, "_bounded_gateway_key", _raises(error))
        resp = client.post(
            "/api/providers/amd/connect", json={"base_url": "https://gw2.example/v1"}
        )
    assert resp.status_code == status, resp.text
    assert resp.json()["detail"] == {"code": code, "message": str(error)}


def test_other_409s_keep_a_plain_detail(client, lemonade, keys, monkeypatch):
    lemonade.cloud["fireworks"] = {"name": "fireworks", "models_discovered": True}
    monkeypatch.setattr(
        cloud_keys,
        "ensure_authenticated",
        _raises(providers.ProviderError("Lemonade is busy.", 409)),
    )
    resp = client.post("/api/providers/fireworks/connect", json={})
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == "Lemonade is busy."


def test_restore_waits_for_a_keychain_prompt_then_restores(
    client, lemonade, keys, db, keychain_prompt
):
    model = "fireworks.accounts/fireworks/models/glm-5p3-flash"
    _write_config({"last_model": model})
    lemonade.models = _cloud_models()
    keys["stored"]["fireworks"] = KEY

    body = client.get("/api/providers/active").json()
    _answered_with_the_dialog_open(keychain_prompt)
    assert body["restore"] == {"status": "pending", "message": None}
    assert db.get_setting("custom_model") is None

    keychain_prompt["answered"].set()
    _wait_for_reads_to_drain()
    again = client.get("/api/providers/active").json()
    assert again["restore"]["status"] == "restored"
    assert db.get_setting("custom_model") == model


def test_select_while_a_keychain_prompt_is_open_says_so(
    client, lemonade, keys, db, keychain_prompt
):
    model = "fireworks.accounts/fireworks/models/glm-5p3-flash"
    lemonade.models = _cloud_models()
    keys["stored"]["fireworks"] = KEY

    resp = client.post("/api/providers/select", json={"model": model})
    _answered_with_the_dialog_open(keychain_prompt)
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"]["code"] == "key_store_waiting"
    assert "Look for a system dialog" in resp.json()["detail"]["message"]
    assert db.get_setting("custom_model") is None

    keychain_prompt["answered"].set()
    _wait_for_reads_to_drain()
    resp = client.post("/api/providers/select", json={"model": model})
    assert resp.status_code == 200, resp.text
    assert db.get_setting("custom_model") == model


def test_a_saved_key_is_read_afresh_after_connect_or_forget():
    """A read nobody collected is not served once the user changes the key."""
    credential_wait._in_flight.clear()
    assert (
        credential_wait.read_within("cloud-key:fireworks", lambda: "old", "k") == "old"
    )
    stale = credential_wait.Future()
    stale.set_result("old")
    credential_wait._in_flight["cloud-key:fireworks"] = stale

    credential_wait.discard("cloud-key:fireworks")

    assert (
        credential_wait.read_within("cloud-key:fireworks", lambda: "new", "k") == "new"
    )


# ── GET /api/providers/active ──────────────────────────────────────────────


def _cloud_models():
    return [
        {
            "id": "fireworks.accounts/fireworks/models/glm-5p3-flash",
            "recipe": "cloud",
            "labels": [],
        },
        {"id": "fireworks.some-other-model", "recipe": "cloud", "labels": []},
    ]


def test_active_with_nothing_saved(client, lemonade, keys, db):
    body = client.get("/api/providers/active").json()
    assert body["restore"] == {"status": "none", "message": None}
    assert body["model"] == DEFAULT_MODEL_NAME
    assert db.get_setting("custom_model") is None
    # Only a read, to say whether the default is downloaded.
    assert [(c["method"], c["path"]) for c in lemonade.calls] == [
        ("GET", "models?show_all=true")
    ]
    assert body["downloaded"] is False


def test_active_names_a_cloud_model_only_lemonade_lists_as_cloud(
    client, lemonade, keys, db, monkeypatch
):
    """#7216: the chip warned this cloud model "isn't downloaded yet"."""
    model = "opencode.big-model"
    entry = {"id": model, "recipe": "cloud", "cloud_provider": "opencode"}
    monkeypatch.setattr(lemonade_client, "_CLOUD_MODELS", lemonade_client._CLOUD_MODELS)
    monkeypatch.setattr(
        lemonade_client, "_CLOUD_PROVIDERS", lemonade_client._CLOUD_PROVIDERS
    )
    lemonade_client.record_cloud_models({"data": [entry]})
    lemonade.models = [entry]
    db.set_setting("custom_model", model)

    body = client.get("/api/providers/active").json()

    assert body["model"] == model
    assert body["remote"] is True
    assert body["inference_remote"] is True
    assert body["downloaded"] is None
    assert body["provider_name"] == "opencode"
    assert body["label"] == "big-model · opencode"
    assert body["display_name"] == "big-model"


def test_active_names_hybrid_as_a_cloud_model(client, lemonade, keys, db):
    db.set_setting("custom_model", "hybrid")

    body = client.get("/api/providers/active").json()

    assert body["model"] == "hybrid"
    assert body["remote"] is True
    assert body["inference_remote"] is True
    assert body["downloaded"] is None
    assert body["provider_name"] == "AMD LLM Gateway"
    assert body["display_name"] == "Hybrid"
    assert body["label"] == "Hybrid · AMD LLM Gateway"


def test_active_reports_unusable_hybrid_settings(
    client, lemonade, keys, db, monkeypatch
):
    from gaia.llm import hybrid

    def broken(*_a, **_k):
        raise hybrid.HybridConfigError("hybrid_cheap_model must name a model")

    monkeypatch.setattr(hybrid.HybridSettings, "load", classmethod(broken))
    db.set_setting("custom_model", "hybrid")

    body = client.get("/api/providers/active").json()

    assert body["model"] is None
    assert "hybrid_cheap_model" in body["config_error"]


def test_active_reads_the_catalog_to_name_a_cloud_model_on_a_cold_start(
    client, lemonade, keys, db, monkeypatch
):
    """Right after a restart nothing has read Lemonade's list yet."""
    model = "opencode.big-model"
    monkeypatch.setattr(lemonade_client, "_CLOUD_MODELS", {})
    monkeypatch.setattr(lemonade_client, "_CLOUD_PROVIDERS", {})
    lemonade.models = [{"id": model, "recipe": "cloud", "cloud_provider": "opencode"}]
    db.set_setting("custom_model", model)

    body = client.get("/api/providers/active").json()

    assert body["remote"] is True
    assert body["downloaded"] is None
    assert body["provider_name"] == "opencode"


def test_active_makes_no_claim_when_the_catalog_is_unreadable(
    client, lemonade, keys, db, monkeypatch
):
    monkeypatch.setattr(lemonade_client, "_CLOUD_MODELS", {})
    monkeypatch.setattr(lemonade_client, "_CLOUD_PROVIDERS", {})
    lemonade.down = True
    db.set_setting("custom_model", "opencode.big-model")

    body = client.get("/api/providers/active").json()

    assert body["downloaded"] is None


def test_active_names_the_provider_of_a_known_cloud_model(client, lemonade, keys, db):
    db.set_setting("custom_model", "amd.DeepSeek-V4.1-Flash")
    body = client.get("/api/providers/active").json()
    assert body["remote"] is True
    assert body["provider_name"] == "AMD LLM Gateway"
    db.set_setting("custom_model", None)
    assert client.get("/api/providers/active").json()["provider_name"] is None


def test_active_restores_the_last_model_once_per_run(client, lemonade, keys, db):
    model = "fireworks.accounts/fireworks/models/glm-5p3-flash"
    _write_config({"last_model": model})
    lemonade.models = _cloud_models()
    body = client.get("/api/providers/active").json()
    assert body["restore"]["status"] == "restored"
    assert body["model"] == model
    assert body["provider"] == "fireworks"
    assert body["remote"] is True
    assert body["label"] == "glm-5p3-flash · Fireworks AI"
    assert db.get_setting("custom_model") == model

    _write_config({"last_model": "something-else"})
    calls = len(lemonade.calls)
    again = client.get("/api/providers/active").json()
    assert again["restore"]["status"] == "restored"
    assert len(lemonade.calls) == calls


def test_a_model_picked_elsewhere_is_restored_as_the_pick(client, lemonade, keys, db):
    """Not as a Custom model ID, which Settings would then show in that field."""
    from gaia.ui.routers.providers import PICKED_MODEL_SETTING, custom_model_override

    model = "fireworks.accounts/fireworks/models/glm-5p3-flash"
    db.set_setting(PICKED_MODEL_SETTING, "Qwen3-4B-GGUF")
    db.set_setting("custom_model", "Qwen3-4B-GGUF")
    _write_config({"last_model": model})
    lemonade.models = _cloud_models()

    assert client.get("/api/providers/active").json()["model"] == model
    assert db.get_setting(PICKED_MODEL_SETTING) == model
    assert custom_model_override(db) is None


def test_a_restore_keeps_a_custom_model_id_in_force_as_one(client, lemonade, keys, db):
    from gaia.ui.routers.providers import PICKED_MODEL_SETTING

    model = "fireworks.accounts/fireworks/models/glm-5p3-flash"
    db.set_setting(PICKED_MODEL_SETTING, "Qwen3-4B-GGUF")
    db.set_setting("custom_model", "Phi-4-mini-instruct-GGUF")
    _write_config({"last_model": model})
    lemonade.models = _cloud_models()

    client.get("/api/providers/active")
    assert db.get_setting(PICKED_MODEL_SETTING) == "Qwen3-4B-GGUF"


def test_active_never_switches_model_when_the_saved_one_cannot_run(
    client, lemonade, keys, db
):
    db.set_setting("custom_model", "Qwen3-4B-GGUF")
    _write_config({"last_model": "fireworks.gone-model"})
    lemonade.models = _cloud_models()
    body = client.get("/api/providers/active").json()
    assert body["restore"]["status"] == "failed"
    assert "no longer listed" in body["restore"]["message"]
    assert "Pick a model" in body["restore"]["message"]
    assert db.get_setting("custom_model") == "Qwen3-4B-GGUF"
    assert body["model"] == "Qwen3-4B-GGUF"


def test_active_restore_fails_without_a_working_key(client, lemonade, keys, db):
    _write_config({"last_model": "fireworks.glm-5p3-flash"})
    keys["ensure_result"] = False
    body = client.get("/api/providers/active").json()
    assert body["restore"]["status"] == "failed"
    assert "Fireworks AI has no working key" in body["restore"]["message"]
    assert db.get_setting("custom_model") is None


def test_restore_connects_fireworks_from_an_env_key_on_a_fresh_lemonade(
    client, lemonade, keys, replay, db, monkeypatch
):
    model = "fireworks.accounts/fireworks/models/glm-5p3-flash"
    monkeypatch.setenv("FIREWORKS_API_KEY", ENV_KEY)
    _write_config({"last_model": model})
    lemonade.models = _cloud_models()
    resp = client.get("/api/providers/active")
    body = resp.json()
    assert body["restore"]["status"] == "restored", body["restore"]
    assert lemonade.call("POST", "install")["json"]["provider"] == "fireworks"
    assert replay == [ENV_KEY]
    assert db.get_setting("custom_model") == model
    assert ENV_KEY not in resp.text


def test_a_failed_cloud_restore_is_checked_again_and_clears(client, lemonade, keys, db):
    model = "fireworks.accounts/fireworks/models/glm-5p3-flash"
    _write_config({"last_model": model})
    lemonade.models = _cloud_models()
    keys["ensure_result"] = False
    failed = client.get("/api/providers/active").json()["restore"]
    assert failed["status"] == "failed"
    assert failed["retry"] is True

    keys["ensure_result"] = True
    again = client.get("/api/providers/active").json()
    assert again["restore"]["status"] == "restored", again["restore"]
    assert again["model"] == model


def test_restore_waits_while_lemonade_is_still_listing_the_key_s_models(
    client, lemonade, keys, db, monkeypatch
):
    """Lemonade holds a key for about half a second before it has listed the models."""
    model = "fireworks.accounts/fireworks/models/glm-5p3-flash"
    _write_config({"last_model": model})
    lemonade.models = _cloud_models()
    lemonade.cloud["fireworks"] = {"name": "fireworks", "runtime_key_set": True}
    keys["ensure_result"] = False
    clock = {"now": 100.0}
    monkeypatch.setattr(providers.time, "monotonic", lambda: clock["now"])

    first = client.get("/api/providers/active").json()
    assert first["restore"] == {"status": "pending", "message": None}

    lemonade.cloud["fireworks"]["models_discovered"] = True
    keys["ensure_result"] = True
    second = client.get("/api/providers/active").json()
    assert second["restore"]["status"] == "restored", second["restore"]


def test_restore_stops_waiting_for_a_key_that_never_lists_models(
    client, lemonade, keys, db, monkeypatch
):
    _write_config({"last_model": "fireworks.glm-5p3-flash"})
    lemonade.cloud["fireworks"] = {"name": "fireworks", "runtime_key_set": True}
    keys["ensure_result"] = False
    clock = {"now": 100.0}
    monkeypatch.setattr(providers.time, "monotonic", lambda: clock["now"])
    assert client.get("/api/providers/active").json()["restore"]["status"] == "pending"

    clock["now"] += providers.KEY_SETTLE_SECONDS + 1
    late = client.get("/api/providers/active").json()["restore"]
    assert late["status"] == "failed"
    assert "Fireworks AI has no working key" in late["message"]


def test_a_key_whose_models_are_listed_fails_at_once(client, lemonade, keys, db):
    _write_config({"last_model": "fireworks.glm-5p3-flash"})
    lemonade.cloud["fireworks"] = {
        "name": "fireworks",
        "runtime_key_set": True,
        "models_discovered": True,
    }
    keys["ensure_result"] = False
    late = client.get("/api/providers/active").json()["restore"]
    assert late["status"] == "failed"
    assert "Fireworks AI has no working key" in late["message"]


def test_the_settle_window_ends_exactly_at_its_limit(
    client, lemonade, keys, db, monkeypatch
):
    _write_config({"last_model": "fireworks.glm-5p3-flash"})
    lemonade.cloud["fireworks"] = {"name": "fireworks", "runtime_key_set": True}
    keys["ensure_result"] = False
    clock = {"now": 100.0}
    monkeypatch.setattr(providers.time, "monotonic", lambda: clock["now"])
    assert client.get("/api/providers/active").json()["restore"]["status"] == "pending"
    clock["now"] += providers.KEY_SETTLE_SECONDS
    assert client.get("/api/providers/active").json()["restore"]["status"] == "failed"


def test_picking_a_model_while_its_key_settles_says_to_try_again(
    client, lemonade, keys, db, monkeypatch
):
    lemonade.models = _cloud_models()
    lemonade.cloud["fireworks"] = {"name": "fireworks", "runtime_key_set": True}
    keys["ensure_result"] = False
    monkeypatch.setattr(providers.time, "monotonic", lambda: 100.0)
    resp = client.post(
        "/api/providers/select",
        json={"model": "fireworks.accounts/fireworks/models/glm-5p3-flash"},
    )
    assert resp.status_code == 503, resp.text
    assert "try again" in resp.json()["detail"]
    assert db.get_setting("custom_model") is None


def test_connecting_a_new_key_restarts_the_settle_window(
    client, lemonade, keys, db, monkeypatch
):
    providers._key_settle_started["fireworks"] = 0.0
    client.post("/api/providers/fireworks/connect", json={"api_key": KEY})
    assert "fireworks" not in providers._key_settle_started


def test_a_failed_local_restore_is_not_checked_again(client, lemonade, keys, db):
    _write_config({"last_model": "Llama-3-8B-GGUF"})
    lemonade.models = _CATALOG
    failed = client.get("/api/providers/active").json()["restore"]
    assert failed["status"] == "failed"
    assert not failed.get("retry")
    calls = len(lemonade.calls)
    client.get("/api/providers/active")
    assert not [c for c in lemonade.calls[calls:] if c["path"] == "health"]


def test_active_restore_fails_for_a_local_model_not_downloaded(
    client, lemonade, keys, db
):
    _write_config({"last_model": DEFAULT_MODEL_NAME})
    lemonade.models = [{"id": DEFAULT_MODEL_NAME, "downloaded": False, "labels": []}]
    body = client.get("/api/providers/active").json()
    assert body["restore"]["status"] == "failed"
    assert "not downloaded" in body["restore"]["message"]


# Lemonade lists a registered ``user.X`` model as ``X`` (seen on v2026.40.0).
_CUSTOM = "user.ggml-gpt-oss-20b-MXFP4-GGUF"
_CUSTOM_LISTED = {
    "id": "ggml-gpt-oss-20b-MXFP4-GGUF",
    "recipe": "llamacpp",
    "downloaded": True,
    "labels": [],
}


def test_active_custom_model_is_downloaded_under_its_listed_name(
    client, lemonade, keys, db
):
    """The chip showed a download icon for gpt-oss 20B that was on disk."""
    _write_config({"default_model": _CUSTOM})
    lemonade.models = [_CUSTOM_LISTED]
    body = client.get("/api/providers/active").json()
    assert body["model"] == _CUSTOM
    assert body["downloaded"] is True


def test_selecting_a_downloaded_custom_model_by_its_user_name_works(
    client, lemonade, keys, db
):
    lemonade.models = [_CUSTOM_LISTED]
    resp = client.post("/api/providers/select", json={"model": _CUSTOM})
    assert resp.status_code == 200, resp.json()
    assert db.get_setting("custom_model") == _CUSTOM


def test_restoring_a_downloaded_custom_model_works(client, lemonade, keys, db):
    _write_config({"last_model": _CUSTOM})
    lemonade.models = [_CUSTOM_LISTED]
    body = client.get("/api/providers/active").json()
    assert body["restore"]["status"] == "restored", body["restore"]
    assert body["model"] == _CUSTOM


def test_active_restore_reports_a_corrupt_config(client, lemonade, keys, db):
    config_mod.GAIA_CONFIG_FILE.write_text("{not json", encoding="utf-8")
    body = client.get("/api/providers/active").json()
    assert body["restore"]["status"] == "failed"
    assert db.get_setting("custom_model") is None


# ── POST /api/providers/{p}/connect ────────────────────────────────────────


def test_connect_fireworks_sends_the_tui_request_shapes(client, lemonade, keys):
    resp = client.post("/api/providers/fireworks/connect", json={"api_key": KEY})
    assert resp.status_code == 200, resp.text
    assert lemonade.call("POST", "install")["json"] == {
        "backend": "cloud",
        "provider": "fireworks",
        "wire_format": "openai",
        "base_url": "https://api.fireworks.ai/inference/v1",
        "auth_header_name": "Authorization",
        "auth_header_prefix": "Bearer ",
    }
    assert lemonade.call("POST", "cloud/auth")["json"] == {
        "provider": "fireworks",
        "api_key": KEY,
    }
    assert lemonade.paths() == ["system-info", "install", "cloud/auth", "system-info"]
    assert all(c["allow_redirects"] is False for c in lemonade.calls)
    body = resp.json()
    assert body["remembered"] is True and body["remember_error"] is None
    assert body["models_discovered"] is True
    assert keys["remembered"] == [("fireworks", KEY)]
    assert KEY not in resp.text


def test_connect_amd_uses_the_gateway_defaults(client, lemonade, keys):
    resp = client.post("/api/providers/amd/connect", json={"api_key": KEY})
    assert resp.status_code == 200, resp.text
    assert lemonade.call("POST", "install")["json"] == {
        "backend": "cloud",
        "provider": "amd",
        "wire_format": "openai",
        "base_url": DEFAULT_GATEWAY_BASE_URL,
        "auth_header_name": DEFAULT_AUTH_HEADER_NAME,
        "auth_header_prefix": DEFAULT_AUTH_HEADER_PREFIX,
    }


def test_connect_amd_takes_a_custom_gateway(client, lemonade, keys):
    client.post(
        "/api/providers/amd/connect",
        json={
            "api_key": KEY,
            "base_url": "  https://gw.example/v1  ",
            "auth_header_name": " X-Key ",
            "auth_header_prefix": "",
        },
    )
    payload = lemonade.call("POST", "install")["json"]
    assert payload["base_url"] == "https://gw.example/v1"
    assert payload["auth_header_name"] == "X-Key"
    assert payload["auth_header_prefix"] == ""


def test_connect_ignores_gateway_fields_for_fireworks(client, lemonade, keys):
    client.post(
        "/api/providers/fireworks/connect",
        json={"api_key": KEY, "base_url": "https://evil.example"},
    )
    assert (
        lemonade.call("POST", "install")["json"]["base_url"]
        == "https://api.fireworks.ai/inference/v1"
    )


_CUSTOM_GATEWAY = {
    "name": "amd",
    "base_url": "https://gw.example/v1",
    "auth_header_name": "X-Key",
    "auth_header_prefix": "Token ",
    "runtime_key_set": True,
    "models_discovered": True,
}


def test_a_keyless_reconnect_keeps_a_custom_gateway(client, lemonade, keys):
    lemonade.cloud["amd"] = dict(_CUSTOM_GATEWAY)
    resp = client.post("/api/providers/amd/connect", json={})
    assert resp.status_code == 200, resp.text
    payload = lemonade.call("POST", "install")["json"]
    assert payload["base_url"] == "https://gw.example/v1"
    assert payload["auth_header_name"] == "X-Key"
    assert payload["auth_header_prefix"] == "Token "


@pytest.mark.parametrize(
    "fields",
    [
        {"base_url": "https://attacker.example/v1"},
        {"auth_header_name": "X-Leak"},
        {"base_url": "https://attacker.example/v1", "auth_header_name": "X-Leak"},
        {"auth_header_prefix": ""},
    ],
)
@pytest.mark.parametrize(
    "away", [{"X-Forwarded-For": "203.0.113.9"}, {"X-Forwarded-Proto": "https"}]
)
def test_only_the_pc_may_move_where_the_saved_key_goes(
    client, lemonade, keys, fields, away
):
    lemonade.cloud["amd"] = dict(_CUSTOM_GATEWAY)
    resp = client.post("/api/providers/amd/connect", json=fields, headers=away)
    assert resp.status_code == 403
    assert "on the PC running GAIA" in resp.json()["detail"]
    assert lemonade.paths("POST") == [] and lemonade.paths("DELETE") == []
    assert lemonade.cloud["amd"] == _CUSTOM_GATEWAY
    assert keys["ensure"] == []


def test_the_pc_may_move_a_saved_key_to_another_gateway(client, lemonade, keys):
    lemonade.cloud["amd"] = dict(_CUSTOM_GATEWAY)
    resp = client.post(
        "/api/providers/amd/connect",
        json={"base_url": "https://gw2.example/v1", "auth_header_name": "X-Other"},
    )
    assert resp.status_code == 200, resp.text
    assert lemonade.cloud["amd"]["base_url"] == "https://gw2.example/v1"
    assert lemonade.cloud["amd"]["auth_header_name"] == "X-Other"
    assert lemonade.cloud["amd"]["auth_header_prefix"] == "Token "


def test_provider_summaries_read_only_and_carry_no_secret(client, lemonade, keys):
    lemonade.cloud["amd"] = dict(_CUSTOM_GATEWAY)
    keys["stored"]["fireworks"] = KEY
    resp = client.get("/api/providers/list", headers={"X-Forwarded-For": "203.0.113.9"})
    assert resp.status_code == 200, resp.text
    assert resp.json() == {
        "providers": [
            {
                "id": "local",
                "name": "Local",
                "remote": False,
                "privacy_notice": providers._PRIVACY["local"],
                "configured": True,
                "blocked": False,
                "network": None,
                "key_source": None,
                "key_state": None,
                "key_store": None,
                "key_hint": None,
                "known_models": None,
                "error": None,
                "env_var": None,
                "key_from_gaia_env": None,
            },
            {
                "id": "fireworks",
                "name": "Fireworks AI",
                "remote": True,
                "privacy_notice": providers._PRIVACY["fireworks"],
                "configured": False,
                "blocked": False,
                "network": None,
                "key_source": None,
                "key_state": "unknown",
                "key_store": None,
                "key_hint": None,
                "known_models": False,
                "error": None,
                "env_var": None,
                "key_from_gaia_env": False,
            },
            {
                "id": "amd",
                "name": "AMD LLM Gateway",
                "remote": True,
                "privacy_notice": providers._PRIVACY["amd"],
                "configured": True,
                "blocked": False,
                # Only the PC learns whether the gateway answers.
                "network": {"reachable": None},
                # Lemonade holds a key the user entered; the hint needs a store read.
                "key_source": "lemonade",
                "key_state": "read",
                "key_store": None,
                "key_hint": None,
                "known_models": False,
                "error": None,
                "env_var": None,
                "key_from_gaia_env": False,
            },
        ],
        "lemonade_error": None,
    }
    assert lemonade.paths() == ["system-info", "system-info"]
    assert keys["ensure"] == []
    assert KEY not in resp.text and "gw.example" not in resp.text


def test_provider_summaries_say_an_unreachable_gateway_without_its_address(
    client, lemonade, keys, reach
):
    lemonade.cloud["amd"] = dict(_CUSTOM_GATEWAY)
    reach["error"] = _offline()
    resp = client.get("/api/providers/list")
    assert resp.status_code == 200, resp.text
    by_id = {p["id"]: p for p in resp.json()["providers"]}
    assert by_id["amd"]["network"] == {"reachable": False}
    assert by_id["local"]["network"] is None
    assert by_id["fireworks"]["network"] is None
    assert "llm-api.amd.com" not in resp.text and "gw.example" not in resp.text


@pytest.mark.parametrize("route", ["/api/providers/list", "/api/providers"])
def test_only_the_pc_learns_whether_the_gateway_answers(
    client, lemonade, keys, reach, route
):
    """A host rebound to a LAN address would turn the answer into a port scan."""
    lemonade.cloud["amd"] = dict(_CUSTOM_GATEWAY)
    reach["error"] = _offline()
    resp = client.get(route, headers={"X-Forwarded-For": "203.0.113.9"})
    assert resp.status_code == 200, resp.text
    amd = {p["id"]: p for p in resp.json()["providers"]}["amd"]
    assert amd["network"]["reachable"] is None
    assert amd["network"].get("detail") is None
    assert reach["asked"] == []


def test_connect_reports_a_key_the_store_did_not_keep(client, lemonade, keys):
    keys["remember_error"] = "The OS credential store did not keep the key"
    resp = client.post("/api/providers/fireworks/connect", json={"api_key": KEY})
    assert resp.status_code == 200
    body = resp.json()
    assert body["remembered"] is False
    assert "did not keep" in body["remember_error"]


def _fireworks_view(client):
    providers_list = client.get("/api/providers").json()["providers"]
    return next(p for p in providers_list if p["id"] == "fireworks")


def test_the_view_shows_only_the_end_of_a_saved_key(client, lemonade, keys):
    keys["stored"]["fireworks"] = KEY
    lemonade.cloud["fireworks"] = {"name": "fireworks", "runtime_key_set": True}
    resp = client.get("/api/providers")
    assert _fireworks_view(client)["key_hint"] == KEY[-4:]
    assert KEY not in resp.text


def test_a_short_key_gets_no_hint(client, lemonade, keys):
    keys["stored"]["fireworks"] = "short-key"
    assert _fireworks_view(client)["key_hint"] is None


def test_an_environment_key_gets_no_hint(client, lemonade, keys):
    keys["stored"]["fireworks"] = KEY
    lemonade.cloud["fireworks"] = {"name": "fireworks", "env_var_set": True}
    assert _fireworks_view(client)["key_hint"] is None


@pytest.fixture
def model_list(monkeypatch):
    """Fireworks' answer to the list check, and the server restart, faked."""
    from gaia.llm import fireworks_known_models as known
    from gaia.llm.providers import fireworks

    state = {"check": fireworks.ModelListCheck(fireworks.ModelListState.REJECTED)}
    state["restarts"], state["keys_checked"] = [], []

    def check(key, **_):
        state["keys_checked"].append(key)
        return state["check"]

    monkeypatch.setattr(fireworks, "check_model_list", check)
    monkeypatch.setattr(
        known, "use_known_models", lambda _: state["restarts"].append(1)
    )
    monkeypatch.setattr(
        "gaia.llm.lemonade_launcher.gaia_runs_lemonade",
        lambda *a: state.get("own", True),
    )
    monkeypatch.setattr(
        "gaia.llm.lemonade_tls.ca_store_problem", lambda **_: state.get("ca_problem")
    )
    return state


def _list_failing():
    from gaia.llm.providers.fireworks import ModelListCheck, ModelListState

    return ModelListCheck(ModelListState.FAILING, "HTTP 500: Error listing")


def test_a_failing_model_list_keeps_the_key_and_serves_known_models(
    client, lemonade, keys, model_list
):
    lemonade.answers[("POST", "cloud/auth")] = (200, {"models_discovered": False})
    model_list["check"] = _list_failing()
    lemonade.cloud["fireworks"] = {"name": "fireworks", "models_discovered": 9}
    resp = client.post("/api/providers/fireworks/connect", json={"api_key": KEY})
    assert resp.status_code == 200
    assert resp.json()["remembered"] is True
    assert keys["remembered"] == [("fireworks", KEY)]
    assert model_list["restarts"] == [1]
    assert KEY not in resp.text


def test_a_failing_list_on_a_system_server_blames_fireworks_not_the_key(
    client, lemonade, keys, model_list
):
    lemonade.answers[("POST", "cloud/auth")] = (200, {"models_discovered": False})
    model_list.update(check=_list_failing(), own=False)
    resp = client.post("/api/providers/fireworks/connect", json={"api_key": KEY})
    assert resp.status_code == 503
    detail = resp.json()["detail"]
    assert "HTTP 500" in detail and "did not reject" in detail
    assert keys["remembered"] == [("fireworks", KEY)]
    assert model_list["restarts"] == []
    assert KEY not in resp.text


def test_a_stored_key_is_checked_when_no_models_come_back(
    client, lemonade, keys, model_list
):
    keys["stored"]["fireworks"] = KEY
    model_list["check"] = _list_failing()
    client.post("/api/providers/fireworks/connect", json={})
    assert model_list["keys_checked"] == [KEY]
    assert model_list["restarts"] == [1]


def test_reconnect_outage_replays_a_saved_key_and_keeps_it(
    client, lemonade, keys, model_list, monkeypatch
):
    from gaia.llm import fireworks_known_models as known

    monkeypatch.setenv("FIREWORKS_API_KEY", ENV_KEY)
    keys["stored"]["fireworks"] = KEY
    lemonade.answers[("POST", "cloud/auth")] = (200, {"models_discovered": False})
    model_list["check"] = _list_failing()

    def serve_known_models(_):
        model_list["restarts"].append(1)
        lemonade.cloud["fireworks"]["models_discovered"] = True

    monkeypatch.setattr(known, "use_known_models", serve_known_models)

    resp = client.post("/api/providers/fireworks/connect", json={})

    assert resp.status_code == 200, resp.text
    assert model_list["keys_checked"] == [KEY]
    assert model_list["restarts"] == [1]
    assert keys["remembered"] == [("fireworks", KEY)]
    assert keys["stored"]["fireworks"] == KEY
    assert ENV_KEY not in resp.text


def test_a_key_fireworks_accepts_is_not_blamed_when_discovery_fails(
    client, lemonade, keys, model_list
):
    from gaia.llm.providers.fireworks import ModelListCheck, ModelListState

    lemonade.answers[("POST", "cloud/auth")] = (200, {"models_discovered": False})
    model_list["check"] = ModelListCheck(ModelListState.OK)
    resp = client.post("/api/providers/fireworks/connect", json={"api_key": KEY})
    assert resp.status_code == 502
    detail = resp.json()["detail"]
    assert "accepted that key" in detail
    assert "did not accept" not in detail


@pytest.mark.parametrize("own_server", [True, False])
def test_a_key_accepted_without_models_names_the_log_to_read(
    client, lemonade, keys, model_list, monkeypatch, tmp_path, own_server
):
    from gaia.llm import lemonade_client
    from gaia.llm.providers.fireworks import ModelListCheck, ModelListState

    log = tmp_path / "lemonade" / "lemond.log"
    monkeypatch.setattr(
        lemonade_client,
        "embedded_lemonade_log_path",
        lambda base_url=None: log if own_server else None,
    )
    lemonade.answers[("POST", "cloud/auth")] = (200, {"models_discovered": False})
    model_list["check"] = ModelListCheck(ModelListState.OK)

    resp = client.post("/api/providers/fireworks/connect", json={"api_key": KEY})

    assert resp.status_code == 502
    detail = resp.json()["detail"]
    assert "paste the key again" in detail
    if own_server:
        assert str(log) in detail
    else:
        assert "model server's log" in detail


def test_a_missing_ca_file_is_named_instead_of_the_key(
    client, device_client, lemonade, keys, model_list
):
    problem = "This PC's certificate store has no /etc/ssl/certs/ca-certificates.crt"
    model_list["ca_problem"] = problem
    lemonade.answers[("POST", "cloud/auth")] = (200, {"models_discovered": False})
    resp = client.post("/api/providers/fireworks/connect", json={"api_key": KEY})
    assert resp.status_code == 503
    assert resp.json()["detail"] == problem
    assert model_list["keys_checked"] == []
    # A paired device is told to fix it on the PC, without the PC's paths.
    resp = device_client.post("/api/providers/fireworks/connect", json={"api_key": KEY})
    assert resp.status_code == 503
    assert "certificate store needs fixing" in resp.json()["detail"]
    assert "/etc/ssl" not in resp.text


def test_a_missing_ca_file_on_the_users_own_server_is_not_claimed(
    client, lemonade, keys, model_list
):
    model_list["own"] = False
    model_list["ca_problem"] = "should not be shown"
    lemonade.answers[("POST", "cloud/auth")] = (200, {"models_discovered": False})
    resp = client.post("/api/providers/fireworks/connect", json={"api_key": KEY})
    assert resp.status_code == 422
    assert "did not accept that key" in resp.json()["detail"]


def test_connect_drops_a_key_that_discovers_no_models(
    client, lemonade, keys, model_list
):
    lemonade.answers[("POST", "cloud/auth")] = (200, {"models_discovered": False})
    resp = client.post("/api/providers/fireworks/connect", json={"api_key": KEY})
    assert resp.status_code == 422
    assert "did not accept that key" in resp.json()["detail"]
    assert "DELETE" in [c["method"] for c in lemonade.calls]
    assert lemonade.call("DELETE", "cloud/auth/fireworks")
    assert keys["remembered"] == []
    assert KEY not in resp.text


def _registered(client, provider="fireworks"):
    view = next(
        p
        for p in client.get("/api/providers").json()["providers"]
        if p["id"] == provider
    )
    return view["registered"]


def _mutations(lemonade):
    return [(c["method"], c["path"]) for c in lemonade.calls if c["method"] != "GET"]


UNINSTALL = {"backend": "cloud", "provider": "fireworks"}


def test_a_rejected_connect_leaves_nothing_registered(
    client, lemonade, keys, model_list
):
    assert _registered(client) is False
    lemonade.calls.clear()
    lemonade.answers[("POST", "cloud/auth")] = (200, {"models_discovered": False})
    resp = client.post("/api/providers/fireworks/connect", json={"api_key": KEY})
    assert resp.status_code == 422
    assert "did not accept that key" in resp.json()["detail"]
    assert KEY not in resp.text
    assert _mutations(lemonade) == [
        ("POST", "install"),
        ("POST", "cloud/auth"),
        ("DELETE", "cloud/auth/fireworks"),
        ("POST", "uninstall"),
    ]
    assert lemonade.call("POST", "uninstall")["json"] == UNINSTALL
    assert _registered(client) is False


def test_a_401_connect_leaves_nothing_registered(client, lemonade, keys):
    lemonade.answers[("POST", "cloud/auth")] = (401, {"error": {"message": KEY}})
    resp = client.post("/api/providers/fireworks/connect", json={"api_key": KEY})
    assert resp.status_code == 422
    assert "rejected the key" in resp.json()["detail"]
    assert _mutations(lemonade) == [
        ("POST", "install"),
        ("POST", "cloud/auth"),
        ("POST", "uninstall"),
    ]
    assert lemonade.call("POST", "uninstall")["json"] == UNINSTALL
    assert _registered(client) is False


OLD_KEY = "fw_OLD_working_key_fixed_456"
FIREWORKS_INSTALL = {
    "backend": "cloud",
    "provider": "fireworks",
    "wire_format": "openai",
    "base_url": "https://api.fireworks.ai/inference/v1",
    "auth_header_name": "Authorization",
    "auth_header_prefix": "Bearer ",
}


def _holding(lemonade, *, env=False):
    """Fireworks registered and working on OLD_KEY, or on Lemonade's environment key.

    Lemonade stores any key it is handed; only OLD_KEY discovers models.
    """
    lemonade.held = {} if env else {"fireworks": OLD_KEY}
    entry = {"name": "fireworks", "models_discovered": True}
    entry["env_var_set" if env else "runtime_key_set"] = True
    lemonade.cloud["fireworks"] = entry

    def auth(body):
        lemonade.held["fireworks"] = body["api_key"]
        works = body["api_key"] == OLD_KEY
        entry.update(runtime_key_set=True, models_discovered=works)
        return 200, {"models_discovered": works}

    def clear(_):
        lemonade.held.pop("fireworks", None)
        entry.update(runtime_key_set=False, models_discovered=env)
        return 200, {}

    lemonade.answers[("POST", "cloud/auth")] = auth
    lemonade.answers[("DELETE", "cloud/auth/fireworks")] = clear


def _sequence(lemonade):
    return [(c["method"], c["path"], c["json"]) for c in lemonade.calls]


def _auth(key):
    return ("POST", "cloud/auth", {"provider": "fireworks", "api_key": key})


def test_a_rejected_replace_puts_the_stored_key_back(
    client, lemonade, keys, model_list
):
    _holding(lemonade)
    keys["stored"]["fireworks"] = OLD_KEY
    resp = client.post("/api/providers/fireworks/connect", json={"api_key": KEY})
    assert resp.status_code == 422
    assert "did not accept that key" in resp.json()["detail"]
    assert _sequence(lemonade) == [
        ("GET", "system-info", None),
        ("POST", "install", FIREWORKS_INSTALL),
        _auth(KEY),
        _auth(OLD_KEY),
        ("GET", "system-info", None),
    ]
    assert lemonade.held["fireworks"] == OLD_KEY
    assert lemonade.cloud["fireworks"]["models_discovered"] is True
    assert keys["stored"]["fireworks"] == OLD_KEY and keys["remembered"] == []
    assert KEY not in resp.text and OLD_KEY not in resp.text
    assert _registered(client) is True


def test_a_401_replace_puts_the_stored_key_back(client, lemonade, keys):
    _holding(lemonade)
    keys["stored"]["fireworks"] = OLD_KEY
    auth = lemonade.answers[("POST", "cloud/auth")]
    lemonade.answers[("POST", "cloud/auth")] = lambda body: (
        (401, {}) if body["api_key"] == KEY else auth(body)
    )
    resp = client.post("/api/providers/fireworks/connect", json={"api_key": KEY})
    assert resp.status_code == 422
    assert "rejected the key" in resp.json()["detail"]
    assert _sequence(lemonade)[2:] == [
        _auth(KEY),
        _auth(OLD_KEY),
        ("GET", "system-info", None),
    ]
    assert lemonade.held["fireworks"] == OLD_KEY


def test_a_rejected_replace_of_an_environment_key_drops_only_the_new_key(
    client, lemonade, keys, model_list
):
    _holding(lemonade, env=True)
    resp = client.post("/api/providers/fireworks/connect", json={"api_key": KEY})
    assert resp.status_code == 422
    assert _sequence(lemonade) == [
        ("GET", "system-info", None),
        ("POST", "install", FIREWORKS_INSTALL),
        _auth(KEY),
        ("DELETE", "cloud/auth/fireworks", None),
        ("GET", "system-info", None),
    ]
    assert lemonade.held == {}
    assert lemonade.cloud["fireworks"]["env_var_set"] is True
    assert keys["remembered"] == []


@pytest.mark.parametrize("stored", [True, False], ids=["refused", "no-copy"])
def test_a_failed_restore_is_a_loud_502(
    client, lemonade, keys, model_list, caplog, stored
):
    _holding(lemonade)
    if stored:
        keys["stored"]["fireworks"] = OLD_KEY
        auth = lemonade.answers[("POST", "cloud/auth")]
        lemonade.answers[("POST", "cloud/auth")] = lambda body: (
            (500, {"error": {"message": body["api_key"]}})
            if body["api_key"] == OLD_KEY
            else auth(body)
        )
    with caplog.at_level(logging.ERROR):
        resp = client.post("/api/providers/fireworks/connect", json={"api_key": KEY})
    assert resp.status_code == 502
    assert resp.json()["detail"] == (
        "Fireworks AI didn't accept the new key, and GAIA couldn't restore the "
        "old one. Enter a working key in Settings › Model."
    )
    assert "fireworks" in caplog.text
    for key in (KEY, OLD_KEY):
        assert key not in resp.text and key not in caplog.text


@pytest.mark.parametrize(
    "state,status,said",
    [("FAILING", 503, "kept the one you had"), ("OK", 502, "accepted that key")],
)
def test_an_outage_during_replace_keeps_the_old_key(
    client, lemonade, keys, model_list, state, status, said
):
    from gaia.llm.providers.fireworks import ModelListCheck, ModelListState

    _holding(lemonade)
    keys["stored"]["fireworks"] = OLD_KEY
    model_list["check"] = ModelListCheck(ModelListState[state], "HTTP 500")
    resp = client.post("/api/providers/fireworks/connect", json={"api_key": KEY})
    assert resp.status_code == status
    assert said in resp.json()["detail"]
    assert "DELETE" not in [c["method"] for c in lemonade.calls]
    assert lemonade.held["fireworks"] == OLD_KEY
    assert keys["stored"]["fireworks"] == OLD_KEY and keys["remembered"] == []
    assert model_list["restarts"] == []
    assert KEY not in resp.text and OLD_KEY not in resp.text


def test_a_failed_cleanup_is_reported_with_the_rejection(
    client, lemonade, keys, model_list, caplog
):
    lemonade.answers[("POST", "cloud/auth")] = (200, {"models_discovered": False})
    lemonade.answers[("POST", "uninstall")] = (500, {"error": {"message": KEY}})
    with caplog.at_level(logging.ERROR):
        resp = client.post("/api/providers/fireworks/connect", json={"api_key": KEY})
    assert resp.status_code == 502
    detail = resp.json()["detail"]
    assert "did not accept that key" in detail
    assert "could not remove the registration" in detail
    assert "disconnect Fireworks" in detail
    assert KEY not in resp.text and KEY not in caplog.text
    assert "fireworks" in caplog.text


def test_forget_clears_a_key_less_leftover(client, lemonade, keys):
    lemonade.cloud["fireworks"] = {"name": "fireworks", "models_discovered": False}
    resp = client.delete("/api/providers/fireworks/key")
    assert resp.status_code == 200
    assert resp.json() == {"removed": True}
    assert _mutations(lemonade) == [
        ("DELETE", "cloud/auth/fireworks"),
        ("POST", "uninstall"),
    ]
    assert lemonade.call("POST", "uninstall")["json"] == UNINSTALL
    assert _registered(client) is False


def test_forget_keeps_the_registration_of_a_provider_that_held_a_key(
    client, lemonade, keys
):
    lemonade.cloud["fireworks"] = {"name": "fireworks", "runtime_key_set": True}
    client.delete("/api/providers/fireworks/key")
    assert "uninstall" not in lemonade.paths("POST")


def test_forget_reports_a_failed_leftover_cleanup(client, lemonade, keys):
    lemonade.cloud["fireworks"] = {"name": "fireworks"}
    lemonade.answers[("POST", "uninstall")] = (500, {})
    resp = client.delete("/api/providers/fireworks/key")
    assert resp.status_code == 502


@pytest.mark.parametrize("status", [401, 403])
def test_connect_rejected_key_is_422(client, lemonade, keys, status):
    lemonade.answers[("POST", "cloud/auth")] = (status, {"error": {"message": KEY}})
    resp = client.post("/api/providers/fireworks/connect", json={"api_key": KEY})
    assert resp.status_code == 422
    assert "rejected the key" in resp.json()["detail"]
    assert KEY not in resp.text
    assert keys["remembered"] == []


def test_connect_environment_key_wins_409(client, lemonade, keys):
    lemonade.answers[("POST", "cloud/auth")] = (409, {})
    resp = client.post("/api/providers/fireworks/connect", json={"api_key": KEY})
    assert resp.status_code == 409
    assert "LEMONADE_FIREWORKS_API_KEY" in resp.json()["detail"]


def test_connect_old_lemonade_409(client, lemonade, keys):
    lemonade.answers[("POST", "install")] = (404, {})
    resp = client.post("/api/providers/fireworks/connect", json={"api_key": KEY})
    assert resp.status_code == 409
    assert "oldest version GAIA supports" in resp.json()["detail"]
    assert "cloud/auth" not in lemonade.paths()


def test_connect_unregistered_provider_names_settings_not_a_command(
    client, lemonade, keys
):
    lemonade.answers[("POST", "cloud/auth")] = (
        404,
        {
            "error": {
                "message": (
                    "Cloud provider 'fireworks' is not installed. Call POST "
                    "/v1/install with backend=cloud, provider, and base_url first."
                ),
                "type": "invalid_request",
            }
        },
    )
    resp = client.post("/api/providers/fireworks/connect", json={"api_key": KEY})
    assert resp.status_code == 409, resp.text
    detail = resp.json()["detail"]
    assert "no cloud provider registered" in detail
    assert "Settings › Model" in detail
    assert "connect it again" in detail
    assert "older than" not in detail
    assert "gaia gateway install" not in detail
    assert "TUI" not in detail
    assert "/gateway" not in detail


def test_connect_install_404_with_the_marker_keeps_the_version_hint(
    client, lemonade, keys
):
    lemonade.answers[("POST", "install")] = (
        404,
        {
            "error": {
                "message": (
                    "Cloud provider 'fireworks' is not installed. Call POST "
                    "/v1/install with backend=cloud, provider, and base_url first."
                ),
                "type": "invalid_request",
            }
        },
    )
    resp = client.post("/api/providers/fireworks/connect", json={"api_key": KEY})
    assert resp.status_code == 409, resp.text
    detail = resp.json()["detail"]
    assert "oldest version GAIA supports" in detail
    assert "no cloud provider registered" not in detail
    assert "cloud/auth" not in lemonade.paths()


def test_cloud_error_other_404_keeps_lemonades_detail():
    err = providers._cloud_error(
        "fireworks",
        404,
        {"error": {"message": "provider is misconfigured", "type": "invalid_request"}},
    )
    assert err.status == 502
    assert "provider is misconfigured" in str(err)
    assert "oldest version GAIA supports" not in str(err)
    assert "no cloud provider registered" not in str(err)


def test_connect_names_a_plaintext_http_gateway_without_echoing_lemonade(
    client, lemonade, keys
):
    raw = (
        "Cloud provider 'amd' uses http://. Set allow_insecure_http=true to "
        f"explicitly opt in before storing or using an API key over plaintext HTTP. {KEY}"
    )
    lemonade.answers[("POST", "cloud/auth")] = (400, {"error": {"message": raw}})
    resp = client.post("/api/providers/amd/connect", json={"api_key": KEY})
    assert resp.status_code == 422, resp.text
    detail = resp.json()["detail"]
    assert detail["code"] == "gateway_insecure_http"
    assert "https://" in detail["message"]
    assert KEY not in resp.text
    assert "allow_insecure_http" not in resp.text


def test_connect_never_echoes_lemonade_errors_about_the_key(
    client, lemonade, keys, caplog
):
    lemonade.answers[("POST", "cloud/auth")] = (
        500,
        {"error": {"message": f"bad key {KEY}"}},
    )
    with caplog.at_level(logging.DEBUG):
        resp = client.post("/api/providers/fireworks/connect", json={"api_key": KEY})
    assert resp.status_code == 502
    assert "HTTP 500" in resp.json()["detail"]
    assert KEY not in resp.text
    assert KEY not in caplog.text


def test_connect_install_errors_are_named(client, lemonade, keys):
    lemonade.answers[("POST", "install")] = (500, {"error": {"message": "disk full"}})
    resp = client.post("/api/providers/fireworks/connect", json={"api_key": KEY})
    assert resp.status_code == 502
    assert "disk full" in resp.json()["detail"]


def test_connect_refuses_a_key_over_the_tunnel(client, lemonade, keys):
    resp = client.post(
        "/api/providers/fireworks/connect",
        json={"api_key": KEY},
        headers={"X-Forwarded-For": "203.0.113.9"},
    )
    assert resp.status_code == 403
    assert lemonade.paths("POST") == [] and lemonade.paths("DELETE") == []
    assert KEY not in resp.text


def test_connect_without_a_key_over_the_tunnel_is_allowed(client, lemonade, keys):
    lemonade.cloud["fireworks"] = {
        "name": "fireworks",
        "runtime_key_set": True,
        "models_discovered": True,
    }
    resp = client.post(
        "/api/providers/fireworks/connect",
        json={},
        headers={"X-Forwarded-Proto": "https"},
    )
    assert resp.status_code == 200, resp.text
    assert keys["ensure"] == ["fireworks"]
    assert "cloud/auth" not in lemonade.paths()


def test_connect_refuses_a_remote_lemonade(client, lemonade, keys, monkeypatch):
    monkeypatch.setattr(providers, "_base_url", lambda: "http://10.0.0.5:13305/api/v1")
    resp = client.post("/api/providers/fireworks/connect", json={"api_key": KEY})
    assert resp.status_code == 409
    assert "not on this PC" in resp.json()["detail"]
    assert lemonade.paths("POST") == [] and lemonade.paths("DELETE") == []


@pytest.mark.parametrize("host", ["localhost", "127.0.0.1", "[::1]"])
def test_loopback_hosts_are_local(host):
    providers._require_loopback(f"http://{host}:13305/api/v1")


def test_connect_blank_key_replays_the_stored_one(client, lemonade, keys):
    lemonade.cloud["fireworks"] = {"name": "fireworks", "models_discovered": True}
    resp = client.post("/api/providers/fireworks/connect", json={"api_key": "  "})
    assert resp.status_code == 200
    assert keys["ensure"] == ["fireworks"]
    assert resp.json()["remembered"] is False


def test_connect_blank_key_while_a_keychain_prompt_is_open_says_so(
    client, lemonade, keys, keychain_prompt
):
    lemonade.cloud["fireworks"] = {"name": "fireworks", "models_discovered": True}
    keys["stored"]["fireworks"] = KEY

    resp = client.post("/api/providers/fireworks/connect", json={})
    _answered_with_the_dialog_open(keychain_prompt)
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"]["code"] == "key_store_waiting"
    assert "Look for a system dialog" in resp.json()["detail"]["message"]

    keychain_prompt["answered"].set()
    _wait_for_reads_to_drain()
    resp = client.post("/api/providers/fireworks/connect", json={})
    assert resp.status_code == 200, resp.text


def test_connect_blank_key_replay_failure_is_502(client, lemonade, keys):
    keys["ensure_result"] = CloudKeyError("Lemonade is not reachable")
    resp = client.post("/api/providers/fireworks/connect", json={})
    assert resp.status_code == 502


def test_connect_registered_without_models_is_422(client, lemonade, keys):
    resp = client.post("/api/providers/fireworks/connect", json={})
    assert resp.status_code == 422
    assert "discovered no models" in resp.json()["detail"]


def test_connect_local_and_unknown(client, lemonade, keys):
    assert client.post("/api/providers/local/connect", json={}).status_code == 422
    assert client.post("/api/providers/openai/connect", json={}).status_code == 404
    assert lemonade.paths("POST") == [] and lemonade.paths("DELETE") == []


# ── DELETE /api/providers/{p}/key ──────────────────────────────────────────


def test_forget_key_clears_lemonade_and_the_store(client, lemonade, keys):
    keys["stored"]["fireworks"] = KEY
    resp = client.delete("/api/providers/fireworks/key")
    assert resp.status_code == 200
    assert resp.json() == {"removed": True}
    assert lemonade.paths("DELETE") == ["cloud/auth/fireworks"]
    assert "fireworks" not in keys["stored"]


def test_forget_key_tolerates_a_lemonade_without_one(client, lemonade, keys):
    lemonade.answers[("DELETE", "cloud/auth/amd")] = (404, {})
    resp = client.delete("/api/providers/amd/key")
    assert resp.json() == {"removed": False}


def test_forget_key_lemonade_error_is_502(client, lemonade, keys):
    lemonade.answers[("DELETE", "cloud/auth/fireworks")] = (500, {})
    keys["stored"]["fireworks"] = KEY
    resp = client.delete("/api/providers/fireworks/key")
    assert resp.status_code == 502
    assert "fireworks" in keys["stored"]


def test_forget_key_store_error_is_503(client, lemonade, keys):
    keys["forget_error"] = ConnectorsError("keyring locked")
    resp = client.delete("/api/providers/fireworks/key")
    assert resp.status_code == 503
    assert "keyring locked" in resp.json()["detail"]


def test_forget_key_local_is_422(client, lemonade, keys):
    assert client.delete("/api/providers/local/key").status_code == 422


# ── Keys from a paired device ──────────────────────────────────────────────

PC_PATH = "/Users/someone/Library/Keychains/login.keychain-db"


@pytest.fixture
def device_client(db, tmp_path):
    """A request from an allowed paired device on the device listener."""
    from gaia.ui.devices.access import DeviceAccess
    from gaia.ui.security import (
        DEVICE_SCOPE_KEY,
        LAN_LISTENER,
        LISTENER_SCOPE_KEY,
        DevicePrincipal,
    )

    app = FastAPI()
    app.include_router(providers.router)
    app.state.db = db
    app.state.devices = DeviceAccess(app, folder=tmp_path / "devices")

    async def on_listener(scope, receive, send):
        scope[LISTENER_SCOPE_KEY] = LAN_LISTENER
        scope[DEVICE_SCOPE_KEY] = DevicePrincipal("phone-1", True)
        await app(scope, receive, send)

    return TestClient(
        on_listener, client=("127.0.0.1", 50000), headers={"X-Gaia-UI": "1"}
    )


def test_a_device_sees_the_pcs_key_hint_without_a_store_read_or_lemonade_write(
    client, device_client, lemonade, keys, monkeypatch
):
    lemonade.cloud["fireworks"] = {"name": "fireworks", "models_discovered": True}
    keys["stored"]["fireworks"] = KEY

    def fireworks(c):
        body = c.get("/api/providers/list").json()
        return next(p for p in body["providers"] if p["id"] == "fireworks")

    reads = []
    real_recall = cloud_keys.recall_key
    monkeypatch.setattr(
        cloud_keys, "recall_key", lambda p: reads.append(p) or real_recall(p)
    )
    assert fireworks(device_client)["key_state"] == "unknown"
    assert reads == []
    pc_view = _fireworks_view(client)  # the PC's own read fills the cache
    assert reads

    reads.clear()
    keys["ensure"].clear()
    lemonade.calls.clear()
    seen = fireworks(device_client)
    assert seen["key_source"] == pc_view["key_source"] == "stored"
    assert seen["key_hint"] == pc_view["key_hint"] == KEY[-4:]
    assert seen["key_state"] == "read"
    assert reads == [] and keys["ensure"] == []
    assert lemonade.paths("POST") == [] and lemonade.paths("DELETE") == []
    assert KEY not in device_client.get("/api/providers/list").text
    # Mobile access sees the source but never a hint.
    away = client.get("/api/providers/list", headers={"X-Forwarded-For": "203.0.113.9"})
    assert (
        next(p for p in away.json()["providers"] if p["id"] == "fireworks")["key_hint"]
        is None
    )


def _summary(c, provider="fireworks", **kw):
    body = c.get("/api/providers/list", **kw).json()
    return next(p for p in body["providers"] if p["id"] == provider)


def test_the_summary_error_is_masked_for_a_device_and_null_over_the_tunnel(
    client, device_client, lemonade, keys, monkeypatch
):
    lemonade.cloud["fireworks"] = {"name": "fireworks", "models_discovered": True}
    keys["stored"]["fireworks"] = KEY

    def not_kept(*a, **k):
        try:
            raise ConnectorsError(f"Keyring failed: {PC_PATH}")
        except ConnectorsError as e:
            raise CloudKeyError(f"not kept ({e})") from e

    monkeypatch.setattr(cloud_keys, "ensure_authenticated", not_kept)
    pc_error = _fireworks_view(client)["error"]
    assert PC_PATH in pc_error

    lemonade.calls.clear()
    monkeypatch.setattr(
        cloud_keys, "ensure_authenticated", lambda *a, **k: pytest.fail("replayed")
    )
    monkeypatch.setattr(
        cloud_keys, "recall_key", lambda p: pytest.fail("read the key store")
    )
    assert _summary(client)["error"] == pc_error
    seen = _summary(device_client)["error"]
    assert seen and PC_PATH not in seen and KEY not in seen
    tunnel = _summary(client, headers={"X-Forwarded-For": "203.0.113.9"})
    assert tunnel["error"] is None
    assert lemonade.paths("POST") == [] and lemonade.paths("DELETE") == []


def test_the_summary_names_the_env_var_never_its_value(
    client, device_client, lemonade, keys, monkeypatch
):
    monkeypatch.setenv("FIREWORKS_API_KEY", ENV_KEY)
    lemonade.cloud["fireworks"] = {"name": "fireworks", "models_discovered": True}
    pc_view = _fireworks_view(client)
    assert pc_view["key_source"] == "environment"
    monkeypatch.setattr(
        cloud_keys, "recall_key", lambda p: pytest.fail("read the key store")
    )
    lemonade.calls.clear()
    for c in (client, device_client):
        seen = _summary(c)
        assert seen["env_var"] == pc_view["env_var"] == "FIREWORKS_API_KEY"
        assert seen["key_from_gaia_env"] is pc_view["key_from_gaia_env"] is True
    assert ENV_KEY not in device_client.get("/api/providers/list").text
    assert lemonade.paths("POST") == [] and lemonade.paths("DELETE") == []
    assert _summary(device_client, "amd")["env_var"] is None


def test_a_new_key_replaces_the_hint_a_device_sees_at_once(
    client, device_client, lemonade, keys, monkeypatch
):
    old = "fw_OLD_key_value_000000_ABCD"
    lemonade.cloud["fireworks"] = {"name": "fireworks", "models_discovered": True}
    keys["stored"]["fireworks"] = old
    _fireworks_view(client)

    def waiting(provider):
        raise credential_wait.CredentialStoreWaiting("the OS is asking")

    # Connect's own view can't read the store back, so only the save can say.
    monkeypatch.setattr(providers, "_bounded_recall", waiting)
    resp = device_client.post("/api/providers/fireworks/connect", json={"api_key": KEY})
    assert resp.status_code == 200, resp.text
    lemonade.cloud["fireworks"].pop("runtime_key_set", None)
    monkeypatch.setattr(
        cloud_keys, "recall_key", lambda p: pytest.fail("read the key store")
    )
    body = device_client.get("/api/providers/list").json()
    seen = next(p for p in body["providers"] if p["id"] == "fireworks")
    assert (seen["key_source"], seen["key_hint"]) == ("stored", KEY[-4:])


OLD_URL = "https://old.example/v1"
NEW_URL = "https://new.example/v1"
OLD_KEY = "old-gateway-key-0123456789abcdef"
NEW_KEY = "new-gateway-key-fedcba9876543210"
_OLD_GATEWAY = {
    "name": "amd",
    "base_url": OLD_URL,
    "auth_header_name": DEFAULT_AUTH_HEADER_NAME,
    "auth_header_prefix": DEFAULT_AUTH_HEADER_PREFIX,
    "runtime_key_set": True,
    "models_discovered": True,
}


@pytest.fixture
def bound_gateway(lemonade, monkeypatch, tmp_path):
    """A working gateway at OLD_URL whose key is stored bound to it.

    The real key store code runs over an in-memory vault, and the real
    GatewayManager replays into the fake Lemonade, which accepts only OLD_KEY
    and notes where its gateway pointed at every call.
    """
    import socket

    from gaia.connectors import store
    from gaia.llm import lemonade_choice

    vault = {}
    monkeypatch.setattr(store, "verify_keyring_backend", lambda: None)
    monkeypatch.setattr(store, "save_secret", vault.__setitem__)
    monkeypatch.setattr(store, "peek_secret", vault.get)
    monkeypatch.setattr(store, "delete_secret", lambda n: vault.pop(n, None))
    monkeypatch.setattr(gateway, "GATEWAY_STATE_FILE", tmp_path / "gateway.json")
    monkeypatch.setattr(
        lemonade_client.LemonadeClient, "credential_base_url", lambda self: BASE
    )
    monkeypatch.setattr(lemonade_choice, "is_users_server", lambda *a: False)
    monkeypatch.setattr(providers, "_gateway_check_applies", lambda: False)
    monkeypatch.setattr(
        providers.socket,
        "getaddrinfo",
        lambda host, port, proto=0: [
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.215.14", port))
        ],
    )
    lemonade.cloud["amd"] = dict(_OLD_GATEWAY)

    def auth(body):
        ok = body["api_key"] == OLD_KEY
        lemonade.cloud["amd"].update(runtime_key_set=True, models_discovered=ok)
        return 200, {"models_discovered": ok}

    def drop_key(body):
        lemonade.cloud["amd"].update(runtime_key_set=False, models_discovered=False)
        return 200, {}

    lemonade.answers[("POST", "cloud/auth")] = auth
    lemonade.answers[("DELETE", "cloud/auth/amd")] = drop_key
    recorded = lemonade.request

    def request(method, url, json=None, **kwargs):
        at = (lemonade.cloud.get("amd") or {}).get("base_url")
        try:
            return recorded(method, url, json=json, **kwargs)
        finally:
            lemonade.calls[-1]["gateway"] = at

    monkeypatch.setattr(providers.requests, "request", request)
    gateway.remember_token(OLD_KEY, OLD_URL)
    return vault


def _stored(vault):
    assert gateway.GATEWAY_SECRET_NAME not in vault
    return json.loads(vault[gateway.GATEWAY_KEY_SLOT])


def _keys_went_only_home(lemonade):
    """Every key Lemonade was handed went to the gateway it belongs to."""
    home = {OLD_KEY: OLD_URL, NEW_KEY: NEW_URL}
    sent = [c for c in lemonade.calls if (c["json"] or {}).get("api_key")]
    assert sent
    for call in sent:
        assert call["path"] == "cloud/auth", call["path"]
        assert call["json"]["provider"] == "amd"
        assert call["gateway"] == home[call["json"]["api_key"]], call
    return sent


def _move(device_client):
    return device_client.post(
        "/api/providers/amd/connect", json={"api_key": NEW_KEY, "base_url": NEW_URL}
    )


def test_a_device_move_sends_only_the_new_key_to_the_new_url(
    device_client, lemonade, bound_gateway
):
    lemonade.answers[("POST", "cloud/auth")] = None
    without_key = device_client.post(
        "/api/providers/amd/connect", json={"base_url": NEW_URL}
    )
    assert without_key.status_code == 403 and lemonade.calls == []

    resp = _move(device_client)
    assert resp.status_code == 200, resp.text
    assert NEW_KEY not in resp.text and OLD_KEY not in resp.text
    assert [(c["method"], c["path"], c["json"]) for c in lemonade.calls] == [
        ("GET", "system-info", None),
        ("DELETE", "cloud/auth/amd", None),
        (
            "POST",
            "install",
            {
                "backend": "cloud",
                "provider": "amd",
                "wire_format": "openai",
                "base_url": NEW_URL,
                "auth_header_name": DEFAULT_AUTH_HEADER_NAME,
                "auth_header_prefix": DEFAULT_AUTH_HEADER_PREFIX,
            },
        ),
        ("POST", "cloud/auth", {"provider": "amd", "api_key": NEW_KEY}),
        ("GET", "system-info", None),
        ("GET", "system-info", None),
    ]
    assert [c["json"]["api_key"] for c in _keys_went_only_home(lemonade)] == [NEW_KEY]
    assert _stored(bound_gateway) == {"key": NEW_KEY, "base_url": NEW_URL}


def test_a_replay_after_a_failed_move_never_hands_the_old_key_to_the_new_url(
    client, device_client, lemonade, bound_gateway, monkeypatch
):
    from gaia.llm import fireworks_known_models, lemonade_embedded

    installed = lemonade.answers.get(("POST", "install"))

    def install_new_only(body):
        if body["base_url"] == OLD_URL:
            return 500, {"error": {"message": "busy"}}
        lemonade.cloud["amd"]["base_url"] = body["base_url"]
        return 200, {"status": "ok"}

    assert installed is None
    lemonade.answers[("POST", "install")] = install_new_only
    resp = _move(device_client)
    assert resp.status_code == 502, resp.text
    assert lemonade.cloud["amd"]["base_url"] == NEW_URL
    lemonade.answers.pop(("POST", "install"))
    mismatch = (
        "The saved AMD Gateway key belongs to old.example; enter a new key for "
        "new.example."
    )

    with pytest.raises(CloudKeyError, match=re.escape(mismatch)):
        cloud_keys.reconnect_provider("amd")

    listed = {p["id"]: p for p in client.get("/api/providers").json()["providers"]}
    assert listed["amd"]["error"] == mismatch

    monkeypatch.setattr(fireworks_known_models, "use_known_models", lambda e: None)
    monkeypatch.setattr(lemonade_embedded, "EmbeddedLemonade", lambda: object())
    assert mismatch in providers._restore_known_models("amd")

    providers._restore_key("amd", dict(_OLD_GATEWAY))
    assert lemonade.cloud["amd"]["base_url"] == OLD_URL
    assert lemonade.cloud["amd"]["runtime_key_set"] is True

    sent = _keys_went_only_home(lemonade)
    assert [c["json"]["api_key"] for c in sent] == [NEW_KEY, OLD_KEY]
    assert _stored(bound_gateway) == {"key": OLD_KEY, "base_url": OLD_URL}


@pytest.mark.parametrize("legacy", [False, True])
def test_a_failed_move_puts_the_old_gateway_back_with_its_key(
    device_client, lemonade, bound_gateway, legacy
):
    if legacy:
        # Saved before bindings: moved to the v2 slot bound to OLD_URL first.
        del bound_gateway[gateway.GATEWAY_KEY_SLOT]
        bound_gateway[gateway.GATEWAY_SECRET_NAME] = OLD_KEY
    resp = _move(device_client)
    assert resp.status_code == 422, resp.text
    assert resp.json() == {"detail": providers.DEVICE_GATEWAY_DETAIL}
    entry = lemonade.cloud["amd"]
    assert entry["base_url"] == OLD_URL and entry["runtime_key_set"] is True
    assert [c["json"]["api_key"] for c in _keys_went_only_home(lemonade)] == [
        NEW_KEY,
        OLD_KEY,
    ]
    assert [
        c["json"]["base_url"] for c in lemonade.calls if c["path"] == "install"
    ] == [
        NEW_URL,
        OLD_URL,
    ]
    # Read back after handing the old key back.
    assert [(c["method"], c["path"]) for c in lemonade.calls[-2:]] == [
        ("POST", "cloud/auth"),
        ("GET", "system-info"),
    ]
    assert _stored(bound_gateway) == {"key": OLD_KEY, "base_url": OLD_URL}


def test_a_failed_restore_is_a_502_that_names_no_key(
    device_client, lemonade, bound_gateway, caplog
):
    def install_new_only(body):
        if body["base_url"] == OLD_URL:
            return 500, {"error": {"message": "busy"}}
        lemonade.cloud["amd"]["base_url"] = body["base_url"]
        return 200, {"status": "ok"}

    lemonade.answers[("POST", "install")] = install_new_only
    with caplog.at_level(logging.DEBUG):
        resp = _move(device_client)
    assert resp.status_code == 502
    assert resp.json() == {
        "detail": "AMD LLM Gateway didn't accept the new address, and GAIA "
        "couldn't restore the old one. Enter a working address and key in "
        "Settings › Model."
    }
    assert "restore the previous AMD LLM Gateway gateway" in caplog.text
    for key in (OLD_KEY, NEW_KEY):
        assert key not in resp.text and key not in caplog.text
    _keys_went_only_home(lemonade)
    assert _stored(bound_gateway) == {"key": OLD_KEY, "base_url": OLD_URL}


def test_the_gateway_key_read_never_gets_the_bare_key_reads_answer(monkeypatch):
    """The key hint's read and the gateway's bound read run at once; each gets its own."""
    bare_key = "bare-gateway-key-0123456789"
    in_flight = threading.Event()

    def slow_bare_key(provider):
        in_flight.set()
        time.sleep(0.3)
        return bare_key

    monkeypatch.setattr(cloud_keys, "recall_key", slow_bare_key)
    monkeypatch.setattr(
        cloud_keys, "recall_gateway_key", lambda: gateway.GatewayKey(OLD_KEY, OLD_URL)
    )
    got = {}
    hint = threading.Thread(
        target=lambda: got.update(bare=providers._bounded_recall(providers.AMD))
    )
    hint.start()
    assert in_flight.wait(5)
    got["record"] = providers._bounded_gateway_key()
    hint.join(5)
    assert got == {"bare": bare_key, "record": gateway.GatewayKey(OLD_KEY, OLD_URL)}

    stuck = threading.Event()
    monkeypatch.setattr(credential_wait, "WAIT_SECONDS", 0.05)
    monkeypatch.setattr(cloud_keys, "recall_key", lambda p: stuck.wait(5))
    monkeypatch.setattr(cloud_keys, "recall_gateway_key", lambda: stuck.wait(5))
    with pytest.raises(credential_wait.CredentialStoreWaiting):
        providers._bounded_recall(providers.AMD)
    with pytest.raises(credential_wait.CredentialStoreWaiting):
        providers._bounded_gateway_key()
    assert credential_wait.in_flight_count() == 2
    providers._discard_key_reads(providers.AMD)
    assert credential_wait.in_flight_count() == 0
    stuck.set()


def test_a_restore_whose_key_read_breaks_still_puts_the_address_back(
    client, lemonade, bound_gateway, monkeypatch, caplog
):
    """An unexpected answer from the key read is a loud 502 with the reason,
    never a 500 that leaves the gateway half moved."""
    real_read = cloud_keys.recall_gateway_key
    rejected = []

    def recall_gateway_key():
        return "a-bare-key-not-a-record" if rejected else real_read()

    def reject_the_new_key(body):
        rejected.append(body["api_key"] == NEW_KEY)
        return 401, {"error": {"message": "unauthorized"}}

    def drop_key(body):
        # A fresh entry, so the snapshot taken before the move keeps its key.
        lemonade.cloud["amd"] = {
            **lemonade.cloud["amd"],
            "runtime_key_set": False,
            "models_discovered": False,
        }
        return 200, {}

    monkeypatch.setattr(cloud_keys, "recall_gateway_key", recall_gateway_key)
    lemonade.answers[("POST", "cloud/auth")] = reject_the_new_key
    lemonade.answers[("DELETE", "cloud/auth/amd")] = drop_key
    with caplog.at_level(logging.ERROR):
        resp = client.post(
            "/api/providers/amd/connect",
            json={"api_key": NEW_KEY, "base_url": NEW_URL},
        )
    assert rejected == [True]
    assert resp.status_code == 502, resp.text
    assert "couldn't restore the old one" in resp.json()["detail"]
    assert lemonade.cloud["amd"]["base_url"] == OLD_URL
    assert "reading the saved key failed" in caplog.text
    assert "returned a str" in caplog.text
    for key in (OLD_KEY, NEW_KEY):
        assert key not in resp.text and key not in caplog.text


def test_device_gateway_moves_wait_for_each_other(
    device_client, lemonade, bound_gateway, monkeypatch
):
    from gaia.ui.devices import prompts

    assert providers._gateway_move_lock is gateway.GATEWAY_KEY_LOCK
    monkeypatch.setattr(prompts, "limit_device_rate", lambda *a: None)
    lemonade.answers[("POST", "cloud/auth")] = None
    results = []
    with providers._gateway_move_lock:
        mover = threading.Thread(target=lambda: results.append(_move(device_client)))
        mover.start()
        mover.join(timeout=0.5)
        assert mover.is_alive() and lemonade.calls == []
    mover.join(timeout=10)
    assert results[0].status_code == 200, results[0].text
    assert lemonade.cloud["amd"]["base_url"] == NEW_URL


def test_a_device_gateway_is_dialed_before_the_lock_is_taken(
    device_client, lemonade, bound_gateway, monkeypatch
):
    """A slow dial of the new gateway never holds up another process's replay."""
    monkeypatch.setattr(gateway, "GATEWAY_KEY_LOCK_TIMEOUT", 0.2)
    monkeypatch.setattr(providers, "_gateway_check_applies", lambda: True)
    lemonade.answers[("POST", "cloud/auth")] = None
    took = []

    def slow_dial(host, port, addresses):
        def replay():
            try:
                with providers._gateway_move_lock:
                    took.append(True)
            except gateway.GatewayBusy:
                took.append(False)

        other = threading.Thread(target=replay)
        other.start()
        other.join(timeout=5)

    monkeypatch.setattr(providers, "_dial_checked_addresses", slow_dial)
    resp = _move(device_client)
    assert took == [True]
    assert resp.status_code == 200, resp.text
    assert lemonade.cloud["amd"]["base_url"] == NEW_URL


def test_a_gateway_check_dials_at_most_three_addresses(monkeypatch):
    dialed = []

    def refuse(address, timeout):
        dialed.append(address[0])
        raise OSError("connection refused")

    monkeypatch.setattr(providers.socket, "create_connection", refuse)
    addresses = [f"93.184.215.{n}" for n in range(1, 16)]
    with pytest.raises(OSError, match="did not complete a TLS handshake"):
        providers._dial_checked_addresses("gw.example.com", 443, addresses)
    assert dialed == addresses[:3]


def test_a_pc_gateway_connect_waits_for_another_processs_move(
    client, lemonade, bound_gateway, monkeypatch
):
    monkeypatch.setattr(gateway, "GATEWAY_KEY_LOCK_TIMEOUT", 0.3)
    with providers._gateway_move_lock:
        results = []
        other = threading.Thread(target=lambda: results.append(_move(client)))
        other.start()
        other.join(timeout=10)
    assert results[0].status_code == 409
    assert results[0].json()["detail"] == gateway._busy_message()
    assert lemonade.calls == []


def test_a_pc_gateway_is_checked_before_the_lock_is_taken(
    client, lemonade, bound_gateway, monkeypatch
):
    """A slow check of the PC's gateway never holds up another process's replay."""
    monkeypatch.setattr(gateway, "GATEWAY_KEY_LOCK_TIMEOUT", 0.2)
    monkeypatch.setattr(providers, "_gateway_check_applies", lambda: True)
    lemonade.answers[("POST", "cloud/auth")] = None
    took, checked = [], []

    def slow_check(base_url=None):
        def replay():
            try:
                with providers._gateway_move_lock:
                    took.append(True)
            except gateway.GatewayBusy:
                took.append(False)

        checked.append(base_url)
        other = threading.Thread(target=replay)
        other.start()
        other.join(timeout=5)

    monkeypatch.setattr(providers, "check_gateway_reachable", slow_check)
    resp = _move(client)
    assert took == [True]
    assert checked == [NEW_URL]
    assert resp.status_code == 200, resp.text
    assert lemonade.cloud["amd"]["base_url"] == NEW_URL


def test_a_pc_gateway_moved_during_its_check_is_refused(
    client, lemonade, bound_gateway, monkeypatch
):
    monkeypatch.setattr(providers, "_gateway_check_applies", lambda: True)

    def moved_meanwhile(base_url=None):
        lemonade.cloud["amd"]["base_url"] = NEW_URL

    monkeypatch.setattr(providers, "check_gateway_reachable", moved_meanwhile)
    resp = client.post("/api/providers/amd/connect", json={})
    assert resp.status_code == 409
    assert "changed while GAIA checked it" in resp.json()["detail"]
    assert not any(c["method"] in ("POST", "DELETE") for c in lemonade.calls)


def test_a_keyless_pc_move_drops_lemonades_key_before_the_address_changes(
    client, lemonade, bound_gateway
):
    del bound_gateway[gateway.GATEWAY_KEY_SLOT]
    client.post("/api/providers/amd/connect", json={"base_url": NEW_URL})
    sent = [(c["method"], c["path"]) for c in lemonade.calls]
    assert sent.index(("DELETE", "cloud/auth/amd")) < sent.index(("POST", "install"))
    installed = [c for c in lemonade.calls if c["path"] == "install"]
    assert installed[0]["json"]["base_url"] == NEW_URL
    assert installed[0]["gateway"] == OLD_URL
    assert not any(
        c["path"] == "cloud/auth" and c["method"] == "POST" for c in lemonade.calls
    )


def test_a_key_saved_before_bindings_is_bound_to_the_current_gateway(
    client, lemonade, bound_gateway
):
    del bound_gateway[gateway.GATEWAY_KEY_SLOT]
    bound_gateway[gateway.GATEWAY_SECRET_NAME] = OLD_KEY
    lemonade.cloud["amd"].update(runtime_key_set=False, models_discovered=False)
    listed = {p["id"]: p for p in client.get("/api/providers").json()["providers"]}
    assert listed["amd"].get("error") is None
    assert _stored(bound_gateway) == {"key": OLD_KEY, "base_url": OLD_URL}
    assert [c["json"]["api_key"] for c in _keys_went_only_home(lemonade)] == [OLD_KEY]


def test_a_paired_device_may_enter_and_remove_a_key(
    device_client, lemonade, keys, caplog
):
    with caplog.at_level(logging.DEBUG):
        resp = device_client.post(
            "/api/providers/fireworks/connect", json={"api_key": KEY}
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["remembered"] is True
        assert lemonade.call("POST", "cloud/auth")["json"]["api_key"] == KEY
        assert keys["stored"]["fireworks"] == KEY
        assert KEY not in resp.text

        resp = device_client.delete("/api/providers/fireworks/key")
        assert resp.json() == {"removed": True}
        assert device_client.post("/api/providers/key-store/retry").status_code == 200
    assert KEY not in caplog.text


def test_a_device_key_change_is_recorded_without_the_key(
    device_client, client, db, lemonade, keys
):
    assert (
        client.post(
            "/api/providers/fireworks/connect", json={"api_key": KEY}
        ).status_code
        == 200
    )
    assert db.device_changes("phone-1", 20) == ([], 0)

    resp = device_client.post("/api/providers/fireworks/connect", json={"api_key": KEY})
    assert resp.status_code == 200, resp.text
    assert device_client.delete("/api/providers/fireworks/key").status_code == 200

    changes, total = db.device_changes("phone-1", 20)
    assert total == 2
    assert [(c["kind"], c["params"]) for c in changes] == [
        (
            "providerKeyRemoved",
            {"provider": "Fireworks AI", "provider_id": "fireworks"},
        ),
        ("providerKeySet", {"provider": "Fireworks AI", "provider_id": "fireworks"}),
    ]
    rows = db._conn.execute("SELECT * FROM device_changes").fetchall()
    assert KEY not in json.dumps([dict(r) for r in rows])


def test_a_paired_device_sees_no_key_or_pc_internals_on_failure(
    client, device_client, lemonade, keys, monkeypatch, caplog
):
    def remember_key(provider, key, base_url=None):
        try:
            raise ConnectorsError(f"Keyring set_password failed: {PC_PATH} {key}")
        except ConnectorsError as e:
            raise CloudKeyError(f"not kept ({e})") from e

    monkeypatch.setattr(cloud_keys, "remember_key", remember_key)
    keys["forget_error"] = ConnectorsError(f"Keyring delete failed: {PC_PATH}")
    with caplog.at_level(logging.DEBUG):
        resp = device_client.post(
            "/api/providers/fireworks/connect", json={"api_key": KEY}
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["remember_error"] == providers._AWAY_STORE_DETAIL
        gone = device_client.delete("/api/providers/fireworks/key")
        assert gone.status_code == 503
        assert gone.json()["detail"] == providers._AWAY_STORE_DETAIL
        # The PC keeps the detail it can act on, but never the key itself.
        on_pc = client.post("/api/providers/fireworks/connect", json={"api_key": KEY})
        assert PC_PATH in on_pc.json()["remember_error"]
    for text in (resp.text, gone.text, on_pc.text, caplog.text):
        assert KEY not in text
    assert PC_PATH not in resp.text + gone.text


# ── GET /api/providers/{p}/models ──────────────────────────────────────────

_CATALOG = [
    {"id": "Qwen3-4B-GGUF", "downloaded": True, "labels": ["tool-calling"]},
    {"id": "Llama-3-8B-GGUF", "downloaded": False, "labels": []},
    {"id": DEFAULT_MODEL_NAME, "downloaded": False, "labels": ["vision"]},
    {"id": "nomic-embed-GGUF", "downloaded": True, "labels": ["embeddings"]},
    {"id": "Whisper-Large", "downloaded": True, "labels": ["transcription"]},
    {"id": "Whisper-RT", "downloaded": True, "labels": ["realtime-transcription"]},
    {"id": "SDXL-Turbo", "downloaded": True, "labels": ["image"]},
    {"id": "bge-reranker", "downloaded": True, "labels": ["Reranker"]},
    {"id": "fireworks.zz-model", "recipe": "cloud", "labels": []},
    {
        "id": "fireworks.accounts/fireworks/models/deepseek-v4p1-flash",
        "recipe": "cloud",
        "labels": [],
    },
    {"id": "fireworks.glm-5p3-flash", "cloud_provider": "fireworks", "labels": []},
    {"id": "fireworks.aa-model", "recipe": "cloud", "labels": []},
    {"id": "fireworks.embed", "recipe": "cloud", "labels": ["embedding"]},
    {"id": "amd.gpt-oss", "recipe": "cloud", "labels": [], "downloaded": True},
]


def test_cloud_models_show_the_providers_window_not_lemonades_4096(client, lemonade):
    # Lemonade v2026.42.1: a cloud model it has "loaded" lists context_length 4096.
    lemonade.models = [
        {
            "id": "fireworks.deepseek-v4p1-flash",
            "recipe": "cloud",
            "labels": [],
            "context_length": 4096,
            "max_context_window": 1048576,
        },
        {
            "id": "fireworks.glm-5p3-flash",
            "recipe": "cloud",
            "labels": [],
            "context_length": 1048576,
            "max_context_window": 1048576,
        },
    ]
    models = client.get("/api/providers/fireworks/models").json()["models"]
    assert {m["id"]: m["context_length"] for m in models} == {
        "fireworks.deepseek-v4p1-flash": 1048576,
        "fireworks.glm-5p3-flash": 1048576,
    }


def test_local_models_show_their_configured_window(client, lemonade):
    lemonade.models = [
        {
            "id": "Qwen3-4B-GGUF",
            "downloaded": True,
            "labels": [],
            "recipe": "llamacpp",
            "context_length": 65536,
            "max_context_window": 262144,
        }
    ]
    models = client.get("/api/providers/local/models").json()["models"]
    (row,) = [m for m in models if m["id"] == "Qwen3-4B-GGUF"]
    assert row["context_length"] == 65536


def test_local_models_are_downloaded_chat_models_plus_the_default(client, lemonade):
    lemonade.models = _CATALOG
    resp = client.get("/api/providers/local/models")
    assert resp.status_code == 200
    ids = [m["id"] for m in resp.json()["models"]]
    assert sorted(ids) == sorted([DEFAULT_MODEL_NAME, "Qwen3-4B-GGUF"])
    by_id = {m["id"]: m for m in resp.json()["models"]}
    assert by_id[DEFAULT_MODEL_NAME]["downloaded"] is False
    assert by_id["Qwen3-4B-GGUF"]["rank"] is None


# Lemonade lists the built-in 120B; the 20B is a custom model it does not list
# until a pull registers it.
_GPT_OSS = [
    {"id": "gpt-oss-120b-mxfp-GGUF", "downloaded": False, "labels": ["reasoning"]},
]
_STRIX_128 = {
    "Physical Memory": "128 GB",
    "devices": {"amd_gpu": [{"available": True, "integrated": True, "vram_gb": 96.0}]},
    "model_storage": {"free_bytes": 900e9},
}
_GPU_24 = {
    "Physical Memory": "64 GB",
    "devices": {"amd_gpu": [{"available": True, "integrated": False, "vram_gb": 24.0}]},
    "model_storage": {"free_bytes": 900e9},
}


@pytest.mark.parametrize(
    "info,offered",
    [
        (_STRIX_128, {"user.ggml-gpt-oss-20b-MXFP4-GGUF", "gpt-oss-120b-mxfp-GGUF"}),
        (_GPU_24, {"user.ggml-gpt-oss-20b-MXFP4-GGUF"}),
        # Memory unknown: nothing that might not fit is offered.
        ({"devices": {}}, set()),
    ],
)
def test_gpt_oss_is_offered_for_download_only_where_it_fits(
    client, lemonade, info, offered
):
    lemonade.models = _CATALOG + _GPT_OSS
    lemonade.answers[("GET", "system-info")] = (200, info)
    models = client.get("/api/providers/local/models").json()["models"]
    shown = {m["id"] for m in models if "gpt-oss" in m["id"]}
    assert shown == offered
    assert all(not m["downloaded"] for m in models if m["id"] in offered)


def test_registered_gpt_oss_is_listed_once_under_lemonades_id(client, lemonade):
    lemonade.models = [
        {"id": "ggml-gpt-oss-20b-MXFP4-GGUF", "downloaded": False, "labels": []}
    ]
    lemonade.answers[("GET", "system-info")] = (200, _STRIX_128)
    ids = [m["id"] for m in client.get("/api/providers/local/models").json()["models"]]
    assert [i for i in ids if "oss-20b" in i] == ["ggml-gpt-oss-20b-MXFP4-GGUF"]


def test_a_builtin_this_lemonade_does_not_list_is_not_offered(client, lemonade):
    lemonade.models = []
    lemonade.answers[("GET", "system-info")] = (200, _STRIX_128)
    ids = [m["id"] for m in client.get("/api/providers/local/models").json()["models"]]
    assert ids == ["user.ggml-gpt-oss-20b-MXFP4-GGUF"]


def test_unregistered_gpt_oss_carries_its_size_and_recipe(client, lemonade):
    lemonade.models = []
    lemonade.answers[("GET", "system-info")] = (200, _STRIX_128)
    (row,) = client.get("/api/providers/local/models").json()["models"]
    assert row["id"] == "user.ggml-gpt-oss-20b-MXFP4-GGUF"
    assert (row["recipe"], row["size_gb"], row["fits"]) == ("llamacpp", 12.1, True)
    assert row["state"] == "not_downloaded"


def test_active_does_not_size_optional_models(client, lemonade):
    lemonade.answers[("GET", "system-info")] = (200, _STRIX_128)
    client.get("/api/providers/active")
    assert "system-info" not in lemonade.paths()


def test_downloaded_gpt_oss_lists_even_when_memory_is_unknown(client, lemonade):
    lemonade.models = [{**_GPT_OSS[0], "downloaded": True}]
    lemonade.answers[("GET", "system-info")] = (200, {"devices": {}})
    ids = [m["id"] for m in client.get("/api/providers/local/models").json()["models"]]
    assert "gpt-oss-120b-mxfp-GGUF" in ids


_NPU_SYSTEM_INFO = {
    "Physical Memory": "32.00 GB",
    "devices": {"amd_npu": {"available": True}},
    "recipes": {"flm": {"backends": {"npu": {"state": "installable"}}}},
}


def test_a_cold_npu_pc_is_offered_gemma_before_lemonade_lists_any_flm_model(
    client, lemonade
):
    lemonade.models = [{"id": "Gemma-4-E4B-it-GGUF", "downloaded": True}]
    lemonade.answers[("GET", "system-info")] = (200, _NPU_SYSTEM_INFO)
    models = client.get("/api/providers/local/models").json()["models"]
    rows = {m["id"]: m for m in models}
    assert rows["gemma4-it-e4b-FLM"]["recipe"] == "flm"
    assert rows["gemma4-it-e4b-FLM"]["size_gb"] == 9.1
    assert rows["gemma4-it-e4b-FLM"]["display_name"] == "Gemma 4 E4B NPU"
    assert rows["gemma4-it-e4b-FLM"]["state"] == "not_downloaded"


def test_a_pc_without_an_npu_is_not_offered_flm_models(client, lemonade):
    lemonade.models = [{"id": "Gemma-4-E4B-it-GGUF", "downloaded": True}]
    lemonade.answers[("GET", "system-info")] = (
        200,
        {"Physical Memory": "32.00 GB", "devices": {}},
    )
    ids = [m["id"] for m in client.get("/api/providers/local/models").json()["models"]]
    assert not [i for i in ids if i.endswith("-FLM")]


def test_a_listed_flm_model_is_not_shown_twice(client, lemonade):
    lemonade.models = [
        {
            "id": "gemma4-it-e4b-FLM",
            "downloaded": True,
            "labels": ["chat"],
            "recipe": "flm",
        }
    ]
    lemonade.answers[("GET", "system-info")] = (200, _NPU_SYSTEM_INFO)
    ids = [m["id"] for m in client.get("/api/providers/local/models").json()["models"]]
    assert ids.count("gemma4-it-e4b-FLM") == 1


def test_a_single_turn_flm_build_is_no_chat_model(client, lemonade):
    lemonade.models = [
        {
            "id": "gemma4e-flash-e4b-FLM",
            "downloaded": True,
            "labels": ["chat", "single-turn"],
        }
    ]
    ids = [m["id"] for m in client.get("/api/providers/local/models").json()["models"]]
    assert "gemma4e-flash-e4b-FLM" not in ids


_UNPROVEN_FLM = ("gemma4-it-e2b-FLM", "lfm2-1.2b-FLM", "qwen3.5-4b-FLM")


def _flm_on_disk(*ids):
    return [
        {"id": i, "downloaded": True, "labels": ["chat"], "recipe": "flm"} for i in ids
    ]


def test_downloaded_npu_models_gaia_has_not_proven_are_not_offered(client, lemonade):
    """#7975: every FLM build on the PC was offered as Ready."""
    lemonade.models = _flm_on_disk("gemma4-it-e4b-FLM", *_UNPROVEN_FLM)
    lemonade.answers[("GET", "system-info")] = (200, _NPU_SYSTEM_INFO)
    ids = [m["id"] for m in client.get("/api/providers/local/models").json()["models"]]
    assert "gemma4-it-e4b-FLM" in ids
    for unproven in _UNPROVEN_FLM:
        assert unproven not in ids
    refused = client.post("/api/providers/select", json={"model": "lfm2-1.2b-FLM"})
    assert refused.status_code == 409


def test_an_unproven_npu_model_the_user_already_chose_still_lists(client, lemonade):
    """A choice saved before it was withdrawn still loads."""
    _write_config({"last_model": "lfm2-1.2b-FLM", "default_model": "qwen3.5-4b-FLM"})
    lemonade.models = _flm_on_disk(*_UNPROVEN_FLM)
    lemonade.answers[("GET", "system-info")] = (200, _NPU_SYSTEM_INFO)
    ids = [m["id"] for m in client.get("/api/providers/local/models").json()["models"]]
    assert "lfm2-1.2b-FLM" in ids
    assert "qwen3.5-4b-FLM" in ids
    assert "gemma4-it-e2b-FLM" not in ids


def test_local_models_keep_chat_models_that_also_take_audio(client, lemonade):
    lemonade.models = [
        {"id": "gemma4-it-e4b-FLM", "downloaded": True, "labels": ["chat", "audio"]},
        {"id": "audio-only-FLM", "downloaded": True, "labels": ["audio"]},
        {
            "id": "Whisper-Large-v3-Turbo",
            "downloaded": True,
            "labels": ["Audio", "Transcription"],
        },
        {"id": "nomic-embed-text", "downloaded": True, "labels": ["embeddings"]},
        {"id": "kokoro-v1", "downloaded": True, "labels": ["tts"]},
    ]
    ids = [m["id"] for m in client.get("/api/providers/local/models").json()["models"]]
    assert "gemma4-it-e4b-FLM" in ids
    for non_chat in (
        "audio-only-FLM",
        "Whisper-Large-v3-Turbo",
        "nomic-embed-text",
        "kokoro-v1",
    ):
        assert non_chat not in ids


def test_cloud_models_are_prefixed_and_ranked_first(client, lemonade):
    lemonade.models = _CATALOG
    models = client.get("/api/providers/fireworks/models").json()["models"]
    assert [m["id"] for m in models] == [
        "fireworks.accounts/fireworks/models/deepseek-v4p1-flash",
        "fireworks.glm-5p3-flash",
        "fireworks.aa-model",
        "fireworks.zz-model",
    ]
    top = models[0]
    assert (top["rank"], top["note"]) == (1, "best overall, fastest")
    assert top["evidence"] == RECOMMENDED_MODELS[0].evidence
    assert top["downloaded"] is True
    assert models[1]["rank"] == 2
    assert models[2]["note"] is None and models[2]["evidence"] is None


def test_amd_models_only(client, lemonade):
    lemonade.models = _CATALOG
    models = client.get("/api/providers/amd/models").json()["models"]
    assert [m["id"] for m in models] == ["amd.gpt-oss"]


def test_amd_models_rank_the_gateway_preference_first(client, lemonade):
    lemonade.models = [
        {"id": f"amd.{name}", "recipe": "cloud", "labels": ["cloud", "chat"]}
        for name in ("Claude-Haiku-4.5", "Gemma-4-31B", "DeepSeek-V4.1-Flash")
    ]
    models = client.get("/api/providers/amd/models").json()["models"]
    assert [(m["id"], m["rank"]) for m in models] == [
        ("amd.DeepSeek-V4.1-Flash", 1),
        ("amd.Gemma-4-31B", 2),
        ("amd.Claude-Haiku-4.5", None),
    ]
    assert models[0]["note"] == "recommended" and models[2]["note"] is None


def test_models_lemonade_error_is_502(client, lemonade):
    lemonade.answers[("GET", "models?show_all=true")] = (500, {})
    resp = client.get("/api/providers/fireworks/models")
    assert resp.status_code == 502


def test_models_unknown_provider_is_404(client, lemonade):
    assert client.get("/api/providers/nope/models").status_code == 404


# ── POST /api/providers/select ─────────────────────────────────────────────


def test_select_remembers_the_model_and_keeps_other_config(client, lemonade, keys, db):
    _write_config({"full_access": True, "written_by_tui": {"x": 1}})
    lemonade.models = _CATALOG
    resp = client.post("/api/providers/select", json={"model": "fireworks.aa-model"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["model"] == "fireworks.aa-model"
    assert resp.json()["is_default"] is False
    assert db.get_setting("custom_model") == "fireworks.aa-model"
    assert _config() == {
        "full_access": True,
        "written_by_tui": {"x": 1},
        "last_provider": "fireworks",
        "last_model": "fireworks.aa-model",
    }
    assert keys["ensure"] == ["fireworks"]


def test_select_local_model(client, lemonade, keys, db):
    lemonade.models = _CATALOG
    resp = client.post("/api/providers/select", json={"model": "Qwen3-4B-GGUF"})
    assert resp.status_code == 200
    assert _config()["last_provider"] == "local"
    assert keys["ensure"] == []


def test_picking_a_local_model_starts_loading_it(
    client, lemonade, keys, db, monkeypatch
):
    from gaia.ui import warmup

    asked = []
    monkeypatch.setattr(
        warmup,
        "request_warm_up",
        lambda reason, fresh=False, model=None: asked.append((fresh, model)),
    )
    lemonade.models = _CATALOG
    assert (
        client.post(
            "/api/providers/select", json={"model": "Qwen3-4B-GGUF"}
        ).status_code
        == 200
    )
    assert asked == [(True, "Qwen3-4B-GGUF")]


def test_picking_a_cloud_model_loads_nothing_here(
    client, lemonade, keys, db, monkeypatch
):
    from gaia.ui import warmup

    asked = []
    monkeypatch.setattr(
        warmup,
        "request_warm_up",
        lambda reason, fresh=False, model=None: asked.append(fresh),
    )
    lemonade.models = _CATALOG
    resp = client.post("/api/providers/select", json={"model": "fireworks.aa-model"})
    assert resp.status_code == 200, resp.text
    assert asked == []


def test_a_picked_npu_model_is_the_model_after_a_restart(client, lemonade, keys, db):
    npu = "gemma4-it-e4b-FLM"
    lemonade.models = [
        *_CATALOG,
        {"id": npu, "downloaded": True, "recipe": "flm", "labels": ["tool-calling"]},
    ]
    assert client.post("/api/providers/select", json={"model": npu}).status_code == 200
    # A restart: a new backend run, nothing chosen yet in it.
    providers.reset_restore_state()
    db.set_setting("custom_model", None)
    body = client.get("/api/providers/active").json()
    assert body["restore"]["status"] == "restored"
    assert body["model"] == npu
    assert db.get_setting("custom_model") == npu


_NPU = "gemma4-it-e4b-FLM"


@pytest.fixture
def npu_blocked(lemonade, monkeypatch):
    """Fedora with a Ryzen AI NPU whose locked-memory limit is still 8 MB."""
    monkeypatch.setattr(npu_linux, "_on_linux", lambda: True)
    monkeypatch.setattr(npu_linux, "problems", lambda: list(MEMLOCK))
    lemonade.models = [
        *_CATALOG,
        {"id": _NPU, "downloaded": True, "recipe": "flm", "labels": ["tool-calling"]},
    ]
    lemonade.answers[("GET", "system-info")] = (200, linux_system_info())
    return lemonade


def test_settings_lists_the_blocked_npu_model_as_unavailable(client, npu_blocked):
    models = client.get("/api/providers/local/models").json()["models"]
    row = next(m for m in models if m["id"] == _NPU)
    assert row["available"] is False
    assert "8 MB" in row["unavailable_reason"]


def test_select_refuses_a_model_settings_lists_as_unavailable(
    client, npu_blocked, keys, db
):
    """The Settings list said the NPU couldn't run; Use must not pick it anyway."""
    resp = client.post("/api/providers/select", json={"model": _NPU})
    assert resp.status_code == 409
    detail = resp.json()["detail"]
    assert "locked-memory limit" in detail and "8 MB" in detail
    assert db.get_setting("custom_model") is None
    assert not config_mod.GAIA_CONFIG_FILE.exists()


def test_restore_does_not_bring_back_a_model_that_cannot_run(
    client, npu_blocked, keys, db
):
    _write_config({"last_model": _NPU})
    body = client.get("/api/providers/active").json()
    assert body["restore"]["status"] == "failed"
    message = body["restore"]["message"]
    assert "locked-memory limit" in message and "8 MB" in message
    assert db.get_setting("custom_model") is None


def test_local_unavailable_reason_matches_the_settings_list(npu_blocked):
    assert "8 MB" in providers.local_unavailable_reason(_NPU)
    assert providers.local_unavailable_reason("Qwen3-4B-GGUF") is None


def test_a_loaded_npu_model_is_never_reported_unrunnable(npu_blocked):
    npu_blocked.answers[("GET", "health")] = (
        200,
        {"all_models_loaded": [{"model_name": _NPU, "recipe": "flm"}]},
    )
    assert providers.local_unavailable_reason(_NPU) is None


_QWEN_35B = "Qwen3.6-35B-A3B-GGUF"
_PC_16GB = {
    "Physical Memory": "16.00 GB",
    "devices": {},
    "model_storage": {"free_bytes": 900e9},
    "recipes": {
        "llamacpp": {"backends": {"vulkan": {"state": "installed"}}},
    },
}


@pytest.fixture
def qwen_on_16gb(lemonade):
    """Qwen3.6 35B downloaded on a 16 GB PC: it may not fit, but llama.cpp runs."""
    lemonade.models = [
        *_CATALOG,
        {"id": _QWEN_35B, "downloaded": True, "recipe": "llamacpp", "labels": []},
    ]
    lemonade.answers[("GET", "system-info")] = (200, _PC_16GB)
    return lemonade


def test_settings_still_flags_a_model_that_may_not_fit_in_memory(client, qwen_on_16gb):
    models = client.get("/api/providers/local/models").json()["models"]
    row = next(m for m in models if m["id"] == _QWEN_35B)
    assert row["fits"] is False
    assert "needs about" in row["unavailable_reason"]


def test_select_does_not_refuse_a_model_that_only_may_not_fit_in_memory(
    client, qwen_on_16gb, keys, db
):
    """A memory estimate is a caveat to accept, never a refusal."""
    resp = client.post("/api/providers/select", json={"model": _QWEN_35B})
    assert resp.status_code == 200, resp.text
    assert db.get_setting("custom_model") == _QWEN_35B
    assert _config()["last_model"] == _QWEN_35B


def test_restore_brings_back_a_model_that_only_may_not_fit_in_memory(
    client, qwen_on_16gb, keys, db
):
    _write_config({"last_model": _QWEN_35B})
    body = client.get("/api/providers/active").json()
    assert body["restore"]["status"] == "restored"
    assert db.get_setting("custom_model") == _QWEN_35B


def test_select_refuses_a_model_no_backend_here_can_run(client, qwen_on_16gb, keys, db):
    qwen_on_16gb.answers[("GET", "system-info")] = (
        200,
        {**_PC_16GB, "unavailable_recipes": ["llamacpp"]},
    )
    resp = client.post("/api/providers/select", json={"model": _QWEN_35B})
    assert resp.status_code == 409
    assert "cannot run llamacpp models" in resp.json()["detail"]
    assert db.get_setting("custom_model") is None


def test_an_npu_model_that_only_may_not_fit_is_not_refused(lemonade, monkeypatch):
    """A ready NPU with less RAM than the model's estimate: a caveat, not a refusal."""
    monkeypatch.setattr(npu_linux, "_on_linux", lambda: False)
    lemonade.models = [
        {"id": _NPU, "downloaded": True, "recipe": "flm", "labels": ["tool-calling"]}
    ]
    info = linux_system_info(flm_state="installed")
    info["Physical Memory"] = "4.00 GB"
    lemonade.answers[("GET", "system-info")] = (200, info)
    (row,) = [
        r
        for r in providers._annotate_local(
            providers._list_models(providers.LOCAL, offer_optional=False),
            preferred_backend=None,
            speeds={},
        )[0]
        if r["id"] == _NPU
    ]
    assert row["fits"] is False
    assert providers.local_unavailable_reason(_NPU) is None


def test_a_pc_without_an_npu_refuses_an_npu_model(lemonade):
    lemonade.models = [
        {"id": _NPU, "downloaded": True, "recipe": "flm", "labels": ["tool-calling"]}
    ]
    lemonade.answers[("GET", "system-info")] = (
        200,
        {**_PC_16GB, "unavailable_recipes": ["flm"]},
    )
    assert "cannot run flm models" in providers.local_unavailable_reason(_NPU)


def test_restore_waits_when_lemonade_answers_system_info_with_a_5xx(
    client, qwen_on_16gb, keys, db
):
    """A server error is not an answer about the model: ask again, don't fail."""
    _write_config({"last_model": _QWEN_35B})
    qwen_on_16gb.answers[("GET", "system-info")] = (500, {})
    body = client.get("/api/providers/active").json()
    assert body["restore"]["status"] == "pending"
    assert db.get_setting("custom_model") is None
    qwen_on_16gb.answers[("GET", "system-info")] = (200, _PC_16GB)
    assert client.get("/api/providers/active").json()["restore"]["status"] == (
        "restored"
    )


def test_restore_waits_when_lemonade_answers_the_model_list_with_a_5xx(
    client, lemonade, keys, db
):
    """A proxy in front of a stopped server answers 502; that isn't a verdict either."""
    model = "fireworks.accounts/fireworks/models/glm-5p3-flash"
    _write_config({"last_model": model})
    lemonade.models = _cloud_models()
    lemonade.answers[("GET", "models?show_all=true")] = (502, {})
    body = client.get("/api/providers/active").json()
    assert body["restore"] == {"status": "pending", "message": None}
    del lemonade.answers[("GET", "models?show_all=true")]
    assert client.get("/api/providers/active").json()["restore"]["status"] == (
        "restored"
    )


def test_select_supersedes_a_failed_restore_notice(client, lemonade, keys, db):
    _write_config({"last_model": "fireworks.gone-model"})
    lemonade.models = _CATALOG
    failed = client.get("/api/providers/active").json()["restore"]
    assert failed["status"] == "failed"

    assert (
        client.post("/api/providers/select", json={"model": "Qwen3-4B-GGUF"})
    ).status_code == 200
    after = client.get("/api/providers/active").json()
    assert after["restore"] == {"status": "none", "message": None}
    assert after["model"] == "Qwen3-4B-GGUF"


def test_a_refused_select_keeps_the_restore_notice(client, lemonade, keys, db):
    _write_config({"last_model": "fireworks.gone-model"})
    lemonade.models = _CATALOG
    client.get("/api/providers/active")
    client.post("/api/providers/select", json={"model": "Llama-3-8B-GGUF"})
    assert client.get("/api/providers/active").json()["restore"]["status"] == "failed"


def test_select_unavailable_model_is_409_and_changes_nothing(
    client, lemonade, keys, db
):
    lemonade.models = _CATALOG
    resp = client.post("/api/providers/select", json={"model": "Llama-3-8B-GGUF"})
    assert resp.status_code == 409
    assert "Llama-3-8B-GGUF" in resp.json()["detail"]
    assert db.get_setting("custom_model") is None
    assert not config_mod.GAIA_CONFIG_FILE.exists()


def test_select_empty_model_is_422(client, lemonade, keys):
    assert client.post("/api/providers/select", json={"model": " "}).status_code == 422


def test_select_with_corrupt_config_is_500(client, lemonade, keys, db):
    config_mod.GAIA_CONFIG_FILE.write_text("{bad", encoding="utf-8")
    lemonade.models = _CATALOG
    resp = client.post("/api/providers/select", json={"model": "Qwen3-4B-GGUF"})
    assert resp.status_code == 500
    assert "not valid JSON" in resp.json()["detail"]
    assert db.get_setting("custom_model") is None


# ── helpers ────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "model_id,provider,label",
    [
        ("fireworks.glm-5p3-flash", "fireworks", "glm-5p3-flash · Fireworks AI"),
        ("amd.gpt-oss", "amd", "gpt-oss · AMD LLM Gateway"),
        ("Qwen3.5-35B-A3B-GGUF", "local", "Qwen3.5-35B-A3B-GGUF · local"),
    ],
)
def test_provider_of_and_label(model_id, provider, label):
    assert providers.provider_of(model_id) == provider
    assert providers.model_label(model_id) == label


def test_rank_matches_both_cloud_id_forms():
    assert rank("fireworks.accounts/fireworks/models/deepseek-v4p1-flash")[0] == 1
    assert rank("fireworks.deepseek-v4p1-flash")[0] == 1
    assert rank("amd.deepseek-v4p1-flash") is None
    assert rank("deepseek-v4p1-flash") is None


# ── Drift against the TUI ──────────────────────────────────────────────────

_GO_FIELD = re.compile(r'(\w+):\s*"((?:[^"\\]|\\.)*)"')


def _go_recommended_models():
    text = CLOUD_GO.read_text(encoding="utf-8")
    start = text.index("var RecommendedModels = []Recommendation{")
    end = text.index("\n}\n", start)
    body = text[start + len("var RecommendedModels = []Recommendation{") : end]
    entries = []
    for block in re.findall(r"\{([^{}]*)\}", body):
        fields = {k: json.loads(f'"{v}"') for k, v in _GO_FIELD.findall(block)}
        entries.append(
            (fields["ID"], fields.get("Note", ""), fields.get("Evidence", ""))
        )
    return entries


def test_recommended_models_match_the_tui():
    go = _go_recommended_models()
    assert go, f"parsed no RecommendedModels from {CLOUD_GO}"
    py = [(r.id, r.note, r.evidence) for r in RECOMMENDED_MODELS]
    assert py == go, (
        "gaia.llm.recommended_models.RECOMMENDED_MODELS drifted from "
        "RecommendedModels in tui/internal/lemonade/cloud.go; edit both together."
    )


# ── Remote Lemonade and a server still starting ────────────────────────────


def test_list_never_replays_a_stored_key_to_a_remote_lemonade(
    client, lemonade, keys, monkeypatch
):
    lemonade.cloud["fireworks"] = {"name": "fireworks"}
    keys["stored"]["fireworks"] = KEY
    monkeypatch.setattr(providers, "_base_url", lambda: "http://10.0.0.5:13305/api/v1")
    monkeypatch.setattr(providers, "_cloud_entry", lambda p: lemonade.cloud.get(p))
    fw = client.get("/api/providers").json()["providers"][1]
    assert keys["ensure"] == []
    assert "not on this PC" in fw["error"]


def test_restore_waits_for_a_starting_server_instead_of_failing(
    client, lemonade, keys, db
):
    _write_config({"last_model": DEFAULT_MODEL_NAME})
    lemonade.down = True
    first = client.get("/api/providers/active").json()
    assert first["restore"] == {"status": "pending", "message": None}

    lemonade.down = False
    lemonade.models = [{"id": DEFAULT_MODEL_NAME, "downloaded": True, "labels": []}]
    second = client.get("/api/providers/active").json()
    assert second["restore"]["status"] == "restored"
    assert db.get_setting("custom_model") == DEFAULT_MODEL_NAME
    # The default was going to run anyway, so there is nothing to announce.
    assert second["restore"]["message"] is None


def test_restoring_a_different_model_says_so(client, lemonade, keys, db):
    model = "fireworks.accounts/fireworks/models/glm-5p3-flash"
    _write_config({"last_model": model})
    lemonade.models = _cloud_models()
    body = client.get("/api/providers/active").json()
    assert body["restore"] == {
        "status": "restored",
        "message": "Restored your last model.",
    }


def test_restore_of_a_cloud_model_never_goes_to_a_remote_lemonade(
    client, lemonade, keys, db, monkeypatch
):
    _write_config({"last_model": "fireworks.glm-5p3-flash"})
    monkeypatch.setattr(providers, "_base_url", lambda: "http://10.0.0.5:13305/api/v1")
    # The keyless "is the default downloaded?" read is not what this test guards.
    monkeypatch.setattr(providers, "_local_downloaded", lambda view: None)
    body = client.get("/api/providers/active").json()
    assert body["restore"]["status"] == "failed"
    assert keys["ensure"] == []


def test_select_while_the_server_is_starting_is_503(client, lemonade, keys, db):
    lemonade.down = True
    resp = client.post("/api/providers/select", json={"model": DEFAULT_MODEL_NAME})
    assert resp.status_code == 503
    assert db.get_setting("custom_model") is None


# ── Models added from a Hugging Face link ─────────────────────────────────


CUSTOM_URL = "https://huggingface.co/unsloth/Tiny-GGUF?_sm_nck=1"


class _Web:
    def __init__(self, status, body=None, text=""):
        self.status_code, self._body, self.text = status, body, text

    def json(self):
        return self._body


@pytest.fixture
def hf_web(monkeypatch, tmp_path):
    state = {"repo": repo_payload()}

    def get(url, headers=None):
        if url.startswith("https://huggingface.co/api/models/"):
            return _Web(200, state["repo"])
        return _Web(200, text=ARCH_SOURCE)

    monkeypatch.setattr(cm, "_http_get", get)
    monkeypatch.setattr(cm, "_arch_cache_path", lambda tag: tmp_path / f"{tag}.json")
    return state


@pytest.fixture
def custom_config(monkeypatch, tmp_path):
    path = tmp_path / "config.json"
    monkeypatch.setattr(config_mod, "GAIA_CONFIG_FILE", path)
    return path


@pytest.fixture
def custom_server(lemonade):
    lemonade.answers[("GET", "system-info")] = (200, SYSTEM_INFO)
    return lemonade


def test_check_saves_nothing(client, custom_server, hf_web, custom_config):
    body = client.post(
        "/api/providers/local/custom/check", json={"url": CUSTOM_URL}
    ).json()
    assert body["ok"] and body["model_id"] == "user.Tiny-Q4_K_M-GGUF"
    assert not custom_config.exists()
    assert custom_server.paths("POST") == []


def test_check_reports_an_unsupported_architecture(
    client, custom_server, hf_web, custom_config
):
    hf_web["repo"] = repo_payload(arch="flint")
    body = client.post(
        "/api/providers/local/custom/check", json={"url": CUSTOM_URL}
    ).json()
    assert body["ok"] is False and "'flint'" in body["error"]


def test_add_then_listed_before_download_and_after(
    client, custom_server, hf_web, custom_config
):
    resp = client.post("/api/providers/local/custom", json={"url": CUSTOM_URL})
    assert resp.status_code == 200, resp.text
    assert resp.json()["model"]["id"] == "user.Tiny-Q4_K_M-GGUF"

    models = client.get("/api/providers/local/models").json()["models"]
    row = next(m for m in models if m["id"] == "user.Tiny-Q4_K_M-GGUF")
    assert row["custom"] is True and row["downloaded"] is False
    assert row["source_url"] == CUSTOM_URL
    assert row["display_name"] == "Tiny Q4_K_M" and row["size_gb"] == 3.2
    assert all(m["custom"] is False for m in models if m is not row)

    # Once downloaded, Lemonade lists it without the namespace.
    custom_server.models = [
        {
            "id": "Tiny-Q4_K_M-GGUF",
            "downloaded": True,
            "labels": [],
            "recipe": "llamacpp",
        }
    ]
    models = client.get("/api/providers/local/models").json()["models"]
    rows = [m for m in models if "Tiny" in m["id"]]
    assert len(rows) == 1 and rows[0]["downloaded"] and rows[0]["custom"]


def test_add_refused_is_422_with_the_reason(
    client, custom_server, hf_web, custom_config
):
    hf_web["repo"] = repo_payload(template="")
    resp = client.post("/api/providers/local/custom", json={"url": CUSTOM_URL})
    assert resp.status_code == 422 and "base model" in resp.json()["detail"]
    assert not custom_config.exists()


def test_add_twice_is_refused(client, custom_server, hf_web, custom_config):
    client.post("/api/providers/local/custom", json={"url": CUSTOM_URL})
    resp = client.post("/api/providers/local/custom", json={"url": CUSTOM_URL})
    assert resp.status_code == 422 and "already added" in resp.json()["detail"]


def test_remove_deletes_by_the_name_lemonade_lists(
    client, custom_server, hf_web, custom_config, db, monkeypatch
):
    from gaia.llm.lemonade_client import DEFAULT_MODEL_NAME
    from gaia.ui import warmup

    asked = []
    monkeypatch.setattr(
        warmup,
        "request_warm_up",
        lambda reason, fresh=False, model=None: asked.append((fresh, model)),
    )
    client.post("/api/providers/local/custom", json={"url": CUSTOM_URL})
    custom_server.models = [
        {"id": "Tiny-Q4_K_M-GGUF", "checkpoint": "someone/else:x.gguf"},
        {
            "id": "Tiny-Q4_K_M-GGUF",
            "checkpoint": "unsloth/Tiny-GGUF:Tiny-Q4_K_M.gguf",
            "downloaded": True,
        },
    ]
    custom_server.answers[("POST", "delete")] = (200, {"status": "success"})
    db.set_setting("custom_model", "user.Tiny-Q4_K_M-GGUF")

    resp = client.delete("/api/providers/local/custom/user.Tiny-Q4_K_M-GGUF")
    assert resp.status_code == 200, resp.text
    assert custom_server.call("POST", "delete")["json"] == {
        "model_name": "Tiny-Q4_K_M-GGUF"
    }
    assert cm.CONFIG_KEY not in json.loads(custom_config.read_text())
    assert db.get_setting("custom_model") is None
    # Chat is back on the default, which loads now rather than with a message.
    assert asked == [(True, DEFAULT_MODEL_NAME)]


def test_removing_the_custom_model_goes_back_to_the_pick_and_loads_it(
    client, custom_server, hf_web, custom_config, db, monkeypatch
):
    """Clearing the field returns to the pick; removing the model did not."""
    from gaia.ui import warmup
    from gaia.ui.routers.providers import PICKED_MODEL_SETTING

    asked = []
    monkeypatch.setattr(
        warmup,
        "request_warm_up",
        lambda reason, fresh=False, model=None: asked.append((fresh, model)),
    )
    client.post("/api/providers/local/custom", json={"url": CUSTOM_URL})
    db.set_setting(PICKED_MODEL_SETTING, "Qwen3-4B-GGUF")
    db.set_setting("custom_model", "user.Tiny-Q4_K_M-GGUF")

    resp = client.delete("/api/providers/local/custom/user.Tiny-Q4_K_M-GGUF")

    assert resp.status_code == 200, resp.text
    assert db.get_setting("custom_model") == "Qwen3-4B-GGUF"
    saved = json.loads(custom_config.read_text())
    assert saved["last_model"] == "Qwen3-4B-GGUF", "the next start restores the pick"
    assert asked == [(True, "Qwen3-4B-GGUF")]


def test_removing_a_model_that_runs_nowhere_loads_nothing(
    client, custom_server, hf_web, custom_config, db, monkeypatch
):
    from gaia.ui import warmup

    asked = []
    monkeypatch.setattr(
        warmup,
        "request_warm_up",
        lambda reason, fresh=False, model=None: asked.append(model),
    )
    client.post("/api/providers/local/custom", json={"url": CUSTOM_URL})
    db.set_setting("custom_model", "Qwen3-4B-GGUF")

    client.delete("/api/providers/local/custom/user.Tiny-Q4_K_M-GGUF")

    assert db.get_setting("custom_model") == "Qwen3-4B-GGUF"
    assert asked == []


def test_remove_before_download_skips_the_server_delete(
    client, custom_server, hf_web, custom_config
):
    client.post("/api/providers/local/custom", json={"url": CUSTOM_URL})
    resp = client.delete("/api/providers/local/custom/user.Tiny-Q4_K_M-GGUF")
    assert resp.status_code == 200
    assert "delete" not in custom_server.paths("POST")


def test_remove_failure_keeps_the_model(client, custom_server, hf_web, custom_config):
    client.post("/api/providers/local/custom", json={"url": CUSTOM_URL})
    custom_server.models = [
        {
            "id": "Tiny-Q4_K_M-GGUF",
            "checkpoint": "unsloth/Tiny-GGUF:Tiny-Q4_K_M.gguf",
            "downloaded": True,
        },
    ]
    custom_server.answers[("POST", "delete")] = (500, {"error": {"message": "in use"}})
    resp = client.delete("/api/providers/local/custom/user.Tiny-Q4_K_M-GGUF")
    assert resp.status_code == 502 and "in use" in resp.json()["detail"]
    assert cm.find_custom_model("user.Tiny-Q4_K_M-GGUF") is not None


def test_check_with_a_broken_saved_list_says_how_to_fix_it(
    client, custom_server, hf_web, custom_config
):
    custom_config.write_text(json.dumps({cm.CONFIG_KEY: [{"id": "nope"}]}))
    resp = client.post("/api/providers/local/custom/check", json={"url": CUSTOM_URL})
    assert resp.status_code == 500
    assert "delete the key" in resp.json()["detail"]


def test_remove_a_builtin_is_404(client, custom_server, custom_config):
    resp = client.delete("/api/providers/local/custom/Gemma-4-E4B-it-GGUF")
    assert resp.status_code == 404


def test_first_download_registers_under_the_user_name(
    custom_server, hf_web, custom_config, monkeypatch
):
    """The download stream sends checkpoint + recipe with the user. name (#1655)."""
    from gaia.llm.lemonade_client import find_model_requirement

    cm.add_custom_model(cm.inspect_link(CUSTOM_URL, system_info=SYSTEM_INFO))
    req = find_model_requirement("user.Tiny-Q4_K_M-GGUF")
    payload = {"model_name": req.model_id}
    payload.update({k: v for k, v in req.pull_kwargs().items() if v is not None})
    assert payload == {
        "model_name": "user.Tiny-Q4_K_M-GGUF",
        "checkpoint": "unsloth/Tiny-GGUF:Tiny-Q4_K_M.gguf",
        "recipe": "llamacpp",
        "mmproj": "mmproj-F16.gguf",
        "vision": True,
        "reasoning": True,
    }


# ── AMD gateway reachability (#5604) ───────────────────────────────────────


def _offline():
    from gaia.llm.gateway import GatewayUnreachable

    return GatewayUnreachable("llm-api.amd.com", "Name or service not known")


def _amd(body):
    return next(p for p in body["providers"] if p["id"] == "amd")


def test_list_says_a_reachable_gateway_has_a_network(client, lemonade, keys, reach):
    lemonade.cloud["amd"] = {"name": "amd", "base_url": "https://gw.example.test/v1"}
    amd = _amd(client.get("/api/providers").json())
    assert amd["network"] == {"reachable": True, "detail": None}
    assert reach["asked"] == ["https://gw.example.test/v1"]


def test_list_marks_an_unreachable_gateway_needs_vpn(client, lemonade, keys, reach):
    reach["error"] = _offline()
    amd = _amd(client.get("/api/providers").json())
    assert amd["network"]["reachable"] is False
    assert "It needs AMD's network or VPN" in amd["network"]["detail"]
    assert "No network" not in amd["network"]["detail"]
    assert "llm-api.amd.com" in amd["network"]["detail"]
    fireworks = next(
        p
        for p in client.get("/api/providers").json()["providers"]
        if p["id"] == "fireworks"
    )
    assert "network" not in fireworks


def test_list_checks_the_gateway_even_when_lemonade_is_down(
    client, lemonade, keys, reach
):
    lemonade.down = True
    reach["error"] = _offline()
    amd = _amd(client.get("/api/providers").json())
    assert amd["network"]["reachable"] is False


def test_connecting_an_unreachable_gateway_names_the_vpn_not_key(
    client, lemonade, keys, reach
):
    reach["error"] = _offline()
    resp = client.post("/api/providers/amd/connect", json={"api_key": KEY})
    assert resp.status_code == 503, resp.text
    detail = resp.json()["detail"]
    assert "It needs AMD's network or VPN. Connect to it" in detail
    assert "key" not in detail.lower()
    # Nothing was registered or sent: the key never left this machine.
    assert lemonade.paths("POST") == []
    assert keys["remembered"] == []


@pytest.mark.parametrize("setup", ["remote_lemonade", "proxy"])
def test_the_gateway_is_not_checked_where_a_dial_from_here_proves_nothing(
    client, lemonade, keys, reach, monkeypatch, setup
):
    """Lemonade sends the gateway's requests; a remote one, or a proxy, takes another path."""
    if setup == "remote_lemonade":
        monkeypatch.setattr(providers, "_is_local_url", lambda url: False)
    else:
        monkeypatch.setattr(
            "urllib.request.getproxies", lambda: {"https": "http://proxy.test:3128"}
        )
    reach["error"] = _offline()
    amd = _amd(client.get("/api/providers").json())
    assert amd["network"] == {"reachable": None, "detail": None}
    assert reach["asked"] == []
    if setup == "proxy":
        resp = client.post("/api/providers/amd/connect", json={"api_key": KEY})
        assert resp.status_code == 200, resp.text


def test_an_unreadable_lemonade_address_skips_the_gateway_check(
    client, lemonade, keys, reach, monkeypatch
):
    def unreadable():
        raise providers.ProviderError("LEMONADE_BASE_URL is not a URL", 503)

    monkeypatch.setattr(providers, "_base_url", unreadable)
    reach["error"] = _offline()
    amd = _amd(client.get("/api/providers").json())
    assert amd["network"] == {"reachable": None, "detail": None}


# ── Local only ─────────────────────────────────────────────────────────────


@pytest.fixture
def local_only_on(tmp_path, monkeypatch):
    from gaia.llm import local_only

    monkeypatch.setenv("GAIA_POLICY_FILE", str(tmp_path / "policy.json"))
    local_only.set_policy("local_ai_only")


@pytest.mark.parametrize("provider", ["fireworks", "amd"])
def test_connect_is_refused_under_local_only_before_any_lemonade_call(
    client, lemonade, keys, local_only_on, provider
):
    resp = client.post(f"/api/providers/{provider}/connect", json={"api_key": KEY})
    assert resp.status_code == 409
    assert "Local only is on" in resp.json()["detail"]
    assert lemonade.calls == []  # no install, no cloud/auth
    assert keys["remembered"] == []
    assert KEY not in resp.text


def test_cloud_provider_views_are_marked_and_do_not_list_models_under_local_only(
    client, lemonade, keys, local_only_on
):
    body = client.get("/api/providers").json()
    fireworks = next(p for p in body["providers"] if p["id"] == "fireworks")
    assert fireworks["blocked"] is True
    assert "Local only" in fireworks["blocked_reason"]
    models = client.get("/api/providers/fireworks/models").json()
    assert models == {
        "provider": "fireworks",
        "models": [],
        "blocked": True,
        "blocked_reason": "Local only is on; turn it off in Settings to use cloud models.",
    }
    assert lemonade.paths("GET") == ["system-info", "system-info"]
    assert keys["ensure"] == []


def test_local_only_provider_list_never_replays_a_saved_key(
    client, lemonade, keys, local_only_on
):
    keys["stored"]["fireworks"] = KEY

    body = client.get("/api/providers").json()

    fireworks = next(p for p in body["providers"] if p["id"] == "fireworks")
    assert fireworks["blocked"] is True
    assert keys["ensure"] == []
    assert "install" not in lemonade.paths("POST")
    assert "cloud/auth" not in lemonade.paths("POST")


def test_selecting_a_cloud_model_is_refused_under_local_only(
    client, lemonade, keys, db, local_only_on
):
    resp = client.post(
        "/api/providers/select", json={"model": "fireworks.glm-5p3-flash"}
    )
    assert resp.status_code == 409
    assert "Local only is on" in resp.json()["detail"]
    # The app names its own setting, never a command to run.
    assert "Settings > Privacy" in resp.json()["detail"]
    assert "gaia config" not in resp.json()["detail"]
    assert lemonade.paths("POST") == [] and lemonade.paths("DELETE") == []
    assert db.get_setting("custom_model") is None


def test_selecting_a_local_model_still_works_under_local_only(
    client, lemonade, keys, db, local_only_on
):
    lemonade.models = [_CUSTOM_LISTED]
    resp = client.post("/api/providers/select", json={"model": _CUSTOM})
    assert resp.status_code == 200, resp.json()
    assert db.get_setting("custom_model") == _CUSTOM


def test_restore_does_not_bring_back_a_cloud_model_under_local_only(
    client, lemonade, keys, db, local_only_on
):
    _write_config({"last_model": "fireworks.glm-5p3-flash"})
    body = client.get("/api/providers/active").json()
    assert body["restore"]["status"] == "failed", body["restore"]
    assert "Local only is on" in body["restore"]["message"]
    assert db.get_setting("custom_model") is None
    assert keys["ensure"] == []  # no key replay attempted for the cloud model


@pytest.fixture
def known_models_on(monkeypatch):
    """GAIA's server is serving known Fireworks models; record each way out."""
    from gaia.llm import fireworks_known_models as known

    left = []
    monkeypatch.setattr(providers, "_known_models_active", lambda p: p == "fireworks")
    monkeypatch.setattr(known, "stop_using_known_models", lambda _: left.append(1))
    return left


def test_forgetting_the_key_takes_it_out_of_the_server_start(
    client, lemonade, keys, known_models_on
):
    keys["stored"]["fireworks"] = KEY
    resp = client.delete("/api/providers/fireworks/key")
    assert resp.status_code == 200
    assert known_models_on == [1]
    assert "fireworks" not in keys["stored"]


def test_a_failed_restart_keeps_the_key_rather_than_half_forgetting(
    client, lemonade, keys, monkeypatch
):
    from gaia.llm import fireworks_known_models as known
    from gaia.llm.lemonade_embedded import EmbeddedLemonadeError

    def boom(_):
        raise EmbeddedLemonadeError("could not stop")

    monkeypatch.setattr(providers, "_known_models_active", lambda p: True)
    monkeypatch.setattr(known, "stop_using_known_models", boom)
    keys["stored"]["fireworks"] = KEY
    resp = client.delete("/api/providers/fireworks/key")
    assert resp.status_code == 503
    assert keys["stored"]["fireworks"] == KEY
    assert lemonade.paths("DELETE") == []


def test_a_new_key_during_known_models_restarts_without_the_old_one(
    client, lemonade, keys, model_list, known_models_on
):
    keys["stored"]["fireworks"] = "fw_old_key_0000000000"
    resp = client.post("/api/providers/fireworks/connect", json={"api_key": KEY})
    assert resp.status_code == 200
    assert known_models_on == [1]
    assert keys["stored"]["fireworks"] == KEY


@pytest.fixture
def serving_known(monkeypatch, lemonade, keys, model_list):
    """Fireworks served from known models on the stored OLD_KEY, mid list outage.

    Leaving the mode restarts Lemonade with no key and no registration; entering
    it starts Lemonade on the stored key, as ``start_env`` does.
    """
    from gaia.llm import fireworks_known_models as known

    state = {"active": True, "restarts": [], "handed": []}
    keys["stored"]["fireworks"] = OLD_KEY
    model_list["check"] = _list_failing()

    def serve():
        lemonade.cloud["fireworks"] = {
            "name": "fireworks",
            "env_var_set": bool(keys["stored"].get("fireworks")),
            "models_discovered": True,
        }

    def stop(_):
        state["restarts"].append("stop")
        state["active"] = False
        lemonade.cloud.pop("fireworks", None)

    def start(_):
        state["restarts"].append("start")
        state["active"] = True
        serve()

    def ensure_authenticated(provider, client=None, recall=None):
        state["handed"].append(recall())
        return True

    serve()
    monkeypatch.setattr(
        providers,
        "_known_models_active",
        lambda p: p == "fireworks" and state["active"],
    )
    monkeypatch.setattr(known, "stop_using_known_models", stop)
    monkeypatch.setattr(known, "use_known_models", start)
    monkeypatch.setattr(cloud_keys, "ensure_authenticated", ensure_authenticated)
    return state


@pytest.mark.parametrize(
    "auth,check,status,said",
    [
        ((401, {}), "FAILING", 422, "rejected the key"),
        ((200, {"models_discovered": False}), "REJECTED", 422, "did not accept"),
        ((200, {"models_discovered": False}), "FAILING", 503, "kept the one you had"),
    ],
    ids=["401", "no-models", "outage"],
)
def test_a_rejected_replace_in_known_models_mode_brings_it_back(
    client, lemonade, keys, model_list, serving_known, auth, check, status, said
):
    from gaia.llm.providers.fireworks import ModelListCheck, ModelListState

    model_list["check"] = ModelListCheck(ModelListState[check], "HTTP 500")
    lemonade.answers[("POST", "cloud/auth")] = auth
    resp = client.post("/api/providers/fireworks/connect", json={"api_key": KEY})
    assert resp.status_code == status
    assert said in resp.json()["detail"]
    assert _sequence(lemonade) == [
        ("GET", "system-info", None),
        ("POST", "install", FIREWORKS_INSTALL),
        _auth(KEY),
        ("DELETE", "cloud/auth/fireworks", None),
        ("GET", "system-info", None),
    ]
    assert serving_known["restarts"] == ["stop", "start"]
    assert serving_known["active"] is True
    assert serving_known["handed"] == [OLD_KEY]
    assert lemonade.cloud["fireworks"]["env_var_set"] is True
    assert keys["stored"]["fireworks"] == OLD_KEY and keys["remembered"] == []
    assert KEY not in resp.text and OLD_KEY not in resp.text
    assert _registered(client) is True


@pytest.mark.parametrize("fails", ["restart", "keyless"])
def test_a_failed_known_models_restore_is_a_loud_502(
    client, lemonade, keys, model_list, serving_known, monkeypatch, caplog, fails
):
    from gaia.llm import fireworks_known_models as known
    from gaia.llm.lemonade_embedded import EmbeddedLemonadeError

    if fails == "restart":

        def boom(_):
            raise EmbeddedLemonadeError("could not start the model server")

        monkeypatch.setattr(known, "use_known_models", boom)
    else:

        def keyless(_):
            lemonade.cloud["fireworks"] = {"name": "fireworks"}

        monkeypatch.setattr(known, "use_known_models", keyless)
    lemonade.answers[("POST", "cloud/auth")] = (401, {"error": {"message": KEY}})
    with caplog.at_level(logging.ERROR):
        resp = client.post("/api/providers/fireworks/connect", json={"api_key": KEY})
    assert resp.status_code == 502
    assert resp.json()["detail"] == (
        "Fireworks AI didn't accept the new key, and GAIA couldn't restore the "
        "old one. Enter a working key in Settings › Model."
    )
    assert "fireworks" in caplog.text
    assert "POST" not in [c["method"] for c in lemonade.calls[3:]]
    for key in (KEY, OLD_KEY):
        assert key not in resp.text and key not in caplog.text


@pytest.mark.parametrize(
    "fails,sequence",
    [
        ("install", [("POST", "install", FIREWORKS_INSTALL)]),
        (
            "auth-unreachable",
            [("POST", "install", FIREWORKS_INSTALL), _auth(KEY)],
        ),
    ],
)
def test_a_failed_setup_in_known_models_mode_brings_it_back(
    client, lemonade, keys, model_list, serving_known, fails, sequence
):
    if fails == "install":
        lemonade.answers[("POST", "install")] = (
            500,
            {"error": {"message": "disk full"}},
        )
        said = "Lemonade could not configure Fireworks AI: disk full."
    else:
        lemonade.answers[("POST", "cloud/auth")] = requests.ConnectionError("gone")
        said = "The local model server is not reachable"
    resp = client.post("/api/providers/fireworks/connect", json={"api_key": KEY})
    assert resp.status_code in (502, 503)
    assert said in resp.json()["detail"]
    assert "couldn't restore" not in resp.json()["detail"]
    assert _sequence(lemonade) == [
        ("GET", "system-info", None),
        *sequence,
        ("DELETE", "cloud/auth/fireworks", None),
        ("GET", "system-info", None),
    ]
    assert serving_known["restarts"] == ["stop", "start"]
    assert serving_known["active"] is True
    assert serving_known["handed"] == [OLD_KEY]
    assert lemonade.cloud["fireworks"]["env_var_set"] is True
    assert keys["stored"]["fireworks"] == OLD_KEY and keys["remembered"] == []
    assert KEY not in resp.text and OLD_KEY not in resp.text


def test_a_failed_restore_after_a_failed_setup_is_a_loud_502(
    client, lemonade, keys, model_list, serving_known, monkeypatch, caplog
):
    from gaia.llm import fireworks_known_models as known
    from gaia.llm.lemonade_embedded import EmbeddedLemonadeError

    def boom(_):
        raise EmbeddedLemonadeError("could not start the model server")

    monkeypatch.setattr(known, "use_known_models", boom)
    lemonade.answers[("POST", "install")] = (500, {"error": {"message": "disk full"}})
    with caplog.at_level(logging.DEBUG):
        resp = client.post("/api/providers/fireworks/connect", json={"api_key": KEY})
    assert resp.status_code == 502
    assert resp.json()["detail"] == (
        "Fireworks AI couldn't be set up, and GAIA couldn't restore the models it "
        "was using. Lemonade could not configure Fireworks AI: disk full. Connect "
        "Fireworks AI again in Settings › Model."
    )
    assert serving_known["restarts"] == ["stop"]
    assert "restore the known fireworks models" in caplog.text
    assert keys["stored"]["fireworks"] == OLD_KEY
    for key in (KEY, OLD_KEY):
        assert key not in resp.text and key not in caplog.text


def test_a_failed_install_outside_known_models_restarts_nothing(
    client, lemonade, keys, model_list, serving_known
):
    serving_known["active"] = False
    lemonade.answers[("POST", "install")] = (500, {"error": {"message": "disk full"}})
    resp = client.post("/api/providers/fireworks/connect", json={"api_key": KEY})
    assert resp.status_code == 502
    assert resp.json()["detail"] == (
        "Lemonade could not configure Fireworks AI: disk full."
    )
    assert _sequence(lemonade) == [
        ("GET", "system-info", None),
        ("POST", "install", FIREWORKS_INSTALL),
    ]
    assert serving_known["restarts"] == []
    assert serving_known["handed"] == []
    assert keys["stored"]["fireworks"] == OLD_KEY


def test_a_rejected_first_connect_outside_known_models_still_unregisters(
    client, lemonade, keys, model_list, serving_known
):
    serving_known["active"] = False
    lemonade.cloud.clear()
    keys["stored"].clear()
    lemonade.answers[("POST", "cloud/auth")] = (401, {})
    resp = client.post("/api/providers/fireworks/connect", json={"api_key": KEY})
    assert resp.status_code == 422
    assert _mutations(lemonade) == [
        ("POST", "install"),
        ("POST", "cloud/auth"),
        ("POST", "uninstall"),
    ]
    assert serving_known["restarts"] == []
    assert _registered(client) is False


def test_only_fireworks_falls_back_to_known_models(client, lemonade, keys, model_list):
    lemonade.answers[("POST", "cloud/auth")] = (200, {"models_discovered": False})
    model_list["check"] = _list_failing()
    resp = client.post(
        "/api/providers/amd/connect",
        json={"api_key": KEY, "base_url": "https://gw.example.com/v1"},
    )
    assert model_list["keys_checked"] == []
    assert model_list["restarts"] == []
    assert KEY not in resp.text


# ── A cloud model from a provider GAIA has no tab for ──────────────────────

_OTHER_CLOUD = "othercloud.big-model"
_OTHER_CLOUD_LISTED = {
    "id": _OTHER_CLOUD,
    "recipe": "cloud",
    "cloud_provider": "othercloud",
    "labels": ["tool-calling"],
}


@pytest.fixture
def forget_cloud_models():
    yield
    lemonade_client.record_cloud_models({"data": []})


def test_restore_accepts_a_cloud_model_only_the_model_server_lists(
    client, lemonade, keys, db, forget_cloud_models
):
    """Saved as Custom model ID with last_provider ``local``: no tab, still listed."""
    db.set_setting("custom_model", _OTHER_CLOUD)
    _write_config({"last_model": _OTHER_CLOUD, "last_provider": "local"})
    lemonade.models = [_OTHER_CLOUD_LISTED]
    body = client.get("/api/providers/active").json()
    assert body["restore"] == {"status": "restored", "message": None}
    assert db.get_setting("custom_model") == _OTHER_CLOUD
    assert keys["ensure"] == []  # no key of GAIA's own to replay for it


def test_restore_still_fails_for_an_unlisted_dotted_id(
    client, lemonade, keys, db, forget_cloud_models
):
    _write_config({"last_model": "othercloud.gone-model", "last_provider": "local"})
    lemonade.models = [_OTHER_CLOUD_LISTED]
    restore = client.get("/api/providers/active").json()["restore"]
    assert restore["status"] == "failed"
    assert "no longer listed" in restore["message"]


def test_restore_keeps_a_listed_cloud_model_off_under_local_only(
    client, lemonade, keys, db, local_only_on, forget_cloud_models
):
    _write_config({"last_model": _OTHER_CLOUD, "last_provider": "local"})
    lemonade.models = [_OTHER_CLOUD_LISTED]
    restore = client.get("/api/providers/active").json()["restore"]
    assert restore["status"] == "failed", restore
    assert "Local only is on" in restore["message"]
    assert db.get_setting("custom_model") is None


def test_selecting_a_listed_cloud_model_is_refused_under_local_only(
    client, lemonade, keys, db, local_only_on, forget_cloud_models
):
    lemonade.models = [_OTHER_CLOUD_LISTED]
    resp = client.post("/api/providers/select", json={"model": _OTHER_CLOUD})
    assert resp.status_code == 409
    detail = resp.json()["detail"]
    assert (
        "Can't switch to big-model · othercloud: Local only is on, so it was blocked: it is a cloud model."
        in detail
    )
    assert "Settings > Privacy" in detail and "gaia config" not in detail
    assert lemonade.paths() == ["models?show_all=true"]
    assert db.get_setting("custom_model") is None


# ── A router collection under Local only (#7525) ─────────────────────────

_ROUTER = "collection.x"
_ROUTER_LISTED = {"id": _ROUTER, "recipe": "collection.router", "labels": []}


@pytest.mark.parametrize("typed", ["collection.x", "COLLECTION.X", "user.collection.x"])
def test_selecting_a_router_collection_is_refused_under_local_only(
    client, lemonade, keys, db, local_only_on, forget_cloud_models, typed
):
    # A router collection can forward to a cloud member, so Local only can't
    # vouch for it, even though the model list never marks it "cloud".
    lemonade.models = [_ROUTER_LISTED]
    resp = client.post("/api/providers/select", json={"model": typed})
    assert resp.status_code == 409, resp.json()
    detail = resp.json()["detail"]
    assert "Local only is on" in detail
    assert (
        "it is a 'collection.router' model, which can forward requests to the cloud"
        in detail
    )
    assert "Settings > Privacy" in detail and "gaia config" not in detail
    assert db.get_setting("custom_model") is None


def test_selecting_an_unlisted_dotted_id_says_the_catalog_does_not_list_it(
    client, lemonade, keys, db, local_only_on, forget_cloud_models
):
    # A mistyped dotted id is not a privacy problem: the catalog simply
    # doesn't list it, so the refusal must say that instead of pointing
    # at the Local only setting.
    resp = client.post("/api/providers/select", json={"model": "user.mistyped-model"})
    assert resp.status_code == 409, resp.json()
    detail = resp.json()["detail"]
    assert "Lemonade's catalog doesn't list it" in detail
    assert db.get_setting("custom_model") is None


def test_local_only_refuses_an_id_it_cannot_classify_while_the_server_is_down(
    client, lemonade, keys, db, local_only_on, forget_cloud_models
):
    lemonade.down = True
    resp = client.post("/api/providers/select", json={"model": _OTHER_CLOUD})
    assert resp.status_code == 503
    assert "couldn't check that it isn't a cloud model" in resp.json()["detail"]
    assert db.get_setting("custom_model") is None


def test_local_only_key_refusal_names_the_app_setting(
    client, lemonade, keys, local_only_on
):
    resp = client.post("/api/providers/fireworks/connect", json={"api_key": KEY})
    assert "Settings > Privacy" in resp.json()["detail"]
    assert "gaia config" not in resp.json()["detail"]


@pytest.mark.parametrize(
    "typed",
    [
        "OtherCloud.big-model",
        "OTHERCLOUD.BIG-MODEL",
        "user.othercloud.big-model",
        "USER.OtherCloud.Big-Model",
    ],
)
def test_local_only_refuses_a_listed_cloud_model_typed_another_way(
    client, lemonade, keys, db, local_only_on, forget_cloud_models, typed
):
    # The model server matches names ignoring case and a user. prefix, so each
    # of these reaches the cloud model.
    lemonade.models = [_OTHER_CLOUD_LISTED]
    resp = client.post("/api/providers/select", json={"model": typed})
    assert resp.status_code == 409, resp.json()
    assert "Local only is on" in resp.json()["detail"]
    assert db.get_setting("custom_model") is None


@pytest.mark.parametrize("typed", ["AMD.big-model", "Fireworks.big-model"])
def test_local_only_refuses_a_known_gateway_typed_in_another_case(
    client, lemonade, keys, db, local_only_on, forget_cloud_models, typed
):
    listed = typed.lower()
    lemonade.models = [{"id": listed, "recipe": "cloud", "labels": []}]
    resp = client.post("/api/providers/select", json={"model": typed})
    assert resp.status_code == 409, resp.json()
    assert "Local only is on" in resp.json()["detail"]
    assert db.get_setting("custom_model") is None


def test_local_only_still_saves_a_local_model_whose_name_differs_only_in_case(
    client, lemonade, keys, db, local_only_on, forget_cloud_models
):
    lemonade.models = [
        _OTHER_CLOUD_LISTED,
        {"id": "my.local-model-GGUF", "recipe": "llamacpp", "downloaded": True},
    ]
    resp = client.post("/api/providers/select", json={"model": "My.Local-Model-GGUF"})
    assert "Local only" not in str(resp.json().get("detail", ""))


def test_local_only_names_a_next_step_when_the_model_list_errors(
    client, lemonade, keys, db, local_only_on, forget_cloud_models, monkeypatch
):
    from gaia.ui.routers import providers

    monkeypatch.setattr(providers, "_lemonade", lambda *a, **k: (500, {}))
    resp = client.post("/api/providers/select", json={"model": _OTHER_CLOUD})
    assert resp.status_code == 503
    detail = resp.json()["detail"]
    assert "model list" in detail
    assert "Check that the model server is running" in detail
    assert db.get_setting("custom_model") is None


# ── A model server that answers, but not with a model list ─────────────────


@pytest.mark.parametrize(
    "body",
    [{"object": "list", "data": "x"}, {"data": ["Qwen3-4B-GGUF"]}, {"data": None}],
)
@pytest.mark.parametrize("provider", ["local", "fireworks"])
def test_a_malformed_model_list_is_named_not_a_server_error(
    client, lemonade, keys, body, provider
):
    lemonade.answers[("GET", "models?show_all=true")] = (200, body)
    resp = client.get(f"/api/providers/{provider}/models")
    assert resp.status_code == 502
    detail = resp.json()["detail"]
    assert "model list came back in an unexpected shape" in detail
    assert "Settings > Advanced > Model server" in detail


def test_a_malformed_model_list_ends_a_switch_or_restore_with_one_full_stop(
    client, lemonade, keys, db
):
    _write_config({"last_model": "Qwen3-4B-GGUF"})
    lemonade.answers[("GET", "models?show_all=true")] = (200, {"data": "x"})
    restore = client.get("/api/providers/active").json()["restore"]
    assert restore["status"] == "failed"
    assert "points at Lemonade. Pick a model to continue." in restore["message"]
    resp = client.post("/api/providers/select", json={"model": "Qwen3-4B-GGUF"})
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"].endswith("points at Lemonade.")
    assert ".." not in restore["message"] + resp.json()["detail"]
