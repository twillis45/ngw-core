from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from engine.rule_engine import run_rule_engine


def main() -> int:
    example_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("examples/minimal.json")

    if not example_path.exists():
        print(f"Example file not found: {example_path}")
        return 1

    payload = json.loads(example_path.read_text())
    result = run_rule_engine(payload)

    print("ENGINE VERSION:", result.engine_version)
    print("SYSTEMS EVALUATED:", result.systems_evaluated)
    print("WINNER:", result.selection.winner.system_id)
    print("CONTENT:")
    print(result.content)
    print("\nDIAGRAM:")
    diagram = (
        result.diagram_spec.model_dump(mode="json")
        if hasattr(result.diagram_spec, "model_dump")
        else result.diagram_spec
    )
    print(
        json.dumps(
            diagram,
            indent=2,
            default=lambda o: o.model_dump(mode="json") if hasattr(o, "model_dump") else str(o),
        )
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
