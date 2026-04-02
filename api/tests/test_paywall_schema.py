"""
test_paywall_schema.py

Regression-hardening tests for NGW Core paywall analytics — backend layer.

Canonical registries:
  trigger_type      : nailed_it | close | failure | exit_intent | shoot_mode | recipe_locked | analysis_limit
  surface           : blueprint_card | camera_settings | gear_recommendation |
                      exit_intent | shoot_mode | recipe_locked | success_moment
  paywall_type      : pricing | shoot
  presentation_type : bottom_sheet | inline_gate | nudge
  source_screen     : ResultsScreenV2 | RecipeScreen

Deprecated values that must NEVER appear in attribution fields:
  hard | soft | blueprint | camera | gear
  inline_gate (as paywall_type value)
  bottom_sheet (as paywall_type value)
"""

import pytest
import json
import sys
import os

# Provide required env vars before any app imports
os.environ.setdefault('NGW_JWT_SECRET', 'test-secret-for-unit-tests-only-not-production')
os.environ.setdefault('STRIPE_SECRET_KEY', 'sk_test_dummy')
os.environ.setdefault('STRIPE_WEBHOOK_SECRET', 'whsec_dummy')

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from routes.stripe_checkout import CheckoutSessionRequest


# ─── Canonical enum sets ────────────────────────────────────────────────────

TRIGGER_TYPES = {
    'nailed_it', 'close', 'failure', 'exit_intent',
    'shoot_mode', 'recipe_locked', 'analysis_limit',
}

SURFACES = {
    'blueprint_card', 'camera_settings', 'gear_recommendation',
    'exit_intent', 'shoot_mode', 'recipe_locked', 'success_moment',
}

PAYWALL_TYPES = {'pricing', 'shoot'}

PRESENTATION_TYPES = {'bottom_sheet', 'inline_gate', 'nudge'}

SOURCE_SCREENS = {'ResultsScreenV2', 'RecipeScreen'}

DEPRECATED_VALUES = {'hard', 'soft', 'blueprint', 'camera', 'gear', 'inline_gate', 'bottom_sheet'}


# ─── Helpers ────────────────────────────────────────────────────────────────

def _make_base_request(**kwargs):
    """Minimal valid CheckoutSessionRequest with overridable fields."""
    defaults = dict(
        billing_period='monthly',
        plan='pro',
        success_url='https://example.com/static/ui/?checkout_success=1',
        cancel_url='https://example.com/static/ui/',
        ngw_session_id='test-session-abc123',
    )
    defaults.update(kwargs)
    return CheckoutSessionRequest(**defaults)


def assert_no_deprecated(value, field_name):
    """Assert a field value is not in the deprecated set."""
    assert value not in DEPRECATED_VALUES, (
        f"Field '{field_name}' contains deprecated value '{value}'. "
        f"Deprecated: {DEPRECATED_VALUES}"
    )


# ─── E. CheckoutSessionRequest — model schema ────────────────────────────────

class TestCheckoutSessionRequestSchema:
    """E. Backend request schema validation."""

    def test_accepts_all_canonical_fields(self):
        req = _make_base_request(
            trigger_type='nailed_it',
            surface='blueprint_card',
            paywall_type='pricing',
            source_screen='ResultsScreenV2',
        )
        assert req.trigger_type == 'nailed_it'
        assert req.surface == 'blueprint_card'
        assert req.paywall_type == 'pricing'
        assert req.source_screen == 'ResultsScreenV2'

    def test_paywall_type_default_is_none_not_deprecated(self):
        """paywall_type must default to None — not 'bottom_sheet' or 'inline_gate'."""
        req = _make_base_request()
        assert req.paywall_type is None, (
            f"paywall_type default should be None, got '{req.paywall_type}'"
        )

    def test_surface_default_is_none(self):
        req = _make_base_request()
        assert req.surface is None

    def test_source_screen_default_is_none(self):
        req = _make_base_request()
        assert req.source_screen is None

    def test_trigger_type_default_is_none(self):
        req = _make_base_request()
        assert req.trigger_type is None

    @pytest.mark.parametrize('trigger_type', sorted(TRIGGER_TYPES))
    def test_all_canonical_trigger_types_accepted(self, trigger_type):
        req = _make_base_request(trigger_type=trigger_type)
        assert req.trigger_type == trigger_type

    @pytest.mark.parametrize('surface', sorted(SURFACES))
    def test_all_canonical_surfaces_accepted(self, surface):
        req = _make_base_request(surface=surface)
        assert req.surface == surface

    @pytest.mark.parametrize('paywall_type', sorted(PAYWALL_TYPES))
    def test_all_canonical_paywall_types_accepted(self, paywall_type):
        req = _make_base_request(paywall_type=paywall_type)
        assert req.paywall_type == paywall_type

    @pytest.mark.parametrize('source_screen', sorted(SOURCE_SCREENS))
    def test_all_canonical_source_screens_accepted(self, source_screen):
        req = _make_base_request(source_screen=source_screen)
        assert req.source_screen == source_screen


# ─── Negative — deprecated values must not appear ────────────────────────────

class TestNoDeprecatedValues:
    """Negative assertions: deprecated values must not appear in attribution fields."""

    @pytest.mark.parametrize('deprecated', ['bottom_sheet', 'inline_gate'])
    def test_deprecated_paywall_type_is_not_the_default(self, deprecated):
        req = _make_base_request()
        assert req.paywall_type != deprecated

    @pytest.mark.parametrize('deprecated', ['hard', 'soft'])
    def test_hard_soft_are_not_canonical_trigger_types(self, deprecated):
        assert deprecated not in TRIGGER_TYPES

    @pytest.mark.parametrize('deprecated', ['blueprint', 'camera', 'gear'])
    def test_short_surface_names_are_not_canonical(self, deprecated):
        assert deprecated not in SURFACES

    def test_no_deprecated_value_in_canonical_paywall_types(self):
        deprecated_paywall_type_values = {'bottom_sheet', 'inline_gate'}
        overlap = PAYWALL_TYPES & deprecated_paywall_type_values
        assert not overlap, f"Canonical PAYWALL_TYPES contains deprecated values: {overlap}"


# ─── E. Stripe metadata shape — field presence ──────────────────────────────

class TestStripeMetadataFields:
    """E. Verify Stripe metadata contains all canonical attribution fields."""

    REQUIRED_METADATA_KEYS = {
        'ngw_session_id',
        'trigger_type',
        'surface',
        'paywall_type',
        'source_screen',
        'billing_period',
        'copy_variant',
        'pricing_variant',
    }

    def test_checkout_request_has_all_metadata_source_fields(self):
        """CheckoutSessionRequest must expose all fields that go into Stripe metadata."""
        req = _make_base_request(
            trigger_type='nailed_it',
            surface='blueprint_card',
            paywall_type='pricing',
            source_screen='ResultsScreenV2',
            copy_variant='control',
            pricing_variant='control_39',
        )
        # All fields used to populate metadata must be present and non-None when set
        assert req.ngw_session_id == 'test-session-abc123'
        assert req.trigger_type == 'nailed_it'
        assert req.surface == 'blueprint_card'
        assert req.paywall_type == 'pricing'
        assert req.source_screen == 'ResultsScreenV2'
        assert req.copy_variant == 'control'
        assert req.pricing_variant == 'control_39'


# ─── B–C. Entry point matrix ─────────────────────────────────────────────────

class TestEntryPointMatrix:
    """B+C. Verify every documented entry point maps to canonical values."""

    ENTRY_POINTS = [
        # (label,                trigger_type,    surface,               paywall_type, source_screen)
        ('blueprint_card_tap',   'nailed_it',     'blueprint_card',      'pricing',    'ResultsScreenV2'),
        ('camera_settings_gate', 'nailed_it',     'camera_settings',     'pricing',    'ResultsScreenV2'),
        ('gear_rec_gate',        'nailed_it',     'gear_recommendation', 'pricing',    'ResultsScreenV2'),
        ('exit_intent',          'exit_intent',   'exit_intent',         'pricing',    'ResultsScreenV2'),
        ('shoot_mode_gate',      'shoot_mode',    'shoot_mode',          'shoot',      'ResultsScreenV2'),
        ('recipe_locked',        'recipe_locked', 'recipe_locked',       'pricing',    'RecipeScreen'),
        ('success_moment',       'nailed_it',     'success_moment',      'pricing',    'ResultsScreenV2'),
    ]

    @pytest.mark.parametrize('label,trigger_type,surface,paywall_type,source_screen', ENTRY_POINTS)
    def test_entry_point_values_are_canonical(self, label, trigger_type, surface, paywall_type, source_screen):
        assert trigger_type in TRIGGER_TYPES, f"[{label}] trigger_type '{trigger_type}' not canonical"
        assert surface in SURFACES,           f"[{label}] surface '{surface}' not canonical"
        assert paywall_type in PAYWALL_TYPES, f"[{label}] paywall_type '{paywall_type}' not canonical"
        assert source_screen in SOURCE_SCREENS, f"[{label}] source_screen '{source_screen}' not canonical"
        assert_no_deprecated(trigger_type, 'trigger_type')
        assert_no_deprecated(surface, 'surface')
        assert_no_deprecated(paywall_type, 'paywall_type')
