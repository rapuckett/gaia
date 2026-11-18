# Copyright(C) 2025-2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT

"""GAIA's logs and the model server's, for the Agent UI's log viewer.

Every line is redacted before it is sent (:mod:`gaia.log_reader`). Lines can
still quote a conversation, so the routes need the UI header and answer the PC
running GAIA or a paired device it allowed, never mobile access. A device picks
a log by the names GAIA lists and sees file names, never where they are on the PC.
"""

from __future__ import annotations

import asyncio
from pathlib import PurePath
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from ..models import LogReadResponse, LogSourcesResponse
from ..security import (
    allowed_device,
    hide_pc_folders,
    require_pc_or_allowed_device,
    require_ui_header,
)

router = APIRouter(tags=["logs"])

_LOG_ACCESS = [Depends(require_ui_header), Depends(require_pc_or_allowed_device)]


def _file_name(path: str) -> str:
    return PurePath(path).name


def _for_device(read: Dict[str, Any]) -> Dict[str, Any]:
    """*read* with the log's place on the PC reduced to its file name."""
    full = read.get("log_path")
    if full:
        read["log_path"] = _file_name(full)
        if read.get("detail"):
            read["detail"] = read["detail"].replace(full, read["log_path"])
    if read.get("detail"):
        read["detail"] = hide_pc_folders(read["detail"])
    return read


def _sources_for_device(sources: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    for source in sources:
        for f in source["files"]:
            f["path"] = _file_name(f["path"])
    return sources


@router.get(
    "/api/logs",
    response_model=LogSourcesResponse,
    dependencies=_LOG_ACCESS,
)
def list_logs(request: Request) -> Dict[str, Any]:
    """Each log source and the files it has now."""
    from gaia.log_sources import describe_sources

    if allowed_device(request) is None:
        return {"sources": describe_sources()}
    return {"sources": _sources_for_device(describe_sources(symlinks=False))}


@router.get(
    "/api/logs/{source}",
    response_model=LogReadResponse,
    dependencies=_LOG_ACCESS,
)
async def read_log(
    request: Request,
    source: str,
    file: Optional[str] = Query(None, max_length=200),
    after: Optional[str] = Query(None, max_length=32),
    limit: int = Query(1000, ge=1, le=5000),
) -> Dict[str, Any]:
    """A log's last lines, or only those after *after* (a cursor it returned).

    *source* and *file* are names GAIA lists; a path is a **404**.
    """
    device = allowed_device(request) is not None
    try:
        result = await _read(source, file, after, limit, device=device)
    except HTTPException as e:
        if device and e.status_code == 409:
            e.detail = hide_pc_folders(str(e.detail))
        raise
    return _for_device(result) if device else result


async def _read(
    source: str,
    file: Optional[str],
    after: Optional[str],
    limit: int,
    *,
    device: bool,
) -> Dict[str, Any]:
    from gaia.config import GaiaConfigError
    from gaia.llm import lemonade_choice as choice
    from gaia.llm.lemonade_logs import known_secrets, read_lemonade_log
    from gaia.log_reader import LogRead, read_log_file
    from gaia.log_sources import UnknownLogError, find_file

    try:
        if source == "model_server":
            result = await read_lemonade_log(after=after, limit=limit)
            return result.to_dict()
        found = find_file(source, file, symlinks=not device)
    except UnknownLogError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except (choice.LemonadeChoiceError, GaiaConfigError) as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    if found is None:
        return LogRead(reason="no_file").to_dict()
    secrets, note = await asyncio.to_thread(known_secrets)
    offset = int(after) if after and after.isdigit() else None
    result = await asyncio.to_thread(
        read_log_file, found.path, after=offset, limit=limit, secrets=secrets
    )
    if note and result.detail is None:
        result.detail = note
    return result.to_dict()
