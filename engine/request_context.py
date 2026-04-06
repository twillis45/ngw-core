"""Request-scoped context for user/session tracing.

Sets user_id, user_email, and session_id via contextvars so that every
log line emitted during a request automatically includes these identifiers.

Usage at request entry point (FastAPI endpoint / middleware)::

    from engine.request_context import set_request_context, clear_request_context

    set_request_context(user_id="abc", user_email="todd@x.com", session_id="sess_123")
    try:
        ... # all downstream code sees the context
    finally:
        clear_request_context()

Usage in log_buffer / formatters::

    from engine.request_context import get_request_context
    ctx = get_request_context()  # {"user_id": ..., "session_id": ..., "user_email": ...}
"""
from __future__ import annotations

import contextvars
from typing import Optional

_user_id: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("ngw_user_id", default=None)
_user_email: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("ngw_user_email", default=None)
_session_id: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("ngw_session_id", default=None)


def set_request_context(
    user_id: Optional[str] = None,
    user_email: Optional[str] = None,
    session_id: Optional[str] = None,
) -> None:
    """Set request-scoped identifiers (call at endpoint entry)."""
    _user_id.set(user_id)
    _user_email.set(user_email)
    _session_id.set(session_id)


def clear_request_context() -> None:
    """Reset all context vars (call in finally block)."""
    _user_id.set(None)
    _user_email.set(None)
    _session_id.set(None)


def get_request_context() -> dict:
    """Return current context as a dict (call in log handler)."""
    return {
        "user_id": _user_id.get(),
        "user_email": _user_email.get(),
        "session_id": _session_id.get(),
    }
