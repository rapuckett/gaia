# Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT

"""Paired devices: the PC turns access on, shows a pairing code, and allows,
lists and unpairs devices; a device redeems the code on the listener. An
allowed device may also list and unpair devices and close the pairing window;
opening it and allowing a device stay at the PC.

Every route answers 403 while ``device_pairing`` is off in
``~/.gaia/config.json``. Responses are never cached. The invitation appears
only in the response that opens the pairing window, and a device's token only
in the response that pairs it.
"""

from __future__ import annotations

import asyncio
from contextlib import contextmanager
from typing import Any, Dict, Iterator

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
    Request,
    Response,
)
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from starlette.background import BackgroundTask

from gaia.config import GaiaConfig, GaiaConfigError
from gaia.logger import get_logger
from gaia.messaging.discord.cli import PairingKept
from gaia.messaging.discord.state import BridgeStateError

from ..devices import (
    DEVICE_CHANGES_KEPT,
    DEVICE_CHANGES_PAGE,
    DEVICE_PAIRED_ACTIONS,
    DEVICE_PAIRED_EVENT,
    HOME_ROUTE,
    PAIR_LOCKOUT_SECONDS,
    PAIR_ROUTE,
    PAIRING_LOCKOUT_ALERT,
    PUSH_ROUTE,
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
from ..devices.changes import prune_device_changes, record_device_change
from ..devices.listener import ListenerError
from ..devices.pairing import PairingRefused
from ..devices.push import (
    PUSH_HANDLE_BYTES,
    PUSH_KEY_BYTES,
    PUSH_SEND_TOKEN_BYTES,
    PushRefused,
    decode_b64url,
    relay_parts,
    stored_relay_host,
)
from ..devices.storage import DeviceCertificateError, UnsafeDeviceFolderError
from ..devices.store import PushRecord
from ..models import (
    DeviceAccessStatus,
    DeviceChangeList,
    DevicePairingOffer,
    DevicePairRequest,
    DevicePairResponse,
    DevicePushRequest,
    DevicePushStatus,
    DeviceRemoved,
    DeviceRoutes,
    PairedDevice,
    PairedDeviceList,
)
from ..public_address import public_addresses
from ..security import (
    ROUTE_SCOPE_KEY,
    allowed_device,
    audit_approval,
    is_local_pc,
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
# Opening pairing and allowing a device stay at the PC: they are the trust anchor.
_PC_OR_DEVICE = [Depends(require_pc_or_allowed_device)]

#: What a device sees in place of a PC-side failure, which can name PC paths.
DEVICE_ACCESS_ERROR = (
    "Something on the PC is stopping paired devices. Open Settings › Phones "
    "and tablets on the PC to see what."
)


def _access(request: Request) -> DeviceAccess:
    access: DeviceAccess = request.app.state.devices
    return access


#: Unpairing worked, but the Discord pairing the device set up could not be reset.
_DISCORD_KEPT = (PairingKept, BridgeStateError)


def _discord_kept(request: Request, e: Exception, end_device: str = "") -> JSONResponse:
    """A 500 saying so; *end_device*'s other requests end once it is sent."""
    logger.error("A removed device's Discord pairing was kept: %s", e)
    reason = str(e) if is_local_pc(request) else "Open Settings › Messaging on the PC."
    return JSONResponse(
        status_code=500,
        content={
            "detail": "The device was unpaired, but the Discord bot or pairing it set "
            f"up was not reset. {reason} Then set up Discord again."
        },
        headers={"Cache-Control": "no-store"},
        background=(
            BackgroundTask(_access(request).requests.end, end_device)
            if end_device
            else None
        ),
    )


def _refused(code: str, message: str) -> HTTPException:
    return HTTPException(status_code=409, detail={"code": code, "message": message})


@contextmanager
def _folder_checked(request: Request) -> Iterator[None]:
    """The device table refuses to open once someone else can reach it."""
    try:
        yield
    except UnsafeDeviceFolderError as e:
        detail = str(e) if is_local_pc(request) else DEVICE_ACCESS_ERROR
        raise _refused("unsafe_folder", detail) from e


def _status_for(request: Request) -> Dict[str, Any]:
    """The access status; a device gets the error code without its PC-side text."""
    status = _access(request).status()
    if status["error_detail"] and not is_local_pc(request):
        status["error_detail"] = DEVICE_ACCESS_ERROR
    return status


@router.get("/status", response_model=DeviceAccessStatus, dependencies=_PC_OR_DEVICE)
def device_status(request: Request) -> Dict[str, Any]:
    """Whether GAIA listens for devices, the pairing window, recent failures."""
    return _status_for(request)


@router.get("", response_model=PairedDeviceList, dependencies=_PC_OR_DEVICE)
def list_devices(request: Request) -> Dict[str, Any]:
    """Every paired device, pending ones included; never a token or its hash."""
    access = _access(request)
    with _folder_checked(request):
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


@router.delete(
    "/pairing", response_model=DeviceAccessStatus, dependencies=_PC_OR_DEVICE
)
def close_pairing(request: Request) -> Dict[str, Any]:
    """Close the pairing window; its code stops working."""
    _access(request).pairing.close()
    if not is_local_pc(request):
        audit_approval(request, "pairing closed")
        record_device_change(request, "pairingClosed")
    return _status_for(request)


@router.post(
    "/pairing/reset", response_model=DeviceAccessStatus, dependencies=_AT_THE_PC
)
async def reset_pairing(request: Request) -> Dict[str, Any]:
    """A new key and pin, and every device unpaired."""
    access = _access(request)
    try:
        await access.reset()
    except _DISCORD_KEPT as e:
        return _discord_kept(request, e)
    except UnsafeDeviceFolderError as e:
        raise _refused("unsafe_folder", str(e)) from e
    except DeviceCertificateError as e:
        raise _refused("certificate", str(e)) from e
    except ListenerError as e:
        raise _refused(e.code, e.detail) from e
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


_PUSH_PATH = PUSH_ROUTE.removeprefix("/api/devices")

#: Every refused relay lookup, so the answer says nothing about the PC's network.
_PUSH_RELAY_REFUSED = (
    "That push relay can't be used: relay_url must be a public https:// address."
)


def _push_status(request: Request, device_id: str) -> Dict[str, Any]:
    record = _access(request).push_record(device_id)
    if record is None:
        return {"enabled": False, "relay_host": None}
    return {"enabled": True, "relay_host": stored_relay_host(record.relay_url)}


def _checked_push(device_id: str, raw: Any) -> PushRecord:
    """The record a PUT asks for, or 422 naming fields but never their values."""
    try:
        body = DevicePushRequest.model_validate(raw)
    except ValidationError as e:
        fields = sorted({str(err["loc"][0]) for err in e.errors() if err["loc"]})
        raise HTTPException(
            status_code=422,
            detail="Push settings need relay_url, handle, send_token, key and platform "
            f"(apns or fcm), and nothing else. Check: {', '.join(fields) or 'body'}.",
        ) from None
    try:
        relay_parts(body.relay_url)
        decode_b64url(body.handle, PUSH_HANDLE_BYTES, "handle")
        decode_b64url(body.send_token, PUSH_SEND_TOKEN_BYTES, "send_token")
        decode_b64url(body.key, PUSH_KEY_BYTES, "key")
    except PushRefused as e:
        raise HTTPException(status_code=422, detail=str(e)) from None
    return PushRecord(
        device_id=device_id,
        relay_url=body.relay_url,
        handle=body.handle,
        send_token=body.send_token,
        key=body.key,
        platform=body.platform,
    )


@router.put(
    _PUSH_PATH,
    response_model=DevicePushStatus,
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "application/json": {"schema": DevicePushRequest.model_json_schema()}
            },
        }
    },
)
async def turn_on_push(
    request: Request, device_id: str = Depends(require_allowed_device)
) -> Dict[str, Any]:
    """This device's notifications go through the relay it names, encrypted with its key."""
    try:
        raw = await request.json()
    except ValueError:
        raise HTTPException(
            status_code=422, detail="Push settings must be a JSON object."
        ) from None
    record = _checked_push(device_id, raw)
    host, port, _ = relay_parts(record.relay_url)
    try:
        await asyncio.to_thread(public_addresses, host, port)
    except (OSError, ValueError):
        raise HTTPException(status_code=422, detail=_PUSH_RELAY_REFUSED) from None
    access = _access(request)
    if not access.set_push(record):
        raise HTTPException(status_code=403, detail="This device is no longer paired.")
    audit_approval(request, "push turned on")
    return _push_status(request, device_id)


@router.get(_PUSH_PATH, response_model=DevicePushStatus)
def push_status(
    request: Request, device_id: str = Depends(require_allowed_device)
) -> Dict[str, Any]:
    """Whether this device has push on; never its send token or key."""
    return _push_status(request, device_id)


@router.delete(_PUSH_PATH, response_model=DevicePushStatus)
def turn_off_push(
    request: Request, device_id: str = Depends(require_allowed_device)
) -> Dict[str, Any]:
    """This device gets no more notifications from this PC."""
    if _access(request).drop_push(device_id):
        audit_approval(request, "push turned off")
    return {"enabled": False, "relay_host": None}


@router.delete(SELF_ROUTE.removeprefix("/api/devices"), status_code=204)
def unpair_this_device(
    request: Request, device_id: str = Depends(require_device)
) -> Response:
    """A device unpairs itself with its own token, pending or allowed."""
    access = _access(request)
    try:
        access.revoke(device_id, end_requests=False)
    except _DISCORD_KEPT as e:
        return _discord_kept(request, e, end_device=device_id)
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
    with _folder_checked(request):
        device = access.allow(device_id)
    if device is None:
        raise HTTPException(
            status_code=404,
            detail="No paired device has that id, or it waited more than 10 "
            "minutes to be allowed. Pair it again.",
        )
    audit_approval(request, f"device {device_id} allowed")
    return access.describe(device)


@router.delete("/{device_id}", response_model=DeviceRemoved, dependencies=_PC_OR_DEVICE)
def unpair_device(
    request: Request, device_id: str, background: BackgroundTasks
) -> Dict[str, Any]:
    """Unpair a device: its next request is refused and its streams end.

    An allowed device may unpair itself or any other device. Its changes stay
    on the PC; ``changes_count`` says how many.
    """
    access = _access(request)
    caller = allowed_device(request)
    itself = caller is not None and caller.device_id == device_id
    kept = None
    with _folder_checked(request):
        removed = access.describe_id(device_id)
        # A device unpairing itself keeps this request; its others end after.
        try:
            gone = access.revoke(device_id, end_requests=not itself)
        except _DISCORD_KEPT as e:
            gone, kept = True, e
    if not gone:
        raise HTTPException(status_code=404, detail="No paired device has that id.")
    if caller is not None:
        audit_approval(request, f"device {device_id} unpaired")
        name = removed["name"] if removed else None
        record_device_change(
            request,
            "deviceRemoved",
            device_id=device_id,
            **({"device": name} if name else {}),
        )
    if kept is not None:
        return _discord_kept(request, kept, end_device=device_id if itself else "")
    if itself:
        background.add_task(access.requests.end, device_id)
    return {"changes_count": request.app.state.db.device_change_count(device_id)}


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
    with _folder_checked(request):
        paired = [d.id for d in access.devices()]
    prune_device_changes(request, paired)
    changes, total = request.app.state.db.device_changes(device_id, limit)
    return {
        "changes": [{**c, "at": iso(c["at"])} for c in changes],
        "total": total,
    }
