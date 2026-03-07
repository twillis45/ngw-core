import json
from pathlib import Path

from engine.rule_engine import recommend

def test_engine_recommend_runs():
    payload = {
        "skin_tone": "deep",
        "mood": "dramatic",
        "environment": "studio_small",
        "gear_profile": "basic_2_light",
        "modifiers_available": ["softbox", "beauty_dish"],
    }
    out = recommend(payload)
    assert isinstance(out, dict)
    assert "score" in out
