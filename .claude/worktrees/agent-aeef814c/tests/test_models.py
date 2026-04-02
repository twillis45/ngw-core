"""Tests for models/input_model.py and models/output_model.py

Covers:
  Fix #1  — models package importable without crash
  Edge    — model validation, enum values, defaults
"""

import pytest
from datetime import datetime, timezone


# ── Import smoke test (Fix #1) ───────────────────────────────────────────────

class TestModelImports:
    def test_input_models_importable(self):
        from models.input_model import NGWRequest, TaskType, OutputFormat, EngineOptions, ContextItem
        assert NGWRequest is not None

    def test_output_models_importable(self):
        from models.output_model import NGWResponse, StatusCode, ResultPayload, UsageStats, ErrorDetail
        assert NGWResponse is not None

    def test_package_init_importable(self):
        import models
        assert hasattr(models, "NGWRequest")
        assert hasattr(models, "NGWResponse")


# ── Input model validation ───────────────────────────────────────────────────

class TestNGWRequest:
    def test_minimal_valid_request(self):
        from models.input_model import NGWRequest
        req = NGWRequest(task="generate", prompt="hello")
        assert req.output_format.value == "json"  # default
        assert req.options.temperature == 0.7       # default
        assert req.context == []

    def test_empty_prompt_rejected(self):
        from models.input_model import NGWRequest
        with pytest.raises(Exception):
            NGWRequest(task="generate", prompt="")

    def test_invalid_task_rejected(self):
        from models.input_model import NGWRequest
        with pytest.raises(Exception):
            NGWRequest(task="invalid_task", prompt="hello")

    def test_context_role_validated(self):
        from models.input_model import ContextItem
        with pytest.raises(Exception):
            ContextItem(role="villain", content="nope")


# ── Output model defaults ───────────────────────────────────────────────────

class TestNGWResponse:
    def test_success_response(self):
        from models.output_model import NGWResponse, StatusCode
        resp = NGWResponse(request_id="req_123", status=StatusCode.SUCCESS)
        assert resp.ok is True
        assert resp.error is None
        assert isinstance(resp.created_at, datetime)

    def test_error_response(self):
        from models.output_model import NGWResponse, StatusCode, ErrorDetail
        resp = NGWResponse(
            request_id="req_456",
            status=StatusCode.ERROR,
            error=ErrorDetail(code="TEST", message="boom"),
        )
        assert resp.ok is False
        assert resp.error.code == "TEST"

    def test_usage_defaults_to_zero(self):
        from models.output_model import UsageStats
        u = UsageStats()
        assert u.prompt_tokens == 0
        assert u.total_tokens == 0
        assert u.processing_ms == 0.0
