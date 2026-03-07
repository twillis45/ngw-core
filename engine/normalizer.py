from __future__ import annotations

from typing import Iterable, List


def normalize_token(value: str) -> str:
    """Normalize a free-form token to a predictable snake_case-ish form."""
    if value is None:
        return ""
    s = str(value).strip().lower()
    s = s.replace("-", "_").replace(" ", "_")
    while "__" in s:
        s = s.replace("__", "_")
    return s


def normalize_modifier_list(values: Iterable[str]) -> List[str]:
    """Normalize modifier names, de-dupe while preserving order."""
    out: List[str] = []
    seen = set()
    for v in values or []:
        tok = normalize_token(str(v))
        if not tok:
            continue
        if tok in seen:
            continue
        seen.add(tok)
        out.append(tok)
    return out
