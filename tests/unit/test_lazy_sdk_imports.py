# Copyright(C) 2025-2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT
"""`import gaia` must not pay for the Anthropic and OpenAI SDKs (~1.3 s)."""

import os
import subprocess
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parents[2] / "src"


def test_import_gaia_does_not_load_sdks():
    env = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
    env["PYTHONPATH"] = str(SRC)
    code = (
        "import sys, gaia; import gaia.llm.providers.claude, "
        "gaia.llm.lemonade_client, gaia.eval.claude; "
        "print('anthropic' in sys.modules, 'openai' in sys.modules)"
    )
    result = subprocess.run(
        [sys.executable, "-c", code],
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "False False"
