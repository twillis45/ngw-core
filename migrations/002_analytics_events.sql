-- =============================================================================
-- Migration 002: Analytics Events Table
-- =============================================================================
-- Raw event log. Each row is one client-side event (page_view, analysis_start,
-- upgrade_click, etc.). Joins to session_provenance via session_id.
--
-- JSONB `data` column replaces the SQLite TEXT field so event-level attributes
-- are queryable without application-side parsing.
--
-- Rollback: DROP TABLE analytics_events;
-- =============================================================================

BEGIN;

CREATE TABLE analytics_events (
    id          BIGSERIAL   PRIMARY KEY,
    name        TEXT        NOT NULL,           -- event name, e.g. 'analysis_complete'
    session_id  TEXT        REFERENCES session_provenance(session_id) ON DELETE SET NULL,
    user_id     TEXT,
    data        JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE analytics_events IS
    'Append-only event log. Never updated after insert. '
    'session_id FK → session_provenance (nullable: anonymous events have no session). '
    'Exclusion filtering is handled by joining to session_provenance and applying '
    'WHERE sp.exclude_from_metrics = false (or the appropriate flag column).';

COMMENT ON COLUMN analytics_events.data IS
    'Event-specific payload as JSONB. Indexed with GIN for attribute queries. '
    'Example keys: pattern, confidence, steps_completed, match_result, source_screen.';

COMMIT;
