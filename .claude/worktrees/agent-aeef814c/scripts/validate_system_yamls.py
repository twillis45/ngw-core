from engine.loaders.yaml_loader import load_systems
from engine.rule_engine import LightingSystemEntry, LightingSystemsPayload

def main():
    systems = load_systems()

    # Validate structure with Pydantic
    payload = LightingSystemsPayload(
        systems=[LightingSystemEntry(**s) for s in systems]
    )

    print(f"OK: loaded {len(payload.systems)} systems")
    # Optional: print IDs for quick sanity
    # print([s.id for s in payload.systems])

if __name__ == "__main__":
    main()
