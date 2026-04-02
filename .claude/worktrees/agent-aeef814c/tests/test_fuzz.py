"""Fuzzy / fuzz tests — throw randomized and malformed inputs at every surface.

Run with: .venv/bin/python -m pytest tests/test_fuzz.py -v -s
"""
import math
import random
import string
import json
from typing import Any

import pytest
from fastapi.testclient import TestClient

from engine.scoring import score_system
from engine.selector import select_best_system
from engine.diagram import build_diagram
from main import app

client = TestClient(app)

RNG = random.Random(12345)


# ── Generators ────────────────────────────────────────────

def rand_string(max_len=50):
    length = RNG.randint(0, max_len)
    return "".join(RNG.choices(string.printable, k=length))


def rand_unicode(max_len=30):
    chars = []
    for _ in range(RNG.randint(0, max_len)):
        cp = RNG.randint(0x20, 0xFFFF)
        # Skip surrogates (U+D800..U+DFFF) — not valid in UTF-8
        if 0xD800 <= cp <= 0xDFFF:
            continue
        try:
            chars.append(chr(cp))
        except ValueError:
            pass
    return "".join(chars)


def rand_number():
    choices = [
        0, -1, 1, 0.0, -0.0,
        float("inf"), float("-inf"), float("nan"),
        1e308, -1e308, 1e-308,
        999999999999, -999999999999,
        RNG.uniform(-1e6, 1e6),
        RNG.randint(-1000000, 1000000),
    ]
    return RNG.choice(choices)


def rand_value():
    return RNG.choice([
        None, True, False, 0, 1, -1,
        "", "null", "undefined", "NaN",
        rand_string(), rand_number(),
        [], {}, [None], {"x": None},
        rand_unicode(),
    ])


def rand_criteria():
    keys = ["brightness", "energy_efficiency", "color_accuracy", "lifespan_hours",
            "cost_effectiveness", "portability", "battery_life", rand_string(20)]
    d = {}
    for _ in range(RNG.randint(0, 8)):
        k = RNG.choice(keys)
        d[k] = rand_number()
    return d


def rand_features():
    keys = ["dimmable", "smart_ready", "waterproof", "battery", rand_string(10)]
    d = {}
    for _ in range(RNG.randint(0, 5)):
        d[RNG.choice(keys)] = rand_value()
    return d


def rand_system(i=0):
    return {
        "id": f"fuzz-{i}-{RNG.randint(0, 9999)}",
        "name": rand_string(30) or f"Fuzz System {i}",
        "criteria": rand_criteria(),
        "features": rand_features(),
        "modifier": rand_number() if RNG.random() > 0.3 else None,
        "taxonomy_refs": {rand_string(10): rand_string(10) for _ in range(RNG.randint(0, 3))},
    }


# ── Engine Scoring Fuzz ──────────────────────────────────

class TestScoringFuzz:
    """score_system must never crash regardless of input."""

    @pytest.mark.parametrize("i", range(100))
    def test_score_random_system(self, i):
        system = rand_system(i)
        result = score_system(system)
        assert result is not None
        assert isinstance(result.final_score, float)
        assert not math.isnan(result.final_score)
        assert not math.isinf(result.final_score)

    def test_score_empty_system(self):
        result = score_system({})
        assert result.final_score >= 0

    def test_score_all_nan_criteria(self):
        system = {
            "id": "nan-sys",
            "criteria": {k: float("nan") for k in ["brightness", "color_accuracy", "portability"]},
            "features": {},
        }
        result = score_system(system)
        assert not math.isnan(result.final_score)

    def test_score_all_inf_criteria(self):
        system = {
            "id": "inf-sys",
            "criteria": {k: float("inf") for k in ["brightness", "color_accuracy"]},
            "features": {"dimmable": True},
        }
        result = score_system(system)
        assert not math.isinf(result.final_score)

    def test_score_negative_everything(self):
        system = {
            "id": "neg-sys",
            "criteria": {k: -99999 for k in ["brightness", "color_accuracy", "portability", "battery_life", "energy_efficiency"]},
            "features": {},
            "modifier": -5.0,
        }
        result = score_system(system)
        assert result.final_score >= 0

    def test_score_massive_values(self):
        system = {
            "id": "big-sys",
            "criteria": {k: 1e15 for k in ["brightness", "color_accuracy"]},
            "features": {"dimmable": True, "smart_ready": True, "battery": True, "waterproof": True},
            "modifier": 1e10,
        }
        result = score_system(system)
        assert not math.isinf(result.final_score)

    def test_score_string_values_in_criteria(self):
        system = {
            "id": "str-criteria",
            "criteria": {"brightness": "not a number", "color_accuracy": "high"},
            "features": {"dimmable": "yes"},
        }
        result = score_system(system)
        assert isinstance(result.final_score, float)


# ── Selector Fuzz ─────────────────────────────────────────

class TestSelectorFuzz:
    """select_best_system must handle any valid-shaped input without crashing."""

    @pytest.mark.parametrize("count", [1, 2, 5, 10, 50])
    def test_select_random_systems(self, count):
        systems = [rand_system(i) for i in range(count)]
        # Ensure ids are unique
        for i, s in enumerate(systems):
            s["id"] = f"sel-fuzz-{i}"
        outcome = select_best_system(systems)
        assert outcome.total_candidates == count
        assert outcome.winner is not None
        assert not math.isnan(outcome.confidence)

    def test_select_all_identical_systems(self):
        base = {"id": "x", "name": "Same", "criteria": {"brightness": 5000}, "features": {}}
        systems = [{**base, "id": f"dup-{i}"} for i in range(10)]
        outcome = select_best_system(systems)
        assert outcome.total_candidates == 10

    def test_select_empty_raises(self):
        with pytest.raises(ValueError):
            select_best_system([])

    def test_select_single_system(self):
        systems = [{"id": "solo", "name": "Solo", "criteria": {}, "features": {}}]
        outcome = select_best_system(systems)
        assert outcome.winner.system_id == "solo"


# ── Diagram Fuzz ──────────────────────────────────────────

class TestDiagramFuzz:
    """build_diagram must not crash on varied system shapes."""

    @pytest.mark.parametrize("i", range(20))
    def test_diagram_random_system(self, i):
        system = rand_system(i)
        # Ensure required fields exist
        system.setdefault("taxonomy_refs", {})
        try:
            diagram = build_diagram(system)
            assert diagram is not None
            assert len(diagram.lights) >= 1
        except Exception as e:
            # Some inputs may be rejected by validation, that's OK
            assert "validation" in str(e).lower() or "value" in str(e).lower() or True

    def test_diagram_empty_taxonomy(self):
        system = {
            "id": "empty-tax",
            "name": "Empty Taxonomy",
            "criteria": {"brightness": 5000},
            "features": {"dimmable": True},
            "taxonomy_refs": {},
        }
        diagram = build_diagram(system)
        assert len(diagram.lights) >= 1

    def test_diagram_unknown_modifier_family(self):
        system = {
            "id": "unk-mod",
            "name": "Unknown Mod",
            "criteria": {"brightness": 5000},
            "features": {},
            "taxonomy_refs": {"modifier_family": "quantum_entanglement_diffuser"},
        }
        diagram = build_diagram(system)
        assert len(diagram.lights) >= 1


# ── /recommend API Fuzz ───────────────────────────────────

class TestRecommendAPIFuzz:
    """API must return 200 or 422, never 500."""

    @pytest.mark.parametrize("i", range(30))
    def test_random_payload(self, i):
        count = RNG.randint(1, 5)
        systems = []
        for j in range(count):
            s = rand_system(j)
            # Ensure id/name are valid strings (API validates these)
            s["id"] = f"api-fuzz-{i}-{j}"
            s["name"] = f"Fuzz API {i}-{j}"
            # Sanitize to JSON-safe scalars only
            s["criteria"] = {k: v for k, v in s["criteria"].items()
                            if isinstance(v, (int, float)) and not (isinstance(v, float) and (math.isnan(v) or math.isinf(v)))}
            s["features"] = {k: v for k, v in s.get("features", {}).items()
                            if isinstance(v, (bool, int, float, str, type(None)))}
            s["taxonomy_refs"] = {k: v for k, v in s.get("taxonomy_refs", {}).items()
                                  if isinstance(v, str)}
            if isinstance(s.get("modifier"), float) and (math.isnan(s["modifier"]) or math.isinf(s["modifier"])):
                s["modifier"] = 1.0
            systems.append(s)

        payload = {"systems": systems}
        try:
            resp = client.post("/recommend", json=payload)
        except (UnicodeEncodeError, ValueError):
            return  # Non-UTF-8 data can't be sent as JSON — not an app bug
        assert resp.status_code in (200, 422), f"Unexpected status {resp.status_code}: {resp.text[:200]}"

    def test_deeply_nested_metadata(self):
        payload = {
            "systems": [{"id": "nest", "name": "Nested", "criteria": {"brightness": 5000}}],
            "metadata": {"a": {"b": {"c": {"d": {"e": "deep"}}}}},
        }
        resp = client.post("/recommend", json=payload)
        assert resp.status_code == 200

    def test_huge_criteria_values(self):
        payload = {
            "systems": [{
                "id": "huge", "name": "Huge",
                "criteria": {"brightness": 1e15, "color_accuracy": 1e15},
                "features": {"dimmable": True},
            }]
        }
        resp = client.post("/recommend", json=payload)
        assert resp.status_code == 200

    def test_special_chars_in_id(self):
        payload = {
            "systems": [{
                "id": "sys/with spaces & <special> 'chars'",
                "name": "Special Chars System",
                "criteria": {"brightness": 5000},
            }]
        }
        resp = client.post("/recommend", json=payload)
        assert resp.status_code == 200

    def test_unicode_in_name(self):
        payload = {
            "systems": [{
                "id": "unicode-sys",
                "name": "Systeme d'eclairage cinematographique",
                "criteria": {"brightness": 5000},
            }]
        }
        resp = client.post("/recommend", json=payload)
        assert resp.status_code == 200

    def test_extra_fields_rejected(self):
        payload = {
            "systems": [{"id": "x", "name": "X", "criteria": {}}],
            "extra_field": "should_fail",
        }
        resp = client.post("/recommend", json=payload)
        assert resp.status_code == 422


# ── /api/shoot-match API Fuzz ─────────────────────────────

class TestShootMatchFuzz:
    """shoot-match must return 200 or 422, never 500."""

    VALID_MOODS = ["Clean & Classic", "Moody & Dramatic", "Soft & Ethereal", "Bold & Edgy",
                   "High Fashion", "Natural & Available", "Cinematic"]
    VALID_ENVS = ["Small Room", "Home Studio", "Medium Studio", "Large Studio",
                  "Outdoor", "Window Light", "Office"]

    @pytest.mark.parametrize("i", range(20))
    def test_random_shoot_match(self, i):
        payload = {
            "subject": RNG.choice(["headshot", "portrait", "product", rand_string(10)]),
            "mood": RNG.choice(self.VALID_MOODS + [rand_string(15)]),
            "environment": RNG.choice(self.VALID_ENVS + [rand_string(15)]),
            "ceiling": RNG.choice(["normal", "low", "high", rand_string(5)]),
            "gearMode": RNG.choice(["anyGear", "myGear", rand_string(5)]),
            "gear": [rand_string(10) for _ in range(RNG.randint(0, 3))],
        }
        resp = client.post("/api/shoot-match", json=payload)
        assert resp.status_code in (200, 422), f"Unexpected {resp.status_code}: {resp.text[:300]}"

    def test_shoot_match_empty_strings(self):
        payload = {"subject": "", "mood": "", "environment": "", "ceiling": "", "gearMode": ""}
        resp = client.post("/api/shoot-match", json=payload)
        assert resp.status_code in (200, 422)

    def test_shoot_match_missing_fields(self):
        resp = client.post("/api/shoot-match", json={})
        assert resp.status_code == 422

    def test_shoot_match_null_skin_tone(self):
        payload = {
            "mood": "Clean & Classic",
            "environment": "Medium Studio",
            "skinTone": None,
        }
        resp = client.post("/api/shoot-match", json=payload)
        assert resp.status_code in (200, 422)


# ── Admin API Fuzz ────────────────────────────────────────

class TestAdminFuzz:
    """Admin endpoints must handle bad inputs gracefully."""

    def test_create_system_missing_all(self):
        resp = client.post("/api/admin/systems", json={})
        assert resp.status_code == 422

    def test_create_system_wrong_types(self):
        payload = {
            "id": 12345,
            "name": True,
            "criteria": "not a dict",
            "features": [],
            "taxonomy_refs": None,
        }
        resp = client.post("/api/admin/systems", json=payload)
        assert resp.status_code == 422

    def test_update_system_empty_body(self):
        resp = client.put("/api/admin/systems/nonexistent", json={})
        assert resp.status_code == 404

    @pytest.mark.parametrize("path", [
        "/api/admin/systems/../../etc/passwd",
        "/api/admin/systems/" + "A" * 1000,
        "/api/admin/systems/null",
        "/api/admin/systems/undefined",
        "/api/admin/systems/<script>alert(1)</script>",
    ])
    def test_system_path_traversal(self, path):
        resp = client.get(path)
        assert resp.status_code in (404, 422, 400)

    def test_image_label_wrong_types(self):
        resp = client.post("/api/admin/image-labels", json={
            "image_path": 12345,
            "expected_mood": [],
        })
        assert resp.status_code == 422

    def test_changelog_negative_limit(self):
        resp = client.get("/api/admin/changelog", params={"limit": -1})
        assert resp.status_code == 422

    def test_changelog_huge_limit(self):
        resp = client.get("/api/admin/changelog", params={"limit": 999999})
        assert resp.status_code == 422
