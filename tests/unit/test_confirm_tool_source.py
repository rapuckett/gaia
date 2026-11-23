# Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT

"""confirm-tool takes ``source: notification``."""

import logging
import threading

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from gaia.ui import _chat_helpers as helpers
from gaia.ui.database import ChatDatabase
from gaia.ui.routers.chat import router as chat_router
from gaia.ui.sse_handler import SSEOutputHandler

LIVE_ID = "live0123-4567-89ab-cdef-0123456789ab"


def _waiting_handler():
    handler = SSEOutputHandler()
    with handler._confirm_lock:
        handler._confirm_id = LIVE_ID
        handler._confirm_event = threading.Event()
        handler._confirm_tool = "write_file"
        handler._confirm_args = {}
    return handler


@pytest.fixture
def client():
    db = ChatDatabase(":memory:")
    app = FastAPI()
    app.include_router(chat_router)
    app.state.db = db
    app.state.session_locks = {}
    handler = _waiting_handler()
    helpers._active_sse_handlers["src-session"] = handler
    yield TestClient(app), handler
    helpers._active_sse_handlers.pop("src-session", None)
    db.close()


def _post(c, **body):
    return c.post(
        "/api/chat/confirm-tool",
        json={"session_id": "src-session", "confirm_id": LIVE_ID, **body},
    )


def test_a_notification_deny_is_answered_and_logged_as_such(client, caplog):
    c, handler = client
    with caplog.at_level(logging.INFO, logger="gaia.ui.routers.chat"):
        resp = _post(c, approved=False, source="notification")
    assert resp.status_code == 200, resp.text
    assert handler._confirm_event.is_set()
    assert handler._confirm_result is False
    assert "via notification" in caplog.text
    assert LIVE_ID not in caplog.text
    assert LIVE_ID[:6] in caplog.text


def test_no_source_is_the_in_app_card(client, caplog):
    c, handler = client
    with caplog.at_level(logging.INFO, logger="gaia.ui.routers.chat"):
        resp = _post(c, approved=True)
    assert resp.status_code == 200, resp.text
    assert handler._confirm_result is True
    assert "notification" not in caplog.text


def test_an_unknown_source_is_a_422_and_answers_nothing(client):
    c, handler = client
    resp = _post(c, approved=False, source="email")
    assert resp.status_code == 422
    assert not handler._confirm_event.is_set()
