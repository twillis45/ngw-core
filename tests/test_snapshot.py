from engine.rule_engine import recommend


def test_engine_snapshot():
    payload = {
        "systems": [
            {
                "id": "snap-1",
                "name": "Snapshot System",
                "criteria": {"brightness": 8000, "color_accuracy": 95},
                "features": {"dimmable": True},
                "modifier": 1.0,
            }
        ]
    }

    result = recommend(payload)

    assert isinstance(result, dict)
    assert result["winner"] == "snap-1"
    assert "score" in result
    assert "diagram_spec" in result
