# Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT
"""Separate what code printed from the log records in captured output."""


def printed_lines(captured, caplog):
    """The lines of ``captured`` that are not log records ``caplog`` saw.

    GAIA's console handler writes to the current stderr, so once logging is
    configured its records land in ``capsys`` output next to real prints.
    """
    logged = {
        part
        for message in caplog.messages
        for part in message.splitlines()
        if part.strip()
    }
    return [
        line
        for line in captured.splitlines()
        if not any(part in line for part in logged)
    ]
