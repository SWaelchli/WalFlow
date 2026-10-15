"""Resource limits for solver runs (F2-13): a cooperative deadline and a cap on concurrent solves.

A running thread cannot be killed, so the solver calls check_deadline() from its residual function;
that is evaluated in every Newton / LM iteration, so a run stops within one iteration of the deadline.
The deadline is a ContextVar, so it follows the work into asyncio.to_thread.
"""
import os
import threading
import time
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Optional

_DEADLINE: ContextVar[Optional[float]] = ContextVar("walflow_solve_deadline", default=None)


class SolveTimeout(Exception):
    """The solve ran longer than WALFLOW_SOLVE_TIMEOUT_S."""


def _env_number(name: str, default: float, cast=float, minimum=None):
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        value = cast(raw)
    except ValueError:
        return default
    if minimum is not None and value < minimum:
        return default
    return value


def solve_timeout_s() -> float:
    """WALFLOW_SOLVE_TIMEOUT_S: seconds one run (all relief passes, or all cases of /batch) may take. 0 = off."""
    return _env_number("WALFLOW_SOLVE_TIMEOUT_S", 60.0, float, 0.0)


def max_nodes() -> int:
    """WALFLOW_MAX_NODES: largest diagram accepted for simulation."""
    return _env_number("WALFLOW_MAX_NODES", 500, int, 1)


def max_cases() -> int:
    """WALFLOW_MAX_CASES: most operating cases accepted by /batch."""
    return _env_number("WALFLOW_MAX_CASES", 20, int, 1)


def max_concurrent_solves() -> int:
    """WALFLOW_MAX_CONCURRENT_SOLVES: solves running at once (default: CPU count)."""
    return _env_number("WALFLOW_MAX_CONCURRENT_SOLVES", max(1, os.cpu_count() or 1), int, 1)


@contextmanager
def solve_deadline(seconds: Optional[float] = None):
    """Run the block with a deadline; check_deadline() raises SolveTimeout once it has passed."""
    seconds = solve_timeout_s() if seconds is None else seconds
    token = _DEADLINE.set(time.monotonic() + seconds if seconds and seconds > 0 else None)
    try:
        yield
    finally:
        _DEADLINE.reset(token)


def check_deadline():
    deadline = _DEADLINE.get()
    if deadline is not None and time.monotonic() > deadline:
        raise SolveTimeout(f"The simulation exceeded the time limit of {solve_timeout_s():g} s and was stopped.")


_slots: Optional[threading.BoundedSemaphore] = None
_slots_size = 0
_slots_lock = threading.Lock()


def solve_slot():
    """Context manager holding one of the concurrent-solve slots (blocks while all are busy)."""
    global _slots, _slots_size
    size = max_concurrent_solves()
    with _slots_lock:
        if _slots is None or _slots_size != size:
            _slots, _slots_size = threading.BoundedSemaphore(size), size
        sem = _slots
    return sem


def run_limited(fn, *args, **kwargs):
    """Call fn under a solve slot and a fresh deadline (use inside the worker thread)."""
    with solve_slot():
        with solve_deadline():
            return fn(*args, **kwargs)

