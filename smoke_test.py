from engine.rule_engine import recommend

sample_input = {
    "skin_tone": "deep",
    "mood": "dramatic",
    "environment": "studio_small",
    "gear_profile": "basic_2_light",
    "modifiers_available": ["softbox", "beauty_dish"]
}

if __name__ == "__main__":
    rec = recommend(sample_input)
    print(rec)
