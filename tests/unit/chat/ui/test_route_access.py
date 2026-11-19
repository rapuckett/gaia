# Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT

"""Who may call each Agent UI route, decided by the listener a request reached.

Every route is in exactly one class, and ``test_every_route_is_classified``
fails for a route nobody has decided about:

* ``pc``: the PC running GAIA only (``require_local_pc``).
* ``pc_or_device``: first-run setup, connector sign-in, setup, checks, grants
  and activations, Automations, schedules and goals, the device list, the
  Discord bridge's controls, memory rebuilds and profile saves, switching
  back to GAIA's own Lemonade, the logs and the troubleshooting report; the
  PC or an allowed paired device, never mobile access (``require_pc_or_device``,
  ``require_pc_or_allowed_device``).
* ``not_on_listener``: a read with side effects on the PC; the PC and mobile
  access, never a paired device (``refuse_on_device_listener``).
* ``remote``: the PC, mobile access with its token, and allowed devices.
* ``web``: the web UI and the API docs, which the device listener never serves.
* ``pair``: the pairing redemption, only on the device listener, with no token.
* ``device``: an allowed paired device asking about itself.
* ``device_self``: a paired device unpairing itself, pending or allowed.
"""

from __future__ import annotations

import contextlib
import json
import logging
import re
import threading
import uuid

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from starlette.exceptions import HTTPException
from starlette.requests import Request
from starlette.routing import Mount

from gaia.config import GaiaConfig
from gaia.ui import security
from gaia.ui.devices.access import DeviceAccess
from gaia.ui.devices.listener import DeviceGate
from gaia.ui.security import (
    DEVICE_SCOPE_KEY,
    LAN_LISTENER,
    LISTENER_SCOPE_KEY,
    DevicePrincipal,
    ListenerScopeMiddleware,
)
from gaia.ui.server import create_app

pytestmark = pytest.mark.allow_network  # TestClient only; nothing leaves the machine

PC = ("127.0.0.1", 50000)

PC_ONLY = {
    "DELETE /api/agents/{agent_id}",
    "DELETE /api/devices/listener",
    "DELETE /api/devices/routes/{kind}",
    "GET /api/connectors/_debug",
    "GET /api/connectors/eval-mailbox",
    "POST /api/agents/install",
    "POST /api/connectors/eval-mailbox",
    "POST /api/devices/listener",
    "POST /api/devices/pairing",
    "POST /api/devices/pairing/reset",
    "POST /api/devices/routes/{kind}",
    "POST /api/devices/{device_id}/allow",
    "POST /api/eval/scripted-user",
    "POST /api/files/open",
    "POST /api/memory/admin/clear",
    "POST /api/memory/admin/seed",
    "POST /api/messaging/discord/connect",
    "POST /api/messaging/discord/disconnect",
    "POST /api/messaging/discord/pair",
    "POST /api/skills/link/add",
    "POST /api/tunnel/start",
    "POST /api/tunnel/stop",
    "POST /v1/connections/{provider}",
    "PUT /api/chat/permissions",
}

PC_OR_DEVICE = {
    "DELETE /api/automations/{ref}",
    "DELETE /api/connectors/_flows/{flow_id}",
    "DELETE /api/connectors/{connector_id}/activations/{agent_id:path}",
    "DELETE /api/devices/pairing",
    "DELETE /api/devices/{device_id}",
    "DELETE /api/goals/{goal_id}",
    "DELETE /api/providers/{provider}/key",
    "DELETE /api/schedules/{name:path}",
    "GET /api/automations",
    "GET /api/devices",
    "GET /api/devices/status",
    "GET /api/devices/{device_id}/changes",
    "GET /api/logs",
    "GET /api/logs/{source}",
    "GET /api/memory/stream-discovery",
    "GET /api/memory/stream-inference",
    "GET /api/messaging/discord",
    "GET /api/setup/report/{name}",
    "POST /api/automations/{ref}/{action}",
    "POST /api/connectors/flows/{flow_id}/complete",
    "POST /api/connectors/{connector_id}/authorize",
    "POST /api/connectors/{connector_id}/authorize-device",
    "POST /api/connectors/{connector_id}/configure",
    "POST /api/connectors/{connector_id}/enable",
    "POST /api/connectors/{connector_id}/test",
    "POST /api/goals",
    "POST /api/goals/store/reset",
    "POST /api/goals/{goal_id}/tasks",
    "POST /api/gpu-memory/apply",
    "POST /api/gpu-memory/revert",
    "POST /api/lemonade/target",
    "POST /api/memory/commit-discovery",
    "POST /api/memory/commit-inference",
    "POST /api/memory/refresh-system-context",
    "POST /api/memory/reinitialize",
    "POST /api/messaging/discord/forget-always",
    "POST /api/messaging/discord/restart",
    "POST /api/messaging/discord/start",
    "POST /api/messaging/discord/stop",
    "POST /api/providers/key-store/retry",
    "POST /api/schedules",
    "POST /api/schedules/{name:path}/run",
    "POST /api/setup/cancel",
    "POST /api/setup/chat-model",
    "POST /api/setup/models/download",
    "POST /api/setup/models/remove",
    "POST /api/setup/models/skip",
    "POST /api/setup/npu/memlock-fix",
    "POST /api/setup/npu/recheck",
    "POST /api/setup/report",
    "POST /api/setup/run",
    "POST /api/setup/vision-model",
    "POST /api/system/download-model",
    "PUT /api/connectors/{connector_id}/activations/{agent_id:path}",
    "PUT /api/connectors/{connector_id}/grants/{agent_id:path}",
    "PUT /api/goals/{goal_id}/approve",
    "PUT /api/goals/{goal_id}/cancel",
    "PUT /api/goals/{goal_id}/reject",
    "PUT /api/goals/{goal_id}/status",
    "PUT /api/goals/{goal_id}/tasks/{task_id}",
    "PUT /api/schedules/{name:path}",
    "PUT /api/system/model-server/backend",
}

NOT_ON_LISTENER = {
    "GET /api/providers",
}

PAIR = {"POST /api/devices/pair"}

DEVICE = {"GET /api/devices/me/routes"}

DEVICE_SELF = {"DELETE /api/devices/me"}

WEB = {
    "GET /docs",
    "GET /docs/oauth2-redirect",
    "GET /openapi.json",
    "GET /redoc",
    "GET /{full_path:spa_path}",
    "HEAD /docs",
    "HEAD /docs/oauth2-redirect",
    "HEAD /openapi.json",
    "HEAD /redoc",
}

# Some check fields inside the handler: a provider key (the PC or an allowed
# device) and its gateway fields (the PC only) in
# ``POST /api/providers/{provider}/connect``, and
# ``network_policy`` in ``PUT /api/settings``.
REMOTE = {
    "DELETE /api/chat/permissions/{session_id}/grants",
    "DELETE /api/connectors/{connector_id}",
    "DELETE /api/connectors/{connector_id}/grants/{agent_id:path}",
    "DELETE /api/documents/{doc_id}",
    "DELETE /api/gpu-memory/pending",
    "DELETE /api/memory/all",
    "DELETE /api/memory/knowledge/{knowledge_id}",
    "DELETE /api/providers/local/custom/{model_id}",
    "DELETE /api/sessions/{session_id}",
    "DELETE /api/sessions/{session_id}/documents/{doc_id}",
    "DELETE /api/sessions/{session_id}/messages/{message_id}",
    "DELETE /api/sessions/{session_id}/messages/{message_id}/and-below",
    "DELETE /api/skills/{name}",
    "DELETE /api/skills/{name}/preferences",
    "DELETE /v1/connections/{provider}",
    "GET /api/agents",
    "GET /api/agents/catalog",
    "GET /api/agents/{agent_id}/install-status",
    "GET /api/chat/active",
    "GET /api/chat/attach",
    "GET /api/chat/context/{session_id}",
    "GET /api/chat/followup/{session_id}",
    "GET /api/chat/performance/{session_id}",
    "GET /api/chat/permissions",
    "GET /api/chat/permissions/{session_id}",
    "GET /api/connectors",
    "GET /api/connectors/",
    "GET /api/connectors/agent-mcps",
    "GET /api/connectors/events",
    "GET /api/connectors/{connector_id}",
    "GET /api/connectors/{connector_id}/activations",
    "GET /api/connectors/{connector_id}/grants",
    "GET /api/documents",
    "GET /api/documents/{doc_id}/file",
    "GET /api/documents/{doc_id}/status",
    "GET /api/files/browse",
    "GET /api/files/image",
    "GET /api/files/preview",
    "GET /api/files/search",
    "GET /api/goals",
    "GET /api/goals/health",
    "GET /api/goals/pending-approval",
    "GET /api/goals/stats",
    "GET /api/goals/{goal_id}",
    "GET /api/gpu-memory",
    "GET /api/health",
    "GET /api/lemonade/detect",
    "GET /api/lemonade/target",
    "GET /api/mcp/servers",
    "GET /api/mcp/servers/{name}/tools",
    "GET /api/mcp/status",
    "GET /api/media/{kind}/{name}",
    "GET /api/memory/activity",
    "GET /api/memory/conversations",
    "GET /api/memory/conversations/search",
    "GET /api/memory/conversations/{session_id}",
    "GET /api/memory/embedding-coverage",
    "GET /api/memory/entities",
    "GET /api/memory/entities/{entity}",
    "GET /api/memory/knowledge",
    "GET /api/memory/knowledge/{knowledge_id}",
    "GET /api/memory/settings",
    "GET /api/memory/stats",
    "GET /api/memory/tools",
    "GET /api/memory/upcoming",
    "GET /api/onboarding/preflight",
    "GET /api/onboarding/start",
    "GET /api/providers/active",
    "GET /api/providers/list",
    "GET /api/providers/local/context",
    "GET /api/providers/local/status",
    "GET /api/providers/{provider}/models",
    "GET /api/schedules",
    "GET /api/schedules/{name:path}",
    "GET /api/schedules/{name:path}/results",
    "GET /api/sessions",
    "GET /api/sessions/events",
    "GET /api/sessions/search",
    "GET /api/sessions/{session_id}",
    "GET /api/sessions/{session_id}/capabilities",
    "GET /api/sessions/{session_id}/changes",
    "GET /api/sessions/{session_id}/changes/git",
    "GET /api/sessions/{session_id}/changes/total",
    "GET /api/sessions/{session_id}/changes/{turn_id}/diff",
    "GET /api/sessions/{session_id}/environment",
    "GET /api/sessions/{session_id}/export",
    "GET /api/sessions/{session_id}/messages",
    "GET /api/sessions/{session_id}/outputs",
    "GET /api/settings",
    "GET /api/settings/undo",
    "GET /api/setup/check",
    "GET /api/setup/needs/{job}",
    "GET /api/setup/plan",
    "GET /api/setup/status",
    "GET /api/skills",
    "GET /api/skills/featured",
    "GET /api/skills/preferences",
    "GET /api/skills/{name}/preferences",
    "GET /api/speech/model",
    "GET /api/speech/settings",
    "GET /api/spending",
    "GET /api/spending/chat/{session_id}",
    "GET /api/spending/prices/{provider}",
    "GET /api/system/model-server",
    "GET /api/system/resources",
    "GET /api/system/status",
    "GET /api/system/warm-up",
    "GET /api/system/work-in-progress",
    "GET /api/tunnel/status",
    "GET /v1/connections",
    "GET /v1/connections/",
    "GET /v1/connections/{provider}",
    "GET /v1/email/calendar/events",
    "GET /v1/email/health",
    "GET /v1/email/init",
    "GET /v1/email/version",
    "MOUNT /api/files/uploads",
    "PATCH /api/sessions/{session_id}/private",
    "POST /api/chat/cancel",
    "POST /api/chat/confirm-tool",
    "POST /api/chat/followup",
    "POST /api/chat/retry-with",
    "POST /api/chat/retry-with/choose",
    "POST /api/chat/send",
    "POST /api/chat/user-input",
    "POST /api/connectors/{connector_id}/disable",
    "POST /api/documents/index-folder",
    "POST /api/documents/upload",
    "POST /api/documents/upload-path",
    "POST /api/documents/{doc_id}/cancel",
    "POST /api/documents/{doc_id}/reindex",
    "POST /api/environment/folders/check",
    "POST /api/files/status",
    "POST /api/files/upload",
    "POST /api/files/upload-media",
    "POST /api/gpu-memory/pending",
    "POST /api/memory/consolidate",
    "POST /api/memory/knowledge",
    "POST /api/memory/prune",
    "POST /api/memory/rebuild-embeddings",
    "POST /api/memory/rebuild-fts",
    "POST /api/memory/reconcile",
    "POST /api/providers/local/custom",
    "POST /api/providers/local/custom/check",
    "POST /api/providers/local/restart",
    "POST /api/providers/select",
    "POST /api/providers/{provider}/connect",
    "POST /api/schedules/parse",
    "POST /api/sessions",
    "POST /api/sessions/{session_id}/activate",
    "POST /api/sessions/{session_id}/changes/git/commit",
    "POST /api/sessions/{session_id}/changes/git/pr",
    "POST /api/sessions/{session_id}/changes/undo",
    "POST /api/sessions/{session_id}/changes/{turn_id}/undo",
    "POST /api/sessions/{session_id}/documents",
    "POST /api/sessions/{session_id}/environment/folders",
    "POST /api/sessions/{session_id}/environment/folders/remove",
    "POST /api/sessions/{session_id}/read",
    "POST /api/skills/link/preview",
    "POST /api/speech",
    "POST /api/spending/allow-month",
    "POST /api/system/load-model",
    "POST /api/system/unload-model",
    "POST /api/system/warm-up",
    "POST /v1/email/archive",
    "POST /v1/email/calendar/events",
    "POST /v1/email/calendar/events/preview",
    "POST /v1/email/calendar/events/respond",
    "POST /v1/email/confirm",
    "POST /v1/email/draft",
    "POST /v1/email/init",
    "POST /v1/email/prescan",
    "POST /v1/email/quarantine",
    "POST /v1/email/search",
    "POST /v1/email/send",
    "POST /v1/email/triage",
    "POST /v1/email/triage/batch",
    "POST /v1/email/unarchive",
    "POST /v1/email/unquarantine",
    "PUT /api/chat/permissions/{session_id}",
    "PUT /api/memory/knowledge/{knowledge_id}",
    "PUT /api/memory/settings",
    "PUT /api/providers/local/context",
    "PUT /api/sessions/{session_id}",
    "PUT /api/sessions/{session_id}/environment/internet",
    "PUT /api/sessions/{session_id}/pin",
    "PUT /api/settings",
    "PUT /api/settings/undo",
    "PUT /api/skills/{name}/preferences",
    "PUT /api/speech/settings",
    "PUT /api/spending/limit",
}

EXPECTED = {
    **{r: "pc" for r in PC_ONLY},
    **{r: "pc_or_device" for r in PC_OR_DEVICE},
    **{r: "not_on_listener" for r in NOT_ON_LISTENER},
    **{r: "pair" for r in PAIR},
    **{r: "device" for r in DEVICE},
    **{r: "device_self" for r in DEVICE_SELF},
    **{r: "web" for r in WEB},
    **{r: "remote" for r in REMOTE},
}

#: Who each class lets in.
CALLERS = ("pc", "tunnel", "device", "pending", "no_token")
LETS_IN = {
    "pc": {"pc"},
    "pc_or_device": {"pc", "device"},
    "not_on_listener": {"pc", "tunnel"},
    "remote": {"pc", "tunnel", "device"},
    "web": {"pc", "tunnel"},
    "pair": {"device", "pending", "no_token"},
    "device": {"device"},
    "device_self": {"device", "pending"},
}
GUARDS = (
    security.require_local_pc,
    security.require_pc_or_device,
    security.require_pc_or_allowed_device,
    security.refuse_on_device_listener,
    security.require_device_listener,
    security.require_allowed_device,
    security.require_device,
)


def _routes(app):
    """``{"METHOD /path": route}`` for every route, through lazy includes."""
    found = {}

    def visit(routes):
        for route in routes:
            materialised = False
            for name in ("effective_candidates", "effective_low_priority_routes"):
                method = getattr(route, name, None)
                if callable(method):
                    visit(method())
                    materialised = True
            if materialised:
                continue
            if isinstance(route, Mount):
                found[f"MOUNT {route.path}"] = route
            elif isinstance(route, APIRoute) or hasattr(route, "original_route"):
                for method in route.methods:
                    found[f"{method} {route.path}"] = route
            elif hasattr(route, "routes"):
                visit(route.routes)
            else:
                for method in getattr(route, "methods", None) or ():
                    found[f"{method} {route.path}"] = route

    visit(app.routes)
    return found


def _guards(route):
    original = getattr(route, "original_route", route)
    dependant = getattr(original, "dependant", None)
    calls = {d.call for d in dependant.dependencies} if dependant else set()
    return [guard for guard in GUARDS if guard in calls]


def _access_class(key, route):
    if key.startswith("MOUNT "):
        return "remote"
    if not key.split(" ", 1)[1].startswith(("/api/", "/v1/")):
        return "web"
    guards = _guards(route)
    if security.require_local_pc in guards:
        return "pc"
    if (
        security.require_pc_or_device in guards
        or security.require_pc_or_allowed_device in guards
    ):
        return "pc_or_device"
    if security.refuse_on_device_listener in guards:
        return "not_on_listener"
    if security.require_device_listener in guards:
        return "pair"
    if security.require_allowed_device in guards:
        return "device"
    if security.require_device in guards:
        return "device_self"
    return "remote"


def _request_for(caller, device):
    scope = {"type": "http", "method": "GET", "path": "/", "headers": [], "client": PC}
    if caller == "tunnel":
        scope["headers"] = [(b"x-forwarded-for", b"203.0.113.7")]
    elif caller in ("device", "pending", "no_token"):
        scope[LISTENER_SCOPE_KEY] = LAN_LISTENER
        if caller != "no_token":
            scope[DEVICE_SCOPE_KEY] = DevicePrincipal(
                device.device_id, caller == "device"
            )
    return Request(scope)


def _request_path(key):
    method, path = key.split(" ", 1)
    if method == "MOUNT":
        return "GET", path + "/x"
    return method, re.sub(r"\{[^}]+\}", "x", path)


@pytest.fixture(scope="module")
def setup(tmp_path_factory):
    app = create_app(db_path=":memory:")
    access = DeviceAccess(app, folder=tmp_path_factory.mktemp("devices") / "devices")
    app.state.devices = access
    invite, _ = access.pairing.open()
    allowed = access.redeem(invite, "Phone", "ios", "192.168.1.20")
    access.allow(allowed["device_id"])
    invite, _ = access.pairing.open()
    pending = access.redeem(invite, "Tablet", "ipados", "192.168.1.21")

    class _Running:
        def poll(self):
            return None

    tunnel = app.state.tunnel
    tunnel._url, tunnel._token = "https://fake.ngrok-free.app", str(uuid.uuid4())
    tunnel._process = _Running()
    # From loopback, as a relay would come: on this listener it is still not the PC.
    listener = ListenerScopeMiddleware(DeviceGate(app, access, allow_loopback=True))
    clients = {
        "pc": TestClient(app, client=PC),
        "tunnel": TestClient(
            app,
            client=PC,
            headers={
                "X-Forwarded-For": "203.0.113.7",
                "Authorization": f"Bearer {tunnel._token}",
            },
        ),
        "device": TestClient(
            listener,
            client=PC,
            headers={"Authorization": f"Bearer {allowed['token']}"},
        ),
        "pending": TestClient(
            listener,
            client=PC,
            headers={"Authorization": f"Bearer {pending['token']}"},
        ),
        "no_token": TestClient(listener, client=PC),
    }
    return app, clients, DevicePrincipal(allowed["device_id"], True)


def test_every_route_is_classified(setup):
    """Each route's class, checked against every kind of caller.

    A refused caller is sent the request, which must be refused (401, 403 or
    404) before anything runs. A caller let in is checked against the route's
    guards without sending it, since the route would do its work.
    """
    app, clients, device = setup
    # On, so the device routes' own guards decide rather than the switch.
    GaiaConfig.save_key("device_pairing", True)
    routes = _routes(app)
    actual = {key: _access_class(key, route) for key, route in routes.items()}
    assert len(actual) > 200, "the route walk found too little to check"
    unclassified = sorted(set(actual) - set(EXPECTED))
    gone = sorted(set(EXPECTED) - set(actual))
    changed = sorted(
        f"{key}: {EXPECTED[key]} -> {actual[key]}"
        for key in set(actual) & set(EXPECTED)
        if actual[key] != EXPECTED[key]
    )
    assert not unclassified, f"decide who may call these routes: {unclassified}"
    assert not gone, f"these routes no longer exist: {gone}"
    assert not changed, f"these routes changed class: {changed}"

    wrong, sent, guarded = [], 0, 0
    for key, route in sorted(routes.items()):
        access_class = actual[key]
        method, path = _request_path(key)
        refusals = {404} if access_class in ("web", "pair") else {401, 403}
        if path.startswith("/api/devices"):
            # Reads are GETs; everything that changes state is POST or DELETE.
            assert method in ("GET", "POST", "DELETE"), key
        for caller in CALLERS:
            if caller in LETS_IN[access_class]:
                request = _request_for(caller, device)
                for guard in _guards(route):
                    guarded += 1
                    try:
                        guard(request)
                    except HTTPException as e:
                        wrong.append(f"{key}: {caller} refused ({e.status_code})")
                continue
            sent += 1
            status = clients[caller].request(method, path, json={}).status_code
            if status not in refusals:
                wrong.append(f"{key}: {caller} got {status}")
    assert not wrong, "\n".join(wrong)
    assert sent > 500 and guarded > 40, (sent, guarded)


def test_provider_key_refused_over_mobile_access(setup, monkeypatch):
    """A key is checked field by field inside a route mobile access may call."""
    from gaia.ui.routers import providers

    app, clients, _ = setup
    handed = []
    monkeypatch.setattr(providers, "_install", lambda *a, **k: handed.append(a))
    for caller in ("tunnel", "pending"):
        resp = clients[caller].post(
            "/api/providers/fireworks/connect", json={"api_key": "fw-secret-key"}
        )
        assert resp.status_code == 403, caller
        assert "fw-secret-key" not in resp.text
    assert handed == []


def test_an_allowed_device_may_enter_a_provider_key(setup, monkeypatch):
    """Through the real listener: the key reaches Lemonade, and only then is audited."""
    import logging

    from gaia.llm import cloud_keys
    from gaia.security import audit_logger
    from gaia.ui.routers import providers

    app, clients, device = setup
    sent, lines = [], []
    entry = {"name": "fireworks", "runtime_key_set": True, "models_discovered": True}

    def lemonade(method, path, payload=None):
        sent.append((method, path, payload))
        return 200, {"models_discovered": True}

    monkeypatch.setattr(providers, "_install", lambda *a, **k: None)
    monkeypatch.setattr(providers, "_uses_users_server", lambda: False)
    monkeypatch.setattr(providers, "_require_loopback", lambda *a: None)
    monkeypatch.setattr(providers, "_known_models_active", lambda *a: False)
    monkeypatch.setattr(providers, "_lemonade", lemonade)
    monkeypatch.setattr(providers, "_cloud_entry", lambda p: entry)
    monkeypatch.setattr(cloud_keys, "remember_key", lambda *a: None)

    class _Capture(logging.Handler):
        def emit(self, record):
            lines.append(record.getMessage())

    handler = _Capture()
    level = audit_logger.level
    audit_logger.addHandler(handler)
    audit_logger.setLevel(logging.INFO)
    try:
        resp = clients["device"].post(
            "/api/providers/fireworks/connect",
            json={"api_key": "fw-secret-key"},
            headers={"X-Gaia-UI": "1"},
        )
    finally:
        audit_logger.removeHandler(handler)
        audit_logger.setLevel(level)
    assert resp.status_code == 200, resp.text
    assert "fw-secret-key" not in resp.text
    assert sent == [
        ("POST", "cloud/auth", {"provider": "fireworks", "api_key": "fw-secret-key"})
    ]
    by = f"by {security.DEVICE_PRINCIPAL_PREFIX}{device.device_id}"
    assert [line.split(" | ")[1] for line in lines] == [
        "Fireworks AI API key submitted",
        "Fireworks AI API key accepted",
    ]
    assert all(by in line and "fw-secret-key" not in line for line in lines)


def test_provider_key_routing_refused_away_from_the_pc(setup, monkeypatch):
    """Moving the saved key's gateway or header is the PC's call, key or not."""
    from gaia.ui.routers import providers

    app, clients, _ = setup
    handed = []
    monkeypatch.setattr(providers, "_install", lambda *a, **k: handed.append(a))
    monkeypatch.setattr(providers, "_cloud_entry", lambda *a: handed.append(a))
    for caller in ("tunnel", "device"):
        for fields in (
            {"base_url": "https://attacker.example/v1"},
            {"auth_header_name": "X-Leak"},
            {"base_url": "https://attacker.example/v1", "auth_header_name": "X-Leak"},
        ):
            resp = clients[caller].post("/api/providers/amd/connect", json=fields)
            assert resp.status_code == 403, (caller, fields)
    assert handed == []


def test_a_paired_device_may_read_provider_summaries(setup, monkeypatch):
    from gaia.ui.routers import providers

    app, clients, _ = setup
    entry = {
        "name": "amd",
        "base_url": "https://gw.example/v1",
        "runtime_key_set": True,
        "models_discovered": True,
    }
    monkeypatch.setattr(
        providers, "_cloud_entry", lambda p: entry if p == "amd" else None
    )
    monkeypatch.setattr(
        providers, "_install", lambda *a, **k: pytest.fail("registered a provider")
    )
    monkeypatch.setattr(providers, "_gateway_check_applies", lambda: False)
    resp = clients["device"].get("/api/providers/list", headers={"X-Gaia-UI": "1"})
    assert resp.status_code == 200, resp.text
    listed = {p["id"]: p for p in resp.json()["providers"]}
    assert listed["amd"]["configured"] is True
    assert listed["fireworks"]["configured"] is False
    assert all(
        set(p)
        == {
            "id",
            "name",
            "remote",
            "privacy_notice",
            "configured",
            "blocked",
            "network",
            "key_source",
            "key_state",
            "key_hint",
            "known_models",
            "error",
            "env_var",
            "key_from_gaia_env",
        }
        for p in listed.values()
    )
    assert listed["amd"]["key_source"] == "lemonade"
    # Reachability only: the gateway's error text can name its address.
    assert listed["amd"]["network"] == {"reachable": None}
    assert "gw.example" not in resp.text


def test_refused_network_policy_saves_nothing(setup):
    """A settings change that includes the policy is all or nothing away from the PC."""
    app, clients, _ = setup
    before = clients["pc"].get("/api/settings").json()["agent_mode"]
    other = "manual" if before != "manual" else "goal_driven"
    for caller in ("tunnel", "device"):
        resp = clients[caller].put(
            "/api/settings",
            json={"agent_mode": other, "network_policy": "local_ai_only"},
        )
        assert resp.status_code == 403, caller
    assert clients["pc"].get("/api/settings").json()["agent_mode"] == before


UI = {"X-Gaia-UI": "1"}


@contextlib.contextmanager
def _captured_audit():
    from gaia.security import audit_logger

    lines = []

    class _Capture(logging.Handler):
        def emit(self, record):
            lines.append(record.getMessage())

    handler, level = _Capture(), audit_logger.level
    audit_logger.addHandler(handler)
    audit_logger.setLevel(logging.INFO)
    try:
        yield lines
    finally:
        audit_logger.removeHandler(handler)
        audit_logger.setLevel(level)


@pytest.mark.parametrize("caller", ["tunnel", "pending"])
@pytest.mark.parametrize(
    "method,path",
    [
        ("GET", "/api/logs"),
        ("GET", "/api/logs/gaia"),
        ("POST", "/api/setup/report"),
        ("GET", "/api/setup/report/diagnostics-20261112-101010.tgz"),
    ],
)
def test_logs_and_report_refuse_mobile_access_and_pending_devices(
    setup, caller, method, path
):
    app, clients, _ = setup
    assert clients[caller].request(method, path, headers=UI).status_code == 403


def test_an_allowed_device_reads_a_log_redacted_by_file_name(
    setup, tmp_path, monkeypatch
):
    from gaia.llm import lemonade_logs

    app, clients, _ = setup
    saved = "saved-" + "q" * 24
    shaped = "sk-" + "x" * 20
    log = tmp_path / "gaia.log"
    log.write_text(
        f"[2026-11-18 10:00:00,000] | INFO | gaia | a.py:1 | used {saved} and {shaped}\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("GAIA_LOG_FILE", str(log))
    monkeypatch.setattr(lemonade_logs, "known_secrets", lambda: ((saved,), None))

    listed = clients["device"].get("/api/logs", headers=UI)
    assert listed.status_code == 200, listed.text
    gaia = next(s for s in listed.json()["sources"] if s["id"] == "gaia")
    assert gaia["files"][0]["path"] == "gaia.log"
    read = clients["device"].get("/api/logs/gaia", headers=UI)
    assert read.status_code == 200, read.text
    body = read.json()
    assert body["log_path"] == "gaia.log"
    assert saved not in read.text and shaped not in read.text
    assert "[redacted]" in body["lines"][0]["text"]
    assert str(tmp_path) not in listed.text + read.text
    # The PC's own view still shows where the file is.
    assert clients["pc"].get("/api/logs/gaia", headers=UI).json()["log_path"] == str(
        log
    )


@pytest.mark.parametrize(
    "path",
    [
        "/api/logs/..%2Fconfig.json",
        "/api/logs/%2Fetc%2Fpasswd",
        "/api/logs/gaia?file=..%2F..%2Fconfig.json",
        "/api/logs/gaia?file=%2Fetc%2Fpasswd",
        "/api/logs/agent?file=..%2Fgaia.log",
    ],
)
def test_a_device_cannot_read_a_log_by_path(setup, path):
    app, clients, _ = setup
    assert clients["device"].get(path, headers=UI).status_code == 404


@pytest.mark.parametrize(
    "name", ["..%2Fconfig.json", "gaia.log", "%2Fetc%2Fpasswd", "diagnostics-1.tgz"]
)
def test_a_device_cannot_fetch_a_report_by_path(setup, name):
    from gaia.home import gaia_home

    app, clients, _ = setup
    home = gaia_home()
    home.mkdir(parents=True, exist_ok=True)
    (home / "gaia.log").write_text("not a report", encoding="utf-8")
    got = clients["device"].get(f"/api/setup/report/{name}", headers=UI)
    assert got.status_code == 404
    assert b"not a report" not in got.content


def test_one_report_at_a_time_from_any_caller(setup, monkeypatch):
    """Audited by device on write and download, and named without its place on the PC."""
    from gaia.home import gaia_home
    from gaia.ui.routers import setup as setup_router

    app, clients, device = setup
    name = "diagnostics-20261118-101010-0a1b2c3d.tgz"
    started, release = threading.Event(), threading.Event()

    def write_report(record):
        started.set()
        assert release.wait(10)
        out = gaia_home() / name
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(b"redacted bundle")
        return out

    monkeypatch.setattr(setup_router, "write_report", write_report)
    monkeypatch.setattr(setup_router, "build_plan", lambda: {})
    first = {}

    def make():
        first["resp"] = clients["device"].post("/api/setup/report", headers=UI)

    with _captured_audit() as lines:
        worker = threading.Thread(target=make)
        worker.start()
        try:
            assert started.wait(10)
            for caller in ("device", "pc"):
                second = clients[caller].post("/api/setup/report", headers=UI)
                assert second.status_code == 409, (caller, second.text)
        finally:
            release.set()
            worker.join(10)
    try:
        resp = first["resp"]
        assert resp.status_code == 200, resp.text
        assert resp.json()["path"] == name and resp.json()["name"] == name
        with _captured_audit() as fetched:
            got = clients["device"].get(f"/api/setup/report/{name}", headers=UI)
        assert got.status_code == 200 and got.content == b"redacted bundle"
        by = f"by {security.DEVICE_PRINCIPAL_PREFIX}{device.device_id}"
        assert [
            line for line in lines + fetched if "troubleshooting report" in line
        ] == [
            f"APPROVAL | troubleshooting report requested | {by}",
            f"APPROVAL | troubleshooting report {name} downloaded | {by}",
        ]
        # Done, so the next one may start.
        release.set()
        again = clients["device"].post("/api/setup/report", headers=UI)
        assert again.status_code == 200, again.text
    finally:
        (gaia_home() / name).unlink(missing_ok=True)


@pytest.mark.parametrize("into", ["key_value", "saved_secret"])
def test_a_cursor_inside_a_line_cannot_split_a_secret(
    setup, tmp_path, monkeypatch, into
):
    """A cursor that isn't at a line start reads the tail, redacting whole lines."""
    from gaia.llm import lemonade_logs

    app, clients, _ = setup
    saved = "saved-" + "q" * 24
    pair = "api_key=" + "v" * 24
    head = "[2026-11-18 10:00:00,000] | INFO | gaia | a.py:1 | "
    first, second = f"{head}start\n", f"{head}used {pair} and {saved}\n"
    log = tmp_path / "gaia.log"
    log.write_text(first + second, encoding="utf-8")
    monkeypatch.setenv("GAIA_LOG_FILE", str(log))
    monkeypatch.setattr(lemonade_logs, "known_secrets", lambda: ((saved,), None))
    if into == "key_value":
        cursor, hidden = len(first) + second.index("=") + 1, pair.split("=")[1]
    else:
        cursor, hidden = len(first) + second.index(saved) + 1, saved
    resp = clients["device"].get(
        "/api/logs/gaia", params={"after": str(cursor)}, headers=UI
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["reset"] is True
    assert hidden[1:] not in resp.text and hidden[4:12] not in resp.text


def test_a_device_never_follows_a_symlinked_log_or_report(setup, tmp_path, monkeypatch):
    from gaia.home import gaia_home

    app, clients, _ = setup
    outside = tmp_path / "outside.txt"
    outside.write_text("[2026-11-18] | INFO | x | not a log\n", encoding="utf-8")
    link = tmp_path / "gaia.log"
    link.symlink_to(outside)
    monkeypatch.setenv("GAIA_LOG_FILE", str(link))
    listed = clients["device"].get("/api/logs", headers=UI).json()
    assert next(s for s in listed["sources"] if s["id"] == "gaia")["files"] == []
    for path, params in (
        ("/api/logs/gaia", {}),
        ("/api/logs/gaia", {"file": "gaia.log"}),
    ):
        resp = clients["device"].get(path, params=params, headers=UI)
        assert "not a log" not in resp.text
    name = "diagnostics-20261118-111111.tgz"
    report = gaia_home() / name
    report.parent.mkdir(parents=True, exist_ok=True)
    report.symlink_to(outside)
    try:
        assert (
            clients["device"].get(f"/api/setup/report/{name}", headers=UI).status_code
            == 404
        )
    finally:
        report.unlink()


def test_a_device_never_sees_the_home_folder_in_an_error(setup, monkeypatch):
    from pathlib import Path

    from gaia.llm import lemonade_choice as choice

    app, clients, _ = setup

    def broken():
        raise choice.LemonadeChoiceError(f"can't read {Path.home()}/.gaia-x/config")

    monkeypatch.setattr(choice, "describe", broken)
    resp = clients["device"].get("/api/logs/model_server", headers=UI)
    assert resp.status_code == 409
    assert str(Path.home()) not in resp.text and "your home folder" in resp.text


@pytest.mark.parametrize(
    "path,body",
    [
        ("/api/memory/commit-discovery", {"items": [{"content": "x"}]}),
        ("/api/memory/commit-inference", {"insights": [{"content": "x"}]}),
    ],
)
def test_mobile_access_cannot_save_a_profile_scan(setup, monkeypatch, path, body):
    """Saving what a scan found needs the PC or an allowed device, never the tunnel."""
    from gaia.ui.routers import memory

    app, clients, _ = setup
    touched = []

    class _Store:
        def store(self, **kwargs):
            touched.append("store")

        def replace_by_source(self, *args, **kwargs):
            touched.append("store")
            return []

    monkeypatch.setattr(memory, "_get_store", _Store)
    ui = {"X-Gaia-UI": "1"}
    for caller in ("tunnel", "pending"):
        resp = clients[caller].post(path, json=body, headers=ui)
        assert resp.status_code == 403, (caller, resp.text)
    assert touched == []
    assert clients["pc"].post(path, json=body, headers=ui).status_code == 200
    assert touched


_SCANS = ("/api/memory/stream-discovery", "/api/memory/stream-inference")


def _events(resp):
    return [
        json.loads(line[len("data: ") :])
        for line in resp.text.splitlines()
        if line.startswith("data: ")
    ]


def _stub_discovery(monkeypatch, touched):
    from gaia.agents.base import discovery

    class _Discovery:
        def __init__(self):
            touched.append("scan")

        def scan_git_identity(self):
            return [
                {
                    "content": "Project 'gaia' in Projects/",
                    "path": "/Users/someone/Projects/gaia",
                    "paths": ["/Users/someone/Projects/gaia"],
                }
            ]

        def __getattr__(self, name):
            return lambda *a, **k: []

    monkeypatch.setattr(discovery, "SystemDiscovery", _Discovery)
    monkeypatch.setattr(discovery, "covered_by_twin", lambda key: False)
    monkeypatch.setattr(discovery, "unsupported_reason", lambda key: None)


@pytest.mark.parametrize("path", _SCANS)
def test_a_device_without_consent_gets_only_the_refusal(setup, monkeypatch, path):
    """System discovery off: a phone's scan reads nothing on the PC."""
    from gaia.ui.routers import memory

    _, clients, _ = setup
    touched = []
    _stub_discovery(monkeypatch, touched)
    monkeypatch.setattr(
        "gaia.agents.base.memory._system_context_is_enabled", lambda: False
    )
    resp = clients["device"].get(path, headers={"X-Gaia-UI": "1"})
    assert resp.status_code == 200, resp.text
    assert _events(resp) == [
        {"type": "error", "source": "consent", "message": memory.NO_DISCOVERY_CONSENT},
        {"type": "done", "total": 0},
    ]
    assert touched == []


def test_a_device_with_consent_gets_the_scan_without_pc_paths(setup, monkeypatch):
    """A phone sees the findings the PC's scan view shows, never absolute paths."""
    _, clients, _ = setup
    touched = []
    _stub_discovery(monkeypatch, touched)
    monkeypatch.setattr(
        "gaia.agents.base.memory._system_context_is_enabled", lambda: True
    )
    ui = {"X-Gaia-UI": "1"}
    device = clients["device"].get(_SCANS[0], headers=ui)
    assert device.status_code == 200, device.text
    found = [e["item"] for e in _events(device) if e["type"] == "finding"]
    assert [f["content"] for f in found] == ["Project 'gaia' in Projects/"]
    assert "/Users/someone" not in device.text
    assert _events(device)[-1] == {"type": "done", "total": 1}
    pc = clients["pc"].get(_SCANS[0], headers=ui)
    assert "/Users/someone/Projects/gaia" in pc.text


@pytest.mark.parametrize("caller", ["tunnel", "pending"])
def test_profile_scan_and_consent_refused_to_tunnel_and_pending(
    setup, monkeypatch, caller
):
    """Mobile access and a device the PC hasn't allowed can't scan or consent."""
    from gaia.ui.routers import memory

    _, clients, _ = setup
    touched = []
    _stub_discovery(monkeypatch, touched)
    monkeypatch.setattr(
        "gaia.agents.base.memory._system_context_is_enabled", lambda: True
    )
    saved = []
    monkeypatch.setattr("gaia.agents.base.memory._save_memory_settings", saved.append)
    audited = _audit_into(monkeypatch, memory)
    ui = {"X-Gaia-UI": "1"}
    for path in (*_SCANS, _SCANS[1] + "?include_browser=true"):
        assert clients[caller].get(path, headers=ui).status_code == 403, path
    on = clients[caller].put(
        "/api/memory/settings", json={"system_discovery_consent": True}, headers=ui
    )
    assert on.status_code == 403, on.text
    assert touched == [] and saved == [] and audited == []


def test_mobile_access_cannot_collect_system_context(setup, monkeypatch):
    """Mobile access and an unallowed device can't re-collect system context."""
    from gaia.ui.routers import memory

    app, clients, _ = setup
    ran = []
    monkeypatch.setattr(
        memory,
        "_do_system_context_refresh",
        lambda: ran.append("refresh") or {"stored": 0, "skipped": False},
    )
    monkeypatch.setattr(
        "gaia.agents.base.memory._save_memory_settings", lambda settings: None
    )
    ui = {"X-Gaia-UI": "1"}
    for caller in ("tunnel", "pending"):
        for path in (
            "/api/memory/refresh-system-context",
            "/api/memory/reinitialize",
        ):
            resp = clients[caller].post(path, headers=ui)
            assert resp.status_code == 403, (caller, path, resp.text)
        off = clients[caller].put(
            "/api/memory/settings",
            json={"system_discovery_consent": False},
            headers=ui,
        )
        assert off.status_code == (200 if caller == "tunnel" else 403), (
            caller,
            off.text,
        )
    assert ran == []


def test_consent_turned_off_mid_scan_stops_it(setup, monkeypatch):
    """Turning System discovery off during a scan ends it with the consent error."""
    from gaia.ui.routers import memory

    _, clients, _ = setup
    touched = []
    _stub_discovery(monkeypatch, touched)
    consent = {"on": True}
    monkeypatch.setattr(
        "gaia.agents.base.memory._system_context_is_enabled", lambda: consent["on"]
    )
    monkeypatch.setattr(memory, "_DISCOVERY_SOURCES", ("git_identity", "ssh_config"))
    from gaia.agents.base import discovery

    real = discovery.SystemDiscovery

    class _Withdrawn(real):
        def scan_git_identity(self):
            consent["on"] = False
            return super().scan_git_identity()

        def scan_ssh_config(self):
            touched.append("ssh_config")
            return []

    monkeypatch.setattr(discovery, "SystemDiscovery", _Withdrawn)
    resp = clients["device"].get(_SCANS[0], headers={"X-Gaia-UI": "1"})
    events = _events(resp)
    assert events[-2:] == [
        {"type": "error", "source": "consent", "message": memory.NO_DISCOVERY_CONSENT},
        {"type": "done", "total": 1},
    ]
    assert "ssh_config" not in touched


def test_consent_turned_off_mid_inference_stops_it(setup, monkeypatch):
    """Inference stops reading, and never calls the model, once consent goes off."""
    from gaia.agents.base import discovery
    from gaia.ui.routers import memory

    _, clients, _ = setup
    consent = {"on": True}
    monkeypatch.setattr(
        "gaia.agents.base.memory._system_context_is_enabled", lambda: consent["on"]
    )
    read = []

    class _Withdrawn:
        def scan_installed_apps(self):
            consent["on"] = False
            read.append("installed_apps")
            return [{"content": "Installed app: Blender"}]

        def __getattr__(self, name):
            return lambda *a, **k: read.append(name) or []

    monkeypatch.setattr(discovery, "SystemDiscovery", _Withdrawn)
    monkeypatch.setattr(discovery, "covered_by_twin", lambda key: False)
    monkeypatch.setattr(discovery, "unsupported_reason", lambda key: None)
    called = []
    monkeypatch.setattr("gaia.llm.create_client", lambda **k: called.append(k))
    resp = clients["device"].get(_SCANS[1], headers={"X-Gaia-UI": "1"})
    assert _events(resp)[-2:] == [
        {"type": "error", "source": "consent", "message": memory.NO_DISCOVERY_CONSENT},
        {"type": "done", "total": 0},
    ]
    assert read == ["installed_apps"] and called == []


def test_a_device_with_consent_gets_the_inference_stream(setup, monkeypatch):
    """A phone runs profile inference on the PC's local model, browser included."""
    from unittest.mock import MagicMock

    from gaia.ui.routers import memory

    _, clients, _ = setup
    touched = []
    _stub_discovery(monkeypatch, touched)
    monkeypatch.setattr(
        "gaia.agents.base.memory._system_context_is_enabled", lambda: True
    )
    model = "Gemma-4-E4B-it-GGUF"
    monkeypatch.setattr(
        "gaia.llm.lemonade_client.resolve_default_chat_model", lambda: model
    )
    monkeypatch.setattr("gaia.llm.lemonade_client.resolve_chat_model", lambda: model)
    monkeypatch.setattr("gaia.llm.hybrid.start_model", lambda m, *a, **k: m)
    monkeypatch.setattr("gaia.ui._chat_helpers._runs_on_this_pc", lambda m: True)
    monkeypatch.setattr(memory, "_downloaded_on_this_pc", lambda m: True)
    llm = MagicMock()
    llm.chat.return_value = (
        '[{"content": "Works on GAIA", "confidence": "high", "domain": "work"}]'
    )
    monkeypatch.setattr("gaia.llm.create_client", lambda model: llm)
    resp = clients["device"].get(
        _SCANS[1] + "?include_browser=true", headers={"X-Gaia-UI": "1"}
    )
    assert resp.status_code == 200, resp.text
    events = _events(resp)
    insights = [e["item"]["content"] for e in events if e["type"] == "insight"]
    assert insights == ["Works on GAIA"]
    assert events[-1] == {"type": "done", "total": 1}
    assert "Reading browser history..." in resp.text


@pytest.mark.parametrize("on", [True, False])
def test_a_device_changing_discovery_consent_is_audited(setup, monkeypatch, on):
    """A phone may turn System discovery on or off; the audit log names the phone."""
    from gaia.ui.routers import memory

    _, clients, device = setup
    ran = []
    monkeypatch.setattr(
        memory,
        "_do_system_context_refresh",
        lambda: ran.append("refresh") or {"stored": 0, "skipped": False},
    )
    saved = []
    monkeypatch.setattr("gaia.agents.base.memory._save_memory_settings", saved.append)
    audited = _audit_into(monkeypatch, memory)
    GaiaConfig.save_key("device_pairing", True)
    changes = f"/api/devices/{device.device_id}/changes"
    before = clients["pc"].get(changes).json()["changes"]
    resp = clients["device"].put(
        "/api/memory/settings",
        json={"system_discovery_consent": on},
        headers={"X-Gaia-UI": "1"},
    )
    assert resp.status_code == 200, resp.text
    after = clients["pc"].get(changes).json()["changes"]
    added = [c["kind"] for c in after if c not in before]
    assert added == ["profileScanOn" if on else "profileScanOff"]
    assert saved == [{"system_context_enabled": on}]
    assert ran == (["refresh"] if on else [])
    word = "on" if on else "off"
    assert audited == [
        (f"device:{device.device_id}", f"system discovery turned {word}")
    ]


_DEVICE_FLOW = {
    "provider_id": "microsoft",
    "scopes": ["https://graph.microsoft.com/Mail.ReadWrite"],
    "device_code": "SECRET-DEVICE-CODE",
    "user_code": "ABCD-EFGH",
    "verification_uri": "https://microsoft.com/devicelogin",
    "expires_in": 900,
    "interval": 5,
    "message": "Go to https://microsoft.com/devicelogin and enter ABCD-EFGH",
}


@pytest.mark.parametrize(
    "caller, path, body, status",
    [
        ("device", "/api/connectors/microsoft/authorize-device", {}, 200),
        ("pc", "/api/connectors/microsoft/authorize-device", {}, 200),
        ("device", "/api/connectors/google/authorize-device", {}, 403),
        (
            "device",
            "/api/connectors/microsoft/authorize-device",
            {"grant_agents": ["installed:email"]},
            403,
        ),
        ("device", "/api/connectors/microsoft/authorize", {}, 403),
        ("pending", "/api/connectors/microsoft/authorize-device", {}, 403),
        ("tunnel", "/api/connectors/microsoft/authorize-device", {}, 403),
    ],
)
def test_device_code_sign_in_from_a_paired_device(
    setup, monkeypatch, caller, path, body, status
):
    """A phone may start only a device-code sign-in, sees no secrets, and is audited."""
    from unittest.mock import AsyncMock

    from gaia.ui.routers import connectors

    _, clients, device = setup
    started = AsyncMock(return_value=dict(_DEVICE_FLOW))
    monkeypatch.setattr("gaia.connectors.start_device_flow", started)
    monkeypatch.setattr("gaia.connectors.poll_device_flow", AsyncMock())
    monkeypatch.setattr(
        "gaia.connectors.start_authorization",
        AsyncMock(return_value={"flow_id": "f", "authorization_url": "https://x"}),
    )
    audited = []
    monkeypatch.setattr(
        connectors,
        "audit_approval",
        lambda request, what: audited.append((security.principal(request), what)),
    )
    resp = clients[caller].post(path, json=body, headers={"X-Gaia-UI": "1"})
    assert resp.status_code == status, resp.text
    if status != 200:
        assert not started.called and not audited
        return
    assert resp.json() == {
        k: _DEVICE_FLOW[k]
        for k in ("user_code", "verification_uri", "expires_in", "interval", "message")
    }
    assert "SECRET-DEVICE-CODE" not in resp.text
    if caller == "device":
        assert audited == [
            (
                f"device:{device.device_id}",
                "device-code sign-in started for microsoft",
            )
        ]
    else:
        assert audited == []


def test_mcp_server_secrets_stay_on_the_pc(setup, monkeypatch):
    """A phone sees a server's args with its credentials masked; the PC sees them whole."""
    from gaia.ui.routers import mcp

    app, clients, _ = setup
    args = [
        "--api-key",
        "plain-secret-value",
        "--url=https://mcp.example/sse?token=query-secret",
        "--verbose",
    ]

    class _Config:
        def get_servers(self):
            return {"search": {"command": "npx", "args": args, "env": {}}}

    monkeypatch.setattr(mcp, "_load_config", _Config)
    for caller in ("tunnel", "device"):
        resp = clients[caller].get("/api/mcp/servers", headers={"X-Gaia-UI": "1"})
        assert resp.status_code == 200, (caller, resp.text)
        shown = resp.json()["servers"][0]["args"]
        assert "plain-secret-value" not in resp.text, caller
        assert "query-secret" not in resp.text, caller
        assert shown[0] == "--api-key" and shown[3] == "--verbose", shown
    pc = clients["pc"].get("/api/mcp/servers", headers={"X-Gaia-UI": "1"})
    assert pc.json()["servers"][0]["args"] == args


def _audit_into(monkeypatch, module):
    audited = []
    monkeypatch.setattr(
        module,
        "audit_approval",
        lambda request, what: audited.append((security.principal(request), what)),
    )
    return audited


@pytest.mark.parametrize(
    "caller, path, body, status",
    [
        ("device", "/api/connectors/mcp-github/configure", None, 200),
        ("pc", "/api/connectors/mcp-github/configure", None, 200),
        ("device", "/api/connectors/google/configure", "save_only", 200),
        ("device", "/api/connectors/google/configure", "sign_in", 403),
        ("device", "/api/connectors/microsoft/configure", "sign_in", 403),
        ("device", "/api/connectors/mcp-github/configure", "grant_agents", 200),
        ("tunnel", "/api/connectors/mcp-github/configure", None, 403),
        ("pending", "/api/connectors/mcp-github/configure", None, 403),
        ("device", "/api/connectors/google/authorize", {}, 403),
    ],
)
def test_a_paired_device_may_set_up_connectors(
    setup, monkeypatch, tmp_path, caller, path, body, status
):
    """A phone saves an OAuth client or an MCP server's key, never signs in, sees no secret."""
    from gaia.connectors import handler as connector_handler
    from gaia.connectors import mcp_server
    from gaia.ui.routers import connectors

    _, clients, device = setup
    monkeypatch.setenv("GAIA_HOME", str(tmp_path))
    stored = {}
    monkeypatch.setattr(
        mcp_server.keyring,
        "set_password",
        lambda service, user, value: stored.__setitem__(user, value),
    )
    monkeypatch.setattr(
        connector_handler._HANDLER_REGISTRY["mcp_server"], "_reload", None
    )
    saved = []
    monkeypatch.setattr(
        "gaia.connectors.store.save_provider_credentials",
        lambda provider, **kw: saved.append((provider, kw)),
    )
    started = []
    monkeypatch.setattr(
        "gaia.connectors.oauth_pkce.start_authorization",
        lambda *a, **kw: started.append(a),
    )
    audited = _audit_into(monkeypatch, connectors)
    monkeypatch.setattr(
        connectors,
        "_resolve_grant_scopes",
        lambda request, connector_id, agent_ids: {a: [] for a in agent_ids},
    )
    secret = "ghp_" + "S3CRETvalue" * 3
    configs = {
        None: {"GITHUB_PERSONAL_ACCESS_TOKEN": secret},
        "save_only": {
            "client_id": "id.apps",
            "client_secret": secret,
            "save_only": True,
        },
        "sign_in": {"client_id": "id.apps", "client_secret": secret},
        "grant_agents": {
            "GITHUB_PERSONAL_ACCESS_TOKEN": secret,
            "grant_agents": ["installed:email"],
        },
    }
    method = "POST"
    payload = {"config": configs[body]} if not isinstance(body, dict) else body
    resp = clients[caller].request(
        method, path, json=payload, headers={"X-Gaia-UI": "1"}
    )
    assert resp.status_code == status, resp.text
    assert secret not in resp.text
    assert not started
    if status != 200:
        assert not stored and not saved and not audited
        return
    if body == "save_only":
        assert resp.json() == {"status": "saved", "connector_id": "google"}
        assert saved == [("google", {"client_id": "id.apps", "client_secret": secret})]
    else:
        assert resp.json()["configured"] is True
        assert stored == {"mcp-github:GITHUB_PERSONAL_ACCESS_TOKEN": secret}
        assert secret not in (tmp_path / "mcp_servers.json").read_text()
    connector_id = path.split("/")[3]
    what = f"connector {connector_id} set up"
    if body == "grant_agents":
        what += " and granted to installed:email"
    expected = [(f"device:{device.device_id}", what)]
    assert audited == (expected if caller == "device" else [])


@pytest.mark.parametrize("caller", ["pc", "device", "tunnel"])
def test_a_connector_check_from_a_device_keeps_server_output_on_the_pc(
    setup, monkeypatch, caller
):
    """A failed check's text (paths, server output) and a 500's detail stay on the PC."""
    from unittest.mock import AsyncMock

    from gaia.ui.routers import connectors

    app, clients, _ = setup
    app.state.device_action_times = {}
    detail = "Transport error for 'mcp-github': /Users/someone/.npm/_npx/9f/node failed"
    monkeypatch.setattr(
        connectors,
        "health_check",
        AsyncMock(return_value={"ok": False, "detail": detail}),
    )
    events = []
    monkeypatch.setattr(
        connectors._emitter, "emit", AsyncMock(side_effect=lambda *a: events.append(a))
    )
    resp = clients[caller].post(
        "/api/connectors/mcp-github/test", headers={"X-Gaia-UI": "1"}
    )
    if caller == "tunnel":
        assert resp.status_code == 403
        return
    assert resp.status_code == 200, resp.text
    shown = resp.json()["detail"]
    assert shown == (detail if caller == "pc" else connectors.DEVICE_CHECK_FAILED)
    # The event stream reaches paired devices, so it never carries the raw text.
    assert events[-1][1]["detail"] == connectors.DEVICE_CHECK_FAILED

    from gaia.connectors.errors import ConnectorsError

    path = "/Users/someone/.gaia/mcp_servers.json"
    monkeypatch.setattr(
        connectors,
        "health_check",
        AsyncMock(
            side_effect=ConnectorsError(f"mcp_servers.json at {path} is unreadable")
        ),
    )
    app.state.device_action_times = {}  # a device may test once per 10 s
    resp = clients[caller].post(
        "/api/connectors/mcp-github/test", headers={"X-Gaia-UI": "1"}
    )
    assert resp.status_code == 500
    assert (path in resp.text) == (caller == "pc")


def test_spending_changes_from_a_phone_are_audited(setup):
    """Raising cloud spend from a paired device names that device in the audit log."""
    import logging

    from gaia.security import audit_logger

    app, clients, device = setup
    lines = []

    class _Capture(logging.Handler):
        def emit(self, record):
            lines.append(record.getMessage())

    handler = _Capture()
    level = audit_logger.level
    audit_logger.addHandler(handler)
    audit_logger.setLevel(logging.INFO)
    try:
        ui = {"X-Gaia-UI": "1"}
        resp = clients["device"].put(
            "/api/spending/limit", json={"limit_usd": 25.0}, headers=ui
        )
        assert resp.status_code == 200, resp.text
        resp = clients["device"].post("/api/spending/allow-month", headers=ui)
        assert resp.status_code == 200, resp.text
    finally:
        audit_logger.removeHandler(handler)
        audit_logger.setLevel(level)
    by = f"by {security.DEVICE_PRINCIPAL_PREFIX}{device.device_id}"
    assert len(lines) == 2 and all(by in line for line in lines), lines


class _Scheduler:
    def list_tasks(self):
        return []

    async def run_task_now(self, name):
        return {
            "id": "1",
            "name": name,
            "interval_seconds": 3600,
            "prompt": "p",
            "status": "active",
            "description": "every hour",
            "description_parts": {"kind": "every", "count": 1},
            "running": True,
        }


class _GoalStore:
    def list_goals(self, **_):
        return []

    def approve_goal(self, goal_id):
        return None


def test_schedules_and_goals_are_read_only_over_mobile_access(setup, monkeypatch):
    """Mobile access reads schedules and goals; only the PC and a paired device change them."""
    from gaia.ui.routers import goals

    app, clients, _ = setup
    monkeypatch.setattr(app.state, "scheduler", _Scheduler(), raising=False)
    monkeypatch.setattr(goals, "_get_store", lambda: _GoalStore())
    ui = {"X-Gaia-UI": "1"}

    for path in ("/api/schedules", "/api/goals"):
        resp = clients["tunnel"].get(path, headers=ui)
        assert resp.status_code == 200, (path, resp.text)

    refused = security.require_pc_or_allowed_device
    for method, path in (
        ("POST", "/api/schedules/daily/run"),
        ("PUT", "/api/goals/g1/approve"),
    ):
        resp = clients["tunnel"].request(method, path, headers=ui)
        assert resp.status_code == 403, (path, resp.text)
        with pytest.raises(HTTPException) as e:
            refused(_request_for("tunnel", None))
        assert resp.json()["detail"] == e.value.detail

    for caller in ("pc", "device"):
        resp = clients[caller].post("/api/schedules/daily/run", headers=ui)
        assert resp.status_code == 200, (caller, resp.text)
        assert resp.json()["name"] == "daily"
        resp = clients[caller].put("/api/goals/g1/approve", headers=ui)
        assert resp.status_code == 404, (caller, resp.text)


def _mcp_setup(setup, monkeypatch, tmp_path):
    from gaia.connectors import handler as connector_handler
    from gaia.connectors import mcp_server
    from gaia.ui.routers import connectors

    _, clients, _ = setup
    monkeypatch.setenv("GAIA_HOME", str(tmp_path))
    monkeypatch.setattr(mcp_server.keyring, "set_password", lambda *a: None)
    monkeypatch.setattr(
        connector_handler._HANDLER_REGISTRY["mcp_server"], "_reload", None
    )
    _audit_into(monkeypatch, connectors)
    return clients


def test_a_device_cannot_re_enable_a_paused_server(setup, monkeypatch, tmp_path):
    """Saving keys from a phone keeps a paused server paused, even if it sends disabled=false."""
    import json

    clients = _mcp_setup(setup, monkeypatch, tmp_path)
    hdr = {"X-Gaia-UI": "1"}
    url = "/api/connectors/mcp-github"
    keys = {"GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_" + "x" * 30}
    assert (
        clients["pc"]
        .post(f"{url}/configure", json={"config": keys}, headers=hdr)
        .status_code
        == 200
    )
    assert clients["device"].post(f"{url}/disable", headers=hdr).status_code == 200

    def paused():
        return json.loads((tmp_path / "mcp_servers.json").read_text())["mcpServers"][
            "mcp-github"
        ]["disabled"]

    assert paused() is True
    for config in (keys, {**keys, "disabled": False}):
        resp = clients["device"].post(
            f"{url}/configure", json={"config": config}, headers=hdr
        )
        assert resp.status_code == 200, resp.text
        assert paused() is True


def test_a_device_sign_in_code_without_save_only_is_refused(setup, monkeypatch):
    """A phone sending {flow_id, code} can't finish an OAuth sign-in."""
    _, clients, _ = setup
    resp = clients["device"].post(
        "/api/connectors/google/configure",
        json={"config": {"flow_id": "f", "code": "c"}},
        headers={"X-Gaia-UI": "1"},
    )
    assert resp.status_code == 403, resp.text


def test_a_pending_device_cannot_run_a_connector_check(setup):
    _, clients, _ = setup
    resp = clients["pending"].post(
        "/api/connectors/mcp-github/test", headers={"X-Gaia-UI": "1"}
    )
    assert resp.status_code == 403


# ── Wave 1 of full parity: what an allowed device may now do ────────────────

UI = {"X-Gaia-UI": "1"}


def _device_client(app, *, allow):
    """A fresh paired device and its own client, for tests that unpair one."""
    access = app.state.devices
    invite, _ = access.pairing.open()
    paired = access.redeem(invite, "Spare", "android", "192.168.1.22")
    if allow:
        access.allow(paired["device_id"])
    listener = ListenerScopeMiddleware(DeviceGate(app, access, allow_loopback=True))
    client = TestClient(
        listener, client=PC, headers={"Authorization": f"Bearer {paired['token']}"}
    )
    return paired["device_id"], paired["token"], client


def _refused_away(clients, method, path, body=None):
    for caller in ("tunnel", "pending"):
        resp = clients[caller].request(method, path, json=body, headers=UI)
        assert resp.status_code in (401, 403), (caller, path, resp.status_code)


def test_a_device_reads_and_prunes_the_device_list(setup, monkeypatch):
    """A phone lists devices without any token, removes itself or another, and
    closes pairing; opening pairing and allowing a device stay on the PC."""
    from gaia.ui.routers import devices

    app, clients, device = setup
    GaiaConfig.save_key("device_pairing", True)
    audited = _audit_into(monkeypatch, devices)
    own_token = clients["device"].headers["Authorization"].split()[-1]
    other_id, other_token, _ = _device_client(app, allow=False)

    listed = clients["device"].get("/api/devices", headers=UI)
    assert listed.status_code == 200, listed.text
    assert {d["id"] for d in listed.json()["devices"]} >= {device.device_id, other_id}
    for token in (own_token, other_token):
        assert token not in listed.text
    assert clients["device"].get("/api/devices/status").status_code == 200
    for method, path in (("GET", "/api/devices"), ("GET", "/api/devices/status")):
        _refused_away(clients, method, path)

    assert clients["device"].post("/api/devices/pairing").status_code == 403
    assert clients["device"].post(f"/api/devices/{other_id}/allow").status_code == 403
    _refused_away(clients, "DELETE", "/api/devices/pairing")
    _refused_away(clients, "DELETE", f"/api/devices/{other_id}")
    assert audited == []

    assert clients["device"].delete("/api/devices/pairing").status_code == 200
    assert clients["device"].delete(f"/api/devices/{other_id}").status_code == 200
    self_id, _, self_client = _device_client(app, allow=True)
    gone = self_client.delete(f"/api/devices/{self_id}")
    assert gone.status_code == 200 and gone.json() == {"changes_count": 1}
    assert self_client.get("/api/devices").status_code == 401
    assert audited == [
        (f"device:{device.device_id}", "pairing closed"),
        (f"device:{device.device_id}", f"device {other_id} unpaired"),
        (f"device:{self_id}", f"device {self_id} unpaired"),
    ]


class _Bridge:
    """``gaia.messaging.discord.cli`` as the routes use it."""

    def __init__(self, state="pairing", detail="DM the code to the bot."):
        self.state, self.detail, self.started = state, detail, []

    def status(self, detect=True):
        return {
            "connected": True,
            "paired": False,
            "running": True,
            "state": self.state,
            "detail": self.detail,
            "bot_name": "GAIA",
            "owner_name": "",
            "autostart": True,
            "always_allowed": [],
            "model": "",
            "portal_url": "https://discord.com/developers/applications",
            "bot_page_url": "",
            "invite_url": "",
            "bot_profile_url": "",
            "pairing_code": "PAIR-4242",
            "pairing_expires_at": 1.0,
            "discord_installed": False,
            "should_offer_setup": False,
        }

    def stop(self, stay_stopped=False):
        return True

    def start_detached(self, model=None, take_over=False, emit=None):
        self.started.append(take_over)

    def stop_failed_hint(self):
        return ""


def test_a_device_runs_the_discord_bridge_but_never_sees_its_code(setup, monkeypatch):
    from gaia.messaging.discord import state as bridge_state
    from gaia.ui.routers import messaging

    _, clients, device = setup
    bridge = _Bridge()
    monkeypatch.setattr(messaging, "_cli", lambda: bridge)
    monkeypatch.setattr(bridge_state, "is_running", lambda: False)
    monkeypatch.setattr(bridge_state, "forget_always", lambda: None)
    audited = _audit_into(monkeypatch, messaging)

    assert clients["pc"].get("/api/messaging/discord").json()["pairing_code"]
    shown = clients["device"].get("/api/messaging/discord")
    assert shown.status_code == 200 and "PAIR-4242" not in shown.text
    for action in ("start", "stop", "restart", "forget-always"):
        path = f"/api/messaging/discord/{action}"
        _refused_away(clients, "POST", path, {})
        resp = clients["device"].post(path, json={}, headers=UI)
        assert resp.status_code == 200, (action, resp.text)
        assert "PAIR-4242" not in resp.text
    # Taking the lease from another PC needs the explicit flag, from a device too.
    assert bridge.started == [False, False]
    clients["device"].post(
        "/api/messaging/discord/start", json={"take_over": True}, headers=UI
    )
    assert bridge.started[-1] is True
    for action in ("connect", "pair", "disconnect"):
        resp = clients["device"].post(
            f"/api/messaging/discord/{action}", json={"token": "t"}, headers=UI
        )
        assert resp.status_code == 403, action
    by = f"device:{device.device_id}"
    assert audited == [
        (by, "Discord bridge started"),
        (by, "Discord bridge stopped"),
        (by, "Discord bridge restarted"),
        (by, 'Discord bridge "Always allow" answers forgotten'),
        (by, "Discord bridge taken over from another PC"),
    ]

    bridge.state, bridge.detail = "error", "Its log is at /Users/someone/.gaia/d.log"
    assert "/Users/someone" not in clients["device"].get("/api/messaging/discord").text
    assert "/Users/someone" in clients["pc"].get("/api/messaging/discord").text


def test_a_device_grants_and_turns_on_connectors(setup, monkeypatch, tmp_path):
    from unittest.mock import AsyncMock

    from gaia.ui.routers import connectors

    clients = _mcp_setup(setup, monkeypatch, tmp_path)
    _, _, device = setup
    audited = _audit_into(monkeypatch, connectors)
    monkeypatch.setattr(connectors._emitter, "emit", AsyncMock())
    monkeypatch.setattr(connectors, "grant_agent", lambda *a: None)
    monkeypatch.setattr(
        connectors, "activate_connector_for_agent", lambda *a, **k: True
    )
    monkeypatch.setattr(connectors, "deactivate_connector_for_agent", lambda *a: None)
    secret = "ghp_" + "S3CRETvalue" * 3
    url = "/api/connectors/mcp-github"
    configured = clients["pc"].post(
        f"{url}/configure",
        json={"config": {"GITHUB_PERSONAL_ACCESS_TOKEN": secret}},
        headers=UI,
    )
    assert configured.status_code == 200, configured.text
    assert clients["pc"].post(f"{url}/disable", headers=UI).status_code == 200

    calls = (
        ("PUT", f"{url}/grants/installed:email", {"scopes": ["repo"]}),
        ("PUT", f"{url}/activations/installed:email", {"scopes": ["repo"]}),
        ("DELETE", f"{url}/activations/installed:email", None),
        ("POST", f"{url}/enable", None),
    )
    for method, path, body in calls:
        _refused_away(clients, method, path, body)
    assert audited == []
    for method, path, body in calls:
        resp = clients["device"].request(method, path, json=body, headers=UI)
        assert resp.status_code in (200, 204), (path, resp.text)
        assert secret not in resp.text
    by = f"device:{device.device_id}"
    kinds = [
        (c["kind"], c["params"].get("agent_id"))
        for c in setup[0].state.db.device_changes(device.device_id, 10)[0]
    ]
    assert kinds[:4] == [
        ("connectorEnable", None),
        ("connectorActivation", "installed:email"),
        ("connectorActivation", "installed:email"),
        ("connectorGrant", "installed:email"),
    ], kinds
    assert audited == [
        (by, "connector mcp-github granted to installed:email"),
        (by, "connector mcp-github turned on for installed:email (granted)"),
        (by, "connector mcp-github turned off for installed:email"),
        (by, "connector mcp-github enabled"),
    ]


def test_a_device_rebuilds_memory_and_saves_the_profile(setup, monkeypatch):
    from gaia.ui.routers import memory

    _, clients, device = setup
    audited = _audit_into(monkeypatch, memory)

    class _Store:
        def store(self, **kwargs):
            pass

        def replace_by_source(self, *args, **kwargs):
            return [1, 2]

        def clear_all(self):
            return {"knowledge": 0, "tool_history": 0, "conversations": 0}

    monkeypatch.setattr(memory, "_get_store", _Store)
    monkeypatch.setattr(
        memory, "_do_system_context_refresh", lambda: {"stored": 3, "skipped": False}
    )
    calls = (
        ("/api/memory/commit-discovery", {"items": [{"content": "Uses Rust"}]}),
        ("/api/memory/commit-inference", {"insights": [{"content": "A developer"}]}),
        ("/api/memory/refresh-system-context", None),
        ("/api/memory/reinitialize", None),
    )
    for path, body in calls:
        _refused_away(clients, "POST", path, body)
    assert audited == []
    for path, body in calls:
        resp = clients["device"].post(path, json=body, headers=UI)
        assert resp.status_code == 200, (path, resp.text)
    by = f"device:{device.device_id}"
    assert audited == [
        (by, "1 discovery findings saved to memory"),
        (by, "profile replaced with 2 inferred insights"),
        (by, "system context refreshed"),
        (by, "memory wiped and rebuilt"),
    ]

    def broken():
        raise RuntimeError("cannot read /Users/someone/.gaia/memory.db")

    monkeypatch.setattr(memory, "_do_system_context_refresh", broken)
    path = "/api/memory/refresh-system-context"
    away = clients["device"].post(path, headers=UI)
    assert away.status_code == 500 and "/Users/someone" not in away.text
    assert "/Users/someone" in clients["pc"].post(path, headers=UI).text


def test_a_device_may_only_switch_back_to_gaias_own_lemonade(setup, monkeypatch):
    from gaia.llm import lemonade_choice
    from gaia.ui.routers import lemonade

    _, clients, device = setup
    audited = _audit_into(monkeypatch, lemonade)
    switched = []
    monkeypatch.setattr(lemonade_choice, "saved_mode", lambda: "external")
    monkeypatch.setattr(lemonade_choice, "configured_source", lambda: "config")
    monkeypatch.setattr(lemonade_choice, "set_mode", switched.append)
    monkeypatch.setattr(
        lemonade_choice,
        "use_external",
        lambda *a: pytest.fail("a device chose an external server"),
    )
    monkeypatch.setattr(lemonade_choice, "apply_gaia_switch", lambda previous: None)
    monkeypatch.setattr(lemonade, "_drop_cached_agents", lambda: None)
    monkeypatch.setattr(
        lemonade,
        "_target",
        lambda: {
            "mode": "gaia",
            "saved_mode": "gaia",
            "source": "config",
            "base_url": None,
            "saved_base_url": None,
            "api_key_stored": False,
            "env_url_ignored": None,
            "env_override": None,
            "gaia_installed": True,
            "offer": False,
            "what_gaia_does": lemonade.WHAT_GAIA_DOES,
        },
    )
    path = "/api/lemonade/target"
    external = {"mode": "external", "base_url": "http://10.0.0.5:13305", "api_key": "k"}
    assert clients["device"].post(path, json=external, headers=UI).status_code == 403
    # Only the exact mode is GAIA's own; anything else is the user's server.
    assert (
        clients["device"].post(path, json={"mode": "GAIA"}, headers=UI).status_code
        == 403
    )
    _refused_away(clients, "POST", path, {"mode": "gaia"})
    assert switched == [] and audited == []
    resp = clients["device"].post(path, json={"mode": "gaia"}, headers=UI)
    assert resp.status_code == 200, resp.text
    assert switched == ["gaia"]
    assert audited == [
        (f"device:{device.device_id}", "Lemonade Server switched to GAIA's own")
    ]


def _audit_lines(run):
    """What *run* writes to the audit log, through the file handler's formatter."""
    import io
    import logging

    from gaia.security import OneLineFormatter, audit_logger

    out = io.StringIO()
    handler = logging.StreamHandler(out)
    handler.setFormatter(OneLineFormatter("%(levelname)s | %(message)s"))
    level = audit_logger.level
    audit_logger.addHandler(handler)
    audit_logger.setLevel(logging.INFO)
    try:
        run()
    finally:
        audit_logger.removeHandler(handler)
        audit_logger.setLevel(level)
    return out.getvalue().splitlines()


def test_an_audit_line_cannot_be_forged():
    """A newline in what is approved stays inside its one line."""
    forged = "chat 1 set to manual\nINFO | APPROVAL | goal 9 approved | by pc"
    lines = _audit_lines(
        lambda: security.audit_approval(_request_for("pc", None), forged)
    )
    assert len(lines) == 1, lines
    assert "\\n" in lines[0]


def test_a_malformed_agent_id_is_refused(setup, monkeypatch):
    from gaia.ui.routers import connectors

    _, clients, _ = setup
    written = []
    monkeypatch.setattr(connectors, "grant_agent", lambda *a: written.append(a))
    monkeypatch.setattr(
        connectors, "activate_connector_for_agent", lambda *a, **k: written.append(a)
    )
    url = "/api/connectors/mcp-github"
    # The router never matches "\n" in a path parameter (404); "\r" reaches the route.
    for bad, status in (("%0D", 422), ("%0A", 404), ("%1B", 422), ("x/../y", 422)):
        agent = f"builtin:chat{bad}INFO%20|%20APPROVAL%20|%20forged"
        for method, path, body in (
            ("PUT", f"{url}/grants/{agent}", {"scopes": []}),
            ("PUT", f"{url}/activations/{agent}", {"scopes": []}),
            ("DELETE", f"{url}/activations/{agent}", None),
        ):
            for caller in ("pc", "device"):
                resp = clients[caller].request(method, path, json=body, headers=UI)
                assert resp.status_code == status, (caller, path, resp.text)
                if status == 422:
                    assert resp.json()["detail"]["error"] == "invalid_agent_id"
    assert written == []
