import { useState, useEffect, useCallback } from 'react';
import { C, steel, SCREEN_BG, MACHINED_BG, MACHINED_PANEL_BG, MACHINED_SHADOW } from '../../../theme/studioMatte';
import MatteBackground from '../_shared/MatteBackground';
import { fetchAnalyses, getAnalysisImageUrl } from '../../../data/sessionLogApi';

const PATTERNS = [
  'all', 'rembrandt', 'loop', 'butterfly', 'split', 'clamshell',
  'broad', 'short', 'paramount', 'rim', 'high_key', 'low_key',
];

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function confidenceColor(c) {
  if (c >= 0.75) return C.confHigh;
  if (c >= 0.5) return C.confLow;
  return steel(0.5);
}

export default function SessionLogScreen({ onSelectAnalysis, onBack }) {
  const [analyses, setAnalyses] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pattern, setPattern] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const perPage = 12;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAnalyses({
        page,
        perPage,
        pattern: pattern === 'all' ? undefined : pattern,
      });
      setAnalyses(data.analyses || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, pattern]);

  useEffect(() => { load(); }, [load]);

  const totalPages = Math.ceil(total / perPage);

  return (
    <div style={{ background: SCREEN_BG, minHeight: '100vh', position: 'relative' }}>
      <MatteBackground variant="carbon" />
      <div style={{ position: 'relative', zIndex: 1, padding: '20px 16px', maxWidth: 960, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          {onBack && (
            <button
              onClick={onBack}
              style={{
                background: 'none', border: 'none', color: steel(0.5), cursor: 'pointer',
                fontSize: 13, fontWeight: 600, letterSpacing: '0.05em',
              }}
            >
              {'<'} Back
            </button>
          )}
          <h1 style={{
            fontSize: 18, fontWeight: 800, color: C.textPrimary,
            letterSpacing: '-0.02em', margin: 0,
          }}>
            Lighting Journal
          </h1>
          <span style={{ fontSize: 11, color: steel(0.4), fontWeight: 600 }}>
            {total} {total === 1 ? 'analysis' : 'analyses'}
          </span>
        </div>

        {/* Pattern filter */}
        <div style={{
          display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20,
          overflowX: 'auto', WebkitOverflowScrolling: 'touch',
        }}>
          {PATTERNS.map(p => (
            <button
              key={p}
              onClick={() => { setPattern(p); setPage(1); }}
              style={{
                padding: '5px 12px',
                borderRadius: 6,
                border: 'none',
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: '0.04em',
                textTransform: 'capitalize',
                cursor: 'pointer',
                background: pattern === p
                  ? `linear-gradient(141.71deg, ${C.ctaFrom} 0%, ${C.ctaMid} 100%)`
                  : C.slotBg,
                color: pattern === p ? steel(0.9) : steel(0.4),
                boxShadow: pattern === p
                  ? `3px 3px 8px rgba(0,0,0,0.5), 0 0 0 0.5px ${steel(0.2)}`
                  : `inset 1px 1px 3px rgba(0,0,0,0.4)`,
                whiteSpace: 'nowrap',
              }}
            >
              {p === 'all' ? 'All' : p.replace(/_/g, ' ')}
            </button>
          ))}
        </div>

        {/* Loading / Error */}
        {loading && (
          <div style={{ textAlign: 'center', padding: 40, color: steel(0.4), fontSize: 13 }}>
            Loading...
          </div>
        )}
        {error && (
          <div style={{
            textAlign: 'center', padding: 20, color: '#f87171', fontSize: 13,
            background: 'rgba(248,113,113,0.06)', borderRadius: 8, marginBottom: 16,
          }}>
            {error}
          </div>
        )}

        {/* Grid */}
        {!loading && analyses.length === 0 && !error && (
          <div style={{ textAlign: 'center', padding: 60, color: steel(0.3), fontSize: 13 }}>
            No analyses found.{pattern !== 'all' ? ' Try a different filter.' : ''}
          </div>
        )}

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 14,
        }}>
          {analyses.map(a => (
            <button
              key={a.analysis_id}
              onClick={() => onSelectAnalysis?.(a.analysis_id)}
              style={{
                background: MACHINED_PANEL_BG || `linear-gradient(141.71deg, ${C.panelBg} 0%, ${C.slotBg} 100%)`,
                border: 'none',
                borderRadius: 12,
                padding: 0,
                cursor: 'pointer',
                overflow: 'hidden',
                textAlign: 'left',
                boxShadow: MACHINED_SHADOW || '4px 4px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)',
                transition: 'transform 0.12s ease',
              }}
              onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseOut={e => e.currentTarget.style.transform = 'none'}
            >
              {/* Thumbnail */}
              <div style={{
                width: '100%', aspectRatio: '4/3',
                background: C.slotBg,
                overflow: 'hidden',
              }}>
                <img
                  src={getAnalysisImageUrl(a.analysis_id)}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  loading="lazy"
                  onError={e => { e.target.style.display = 'none'; }}
                />
              </div>

              {/* Info */}
              <div style={{ padding: '10px 12px' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 4,
                }}>
                  <span style={{
                    fontSize: 13, fontWeight: 700, color: C.textPrimary,
                    textTransform: 'capitalize',
                  }}>
                    {(a.pattern || 'unknown').replace(/_/g, ' ')}
                  </span>
                  <span style={{
                    fontSize: 12, fontWeight: 700,
                    padding: '2px 6px', borderRadius: 4,
                    background: `${confidenceColor(a.confidence || 0)}15`,
                    color: confidenceColor(a.confidence || 0),
                  }}>
                    {Math.round((a.confidence || 0) * 100)}%
                  </span>
                </div>
                <div style={{ fontSize: 12, color: steel(0.35) }}>
                  {formatDate(a.created_at)} · {formatTime(a.created_at)}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{
            display: 'flex', justifyContent: 'center', gap: 8, marginTop: 24,
          }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              style={{
                padding: '6px 14px', borderRadius: 6, border: 'none',
                background: C.slotBg, color: page <= 1 ? steel(0.2) : steel(0.6),
                fontSize: 13, fontWeight: 600, cursor: page <= 1 ? 'default' : 'pointer',
              }}
            >
              Prev
            </button>
            <span style={{ fontSize: 11, color: steel(0.4), alignSelf: 'center', fontWeight: 600 }}>
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              style={{
                padding: '6px 14px', borderRadius: 6, border: 'none',
                background: C.slotBg, color: page >= totalPages ? steel(0.2) : steel(0.6),
                fontSize: 13, fontWeight: 600, cursor: page >= totalPages ? 'default' : 'pointer',
              }}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
