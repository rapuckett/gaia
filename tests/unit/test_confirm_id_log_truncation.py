# Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT

"""A dropped tool decision logs only a short prefix of each approval id."""

import logging
import threading

from gaia.ui.sse_handler import SSEOutputHandler

LIVE_ID = "live0123-4567-89ab-cdef-0123456789ab"
STALE_ID = "stale987-6543-21fe-dcba-9876543210fe"


def _waiting_handler():
    handler = SSEOutputHandler()
    with handler._confirm_lock:
        handler._confirm_id = LIVE_ID
        handler._confirm_event = threading.Event()
        handler._confirm_tool = "write_file"
        handler._confirm_args = {}
    return handler


def test_a_dropped_decision_logs_only_id_prefixes(caplog):
    handler = _waiting_handler()
    with caplog.at_level(logging.WARNING, logger="gaia.ui.sse_handler"):
        assert handler.resolve_tool_confirmation(True, confirm_id=STALE_ID) is False
    assert STALE_ID not in caplog.text
    assert LIVE_ID not in caplog.text
    assert STALE_ID[:6] in caplog.text
    assert LIVE_ID[:6] in caplog.text
