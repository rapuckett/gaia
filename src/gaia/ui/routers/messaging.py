# Copyright(C) 2025-2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT
"""Settings → Messaging: connect, pair and run the Discord bridge.

Every route calls the same functions as ``gaia discord`` (``gaia.messaging.
discord.cli``), so the app and the terminal can never disagree about what
"connected" or "paired" means.

An allowed paired device may read the status, start, stop and restart the
bridge, forget its "Always allow" answers, connect a bot token, pair and
disconnect. Whoever DMs the pairing code becomes the only person the bot
answers, the approver of commands on this PC, so a device sees the code only
for a pairing it started. Unpairing the device that connected the token
disconnects the bridge, and unpairing the one that started the pairing resets
it, as does either device expiring (``unlink_devices``). Every device write is
audited and listed among its changes; the token is never returned or logged.
Mobile access and pending devices reach none of it.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, Union

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from gaia.logger import get_logger
from gaia.messaging.discord import state as bridge_state

from ..devices.changes import record_device_change
from ..models import WireModel
from ..security import (
    allowed_device,
    audit_approval,
    is_local_pc,
    require_pc_or_allowed_device,
    require_ui_header,
)

log = get_logger(__name__)

router = APIRouter(prefix="/api/messaging", tags=["messaging"])

_PC_OR_DEVICE = [Depends(require_ui_header), Depends(require_pc_or_allowed_device)]

#: A device's view of a failure, whose own text can name a log path or the keyring.
DEVICE_BRIDGE_ERROR = (
    "The Discord bridge has a problem on the PC. Open Settings › Messaging on "
    "the PC to see what."
)
_FAILED_STATES = (
    bridge_state.STATE_ERROR,
    bridge_state.STATE_CREDENTIALS_UNAVAILABLE,
    bridge_state.STATE_TOKEN_INVALID,
)


class DiscordConnectRequest(BaseModel):
    token: str
    model: Optional[str] = None


class DiscordStartRequest(BaseModel):
    model: Optional[str] = None
    take_over: bool = False


DiscordState = Literal[  # type: ignore[valid-type]
    (
        bridge_state.STATE_STOPPED,
        bridge_state.STATE_STARTING,
        bridge_state.STATE_PAIRING,
        bridge_state.STATE_CONNECTED,
        bridge_state.STATE_TAKEN_OVER,
        bridge_state.STATE_TOKEN_INVALID,
        bridge_state.STATE_CREDENTIALS_UNAVAILABLE,
        bridge_state.STATE_CONFLICT,
        bridge_state.STATE_ERROR,
    )
]


class DiscordStatus(WireModel):
    """Connection, pairing and bridge state, plus every link setup opens."""

    connected: bool
    paired: bool
    running: bool
    state: DiscordState
    detail: str
    bot_name: str
    owner_name: str
    autostart: bool
    #: What "Always allow" was given for; empty until paired.
    always_allowed: List[str]
    model: str
    portal_url: str
    bot_page_url: str
    invite_url: str
    bot_profile_url: str
    pairing_code: str
    pairing_expires_at: Union[int, float]
    discord_installed: bool
    should_offer_setup: bool


class DiscordConnectResult(WireModel):
    """What a stored bot token gives the apps to show next."""

    connected: bool
    bot_name: str
    application_id: str
    invite_url: str
    bot_page_url: str
    bot_public: bool


class DiscordConnectResponse(WireModel):
    """The stored token's bot, and the bridge's state once it started."""

    connect: DiscordConnectResult
    status: DiscordStatus
    status: DiscordStatus


def _cli():
    from gaia.messaging.discord import cli

    return cli


def _device_id(request: Request) -> str:
    """The allowed device behind *request*, or empty for the PC."""
    device = allowed_device(request)
    return device.device_id if device else ""


def _drop_stale_device_links(request: Request) -> None:
    """Undo the Discord setup of a device that expired or is no longer allowed."""
    from gaia.messaging.discord import cli

    access = getattr(request.app.state, "devices", None)
    live = None
    if access is not None:
        live = [d.id for d in access.devices() if d.allowed]
    try:
        cli.unlink_stale_devices(live)
    except (cli.PairingKept, bridge_state.BridgeStateError) as e:
        log.error("A device that is no longer paired kept its Discord setup: %s", e)
        detail = str(e) if is_local_pc(request) else DEVICE_BRIDGE_ERROR
        raise HTTPException(status_code=500, detail=detail) from e


def _status(request: Optional[Request] = None) -> Dict[str, Any]:
    """The bridge's status; off the PC, without PC-side text, and with the
    pairing code only for the device that started that pairing."""
    if request is not None:
        _drop_stale_device_links(request)
    status = _cli().status(detect=False)
    if request is None or is_local_pc(request):
        return status
    started_by = bridge_state.load_config().pairing_device_id
    if not started_by or started_by != _device_id(request):
        status["pairing_code"] = ""
    if status["state"] in _FAILED_STATES:
        status["detail"] = DEVICE_BRIDGE_ERROR
    return status


def _audit(request: Request, what: str, action: str) -> None:
    """Audit a device's control of the bridge and list it among its changes."""
    if not is_local_pc(request):
        audit_approval(request, f"Discord bridge {what}")
        record_device_change(request, "discordControl", action=action)


@router.get(
    "/discord",
    dependencies=[Depends(require_pc_or_allowed_device)],
    response_model=DiscordStatus,
    response_model_exclude_unset=True,
)
def discord_status(request: Request) -> Dict[str, Any]:
    """Connection, pairing and bridge state, plus every link setup opens."""
    return _status(request)


def _without_token(text: str, token: str) -> str:
    token = token.strip()
    return text.replace(token, "<token>") if token else text


#: Said when a failed connect from a device couldn't bring back the bridge it stopped.
BRIDGE_NOT_RESTARTED = (
    "The Discord bridge was stopped for the change and did not start again; "
    "start it in Settings › Messaging."
)


def _restart(cli: Any) -> bool:
    """Start the bridge again after a failed change; False, logged, if it didn't."""
    try:
        code = cli.start_detached(emit=lambda _line: None)
    except Exception as e:  # noqa: BLE001 - reported to the caller as not restarted
        log.error(
            "The Discord bridge did not start again after a failed connect: %s", e
        )
        return False
    if code:
        log.error("The Discord bridge did not start again after a failed connect")
    return not code


@router.post(
    "/discord/connect",
    dependencies=_PC_OR_DEVICE,
    response_model=DiscordConnectResponse,
    response_model_exclude_unset=True,
)
def discord_connect(request: Request, body: DiscordConnectRequest) -> Dict[str, Any]:
    """Check and store a bot token, then start the bridge in pairing mode."""
    from gaia.messaging.discord.transport import DiscordTokenError

    cli = _cli()
    on_pc = is_local_pc(request)
    was_running = not on_pc and bridge_state.is_running()
    # The running bridge would save its own copy of the config over this one.
    if was_running and not cli.stop():
        raise HTTPException(
            status_code=500,
            detail="The Discord bridge did not stop, so the token was not "
            "changed. " + cli.stop_failed_hint(),
        )
    try:
        if on_pc:
            result = cli.connect(body.token)
        else:
            result = cli.connect(body.token, started_by=_device_id(request))
    except Exception as e:  # noqa: BLE001 - a stopped bridge comes back or is named
        detail = _without_token(str(e), body.token)
        refused = isinstance(e, (ValueError, DiscordTokenError))
        if not refused:
            log.error("Discord connect failed: %s", detail)
            if not on_pc:
                detail = DEVICE_BRIDGE_ERROR
        if was_running and not _restart(cli):
            detail += " " + BRIDGE_NOT_RESTARTED
        raise HTTPException(status_code=400 if refused else 502, detail=detail) from e
    cli.start_detached(model=body.model, emit=lambda _line: None)
    _audit(request, "bot token connected", "connect")
    return {"connect": result, "status": _status(request)}


@router.post(
    "/discord/start",
    dependencies=_PC_OR_DEVICE,
    response_model=DiscordStatus,
    response_model_exclude_unset=True,
)
def discord_start(request: Request, body: DiscordStartRequest) -> Dict[str, Any]:
    """Start the bridge, or take the lease from another PC only when asked to."""
    cli = _cli()
    if body.take_over and not cli.stop():
        raise HTTPException(
            status_code=500,
            detail="The Discord bridge did not stop, so it could not restart. "
            + cli.stop_failed_hint(),
        )
    cli.start_detached(model=body.model, take_over=body.take_over, emit=lambda _l: None)
    if body.take_over:
        _audit(request, "taken over from another PC", "takeOver")
    else:
        _audit(request, "started", "start")
    return _status(request)


@router.post(
    "/discord/stop",
    dependencies=_PC_OR_DEVICE,
    response_model=DiscordStatus,
    response_model_exclude_unset=True,
)
def discord_stop(request: Request) -> Dict[str, Any]:
    cli = _cli()
    if not cli.stop(stay_stopped=True):
        raise HTTPException(
            status_code=500,
            detail="The Discord bridge did not stop. " + cli.stop_failed_hint(),
        )
    _audit(request, "stopped", "stop")
    return _status(request)


@router.post(
    "/discord/restart",
    dependencies=_PC_OR_DEVICE,
    response_model=DiscordStatus,
    response_model_exclude_unset=True,
)
def discord_restart(request: Request) -> Dict[str, Any]:
    cli = _cli()
    if not cli.stop():
        raise HTTPException(
            status_code=500,
            detail="The Discord bridge did not stop, so it was not restarted. "
            + cli.stop_failed_hint(),
        )
    cli.start_detached(emit=lambda _line: None)
    _audit(request, "restarted", "restart")
    return _status(request)


@router.post(
    "/discord/forget-always",
    dependencies=_PC_OR_DEVICE,
    response_model=DiscordStatus,
    response_model_exclude_unset=True,
)
def discord_forget_always(request: Request) -> Dict[str, Any]:
    """Forget every "Always allow"; GAIA asks again from the next request."""
    cli = _cli()
    # The running agent holds its own copy of the answers, so it is restarted.
    was_running = bridge_state.is_running()
    if was_running and not cli.stop():
        raise HTTPException(
            status_code=500,
            detail="The Discord bridge did not stop, so nothing was forgotten. "
            + cli.stop_failed_hint(),
        )
    bridge_state.forget_always()
    if was_running:
        cli.start_detached(emit=lambda _line: None)
    _audit(request, '"Always allow" answers forgotten', "forgetAlways")
    return _status(request)


@router.post(
    "/discord/pair",
    dependencies=_PC_OR_DEVICE,
    response_model=DiscordStatus,
    response_model_exclude_unset=True,
)
def discord_pair(request: Request) -> Dict[str, Any]:
    """Forget the paired account and show a new code."""
    cli = _cli()
    if not cli.stop():
        raise HTTPException(
            status_code=500,
            detail="The Discord bridge did not stop, so the pairing was kept. "
            + cli.stop_failed_hint(),
        )
    if is_local_pc(request):
        cli.reset_pairing()
    else:
        cli.reset_pairing(started_by=_device_id(request))
    cli.start_detached(emit=lambda _line: None)
    _audit(request, "pairing started for a new account", "pair")
    return _status(request)


@router.post(
    "/discord/disconnect",
    dependencies=_PC_OR_DEVICE,
    response_model=DiscordStatus,
    response_model_exclude_unset=True,
)
def discord_disconnect(request: Request) -> Dict[str, Any]:
    """Stop the bridge and forget the token, the pairing and the status."""
    try:
        _cli().disconnect()
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    _audit(request, "disconnected", "disconnect")
    return _status(request)


def autostart_discord() -> None:
    """Startup job: bring back a bridge that is set to autostart."""
    result = _cli().ensure_started()
    if result not in (None, 0):
        log.warning("The Discord bridge did not autostart: %s", _status().get("detail"))
