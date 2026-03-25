"""
Intelligence Clustering
========================
Groups outcome events into success/failure clusters by:
  - pattern
  - lighting geometry
  - shadow behavior
  - subject type
  - failure class

Produces cluster records that feed the prioritization engine and
auto-candidate generation.  SQL-based (no ML library required) — fast,
auditable, and runnable on a single server.

SAFETY: This module only reads outcome tables. It does not write to
rule_candidates or modify production logic.
"""
from __future__ import annotations

import json
import logging
import time
from typing import Any, Dict, List, Optional

from db.database import get_db

logger = logging.getLogger(__name__)

MIN_CLUSTER_SIZE = 3   # minimum events to form a meaningful cluster


# ── Failure clusters ───────────────────────────────────────────────────────────

def cluster_failures(days: int = 30) -> List[Dict[str, Any]]:
    """
    Group failure_events by (pattern, failure_class, lighting_geometry, subject_type).
    Returns clusters sorted by size descending.
    """
    cutoff = time.time() - days * 86400
    with get_db() as conn:
        rows = conn.execute(
            """SELECT
                predicted_pattern,
                failure_class,
                COALESCE(lighting_geometry, 'unknown') AS lighting_geometry,
                COALESCE(subject_type, 'unknown')      AS subject_type,
                COUNT(*)                               AS event_count,
                AVG(confidence)                        AS avg_confidence,
                AVG(signal_quality)                    AS avg_signal_quality,
                SUM(CASE WHEN confidence >= 0.60 THEN 1 ELSE 0 END) AS high_conf_count
               FROM failure_events
               WHERE created_at >= ?
               GROUP BY predicted_pattern, failure_class, lighting_geometry, subject_type
               HAVING COUNT(*) >= ?
               ORDER BY event_count DESC""",
            (cutoff, MIN_CLUSTER_SIZE),
        ).fetchall()

    clusters = []
    for r in rows:
        d = dict(r)
        d["cluster_type"]   = "failure"
        d["high_conf_rate"] = (d["high_conf_count"] / d["event_count"]) if d["event_count"] else 0
        d["avg_confidence"] = round(d["avg_confidence"] or 0, 3)
        d["avg_signal_quality"] = round(d["avg_signal_quality"] or 0, 3)
        d["severity"] = _failure_cluster_severity(d)
        # safe: true  — high_conf_rate < 0.6 AND event_count < 10
        # safe: false — high_conf_rate >= 0.6 OR event_count >= 10
        # safe: null  — insufficient data (event_count below threshold)
        count = d["event_count"]
        hcr   = d["high_conf_rate"]
        if count < MIN_CLUSTER_SIZE:
            d["safe"] = None
        elif hcr < 0.6 and count < 10:
            d["safe"] = True
        else:
            d["safe"] = False
        clusters.append(d)
    return clusters


def _failure_cluster_severity(cluster: Dict[str, Any]) -> str:
    n   = cluster["event_count"]
    hcr = cluster.get("high_conf_rate", 0)
    if n >= 20 or hcr >= 0.5:
        return "critical"
    if n >= 10 or hcr >= 0.3:
        return "high"
    if n >= 5:
        return "medium"
    return "low"


# ── Success clusters ───────────────────────────────────────────────────────────

def cluster_successes(days: int = 30) -> List[Dict[str, Any]]:
    """
    Group nailed_it_events by (pattern, lighting_geometry, subject_type).
    Identifies reliable conditions — useful for reinforcing good paths.
    """
    cutoff = time.time() - days * 86400
    with get_db() as conn:
        rows = conn.execute(
            """SELECT
                predicted_pattern,
                COALESCE(lighting_geometry, 'unknown') AS lighting_geometry,
                COALESCE(subject_type, 'unknown')      AS subject_type,
                COUNT(*)                               AS event_count,
                AVG(confidence)                        AS avg_confidence,
                AVG(signal_quality)                    AS avg_signal_quality
               FROM nailed_it_events
               WHERE created_at >= ?
               GROUP BY predicted_pattern, lighting_geometry, subject_type
               HAVING COUNT(*) >= ?
               ORDER BY event_count DESC""",
            (cutoff, MIN_CLUSTER_SIZE),
        ).fetchall()

    clusters = []
    for r in rows:
        d = dict(r)
        d["cluster_type"] = "success"
        d["avg_confidence"]     = round(d["avg_confidence"] or 0, 3)
        d["avg_signal_quality"] = round(d["avg_signal_quality"] or 0, 3)
        # Success clusters: safe is null if insufficient data, otherwise
        # safe: true if count < 10 (small, low-risk cluster to act on),
        # safe: false if count >= 10 (large established cluster — review before changes)
        count = d["event_count"]
        if count < MIN_CLUSTER_SIZE:
            d["safe"] = None
        elif count < 10:
            d["safe"] = True
        else:
            d["safe"] = False
        clusters.append(d)
    return clusters


# ── Pattern weak spots ────────────────────────────────────────────────────────

def find_pattern_weak_spots(days: int = 30) -> List[Dict[str, Any]]:
    """
    For each pattern, compute the ratio of failures to total outcomes.
    Returns patterns with miss_rate >= 30% OR high_conf_miss_rate >= 15%.
    These are the primary targets for the prioritization engine.
    """
    cutoff = time.time() - days * 86400
    with get_db() as conn:
        # Total outcomes per pattern
        total_rows = conn.execute(
            """SELECT predicted_pattern, COUNT(*) AS cnt
               FROM (
                   SELECT predicted_pattern FROM nailed_it_events WHERE created_at>=?
                   UNION ALL
                   SELECT predicted_pattern FROM failure_events    WHERE created_at>=?
               )
               GROUP BY predicted_pattern""",
            (cutoff, cutoff),
        ).fetchall()

        # Failure counts
        fail_rows = conn.execute(
            """SELECT predicted_pattern,
                COUNT(*) AS fail_count,
                SUM(CASE WHEN confidence >= 0.60 THEN 1 ELSE 0 END) AS hcm_count
               FROM failure_events WHERE created_at>=?
               GROUP BY predicted_pattern""",
            (cutoff,),
        ).fetchall()

    total_map = {r["predicted_pattern"]: r["cnt"] for r in total_rows}
    fail_map  = {r["predicted_pattern"]: dict(r) for r in fail_rows}

    weak_spots = []
    for pattern, total in total_map.items():
        if total < MIN_CLUSTER_SIZE:
            continue
        fail_data  = fail_map.get(pattern, {})
        fail_count = fail_data.get("fail_count", 0)
        hcm_count  = fail_data.get("hcm_count", 0)
        miss_rate  = fail_count / total
        hcm_rate   = hcm_count / total

        if miss_rate >= 0.30 or hcm_rate >= 0.15:
            weak_spots.append({
                "pattern":          pattern,
                "total_outcomes":   total,
                "fail_count":       fail_count,
                "miss_rate":        round(miss_rate, 4),
                "hcm_rate":         round(hcm_rate, 4),
                "severity":         "critical" if hcm_rate >= 0.3 else "high" if miss_rate >= 0.4 else "medium",
            })

    weak_spots.sort(key=lambda w: (-w["hcm_rate"], -w["miss_rate"]))
    return weak_spots


# ── Confidence calibration clusters ───────────────────────────────────────────

def find_confidence_miscalibrations(days: int = 30) -> List[Dict[str, Any]]:
    """
    Patterns where the system is confidently wrong.
    high_confidence_miss_rate >= HIGH_CONFIDENCE_THRESHOLD filtered events
    are grouped per pattern — these are the most damaging failures.
    """
    cutoff = time.time() - days * 86400
    with get_db() as conn:
        rows = conn.execute(
            """SELECT
                predicted_pattern,
                COUNT(*) AS hcm_count,
                AVG(confidence) AS avg_confidence
               FROM failure_events
               WHERE created_at>=? AND confidence >= 0.60
               GROUP BY predicted_pattern
               HAVING COUNT(*) >= ?
               ORDER BY hcm_count DESC""",
            (cutoff, MIN_CLUSTER_SIZE),
        ).fetchall()

    return [
        {
            "pattern":       r["predicted_pattern"],
            "hcm_count":     r["hcm_count"],
            "avg_confidence": round(r["avg_confidence"] or 0, 3),
            "cluster_type":  "confidence_miscalibration",
        }
        for r in rows
    ]


# ── Full cluster report ────────────────────────────────────────────────────────

def build_cluster_report(days: int = 30) -> Dict[str, Any]:
    """Aggregate all cluster types into a single report dict."""
    failures     = cluster_failures(days=days)
    successes    = cluster_successes(days=days)
    weak_spots   = find_pattern_weak_spots(days=days)
    miscals      = find_confidence_miscalibrations(days=days)

    return {
        "window_days":        days,
        "failure_clusters":   failures,
        "success_clusters":   successes,
        "weak_spots":         weak_spots,
        "confidence_miscals": miscals,
        "summary": {
            "failure_cluster_count":  len(failures),
            "success_cluster_count":  len(successes),
            "weak_spot_count":        len(weak_spots),
            "miscal_count":           len(miscals),
            "critical_failures":      sum(1 for f in failures if f["severity"] == "critical"),
        },
    }
