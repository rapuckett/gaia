# Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT

"""Who may call each Agent UI route, decided by the listener a request reached.

Every route is in exactly one class. A route added tomorrow fails
``test_every_route_is_classified`` until someone decides who may call it:

* ``pc``: the PC running GAIA only (``require_local_pc``).
* ``pc_or_device``: first-run setup; the PC or an allowed paired device, never
  mobile access (``require_pc_or_device``).
* ``not_on_listener``: a read with side effects on the PC; the PC and mobile
  access, never a paired device (``refuse_on_device_listener``).
* ``remote``: the PC, mobile access with its token, and allowed devices.
* ``web``: the web UI and the API docs, which the device listener never serves.
"""

from __future__ import annotations

import pytest
from fastapi import Depends, FastAPI, HTTPException, Request, WebSocket
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from starlette.routing import Mount

from gaia.ui import security
from gaia.ui.security import (
    DEVICE_AUTH_SCOPE_KEY,
    DEVICE_SCOPE_KEY,
    DevicePrincipal,
    ListenerScopeMiddleware,
)
from gaia.ui.server import create_app

pytestmark = pytest.mark.allow_network  # TestClient only; nothing leaves the machine

PC = ("127.0.0.1", 50000)
ALLOWED = DevicePrincipal(device_id="d0a1", allowed=True)
PENDING = DevicePrincipal(device_id="d0a2", allowed=False)

PC_ONLY = {
    "DELETE /api/agents/{agent_id}",
    "DELETE /api/automations/{ref}",
    "GET /api/automations",
    "GET /api/logs",
    "GET /api/logs/{source}",
    "GET /api/messaging/discord",
    "GET /api/setup/report/{name}",
    "POST /api/agents/install",
    "POST /api/automations/{ref}/{action}",
    "POST /api/connectors/{connector_id}/authorize",
    "POST /api/connectors/{connector_id}/authorize-device",
    "POST /api/connectors/{connector_id}/configure",
    "POST /api/files/open",
    "POST /api/gpu-memory/apply",
    "POST /api/gpu-memory/revert",
    "POST /api/lemonade/target",
    "POST /api/messaging/discord/connect",
    "POST /api/messaging/discord/disconnect",
    "POST /api/messaging/discord/forget-always",
    "POST /api/messaging/discord/pair",
    "POST /api/messaging/discord/restart",
    "POST /api/messaging/discord/start",
    "POST /api/messaging/discord/stop",
    "POST /api/setup/npu/memlock-fix",
    "POST /api/setup/report",
    "POST /api/skills/link/add",
    "POST /api/tunnel/start",
    "POST /api/tunnel/stop",
    "POST /v1/connections/{provider}",
    "PUT /api/chat/permissions",
}

PC_OR_DEVICE = {
    "POST /api/setup/cancel",
    "POST /api/setup/chat-model",
    "POST /api/setup/models/download",
    "POST /api/setup/models/remove",
    "POST /api/setup/models/skip",
    "POST /api/setup/npu/recheck",
    "POST /api/setup/run",
    "POST /api/setup/vision-model",
    "POST /api/system/download-model",
    "PUT /api/system/model-server/backend",
}

NOT_ON_LISTENER = {
    "GET /api/providers",
}

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

# Some check one field on the PC inside the handler: a provider key in
# ``POST /api/providers/{provider}/connect`` and ``network_policy`` in
# ``PUT /api/settings``.
REMOTE = {
    "DELETE /api/chat/permissions/{session_id}/grants",
    "DELETE /api/connectors/_flows/{flow_id}",
    "DELETE /api/connectors/{connector_id}",
    "DELETE /api/connectors/{connector_id}/activations/{agent_id:path}",
    "DELETE /api/connectors/{connector_id}/grants/{agent_id:path}",
    "DELETE /api/documents/{doc_id}",
    "DELETE /api/goals/{goal_id}",
    "DELETE /api/gpu-memory/pending",
    "DELETE /api/memory/all",
    "DELETE /api/memory/knowledge/{knowledge_id}",
    "DELETE /api/providers/local/custom/{model_id}",
    "DELETE /api/providers/{provider}/key",
    "DELETE /api/schedules/{name:path}",
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
    "GET /api/connectors/_debug",
    "GET /api/connectors/agent-mcps",
    "GET /api/connectors/eval-mailbox",
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
    "GET /api/memory/stream-discovery",
    "GET /api/memory/stream-inference",
    "GET /api/memory/tools",
    "GET /api/memory/upcoming",
    "GET /api/onboarding/preflight",
    "GET /api/onboarding/start",
    "GET /api/providers/active",
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
    "POST /api/connectors/eval-mailbox",
    "POST /api/connectors/{connector_id}/disable",
    "POST /api/connectors/{connector_id}/enable",
    "POST /api/connectors/{connector_id}/test",
    "POST /api/documents/index-folder",
    "POST /api/documents/upload",
    "POST /api/documents/upload-path",
    "POST /api/documents/{doc_id}/cancel",
    "POST /api/documents/{doc_id}/reindex",
    "POST /api/environment/folders/check",
    "POST /api/eval/scripted-user",
    "POST /api/files/status",
    "POST /api/files/upload",
    "POST /api/files/upload-media",
    "POST /api/goals",
    "POST /api/goals/{goal_id}/tasks",
    "POST /api/gpu-memory/pending",
    "POST /api/memory/admin/clear",
    "POST /api/memory/admin/seed",
    "POST /api/memory/commit-discovery",
    "POST /api/memory/commit-inference",
    "POST /api/memory/consolidate",
    "POST /api/memory/knowledge",
    "POST /api/memory/prune",
    "POST /api/memory/rebuild-embeddings",
    "POST /api/memory/rebuild-fts",
    "POST /api/memory/reconcile",
    "POST /api/memory/refresh-system-context",
    "POST /api/memory/reinitialize",
    "POST /api/providers/key-store/retry",
    "POST /api/providers/local/custom",
    "POST /api/providers/local/custom/check",
    "POST /api/providers/local/restart",
    "POST /api/providers/select",
    "POST /api/providers/{provider}/connect",
    "POST /api/schedules",
    "POST /api/schedules/parse",
    "POST /api/schedules/{name:path}/run",
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
    "PUT /api/connectors/{connector_id}/activations/{agent_id:path}",
    "PUT /api/connectors/{connector_id}/grants/{agent_id:path}",
    "PUT /api/goals/{goal_id}/approve",
    "PUT /api/goals/{goal_id}/cancel",
    "PUT /api/goals/{goal_id}/reject",
    "PUT /api/goals/{goal_id}/status",
    "PUT /api/goals/{goal_id}/tasks/{task_id}",
    "PUT /api/memory/knowledge/{knowledge_id}",
    "PUT /api/memory/settings",
    "PUT /api/providers/local/context",
    "PUT /api/schedules/{name:path}",
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
    **{r: "web" for r in WEB},
    **{r: "remote" for r in REMOTE},
}


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
    return {d.call for d in dependant.dependencies} if dependant else set()


def _access_class(key, route):
    if key.startswith("MOUNT "):
        return "remote"
    path = key.split(" ", 1)[1]
    if not path.startswith(("/api/", "/v1/")):
        return "web"
    guards = _guards(route)
    if security.require_local_pc in guards:
        return "pc"
    if security.require_pc_or_device in guards:
        return "pc_or_device"
    if security.refuse_on_device_listener in guards:
        return "not_on_listener"
    return "remote"


def _on_listener(app, device=None):
    """The app as the device listener hands it a request device auth passed."""

    async def authenticated(scope, receive, send):
        if scope["type"] in ("http", "websocket"):
            scope = {**scope, DEVICE_AUTH_SCOPE_KEY: True}
            if device is not None:
                scope[DEVICE_SCOPE_KEY] = device
        await app(scope, receive, send)

    return ListenerScopeMiddleware(authenticated)


def _fill(path):
    import re

    return re.sub(r"\{[^}]+\}", "x", path)


@pytest.fixture(scope="module")
def app():
    return create_app(db_path=":memory:")


def test_every_route_is_classified(app):
    actual = {key: _access_class(key, route) for key, route in _routes(app).items()}
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


def test_listener_scope_marks_every_request_remote():
    """Loopback with no forwarded header is the PC only on the main listener."""
    probe = FastAPI()

    @probe.get("/api/who")
    def who(request: Request):
        return {"principal": security.principal(request)}

    @probe.get("/api/pc-only", dependencies=[Depends(security.require_local_pc)])
    def pc_only():
        return {"ok": True}

    @probe.websocket("/api/ws")
    async def ws(websocket: WebSocket):
        await websocket.accept()
        await websocket.send_json({"principal": security.principal(websocket)})
        await websocket.close()

    main = TestClient(probe, client=PC)
    assert main.get("/api/who").json() == {"principal": "pc"}

    listener = TestClient(ListenerScopeMiddleware(probe), client=PC)
    assert listener.get("/api/who").json() == {"principal": "tunnel"}
    assert listener.get("/api/pc-only").status_code == 403
    with listener.websocket_connect("/api/ws") as socket:
        assert socket.receive_json() == {"principal": "tunnel"}

    as_device = TestClient(_on_listener(probe, ALLOWED), client=PC)
    assert as_device.get("/api/who").json() == {"principal": "device:d0a1"}
    assert as_device.get("/api/pc-only").status_code == 403


def test_every_pc_only_route_refused_on_listener(app):
    client = TestClient(_on_listener(app, ALLOWED), client=PC)
    for key, route in sorted(_routes(app).items()):
        if _access_class(key, route) != "pc":
            continue
        method, path = key.split(" ", 1)
        resp = client.request(method, _fill(path), json={})
        assert resp.status_code == 403, f"{key} answered {resp.status_code}"
        assert "on the PC running GAIA" in resp.text, key


def test_provider_key_and_lemonade_target_refused_on_listener(app, monkeypatch):
    from gaia.ui.routers import providers

    handed = []
    monkeypatch.setattr(providers, "_install", lambda *a, **k: handed.append(a))
    client = TestClient(_on_listener(app, ALLOWED), client=PC)

    key = client.post(
        "/api/providers/fireworks/connect", json={"api_key": "fw-secret-key"}
    )
    assert key.status_code == 403
    assert "fw-secret-key" not in key.text
    assert handed == []

    target = client.post(
        "/api/lemonade/target",
        json={"mode": "external", "base_url": "http://192.168.1.50:13305"},
    )
    assert target.status_code == 403

    listing = client.get("/api/providers")
    assert listing.status_code == 403


@pytest.mark.parametrize("route", sorted(PC_OR_DEVICE))
def test_setup_routes_refused_over_the_tunnel_and_to_pending_devices(app, route):
    method, path = route.split(" ", 1)
    tunnel = TestClient(app, client=PC)
    resp = tunnel.request(
        method, _fill(path), json={}, headers={"X-Forwarded-For": "203.0.113.7"}
    )
    assert resp.status_code == 403, f"tunnel {route}: {resp.status_code}"

    pending = TestClient(_on_listener(app, PENDING), client=PC)
    resp = pending.request(method, _fill(path), json={})
    assert resp.status_code == 403, f"pending device {route}: {resp.status_code}"

    no_device = TestClient(_on_listener(app), client=PC)
    assert no_device.request(method, _fill(path), json={}).status_code == 403


def test_an_allowed_device_passes_the_setup_guard(app):
    def request_for(scope_extra):
        scope = {
            "type": "http",
            "method": "POST",
            "path": "/api/setup/run",
            "headers": [],
            "client": PC,
            **scope_extra,
        }
        return Request(scope)

    listener = {security.LISTENER_SCOPE_KEY: security.LAN_LISTENER}
    security.require_pc_or_device(request_for({}))
    security.require_pc_or_device(request_for({**listener, DEVICE_SCOPE_KEY: ALLOWED}))
    for refused in (
        {**listener},
        {**listener, DEVICE_SCOPE_KEY: PENDING},
        {"headers": [(b"x-forwarded-for", b"203.0.113.7")]},
        {"client": ("192.168.1.20", 50000)},
    ):
        with pytest.raises(HTTPException) as e:
            security.require_pc_or_device(request_for(refused))
        assert e.value.status_code == 403

    # A route in the class answers an allowed device past the guard.
    client = TestClient(_on_listener(app, ALLOWED), client=PC)
    resp = client.post("/api/setup/models/skip", json={"model_id": "no-such-model"})
    assert resp.status_code != 403, resp.text


def test_listener_request_that_skipped_device_auth_is_refused(app):
    """A listener stack built without device auth serves no API at all."""
    client = TestClient(ListenerScopeMiddleware(app), client=PC)
    assert client.get("/api/sessions").status_code == 401
    assert client.get("/api/health").status_code == 401


def test_troubleshooting_report_is_pc_only(app):
    """The report bundles every log, so it is no side door around them."""
    from gaia.home import gaia_home

    name = "diagnostics-20261112-101010.tgz"
    report = gaia_home() / name
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_bytes(b"logs that quote a conversation")
    try:
        tunnel = {"X-Forwarded-For": "203.0.113.7"}
        for client, headers in (
            (TestClient(app, client=PC), tunnel),
            (TestClient(app, client=("192.168.1.20", 50000)), {}),
            (TestClient(_on_listener(app, ALLOWED), client=PC), {}),
        ):
            got = client.get(f"/api/setup/report/{name}", headers=headers)
            assert got.status_code == 403
            assert b"conversation" not in got.content
            assert client.post("/api/setup/report", headers=headers).status_code == 403

        pc = TestClient(app, client=PC).get(f"/api/setup/report/{name}")
        assert pc.status_code == 200
        assert pc.content == b"logs that quote a conversation"
    finally:
        report.unlink()
