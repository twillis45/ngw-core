/**
 * AnalyticsDashboard — admin-only analytics screen.
 * Fetches from GET /api/analytics/dashboard and renders 8 dashboard sections.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { getToken } from '../data/authApi';
import DashboardLayout from '../components/analytics/DashboardLayout';
import KPIStrip from '../components/analytics/KPIStrip';
import FunnelChart from '../components/analytics/FunnelChart';
import SuccessConversionTable from '../components/analytics/SuccessConversionTable';
import PatternPerformanceTable from '../components/analytics/PatternPerformanceTable';
import CohortChart from '../components/analytics/CohortChart';
import SessionQualityCard from '../components/analytics/SessionQualityCard';
import LearningInsightsCard from '../components/analytics/LearningInsightsCard';

function SectionHead({ title, subtitle }) {
  return (
    <div className="adb__section-head-block">
      <h3 className="adb__section-head">{title}</h3>
      {subtitle && <p className="adb__section-sub">{subtitle}</p>}
    </div>
  );
}

const REFRESH_MS = 60_000;

export default function AnalyticsDashboard() {
  const [days, setDays] = useState(30);
  const [origin, setOrigin] = useState('all');
  const [data, setData] = useState(null);
  const [provenance, setProvenance] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const timerRef = useRef(null);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const [dashRes, provRes] = await Promise.all([
        fetch(`/api/analytics/dashboard?days=${days}&origin=${origin}`, { headers }),
        fetch(`/api/analytics/provenance?days=${days}&origin=${origin}`, { headers }),
      ]);
      if (dashRes.status === 403) { setError('Admin access required.'); return; }
      if (!dashRes.ok) { setError('Failed to load dashboard data.'); return; }
      setData(await dashRes.json());
      if (provRes.ok) setProvenance(await provRes.json());
      setLastRefresh(Date.now());
    } catch {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  }, [days, origin]);

  useEffect(() => {
    loadStats();
    timerRef.current = setInterval(loadStats, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [loadStats]);

  return (
    <DashboardLayout
      days={days}
      onDaysChange={setDays}
      origin={origin}
      onOriginChange={setOrigin}
      onRefresh={loadStats}
      loading={loading}
      error={error}
      lastRefresh={lastRefresh}
    >
      {data && (
        <div className="adb__body">

          {/* ── 1. KPI STRIP ─────────────────────────────────── */}
          <KPIStrip
            kpi={data.kpi}
            shootMode={data.shoot_mode}
            paywall={data.paywall}
          />

          {/* ── 2. FUNNEL ────────────────────────────────────── */}
          <section className="adb__section">
            <SectionHead
              title="Acquisition Funnel"
              subtitle="From landing to setup saved — where users drop off."
            />
            <FunnelChart funnel={data.funnel} />
          </section>

          {/* ── 3. SUCCESS → CONVERSION ──────────────────────── */}
          <section className="adb__section">
            <SectionHead
              title="Does Success Drive Conversion?"
              subtitle="Sessions that achieved a match vs those that didn't — upgrade rate comparison."
            />
            <SuccessConversionTable data={data.success_conversion} />
          </section>

          {/* ── 4. PATTERN PERFORMANCE ───────────────────────── */}
          <section className="adb__section">
            <SectionHead
              title="Pattern Performance"
              subtitle="Which lighting patterns lead to upgrades? Sorted by conversion rate."
            />
            <PatternPerformanceTable patterns={data.pattern_performance} />
          </section>

          {/* ── 5. DAILY TREND ───────────────────────────────── */}
          <section className="adb__section">
            <SectionHead
              title="Daily Trend"
              subtitle={`Activity over the last ${data.days} days.`}
            />
            <CohortChart trend={data.daily_trend} />
          </section>

          {/* ── 6. SESSION QUALITY ───────────────────────────── */}
          <section className="adb__section">
            <SectionHead
              title="Session Quality"
              subtitle="How deep do users go? Bounce rate and engagement funnel."
            />
            <SessionQualityCard quality={data.session_quality} />
          </section>

          {/* ── 7. LEARNING INSIGHTS ─────────────────────────── */}
          <section className="adb__section">
            <SectionHead
              title="Engine Learning"
              subtitle="Pattern coverage, signal confidence distribution, and setup retention."
            />
            <LearningInsightsCard
              patterns={data.patterns}
              retention={data.retention}
              shootMode={data.shoot_mode}
            />
          </section>

          {/* ── 8. RETENTION + PAYWALL SUMMARY ───────────────── */}
          <section className="adb__section adb__section--two-col">
            <div>
              <SectionHead title="Retention" />
              <div className="adb__stat-row">
                <div className="adb__stat-card">
                  <div className="adb__stat-value">{data.retention.total_sessions.toLocaleString()}</div>
                  <div className="adb__stat-label">Total Sessions</div>
                </div>
                <div className="adb__stat-card">
                  <div className="adb__stat-value">{data.retention.return_sessions.toLocaleString()}</div>
                  <div className="adb__stat-label">Return Sessions</div>
                  <div className="adb__stat-sub">{data.retention.return_rate_pct}% return rate</div>
                </div>
                <div className="adb__stat-card">
                  <div className="adb__stat-value">{data.retention.setups_saved.toLocaleString()}</div>
                  <div className="adb__stat-label">Setups Saved</div>
                </div>
              </div>
            </div>
            <div>
              <SectionHead title="Paywall" />
              <div className="adb__stat-row">
                <div className="adb__stat-card">
                  <div className="adb__stat-value">{data.paywall.views.toLocaleString()}</div>
                  <div className="adb__stat-label">Views</div>
                </div>
                <div className="adb__stat-card">
                  <div className="adb__stat-value">{data.paywall.ctr_pct}%</div>
                  <div className="adb__stat-label">CTR</div>
                </div>
                <div className="adb__stat-card">
                  <div className="adb__stat-value">{data.paywall.cvr_pct}%</div>
                  <div className="adb__stat-label">CVR</div>
                  <div className="adb__stat-sub">{data.paywall.conversions} conversions</div>
                </div>
              </div>
            </div>
          </section>

          {/* ── 9. DATA HYGIENE ──────────────────────────────── */}
          {provenance && (
            <section className="adb__section">
              <SectionHead
                title="Data Hygiene"
                subtitle="Session provenance — only production sessions enter analytics, cohorts, conversion, and learning."
              />
              <div className="adb__stat-row" style={{ marginBottom: 'var(--space-md)' }}>
                <div className="adb__stat-card" style={{ borderColor: 'var(--color-success-subtle)' }}>
                  <div className="adb__stat-value" style={{ color: 'var(--color-success)' }}>
                    {provenance.by_origin?.production ?? 0}
                  </div>
                  <div className="adb__stat-label">Production</div>
                  <div className="adb__stat-sub">counted in metrics</div>
                </div>
                <div className="adb__stat-card" style={{ borderColor: 'var(--color-warning-subtle)' }}>
                  <div className="adb__stat-value" style={{ color: 'var(--color-warning)' }}>
                    {provenance.by_origin?.internal ?? 0}
                  </div>
                  <div className="adb__stat-label">Internal</div>
                  <div className="adb__stat-sub">excluded from all</div>
                </div>
                <div className="adb__stat-card" style={{ borderColor: 'rgba(77,163,255,0.3)' }}>
                  <div className="adb__stat-value" style={{ color: 'var(--color-accent)' }}>
                    {provenance.by_origin?.expert_review ?? 0}
                  </div>
                  <div className="adb__stat-label">Expert Review</div>
                  <div className="adb__stat-sub">excluded unless promoted</div>
                </div>
                <div className="adb__stat-card" style={{ borderColor: 'rgba(255,160,77,0.3)' }}>
                  <div className="adb__stat-value" style={{ color: 'var(--color-warning)' }}>
                    {provenance.by_origin?.test ?? 0}
                  </div>
                  <div className="adb__stat-label">Test</div>
                  <div className="adb__stat-sub">user-marked, excluded</div>
                </div>
              </div>
              <div className="adb__stat-row">
                {[
                  { label: 'Excl. Metrics', val: provenance.excluded?.from_metrics },
                  { label: 'Excl. Conversion', val: provenance.excluded?.from_conversion },
                  { label: 'Excl. Cohorts', val: provenance.excluded?.from_cohorts },
                  { label: 'Excl. Learning', val: provenance.excluded?.from_learning },
                  { label: 'Promoted', val: provenance.promoted?.manually_promoted },
                  { label: 'Review Eligible', val: provenance.promoted?.eligible_for_review },
                ].map(s => (
                  <div key={s.label} className="adb__stat-card">
                    <div className="adb__stat-value" style={{ fontSize: 'var(--text-lg)' }}>
                      {s.val ?? 0}
                    </div>
                    <div className="adb__stat-label">{s.label}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

        </div>
      )}
    </DashboardLayout>
  );
}
