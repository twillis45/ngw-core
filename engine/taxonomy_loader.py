"""Load and query the YAML taxonomy files under data/taxonomy/.

This module loads diagnostic_failures.yaml and reliability_labels.yaml at
import time and exposes lookup helpers consumed by API routes.  Only the
files needed for Phase 1 (diagnostics endpoint) are loaded here; additional
taxonomy files can be added as integration expands.
"""

from __future__ import annotations

from pathlib import Path
from typing import Dict, List, Optional

import yaml

TAXONOMY_DIR = Path(__file__).resolve().parent.parent / "data" / "taxonomy"

# ── Load once at import time ────────────────────────────────────────────────


def _load(filename: str) -> dict:
    with open(TAXONOMY_DIR / filename, encoding="utf-8") as f:
        return yaml.safe_load(f)


_diag_data = _load("diagnostic_failures.yaml")
DIAGNOSTIC_FAILURES: List[Dict] = _diag_data.get("diagnostic_failures", [])

_rel_data = _load("reliability_labels.yaml")
RELIABILITY_LABELS: List[Dict] = _rel_data.get("reliability_labels", [])


# ── Lookup helpers ──────────────────────────────────────────────────────────


def get_diagnostic(failure_id: str) -> Optional[Dict]:
    """Return a single diagnostic failure entry by ID, or None."""
    for d in DIAGNOSTIC_FAILURES:
        if d["id"] == failure_id:
            return d
    return None


def get_diagnostics_for_pattern(pattern_id: str) -> List[Dict]:
    """Return all diagnostic failures that affect *pattern_id*.

    Entries whose ``patterns_affected`` list contains the literal pattern ID
    **or** the special value ``"all"`` are included.
    """
    return [
        d
        for d in DIAGNOSTIC_FAILURES
        if pattern_id in d.get("patterns_affected", [])
        or "all" in d.get("patterns_affected", [])
    ]


def get_all_diagnostics() -> List[Dict]:
    """Return every diagnostic failure entry."""
    return list(DIAGNOSTIC_FAILURES)


def get_reliability_label(score: float) -> str:
    """Map a numeric confidence score to its reliability label ID."""
    for label in RELIABILITY_LABELS:
        if label["min_score"] <= score <= label["max_score"]:
            return label["id"]
    return "not_ideal"


def list_known_patterns() -> List[str]:
    """Return the deduplicated set of pattern IDs referenced across all
    diagnostic failures (useful for validating query params)."""
    patterns: set[str] = set()
    for d in DIAGNOSTIC_FAILURES:
        patterns.update(d.get("patterns_affected", []))
    patterns.discard("all")
    patterns.discard("product_only")
    return sorted(patterns)
