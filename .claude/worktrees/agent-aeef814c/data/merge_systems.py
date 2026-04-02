import json
from pathlib import Path

systems_path = Path("data/lighting_systems.json")
patch_path = Path("data/systems_patch.json")

raw = json.loads(systems_path.read_text())
patch = json.loads(patch_path.read_text())

if not isinstance(patch, list):
    raise SystemExit("systems_patch.json must be a JSON list")

# Determine where the systems list lives
wrapper = None
systems = None

if isinstance(raw, list):
    systems = raw
elif isinstance(raw, dict):
    wrapper = raw
    for key in ("systems", "lighting_systems", "items", "data"):
        if key in raw and isinstance(raw[key], list):
            systems = raw[key]
            wrapper_key = key
            break
    else:
        # first list value fallback
        list_keys = [k for k,v in raw.items() if isinstance(v, list)]
        if not list_keys:
            raise SystemExit(f"No list found in lighting_systems.json. Keys: {list(raw.keys())}")
        wrapper_key = list_keys[0]
        systems = raw[wrapper_key]
else:
    raise SystemExit(f"lighting_systems.json must be list or dict; got {type(raw).__name__}")

existing_ids = {s.get("id") for s in systems if isinstance(s, dict)}
added = 0

for entry in patch:
    if not isinstance(entry, dict):
        continue
    eid = entry.get("id")
    if not eid or eid in existing_ids:
        continue
    systems.append(entry)
    existing_ids.add(eid)
    added += 1

# Write back
if wrapper is None:
    out = systems
else:
    wrapper[wrapper_key] = systems
    out = wrapper

systems_path.write_text(json.dumps(out, indent=2))
print(f"Added {added} systems into {systems_path} (list_key={wrapper_key if wrapper is not None else 'ROOT_LIST'})")
