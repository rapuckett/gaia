# Copyright(C) 2024-2025 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT

"""Mobile access tunnel endpoints for GAIA Agent UI.

Manages ngrok tunnels for remote/mobile access to the local server. Only the
PC running GAIA may start or stop the tunnel, and only it sees the token.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request

from ..dependencies import get_tunnel
from ..security import is_local_pc, require_local_pc
from ..tunnel import TunnelManager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["tunnel"])


@router.post("/api/tunnel/start", dependencies=[Depends(require_local_pc)])
async def start_tunnel(tunnel: TunnelManager = Depends(get_tunnel)):
    """Start ngrok tunnel for mobile access."""
    try:
        logger.info("Starting mobile access tunnel...")
        status = await tunnel.start()
        return status
    except Exception as e:
        logger.error("Failed to start tunnel: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to start tunnel. Check server logs for details.",
        )


@router.post("/api/tunnel/stop", dependencies=[Depends(require_local_pc)])
async def stop_tunnel(tunnel: TunnelManager = Depends(get_tunnel)):
    """Stop ngrok tunnel."""
    try:
        logger.info("Stopping mobile access tunnel...")
        await tunnel.stop()
        return {"active": False}
    except Exception as e:
        logger.error("Failed to stop tunnel: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to stop tunnel. Check server logs for details.",
        )


@router.get("/api/tunnel/status")
async def tunnel_status(request: Request, tunnel: TunnelManager = Depends(get_tunnel)):
    """Get current tunnel status; the token is shown to the PC only."""
    status = tunnel.get_status()
    if not is_local_pc(request):
        status["token"] = None
    return status
