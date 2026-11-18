# Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT

"""What each paired device changed on the PC, so the PC can show it.

A row names the change (``kind``, a camelCase id the PC and the phone
translate) and its labels (``params``: a provider or connector name, never a
key or token). A device's rows are kept while it is paired, its newest
:data:`DEVICE_CHANGES_KEPT` only, then :data:`REMOVED_DEVICE_CHANGES_DAYS`
after it is removed. Pruning runs whenever a row is written or the list read.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import Request

from gaia.logger import get_logger

from ..security import allowed_device
from . import (
    DEVICE_CHANGE_PARAM_MAX,
    DEVICE_CHANGE_SECRET_PARAMS,
    DEVICE_CHANGES_KEPT,
    REMOVED_DEVICE_CHANGES_DAYS,
)

logger = get_logger(__name__)

_KIND_MAX = 64
_RETENTION_SECONDS = REMOVED_DEVICE_CHANGES_DAYS * 86400


def _checked_params(kind: str, params: Dict[str, Any]) -> Dict[str, Any]:
    """*params* as stored; ValueError for a secret's name or a non-label value."""
    if not kind or len(kind) > _KIND_MAX:
        raise ValueError(f"A device change needs a kind of 1-{_KIND_MAX} characters")
    for name, value in params.items():
        if name.lower() in DEVICE_CHANGE_SECRET_PARAMS:
            raise ValueError(
                f"Device change {kind!r} was given {name!r}: a change records "
                "what changed, never a key, token or password."
            )
        if value is not None and not isinstance(value, (str, int, float, bool)):
            raise ValueError(
                f"Device change {kind!r} param {name!r} must be a plain value, "
                f"not {type(value).__name__}"
            )
        if isinstance(value, str) and len(value) > DEVICE_CHANGE_PARAM_MAX:
            raise ValueError(
                f"Device change {kind!r} param {name!r} is over "
                f"{DEVICE_CHANGE_PARAM_MAX} characters; params are labels"
            )
    return dict(params)


def record_device_change(request: Request, kind: str, **params: Any) -> None:
    """Note that the allowed device behind *request* made a change; for the PC
    or anyone else, nothing.

    Raises:
        ValueError: *params* names a secret or holds something other than a label.
    """
    device = allowed_device(request)
    if device is None:
        return
    stored = _checked_params(kind, params)
    now = request.app.state.devices.now()
    db = request.app.state.db
    db.add_device_change(device.device_id, kind, stored, now, DEVICE_CHANGES_KEPT)
    db.prune_device_changes(None, now, now - _RETENTION_SECONDS)
    logger.info("Device %s changed %s on the PC", device.device_id, kind)


def prune_device_changes(request: Request, paired: Optional[List[str]]) -> None:
    """Start the retention clock on devices not in *paired*; drop expired rows."""
    now = request.app.state.devices.now()
    request.app.state.db.prune_device_changes(paired, now, now - _RETENTION_SECONDS)


def mark_device_removed(request: Request, device_id: str) -> int:
    """Start *device_id*'s retention clock; how many changes it made."""
    now = request.app.state.devices.now()
    db = request.app.state.db
    count = db.mark_device_removed(device_id, now)
    db.prune_device_changes(None, now, now - _RETENTION_SECONDS)
    return count
