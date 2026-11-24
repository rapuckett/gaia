# Copyright(C) 2025-2026 Advanced Micro Devices, Inc. All rights reserved.
# SPDX-License-Identifier: MIT
"""One daemon per GAIA home, for the daemon's whole life.

:class:`~gaia.daemon.lock.StartLock` serializes clients deciding to spawn; it is
released once the daemon is up, and it lives in the daemon's host dir. Neither
stops a second daemon: a client whose check of a busy daemon failed, or one with
its own ``GAIA_DAEMON_HOME`` but the user's GAIA home, would start one that took
over the first daemon's Lemonade Server and stopped it on its way out.

So each daemon holds an OS lock in the GAIA home it manages (where its Lemonade
Server, automations tick and log live) from the first moment of start-up, and
a second one exits before touching anything. The OS frees the lock when its
holder dies, however it dies.
"""

from __future__ import annotations

import os
import time
from pathlib import Path
from typing import Optional

from gaia.daemon import paths
from gaia.daemon.errors import DaemonStartError
from gaia.daemon.instance import pid_alive, read_instance
from gaia.daemon.lock import try_lock, unlock
from gaia.logger import get_logger

logger = get_logger(__name__)

LOCK_NAME = "daemon.lock"

#: How long a starting daemon waits for the lock: a client's probe holds it for
#: an instant, and a daemon being replaced may still be exiting.
HOLD_WAIT_SECONDS = 5.0

#: The lock this process holds, so its own checks don't see it as another's.
_held: Optional["DaemonHomeLock"] = None


def managed_home() -> Path:
    """The GAIA home a daemon started here manages: its Lemonade root."""
    from gaia.llm.lemonade_embedded import gaia_home

    return gaia_home()


def lock_path(home: Optional[Path] = None) -> Path:
    return (home or managed_home()) / LOCK_NAME


def _is_gaia_daemon(pid: int) -> bool:
    import psutil

    try:
        return "gaia.daemon" in " ".join(psutil.Process(pid).cmdline())
    except psutil.NoSuchProcess:
        return False
    except psutil.AccessDenied:
        return True


def held_elsewhere(home: Optional[Path] = None) -> bool:
    """Whether another process holds the daemon lock of *home* (default: the
    GAIA home this process manages)."""
    path = lock_path(home)
    if _held is not None and _same_dir(_held.path, path):
        return False
    try:
        fd = os.open(str(path), os.O_RDWR)
    except FileNotFoundError:
        return False
    try:
        if not try_lock(fd):
            return True
        unlock(fd)
        return False
    finally:
        os.close(fd)


def _same_dir(a: Path, b: Path) -> bool:
    return os.path.normcase(os.path.realpath(a)) == os.path.normcase(
        os.path.realpath(b)
    )


def registered_elsewhere() -> Optional[str]:
    """Why a daemon registered in this GAIA home's own host dir conflicts with
    this process, whose host dir is elsewhere; None when none does.

    That daemon may predate the lock, so the lock alone would miss it.
    """
    home = managed_home()
    default_host = home / "host"
    if _same_dir(paths.host_dir(), default_host):
        return None
    inst = read_instance(default_host / "instance.json")
    if inst is None or inst.pid == os.getpid():
        return None
    if not (pid_alive(inst.pid) and _is_gaia_daemon(inst.pid)):
        return None
    return (
        f"GAIA daemon pid {inst.pid} is already running for {home}, registered "
        f"in {default_host}, but this one's GAIA_DAEMON_HOME is "
        f"{paths.host_dir()}. GAIA_DAEMON_HOME moves only the daemon's own "
        "files; its Lemonade Server and log follow GAIA_HOME, so both daemons "
        "would manage the same server. Set GAIA_HOME to a separate folder "
        "too, or unset GAIA_DAEMON_HOME."
    )


class DaemonHomeLock:
    """The held lock; released when the process exits, or by :meth:`release`."""

    def __init__(self, fd: int, path: Path):
        self._fd: Optional[int] = fd
        self.path = path

    def release(self) -> None:
        global _held
        if self._fd is None:
            return
        try:
            unlock(self._fd)
        finally:
            os.close(self._fd)
            self._fd = None
            if _held is self:
                _held = None


def hold_daemon_home(wait: float = HOLD_WAIT_SECONDS) -> DaemonHomeLock:
    """Take this GAIA home's daemon lock, or refuse to start.

    Raises:
        DaemonStartError: Another daemon manages this GAIA home.
    """
    global _held
    path = lock_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(str(path), os.O_RDWR | os.O_CREAT, 0o600)
    deadline = time.monotonic() + wait
    while not try_lock(fd):
        if time.monotonic() >= deadline:
            os.close(fd)
            raise DaemonStartError(
                f"not starting: another GAIA daemon is already running for "
                f"{managed_home()} (it holds {path}). Use that one; `gaia "
                "daemon status` shows it, and `gaia daemon restart` replaces it."
            )
        time.sleep(0.05)
    lock = DaemonHomeLock(fd, path)
    _held = lock
    problem = registered_elsewhere()
    if problem is not None:
        lock.release()
        raise DaemonStartError(f"not starting: {problem}")
    return lock


def owner_alive(pid: int, started: Optional[float]) -> bool:
    """Whether the daemon recorded as *pid* (started at *started*) still runs.

    A process GAIA may not inspect counts as alive: an orphan is only reaped on
    proof its owner is gone. A record without a start time can only be checked
    by pid.
    """
    import psutil

    try:
        actual = psutil.Process(pid).create_time()
    except psutil.NoSuchProcess:
        return False
    except psutil.AccessDenied:
        return True
    return started is None or abs(actual - started) < 1.0


def _homes_in_use(home: Path) -> str:
    gaia_home = os.environ.get("GAIA_HOME", "").strip() or "unset"
    daemon_home = os.environ.get(paths.HOME_ENV_VAR, "").strip() or "unset"
    return (
        f"This process manages {home} (GAIA_HOME is {gaia_home}, "
        f"GAIA_DAEMON_HOME is {daemon_home})."
    )


def stop_refusal(
    home: Path,
    server_pid: Optional[int],
    owner_pid: Optional[int],
    owner_started: Optional[float],
) -> Optional[str]:
    """Why this process must not stop the Lemonade Server under *home*; None
    when it may.

    It may not while another live daemon is its recorded owner, or holds
    *home*'s daemon lock: that daemon is serving with it.
    """
    me = os.getpid()
    what = f"GAIA's Lemonade Server (pid {server_pid}) in {home}"
    remedy = (
        "Stop it through that daemon: run `gaia daemon stop` with the same "
        "GAIA_HOME and GAIA_DAEMON_HOME it was started with. A test's cleanup "
        "must set both to its own temporary folders."
    )
    if owner_pid and owner_pid != me and owner_alive(owner_pid, owner_started):
        return (
            f"{what} belongs to GAIA daemon pid {owner_pid}, which is still "
            f"running, so pid {me} left it running. {_homes_in_use(home)} "
            f"{remedy}"
        )
    if held_elsewhere(home):
        return (
            f"{what} is managed by a running GAIA daemon that holds "
            f"{lock_path(home)}, so pid {me} left it running. "
            f"{_homes_in_use(home)} {remedy}"
        )
    return None


def split_home_problem() -> Optional[str]:
    """Why a daemon command run here would act on another GAIA home than its
    host dir belongs to; None when the two agree.

    ``GAIA_DAEMON_HOME`` alone moves only the daemon's own files: its Lemonade
    Server stays in the default GAIA home, the user's.
    """
    override = os.environ.get(paths.HOME_ENV_VAR, "").strip()
    if not override or os.environ.get("GAIA_HOME", "").strip():
        return None
    home = managed_home()
    if _same_dir(Path(override), home / "host"):
        return None
    return (
        f"GAIA_DAEMON_HOME is {override} but GAIA_HOME is unset, so this "
        f"would look for the daemon in {override} and then act on the "
        f"Lemonade Server in the default GAIA home, {home}, which belongs to "
        "whatever daemon runs there. Set GAIA_HOME to the GAIA home that "
        "daemon manages (for a test, its own temporary folder), or unset "
        "GAIA_DAEMON_HOME."
    )
