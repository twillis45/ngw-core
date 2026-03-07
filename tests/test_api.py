"""Tests for main.py (FastAPI endpoint)

Covers:
  Fix #1  — models/__init__.py re-exports work (tested by import)
  Fix #4  — validation errors return HTTP 422, not 200
  Fix #6  — unused imports removed (tested by import + no runtime errors)
  Edge    — happy path, empty systems, malformed body
"""

import pytest

from fastapi.testclient import TestClient

from main import app


client = TestClient(app)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _payload(*systems, **meta) -> dict:
    if not systems:
        systems = [
            {
                "id": "led-1",
                "name": "LED Panel",
                "criteria": {"brightness": 8000, "energy_efficiency": 150},
                "features": {"dimmable": True},
            }
        ]
    return {"systems": list(systems), "metadata": meta}


# ── Fix #1: models __init__ imports ──────────────────────────────────────────

class TestModelsInit:
    def test_all_exports_importable(self):
        """Fix #1: every name in models.__all__ must resolve."""
        from models import __all__ as names
        import models
        for name in names:
            assert hasattr(models, name), f"models.{name} missing"


# ── Happy path ───────────────────────────────────────────────────────────────

class TestRecommendHappyPath:
    def test_single_system_returns_200(self):
        resp = client.post("/recommend", json=_payload())
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "success"
        assert body["result"]["structured"] is not None
        assert "LED Panel" in body["result"]["content"]

    def test_multi_system_picks_best(self):
        systems = [
            {"id": "weak", "name": "Weak", "criteria": {"brightness": 100}},
            {"id": "strong", "name": "Strong", "criteria": {"brightness": 9000}},
        ]
        resp = client.post("/recommend", json=_payload(*systems))
        assert resp.status_code == 200
        body = resp.json()
        assert "Strong" in body["result"]["content"]

    def test_metadata_passed_through(self):
        resp = client.post("/recommend", json=_payload(trace_id="abc"))
        body = resp.json()
        assert body["metadata"]["trace_id"] == "abc"
        assert "engine_version" in body["metadata"]

    def test_request_id_present(self):
        resp = client.post("/recommend", json=_payload())
        body = resp.json()
        assert body["request_id"].startswith("req_")

    def test_processing_ms_present(self):
        resp = client.post("/recommend", json=_payload())
        body = resp.json()
        assert body["usage"]["processing_ms"] >= 0

    def test_confidence_in_response(self):
        resp = client.post("/recommend", json=_payload())
        body = resp.json()
        assert "confidence" in body["result"]
        assert 0 <= body["result"]["confidence"] <= 100

    def test_confidence_in_content_string(self):
        resp = client.post("/recommend", json=_payload())
        body = resp.json()
        assert "confidence" in body["result"]["content"]

    def test_confidence_in_structured_output(self):
        resp = client.post("/recommend", json=_payload())
        body = resp.json()
        structured = body["result"]["structured"]
        assert "confidence" in structured["selection"]
        winner = structured["selection"]["winner"]
        assert "confidence" in winner
        assert 0 <= winner["confidence"]["score"] <= 100
        assert len(winner["confidence"]["reasons"]) >= 4

    def test_top_picks_in_structured_output(self):
        systems = [
            {"id": "a", "name": "A", "criteria": {"brightness": 1000}},
            {"id": "b", "name": "B", "criteria": {"brightness": 5000}},
            {"id": "c", "name": "C", "criteria": {"brightness": 9000}},
        ]
        resp = client.post("/recommend", json=_payload(*systems))
        body = resp.json()
        picks = body["result"]["structured"]["selection"]["top_picks"]
        assert len(picks) == 3
        assert picks[0]["rank"] == 1
        assert picks[1]["rank"] == 2
        assert picks[2]["rank"] == 3
        assert "Primary" in picks[0]["reason"]
        assert "Alternative" in picks[1]["reason"]

    def test_top_picks_single_system(self):
        resp = client.post("/recommend", json=_payload())
        body = resp.json()
        picks = body["result"]["structured"]["selection"]["top_picks"]
        assert len(picks) == 1

    def test_alternatives_in_content_string(self):
        systems = [
            {"id": "a", "name": "Sys A", "criteria": {"brightness": 1000}},
            {"id": "b", "name": "Sys B", "criteria": {"brightness": 5000}},
            {"id": "c", "name": "Sys C", "criteria": {"brightness": 9000}},
        ]
        resp = client.post("/recommend", json=_payload(*systems))
        body = resp.json()
        content = body["result"]["content"]
        assert "Recommended:" in content
        assert "Alt #2" in content
        assert "Alt #3" in content

    def test_single_system_no_alt_in_content(self):
        resp = client.post("/recommend", json=_payload())
        body = resp.json()
        assert "Alt #" not in body["result"]["content"]

    def test_diagram_spec_in_result(self):
        resp = client.post("/recommend", json=_payload())
        body = resp.json()
        ds = body["result"]["diagram_spec"]
        assert ds is not None
        assert "system_id" in ds
        assert "lights" in ds
        assert len(ds["lights"]) >= 1
        assert "subject" in ds
        assert "camera" in ds

    def test_diagram_key_light_present(self):
        resp = client.post("/recommend", json=_payload())
        body = resp.json()
        lights = body["result"]["diagram_spec"]["lights"]
        roles = [l["role"] for l in lights]
        assert "key" in roles

    def test_diagram_on_every_top_pick(self):
        systems = [
            {"id": "a", "name": "A", "criteria": {"brightness": 1000}},
            {"id": "b", "name": "B", "criteria": {"brightness": 5000}},
            {"id": "c", "name": "C", "criteria": {"brightness": 9000}},
        ]
        resp = client.post("/recommend", json=_payload(*systems))
        body = resp.json()
        picks = body["result"]["structured"]["selection"]["top_picks"]
        for pick in picks:
            assert "diagram_spec" in pick
            assert pick["diagram_spec"]["system_id"] == pick["breakdown"]["system_id"]
            assert len(pick["diagram_spec"]["lights"]) >= 1

    def test_diagram_with_taxonomy_refs(self):
        sys_with_refs = {
            "id": "beauty-mono",
            "name": "Beauty Mono",
            "criteria": {"brightness": 9000, "color_accuracy": 96},
            "features": {"dimmable": True},
            "taxonomy_refs": {
                "gear_profile": "strobe_mono",
                "modifier_family": "beauty_dish",
                "mood": "beauty",
            },
        }
        resp = client.post("/recommend", json=_payload(sys_with_refs))
        body = resp.json()
        ds = body["result"]["diagram_spec"]
        key = ds["lights"][0]
        assert key["role"] == "key"
        assert key["angle_deg"] == 0.0  # beauty = frontal


# ── Error handling (Fix #4) ──────────────────────────────────────────────────

class TestRecommendErrors:
    def test_empty_systems_returns_422(self):
        """FastAPI's own validation catches min_length=1."""
        resp = client.post("/recommend", json={"systems": []})
        assert resp.status_code == 422

    def test_missing_systems_key_returns_422(self):
        resp = client.post("/recommend", json={"metadata": {}})
        assert resp.status_code == 422

    def test_invalid_json_returns_422(self):
        resp = client.post(
            "/recommend",
            content="not json",
            headers={"content-type": "application/json"},
        )
        assert resp.status_code == 422

    def test_empty_id_returns_422(self):
        """Fix #7 enforcement via API layer."""
        resp = client.post(
            "/recommend",
            json=_payload({"id": "", "name": "Bad", "criteria": {}}),
        )
        assert resp.status_code == 422

    def test_empty_name_returns_422(self):
        resp = client.post(
            "/recommend",
            json=_payload({"id": "ok", "name": "", "criteria": {}}),
        )
        assert resp.status_code == 422


# ── Health endpoint ──────────────────────────────────────────────────────────

class TestHealth:
    def test_health_returns_ok(self):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"


# ── Static UI ────────────────────────────────────────────────────────────────

class TestStaticUI:
    def test_root_redirects_to_ui(self):
        resp = client.get("/", follow_redirects=False)
        assert resp.status_code in (301, 302, 307)
        assert "/static/index.html" in resp.headers.get("location", "")

    def test_static_index_serves_html(self):
        resp = client.get("/static/index.html")
        assert resp.status_code == 200
        assert "text/html" in resp.headers.get("content-type", "")
        body = resp.text
        assert "<title>NGW Core v1</title>" in body
        assert "/recommend" in body
        assert "confidence" in body.lower()
