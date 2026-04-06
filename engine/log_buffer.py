"""In-memory circular log buffer for the NGW server-logs Lab endpoint.

Captures the last N log records emitted by any logger in the process.
Thread-safe via a simple lock.  Installed once at startup via install().

Usage::

    # main.py startup
    from engine import log_buffer
    log_buffer.install()

    # lab endpoint
    from engine.log_buffer import get_records
    records = get_records(limit=200, level="ERROR")
"""
from __future__ import annotations

import collections
import logging
import threading
from typing import List, Optional

_BUFFER_SIZE = 1000
_buffer: collections.deque = collections.deque(maxlen=_BUFFER_SIZE)
_lock = threading.Lock()

# Loggers too noisy to include in the browser panel (high-volume, low-signal)
_SUPPRESS = {
    "uvicorn.access",
    "watchfiles.main",
    "httpcore.http11",
    "httpcore.connection",
    "httpx",
}


class _MemHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        if record.name in _SUPPRESS:
            return
        try:
            entry = {
                "ts": record.created,
                "level": record.levelname,
                "name": record.name,
                "msg": record.getMessage(),
                "exc": self.formatException(record.exc_info) if record.exc_info else None,
            }
            with _lock:
                _buffer.append(entry)
        except Exception:  # noqa: BLE001
            pass


_handler = _MemHandler()
_handler.setLevel(logging.DEBUG)
_installed = False


def install() -> None:
    """Attach the memory handler to the root logger.  Safe to call multiple times."""
    global _installed
    if _installed:
        return
    logging.getLogger().addHandler(_handler)
    _installed = True


def get_records(
    limit: int = 200,
    level: Optional[str] = None,
    search: Optional[str] = None,
) -> List[dict]:
    """Return recent log records, newest first."""
    with _lock:
        records = list(_buffer)

    records.reverse()  # newest first

    if level:
        lv = level.upper()
        records = [r for r in records if r["level"] == lv]

    if search:
        sl = search.lower()
        records = [r for r in records if sl in r["msg"].lower() or sl in r["name"].lower()]

    return records[:limit]
