# Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT

"""Paired devices: the PC turns access on, shows a pairing code, and allows,
lists and unpairs devices; a device redeems the code on the listener.

Every route answers 403 while ``device_pairing`` is off in
``~/.gaia/config.json``. Responses are never cached. The invitation appears
only in the response that opens the pairing window, and a device's token only
in the response that pairs it.
"""

from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Dict, Iterator

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from starlette.background import BackgroundTask

from gaia.config import GaiaConfig, GaiaConfigError
from gaia.logger import get_logger

from ..devices import (
    DEVICE_CHANGES_KEPT,
    DEVICE_CHANGES_PAGE,
    DEVICE_PAIRED_ACTIONS,
    DEVICE_PAIRED_EVENT,
    HOME_ROUTE,
    PAIR_LOCKOUT_SECONDS,
    PAIR_ROUTE,
    PAIRING_LOCKOUT_ALERT,
    ROUTES_ROUTE,
    SECURITY_ALERT_EVENT,
    SELF_ROUTE,
    AwayRouteKind,
)
from ..devices.access import (
    AwayRouteRefused,
    DeviceAccess,
    PairingUnavailable,
    iso,
)
from ..devices.changes import mark_device_removed, prune_device_changes
from ..devices.listener import ListenerError
from ..devices.pairing import PairingRefused
from ..devices.storage import DeviceCertificateError, UnsafeDeviceFolderError
from ..models import (
    DeviceAccessStatus,
    DeviceChangeList,
    DevicePairingOffer,
    DevicePairRequest,
    DevicePairResponse,
    DeviceRemoved,
    DeviceRoutes,
    PairedDevice,
    PairedDeviceList,
)
from ..security import (
    ROUTE_SCOPE_KEY,
    allowed_device,
    audit_approval,
    require_allowed_device,
    require_device,
    require_device_listener,
    require_local_pc,
    require_pc_or_allowed_device,
)
from .sessions import emit_pc_event

logger = get_logger(__name__)

#: One refusal for every bad invitation, so a device learns nothing from it.
_REFUSED = "This pairing code can't be used. Show a new code on the PC and scan it."


def require_device_pairing() -> None:
    """403 unless the user turned on ``device_pairing`` in their own config."""
    try:
        enabled = GaiaConfig.load().device_pairing
    except GaiaConfigError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    if not enabled:
        raise HTTPException(
            status_code=403,
            detail="Device pairing is off: it is still in development. Set "
            '"device_pairing": true in ~/.gaia/config.json to try it.',
        )


def _no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"


router = APIRouter(
    prefix="/api/devices",
    tags=["devices"],
    dependencies=[Depends(require_device_pairing), Depends(_no_store)],
)

_AT_THE_PC = [Depends(require_local_pc)]


def _access(request: Request) -> DeviceAccess:
    access: DeviceAccess = request.app.state.devices
    return access


def _refused(code: str, message: str) -> HTTPException:
    return HTTPException(status_code=409, detail={"code": code, "message": message})


@contextmanager
def _folder_checked() -> Iterator[None]:
    """The device table refuses to open once someone else can reach it."""
    try:
        yield
    except UnsafeDeviceFolderError as e:
        raise _refused("unsafe_folder", str(e)) from e


@router.get("/status", response_model=DeviceAccessStatus, dependencies=_AT_THE_PC)
def device_status(request: Request) -> Dict[str, Any]:
    """Whether GAIA listens for devices, the pairing window, recent failures."""
    return _access(request).status()


@router.get("", response_model=PairedDeviceList, dependencies=_AT_THE_PC)
def list_devices(request: Request) -> Dict[str, Any]:
    """Every paired device, pending ones included."""
    access = _access(request)
    with _folder_checked():
        devices = access.devices()
    prune_device_changes(request, [d.id for d in devices])
    counts = request.app.state.db.device_change_counts()
    return {
        "devices": [
            {**access.describe(d), "changes_count": counts.get(d.id, 0)}
            for d in devices
        ]
    }


@router.post("/listener", response_model=DeviceAccessStatus, dependencies=_AT_THE_PC)
async def turn_on_listener(request: Request) -> Dict[str, Any]:
    """Listen for devices on the home network, making the key the first time."""
    access = _access(request)
    try:
        await access.start()
    except ListenerError as e:
        raise _refused(e.code, e.detail) from e
    return access.status()


@router.delete("/listener", response_model=DeviceAccessStatus, dependencies=_AT_THE_PC)
async def turn_off_listener(request: Request) -> Dict[str, Any]:
    """Stop listening for devices, and keep it off across restarts."""
    access = _access(request)
    await access.stop()
    return access.status()


@router.post(
    "/routes/{kind}", response_model=DeviceAccessStatus, dependencies=_AT_THE_PC
)
async def turn_on_route(request: Request, kind: AwayRouteKind) -> Dict[str, Any]:
    """Also let paired devices reach this PC over an away route, such as Tailscale."""
    access = _access(request)
    try:
        await access.set_route(kind, True)
    except KeyError as e:
        raise HTTPException(status_code=404, detail="Not Found") from e
    except AwayRouteRefused as e:
        raise _refused(e.code, e.detail) from e
    return access.status()


@router.delete(
    "/routes/{kind}", response_model=DeviceAccessStatus, dependencies=_AT_THE_PC
)
async def turn_off_route(request: Request, kind: AwayRouteKind) -> Dict[str, Any]:
    """Stop serving an away route, and keep it off across restarts."""
    access = _access(request)
    try:
        await access.set_route(kind, False)
    except KeyError as e:
        raise HTTPException(status_code=404, detail="Not Found") from e
    return access.status()


@router.post("/pairing", response_model=DevicePairingOffer, dependencies=_AT_THE_PC)
def open_pairing(request: Request) -> Dict[str, Any]:
    """Open the pairing window: the code for the PC to show as a QR code."""
    try:
        return _access(request).open_pairing()
    except PairingUnavailable as e:
        raise _refused(e.code, e.detail) from e


@router.delete("/pairing", response_model=DeviceAccessStatus, dependencies=_AT_THE_PC)
def close_pairing(request: Request) -> Dict[str, Any]:
    """Close the pairing window; its code stops working."""
    access = _access(request)
    access.pairing.close()
    return access.status()


@router.post(
    "/pairing/reset", response_model=DeviceAccessStatus, dependencies=_AT_THE_PC
)
async def reset_pairing(request: Request) -> Dict[str, Any]:
    """A new key and pin, and every device unpaired."""
    access = _access(request)
    try:
        await access.reset()
    except UnsafeDeviceFolderError as e:
        raise _refused("unsafe_folder", str(e)) from e
    except DeviceCertificateError as e:
        raise _refused("certificate", str(e)) from e
    except ListenerError as e:
        # The devices were unpaired before the listener failed to come back.
        prune_device_changes(request, [])
        raise _refused(e.code, e.detail) from e
    prune_device_changes(request, [])
    return access.status()


@router.post(
    PAIR_ROUTE.removeprefix("/api/devices"),
    response_model=DevicePairResponse,
    dependencies=[Depends(require_device_listener)],
)
async def pair_device(request: Request, body: DevicePairRequest) -> Dict[str, Any]:
    """Redeem the invitation from the PC's code; the device's token, once."""
    if request.scope.get(ROUTE_SCOPE_KEY) != HOME_ROUTE:
        raise HTTPException(status_code=404, detail="Not Found")
    access = _access(request)
    peer = request.client.host if request.client else ""
    try:
        paired = access.redeem(body.invitation, body.device_name, body.platform, peer)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    except PairingRefused as e:
        if e.locked_out:
            await emit_pc_event(
                {
                    "type": SECURITY_ALERT_EVENT,
                    "kind": PAIRING_LOCKOUT_ALERT,
                    "address": peer,
                    "at": iso(access.now()),
                }
            )
        if e.reason == "rate_limited":
            raise HTTPException(
                status_code=429,
                detail="Too many pairing attempts. Wait a few minutes, then scan "
                "a new code.",
                headers={"Retry-After": str(PAIR_LOCKOUT_SECONDS)},
            ) from e
        raise HTTPException(status_code=403, detail=_REFUSED) from e
    device = access.describe_id(paired["device_id"])
    await emit_pc_event(
        {
            "type": DEVICE_PAIRED_EVENT,
            "device": device,
            "actions": list(DEVICE_PAIRED_ACTIONS),
        }
    )
    return paired


@router.get(
    ROUTES_ROUTE.removeprefix("/api/devices"),
    response_model=DeviceRoutes,
    dependencies=[Depends(require_allowed_device)],
)
def device_routes(request: Request) -> Dict[str, Any]:
    """Every origin this device may reach the PC at: home, then each away route on."""
    return {"origins": _access(request).route_origins()}


@router.delete(SELF_ROUTE.removeprefix("/api/devices"), status_code=204)
def unpair_this_device(
    request: Request, device_id: str = Depends(require_device)
) -> Response:
    """A device unpairs itself with its own token, pending or allowed."""
    access = _access(request)
    access.revoke(device_id, end_requests=False)
    mark_device_removed(request, device_id)
    # Its other streams end once this answer is sent.
    return Response(
        status_code=204,
        headers={"Cache-Control": "no-store"},
        background=BackgroundTask(access.requests.end, device_id),
    )


@router.post("/{device_id}/allow", response_model=PairedDevice, dependencies=_AT_THE_PC)
def allow_device(request: Request, device_id: str) -> Dict[str, Any]:
    """Let a pending device in."""
    access = _access(request)
    with _folder_checked():
        device = access.allow(device_id)
    if device is None:
        raise HTTPException(
            status_code=404,
            detail="No paired device has that id, or it waited more than 10 "
            "minutes to be allowed. Pair it again.",
        )
    audit_approval(request, f"device {device_id} allowed")
    return access.describe(device)


@router.delete("/{device_id}", response_model=DeviceRemoved, dependencies=_AT_THE_PC)
def unpair_device(request: Request, device_id: str) -> Dict[str, Any]:
    """Unpair a device: its next request is refused and its streams end.

    Its changes stay on the PC; ``changes_count`` says how many.
    """
    with _folder_checked():
        gone = _access(request).revoke(device_id)
    if not gone:
        raise HTTPException(status_code=404, detail="No paired device has that id.")
    return {"changes_count": mark_device_removed(request, device_id)}


@router.get(
    "/{device_id}/changes",
    response_model=DeviceChangeList,
    dependencies=[Depends(require_pc_or_allowed_device)],
)
def device_changes(
    request: Request,
    device_id: str,
    limit: int = Query(DEVICE_CHANGES_PAGE, ge=1, le=DEVICE_CHANGES_KEPT),
) -> Dict[str, Any]:
    """What a device changed on this PC, newest first: the PC may read any
    device's, a device only its own."""
    caller = allowed_device(request)
    if caller is not None and caller.device_id != device_id:
        raise HTTPException(
            status_code=403,
            detail="A paired device can see only its own changes. See every "
            "device's on the PC, in Settings > Phones and tablets.",
        )
    access = _access(request)
    with _folder_checked():
        paired = [d.id for d in access.devices()]
    prune_device_changes(request, paired)
    changes, total = request.app.state.db.device_changes(device_id, limit)
    return {
        "changes": [{**c, "at": iso(c["at"])} for c in changes],
        "total": total,
    }
