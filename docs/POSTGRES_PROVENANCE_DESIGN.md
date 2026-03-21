# Postgres Session Provenance — Design Document

## Overview

This document covers the complete design for migrating NGW session provenance and analytics from SQLite to Postgres. The SQLite implementation (`db/provenance.py`) is production-complete; this design provides a Postgres-native equivalent with better performance characteristics for analytics at scale.

**Files produced:**
- `migrations/001_sessions_provenance.sql` — schema + enum type
- `migrations/002_analytics_events.sql` — events table
- `migrations/003_indexes.sql` — full + partial indexes
- `migrations/004_backfill_provenance.sql` — historical data backfill
- `db/pg_provenance.py` — Python session creation (asyncpg + psycopg2)

---

## 1. Schema Changes

### New type: `session_origin_type` (ENUM)

```sql
CREATE TYPE session_origin_type AS ENUM (
    'production',
    'internal',
    'expert_review'
);
```

Postgres enforces valid values at the DB layer — no application-side validation needed.

### Table: `session_provenance`

| Column | Type | Notes |
|--------|------|-------|
| `session_id` | TEXT PK | Client-generated UUID |
| `user_id` | TEXT | NULL for anonymous |
| `user_email` | TEXT | NULL for anonymous |
| `session_origin` | session_origin_type | `production` / `internal` / `expert_review` |
| `classification_reason` | TEXT | Human-readable explanation |
| `exclude_from_learning` | BOOLEAN DEFAULT false | Keep out of learning ingestion |
| `exclude_from_metrics` | BOOLEAN DEFAULT false | Keep out of KPI / funnel / pattern queries |
| `exclude_from_conversion` | BOOLEAN DEFAULT false | Keep out of paywall / upgrade queries |
| `exclude_from_cohorts` | BOOLEAN DEFAULT false | Keep out of retention / session quality |
| `eligible_for_reference_review` | BOOLEAN DEFAULT false | Expert/internal may contribute reference images |
| `manually_promote_for_learning_review` | BOOLEAN DEFAULT false | Admin explicitly opted in |
| `created_at` | TIMESTAMPTZ DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ DEFAULT now() | |
| `cohort_month` | DATE **GENERATED ALWAYS AS** | `DATE_TRUNC('month', created_at)::DATE` STORED |
| `cohort_week` | DATE **GENERATED ALWAYS AS** | `DATE_TRUNC('week', created_at)::DATE` STORED |
| `first_seen_at` | TIMESTAMPTZ | First tracked event time |
| `last_seen_at` | TIMESTAMPTZ | Most recent event time |
| `analysis_count` | INT DEFAULT 0 | Denormalized counter |
| `shoot_mode_started` | BOOLEAN DEFAULT false | Denormalized flag |
| `shoot_mode_matched` | BOOLEAN DEFAULT false | Denormalized flag |
| `upgraded` | BOOLEAN DEFAULT false | Denormalized flag |
| `upgrade_at` | TIMESTAMPTZ | Timestamp of upgrade event |
| `metadata` | JSONB DEFAULT '{}' | UTM, referrer, device, app version |

**Key design choices:**
- `cohort_month` / `cohort_week` are STORED generated columns — computed once at insert, indexed without application logic
- Denormalized outcome flags (`upgraded`, `shoot_mode_matched`, etc.) enable O(1) cohort aggregation without events table joins
- `metadata` JSONB replaces ad-hoc columns for session attributes that vary across clients

### Table: `analytics_events`

| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGSERIAL PK | |
| `name` | TEXT NOT NULL | Event name |
| `session_id` | TEXT FK → session_provenance | NULL for anonymous events |
| `user_id` | TEXT | |
| `data` | JSONB DEFAULT '{}' | Event payload (GIN indexed) |
| `created_at` | TIMESTAMPTZ DEFAULT now() | |

---

## 2. SQL Migrations

Run in order:

```bash
psql $DATABASE_URL -f migrations/001_sessions_provenance.sql
psql $DATABASE_URL -f migrations/002_analytics_events.sql
psql $DATABASE_URL -f migrations/003_indexes.sql
# After validating schema, backfill historical data:
psql $DATABASE_URL -f migrations/004_backfill_provenance.sql
```

All migrations are wrapped in `BEGIN / COMMIT`. Run `\i` in psql for transactional safety, or pipe through `psql --single-transaction`.

---

## 3. Index Definitions

### Full indexes

| Index | On | Purpose |
|-------|----|---------|
| `idx_sp_user_id` | `(user_id) WHERE user_id IS NOT NULL` | User→sessions lookup |
| `idx_sp_origin` | `(session_origin)` | Origin-count aggregations |
| `idx_sp_created_at` | `(created_at DESC)` | Time-range scans |
| `idx_sp_cohort_month` | `(cohort_month)` | Monthly cohort aggregations |
| `idx_sp_cohort_week` | `(cohort_week)` | Weekly cohort aggregations |
| `idx_ae_session_id` | `(session_id) WHERE session_id IS NOT NULL` | Events→session joins |
| `idx_ae_name_created` | `(name, created_at DESC)` | Event type + time scans |
| `idx_ae_data_gin` | `USING GIN (data)` | JSONB attribute queries |
| `idx_ae_name_session` | `(name, session_id)` | Pattern performance queries |

### Partial indexes (primary performance advantage)

These cover only production sessions (the overwhelmingly large majority) and make exclusion filtering near-free:

```sql
-- Covers all queries that filter exclude_from_metrics = false
CREATE INDEX idx_sp_production_metrics
    ON session_provenance (created_at DESC)
    WHERE exclude_from_metrics = false;

-- Covers all queries that filter exclude_from_conversion = false
CREATE INDEX idx_sp_production_conversion
    ON session_provenance (created_at DESC)
    WHERE exclude_from_conversion = false;

-- Covers cohort queries with exclude_from_cohorts = false
CREATE INDEX idx_sp_production_cohorts
    ON session_provenance (cohort_month, created_at)
    WHERE exclude_from_cohorts = false;

-- Covers learning ingestion queries
CREATE INDEX idx_sp_production_learning
    ON session_provenance (created_at DESC)
    WHERE exclude_from_learning = false;

-- Upgraded-session leaf node for conversion funnel
CREATE INDEX idx_sp_upgraded_production
    ON session_provenance (upgrade_at DESC)
    WHERE upgraded = true AND exclude_from_conversion = false;

-- Expert/internal sessions eligible for review (small set, fast)
CREATE INDEX idx_sp_eligible_review
    ON session_provenance (created_at DESC)
    WHERE eligible_for_reference_review = true
      AND manually_promote_for_learning_review = false;
```

**Why partial indexes beat NOT IN subqueries:**
The SQLite approach runs a full subquery scan on `session_provenance` for every analytics query. In Postgres, `WHERE exclude_from_metrics = false` on the JOIN side hits `idx_sp_production_metrics` — which only contains production rows. The planner never touches internal/expert rows.

---

## 4. Session Creation Logic (Python)

### asyncpg (recommended for async FastAPI)

```python
# In api/routes/track.py (async route handler):

async def track(body: TrackBody, request: Request):
    user_id = ...
    user_email = ...

    # Fire-and-forget provenance — never blocks event recording
    if body.session_id:
        try:
            async with request.app.state.pool.acquire() as conn:
                await ensure_session_provenance_async(
                    conn,
                    session_id=body.session_id,
                    user_id=user_id,
                    user_email=user_email,
                )
        except Exception:
            logger.exception("Failed to ensure session provenance for %s", body.session_id)
```

Full implementation: `db/pg_provenance.py → ensure_session_provenance_async()`

**Key properties:**
- `ON CONFLICT (session_id) DO NOTHING` — idempotent, safe on every event
- Classification is pure Python (`classify_session()`) — no extra DB round-trip
- Wrapped in separate try/except so provenance failure never blocks event recording

### Connection pool setup (application startup)

```python
import asyncpg

@app.on_event("startup")
async def startup():
    app.state.pool = await asyncpg.create_pool(
        dsn=os.environ["DATABASE_URL"],
        min_size=2,
        max_size=10,
        command_timeout=5.0,
    )

@app.on_event("shutdown")
async def shutdown():
    await app.state.pool.close()
```

### psycopg2 (sync, for migration compatibility)

```python
# See db/pg_provenance.py → ensure_session_provenance_sync()
# Uses %s placeholders and cursor.description for column names.
```

---

## 5. Example SQL Queries

All queries join `analytics_events` to `session_provenance` and use the partial index via `WHERE sp.exclude_from_* = false`. Sessions with no provenance row are included by default (LEFT JOIN → NULL IS NOT false → included).

### Query 1: Monthly Cohort Retention

```sql
-- For each monthly cohort, how many sessions returned in subsequent months?
WITH cohorts AS (
    SELECT
        cohort_month,
        COUNT(DISTINCT session_id)                  AS cohort_size,
        COUNT(DISTINCT session_id) FILTER (WHERE upgraded) AS cohort_upgraded
    FROM session_provenance
    WHERE created_at >= NOW() - INTERVAL '90 days'
      AND exclude_from_cohorts = false          -- hits idx_sp_production_cohorts
    GROUP BY cohort_month
),
returns AS (
    SELECT
        sp.cohort_month,
        DATE_TRUNC('month', ae.created_at)::DATE    AS return_month,
        COUNT(DISTINCT ae.session_id)               AS returning_sessions
    FROM analytics_events ae
    JOIN session_provenance sp USING (session_id)
    WHERE sp.exclude_from_cohorts = false
      AND ae.created_at >= NOW() - INTERVAL '90 days'
    GROUP BY sp.cohort_month, return_month
)
SELECT
    c.cohort_month,
    c.cohort_size,
    r.return_month,
    r.returning_sessions,
    ROUND(r.returning_sessions::NUMERIC / NULLIF(c.cohort_size, 0) * 100, 1) AS retention_pct
FROM cohorts c
LEFT JOIN returns r USING (cohort_month)
ORDER BY c.cohort_month, r.return_month;
```

### Query 2: Pattern Performance (per-pattern CVR)

```sql
-- Analysis count and upgrade rate per detected pattern.
SELECT
    ae.data->>'pattern'                             AS pattern,
    COUNT(DISTINCT ae.session_id)                   AS analysis_count,
    COUNT(DISTINCT ae.session_id) FILTER (
        WHERE sp_upgraded.upgraded = true
    )                                               AS upgrade_count,
    ROUND(
        COUNT(DISTINCT ae.session_id) FILTER (WHERE sp_upgraded.upgraded = true)::NUMERIC
        / NULLIF(COUNT(DISTINCT ae.session_id), 0) * 100,
        2
    )                                               AS conversion_rate_pct
FROM analytics_events ae
JOIN session_provenance sp USING (session_id)       -- exclude_from_metrics filter
-- Self-join to get upgrade flag without correlated subquery
JOIN session_provenance sp_upgraded USING (session_id)
WHERE ae.name = 'analysis_complete'
  AND sp.exclude_from_metrics     = false           -- hits idx_sp_production_metrics
  AND sp_upgraded.exclude_from_conversion = false   -- hits idx_sp_production_conversion
  AND ae.created_at >= NOW() - INTERVAL '30 days'
  AND ae.data->>'pattern' IS NOT NULL
GROUP BY pattern
HAVING COUNT(DISTINCT ae.session_id) >= 5          -- minimum sample threshold
ORDER BY conversion_rate_pct DESC;
```

### Query 3: Conversion Funnel (5-step)

```sql
-- Classic funnel: session → analysis → shoot → match → upgrade
SELECT
    COUNT(DISTINCT sp.session_id)                                   AS sessions_total,
    COUNT(DISTINCT sp.session_id) FILTER (WHERE sp.analysis_count > 0)
                                                                    AS analysis_started,
    COUNT(DISTINCT sp.session_id) FILTER (WHERE sp.shoot_mode_started)
                                                                    AS shoot_mode_started,
    COUNT(DISTINCT sp.session_id) FILTER (WHERE sp.shoot_mode_matched)
                                                                    AS shoot_mode_matched,
    COUNT(DISTINCT sp.session_id) FILTER (WHERE sp.upgraded)        AS upgraded,

    -- Step-by-step drop rates
    ROUND(
        COUNT(DISTINCT sp.session_id) FILTER (WHERE sp.analysis_count > 0)::NUMERIC
        / NULLIF(COUNT(DISTINCT sp.session_id), 0) * 100, 1
    )                                                               AS pct_reached_analysis,
    ROUND(
        COUNT(DISTINCT sp.session_id) FILTER (WHERE sp.upgraded)::NUMERIC
        / NULLIF(COUNT(DISTINCT sp.session_id) FILTER (WHERE sp.analysis_count > 0), 0) * 100, 1
    )                                                               AS pct_analysis_to_upgrade

FROM session_provenance sp
WHERE sp.created_at >= NOW() - INTERVAL '30 days'
  AND sp.exclude_from_metrics     = false   -- hits idx_sp_production_metrics
  AND sp.exclude_from_conversion  = false;  -- hits idx_sp_production_conversion
```

### Query 4: Shoot Mode Global Health (step_deviation input)

```sql
-- Global shoot mode match rate and timing — feeds learning ingestion
SELECT
    COUNT(*)                    FILTER (WHERE sp.shoot_mode_started)                        AS started,
    COUNT(*)                    FILTER (WHERE sp.shoot_mode_matched)                        AS matched,
    ROUND(
        COUNT(*) FILTER (WHERE sp.shoot_mode_matched)::NUMERIC
        / NULLIF(COUNT(*) FILTER (WHERE sp.shoot_mode_started), 0) * 100, 1
    )                                                                                       AS match_rate_pct,
    AVG((ae.data->>'steps_completed')::INT)
        FILTER (WHERE ae.name = 'shoot_mode_match')                                         AS avg_steps_completed,
    AVG((ae.data->>'time_to_match_secs')::FLOAT)
        FILTER (WHERE ae.name = 'shoot_mode_match')                                         AS avg_time_to_match_secs
FROM session_provenance sp
LEFT JOIN analytics_events ae ON ae.session_id = sp.session_id
    AND ae.name = 'shoot_mode_match'
WHERE sp.created_at >= NOW() - INTERVAL '30 days'
  AND sp.exclude_from_metrics = false;   -- hits idx_sp_production_metrics
```

### Query 5: Learning Aggregation (trust_gap input)

```sql
-- Matched sessions vs unmatched: do matched sessions convert better?
SELECT
    COUNT(*) FILTER (WHERE sp.shoot_mode_matched)                               AS matched_sessions,
    COUNT(*) FILTER (WHERE sp.shoot_mode_matched AND sp.upgraded)               AS matched_converted,
    ROUND(
        COUNT(*) FILTER (WHERE sp.shoot_mode_matched AND sp.upgraded)::NUMERIC
        / NULLIF(COUNT(*) FILTER (WHERE sp.shoot_mode_matched), 0) * 100, 2
    )                                                                           AS matched_conversion_rate_pct,

    COUNT(*) FILTER (WHERE NOT sp.shoot_mode_matched)                           AS not_matched_sessions,
    COUNT(*) FILTER (WHERE NOT sp.shoot_mode_matched AND sp.upgraded)           AS not_matched_converted,
    ROUND(
        COUNT(*) FILTER (WHERE NOT sp.shoot_mode_matched AND sp.upgraded)::NUMERIC
        / NULLIF(COUNT(*) FILTER (WHERE NOT sp.shoot_mode_matched), 0) * 100, 2
    )                                                                           AS not_matched_conversion_rate_pct,

    -- Lift: matched CVR minus unmatched CVR (positive = good)
    ROUND(
        (COUNT(*) FILTER (WHERE sp.shoot_mode_matched AND sp.upgraded)::NUMERIC
         / NULLIF(COUNT(*) FILTER (WHERE sp.shoot_mode_matched), 0)
        - COUNT(*) FILTER (WHERE NOT sp.shoot_mode_matched AND sp.upgraded)::NUMERIC
         / NULLIF(COUNT(*) FILTER (WHERE NOT sp.shoot_mode_matched), 0)
        ) * 100, 2
    )                                                                           AS lift_pct

FROM session_provenance sp
WHERE sp.created_at >= NOW() - INTERVAL '30 days'
  AND sp.exclude_from_learning   = false   -- hits idx_sp_production_learning
  AND sp.exclude_from_conversion = false;  -- hits idx_sp_production_conversion
```

---

## 6. Data Hygiene Summary Query

Matches the response shape of `get_provenance_summary()` in `db/provenance.py`:

```sql
SELECT
    session_origin::TEXT,
    COUNT(*)                                                         AS total,
    COUNT(*) FILTER (WHERE exclude_from_metrics     = true)          AS excl_metrics,
    COUNT(*) FILTER (WHERE exclude_from_conversion  = true)          AS excl_conversion,
    COUNT(*) FILTER (WHERE exclude_from_cohorts     = true)          AS excl_cohorts,
    COUNT(*) FILTER (WHERE exclude_from_learning    = true)          AS excl_learning,
    COUNT(*) FILTER (
        WHERE eligible_for_reference_review = true
          AND manually_promote_for_learning_review = false
    )                                                                AS eligible_not_promoted,
    COUNT(*) FILTER (WHERE manually_promote_for_learning_review = true) AS manually_promoted
FROM session_provenance
WHERE created_at >= NOW() - (%(days)s || ' days')::INTERVAL
GROUP BY session_origin;
```

**Response payload shape** (assembled in Python from above — identical to SQLite version):

```json
{
  "days": 30,
  "total_known_sessions": 4217,
  "by_origin": {
    "production":    4200,
    "internal":      15,
    "expert_review": 2
  },
  "excluded": {
    "from_metrics":    17,
    "from_conversion": 17,
    "from_cohorts":    17,
    "from_learning":   17
  },
  "promoted": {
    "eligible_for_review": 5,
    "manually_promoted":   2
  },
  "clean_sessions": 4200
}
```

See `db/pg_provenance.py → get_provenance_summary_async()` for the Python implementation.

---

## 7. Backfill Strategy

### Approach: safe production default

Historical sessions with no provenance record get classified as `production` unless their email appears in the known-internal list. This is the safe default — it never removes data from analytics (false-negative on internal detection is preferable to false-positive that silently drops real users).

### Migration 004 strategy

1. **Derive session facts from `analytics_events`**: GROUP BY session_id to extract user_email, first/last seen, denormalized outcome flags
2. **Classify** using the same email-match logic as `classify_session()`
3. **INSERT ON CONFLICT DO NOTHING** — idempotent, safe to re-run
4. Validate with counts before COMMIT (see Migration 004 Step 5 comments)

### Rollback

```sql
-- Safe rollback within the transaction (before COMMIT):
ROLLBACK;

-- Post-COMMIT rollback (if needed):
DELETE FROM session_provenance
WHERE classification_reason LIKE 'backfill:%';
```

### Impact on existing analytics queries

- Before backfill: all existing `analytics_events` sessions have no provenance → LEFT JOIN returns NULL → included in all analytics (current behavior preserved)
- After backfill: internal sessions get `exclude_from_* = true` → they disappear from analytics queries
- **Expected metric shift**: minimal (internal sessions are small % of historical data). Run `SELECT session_origin, COUNT(*) FROM session_provenance GROUP BY session_origin` after backfill to quantify.

---

## 8. Risks and Edge Cases

### R1: Email not available at event time
**Risk**: Anonymous sessions (no user_email) are classified as `production` by default. If an internal team member uses the app without logging in, their session pollutes metrics.
**Mitigation**: Ensure admin accounts always log in. The `ensure_session_provenance` function re-classifies as `internal` if `user_email` is provided on any subsequent event — but since INSERT OR IGNORE / ON CONFLICT DO NOTHING only inserts once, **the first classification wins**. Consider adding an UPDATE path that upgrades anonymous→internal when auth completes.

### R2: `ON CONFLICT DO NOTHING` vs. email upgrade
**Risk**: If session starts anonymous then user logs in, the provenance row is already `production`. The user's internal status is never applied.
**Mitigation**: In the track handler, after `ensure_session_provenance`, optionally check if `user_email` is now known and reclassify:
```python
if user_email and prov.get("session_origin") == "production":
    fields = classify_session(user_email)
    if fields["session_origin"] != "production":
        update_session_provenance(session_id, **fields)
```
This is a deliberate trade-off: keep it simple (no reclassification) vs. precision. The SQLite implementation currently takes the simple path.

### R3: GENERATED ALWAYS AS availability
**Risk**: `GENERATED ALWAYS AS ... STORED` requires Postgres 12+.
**Mitigation**: Render's managed Postgres is 15+. Safe. If running locally on older Postgres, replace with application-computed inserts.

### R4: Partial index maintenance cost
**Risk**: Each INSERT to `session_provenance` updates up to 6 partial indexes. At high volume (>10k sessions/day), this adds write overhead.
**Mitigation**: At NGW's current scale, immaterial. At 100k+ sessions/day, consider dropping `idx_sp_eligible_review` (small set, infrequent query) and replacing with a small materialized view refreshed hourly.

### R5: JSONB `metadata` column unbounded growth
**Risk**: Clients may send arbitrary keys in session metadata, causing storage bloat over time.
**Mitigation**: Validate/allowlist metadata keys in the track handler before storing. Reject or strip unknown keys.

### R6: Backfill reclassifies sessions retroactively
**Risk**: Running Migration 004 reclassifies historical internal sessions. Metrics dashboards showing "last 30 days" will now exclude them, changing historical numbers.
**Mitigation**: Document the backfill date. Consider adding a `backfilled_at` column or a `migration_run` audit table entry so the change is traceable. Brief team before running in production.

### R7: asyncpg pool exhaustion under load
**Risk**: Provenance inserts happen on every track event. Under burst traffic, pool could be exhausted.
**Mitigation**: The provenance insert is wrapped in separate try/except — a pool timeout will be caught and logged without failing the track response. Set `command_timeout=5.0` on pool creation to bound latency.

### R8: SQLite → Postgres dual-write transition period
**Risk**: During migration, both SQLite and Postgres may be active simultaneously, causing provenance state to diverge.
**Mitigation**: Migration is a hard cutover — deploy the new DB connection, run migrations 001-004, then flip the `DATABASE_URL` env var. Do not attempt dual-write. The existing SQLite data is the backfill source.
