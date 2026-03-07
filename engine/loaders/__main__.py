from engine.loaders.yaml_loader import load_systems

if __name__ == "__main__":
    systems = load_systems()
    print(f"Loaded {len(systems)} systems.")
    # print first IDs for sanity
    for s in systems[:10]:
        print("-", s.get("id"), s.get("name"))
