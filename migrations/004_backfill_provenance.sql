-- =============================================================================
-- Migration 004: Backfill Provenance from Existing Analytics Events
-- =============================================================================
-- Inserts session_provenance rows for all sessions that already exist in
-- analytics_events but have no provenance record yet.
--
-- Safety rules
-- ------------
-- 1. Production default: any session whose email is NOT in the known-internal
--    or known-expert sets is treated as 'production' with all exclude_* = false.
--    This is the safe default — it never silently REMOVES data from analytics.
--
-- 2. Known-internal emails are listed explicitly in the CTE below.
--    Add addresses to match your ADMIN_EMAILS / NGW_DEV_EMAILS env var values.
--
-- 3. Expert emails are NOT backfilled as expert_review by default because they
--    were historically counted as production. Reclassifying them retroactively
--    would reduce historical metrics without clear benefit. Leave as production
--    unless you have a known list and have audited the impact.
--
-- 4. The INSERT uses ON CONFLICT DO NOTHING so it is safe to re-run.
--
-- 5. Run in a transaction. Validate row counts before COMMIT.
--
-- Rollback: DELETE FROM session_provenance WHERE created_at < '<migration_ts>';
--           (or just ROLLBACK within the transaction)
-- =============================================================================

BEGIN;

-- ── Step 1: define known-internal emails ────────────────────────────────────
-- Edit this list to match ADMIN_EMAILS + NGW_DEV_EMAILS in your environment.

WITH internal_emails AS (
    SELECT unnest(ARRAY[
        'todd@toddwillisphoto.com'
        -- Add additional internal / dev emails here:
        -- ,'dev1@example.com'
        -- ,'dev2@example.com'
    ]) AS email
),

-- ── Step 2: derive one row per session from the events table ─────────────────
-- We want: session_id, the user_id and user_email most recently seen for it,
-- and min/max timestamps for first/last_seen_at.

session_facts AS (
    SELECT
        ae.session_id,
        -- Most recent user_id associated with this session
        (ARRAY_AGG(ae.user_id ORDER BY ae.created_at DESC)
            FILTER (WHERE ae.user_id IS NOT NULL)
        )[1]                                    AS user_id,
        -- Most recent user_email from event data (stored as data->>'user_email')
        (ARRAY_AGG(ae.data->>'user_email' ORDER BY ae.created_at DESC)
            FILTER (WHERE ae.data->>'user_email' IS NOT NULL)
        )[1]                                    AS user_email,
        MIN(ae.created_at)                      AS first_seen_at,
        MAX(ae.created_at)                      AS last_seen_at,
        COUNT(*) FILTER (WHERE ae.name = 'analysis_complete') AS analysis_count,
        BOOL_OR(ae.name = 'shoot_mode_start')   AS shoot_mode_started,
        BOOL_OR(ae.name = 'shoot_mode_match')   AS shoot_mode_matched,
        BOOL_OR(ae.name IN ('upgrade_complete', 'paywall_converted')) AS upgraded,
        MIN(ae.created_at) FILTER (
            WHERE ae.name IN ('upgrade_complete', 'paywall_converted')
        )                                        AS upgrade_at
    FROM analytics_events ae
    WHERE ae.session_id IS NOT NULL
    GROUP BY ae.session_id
),

-- ── Step 3: classify each session ───────────────────────────────────────────

classified AS (
    SELECT
        sf.session_id,
        sf.user_id,
        sf.user_email,
        sf.first_seen_at,
        sf.last_seen_at,
        sf.analysis_count,
        sf.shoot_mode_started,
        sf.shoot_mode_matched,
        sf.upgraded,
        sf.upgrade_at,

        -- Classification
        CASE
            WHEN LOWER(sf.user_email) IN (SELECT email FROM internal_emails) THEN 'internal'::session_origin_type
            ELSE 'production'::session_origin_type
        END AS session_origin,

        -- Exclusion flags
        CASE
            WHEN LOWER(sf.user_email) IN (SELECT email FROM internal_emails) THEN true
            ELSE false
        END AS exclude_from_learning,
        CASE
            WHEN LOWER(sf.user_email) IN (SELECT email FROM internal_emails) THEN true
            ELSE false
        END AS exclude_from_metrics,
        CASE
            WHEN LOWER(sf.user_email) IN (SELECT email FROM internal_emails) THEN true
            ELSE false
        END AS exclude_from_conversion,
        CASE
            WHEN LOWER(sf.user_email) IN (SELECT email FROM internal_emails) THEN true
            ELSE false
        END AS exclude_from_cohorts,

        -- Review flags
        CASE
            WHEN LOWER(sf.user_email) IN (SELECT email FROM internal_emails) THEN true
            ELSE false
        END AS eligible_for_reference_review,

        CASE
            WHEN LOWER(sf.user_email) IN (SELECT email FROM internal_emails)
                THEN 'backfill: internal account (' || sf.user_email || ')'
            ELSE 'backfill: production user'
        END AS classification_reason

    FROM session_facts sf
)

-- ── Step 4: insert (idempotent — skip existing rows) ──────────────────────────

INSERT INTO session_provenance (
    session_id, user_id, user_email,
    session_origin, classification_reason,
    exclude_from_learning, exclude_from_metrics,
    exclude_from_conversion, exclude_from_cohorts,
    eligible_for_reference_review, manually_promote_for_learning_review,
    first_seen_at, last_seen_at,
    analysis_count, shoot_mode_started, shoot_mode_matched,
    upgraded, upgrade_at,
    created_at, updated_at
)
SELECT
    session_id, user_id, user_email,
    session_origin, classification_reason,
    exclude_from_learning, exclude_from_metrics,
    exclude_from_conversion, exclude_from_cohorts,
    eligible_for_reference_review, false,  -- manually_promote: never backfill as promoted
    first_seen_at, last_seen_at,
    analysis_count, shoot_mode_started, shoot_mode_matched,
    upgraded, upgrade_at,
    first_seen_at,  -- created_at: use first event time for historical fidelity
    now()           -- updated_at: this migration run
FROM classified
ON CONFLICT (session_id) DO NOTHING;

-- ── Step 5: sanity check (review before committing) ───────────────────────────
-- Run these SELECTs manually to validate before COMMIT:
--
-- SELECT session_origin, COUNT(*) FROM session_provenance GROUP BY session_origin;
-- SELECT COUNT(*) FROM session_provenance WHERE exclude_from_metrics = true;
-- SELECT COUNT(*) FROM analytics_events WHERE session_id IS NOT NULL
--   AND session_id NOT IN (SELECT session_id FROM session_provenance);  -- should be 0

COMMIT;
