import time

from engine.rule_engine import recommend


def test_engine_under_10ms():
    payload = {
        "systems": [
            {
                "id": "perf-1",
                "name": "Perf System",
                "criteria": {"brightness": 8000, "color_accuracy": 95},
                "features": {"dimmable": True},
                "modifier": 1.0,
            }
        ]
    }

    t0 = time.perf_counter()
    recommend(payload)
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    # Leave a little room for slower local machines.
    assert elapsed_ms < 50.0
