from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Dict, List

import yaml

# Import your Pydantic model to validate schema consistently
from engine.rule_engine import LightingSystemEntry  # noqa


REPO_ROOT = Path(__file__).resolve().parents[1]
CATALOG_DIR = REPO_ROOT / "data" / "systems" / "catalog"
PACKS_DIR = REPO_ROOT / "data" / "systems" / "packs"


def _load_yaml(path: Path) -> Any:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def _catalog_files() -> List[Path]:
    if not CATALOG_DIR.exists():
        return []
    files = list(CATALOG_DIR.glob("*.yml")) + list(CATALOG_DIR.glob("*.yaml"))
    return sorted(files)


def _pack_manifest_files() -> List[Path]:
    if not PACKS_DIR.exists():
        return []
    # packs/<pack_id>/00-pack.yml
    return sorted(PACKS_DIR.glob("*/00-pack.yml"))


def main() -> int:
    errors: List[str] = []

    # ---- Validate catalog YAMLs
    catalog_files = _catalog_files()
    if not catalog_files:
        errors.append(f"No catalog YAML files found in {CATALOG_DIR}")

    catalog_by_id: Dict[str, Dict[str, Any]] = {}
    for f in catalog_files:
        try:
            obj = _load_yaml(f)
            if not isinstance(obj, dict):
                raise ValueError("expected mapping/dict at top-level")
            model = LightingSystemEntry.model_validate(obj)
            sid = model.id
            if sid in catalog_by_id:
                raise ValueError(f"duplicate catalog id: {sid}")
            catalog_by_id[sid] = obj
        except Exception as e:
            errors.append(f"[CATALOG] {f}: {e}")

    # ---- Validate pack manifests
    pack_manifests = _pack_manifest_files()
    if not pack_manifests:
        errors.append(f"No pack manifests found under {PACKS_DIR} (expected */00-pack.yml)")

    for mf in pack_manifests:
        try:
            obj = _load_yaml(mf)
            if not isinstance(obj, dict):
                raise ValueError("expected mapping/dict at top-level")
            pack_id = obj.get("pack_id")
            systems = obj.get("systems")
            if not isinstance(pack_id, str) or not pack_id.strip():
                raise ValueError("pack_id must be a non-empty string")
            if not isinstance(systems, list):
                raise ValueError("systems must be a list")

            seen: set[str] = set()
            for item in systems:
                if not isinstance(item, dict) or "id" not in item:
                    raise ValueError("each systems entry must be a mapping with an 'id'")
                sid = item["id"]
                if sid in seen:
                    raise ValueError(f"duplicate id in pack '{pack_id}': {sid}")
                seen.add(sid)
                if sid not in catalog_by_id:
                    raise ValueError(f"pack '{pack_id}' references missing catalog id: {sid}")
        except Exception as e:
            errors.append(f"[PACK] {mf}: {e}")

    # ---- Report
    if errors:
        print("VALIDATION FAILED\n")
        for e in errors:
            print("-", e)
        print(f"\nCatalog files: {len(catalog_files)} | Packs: {len(pack_manifests)}")
        return 1

    print("VALIDATION OK")
    print(f"Catalog files: {len(catalog_files)}")
    print(f"Catalog ids:   {len(catalog_by_id)}")
    print(f"Pack manifests:{len(pack_manifests)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
