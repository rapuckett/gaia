# Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT

"""Away from the PC, file reads stay inside one chat's folders and never
reach a secret.

Mobile access and paired devices name the chat they read for. Previews,
images, folder listings, searches and documents added by path then see only
what that chat may touch, as its session panel lists it, GAIA's secret-file
policy still refuses keys and ``.env`` files inside it, and a preview is
capped. A library document holding credentials is never served away from the
PC. The PC's own reads are unchanged.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from gaia import security as gaia_security
from gaia.ui import server as server_mod
from gaia.ui.routers.files import REMOTE_PREVIEW_MAX_LINES
from gaia.ui.server import create_app

from .device_scope import ALLOWED, PC, on_listener

pytestmark = pytest.mark.allow_network  # TestClient only; nothing leaves the machine

TUNNEL = {"X-Forwarded-For": "203.0.113.7"}
UI = {"X-Gaia-UI": "1"}


@pytest.fixture
def home(mock_home, monkeypatch):
    # The home folder is never a chat's working folder, so no default scope.
    monkeypatch.chdir(mock_home)
    ssh = mock_home / ".ssh"
    ssh.mkdir()
    (ssh / "id_ed25519").write_text("-----BEGIN OPENSSH PRIVATE KEY-----\n")
    (ssh / "config").write_text("Host build\n  IdentityFile ~/.ssh/id_ed25519\n")
    docker = mock_home / ".docker"
    docker.mkdir()
    (docker / "config.json").write_text('{"auths": {"ghcr.io": "registry-secret"}}')
    monkeypatch.setattr(gaia_security, "SECRET_DIRECTORIES", {str(ssh), str(docker)})
    project = mock_home / "project"
    project.mkdir()
    (project / "notes.md").write_text("\n".join(f"line {i}" for i in range(300)))
    (project / ".env").write_text("TOKEN=project-secret\n")
    (project / "id_rsa").write_text("-----BEGIN RSA PRIVATE KEY-----\n")
    (project / "chart.png").write_bytes(b"\x89PNG\r\n\x1a\n")
    (project / "credentials.json").write_text('{"token": "project-secret"}')
    (mock_home / "elsewhere.md").write_text("not this chat's\n")
    return mock_home


@pytest.fixture
def indexed(monkeypatch):
    """The files the library indexed; each yields one chunk."""
    seen = []

    async def index(path, display_name=None, **_):
        seen.append(display_name or path.name)
        return 1

    monkeypatch.setattr(server_mod, "_index_document", index)
    return seen


@pytest.fixture
def app(home, indexed):
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
    started = device.get("/api/files/browse", params={"session_id": chat}).json()
    assert started["current_path"] == started["quick_links"][0]["path"]

    pc = TestClient(app, client=PC)
    assert (
        len(pc.get("/api/files/preview", params=notes).json()["preview_lines"]) == 200
    )
    outside = pc.get("/api/files/preview", params={"path": str(home / "elsewhere.md")})
    assert outside.status_code == 200


def _caller(app, device, caller):
    if caller == "device":
        return device
    return TestClient(app, client=PC, headers=TUNNEL)


@pytest.mark.parametrize("caller", ["device", "tunnel"])
@pytest.mark.parametrize(
    "route, target, chat_name",
    [
        ("upload-path", ".docker/config.json", "wide"),
        ("upload-path", "project/credentials.json", "chat"),
        ("upload-path", "elsewhere.md", "chat"),
        ("upload-path", "project/notes.md", None),
        ("index-folder", ".docker", "wide"),
        ("index-folder", "project", None),
    ],
    ids=[
        "credential-folder-in-scope",
        "credential-name-in-the-chat",
        "outside-the-chat",
        "upload-names-no-chat",
        "index-credential-folder",
        "index-names-no-chat",
    ],
)
def test_remote_document_adds_refused(
    app, device, chat, wide, home, indexed, caller, route, target, chat_name
):
    client = _caller(app, device, caller)
    body = (
        {"filepath": str(home / target)}
        if route == "upload-path"
        else {"folder_path": str(home / target)}
    )
    params = (
        {"session_id": {"chat": chat, "wide": wide}[chat_name]} if chat_name else {}
    )
    resp = client.post(f"/api/documents/{route}", json=body, params=params, headers=UI)
    assert resp.status_code == 403
    assert indexed == [] and app.state.db.list_documents() == []


def test_remote_folder_index_skips_secrets(device, chat, home, indexed):
    resp = device.post(
        "/api/documents/index-folder",
        json={"folder_path": str(home / "project")},
        params={"session_id": chat},
        headers=UI,
    )
    assert resp.status_code == 200
    names = {d["filename"] for d in resp.json()["documents"]}
    assert "notes.md" in names and "credentials.json" not in names
    assert "notes.md" in indexed and "credentials.json" not in indexed


def test_remote_folder_index_skips_items_outside_the_chat(
    device, chat, home, indexed, monkeypatch
):
    # A walk that reached through a linked folder, as a swap mid-walk would.
    project = home / "project"
    (project / "linked").symlink_to(home)
    real_rglob = Path.rglob

    def rglob(self, pattern):
        yield from real_rglob(self, pattern)
        if self == project:
            yield project / "linked" / "elsewhere.md"

    monkeypatch.setattr(Path, "rglob", rglob)
    resp = device.post(
        "/api/documents/index-folder",
        json={"folder_path": str(project)},
        params={"session_id": chat},
        headers=UI,
    )
    assert resp.status_code == 200
    assert "notes.md" in indexed and "elsewhere.md" not in indexed


@pytest.mark.parametrize("caller", ["device", "tunnel"])
def test_library_credential_file_not_served_away_from_the_pc(app, device, home, caller):
    # A row recorded before the policy, or by the PC, is judged when read.
    doc = app.state.db.add_document(
        filename="config.json",
        filepath=str(home / ".docker" / "config.json"),
        file_hash="h" * 64,
        file_size=40,
        chunk_count=1,
    )
    resp = _caller(app, device, caller).get(f"/api/documents/{doc['id']}/file")
    assert resp.status_code == 403 and "registry-secret" not in resp.text


def test_pc_adds_any_document_and_a_device_its_chats(app, device, chat, home):
    pc = TestClient(app, client=PC)
    added = pc.post(
        "/api/documents/upload-path",
        json={"filepath": str(home / ".docker" / "config.json")},
        headers=UI,
    )
    assert added.status_code == 200
    served = pc.get(f"/api/documents/{added.json()['id']}/file")
    assert served.status_code == 200 and "registry-secret" in served.text
    assert (
        pc.post(
            "/api/documents/index-folder",
            json={"folder_path": str(home / "project")},
            headers=UI,
        ).json()["indexed"]
        > 0
    )
    notes = device.post(
        "/api/documents/upload-path",
        json={"filepath": str(home / "project" / "notes.md")},
        params={"session_id": chat},
        headers=UI,
    )
    assert notes.status_code == 200
