# Copyright(C) 2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT

"""GPU memory step of setup and Settings: see :mod:`gaia.llm.gpu_memory`.

The TUI reads the same functions through ``/daemon/v1/gpu-memory``.
"""

from __future__ import annotations

import subprocess
from typing import Any, Callable, Dict, List, Literal, Optional, Union

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from gaia.llm import gpu_memory
from gaia.llm.gpu_memory import (
    METHOD_APPLY,
    METHOD_GUIDED,
    METHOD_UNSUPPORTED,
    PENDING_NOT_APPLIED,
    PENDING_RESTART,
    PENDING_TOOK_EFFECT,
)
from gaia.logger import get_logger

from ..devices.changes import record_device_change
from ..devices.prompts import AdminPrompt
from ..models import WireModel
from ..security import (
    audit_approval,
    is_local_pc,
    require_pc_or_allowed_device,
    require_ui_header,
)

logger = get_logger(__name__)

router = APIRouter(tags=["gpu-memory"])

# Starts a root step on this PC; an allowed device's request waits on the PC's
# administrator prompt, which only someone at the PC can answer.
_PC_OR_DEVICE = [Depends(require_ui_header), Depends(require_pc_or_allowed_device)]

#: What a device hears instead of a failure whose text names PC paths or output.
DEVICE_GPU_MEMORY_ERROR = (
    "GAIA couldn't change GPU memory on the PC. Open GPU memory in Settings on "
    "the PC to see why."
)


_SETTING_GB = "GPU memory to set, in decimal GB (10**9 bytes)."

_Number = Union[int, float]


class GpuMemorySetting(WireModel):
    """The knob the user changes, in decimal GB."""

    name: str
    current_gb: float
    min_gb: float
    max_gb: float


class GpuMemoryPreset(WireModel):
    """A share of memory to offer, and the models it unlocks."""

    setting_gb: float
    gpu_gb: float
    unlocks: List[str]


class GpuMemoryModel(WireModel):
    """A model GAIA could run, and the share it needs."""

    id: str
    size_gb: _Number
    need_gb: float
    default: bool
    fits_now: bool
    fits_at_setting_gb: Optional[float]


class GpuMemoryPending(WireModel):
    """A change waiting for a restart, or checked after one."""

    setting_gb: _Number
    previous_setting_gb: Optional[_Number]
    source: Optional[Literal["apply", "revert", "guided"]]
    recorded_at: Optional[str]
    state: Literal[PENDING_RESTART, PENDING_TOOK_EFFECT, PENDING_NOT_APPLIED]


class GpuMemoryRevert(WireModel):
    """Whether GAIA can undo its own change."""

    available: bool
    previous_setting_gb: Optional[_Number]


class GpuMemoryStatusResponse(WireModel):
    """The GPU memory split. A PC the step doesn't apply to sends only the first six fields."""

    applies: bool
    show_in_setup: bool
    hidden_reason: Optional[str]
    os: str
    method: Literal[METHOD_APPLY, METHOD_GUIDED, METHOD_UNSUPPORTED]
    method_reason: str
    total_gb: Optional[float] = None
    gpu_gb: Optional[float] = None
    cpu_gb: Optional[float] = None
    setting: Optional[GpuMemorySetting] = None
    reserve_gb: Optional[float] = None
    needs_admin: Optional[bool] = None
    needs_restart: Optional[bool] = None
    presets: Optional[List[GpuMemoryPreset]] = None
    recommended_setting_gb: Optional[float] = None
    models: Optional[List[GpuMemoryModel]] = None
    pending: Optional[GpuMemoryPending] = None
    revert: Optional[GpuMemoryRevert] = None
    guided_steps: Optional[List[str]] = None
    guided_value: Optional[str] = None


class GpuMemoryApplyRequest(BaseModel):
    setting_gb: float = Field(description=_SETTING_GB)
    confirm: bool = False


class GpuMemoryRevertRequest(BaseModel):
    confirm: bool = False


class GpuMemoryPendingRequest(BaseModel):
    setting_gb: float = Field(description=_SETTING_GB)


def _answer(call: Callable[[], Dict[str, Any]]) -> Dict[str, Any]:
    try:
        return call()
    except gpu_memory.GpuMemoryError as e:
        raise HTTPException(status_code=e.status, detail=str(e)) from e


def _device_detail(e: gpu_memory.GpuMemoryError) -> str:
    text = str(e)
    if e.status >= 500 or "/" in text:
        return DEVICE_GPU_MEMORY_ERROR
    return text


def _from_device(
    request: Request,
    action: str,
    what: str,
    call: Callable[[Callable[[], None]], Dict[str, Any]],
) -> Dict[str, Any]:
    """*call* for an allowed device, which hears how the PC's prompt went."""
    prompt = AdminPrompt(request, action)
    try:
        result = call(prompt.before_prompt)
    except gpu_memory.PermissionNotGiven as e:
        prompt.finish("denied")
        raise HTTPException(status_code=e.status, detail=_device_detail(e)) from e
    except gpu_memory.GpuMemoryError as e:
        timed_out = isinstance(e.__cause__, subprocess.TimeoutExpired)
        # Answered but the step failed: the device's error says so, not the event.
        prompt.finish("timeout" if timed_out else "approved")
        logger.warning("GPU memory %s from a device failed: %s", what, e)
        raise HTTPException(status_code=e.status, detail=_device_detail(e)) from e
    prompt.finish("approved")
    audit_approval(request, f"GPU memory {what}")
    record_device_change(request, "gpuMemoryChanged", action=action)
    return result


# Reads this PC's memory through Lemonade, so a cross-site GET must not reach it.
@router.get(
    "/api/gpu-memory",
    dependencies=[Depends(require_ui_header)],
    response_model=GpuMemoryStatusResponse,
    response_model_exclude_unset=True,
)
def get_gpu_memory(setting_gb: Optional[float] = None) -> Dict[str, Any]:
    """The split now, what a bigger share unlocks, and how to change it."""
    return _answer(lambda: gpu_memory.status(setting_gb))


@router.post(
    "/api/gpu-memory/apply",
    dependencies=_PC_OR_DEVICE,
    response_model=GpuMemoryStatusResponse,
    response_model_exclude_unset=True,
)
def apply_gpu_memory(body: GpuMemoryApplyRequest, request: Request) -> Dict[str, Any]:
    """Set the GPU's share after admin permission; takes effect after a restart."""
    if is_local_pc(request):
        return _answer(lambda: gpu_memory.apply(body.setting_gb, body.confirm))
    return _from_device(
        request,
        "gpuMemoryApply",
        f"set to {body.setting_gb} GB",
        lambda before: gpu_memory.apply(body.setting_gb, body.confirm, before),
    )


@router.post(
    "/api/gpu-memory/revert",
    dependencies=_PC_OR_DEVICE,
    response_model=GpuMemoryStatusResponse,
    response_model_exclude_unset=True,
)
def revert_gpu_memory(body: GpuMemoryRevertRequest, request: Request) -> Dict[str, Any]:
    """Put back the setting GAIA replaced; takes effect after a restart."""
    if is_local_pc(request):
        return _answer(lambda: gpu_memory.revert(body.confirm))
    return _from_device(
        request,
        "gpuMemoryRevert",
        "change undone",
        lambda before: gpu_memory.revert(body.confirm, before),
    )


@router.post(
    "/api/gpu-memory/pending",
    dependencies=[Depends(require_ui_header)],
    response_model=GpuMemoryStatusResponse,
    response_model_exclude_unset=True,
)
def record_gpu_memory_pending(body: GpuMemoryPendingRequest) -> Dict[str, Any]:
    """Remember a value the user sets by hand, to check it after the restart."""
    return _answer(lambda: gpu_memory.record_pending(body.setting_gb))


@router.delete(
    "/api/gpu-memory/pending",
    dependencies=[Depends(require_ui_header)],
    response_model=GpuMemoryStatusResponse,
    response_model_exclude_unset=True,
)
def dismiss_gpu_memory_pending() -> Dict[str, Any]:
    """Stop reporting the pending change ("Keep current"). Changes nothing."""
    return _answer(gpu_memory.dismiss_pending)
