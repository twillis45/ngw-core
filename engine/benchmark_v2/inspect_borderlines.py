"""Phase 3C Workstream D — inspect specific benchmarks against the
BOUNDED long-term predicate gates.

Prints the exact gate state for any benchmark by image path or stem
name.  Useful for understanding whether a CLA→BND or BND→CLA result
is engine-driven or judgment-call variability.

Run:
    .venv/bin/python -m engine.benchmark_v2.inspect_borderlines white_seamless_catalog
    .venv/bin/python -m engine.benchmark_v2.inspect_borderlines white_seamless_catalog window_soft_side
    .venv/bin/python -m engine.benchmark_v2.inspect_borderlines --image benchmarks/images/foo.jpg
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import warnings
from pathlib import Path
from typing import List, Optional

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
os.environ.setdefault("GLOG_minloglevel", "3")
logging.getLogger().setLevel(logging.ERROR)
warnings.filterwarnings("ignore")

from engine.orchestrator import (  # noqa: E402
    _CLASSICAL_BOUNDED_SET,
    _key_zones_compatible,
    analyze_image,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
BENCHMARKS_DIR = REPO_ROOT / "benchmarks"


def _resolve_image_path(token: str) -> Optional[Path]:
    """Accept image path or benchmark stem name; return image path."""
    p = Path(token)
    if p.exists() and p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp"):
        return p
    # Try benchmark JSON lookup
    bench = BENCHMARKS_DIR / (token if token.endswith(".json") else f"{token}.json")
    if bench.exists():
        data = json.loads(bench.read_text())
        rel = data.get("image_path") or ""
        img = (REPO_ROOT / rel).resolve()
        if img.exists():
            return img
    return None


def _expected_mode(token: str) -> Optional[str]:
    bench = BENCHMARKS_DIR / (token if token.endswith(".json") else f"{token}.json")
    if not bench.exists():
        return None
    try:
        data = json.loads(bench.read_text())
        return (data.get("ground_truth") or {}).get("expected_mode")
    except Exception:
        return None


def inspect(token: str) -> None:
    img_path = _resolve_image_path(token)
    if img_path is None:
        print(f"  [error] could not resolve {token!r} to an image", file=sys.stderr)
        return

    expected = _expected_mode(token)

    r = analyze_image(str(img_path), run_extended=True, run_vlm=False, run_solver=True)
    pc = r.pattern_candidates
    cc = list(r.candidate_credibility or [])
    cp = r.complexity_profile

    print(f"\n=== {token} ===")
    print(f"  image:           {img_path.relative_to(REPO_ROOT)}")
    print(f"  expected_mode:   {expected!r}")
    print(f"  predicted_mode:  {r.analysis_mode.value!r}")
    print(f"  rationale:       {r.mode_rationale[:140]}")
    print()
    print(f"  resolver primary: {r.authoritative_pattern} "
          f"({r.pattern_confidence:.2f}, {r.authoritative_pattern_source})")
    if cp:
        print(f"  outcome_trust_risk: {cp.outcome_trust_risk}  reason: {cp.outcome_trust_risk_reason[:80]}")
        print(f"  catchlight_reliability: {cp.catchlight_reliability}  ({cp.catchlight_reliability_reason})")
        # Phase 3D/D — also surface source-context / scene-class axes
        # if/when they exist on ComplexityProfile (Workstream B may add
        # background_class).  getattr-based to remain forward-compatible.
        bg_class = getattr(cp, "background_class", None)
        if bg_class is not None:
            print(f"  background_class: {bg_class}")
    print()

    # Phase 3D/D — full credibility trace, all candidates (not just classical)
    print("  candidate_credibility (full trace, sorted by cred desc):")
    cc_sorted = sorted(cc, key=lambda x: x.credibility, reverse=True)
    if not cc_sorted:
        print("    (none)")
    for c in cc_sorted:
        print(f"    pat={c.pattern:<14} cred={c.credibility:.2f} "
              f"raw={c.raw_confidence:.2f} src={c.source:<32} "
              f"trust_x={c.source_trust_multiplier:.2f}  classical={c.is_classical}")
        if c.evidence_for:
            print(f"        evidence_for:     {list(c.evidence_for)}")
        if c.evidence_against:
            print(f"        evidence_against: {list(c.evidence_against)}")
        if c.notes:
            print(f"        notes:            {list(c.notes)}")

    # Phase 3D/D — explicit demotion-forgiveness trace per candidate.
    # Reports whether each candidate was a forgiveness candidate (source
    # contains "_demoted") and whether independent corroboration exists.
    # When Workstream A lands, candidates that were forgiven will already
    # carry an evidence_for entry naming the forgiveness; this loop
    # mirrors that decision so callers can see it explicitly.
    print()
    print("  demotion-forgiveness trace (Phase 3D/A doctrine):")
    cue_inf = getattr(r, "cue_inference_result", None)
    geo = cue_inf.get("geometry") if isinstance(cue_inf, dict) else None
    raw_cue = (getattr(geo, "shadow_pattern", "") or "") if geo else ""
    cr_local = getattr(r, "cue_report", None)
    ls_local = getattr(cr_local, "light_structure", None) if cr_local else None
    raw_ls = (getattr(ls_local, "pattern_name", "") or "") if ls_local else ""
    intel_local = getattr(r, "lighting_intel", None)
    raw_intel = (getattr(intel_local, "pattern", "") or "") if intel_local else ""
    ra_local = getattr(r, "reference_analysis", None)
    lr_local = getattr(ra_local, "lighting_read", None) if ra_local else None
    raw_rr = (getattr(lr_local, "shadow_pattern", "") or "") if lr_local else ""
    paradox_notes = [n for n in (cp.notes if cp else []) if "paradox" in n.lower()]
    for c in cc_sorted:
        is_demoted = "_demoted" in (c.source or "")
        if not is_demoted:
            continue  # only forgiveness-candidates
        # Count independent classifier raw-signal supports
        independent_supports = sum(
            1 for raw in (raw_cue, raw_ls, raw_intel, raw_rr)
            if raw and raw == c.pattern
        )
        already_forgiven = any(
            "demotion_forgiven" in str(e) for e in (c.evidence_for or [])
        )
        forgiveness_eligible = (independent_supports >= 1)
        paradox_blocks = bool(paradox_notes)
        print(f"    pat={c.pattern:<14} demoted_source=True  "
              f"independent_supports={independent_supports}  "
              f"paradox_active={paradox_blocks}  "
              f"already_forgiven={already_forgiven}")
        if forgiveness_eligible and not paradox_blocks and not already_forgiven:
            print(f"        -> Phase 3D/A would forgive demotion if implemented")
        elif paradox_blocks:
            print(f"        -> forgiveness blocked by active paradox: {paradox_notes}")
        elif independent_supports == 0:
            print(f"        -> single-source demoted; forgiveness not eligible")
    if not any("_demoted" in (c.source or "") for c in cc_sorted):
        print("    (no demoted candidates in credibility list)")

    print()
    print("  BOUNDED long-term predicate gate analysis:")
    classical_cc = [c for c in cc if c.is_classical]
    classical_cc.sort(key=lambda x: x.credibility, reverse=True)
    if len(classical_cc) >= 2:
        c0, c1 = classical_cc[0], classical_cc[1]
        spread = abs(c0.credibility - c1.credibility)
        max_ev = max(len(c0.evidence_for or []), len(c1.evidence_for or []))
        min_ev = min(len(c0.evidence_for or []), len(c1.evidence_for or []))
        zones_ok = _key_zones_compatible(c0.pattern, c1.pattern)
        cred_overrules = c0.pattern != (pc.primary.pattern if pc.primary else "")
        gates = {
            "≥ 2 classical entries":              True,
            "patterns_disagree":                  c0.pattern != c1.pattern,
            f"top.cred ≥ 0.55 ({c0.credibility:.2f})": c0.credibility >= 0.55,
            f"alt.cred ≥ 0.45 ({c1.credibility:.2f})": c1.credibility >= 0.45,
            f"spread ≤ 0.20 ({spread:.2f})":      spread <= 0.20,
            f"key zones compatible ({c0.pattern}/{c1.pattern})": zones_ok,
            f"max_ev ≥ 2 ({max_ev})":             max_ev >= 2,
            f"min_ev ≥ 1 ({min_ev})":             min_ev >= 1,
            "credibility_overrules_resolver":    cred_overrules,
        }
        for name, val in gates.items():
            mark = "✓" if val else "✗"
            print(f"    {mark}  {name}")
        all_pass = all(gates.values())
        print(f"    -> all gates pass: {all_pass}  → "
              f"BOUNDED would{'  ' if all_pass else ' NOT'} fire from long-term predicate")
    else:
        print(f"    < 2 classical entries; long-term BOUNDED cannot fire")


def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument(
        "tokens", nargs="*",
        help="benchmark stem name(s) or image path(s) to inspect",
    )
    p.add_argument(
        "--image", action="append", default=[],
        help="explicit image path to inspect",
    )
    args = p.parse_args(argv)

    tokens = list(args.tokens) + list(args.image)
    if not tokens:
        # Phase 3C/D default targets
        tokens = ["white_seamless_catalog", "window_soft_side"]
        print(f"[inspect] no targets provided, defaulting to Phase 3D borderlines: {tokens}")

    for t in tokens:
        inspect(t)

    return 0


if __name__ == "__main__":
    sys.exit(main())
