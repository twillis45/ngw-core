from __future__ import annotations

import re
from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict


class NormalizationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    original: str
    normalized: str
    canonical_id: Optional[str] = None
    matched_alias: Optional[str] = None
    confident: bool = False


_CANONICAL_ALIASES: Dict[str, List[str]] = {
    "strobe_mono": [
        "strobe_mono",
        "studio strobe",
        "monolight strobe",
        "monolight",
        "mono strobe",
        "b10",
        "profoto b10",
        "ad600",
        "ad600pro",
        "godox ad600",
        "godox ad600pro",
    ],
    "strobe_pack": [
        "strobe_pack",
        "pack and head",
        "pack head strobe",
        "broncolor",
        "broncolor siros",
        "siros",
    ],
    "speedlight": [
        "speedlight",
        "cobra flash",
        "hotshoe flash",
        "v1",
        "godox v1",
    ],
    "led_panel": [
        "led_panel",
        "led panel",
        "panel light",
        "panel led",
        "neewer",
        "neewer 660",
    ],
    "led_cob": [
        "led_cob",
        "cob led",
        "cob light",
        "aputure",
        "aputure 300d",
        "300d",
        "nanlite",
        "nanlite forza",
        "forza",
        "forza 300",
    ],
    "led_tube": [
        "led_tube",
        "tube light",
        "tube led",
        "pavotube",
        "pavotube 30c",
        "nanlite pavotube",
        "ice light",
    ],
    "fresnel": [
        "fresnel",
        "dedolight",
        "dedo",
    ],
    "ring_light": [
        "ring_light",
        "ring light",
        "beauty ring",
    ],
    "natural_window": [
        "natural_window",
        "natural window",
        "window light",
        "available light",
        "daylight window",
    ],
    "reflector_only": [
        "reflector_only",
        "reflector",
        "v flat",
        "v-flat",
        "5 in 1",
        "5-in-1",
        "bounce board",
    ],
}

_ALIAS_TO_CANONICAL: Dict[str, str] = {}
for canonical_id, aliases in _CANONICAL_ALIASES.items():
    for alias in aliases:
        _ALIAS_TO_CANONICAL[alias] = canonical_id


def normalize_token(value: str) -> str:
    value = str(value or "").strip().lower()
    value = value.replace("_", " ").replace("-", " ")
    value = re.sub(r"\s+", " ", value)
    return value


def _to_canonical_token(value: str) -> str:
    return normalize_token(value).replace(" ", "_")


def normalize_gear_name(value: str) -> NormalizationResult:
    original = value if value is not None else ""
    normalized = normalize_token(original)

    if not normalized:
        return NormalizationResult(
            original=original,
            normalized=normalized,
            canonical_id=None,
            matched_alias=None,
            confident=False,
        )

    # Exact canonical-id self resolution
    canonical_token = _to_canonical_token(normalized)
    if canonical_token in _CANONICAL_ALIASES:
        return NormalizationResult(
            original=original,
            normalized=normalized,
            canonical_id=canonical_token,
            matched_alias=canonical_token,
            confident=True,
        )

    # Exact alias match
    if normalized in _ALIAS_TO_CANONICAL:
        return NormalizationResult(
            original=original,
            normalized=normalized,
            canonical_id=_ALIAS_TO_CANONICAL[normalized],
            matched_alias=normalized,
            confident=True,
        )

    # Longest alias where input starts with alias
    prefix_matches: List[str] = []
    for alias in _ALIAS_TO_CANONICAL:
        if len(alias) >= 3 and normalized.startswith(alias):
            prefix_matches.append(alias)

    # Alias starts with input, but only for input length >= 3
    if len(normalized) >= 3:
        for alias in _ALIAS_TO_CANONICAL:
            if alias.startswith(normalized):
                prefix_matches.append(alias)

    if prefix_matches:
        best = max(set(prefix_matches), key=len)
        return NormalizationResult(
            original=original,
            normalized=normalized,
            canonical_id=_ALIAS_TO_CANONICAL[best],
            matched_alias=best,
            confident=False,
        )

    return NormalizationResult(
        original=original,
        normalized=normalized,
        canonical_id=None,
        matched_alias=None,
        confident=False,
    )


def normalize_many(values: List[str]) -> List[NormalizationResult]:
    return [normalize_gear_name(v) for v in values]


def normalize_modifier_list(values: List[str]) -> List[str]:
    out: List[str] = []
    seen = set()
    for v in values or []:
        token = _to_canonical_token(v)
        if token and token not in seen:
            seen.add(token)
            out.append(token)
    return out
