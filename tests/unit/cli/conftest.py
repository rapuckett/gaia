# Copyright(C) 2025-2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT
"""Every test here may run ``gaia.cli.main``, which installs GAIA's log handlers."""

import pytest


@pytest.fixture(autouse=True)
def _restore_gaia_logging(restore_gaia_logging):
    """Take the handlers ``configure()`` installs out again after each test."""
