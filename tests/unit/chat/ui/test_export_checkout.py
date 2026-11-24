# Copyright(C) 2025-2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT
"""The exporters refuse to write into a checkout other than the one imported."""

import pytest

from gaia.ui import _export_checkout, export_openapi, export_route_access

EXPORTERS = [export_route_access, export_openapi]


@pytest.mark.parametrize("exporter", EXPORTERS)
def test_matching_checkout_proceeds(exporter, monkeypatch):
    monkeypatch.chdir(_export_checkout.MODULE_CHECKOUT)
    assert exporter.main(["--check"]) == 0


@pytest.mark.parametrize("exporter", EXPORTERS)
def test_other_checkout_is_refused(exporter, tmp_path, monkeypatch, capsys):
    other = tmp_path / "other"
    (other / "src" / "gaia").mkdir(parents=True)
    (other / "src" / "gaia" / "__init__.py").write_text("")
    monkeypatch.chdir(other)

    assert exporter.main([]) == 2
    err = capsys.readouterr().err
    assert str(_export_checkout.MODULE_CHECKOUT) in err
    assert str(other.resolve()) in err
    assert f"PYTHONPATH set to {other.resolve() / 'src'}" in err
    assert "$PWD" not in err


@pytest.mark.parametrize("exporter", EXPORTERS)
def test_outside_any_checkout_is_refused(exporter, tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)

    assert exporter.main(["--check"]) == 2
    assert "repo root" in capsys.readouterr().err
