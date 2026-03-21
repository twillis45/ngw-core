-- =============================================================================
-- Migration 001: Session Provenance Schema
-- =============================================================================
-- Creates the session_provenance table (and supporting enum type) to track
-- the origin and data-hygiene flags for every session.
--
-- Provenance rules:
--   internal      → all exclude_* = true, eligible_for_reference_review = true
--   expert_review → all exclude_* = true, eligible_for_reference_review = true
--   production    → all exclude_* = false (real users, counted everywhere)
--
-- The exclusion flags are the authoritative gate. Analytics queries filter via:
--   WHERE exclude_from_metrics = false
--   WHERE exclude_from_conversion = false
--   etc.
-- These align with the partial indexes in migration 002.
--
-- Rollback: DROP TABLE session_provenance; DROP TYPE session_origin_type;
-- =============================================================================

BEGIN;

-- ── Enum type ─────────────────────────────────────────────────────────────────

CREATE TYPE session_origin_type AS ENUM (
    'production',       -- real end user, included in all analytics
    'internal',         -- team / admin account, excluded from all analytics
    'expert_review'     -- invited reviewer, excluded by default, can be promoted
);

-- ── Core provenance table ─────────────────────────────────────────────────────

CREATE TABLE session_provenance (
    -- Identity
    session_id          TEXT        PRIMARY KEY,
    user_id             TEXT,                           -- NULL for anonymous sessions
    user_email          TEXT,                           -- NULL for anonymous sessions

    -- Classification
    session_origin      session_origin_type NOT NULL DEFAULT 'production',
    classification_reason TEXT,                         -- human-readable why

    -- Exclusion flags (all default false = included in analytics)
    -- Production sessions: all false. Internal/expert: all true.
    exclude_from_learning   BOOLEAN NOT NULL DEFAULT false,
    exclude_from_metrics    BOOLEAN NOT NULL DEFAULT false,
    exclude_from_conversion BOOLEAN NOT NULL DEFAULT false,
    exclude_from_cohorts    BOOLEAN NOT NULL DEFAULT false,

    -- Review flags (only meaningful for internal/expert origins)
    eligible_for_reference_review       BOOLEAN NOT NULL DEFAULT false,
    manually_promote_for_learning_review BOOLEAN NOT NULL DEFAULT false,

    -- Cohort columns (auto-computed from created_at, no application logic needed)
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Computed cohort columns for retention / cohort queries
    cohort_month        DATE GENERATED ALWAYS AS (
                            DATE_TRUNC('month', created_at)::DATE
                        ) STORED,
    cohort_week         DATE GENERATED ALWAYS AS (
                            DATE_TRUNC('week', created_at)::DATE
                        ) STORED,

    -- Optional session-level outcome fields (set via events or upgrade webhooks)
    -- Denormalized here for O(1) cohort aggregation without joining events table
    first_seen_at       TIMESTAMPTZ,                    -- timestamp of first tracked event
    last_seen_at        TIMESTAMPTZ,                    -- timestamp of most recent event
    analysis_count      INT         NOT NULL DEFAULT 0, -- how many analyze events fired
    shoot_mode_started  BOOLEAN     NOT NULL DEFAULT false,
    shoot_mode_matched  BOOLEAN     NOT NULL DEFAULT false,
    upgraded            BOOLEAN     NOT NULL DEFAULT false,
    upgrade_at          TIMESTAMPTZ,                    -- timestamp of upgrade event

    -- Free-form metadata bag (referrer, UTM params, device type, etc.)
    metadata            JSONB       NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE session_provenance IS
    'One row per session. Tracks origin classification and data-hygiene exclusion '
    'flags so internal/admin/expert usage is never silently mixed into production '
    'analytics, conversion metrics, cohorts, or the learning engine.';

COMMENT ON COLUMN session_provenance.cohort_month IS
    'Computed from created_at. Used for monthly retention cohort queries. '
    'Stored (not virtual) so it can be indexed.';

COMMENT ON COLUMN session_provenance.metadata IS
    'Free-form JSONB bag. Typical keys: utm_source, utm_medium, utm_campaign, '
    'referrer, device_type, app_version.';

COMMIT;
