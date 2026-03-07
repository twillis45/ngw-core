from pathlib import Path
import re
import yaml

SYSTEM_DIR = Path("data/systems")

def slugify(name: str) -> str:
    name = name.lower().strip()
    name = re.sub(r"[^\w\s-]", "", name)
    name = re.sub(r"\s+", "-", name)
    name = re.sub(r"-+", "-", name)
    return name

def idify(slug: str) -> str:
    return slug.replace("-", "_")

files = sorted(
    [p for p in SYSTEM_DIR.glob("*.y*ml") if p.is_file()]
)

systems = []

for f in files:
    with open(f, "r", encoding="utf-8") as fh:
        data = yaml.safe_load(fh)

    if not isinstance(data, dict):
        print(f"Skipping non-dict YAML: {f}")
        continue

    name = data.get("name")
    if not name:
        print(f"Missing name in {f}, skipping")
        continue

    slug = slugify(name)
    data["id"] = idify(slug)

    systems.append((f, slug, data))

systems.sort(key=lambda x: x[1])

for idx, (old_path, slug, data) in enumerate(systems, start=1):
    new_filename = f"{idx:02d}-{slug}.yaml"
    new_path = SYSTEM_DIR / new_filename

    with open(new_path, "w", encoding="utf-8") as fh:
        yaml.dump(data, fh, sort_keys=False)

    if new_path != old_path:
        old_path.unlink()

    print(f"Converted {old_path.name} -> {new_filename}")

print(f"\nNormalized {len(systems)} system files.")
