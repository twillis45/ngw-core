from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from engine.diagram import build_diagram, SubjectPosition, CameraPosition
from engine.normalizer import normalize_gear_name
from engine.rule_engine import recommend, LightingSystemsPayload, LightingSystemEntry
from engine.selector import select_best_system


def _sys(system_id: str, **overrides):
    base = {
        "id": system_id,
        "name": f"System {system_id}",
        "criteria": {
            "brightness": 5000,
            "color_accuracy": 85,
            "portability": 50,
            "battery_life": 50,
            "energy_efficiency": 50,
        },
        "features": {},
        "taxonomy_refs": {"mood": "corporate", "environment": "studio"},
    }
    base.update(overrides)
    return base


def test_duplicate_ids_rejected_at_payload_level():
    try:
        LightingSystemsPayload(
            systems=[
                LightingSystemEntry(**_sys("dup")),
                LightingSystemEntry(**_sys("dup", name="Other")),
            ]
        )
        assert False, "Expected duplicate IDs to be rejected"
    except Exception as e:
        assert "Duplicate" in str(e)


def test_selector_keeps_diagram_model():
    result = select_best_system([_sys("a"), _sys("b", criteria={"brightness": 100})])
    assert result.top_picks[0].diagram_spec.system_id == result.top_picks[0].breakdown.system_id


def test_diagram_subject_and_camera_are_models():
    d = build_diagram(_sys("a"))
    assert isinstance(d.subject, SubjectPosition)
    assert isinstance(d.camera, CameraPosition)


def test_normalizer_prefix_match_not_confident():
    r = normalize_gear_name("aputure 600")
    assert r.canonical_id == "led_cob"
    assert r.confident is False


def test_recommend_accepts_input_only_payload():
    result = recommend(
        {
            "skin_tone": "deep",
            "mood": "beauty",
            "environment": "studio",
            "gear_profile": "strobe_mono",
            "modifiers_available": ["softbox", "beauty_dish"],
        }
    )
    assert "winner" in result
    assert "score" in result
    assert "diagram_spec" in result
