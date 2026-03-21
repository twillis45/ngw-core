-- =============================================================================
-- Migration 003: Indexes
-- =============================================================================
-- Full indexes for FK lookups and time-range scans.
-- Partial indexes for the hot analytics query paths — these are the primary
-- performance advantage over the SQLite subquery approach.
--
-- Partial index strategy
-- ----------------------
-- The SQLite implementation uses parameterless AND-fragments:
--
--   AND (session_id IS NULL OR session_id NOT IN
--        (SELECT session_id FROM session_provenance WHERE exclude_from_metrics=1))
--
-- In Postgres, the equivalent is a JOIN + partial index:
--
--   JOIN session_provenance sp USING (session_id)
--   WHERE sp.exclude_from_metrics = false
--
-- Partial indexes on WHERE exclude_from_* = false make these filters nearly
-- free: the index only covers the (overwhelmingly large) production set and
-- automatically excludes the small internal/expert minority.
--
-- Rollback: DROP INDEX each by name (listed at bottom).
-- =============================================================================

BEGIN;

-- ── session_provenance: lookup indexes ───────────────────────────────────────

CREATE INDEX idx_sp_user_id
    ON session_provenance (user_id)
    WHERE user_id IS NOT NULL;

CREATE INDEX idx_sp_origin
    ON session_provenance (session_origin);

CREATE INDEX idx_sp_created_at
    ON session_provenance (created_at DESC);

CREATE INDEX idx_sp_cohort_month
    ON session_provenance (cohort_month);

CREATE INDEX idx_sp_cohort_week
    ON session_provenance (cohort_week);

-- ── session_provenance: partial indexes (THE KEY PERFORMANCE PRIMITIVES) ─────
--
-- Each covers only the rows that pass the filter (production sessions).
-- Analytics queries that join on these conditions get index-only scans.

CREATE INDEX idx_sp_production_metrics
    ON session_provenance (created_at DESC)
    WHERE exclude_from_metrics = false;

CREATE INDEX idx_sp_production_conversion
    ON session_provenance (created_at DESC)
    WHERE exclude_from_conversion = false;

CREATE INDEX idx_sp_production_cohorts
    ON session_provenance (cohort_month, created_at)
    WHERE exclude_from_cohorts = false;

CREATE INDEX idx_sp_production_learning
    ON session_provenance (created_at DESC)
    WHERE exclude_from_learning = false;

-- Compound partial: session upgraded + production (conversion funnel leaf)
CREATE INDEX idx_sp_upgraded_production
    ON session_provenance (upgrade_at DESC)
    WHERE upgraded = true AND exclude_from_conversion = false;

-- Expert/internal sessions eligible for reference review
CREATE INDEX idx_sp_eligible_review
    ON session_provenance (created_at DESC)
    WHERE eligible_for_reference_review = true
      AND manually_promote_for_learning_review = false;

-- ── analytics_events: lookup indexes ─────────────────────────────────────────

CREATE INDEX idx_ae_session_id
    ON analytics_events (session_id)
    WHERE session_id IS NOT NULL;

CREATE INDEX idx_ae_name_created
    ON analytics_events (name, created_at DESC);

CREATE INDEX idx_ae_created_at
    ON analytics_events (created_at DESC);

-- GIN index on JSONB data for attribute queries (pattern, confidence, etc.)
CREATE INDEX idx_ae_data_gin
    ON analytics_events USING GIN (data);

-- Composite for pattern performance queries: filter by name, aggregate by data->>'pattern'
CREATE INDEX idx_ae_name_session
    ON analytics_events (name, session_id)
    WHERE session_id IS NOT NULL;

COMMIT;

-- ── Index inventory (for rollback reference) ─────────────────────────────────
-- idx_sp_user_id
-- idx_sp_origin
-- idx_sp_created_at
-- idx_sp_cohort_month
-- idx_sp_cohort_week
-- idx_sp_production_metrics
-- idx_sp_production_conversion
-- idx_sp_production_cohorts
-- idx_sp_production_learning
-- idx_sp_upgraded_production
-- idx_sp_eligible_review
-- idx_ae_session_id
-- idx_ae_name_created
-- idx_ae_created_at
-- idx_ae_data_gin
-- idx_ae_name_session
