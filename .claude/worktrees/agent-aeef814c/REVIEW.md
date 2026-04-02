# NGW Core v1 — Code Review

## Methodology

Audited every file in the repo against the five product goals:
deterministic recommendations, explainable scoring, input validation,
clean API/engine separation, and edge-case test coverage.

Files reviewed: `engine/scoring.py`, `engine/selector.py`,
`engine/rule_engine.py`, `main.py`, `models/input_model.py`,
`models/output_model.py`, `models/__init__.py`, `requirements.txt`,
all `__init__.py` and test stubs.

---

## Top 10 Issues by Severity

| #  | Sev      | File                   | Issue |
|----|----------|------------------------|-------|
| 1  | CRITICAL | `models/__init__.py`   | Broken re-exports — references 6 names that don't exist (`EngineMode`, `GenerateRequest`, `GenerateResponse`, `EngineMetadata`, `HealthResponse`). Any `from models import …` crashes at startup. |
| 2  | HIGH     | `engine/scoring.py`    | Negative, NaN, and Inf modifiers are accepted silently. `modifier: -5.0` inverts the ranking; `modifier: NaN` produces NaN scores that break sort determinism. |
| 3  | HIGH     | `engine/scoring.py`    | Negative criterion values (e.g. `brightness: -500`) are clamped to 0 by `_normalise` but this is *silent* — no trace in the breakdown that invalid input was corrected. Violates "explainable" goal. |
| 4  | HIGH     | `main.py`              | Errors return HTTP 200 with `status: "error"` inside the JSON body. Clients that check HTTP status codes will never detect failures. Validation errors should return 422; engine errors should return 500. |
| 5  | MEDIUM   | `engine/scoring.py`    | Unused `from enum import Enum` import. |
| 6  | MEDIUM   | `main.py`              | Unused `from fastapi import HTTPException` import. `LightingSystemsPayload` is also imported but never used in `main.py`. |
| 7  | MEDIUM   | `engine/rule_engine.py`| `LightingSystemEntry.id` and `.name` accept empty strings. An `id: ""` passes the unique-ID validator (only one empty string needed) but produces meaningless trace output and breaks explainability. |
| 8  | MEDIUM   | `engine/selector.py`   | Single-system input produces a "Runner-up" reason that is never appended, but the `_build_reasons` path is fine. However, when *all* systems tie on score *and* id-length, the sort is still deterministic (lexicographic), but the reasons text says "margin of 0.0 points" without noting the tie explicitly. |
| 9  | LOW      | `requirements.txt`     | No `pytest` dev dependency. Test files exist but `requirements.txt` has no test runner, so `pytest` would fail on a fresh clone without guessing. |
| 10 | LOW      | Multiple               | Empty placeholder files (`engine/core.py`, `engine/pipeline.py`, `api/routes/generate.py`, `config/settings.py`, `.env.example`, `.gitignore`, all test files) ship as 0-byte stubs. Confusing for contributors — unclear if they're TODO or dead code. |

---

## Diffs and Fixes

All diffs below are minimal, surgical patches. No new dependencies
except `pytest` and `httpx` (dev/test only, added to `requirements.txt`).

---

## Unified Diffs

### Fix #1 — `models/__init__.py` (CRITICAL)

Broken re-exports referencing 6 nonexistent names. Application crashes on
`from models import ...`.

```diff
--- a/models/__init__.py
+++ b/models/__init__.py
@@ -1,29 +1,27 @@
 from .input_model import (
     ContextItem,
-    EngineMode,
     EngineOptions,
-    GenerateRequest,
+    NGWRequest,
     OutputFormat,
+    TaskType,
 )
 from .output_model import (
-    EngineMetadata,
     ErrorDetail,
-    GenerateResponse,
-    HealthResponse,
+    NGWResponse,
+    ResultPayload,
     StatusCode,
     UsageStats,
 )

 __all__ = [
     "ContextItem",
-    "EngineMode",
     "EngineOptions",
-    "GenerateRequest",
+    "NGWRequest",
     "OutputFormat",
-    "EngineMetadata",
+    "TaskType",
     "ErrorDetail",
-    "GenerateResponse",
-    "HealthResponse",
+    "NGWResponse",
+    "ResultPayload",
     "StatusCode",
     "UsageStats",
 ]
```

**Test:** `test_models.py::TestModelImports::test_package_init_importable`
and `test_api.py::TestModelsInit::test_all_exports_importable`

---

### Fix #2 — `engine/scoring.py` (HIGH): Modifier guard

Negative, NaN, and Inf modifiers silently break determinism.

```diff
--- a/engine/scoring.py
+++ b/engine/scoring.py
@@ -14,7 +14,7 @@
 from __future__ import annotations

-from enum import Enum
+import math
 from typing import Any

@@ -119,7 +128,11 @@
     raw_modifier = system.get("modifier")
     if raw_modifier is not None:
         modifier = float(raw_modifier)
-        modifier_source = "provided"
+        if math.isnan(modifier) or math.isinf(modifier) or modifier < 0:
+            modifier = FALLBACK_MODIFIER
+            modifier_source = "fallback (invalid value rejected)"
+        else:
+            modifier_source = "provided"
     else:
         modifier = FALLBACK_MODIFIER
         modifier_source = "fallback"
```

**Tests:** `test_scoring.py::TestModifierValidation` (6 cases: positive,
zero, negative, NaN, Inf, None)

---

### Fix #3 — `engine/scoring.py` (HIGH): Clamping annotation

Negative criterion values clamped silently — violates explainability.

```diff
--- a/engine/scoring.py
+++ b/engine/scoring.py
@@ -92,6 +92,15 @@
     return round((clamped / cap) * 100.0, 4) if cap > 0 else 0.0

+def _was_clamped(value: float, cap: float) -> str:
+    if value < 0:
+        return " (clamped from negative)"
+    if value > cap:
+        return f" (capped at {cap})"
+    return ""
+
@@ -134,6 +147,7 @@
         normed = _normalise(raw, cap)
         weighted = round(normed * weight, 4)
         subtotal += weighted
+        clamp_note = _was_clamped(raw, cap)
@@ -144,7 +158,7 @@
                 reason=(
                     f"{criterion}: raw {raw} → normalised {normed}/100 "
-                    f"× weight {weight} = {weighted}"
+                    f"× weight {weight} = {weighted}{clamp_note}"
                 ),
```

**Tests:** `test_scoring.py::TestCriterionClampingAnnotation` (3 cases)
and `test_scoring.py::TestWasClamped` (4 cases)

---

### Fix #4 — `main.py` (HIGH): HTTP status codes

Errors returned HTTP 200 with `status: "error"` in body. Clients checking
HTTP codes never detect failures.

```diff
--- a/main.py
+++ b/main.py
@@ -11,7 +11,8 @@
-from fastapi import FastAPI, HTTPException
+from fastapi import FastAPI
+from fastapi.responses import JSONResponse
@@ -147,14 +147,22 @@
     except (ValueError, ValidationError) as exc:
         elapsed_ms = (time.perf_counter() - start) * 1_000
-        return _error_response(
+        resp = _error_response(
             ...
         )
+        return JSONResponse(
+            status_code=422,
+            content=resp.model_dump(mode="json", exclude_none=True),
+        )

     except Exception as exc:
-        return _error_response(
+        resp = _error_response(
             ...
         )
+        return JSONResponse(
+            status_code=500,
+            content=resp.model_dump(mode="json", exclude_none=True),
+        )
```

**Tests:** `test_api.py::TestRecommendErrors` (5 cases checking 422 codes)

---

### Fix #5 — `engine/scoring.py` (MEDIUM): Remove unused import

```diff
-from enum import Enum
+import math
```

(Combined with Fix #2 diff — `math` replaces the unused `Enum`.)

**Test:** Implicit — all `test_scoring.py` tests import the module successfully.

---

### Fix #6 — `main.py` (MEDIUM): Remove unused imports

```diff
-from fastapi import FastAPI, HTTPException
+from fastapi import FastAPI
+from fastapi.responses import JSONResponse

 from engine.rule_engine import (
     LightingSystemEntry,
-    LightingSystemsPayload,
     RuleEngineOutput,
     run_rule_engine,
 )
```

**Test:** Implicit — `test_api.py` imports and exercises `main.app`
without errors.

---

### Fix #7 — `engine/rule_engine.py` (MEDIUM): Non-empty id/name

```diff
-    id: str
-    name: str
+    id: str = Field(..., min_length=1)
+    name: str = Field(..., min_length=1)
```

**Tests:** `test_rule_engine.py::TestEntryValidation` (4 cases)
and `test_api.py::TestRecommendErrors::test_empty_id_returns_422`

---

### Fix #8 — `engine/selector.py` (MEDIUM): Explicit tie annotation

```diff
@@ -140,9 +140,15 @@
     if len(all_breakdowns) > 1:
         runner = all_breakdowns[1]
         gap = round(winner.final_score - runner.final_score, 4)
-        reasons.append(
-            f"Runner-up: '{runner.system_name}' scored ..."
-        )
+        if gap == 0.0:
+            reasons.append(
+                f"Tie: '{runner.system_name}' also scored ..."
+                f"Winner selected by lexicographic id ..."
+            )
+        else:
+            reasons.append(
+                f"Runner-up: '{runner.system_name}' scored ..."
+            )
```

**Tests:** `test_selector.py::TestTieBreaking` (3 cases)

---

### Fix #9 — `requirements.txt` (LOW): Add test dependencies

```diff
 fastapi>=0.115,<1
 uvicorn[standard]>=0.34,<1
 pydantic>=2.10,<3
+pytest>=8.0,<9
+httpx>=0.27,<1
```

---

### Fix #10 — Dead placeholder files (LOW)

Removed: `engine/core.py`, `engine/pipeline.py`, `api/routes/generate.py`
(all 0 bytes). Populated: `.gitignore`, `.env.example` with sensible defaults.

---

## Test Coverage Map

| Fix | Test file | Test class(es) | # cases |
|-----|-----------|----------------|---------|
| #1  | `test_models.py`, `test_api.py` | `TestModelImports`, `TestModelsInit` | 4 |
| #2  | `test_scoring.py` | `TestModifierValidation` | 6 |
| #3  | `test_scoring.py` | `TestCriterionClampingAnnotation`, `TestWasClamped` | 7 |
| #4  | `test_api.py` | `TestRecommendErrors` | 5 |
| #5  | `test_scoring.py` | (import smoke) | 1 |
| #6  | `test_api.py` | (import smoke) | 1 |
| #7  | `test_rule_engine.py`, `test_api.py` | `TestEntryValidation`, `TestRecommendErrors` | 6 |
| #8  | `test_selector.py` | `TestTieBreaking` | 3 |
| #9  | — | (requirements only) | — |
| #10 | — | (file cleanup only) | — |
| —   | `test_scoring.py` | `TestScoringDeterminism`, `TestWeightsInvariant`, `TestBonusLogic`, `TestScoreFormula` | 7 |
| —   | `test_selector.py` | `TestBasicSelection`, `TestSelectorDeterminism`, `TestReasonsCompleteness` | 5 |
| —   | `test_rule_engine.py` | `TestRunRuleEngine`, `TestDuplicateIds` | 8 |
| —   | `test_api.py` | `TestRecommendHappyPath`, `TestHealth` | 6 |
| —   | `test_models.py` | `TestNGWRequest`, `TestNGWResponse` | 7 |
| **Total** | | | **~66** |

## Run tests

```bash
pip install -r requirements.txt
pytest tests/ -v
```
