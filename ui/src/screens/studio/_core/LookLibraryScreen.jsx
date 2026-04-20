/**
 * LookLibraryScreen — Client / Brand Look Library.
 *
 * Organized around repeatable looks, not just saved results.
 * Each entry is a reference image + optional analysis link + category + notes.
 *
 * Categories: client, brand, mood, personal
 *
 * Studio-tier feature. Uses /api/studio/references CRUD (already built).
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { C, steel, SCREEN_BG, MACHINED_SHADOW } from '../../../theme/studioMatte';
import MatteBackground from '../_shared/MatteBackground';
import { fetchReferences, uploadReference, deleteReference } from '../../../data/referenceLibraryApi';

const CATEGORIES = [
  { value: 'all',      label: 'All Looks' },
  { value: 'client',   label: 'Client' },
  { value: 'brand',    label: 'Brand' },
  { value: 'mood',     label: 'Mood / Inspiration' },
  { value: 'personal', label: 'Personal' },
];

function formatDate(ts) {
  if (!ts) return '';
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function LookLibraryScreen({ onBack, onAnalyze }) {
  const [refs, setRefs] = useState([]);
  const [category, setCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const fileRef = useRef(null);

  // Upload form state
  const [uploadName, setUploadName] = useState('');
  const [uploadCategory, setUploadCategory] = useState('client');
  const [uploadNotes, setUploadNotes] = useState('');
  const [uploadTags, setUploadTags] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchReferences(category === 'all' ? undefined : category);
      setRefs(data.references || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async () => {
    if (!uploadFile || !uploadName.trim()) return;
    setUploading(true);
    try {
      await uploadReference({
        image: uploadFile,
        name: uploadName.trim(),
        category: uploadCategory,
        notes: uploadNotes.trim(),
        tags: uploadTags.trim(),
      });
      setShowUpload(false);
      setUploadName('');
      setUploadNotes('');
      setUploadTags('');
      setUploadFile(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (refId) => {
    try {
      await deleteReference(refId);
      setRefs(prev => prev.filter(r => r.id !== refId));
    } catch (err) {
      setError(err.message);
    }
  };

  const inputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: 8, border: 'none',
    background: C.slotBg, color: C.textPrimary, fontSize: 13, fontFamily: 'inherit',
    boxShadow: 'inset 2px 2px 5px rgba(0,0,0,0.5), inset -0.5px -0.5px 1px rgba(255,255,255,0.012)',
    outline: 'none',
  };

  return (
    <div style={{ background: SCREEN_BG, minHeight: '100vh', position: 'relative' }}>
      <MatteBackground />
      <div style={{ position: 'relative', zIndex: 1, padding: '20px 16px', maxWidth: 960, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          {onBack && (
            <button onClick={onBack} style={{ background: 'none', border: 'none', color: steel(0.5), cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {'<'} Back
            </button>
          )}
          <h1 style={{ fontSize: 18, fontWeight: 800, color: C.textPrimary, letterSpacing: '-0.02em', margin: 0 }}>
            Look Library
          </h1>
          <div style={{ marginLeft: 'auto' }}>
            <button
              onClick={() => setShowUpload(!showUpload)}
              style={{
                padding: '6px 14px', borderRadius: 7, border: 'none', fontSize: 11, fontWeight: 700,
                background: `linear-gradient(141.71deg, ${C.ctaFrom} 0%, ${C.ctaMid} 100%)`,
                color: steel(0.8), cursor: 'pointer',
                boxShadow: `2px 2px 6px rgba(0,0,0,0.4), 0 0 0 0.5px ${steel(0.2)}`,
              }}
            >
              {showUpload ? 'Cancel' : '+ Add Look'}
            </button>
          </div>
        </div>

        {/* Upload form */}
        {showUpload && (
          <div style={{
            marginBottom: 20, padding: 16, borderRadius: 12,
            background: `linear-gradient(141.71deg, ${C.panelBg} 0%, ${C.slotBg} 100%)`,
            boxShadow: MACHINED_SHADOW,
          }}>
            <div style={{ display: 'grid', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: steel(0.4), letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                  Name
                </label>
                <input value={uploadName} onChange={e => setUploadName(e.target.value)} placeholder="e.g. Sarah's headshot look" style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: steel(0.4), letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                    Category
                  </label>
                  <select value={uploadCategory} onChange={e => setUploadCategory(e.target.value)} style={{ ...inputStyle, appearance: 'none' }}>
                    {CATEGORIES.filter(c => c.value !== 'all').map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: steel(0.4), letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                    Tags
                  </label>
                  <input value={uploadTags} onChange={e => setUploadTags(e.target.value)} placeholder="beauty, soft, clamshell" style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: steel(0.4), letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                  Notes
                </label>
                <textarea value={uploadNotes} onChange={e => setUploadNotes(e.target.value)} placeholder="What makes this look work..." rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: steel(0.4), letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                  Reference Image
                </label>
                <input ref={fileRef} type="file" accept="image/*" onChange={e => setUploadFile(e.target.files?.[0] || null)} style={{ fontSize: 12, color: steel(0.5) }} />
              </div>
              <button
                onClick={handleUpload}
                disabled={!uploadFile || !uploadName.trim() || uploading}
                style={{
                  padding: '10px 20px', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 700,
                  background: `linear-gradient(141.71deg, ${C.ctaFrom} 0%, ${C.ctaMid} 50%, ${C.ctaTo} 100%)`,
                  color: steel(0.8), cursor: uploading ? 'wait' : 'pointer',
                  opacity: (!uploadFile || !uploadName.trim()) ? 0.4 : 1,
                  boxShadow: `3px 3px 8px rgba(0,0,0,0.5), 0 0 0 0.5px ${steel(0.2)}`,
                }}
              >
                {uploading ? 'Uploading...' : 'Save to Library'}
              </button>
            </div>
          </div>
        )}

        {/* Category filter */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20, overflowX: 'auto' }}>
          {CATEGORIES.map(c => (
            <button
              key={c.value}
              onClick={() => setCategory(c.value)}
              style={{
                padding: '5px 12px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600,
                cursor: 'pointer', whiteSpace: 'nowrap',
                background: category === c.value
                  ? `linear-gradient(141.71deg, ${C.ctaFrom} 0%, ${C.ctaMid} 100%)`
                  : C.slotBg,
                color: category === c.value ? steel(0.9) : steel(0.4),
                boxShadow: category === c.value
                  ? `3px 3px 8px rgba(0,0,0,0.5), 0 0 0 0.5px ${steel(0.2)}`
                  : 'inset 1px 1px 3px rgba(0,0,0,0.4)',
              }}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Loading / Error */}
        {loading && <div style={{ textAlign: 'center', padding: 40, color: steel(0.4), fontSize: 13 }}>Loading...</div>}
        {error && <div style={{ textAlign: 'center', padding: 20, color: '#f87171', fontSize: 13, background: 'rgba(248,113,113,0.06)', borderRadius: 8, marginBottom: 16 }}>{error}</div>}

        {/* Empty state */}
        {!loading && refs.length === 0 && !error && (
          <div style={{ textAlign: 'center', padding: 60, color: steel(0.3), fontSize: 13 }}>
            No looks saved yet. Add your first reference to start building your library.
          </div>
        )}

        {/* Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
          {refs.map(r => (
            <div key={r.id} style={{
              borderRadius: 12, overflow: 'hidden',
              background: `linear-gradient(141.71deg, ${C.panelBg} 0%, ${C.slotBg} 100%)`,
              boxShadow: MACHINED_SHADOW,
            }}>
              {/* Image */}
              <div style={{ width: '100%', aspectRatio: '4/3', background: C.slotBg, overflow: 'hidden' }}>
                {r.image_path && (
                  <img
                    src={`/data/reference_library/${r.image_path.split('/').pop()}`}
                    alt={r.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    loading="lazy"
                    onError={e => { e.target.style.display = 'none'; }}
                  />
                )}
              </div>

              {/* Info */}
              <div style={{ padding: '10px 12px' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary, marginBottom: 2 }}>
                  {r.name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                    padding: '1px 6px', borderRadius: 3,
                    background: steel(0.08), color: steel(0.5),
                  }}>
                    {r.category || 'uncategorized'}
                  </span>
                  <span style={{ fontSize: 10, color: steel(0.3) }}>{formatDate(r.created_at)}</span>
                </div>
                {r.notes && <div style={{ fontSize: 11, color: steel(0.4), lineHeight: 1.4, marginBottom: 6 }}>{r.notes}</div>}
                {r.tags && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                    {r.tags.split(',').map((t, i) => (
                      <span key={i} style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: C.slotBg, color: steel(0.4) }}>
                        {t.trim()}
                      </span>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  {r.analysis_id && onAnalyze && (
                    <button
                      onClick={() => onAnalyze(r.analysis_id)}
                      style={{ fontSize: 10, fontWeight: 600, color: steel(0.5), background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      View Analysis
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(r.id)}
                    style={{ fontSize: 10, fontWeight: 600, color: 'rgba(248,113,113,0.6)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginLeft: 'auto' }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
