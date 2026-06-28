"""Shared automation state: loop status dict, interruptible sleep, and threading primitives."""
import threading
import time

_loop_status: dict = {"state": "idle", "msg": "", "cycle": 0, "wait_until": 0}

launch_stop  = threading.Event()
launch_mutex = threading.Lock()


def set_status(state: str, msg: str, cycle: int = 0, wait_until: float = 0.0) -> None:
    _loop_status["state"]      = state
    _loop_status["msg"]        = msg
    _loop_status["cycle"]      = cycle
    _loop_status["wait_until"] = wait_until


def get_status() -> dict:
    """Return the live status dict by reference (mutations propagate to the loop)."""
    return _loop_status


def sleep(secs: float) -> bool:
    """Sleep for *secs* seconds, waking early if launch_stop is set.

    Returns False if the sleep was interrupted, True if it ran to completion.
    """
    deadline = time.time() + secs
    while time.time() < deadline:
        if launch_stop.is_set():
            return False
        time.sleep(min(0.3, max(0.0, deadline - time.time())))
    return True


def wait_interruptible() -> None:
    """Block until _loop_status['wait_until'], honouring /skip_wait or a new launch."""
    while time.time() < _loop_status["wait_until"] and not launch_stop.is_set():
        time.sleep(0.5)
