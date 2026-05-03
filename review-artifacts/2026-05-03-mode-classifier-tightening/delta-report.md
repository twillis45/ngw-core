# Branch A — Mode Classifier Tightening Delta Report

**Date:** 2026-05-03  
**Branch:** `fix/mode-classifier-tightening-rc3`  
**Base commit:** 866f036  
**Benchmark baseline:** `benchmarks/results/run_20260503_222802.json`  
**Benchmark post-fix:** `benchmarks/results/run_20260503_224611.json`

---

## 1. Objective

Targeted fix for three mode-classifier false positives identified in the RC3 validation run:

| Case | Expected | RC3 Got | Fix Status |
|------|----------|---------|------------|
| `soft_editorial_key` | classical | hybrid | ✅ Fixed |
| `window_soft_side` | classical | bounded | ✅ Fixed |
| `bounded_butterfly_vs_clamshell_beauty` | bounded | classical | ⚠️ No-safe-fix (documented) |

---

## 2. Root Cause Analysis

### `soft_editorial_key` → HYBRID (false positive)

- `ambient_contamination=0.60` exceeded the Gate 2 HYBRID corroborator threshold of `0.50`
- `load_bearing_source_count=2` + ambient corroborator → HYBRID triggered
- Photographic reality: single soft window key with ambient fill — not a multi-source hybrid setup
- Fix: raise HYBRID ambient corroborator threshold from `0.50` to `0.65`

**Cascade issue found:** After fixing HYBRID, the case fell to BOUNDED (loop=0.70 vs short=0.60 credibility gate). Separate suppressor added (see Fix 3).

### `window_soft_side` → BOUNDED (false positive)

- BOUNDED long-term predicate fired: loop=0.70, short=0.60, spread=0.10, zones_ok=True, credibility_overrules_resolver=True
- Resolver correctly upgraded to `window_portrait` via specialty:reference_read
- Root cause: `background_class=environmental` distinguishes this from the true BOUNDED hit `rihanna_t1` (background_class=gradient)
- Fix: add `environmental` background_class suppression to BOUNDED gate

### `bounded_butterfly_vs_clamshell_beauty` → CLASSICAL (missed BOUNDED)

- Resolver outputs `broad` at 0.46 confidence after contradiction cascade (catchlight_shadow_paradox + multiple demotions)
- All butterfly/clamshell alternates demoted; credibility scores below BOUNDED gate thresholds
- **No safe fix at the mode-classifier level** — the upstream resolver is producing the wrong primary pattern under cascading contradictions. A mode-classifier patch would require hardcoding case-specific bypass logic with no principled physical basis.
- Status: Documented no-safe-fix. Requires upstream work (contradiction cascade revisit or pattern-resolver tuning).

---

## 3. Changes Made

**File:** `engine/orchestrator.py`

### Change 1 — Gate 2 HYBRID: raise ambient corroborator threshold

```python
# Before
if ambient >= 0.5:
    corroborators.append(f"ambient_contamination={ambient:.2f}")

# After  
if ambient >= 0.65:
    corroborators.append(f"ambient_contamination={ambient:.2f}")
```

**Rationale:** The `hybrid_key_plus_hair_light_corporate_t1` confirmed-HYBRID case uses `rim_load_bearing=True` as its corroborator (not ambient), with `ambient_contamination=0.0`. Raising the threshold from 0.50 to 0.65 does not affect it.

### Change 2 — Gate 3 BOUNDED: add `environmental` background suppression (Phase 3E/A)

Added after existing `uniform_seamless` suppression block:

```python
if cp_local is not None and cp_local.background_class == "environmental":
    return (AnalysisMode.CLASSICAL, 
            "Bounded long-term suppressed (environmental): ...", 0.75)
```

**Verified safe:**
- rihanna BND hit: `background_class=gradient` → NOT suppressed ✓
- jewelry BND hit: `background_class=uniform_neutral` → NOT suppressed ✓
- rembrandt_bw BND hit: `background_class=dark` → NOT suppressed ✓

### Change 3 — Gate 3 BOUNDED: add high-ambient suppression (Phase 3E/B)

Added after Phase 3E/A environmental suppression:

```python
if cp_local is not None and cp_local.ambient_contamination >= 0.50:
    return (AnalysisMode.CLASSICAL,
            "Bounded long-term suppressed (high ambient): ...", 0.75)
```

**Rationale:** `soft_editorial_key` (ambient=0.60) was cascading from HYBRID to BOUNDED after Fix 1. High ambient contamination indicates diffuse fill softening geometric pattern boundaries — not genuine multi-source ambiguity. All confirmed-BOUNDED cases have ambient=0.0.

**Verified safe:**
- rihanna BND hit: `ambient_contamination=0.0` → NOT suppressed ✓
- jewelry BND hit: `ambient_contamination=0.0` → NOT suppressed ✓
- rembrandt_bw BND hit: `ambient_contamination=0.0` → NOT suppressed ✓

### Comment update — Phase 3C Workstream D

Updated the "BYTE-IDENTICAL" claim in the existing comment. The prior comment stated `window_soft_side` and `rihanna_t1` were byte-identical; diagnostic verification (2026-05-03) confirmed they differ on `background_class` (environmental vs gradient), making a targeted suppression safe.

---

## 4. Benchmark Delta

| Metric | RC3 Baseline | Branch A | Delta |
|--------|-------------|----------|-------|
| PASS | 32 | 34 | +2 |
| SOFT_PASS | 10 | 10 | 0 |
| FAIL | 6 | 4 | -2 |
| ERROR | 0 | 0 | 0 |
| Pass rate | ~87.5% | 92% | +4.5% |

**Mode confusion matrix (Branch A):**
- Mode correctness: 97.9% (47/48)
- CLA→HYB false-positive: 0/37 = 0.0% (target ≤ 5%) ✅
- HYB→CLA under-decompose: 0/1 = 0.0% ✅
- INS→any false-negative: 0/5 = 0.0% (target ≤ 3%) ✅

**Cases changed:**

| Case | Before | After |
|------|--------|-------|
| `soft_editorial_key` | FAIL (hybrid) | PASS (classical) |
| `window_soft_side` | FAIL (bounded) | PASS (classical) |

**No regressions** — all 10 SOFT_PASS cases unchanged, all pre-existing PASS cases intact.

---

## 5. Remaining FAILs (4 cases, all pre-existing)

| Case | Expected | Got | Fail Reason | In Scope? |
|------|----------|-----|-------------|-----------|
| `bounded_butterfly_vs_clamshell_beauty` | bounded | classical | Mode FP — upstream resolver issue | Target, no-safe-fix |
| `bounded_loop_vs_short_jewelry_t1` | bounded (mode ✓) | short/bounded | Pattern check fail | Out of scope |
| `bounded_loop_vs_short_rihanna_t1` | bounded (mode ✓) | window_portrait/bounded | Pattern check fail | Out of scope |
| `hybrid_key_plus_hair_light_corporate_t1` | hybrid (mode ✓) | loop/hybrid | Pattern check fail | Out of scope |

The 3 pattern-check failures (jewelry, rihanna, corporate) were FAIL in RC3 baseline. Mode is correct for all three; they fail on expected pattern = null vs actual specialty-resolved pattern.

---

## 6. Unresolved Risks

1. **HYBRID ambient threshold at 0.65 is empirically chosen** — the corpus has one confirmed HYBRID case (corporate). If a legitimate ambient-heavy hybrid case exists in production with ambient 0.50–0.64, it would now route CLASSICAL (or BOUNDED). Threshold can be revisited with Phase 3B+ intelligence data.

2. **BOUNDED ambient suppressor at 0.50** — same caveat. A genuinely bounded case with ambient=0.50+ would be incorrectly suppressed. No such case exists in the current 48-corpus.

3. **`bounded_butterfly_vs_clamshell_beauty`** — contradiction cascade in the upstream resolver produces `broad` as the primary pattern. The mode classifier cannot recover from this. Requires separate investigation of the contradiction-handling path for high-symmetry setups (butterfly vs clamshell have near-identical geometry).

---

## 7. Acceptance Status

Per task acceptance criteria:
- ✅ `soft_editorial_key` → classical
- ✅ `window_soft_side` → classical
- ⚠️ `bounded_butterfly_vs_clamshell_beauty` → bounded (no-safe-fix, documented)
- ✅ All 4 regression sentinels pass (rihanna, jewelry, rembrandt_bw, hybrid_corporate)
- ✅ No regressions in 44 other cases
- ✅ Full 48-case benchmark run completed
- ✅ Delta report produced

**Recommendation:** Merge `fix/mode-classifier-tightening-rc3` → main. Tag as v0.1.0-rc3.1 patch. Open separate ticket for `bounded_butterfly_vs_clamshell_beauty` upstream resolver investigation.
