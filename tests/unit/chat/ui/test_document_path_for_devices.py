# Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT

"""A paired device sees a document's path home-relative; the PC sees it whole."""

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
