# Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT

"""Away from the PC, file reads stay inside one chat's folders and never
reach a secret.

Mobile access and paired devices name the chat they read for. Previews,
images, folder listings and searches then see only what that chat may touch,
as its session panel lists it, GAIA's secret-file policy still refuses keys
and ``.env`` files inside it, and a preview is capped. The PC's own reads are
unchanged.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from gaia import security as gaia_security
from gaia.ui.routers.files import REMOTE_PREVIEW_MAX_LINES
from gaia.ui.server import create_app

from .device_scope import ALLOWED, PC, on_listener

pytestmark = pytest.mark.allow_network  # TestClient only; nothing leaves the machine

TUNNEL = {"X-Forwarded-For": "203.0.113.7"}


@pytest.fixture
def home(mock_home, monkeypatch):
    # The home folder is never a chat's working folder, so no default scope.
    monkeypatch.chdir(mock_home)
    ssh = mock_home / ".ssh"
    ssh.mkdir()
    (ssh / "id_ed25519").write_text("-----BEGIN OPENSSH PRIVATE KEY-----\n")
    (ssh / "config").write_text("Host build\n  IdentityFile ~/.ssh/id_ed25519\n")
    monkeypatch.setattr(gaia_security, "SECRET_DIRECTORIES", {str(ssh)})
    project = mock_home / "project"
    project.mkdir()
    (project / "notes.md").write_text("\n".join(f"line {i}" for i in range(300)))
    (project / ".env").write_text("TOKEN=project-secret\n")
    (project / "id_rsa").write_text("-----BEGIN RSA PRIVATE KEY-----\n")
    (project / "chart.png").write_bytes(b"\x89PNG\r\n\x1a\n")
    (mock_home / "elsewhere.md").write_text("not this chat's\n")
    return mock_home


@pytest.fixture
def app(home):
    return create_app(db_path=":memory:")


@pytest.fixture
def chat(app, home):
    db = app.state.db
    session = db.create_session(title="Phone chat")
    db.set_session_environment(
        session["id"], folders=[str(home / "project")], withheld=[], internet_off=False
    )
    return session["id"]


@pytest.fixture
def device(app):
    return TestClient(on_listener(app, ALLOWED), client=PC)


@pytest.fixture
def wide(app, home):
    """A chat that somehow holds the whole home folder."""
    db = app.state.db
    session_id = db.create_session(title="Whole home")["id"]
    db.set_session_environment(
        session_id, folders=[str(home)], withheld=[], internet_off=False
    )
    return session_id


@pytest.mark.parametrize("caller", ["device", "tunnel"])
@pytest.mark.parametrize(
    "route, target, chat_name",
    [
        ("/api/files/preview", ".ssh/id_ed25519", "chat"),
        ("/api/files/image", ".ssh/id_ed25519", "chat"),
        ("/api/files/preview", ".ssh/config", "wide"),
        ("/api/files/preview", "project/.env", "wide"),
        ("/api/files/preview", "elsewhere.md", "chat"),
        ("/api/files/preview", "project/notes.md", None),
        ("/api/files/image", "project/chart.png", None),
        ("/api/files/browse", "", "chat"),
        ("/api/files/browse", ".", "chat"),
    ],
    ids=[
        "ssh-key-preview",
        "ssh-key-image",
        "credential-folder-in-scope",
        "dotenv-in-scope",
        "outside-the-chat",
        "preview-names-no-chat",
        "image-names-no-chat",
        "browse-names-no-folder",
        "browse-above-the-chat",
    ],
)
def test_remote_reads_refused(
    app, device, chat, wide, home, caller, route, target, chat_name
):
    client = (
        device if caller == "device" else TestClient(app, client=PC, headers=TUNNEL)
    )
    params = {"path": str(home / target)} if target else {}
    if chat_name:
        params["session_id"] = {"chat": chat, "wide": wide}[chat_name]
    resp = client.get(route, params=params)
    assert resp.status_code == 403
    assert "PRIVATE KEY" not in resp.text and "project-secret" not in resp.text


def test_search_away_from_the_pc_stays_in_the_chat_and_skips_secrets(
    device, chat, wide, home
):
    refused = device.get(
        "/api/files/search",
        params={"query": "id_", "folder": str(home / ".ssh"), "session_id": chat},
    )
    assert refused.status_code == 403
    assert device.get("/api/files/search", params={"query": "notes"}).status_code == 403

    found = device.get(
        "/api/files/search", params={"query": ".md", "session_id": chat}
    ).json()
    names = {r["name"] for r in found["results"]}
    assert "notes.md" in names and "elsewhere.md" not in names

    everywhere = device.get(
        "/api/files/search", params={"query": "id_", "session_id": wide}
    ).json()
    assert not {r["name"] for r in everywhere["results"]} & {"id_rsa", "id_ed25519"}


def test_allowed_reads_and_the_line_cap(app, device, chat, home):
    notes = {"path": str(home / "project" / "notes.md"), "lines": 200}
    remote = device.get("/api/files/preview", params={**notes, "session_id": chat})
    assert remote.status_code == 200
    assert len(remote.json()["preview_lines"]) == REMOTE_PREVIEW_MAX_LINES
    image = device.get(
        "/api/files/image",
        params={"path": str(home / "project" / "chart.png"), "session_id": chat},
    )
    assert image.status_code == 200
    listing = device.get(
        "/api/files/browse",
        params={"path": str(home / "project"), "session_id": chat},
    ).json()
    assert listing["parent_path"] is None
    assert {"notes.md", "chart.png"} <= {e["name"] for e in listing["entries"]}
    assert not {".env", "id_rsa"} & {e["name"] for e in listing["entries"]}

    pc = TestClient(app, client=PC)
    assert (
        len(pc.get("/api/files/preview", params=notes).json()["preview_lines"]) == 200
    )
    outside = pc.get("/api/files/preview", params={"path": str(home / "elsewhere.md")})
    assert outside.status_code == 200
