"""
NGW Background Scheduler
========================
Async background task loop for the scheduled analytics ingestion pipeline.
Runs inside the FastAPI lifespan — no external process manager required.

Configuration
-------------
Can be controlled entirely at runtime via the LAB UI (no restart needed):
  POST /api/lab/learning/scheduler/start   — start with optional config override
  POST /api/lab/learning/scheduler/stop    — stop running task
  PATCH /api/lab/learning/scheduler        — update interval/window, restart if running
  POST /api/lab/learning/scheduler/run-now — trigger immediate run, reset timer

Environment variables (used only for auto-start on server boot)
---------------
  ENABLE_SCHEDULER       Set to "1" or "true" to auto-start at boot.
  INGEST_INTERVAL_HOURS  Default interval when auto-started (default: 24).
  INGEST_WINDOW_DAYS     Default analytics lookback window (default: 30).

Runtime config always overrides env vars once set via the API.
"""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# ── Runtime config (writable by API) ─────────────────────────────────────────
# These are the live values used by the loop. Env vars seed the defaults;
# PATCH /scheduler overwrites these without a restart.

_config: Dict[str, Any] = {
    "interval_hours": 24,
    "window_days":    30,
}

# ── In-memory status (read-only from outside) ─────────────────────────────────

_status: Dict[str, Any] = {
    "enabled":         False,
    "interval_hours":  24,
    "window_days":     30,
    "last_run_at":     None,   # ISO-8601
    "last_run_result": None,   # summary dict from ingest_from_analytics()
    "last_run_error":  None,   # error string or None
    "next_run_at":     None,   # ISO-8601
    "run_count":       0,
    "started_by":      None,   # "boot" | "api"
}

_task: Optional[asyncio.Task] = None

# Flag set by run_now() to wake the loop early
_run_now_event: Optional[asyncio.Event] = None


# ── Public read API ───────────────────────────────────────────────────────────

def get_scheduler_status() -> Dict[str, Any]:
    """Return a copy of the current scheduler status."""
    return dict(_status)


def is_task_running() -> bool:
    return _task is not None and not _task.done()


# ── Env-var defaults (used only at boot) ──────────────────────────────────────

def _env_enabled() -> bool:
    return os.getenv("ENABLE_SCHEDULER", "").strip().lower() in ("1", "true", "yes")

def _env_interval() -> int:
    try:
        return max(1, int(os.getenv("INGEST_INTERVAL_HOURS", "24")))
    except ValueError:
        return 24

def _env_window() -> int:
    try:
        return max(7, min(90, int(os.getenv("INGEST_WINDOW_DAYS", "30"))))
    except ValueError:
        return 30


# ── Core execution ────────────────────────────────────────────────────────────

async def _run_ingestion_once() -> None:
    """Execute one ingestion pass and update status. Uses live _config values."""
    from engine.learning.ingestion import ingest_from_analytics

    window = _config["window_days"]
    logger.info("[scheduler] ingestion started — window_days=%d", window)
    _status["last_run_at"]    = datetime.now(timezone.utc).isoformat()
    _status["last_run_error"] = None

    try:
        result = ingest_from_analytics(days=window)
        _status["last_run_result"] = result
        _status["run_count"]      += 1
        logger.info(
            "[scheduler] ingestion complete — clusters_created=%s clusters_updated=%s",
            result.get("clusters_created", "?"),
            result.get("clusters_updated", "?"),
        )
    except Exception as exc:
        _status["last_run_error"] = str(exc)
        logger.exception("[scheduler] ingestion failed: %s", exc)


async def _scheduler_loop(warmup_secs: int = 60) -> None:
    """
    Main scheduler loop. Runs until cancelled.
    warmup_secs: delay before the first run (0 when started via API).
    """
    global _run_now_event
    _run_now_event = asyncio.Event()

    _status["enabled"]        = True
    _status["interval_hours"] = _config["interval_hours"]
    _status["window_days"]    = _config["window_days"]

    logger.info(
        "[scheduler] started — interval=%dh window=%dd warmup=%ds",
        _config["interval_hours"], _config["window_days"], warmup_secs,
    )

    if warmup_secs > 0:
        try:
            await asyncio.wait_for(_run_now_event.wait(), timeout=warmup_secs)
            _run_now_event.clear()
        except asyncio.TimeoutError:
            pass

    while True:
        _status["next_run_at"] = datetime.now(timezone.utc).isoformat()

        await _run_ingestion_once()

        # Refresh loop config (may have changed via PATCH while running)
        interval_secs = _config["interval_hours"] * 3600
        _status["interval_hours"] = _config["interval_hours"]
        _status["window_days"]    = _config["window_days"]

        next_ts = datetime.now(timezone.utc).timestamp() + interval_secs
        _status["next_run_at"] = datetime.fromtimestamp(
            next_ts, tz=timezone.utc
        ).isoformat()

        logger.info(
            "[scheduler] sleeping %dh until %s",
            _config["interval_hours"], _status["next_run_at"],
        )

        try:
            await asyncio.wait_for(_run_now_event.wait(), timeout=interval_secs)
            _run_now_event.clear()
            logger.info("[scheduler] run-now triggered, skipping wait")
        except asyncio.TimeoutError:
            pass  # Normal — interval elapsed


# ── Control API (called by routes) ────────────────────────────────────────────

def _create_task(warmup_secs: int = 60) -> None:
    global _task
    _task = asyncio.create_task(
        _scheduler_loop(warmup_secs=warmup_secs),
        name="ngw-scheduler",
    )


def start_scheduler(
    interval_hours: Optional[int] = None,
    window_days:    Optional[int] = None,
    warmup_secs:    int           = 60,
    started_by:     str           = "boot",
) -> Dict[str, Any]:
    """
    Start the scheduler. Can be called from lifespan startup or an API route.

    Args:
        interval_hours: override interval (uses env/current config if None)
        window_days:    override window  (uses env/current config if None)
        warmup_secs:    initial delay before first run (0 for immediate)
        started_by:     attribution label ("boot" | "api")

    Returns current status dict.
    """
    if is_task_running():
        logger.warning("[scheduler] already running — ignoring start()")
        return get_scheduler_status()

    # Apply config (explicit args > current _config > env defaults)
    _config["interval_hours"] = interval_hours or _config.get("interval_hours") or _env_interval()
    _config["window_days"]    = window_days    or _config.get("window_days")    or _env_window()
    _status["started_by"]     = started_by

    _create_task(warmup_secs=warmup_secs)
    logger.info("[scheduler] task started (by=%s)", started_by)
    return get_scheduler_status()


def stop_scheduler() -> Dict[str, Any]:
    """
    Stop the scheduler. Safe to call even if not running.
    Returns current status dict.
    """
    global _task

    if _task and not _task.done():
        _task.cancel()
        logger.info("[scheduler] task cancelled")

    _status["enabled"]    = False
    _status["next_run_at"] = None
    return get_scheduler_status()


def configure_scheduler(
    interval_hours: Optional[int] = None,
    window_days:    Optional[int] = None,
) -> Dict[str, Any]:
    """
    Update config. If the scheduler is running, restarts it immediately
    (no warmup) so the new interval takes effect.

    Returns current status dict.
    """
    was_running = is_task_running()

    if interval_hours is not None:
        _config["interval_hours"] = max(1, interval_hours)
    if window_days is not None:
        _config["window_days"] = max(7, min(90, window_days))

    if was_running:
        stop_scheduler()
        # Restart immediately with no warmup, preserving run history
        return start_scheduler(warmup_secs=0, started_by="api")

    # Not running — just update config for next start
    _status["interval_hours"] = _config["interval_hours"]
    _status["window_days"]    = _config["window_days"]
    return get_scheduler_status()


def trigger_run_now() -> Dict[str, Any]:
    """
    Wake the sleeping loop immediately to run an ingestion pass now.
    If the scheduler is not running, starts it (no warmup).

    Returns current status dict.
    """
    if not is_task_running():
        return start_scheduler(warmup_secs=0, started_by="api")

    if _run_now_event:
        _run_now_event.set()
        logger.info("[scheduler] run-now event set")

    return get_scheduler_status()


# ── Lifespan boot hook ────────────────────────────────────────────────────────

def boot_scheduler() -> None:
    """
    Called from FastAPI lifespan startup. Auto-starts only if ENABLE_SCHEDULER=1.
    Seeds config from env vars.
    """
    _config["interval_hours"] = _env_interval()
    _config["window_days"]    = _env_window()

    if not _env_enabled():
        logger.info("[scheduler] auto-start disabled (set ENABLE_SCHEDULER=1 to enable)")
        return

    start_scheduler(warmup_secs=60, started_by="boot")
