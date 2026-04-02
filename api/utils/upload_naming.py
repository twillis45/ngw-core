"""Canonical upload filename generation.

Provides a deterministic, machine-friendly naming scheme for uploaded images
that is safe for storage keys, analytics joins, and directory listings.

Pattern
-------
    <origin>_<pattern>_<sanitized_stem>_<timestamp>_<short_id>.<ext>

Examples
--------
    upload_unknown_img_4838_20260401t203612z_c2b7e190.jpg
    upload_loop_corporate_soft_key_20260401t203455z_a91f3c2d.jpg
    ref_unknown_dsc_0177_20260401t214500z_f1a2b3c4.jpg

Rules
-----
- All lowercase, underscores only (no hyphens, no spaces).
- Original filename is NOT the canonical key — it is preserved separately.
- Pattern segment defaults to "unknown" at upload time (before analysis runs).
- Retroactive renaming is explicitly *not* done: canonical name is set once at
  ingest and never changed.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

__all__ = ["slugify_stem", "canonical_upload_name"]


def slugify_stem(name: str) -> str:
    """Return a safe, lowercase, underscore-only slug from a filename stem.

    >>> slugify_stem("IMG_4838.JPG")
    'img_4838'
    >>> slugify_stem("My Photo - final (2).jpeg")
    'my_photo_final_2'
    >>> slugify_stem("")
    'image'
    """
    stem = Path(name).stem.lower().strip()
    # Collapse hyphens, spaces, and dots into underscores
    stem = re.sub(r"[-\s.]+", "_", stem)
    # Strip anything that isn't a lowercase alphanum or underscore
    stem = re.sub(r"[^a-z0-9_]+", "", stem)
    # Collapse repeated underscores and strip leading/trailing
    stem = re.sub(r"_+", "_", stem).strip("_")
    return stem or "image"


def canonical_upload_name(
    original_filename: str,
    *,
    pattern: str = "unknown",
    origin: str = "upload",
    short_id: str | None = None,
    now: datetime | None = None,
) -> str:
    """Generate a canonical storage key / filename for an uploaded image.

    Parameters
    ----------
    original_filename:
        The raw filename as received from the HTTP upload (e.g. ``"IMG_4838.JPG"``).
        Only the stem and extension are used — the original is preserved
        separately in metadata, not embedded in the canonical name.
    pattern:
        Lighting pattern if known at ingest time.  Defaults to ``"unknown"``.
        Must be resolved *before* calling this function — never pass a
        guessed or post-analysis value retroactively.
    origin:
        Source tag, e.g. ``"upload"``, ``"ref"``, ``"dataset"``.
        Kept short (≤16 chars).
    short_id:
        8-hex-char unique suffix.  Auto-generated via :func:`uuid.uuid4` when
        *None* (the default).
    now:
        UTC datetime used for the timestamp segment.  Defaults to
        ``datetime.now(timezone.utc)``.  Useful for deterministic tests.

    Returns
    -------
    str
        e.g. ``"upload_unknown_img_4838_20260401t203612z_c2b7e190.jpg"``
    """
    ext = Path(original_filename).suffix.lower() or ".jpg"
    ts = (now or datetime.now(timezone.utc)).strftime("%Y%m%dt%H%M%Sz")
    sid = (short_id or uuid4().hex[:8]).lower()[:8]
    stem = slugify_stem(original_filename)

    # Sanitise the pattern and origin segments (no special chars)
    def _seg(s: str, fallback: str) -> str:
        s = re.sub(r"[^a-z0-9_]+", "_", s.lower()).strip("_")
        return s or fallback

    origin_seg = _seg(origin, "upload")[:16]
    pattern_seg = _seg(pattern, "unknown")[:32]

    return f"{origin_seg}_{pattern_seg}_{stem}_{ts}_{sid}{ext}"
