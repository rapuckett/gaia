# Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT

"""The OS key store's states as the Agent UI's API reports them.

A response field ``key_store`` is ``"waiting"`` while the store's unlock prompt
is still open on the PC, ``"locked"`` once it was refused or closed, and null
when the store answered. A 409 or 423 that a key-store wait or lock caused
carries ``{"code": "key_store_waiting" | "key_store_locked", "message": ...}``
as its detail, so clients never match the message's English.
"""

from __future__ import annotations

from typing import Dict, Literal, Optional, Union

#: ``key_store`` while the OS store's unlock prompt is still open on the PC.
KEY_STORE_WAITING = "waiting"
#: ``key_store`` once that prompt was refused or closed; GAIA holds off asking.
KEY_STORE_LOCKED = "locked"
KeyStoreState = Literal["waiting", "locked"]

#: An error detail's ``code`` for a request the key store's open prompt held up.
KEY_STORE_WAITING_CODE = "key_store_waiting"
#: An error detail's ``code`` for a request the locked key store refused.
KEY_STORE_LOCKED_CODE = "key_store_locked"

_CODES = {
    KEY_STORE_WAITING: KEY_STORE_WAITING_CODE,
    KEY_STORE_LOCKED: KEY_STORE_LOCKED_CODE,
}


def key_store_state(e: Optional[BaseException]) -> Optional[KeyStoreState]:
    """``locked`` or ``waiting`` when *e*, or an exception it was raised from, is
    a key-store lock or wait; else None.

    Follows ``__cause__`` only: a key-store error a handler merely saw while
    raising another one is not that error's cause.
    """
    from gaia.connectors.credential_wait import (
        CredentialStoreLocked,
        CredentialStoreWaiting,
    )
    from gaia.connectors.store import KeyringRefused

    seen = set()
    while e is not None and id(e) not in seen:
        seen.add(id(e))
        # CredentialStoreLocked is a CredentialStoreWaiting, so it goes first.
        if isinstance(e, (CredentialStoreLocked, KeyringRefused)):
            return KEY_STORE_LOCKED
        if isinstance(e, CredentialStoreWaiting):
            return KEY_STORE_WAITING
        e = e.__cause__
    return None


def key_store_detail(
    e: BaseException, status: int, message: str
) -> Union[str, Dict[str, str]]:
    """The HTTP detail for *message*: coded when *e* is a 409/423 key-store wait or lock.

    The message text is unchanged either way; only its shape gains the code.
    """
    state = key_store_state(e) if status in (409, 423) else None
    if state is None:
        return message
    return {"code": _CODES[state], "message": message}


__all__ = [
    "KEY_STORE_LOCKED",
    "KEY_STORE_LOCKED_CODE",
    "KEY_STORE_WAITING",
    "KEY_STORE_WAITING_CODE",
    "KeyStoreState",
    "key_store_detail",
    "key_store_state",
]
