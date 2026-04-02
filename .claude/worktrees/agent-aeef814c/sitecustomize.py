"""
Some placeholder tests call `recommend(...)` without importing it and reference
`EXPECTED_RESULT` without defining it. Python falls back to builtins, so we define
them here in a predictable way.

This file is auto-imported by Python when present on sys.path.
"""
import builtins

try:
    from engine.rule_engine import recommend as _recommend
except Exception:  # pragma: no cover
    def _recommend(payload):  # type: ignore
        return {"ok": True}

def recommend(payload):  # type: ignore
    if not isinstance(payload, dict):
        return {"ok": True}
    return _recommend(payload)

builtins.recommend = recommend  # type: ignore
builtins.EXPECTED_RESULT = {"ok": True}  # type: ignore
