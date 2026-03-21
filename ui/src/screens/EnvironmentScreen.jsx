import { useState, useRef, useEffect } from 'react';
import { useAppState, useDispatch } from '../context/AppContext';
import StickyBottomBar from '../components/StickyBottomBar';
import { trackEvent } from '../data/analytics';

const ENVIRONMENTS = [
  { value: 'studio_small',        label: 'Small Room',            desc: 'Bedroom, tight space, or office' },
  { value: 'home_studio',         label: 'Home Studio',           desc: 'Garage, spare room, or home backdrop' },
  { value: 'studio_medium',       label: 'Studio — Medium',       desc: 'Shared studio or rental space' },
  { value: 'studio_large',        label: 'Studio — Large',        desc: 'Full commercial studio' },
  { value: 'on_location_indoor',  label: 'On Location (Indoor)',  desc: 'Office, venue, warehouse, home' },
  { value: 'on_location_outdoor', label: 'On Location (Outdoor)', desc: 'Park, street, rooftop, natural light' },
  { value: 'event',               label: 'Event',                 desc: 'Wedding, corporate event, run-and-gun' },
];

const SKIN_TONES = [
  { value: 'light',  label: 'Light',  swatch: '#FDDBB4' },
  { value: 'medium', label: 'Medium', swatch: '#C68642' },
  { value: 'dark',   label: 'Dark',   swatch: '#8D5524' },
];

export default function EnvironmentScreen() {
  const { environment, skinTone, referenceImage } = useAppState();
  const dispatch = useDispatch();
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  function selectEnv(value) {
    dispatch({ type: 'SET_ENVIRONMENT', environment: value });
  }

  function selectTone(value) {
    dispatch({ type: 'SET_SKIN_TONE', skinTone: value });
  }

  function applyFile(file) {
    if (!file || !file.type.startsWith('image/')) return;
    dispatch({ type: 'SET_REFERENCE_IMAGE', file });
    trackEvent('IMAGE_UPLOADED', { size: file.size, type: file.type });
  }

  function handleImageUpload(e) {
    applyFile(e.target.files?.[0]);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    applyFile(e.dataTransfer.files?.[0]);
  }

  function clearImage() {
    dispatch({ type: 'SET_REFERENCE_IMAGE', file: null });
  }

  // Paste support
  useEffect(() => {
    if (referenceImage) return; // already have one
    function onPaste(e) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          applyFile(item.getAsFile());
          break;
        }
      }
    }
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [referenceImage]); // eslint-disable-line react-hooks/exhaustive-deps

  function next() {
    if (!environment) return;
    dispatch({ type: 'NAVIGATE', screen: 'gear' });
  }

  return (
    <div className="screen">
      <h2 className="screen-heading">Where are you shooting?</h2>

      <div className="env-grid">
        {ENVIRONMENTS.map(e => (
          <button
            key={e.value}
            className={`env-tile${environment === e.value ? ' env-tile--selected' : ''}`}
            onClick={() => selectEnv(e.value)}
            type="button"
          >
            <span className="env-tile__label">{e.label}</span>
            <span className="env-tile__desc">{e.desc}</span>
          </button>
        ))}
      </div>

      <h3 className="section-label" style={{ marginTop: 24 }}>Subject skin tone (optional)</h3>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: 12 }}>
        Helps fine-tune exposure and modifier recommendations.
      </p>

      <div className="tone-row">
        {SKIN_TONES.map(t => (
          <button
            key={t.value}
            className={`tone-chip${skinTone === t.value ? ' tone-chip--selected' : ''}`}
            onClick={() => selectTone(t.value)}
            type="button"
          >
            <span className="tone-chip__swatch" style={{ backgroundColor: t.swatch }} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      <h3 className="section-label" style={{ marginTop: 24 }}>Reference photo (optional)</h3>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: 12 }}>
        Upload a photo you like and we'll analyze its color palette.
      </p>

      {!referenceImage ? (
        <div
          className={`upload-zone${dragging ? ' upload-zone--dragging' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          style={{ flexDirection: 'column', gap: 6, cursor: 'pointer' }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            style={{ display: 'none' }}
          />
          <span className="upload-zone__text">
            {dragging ? 'Drop to upload' : 'Tap, drop, or paste a reference photo'}
          </span>
          <span className="upload-zone__hint">JPEG · PNG · HEIC · max 10 MB · best results when the face fills the frame</span>
        </div>
      ) : (
        <div className="upload-preview">
          <span className="upload-preview__name">{referenceImage.name}</span>
          <button className="btn btn--ghost btn--sm" onClick={clearImage} type="button">
            Remove
          </button>
        </div>
      )}

      <StickyBottomBar>
        <button
          className="btn btn--primary"
          disabled={!environment}
          onClick={next}
        >
          Next: Your Gear &rarr;
        </button>
      </StickyBottomBar>
    </div>
  );
}
