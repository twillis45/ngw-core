"""VLM Improvement Log — tracks where VLM corrected CV to guide pipeline improvement.

When VLM overrides or enriches CV-derived data during reference photo analysis,
those corrections are logged here as structured records.  Over time, this log
reveals systematic CV weaknesses (e.g. segmentation failures on outdoor scenes,
framing errors when person_ratio ≈ 0) that can be addressed with targeted CV
pipeline improvements.

Usage:
    from engine.vlm_improvement_log import log_vlm_corrections

    # After build_image_read() returns with notes:
    log_vlm_corrections(image_path, notes)
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Default log path — can be overridden with VLM_IMPROVEMENT_LOG env var
_DEFAULT_LOG_DIR = Path(__file__).resolve().parent.parent / "logs"
_LOG_FILE = os.environ.get(
    "VLM_IMPROVEMENT_LOG",
    str(_DEFAULT_LOG_DIR / "vlm_improvement_log.jsonl"),
)


def log_vlm_corrections(
    image_path: str,
    notes: List[str],
    extra: Optional[Dict[str, Any]] = None,
) -> None:
    """Append VLM correction records to the improvement log.

    Only writes entries where notes contain VLM override/enrichment info
    (lines starting with "VLM override" or "VLM enrichment").

    Parameters
    ----------
    image_path : str
        Path to the analyzed image.
    notes : list[str]
        Notes from ImageRead.notes — may include VLM learning annotations.
    extra : dict, optional
        Additional context (e.g. person_ratio, scene_type) to attach.
    """
    vlm_notes = [n for n in notes if n.startswith("VLM override") or n.startswith("VLM enrichment")]
    if not vlm_notes:
        return

    log_path = Path(_LOG_FILE)
    try:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "image": str(Path(image_path).name),
            "corrections": [],
        }
        if extra:
            record["context"] = extra

        for note in vlm_notes:
            # Parse structured note: "VLM override [field]: CV said ... VLM sees ..."
            _type = "override" if note.startswith("VLM override") else "enrichment"
            _field = ""
            _detail = note
            if "[" in note and "]" in note:
                _start = note.index("[") + 1
                _end = note.index("]")
                _field = note[_start:_end]
                _detail = note[_end + 2:].strip()  # skip ]:

            record["corrections"].append({
                "type": _type,
                "field": _field,
                "detail": _detail,
            })

        with open(log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

        logger.debug("Logged %d VLM correction(s) for %s", len(vlm_notes), image_path)

    except Exception as exc:
        # Best-effort — never fail the pipeline for logging
        logger.warning("Failed to write VLM improvement log: %s", exc)


def read_improvement_summary() -> Dict[str, Any]:
    """Read the improvement log and produce a summary of CV gaps.

    Returns a dict with:
      - total_corrections: int
      - by_field: dict mapping field names to correction counts
      - by_type: dict mapping override/enrichment to counts
      - recent: list of last 20 corrections
      - cv_learning_items: list of unique "CV learning" notes
    """
    log_path = Path(_LOG_FILE)
    if not log_path.exists():
        return {"total_corrections": 0, "by_field": {}, "by_type": {},
                "recent": [], "cv_learning_items": []}

    corrections: List[Dict] = []
    by_field: Dict[str, int] = {}
    by_type: Dict[str, int] = {}
    cv_learning: set = set()

    try:
        with open(log_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                record = json.loads(line)
                for c in record.get("corrections", []):
                    field = c.get("field", "unknown")
                    ctype = c.get("type", "unknown")
                    by_field[field] = by_field.get(field, 0) + 1
                    by_type[ctype] = by_type.get(ctype, 0) + 1
                    corrections.append({
                        "image": record.get("image", "?"),
                        "timestamp": record.get("timestamp", ""),
                        **c,
                    })
                    # Extract CV learning insights
                    detail = c.get("detail", "")
                    if "CV learning:" in detail:
                        _idx = detail.index("CV learning:")
                        cv_learning.add(detail[_idx:].strip())
    except Exception as exc:
        logger.warning("Failed to read VLM improvement log: %s", exc)

    return {
        "total_corrections": len(corrections),
        "by_field": dict(sorted(by_field.items(), key=lambda x: -x[1])),
        "by_type": by_type,
        "recent": corrections[-20:],
        "cv_learning_items": sorted(cv_learning),
    }
