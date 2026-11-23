# Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT

"""A paired device sees a document's path home-relative; the PC sees it whole."""

import json
from pathlib import Path

import pytest

from gaia.ui.security import device_display_path

from . import test_device_changes

paired = test_device_changes.paired


@pytest.fixture
def fake_home(tmp_path, monkeypatch):
    home = tmp_path / "home"
    home.mkdir()
    monkeypatch.setattr(Path, "home", lambda: home)
    monkeypatch.setenv("GAIA_HOME", str(tmp_path / "gaia-home"))
    return home


def test_inside_home_is_home_relative(fake_home):
    path = fake_home / "Documents" / "report.pdf"
    assert device_display_path(str(path)) == "~/Documents/report.pdf"


@pytest.mark.usefixtures("fake_home")
def test_outside_home_is_the_file_name(tmp_path):
    assert device_display_path(str(tmp_path / "gaia-home" / "a.pdf")) == "a.pdf"
    assert device_display_path("/mnt/other/drive/b.pdf") == "b.pdf"


@pytest.mark.usefixtures("fake_home")
def test_empty_stays_empty():
    assert device_display_path("") == ""


def test_listing_shows_the_pc_the_full_path_and_a_device_home_relative(
    fake_home, paired
):
    app, _, clients, _, _ = paired
    path = str(fake_home / "Documents" / "report.pdf")
    app.state.db.add_document(
        filename="report.pdf", filepath=path, file_hash="h", file_size=1, chunk_count=1
    )
    pc = clients["pc"].get("/api/documents").json()["documents"][0]
    phone = clients["phone"].get("/api/documents").json()["documents"][0]
    assert pc["filepath"] == path
    assert phone["filepath"] == "~/Documents/report.pdf"


def test_chat_stream_shows_the_pc_the_full_path_and_a_device_home_relative(
    fake_home, paired
):
    from gaia.ui.run_manager import Run, run_manager

    app, _, clients, _, _ = paired
    path = str(fake_home / "Documents" / "report.pdf")
    run = Run("sess-docs")
    run.emit(
        "data: "
        + json.dumps(
            {
                "type": "done",
                "content": "ok",
                "documents_added": [{"id": "d1", "filepath": path}],
            }
        )
        + "\n\n"
    )
    run.finish()
    run_manager._runs["sess-docs"] = run
    try:
        seen = {}
        for who in ("pc", "phone"):
            resp = clients[who].get(
                "/api/chat/attach", params={"session_id": "sess-docs"}
            )
            assert resp.status_code == 200, resp.text
            line = next(ln for ln in resp.text.splitlines() if "documents_added" in ln)
            seen[who] = json.loads(line[len("data: ") :])["documents_added"][0][
                "filepath"
            ]
    finally:
        run_manager._runs.pop("sess-docs", None)
    assert seen == {"pc": path, "phone": "~/Documents/report.pdf"}


def test_an_unparseable_documents_frame_reaches_a_device_without_the_home_path(
    fake_home, caplog
):
    from gaia.ui._chat_helpers import _hide_pc_paths

    path = fake_home / "Documents" / "report.pdf"
    broken = f'data: {{"type": "done", "documents_added": [{{"filepath": "{path}"\n\n'
    with caplog.at_level("ERROR"):
        shown = _hide_pc_paths(broken)
    assert str(fake_home) not in shown
    assert "your home folder" in shown
    assert "done" in caplog.text and str(fake_home) not in caplog.text


def test_a_malformed_documents_list_is_not_sent_whole_to_a_device(fake_home):
    from gaia.ui._chat_helpers import _hide_pc_paths

    frame = f'data: {{"type": "done", "documents_added": "{fake_home}/a.pdf"}}\n\n'
    assert str(fake_home) not in _hide_pc_paths(frame)
