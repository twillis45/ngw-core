from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Sequence

import yaml

from engine.rule_engine import LightingSystemEntry, LightingSystemsPayload


DEFAULT_DIRS = (
    "data/systems/catalog",
    "data/systems/packs/core",
    "data/systems/packs/pro",
)


def _iter_yaml_files(dirs: Sequence[str | Path]) -> List[Path]:
    files: List[Path] = []
    for d in dirs:
        p = Path(d)
        if not p.exists():
            continue

        files.extend(sorted(p.glob("*.yaml")))
        files.extend(sorted(p.glob("*.yml")))

    # deterministic ordering
    return sorted({f.resolve() for f in files})


def _load_yaml(path: Path) -> List[Dict[str, Any]]:
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}

    if isinstance(raw, list):
        return [x for x in raw if isinstance(x, dict)]

    if isinstance(raw, dict):
        return [raw]

    raise ValueError(f"Unsupported YAML structure in {path}")


def load_systems(
    dirs: Sequence[str | Path] = DEFAULT_DIRS,
) -> List[Dict[str, Any]]:
    """
    Loads lighting systems from catalog and pack directories.

    Skips pack manifests like 00-pack.yml.
    """

    files = _iter_yaml_files(dirs)

    systems: List[Dict[str, Any]] = []

    for f in files:
        # Skip pack manifests
        if f.name.startswith("00-pack"):
            continue

        systems.extend(_load_yaml(f))

    # Validate systems
    entries = [LightingSystemEntry(**s) for s in systems]
    payload = LightingSystemsPayload(systems=entries)

    return [e.model_dump() for e in payload.systems]
