# Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT
"""The mobile app's route access table must match the backend's route guards.

A paired phone hides a control whose route the device listener refuses, so a
stale ``routeAccess.gen.ts`` would show it one that can only fail.
"""

import pytest

from gaia.ui import export_route_access

from .test_route_access import EXPECTED, NOT_ON_LISTENER, PC_ONLY, PC_OR_DEVICE

pytestmark = pytest.mark.allow_network  # in-process app only


@pytest.fixture(scope="module")
def access():
    return export_route_access.build_access()


def test_committed_file_is_current():
    assert (
        export_route_access.main(["--check"]) == 0
    ), f"Regenerate from the repo root: {export_route_access.REGENERATE_HINT}"


def test_check_fails_on_a_stale_file(tmp_path, monkeypatch, capsys):
    stale = tmp_path / "routeAccess.gen.ts"
    stale.write_text("export const ROUTE_ACCESS = {};\n", encoding="utf-8")
    monkeypatch.setattr(export_route_access, "ARTIFACT_PATH", stale)

    assert export_route_access.main(["--check"]) == 1
    assert export_route_access.REGENERATE_HINT in capsys.readouterr().err


def test_classes_match_the_route_access_table(access):
    for name, routes in (
        ("pc", PC_ONLY),
        ("not_on_listener", NOT_ON_LISTENER),
        ("pc_or_device", PC_OR_DEVICE),
    ):
        exported = {key for key, cls in access.items() if cls == name}
        assert exported == routes, name
    api_routes = {
        key
        for key in EXPECTED
        if key.split(" ", 1)[1].startswith(("/api/", "/v1/"))
        and not key.startswith("MOUNT ")
    }
    assert set(access) == api_routes
    assert all(access[key] == EXPECTED[key] for key in access)


def test_doc_table_is_current():
    stale = export_route_access.update_doc(
        export_route_access.DOC_PATH.read_text(encoding="utf-8"),
        export_route_access.build_access(),
    )
    assert stale == export_route_access.DOC_PATH.read_text(
        encoding="utf-8"
    ), f"Regenerate from the repo root: {export_route_access.REGENERATE_HINT}"


def test_doc_update_heals_duplicated_sections(access):
    section = export_route_access.render_doc_section(access)
    doubled = f"intro\n\n{section}\n\nstale row\n\n{section}\n\noutro\n"

    healed = export_route_access.update_doc(doubled, access)

    assert healed == f"intro\n\n{section}\n\noutro\n"
    assert healed.count(export_route_access.DOC_BEGIN) == 1
    assert healed.count("| PC-only |") == 1
    assert "| Setup | `pc`, or an allowed device | " in healed
    assert "`POST /api/setup/npu/memlock-fix`" in healed.split("| Setup |")[1]
