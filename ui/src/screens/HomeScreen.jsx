/**
 * HomeScreen — Studio Matte design
 * Pixel-exact match to Figma: YQgGd8KZyZoXzZwJV7p4b6 / Studio Matte Theme / Home (1336:2)
 * Three button states: idle (no image) → alive (image ready) → pressed (analyzing)
 * All colors and pixel positions from Figma Token Palette — Studio Matte
 */
import { useRef, useState, useEffect, useCallback } from 'react';
import { tapHaptic, selectHaptic, successHaptic, dropHaptic, warnHaptic, longPressHaptic, grainHaptic, getProfileKey } from '../utils/haptics';
import { analyzeClickSound, softClickSound, imageDropSound, powerOnSound, navSlideSound, panelToggleSound } from '../utils/sounds';
import { saveSetting, loadSettings } from '../data/settingsStore';
import { fetchImageFromUrl } from '../data/labApi';
import { steel, C as SM_C, VIEWFINDER_INNER_SHADOW, GLASS_REFLECTION, LENS_VIGNETTE, TEXT_SHADOW_ENGRAVED } from '../theme/studioMatte';

// ─── Figma-exported assets (downloaded to project, valid indefinitely) ─────────
import analyzeTrackIdle    from '../assets/day1/analyze-track-idle.svg';
import analyzeTrackAlive   from '../assets/day1/analyze-track-alive.svg';
import analyzeTrackPressed from '../assets/day1/analyze-track-pressed.svg';
import analyzeButtonIdle    from '../assets/day1/analyze-button-idle.svg';
import analyzeButtonAlive   from '../assets/day1/analyze-button-alive.svg';
import analyzeButtonPressed from '../assets/day1/analyze-button-pressed.svg';
import activityIndicatorIdle  from '../assets/day1/activity-indicator-idle.svg';
import activityIndicatorPulse from '../assets/day1/activity-indicator-pulse.svg';
import illuminationWellIdle  from '../assets/day1/illumination-well-idle.svg';
import illuminationWellAlive from '../assets/day1/illumination-well-alive.svg';
import illuminationLampOff from '../assets/day1/illumination-lamp-off.svg';
import illuminationLampOn  from '../assets/day1/illumination-lamp-on.svg';
import ledOff from '../assets/day1/led-off.svg';
import ledOn  from '../assets/day1/led-on.svg';
import ellipseDot from '../assets/day1/ellipse-dot.svg';
import ellipseBg  from '../assets/day1/ellipse-bg.svg';

// ─── Design tokens — studioMatte.js is single source of truth ────────────────
// HomeScreen-specific C extensions (textPrimary slightly more transparent than panel screens)
const C = {
  ...SM_C,
  textPrimary: 'rgba(245,247,250,0.88)',
  border:      'rgba(167,173,183,0.06)',
  glassSheen:  'rgba(178,191,209,0.07)',
};

export default function HomeScreen({ onAnalyze, hasLastResult, onViewLastResult, user, onLogout, onSettings, lastAnalysisTime }) {
  const [imageFile,    setImageFile]    = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isPressed,    setIsPressed]    = useState(false);
  const [lcdOn,        setLcdOn]        = useState(false);
  const [isDragOver,   setIsDragOver]   = useState(false);
  const [showPrompt,   setShowPrompt]   = useState(true);
  const [viewfinderShake, setViewfinderShake] = useState(false);
  const [isUrlFetching,  setIsUrlFetching]  = useState(false);
  const [urlLoadError,   setUrlLoadError]   = useState(null);
  const [muted, setMuted] = useState(() => {
    try { const s = JSON.parse(localStorage.getItem('ngw_settings') || '{}'); return s.hapticFeedback === false; } catch { return false; }
  });
  // ── Stealth panel state ──
  const [profileOpen, setProfileOpen]   = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [statusToast, setStatusToast]   = useState(null);
  const [homeBarFlash, setHomeBarFlash] = useState(false);
  const [soundOn, setSoundOn] = useState(() => {
    try { const s = loadSettings(); return s.soundEnabled !== false; } catch { return true; }
  });
  const [hapticOn, setHapticOn] = useState(() => {
    try { const s = loadSettings(); return s.hapticFeedback !== false; } catch { return true; }
  });
  const [hapticProfile, setHapticProfile] = useState(() => getProfileKey());
  const fileRef = useRef(null);
  const cameraRef = useRef(null);
  const longPressRef = useRef(null);
  const wellLongPressRef = useRef(null);
  const wordmarkLPRef = useRef(null);
  const homeBarLPRef = useRef(null);
  const wellLastTap = useRef(0);
  const bgLongPressRef = useRef(null);
  const bgLpFired = useRef(false);

  // Power-on sound on first mount
  useEffect(() => { powerOnSound(); }, []);

  // Fade out tap prompt after 7s or when image loaded
  useEffect(() => {
    if (imageFile) { setShowPrompt(false); return; }
    const t = setTimeout(() => setShowPrompt(false), 7000);
    return () => clearTimeout(t);
  }, [imageFile]);

  const hasImage    = !!imageFile;
  const buttonState = !hasImage ? 'idle' : isPressed ? 'pressed' : 'alive';

  const trackSrc = { idle: analyzeTrackIdle, alive: analyzeTrackAlive, pressed: analyzeTrackPressed }[buttonState];
  const btnSrc   = { idle: analyzeButtonIdle, alive: analyzeButtonAlive, pressed: analyzeButtonPressed }[buttonState];
  const ledSrc   = hasImage ? activityIndicatorPulse : activityIndicatorIdle;
  const wellSrc  = hasImage ? illuminationWellAlive : illuminationWellIdle;
  const lampSrc  = hasImage ? illuminationLampOn : illuminationLampOff;
  const dotSrc   = hasImage ? ledOn : ledOff;

  // ── Stealth: clear image via long-press on viewfinder ──
  const clearImage = useCallback(() => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
    setShowPrompt(true);
    navSlideSound();
    longPressHaptic();
  }, [imagePreview]);

  const startViewfinderPress = useCallback((clientY) => {
    longPressRef.current = setTimeout(() => {
      if (hasImage) clearImage();
      longPressRef.current = null;
    }, 500);
  }, [hasImage, clearImage]);

  const endViewfinderPress = useCallback(() => {
    if (longPressRef.current) { clearTimeout(longPressRef.current); longPressRef.current = null; }
  }, []);

  // Illuminate LCD on touch, dim after interaction
  const handleViewfinderTouch = useCallback(() => {
    setLcdOn(true);
  }, []);

  useEffect(() => {
    if (imageFile && lcdOn) {
      const timer = setTimeout(() => setLcdOn(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [imageFile, lcdOn]);

  // ── Stealth: toggle mute via long-press on illumination well ──
  const toggleMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    try {
      const s = JSON.parse(localStorage.getItem('ngw_settings') || '{}');
      s.hapticFeedback = !next;
      localStorage.setItem('ngw_settings', JSON.stringify(s));
    } catch { /* ignore */ }
    // One last haptic to confirm the toggle (before mute takes effect)
    if (!next) longPressHaptic();
  }, [muted]);

  const startWellPress = useCallback(() => {
    wellLongPressRef.current = setTimeout(() => {
      toggleMute();
      wellLongPressRef.current = null;
    }, 600);
  }, [toggleMute]);

  const endWellPress = useCallback(() => {
    if (wellLongPressRef.current) { clearTimeout(wellLongPressRef.current); wellLongPressRef.current = null; }
  }, []);

  // ── Stealth: wordmark long-press → profile panel ──
  const startWordmarkPress = useCallback(() => {
    wordmarkLPRef.current = setTimeout(() => {
      setProfileOpen(v => !v);
      setSettingsOpen(false);
      panelToggleSound();
      longPressHaptic();
      wordmarkLPRef.current = null;
    }, 600);
  }, []);
  const endWordmarkPress = useCallback(() => {
    if (wordmarkLPRef.current) { clearTimeout(wordmarkLPRef.current); wordmarkLPRef.current = null; }
  }, []);

  // ── Stealth: home bar long-press → sign out flash ──
  const startHomeBarPress = useCallback(() => {
    homeBarLPRef.current = setTimeout(() => {
      if (user && onLogout) {
        onLogout();
        setHomeBarFlash(true);
        setTimeout(() => setHomeBarFlash(false), 500);
        longPressHaptic();
      } else {
        setHomeBarFlash(true);
        setTimeout(() => setHomeBarFlash(false), 500);
        warnHaptic();
      }
      homeBarLPRef.current = null;
    }, 800);
  }, [user, onLogout]);
  const endHomeBarPress = useCallback(() => {
    if (homeBarLPRef.current) { clearTimeout(homeBarLPRef.current); homeBarLPRef.current = null; }
  }, []);

  // ── Stealth: settings toggles ──
  const toggleSoundSetting = useCallback(() => {
    const next = !soundOn;
    setSoundOn(next);
    saveSetting('soundEnabled', next);
    if (next) softClickSound();
    tapHaptic();
  }, [soundOn]);

  const toggleHapticSetting = useCallback(() => {
    const next = !hapticOn;
    setHapticOn(next);
    saveSetting('hapticFeedback', next);
    setMuted(!next);
    if (!next) longPressHaptic();
    softClickSound();
  }, [hapticOn]);

  const cycleHapticProfile = useCallback(() => {
    const order = ['A', 'B', 'C'];
    const idx = order.indexOf(hapticProfile);
    const next = order[(idx + 1) % 3];
    setHapticProfile(next);
    saveSetting('hapticProfile', next);
    softClickSound();
    // Fire demo tap so user feels the new profile immediately
    setTimeout(() => tapHaptic(), 60);
  }, [hapticProfile]);

  // Close panels on outside tap or action
  const closePanels = useCallback(() => {
    if (profileOpen || settingsOpen) {
      setProfileOpen(false);
      setSettingsOpen(false);
      softClickSound();
      return true;
    }
    return false;
  }, [profileOpen, settingsOpen]);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (wordmarkLPRef.current) clearTimeout(wordmarkLPRef.current);
      if (homeBarLPRef.current) clearTimeout(homeBarLPRef.current);
    };
  }, []);

  // ── File loading with error rejection ──
  const rejectFile = useCallback(() => {
    setViewfinderShake(true);
    warnHaptic();
    setTimeout(() => setViewfinderShake(false), 400);
  }, []);

  const loadFile = useCallback((file) => {
    if (!file || !file.type.startsWith('image/')) { rejectFile(); return; }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    imageDropSound();
    dropHaptic();
    setShowPrompt(false);
  }, [rejectFile]);

  // Ref keeps loadFromUrl's closure stable across Fast Refresh re-mounts
  // without forming a useCallback circular dependency on loadFile.
  const loadFileRef = useRef(loadFile);
  loadFileRef.current = loadFile;

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    loadFile(file);
    e.target.value = '';
  };

  // Load an image from a remote URL (Dropbox, Google Drive, etc) via server proxy
  const loadFromUrl = useCallback(async (url) => {
    setIsUrlFetching(true);
    try {
      const blob = await fetchImageFromUrl(url);
      const filename = url.split('/').pop().split('?')[0] || 'image.jpg';
      const file = new File([blob], filename, { type: blob.type || 'image/jpeg' });
      loadFileRef.current(file);
    } catch (err) {
      console.warn('[HomeScreen] URL fetch failed:', err.message);
      rejectFile();
      setUrlLoadError("Couldn't load that link — save the photo to your device and load it from there.");
      setTimeout(() => setUrlLoadError(null), 5000);
    } finally {
      setIsUrlFetching(false);
    }
  }, [rejectFile]);

  // Clipboard paste — Cmd+V image workaround for private cloud images
  useEffect(() => {
    const handlePaste = (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) loadFile(file);
          return;
        }
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [loadFile]);

  // Drag & drop handlers
  const handleDragOver = useCallback((e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(true); }, []);
  const handleDragLeave = useCallback((e) => { e.preventDefault(); e.stopPropagation(); setIsDragOver(false); }, []);
  const handleDrop = useCallback((e) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(false);
    // Prefer an actual File (local drag)
    const file = e.dataTransfer?.files?.[0];
    if (file) { loadFile(file); return; }
    // Fall back to URL (Dropbox web, Google Drive, image drag from browser)
    const url = e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text/plain') || '';
    if (url.startsWith('http')) { loadFromUrl(url); return; }
    // Check for img src in dragged HTML (some cloud apps pass text/html)
    const html = e.dataTransfer?.getData('text/html') || '';
    const srcMatch = html.match(/src=["']([^"']+)["']/i);
    if (srcMatch?.[1]?.startsWith('http')) loadFromUrl(srcMatch[1]);
  }, [loadFile, loadFromUrl]);

  const handleAnalyze = () => {
    if (imageFile && onAnalyze) { analyzeClickSound(); successHaptic(); onAnalyze(imageFile, imagePreview); }
  };

  const handleButtonPress = () => { if (hasImage) { setIsPressed(true); tapHaptic(); } };
  const handleButtonRelease = () => { setIsPressed(false); };

  const analyzeText = steel(hasImage ? 0.95 : 0.75);
  const analyzeGlow = hasImage
    ? `${TEXT_SHADOW_ENGRAVED}, 0 0 6px ${steel(0.4)}, 0 0 14px ${steel(0.15)}`
    : `${TEXT_SHADOW_ENGRAVED}, 0 0 8px ${steel(0.3)}, 0 0 18px ${steel(0.10)}`;

  const startBgLongPress = useCallback((e) => {
    if (e.target !== e.currentTarget) return;
    bgLpFired.current = false;
    bgLongPressRef.current = setTimeout(() => {
      bgLongPressRef.current = null;
      bgLpFired.current = true;
      setLcdOn(v => !v);
      selectHaptic();
      softClickSound();
    }, 500);
  }, []);

  const endBgLongPress = useCallback(() => {
    if (bgLongPressRef.current) { clearTimeout(bgLongPressRef.current); bgLongPressRef.current = null; }
  }, []);

  const handleBodyTap = (e) => {
    if (e.target === e.currentTarget) {
      if (bgLpFired.current) { bgLpFired.current = false; return; }
      closePanels();
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#000', overflow: 'hidden' }}>
    <div
      onClick={handleBodyTap}
      onPointerDown={startBgLongPress}
      onPointerUp={endBgLongPress}
      onPointerLeave={endBgLongPress}
      onPointerCancel={endBgLongPress}
      onTouchStart={(e) => { if (e.target === e.currentTarget) grainHaptic(); }}
      onTouchMove={(e) => { if (e.target === e.currentTarget) grainHaptic(); }}
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 430,
        height: '100%',
        minHeight: 600,
        margin: '0 auto',
        backgroundColor: C.bg,
        boxShadow: '2px 4px 40px rgba(0,0,0,0.6), -1px -1px 1px rgba(255,255,255,0.02)',
        overflow: 'hidden',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      {/* ── Matte metal surface — layered ambient wash, vignette, specular edge, grain ── */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        {/* Cool ambient key wash — soft overhead studio light */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 75% 55% at 50% 22%, rgba(120,148,175,0.028) 0%, rgba(95,124,150,0.010) 40%, transparent 72%)' }} />
        {/* Warm mid-frame lift — breaks up pure black core */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 55% 38% at 50% 58%, rgba(180,150,110,0.010) 0%, transparent 65%)' }} />
        {/* Edge vignette — anchors the frame */}
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 118% 88% at 50% 50%, transparent 52%, rgba(0,0,0,0.45) 100%)' }} />
        {/* Top specular edge — ceiling light hit */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(141.71deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.03) 40%, transparent 80%)' }} />
        {/* Grain — tactile metal texture */}
        <div style={{ position: 'absolute', inset: 0, opacity: 0.16, mixBlendMode: 'multiply', backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.32' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`, backgroundSize: '128px 128px' }} />
      </div>
      <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} style={{ display: 'none' }} />

      {/* ── Wordmark — long-press for profile panel ── */}
      <div
        onTouchStart={startWordmarkPress}
        onTouchEnd={endWordmarkPress}
        onTouchCancel={endWordmarkPress}
        onMouseDown={startWordmarkPress}
        onMouseUp={endWordmarkPress}
        onMouseLeave={endWordmarkPress}
        style={{
          position: 'absolute', top: 24, left: 22, padding: 6,
          cursor: 'default', WebkitTapHighlightColor: 'transparent', userSelect: 'none', zIndex: 15,
        }}
      >
        <p style={{
          margin: 0,
          fontWeight: 800, fontSize: 18, lineHeight: '22px',
          color: C.textPrimary, letterSpacing: '-0.3px',
          WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision',
          textShadow: '0 0 1px rgba(245,247,250,0.12)',
        }}>No Guesswork</p>
        <p style={{
          margin: '2px 0 0 1px',
          fontWeight: 800, fontSize: 9.5, lineHeight: '12px',
          color: 'rgba(145,168,190,0.95)', letterSpacing: '3.2px',
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
          textRendering: 'geometricPrecision',
          textShadow: TEXT_SHADOW_ENGRAVED,
        }}>LIGHTING</p>
      </div>

      {/* ── Profile Panel — slides down from wordmark on long-press ── */}
      <div style={{
        position: 'absolute', top: 76, left: 20, right: 20,
        borderRadius: 14, backgroundColor: '#0f1013',
        boxShadow: '1px 2px 4px 0px rgba(0,0,0,0.2), 2px 4px 12px 0px rgba(0,0,0,0.4), inset -1px -1px 2px 0px rgba(0,0,0,0.12), inset 1px 1px 0px 0px rgba(255,255,255,0.05)',
        padding: '16px 20px', zIndex: 25,
        opacity: profileOpen ? 1 : 0,
        transform: profileOpen ? 'translateY(0)' : 'translateY(-8px)',
        transition: 'opacity 0.25s ease, transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        pointerEvents: profileOpen ? 'auto' : 'none',
      }}>
        {user ? (
          <>
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'rgba(245,247,250,0.88)', WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision' }}>
              {user.username || user.email}
            </p>
            {user.email && user.username && (
              <p style={{ margin: '4px 0 0', fontSize: 11, fontWeight: 500, color: steel(0.55), WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision' }}>
                {user.email}
              </p>
            )}
            <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.04)', margin: '12px 0' }} />
            <button onClick={() => { onSettings?.(); setProfileOpen(false); softClickSound(); tapHaptic(); }}
              style={{
                backgroundColor: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 0',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
                WebkitTapHighlightColor: 'transparent',
              }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(184,191,199,0.75)', letterSpacing: '0.3px', WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision' }}>Settings</span>
              <span style={{ fontSize: 13, color: steel(0.35), lineHeight: 1 }}>›</span>
            </button>
            <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.04)', margin: '8px 0' }} />
            <button onClick={() => { onLogout?.(); setProfileOpen(false); softClickSound(); tapHaptic(); }}
              style={{
                backgroundColor: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
                fontSize: 11, fontWeight: 600, color: 'rgba(180,60,60,0.75)', letterSpacing: '0.5px',
                WebkitTapHighlightColor: 'transparent',
                WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision',
              }}>
              Sign Out
            </button>
          </>
        ) : (
          <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: steel(0.45), WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision' }}>
            Not signed in
          </p>
        )}
      </div>

      {/* ── Illumination Well (top-right) ── */}
      {/* Tap: last result recall | Long-press: stealth mute toggle */}
      <div
        onClick={() => {
          const now = Date.now();
          if (now - wellLastTap.current < 300) {
            // Double-tap → status toast
            const msg = user
              ? `${user.username || user.email}${lastAnalysisTime ? ` · Last: ${new Date(lastAnalysisTime).toLocaleTimeString()}` : ''}`
              : 'Not signed in';
            setStatusToast(msg);
            setTimeout(() => setStatusToast(null), 2500);
            softClickSound(); tapHaptic();
            wellLastTap.current = 0;
          } else {
            wellLastTap.current = now;
            setTimeout(() => {
              if (wellLastTap.current === now && hasLastResult && onViewLastResult) {
                softClickSound(); tapHaptic(); onViewLastResult();
              }
            }, 320);
          }
        }}
        onContextMenu={(e) => e.preventDefault()}
        onTouchStart={startWellPress}
        onTouchEnd={endWellPress}
        onTouchCancel={endWellPress}
        onMouseDown={startWellPress}
        onMouseUp={endWellPress}
        onMouseLeave={endWellPress}
        role="button"
        aria-label={muted ? 'Sound muted — long-press to unmute' : hasLastResult ? 'View last result' : 'Illumination well'}
        style={{
          position: 'absolute', top: 30, right: 24, width: 40, height: 40,
          cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <img src={wellSrc} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', userSelect: 'none' }} />
        <div style={{ position: 'absolute', top: 4, left: 4, width: 32, height: 32, overflow: 'visible' }}>
          <img src={lampSrc} alt="" draggable={false} style={{
            position: 'absolute',
            top: '-15.63%', left: '-25%',
            width: '150%', height: '150%',
            userSelect: 'none',
          }} />
        </div>
        {/* LED dot — INSET well, green (alive) / amber (last result) / red (muted) / steel (idle) */}
        <div style={{
          position: 'absolute', top: 17, left: 17, width: 6, height: 6,
          borderRadius: '50%',
          // Radial gradient: bright center, darker rim — looks lit from inside the well.
          background: muted
            ? 'radial-gradient(circle at 50% 55%, rgba(225,90,90,0.98) 0%, rgba(140,40,40,0.78) 65%, rgba(70,18,18,0.55) 100%)'
            : hasImage
              ? 'radial-gradient(circle at 50% 55%, rgba(140,235,180,1) 0%, rgba(60,180,130,0.88) 60%, rgba(28,105,75,0.55) 100%)'
              : hasLastResult
                ? 'radial-gradient(circle at 50% 55%, rgba(255,215,120,0.98) 0%, rgba(200,150,55,0.78) 60%, rgba(115,80,28,0.55) 100%)'
                : 'radial-gradient(circle at 50% 55%, rgba(80,86,98,0.6) 0%, rgba(40,44,52,0.7) 100%)',
          // Recessed well: dark top rim (shadow cast from the upper-left light),
          // tiny bright catch on the lower-right lip, faint spill above.
          boxShadow: [
            'inset 0 1px 1.5px rgba(0,0,0,0.9)',
            'inset 1px 0 1px rgba(0,0,0,0.55)',
            'inset -0.5px -0.5px 0.6px rgba(255,255,255,0.10)',
            muted
              ? '0 0 1.5px rgba(180,60,60,0.35)'
              : hasImage
                ? '0 0 2px rgba(72,186,136,0.45)'
                : hasLastResult
                  ? '0 0 1.5px rgba(245,190,72,0.30)'
                  : 'none',
          ].join(', '),
          transition: 'background 0.4s ease, box-shadow 0.4s ease',
        }} />
      </div>

      {/* ── Photo Slot (Viewfinder) — tap to select, drag to drop, long-press to clear ── */}
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onTouchStart={() => { handleViewfinderTouch(); startViewfinderPress(); }}
        onTouchEnd={endViewfinderPress}
        onTouchCancel={endViewfinderPress}
        onContextMenu={(e) => { if (hasImage) { e.preventDefault(); clearImage(); } }}
        role="button"
        aria-label={hasImage ? 'Photo loaded — tap to swap, long-press to clear' : 'Tap to load a photo'}
        style={{
          position: 'absolute',
          top: 140,
          left: 24,
          right: 24,
          height: 360,
          borderRadius: 8,
          border: `0.5px solid ${isDragOver ? 'rgba(95,124,150,0.35)' : 'rgba(0,0,0,0.45)'}`,
          overflow: 'hidden',
          cursor: 'pointer',
          backgroundColor: C.slotBg,
          // Outer rim bevel — the edge of a hole carved into the matte surface.
          // Light from 141.71° (upper-left) catches the lower-right lip.
          boxShadow: isDragOver
            ? '0 -1px 0 rgba(0,0,0,0.5), -1px 0 0 rgba(0,0,0,0.4), 1px 1px 0 rgba(255,255,255,0.05), inset 0 0 30px rgba(95,124,150,0.08)'
            : '0 -1px 0 rgba(0,0,0,0.5), -1px 0 0 rgba(0,0,0,0.4), 1px 1px 0 rgba(255,255,255,0.05)',
          WebkitTapHighlightColor: 'transparent',
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease, transform 0.08s ease',
          transform: viewfinderShake ? 'translateX(4px)' : 'translateX(0)',
          animation: viewfinderShake ? 'vfShake 0.4s ease' : 'none',
        }}
      >
        {/* 1 — Ellipse depth oval (3% stroke from Figma SVG — Leica-style distance indicator) */}
        <div style={{ position: 'absolute', left: '2.8%', top: -30, right: '2.8%', height: 420, zIndex: 1 }}>
          <img src={ellipseBg} alt="" style={{ width: '100%', height: '100%' }} />
        </div>

        {/* 2 — Grid: vertical thirds */}
        <div style={{ position: 'absolute', left: '33.19%', top: 19.5, width: 1, height: 320, background: steel(0.10), zIndex: 2 }} />
        <div style={{ position: 'absolute', left: '66.52%', top: 19.5, width: 1, height: 320, background: steel(0.10), zIndex: 2 }} />
        {/* Grid: horizontal thirds */}
        <div style={{ position: 'absolute', left: '5.7%', top: 119.5, right: '5.7%', height: 1, background: steel(0.10), zIndex: 2 }} />
        <div style={{ position: 'absolute', left: '5.7%', top: 239.5, right: '5.7%', height: 1, background: steel(0.10), zIndex: 2 }} />

        {/* 3 — Grid intersection dots */}
        <div style={{ position: 'absolute', left: '24.85%', top: 119.5, width: 3, height: 3, background: steel(0.14), zIndex: 3 }} />
        <div style={{ position: 'absolute', left: '74.85%', top: 119.5, width: 3, height: 3, background: steel(0.14), zIndex: 3 }} />
        <div style={{ position: 'absolute', left: '24.85%', top: 179.5, width: 3, height: 3, background: steel(0.14), zIndex: 3 }} />
        <div style={{ position: 'absolute', left: '74.85%', top: 179.5, width: 3, height: 3, background: steel(0.14), zIndex: 3 }} />
        <div style={{ position: 'absolute', left: '32.85%', top: 239.5, width: 3, height: 3, background: steel(0.14), zIndex: 3 }} />
        <div style={{ position: 'absolute', left: '66.85%', top: 239.5, width: 3, height: 3, background: steel(0.14), zIndex: 3 }} />

        {/* 4 — Focus bracket (4 corner L-marks, centered) */}
        {/* top-left */}
        <div style={{ position: 'absolute', left: 'calc(50% - 13.5px)', top: 166.5, width: 6, height: 1,   background: steel(0.35), zIndex: 4 }} />
        <div style={{ position: 'absolute', left: 'calc(50% - 13.5px)', top: 166.5, width: 1,   height: 6, background: steel(0.35), zIndex: 4 }} />
        {/* top-right */}
        <div style={{ position: 'absolute', left: 'calc(50% + 6.5px)',  top: 166.5, width: 6, height: 1,   background: steel(0.35), zIndex: 4 }} />
        <div style={{ position: 'absolute', left: 'calc(50% + 12.5px)', top: 166.5, width: 1,   height: 6, background: steel(0.35), zIndex: 4 }} />
        {/* bottom-left */}
        <div style={{ position: 'absolute', left: 'calc(50% - 13.5px)', top: 192.5, width: 6, height: 1,   background: steel(0.35), zIndex: 4 }} />
        <div style={{ position: 'absolute', left: 'calc(50% - 13.5px)', top: 186.5, width: 1,   height: 6, background: steel(0.35), zIndex: 4 }} />
        {/* bottom-right */}
        <div style={{ position: 'absolute', left: 'calc(50% + 6.5px)',  top: 192.5, width: 6, height: 1,   background: steel(0.35), zIndex: 4 }} />
        <div style={{ position: 'absolute', left: 'calc(50% + 12.5px)', top: 186.5, width: 1,   height: 6, background: steel(0.35), zIndex: 4 }} />

        {/* 5 — EV exposure ruler (anchored to right edge) */}
        <div style={{ position: 'absolute', right: 24.5, top: 149.5, width: 1,   height: 60,  background: steel(0.16), zIndex: 5 }} />
        <div style={{ position: 'absolute', right: 24.5, top: 149.5, width: 3,   height: 0.5, background: steel(0.16), zIndex: 5 }} />
        <div style={{ position: 'absolute', right: 24.5, top: 164.5, width: 3,   height: 0.5, background: steel(0.16), zIndex: 5 }} />
        <div style={{ position: 'absolute', right: 24.5, top: 179.5, width: 3,   height: 0.5, background: steel(0.16), zIndex: 5 }} />
        <div style={{ position: 'absolute', right: 24.5, top: 178.5, width: 4,   height: 2,   background: steel(0.28), zIndex: 5 }} />
        <div style={{ position: 'absolute', right: 24.5, top: 194.5, width: 3,   height: 0.5, background: steel(0.16), zIndex: 5 }} />
        <div style={{ position: 'absolute', right: 24.5, top: 209.5, width: 3,   height: 0.5, background: steel(0.16), zIndex: 5 }} />
        <p style={{ position: 'absolute', right: 14.5, top: 146.5, margin: 0, fontSize: 9, fontWeight: 400, color: steel(0.55), lineHeight: 1, zIndex: 5, WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision' }}>+</p>
        <p style={{ position: 'absolute', right: 14.5, top: 205.5, margin: 0, fontSize: 9, fontWeight: 400, color: steel(0.55), lineHeight: 1, zIndex: 5, WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision' }}>–</p>

        {/* 6 — Center focus dot (green, 35% opacity from SVG) */}
        <div style={{ position: 'absolute', left: 'calc(50% - 2px)', top: 321.5, width: 4, height: 4, zIndex: 6 }}>
          <img src={ellipseDot} alt="" style={{ width: '100%', height: '100%' }} />
        </div>

        {/* 7 — Camera settings readout — tap opens settings panel */}
        <div
          onClick={(e) => { e.stopPropagation(); setSettingsOpen(v => !v); setProfileOpen(false); panelToggleSound(); tapHaptic(); }}
          style={{ position: 'absolute', left: '5%', right: '20%', top: 326, height: 20, cursor: 'pointer', zIndex: 11, WebkitTapHighlightColor: 'transparent' }}
        >
          <div style={{ position: 'absolute', left: '16.8%',  top: 6.5, width: 0.5, height: 6, background: steel(0.15) }} />
          <div style={{ position: 'absolute', left: '36.4%',  top: 6.5, width: 0.5, height: 6, background: steel(0.15) }} />
          <div style={{ position: 'absolute', left: '51.8%',  top: 6.5, width: 0.5, height: 6, background: steel(0.15) }} />
          <p style={{ position: 'absolute', left: '3.8%',   top: 5.5, margin: 0, fontSize: 10, fontWeight: 600, color: steel(0.85), lineHeight: 1, whiteSpace: 'nowrap', textShadow: `0 0 4px ${steel(0.25)}`, WebkitFontSmoothing: 'antialiased' }}>f/5.6</p>
          <p style={{ position: 'absolute', left: '21.0%',  top: 5.5, margin: 0, fontSize: 10, fontWeight: 600, color: steel(0.85), lineHeight: 1, whiteSpace: 'nowrap', textShadow: `0 0 4px ${steel(0.25)}`, WebkitFontSmoothing: 'antialiased' }}>1/200</p>
          <p style={{ position: 'absolute', left: '40.3%',  top: 5.5, margin: 0, fontSize: 10, fontWeight: 600, color: steel(0.85), lineHeight: 1, whiteSpace: 'nowrap', textShadow: `0 0 4px ${steel(0.25)}`, WebkitFontSmoothing: 'antialiased' }}>100</p>
          <p style={{ position: 'absolute', left: '55.5%',  top: 5.5, margin: 0, fontSize: 10, fontWeight: 600, color: steel(0.85), lineHeight: 1, whiteSpace: 'nowrap', textShadow: `0 0 4px ${steel(0.25)}`, WebkitFontSmoothing: 'antialiased' }}>5600K</p>
        </div>

        {/* 7b — Tap prompt / URL fetching / URL error indicator */}
        {!hasImage && (
          urlLoadError ? (
            <p style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              margin: 0, width: '75%', textAlign: 'center',
              fontSize: 11, fontWeight: 600, letterSpacing: '0.2px', lineHeight: '15px',
              color: 'rgba(245,190,72,0.85)',
              pointerEvents: 'none', zIndex: 7,
              WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale',
            }}>{urlLoadError}</p>
          ) : (
            <p style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              margin: 0, fontSize: 15, fontWeight: 800, letterSpacing: '3px',
              color: isUrlFetching ? steel(0.55) : steel(0.90),
              opacity: (showPrompt || isUrlFetching) ? 1 : 0,
              transition: 'opacity 1.2s ease, color 0.3s ease',
              pointerEvents: 'none', zIndex: 7,
              WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision',
            }}>{isUrlFetching ? 'LOADING…' : 'TAP TO LOAD'}</p>
          )
        )}

        {/* 7c — Drag-over state overlay */}
        {isDragOver && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 7,
            background: 'radial-gradient(ellipse 70% 60% at center, rgba(95,124,150,0.06) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />
        )}

        {/* 8 — Image preview (when selected) — sits under glass overlay */}
        {imagePreview && (
          <img key={imagePreview} src={imagePreview} alt="Selected" style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: '50% 25%', opacity: 0.85, zIndex: 8,
            animation: 'heroZoomIn 1.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
            transformOrigin: 'center 25%',
          }} />
        )}

        {/* 8b — LCD backlight wash — warm LEDs under the glass, upper-left key light orientation */}
        {lcdOn && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 8,
            background: [
              'radial-gradient(ellipse 130% 110% at 30% 36%, rgba(255,220,170,0.20) 0%, rgba(255,205,140,0.13) 32%, rgba(255,185,110,0.06) 65%, transparent 100%)',
            ].join(', '),
            transition: 'opacity 1.2s ease',
            pointerEvents: 'none',
          }} />
        )}

        {/* 9 — Glass panel overlay: single natural lens vignette + upper-left key light reflection */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 9 }}>
          <div style={{ position: 'absolute', inset: 0, background: LENS_VIGNETTE }} />
          <div style={{ position: 'absolute', top: 0, left: 0, right: '5%', bottom: 0, background: GLASS_REFLECTION, borderRadius: 8, opacity: 0.48 }} />
        </div>

        {/* 10 — Inner shadow — Figma-exact bevel, always top of stack */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 8,
          pointerEvents: 'none', boxShadow: VIEWFINDER_INNER_SHADOW, zIndex: 10,
        }} />
      </div>

      {/* ── Settings Panel — slides up from readout on tap ── */}
      <div style={{
        position: 'absolute', top: 505, left: 24, right: 24,
        borderRadius: 14, backgroundColor: '#0f1013',
        boxShadow: '1px 2px 4px 0px rgba(0,0,0,0.2), 2px 4px 12px 0px rgba(0,0,0,0.4), inset -1px -1px 2px 0px rgba(0,0,0,0.12), inset 1px 1px 0px 0px rgba(255,255,255,0.05)',
        padding: '14px 20px', zIndex: 25,
        opacity: settingsOpen ? 1 : 0,
        transform: settingsOpen ? 'translateY(0)' : 'translateY(8px)',
        transition: 'opacity 0.25s ease, transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        pointerEvents: settingsOpen ? 'auto' : 'none',
      }}>
        {/* SOUND row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: steel(0.65), letterSpacing: '1px', WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision' }}>SOUND</span>
          <div onClick={toggleSoundSetting} style={{
            width: 36, height: 20, borderRadius: 10, cursor: 'pointer',
            backgroundColor: soundOn ? 'rgba(72,186,136,0.5)' : steel(0.15),
            transition: 'background-color 0.2s ease', position: 'relative',
            boxShadow: 'inset 0px 1px 2px rgba(0,0,0,0.3)',
            WebkitTapHighlightColor: 'transparent',
          }}>
            <div style={{
              position: 'absolute', top: 2, left: soundOn ? 18 : 2,
              width: 16, height: 16, borderRadius: 8,
              backgroundColor: soundOn ? 'rgba(245,247,250,0.9)' : steel(0.45),
              transition: 'left 0.2s ease, background-color 0.2s ease',
              boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
            }} />
          </div>
        </div>
        <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.04)' }} />
        {/* HAPTIC row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: steel(0.65), letterSpacing: '1px', WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision' }}>HAPTIC</span>
          <div onClick={toggleHapticSetting} style={{
            width: 36, height: 20, borderRadius: 10, cursor: 'pointer',
            backgroundColor: hapticOn ? 'rgba(72,186,136,0.5)' : steel(0.15),
            transition: 'background-color 0.2s ease', position: 'relative',
            boxShadow: 'inset 0px 1px 2px rgba(0,0,0,0.3)',
            WebkitTapHighlightColor: 'transparent',
          }}>
            <div style={{
              position: 'absolute', top: 2, left: hapticOn ? 18 : 2,
              width: 16, height: 16, borderRadius: 8,
              backgroundColor: hapticOn ? 'rgba(245,247,250,0.9)' : steel(0.45),
              transition: 'left 0.2s ease, background-color 0.2s ease',
              boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
            }} />
          </div>
        </div>
        {/* PROFILE row — cycles A / B / C */}
        {hapticOn && (<>
          <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.04)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: steel(0.65), letterSpacing: '1px', WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision' }}>PROFILE</span>
            <div onClick={cycleHapticProfile} style={{
              display: 'flex', gap: 4, cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}>
              {['A', 'B', 'C'].map(k => (
                <div key={k} style={{
                  width: 22, height: 20, borderRadius: 4,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  backgroundColor: hapticProfile === k ? 'rgba(72,186,136,0.5)' : steel(0.10),
                  boxShadow: hapticProfile === k
                    ? 'inset 0px 1px 1px rgba(255,255,255,0.1), 0 1px 3px rgba(0,0,0,0.3)'
                    : 'inset 0px 1px 2px rgba(0,0,0,0.3)',
                  transition: 'background-color 0.2s ease, box-shadow 0.2s ease',
                }}>
                  <span style={{
                    fontSize: 9, fontWeight: 700, lineHeight: 1,
                    color: hapticProfile === k ? 'rgba(245,247,250,0.9)' : steel(0.40),
                    transition: 'color 0.2s ease',
                    WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision',
                  }}>{k}</span>
                </div>
              ))}
            </div>
          </div>
        </>)}
      </div>

      {/* ── Status Toast — from illumination well double-tap ── */}
      <div style={{
        position: 'absolute', top: 80, left: '50%', transform: 'translateX(-50%)',
        padding: '8px 16px', borderRadius: 8,
        backgroundColor: '#0f1013',
        boxShadow: '1px 2px 4px 0px rgba(0,0,0,0.3), 2px 4px 12px 0px rgba(0,0,0,0.5)',
        zIndex: 30,
        opacity: statusToast ? 1 : 0,
        transition: 'opacity 0.3s ease',
        pointerEvents: 'none',
      }}>
        <span style={{
          fontSize: 11, fontWeight: 600, color: steel(0.85), whiteSpace: 'nowrap',
          WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision',
        }}>{statusToast || ''}</span>
      </div>

      {/* ── LCD spill — warm light leaking from upper-left from under viewfinder glass ── */}
      <div style={{
        position: 'absolute', top: 120, left: 10, right: 10, height: 400,
        pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(ellipse 95% 75% at 35% 40%, rgba(255,210,150,0.050) 0%, rgba(255,195,120,0.025) 40%, transparent 80%)',
        opacity: lcdOn ? 1 : 0,
        transition: 'opacity 1.4s ease',
      }} />

      {/* ── Analyze Track ── */}
      <div
        role="button"
        aria-label={hasImage ? 'Analyze' : 'Select image'}
        onClick={hasImage ? handleAnalyze : () => fileRef.current?.click()}
        onMouseDown={handleButtonPress}
        onMouseUp={handleButtonRelease}
        onMouseLeave={handleButtonRelease}
        onTouchStart={handleButtonPress}
        onTouchEnd={handleButtonRelease}
        style={{
          position: 'absolute', left: '50%', top: 540, width: 88, height: 88, transform: 'translateX(-50%)',
          cursor: 'pointer', WebkitTapHighlightColor: 'transparent', userSelect: 'none',
        }}
      >
        <img src={trackSrc} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
        {/* Upper-left light catch — matches viewfinder 141.71° direction */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%', pointerEvents: 'none',
          background: 'linear-gradient(141.71deg, rgba(255,255,255,0.10) 0%, transparent 35%, transparent 65%, rgba(0,0,0,0.15) 100%)',
        }} />
      </div>

      {/* ── Analyze Button (CSS-rendered, lit from 141.71° top-left to match app) ── */}
      <div
        role="button"
        onClick={hasImage ? handleAnalyze : () => fileRef.current?.click()}
        onMouseDown={handleButtonPress}
        onMouseUp={handleButtonRelease}
        onMouseLeave={handleButtonRelease}
        onTouchStart={handleButtonPress}
        onTouchEnd={handleButtonRelease}
        style={{
          position: 'absolute', left: '50%', top: 548, width: 80, height: 80, transform: 'translateX(-50%)',
          cursor: 'pointer', WebkitTapHighlightColor: 'transparent', userSelect: 'none',
          borderRadius: '50%',
          // Neumorphic body — gradient aligned to app 141.71° (light top-left → dark bottom-right).
          // idle: flatter matte; alive: subtle warmth; pressed: shadows invert for press-in feel.
          background: buttonState === 'pressed'
            ? 'linear-gradient(141.71deg, #060709 0%, #0A0B0E 50%, #0F1014 100%)'
            : 'linear-gradient(141.71deg, #14161b 0%, #0D0E12 50%, #07080a 100%)',
          // Drop shadow cast to bottom-right (light from top-left); soft + subtle, not popping
          boxShadow: buttonState === 'pressed'
            ? 'inset 2px 2px 4px rgba(0,0,0,0.65), inset -1px -1px 2px rgba(255,255,255,0.02), 1px 1px 3px rgba(0,0,0,0.3)'
            : buttonState === 'alive'
              ? '3px 3px 10px rgba(0,0,0,0.55), 1px 1px 3px rgba(0,0,0,0.3), inset 1px 1px 0 rgba(255,255,255,0.05), inset -1px -1px 0 rgba(0,0,0,0.5)'
              : '3px 3px 8px rgba(0,0,0,0.45), inset 1px 1px 0 rgba(255,255,255,0.04), inset -1px -1px 0 rgba(0,0,0,0.45)',
          transition: buttonState === 'alive' ? 'none' : 'background 0.25s ease, box-shadow 0.2s ease',
          animation: buttonState === 'alive' ? 'btnBreath 1.6s ease-in-out infinite' : 'none',
        }}
      />

      {/* ── Activity Indicator (LED inset into button center) ── */}
      <div style={{
        position: 'absolute', left: '50%', top: 584, width: 8, height: 8,
        transform: 'translateX(-50%)', pointerEvents: 'none',
        borderRadius: '50%',
        // Inset green well: bright center → darker rim, lit from below the surface.
        background: hasImage
          ? 'radial-gradient(circle at 50% 55%, rgba(140,235,180,1) 0%, rgba(60,180,130,0.9) 55%, rgba(28,105,75,0.6) 100%)'
          : 'radial-gradient(circle at 50% 55%, rgba(80,86,98,0.6) 0%, rgba(40,44,52,0.75) 100%)',
        boxShadow: [
          // Recessed well rim — dark cast from upper-left light
          'inset 0 1px 1.8px rgba(0,0,0,0.9)',
          'inset 1px 0 1.2px rgba(0,0,0,0.6)',
          // Lower-right lip catches the light
          'inset -0.5px -0.5px 0.8px rgba(255,255,255,0.12)',
          // Faint green spill out of the hole
          hasImage ? '0 0 2.5px rgba(72,186,136,0.5)' : 'none',
        ].join(', '),
        transition: 'background 0.4s ease, box-shadow 0.4s ease',
      }} />

      {/* ── ANALYZE label ── */}
      <p style={{
        position: 'absolute', top: 652, left: '50%', transform: 'translateX(-50%)',
        margin: 0, fontWeight: 800, fontSize: 13.5, lineHeight: '16px',
        color: analyzeText, letterSpacing: '4.5px', textShadow: analyzeGlow,
        textAlign: 'center', whiteSpace: 'nowrap', pointerEvents: 'none',
        WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale',
        textRendering: 'geometricPrecision',
      }}>ANALYZE</p>

      {/* ── Home Indicator — green when image loaded, steel when idle ── */}
      <div style={{
        position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
        width: 134, height: 5, borderRadius: 3,
        backgroundColor: hasImage ? 'rgba(72,186,136,0.95)' : 'rgba(89,94,107,0.55)',
        boxShadow: [
          'inset 0px 1px 1px 0px rgba(255,255,255,0.12)',
          'inset 0px -0.5px 0.5px 0px rgba(0,0,0,0.2)',
          '0px 0.5px 0px 0px rgba(255,255,255,0.03)',
          '0px -0.5px 1px 0px rgba(0,0,0,0.25)',
        ].join(', '),
        transition: 'background-color 0.4s ease',
      }} />

      {/* Shake keyframes for invalid file rejection */}
      {/* Button breath pulse — alive state */}
      <style>{`
        @keyframes vfShake {
          0%,100% { transform: translateX(0); }
          15% { transform: translateX(4px); }
          30% { transform: translateX(-4px); }
          45% { transform: translateX(3px); }
          60% { transform: translateX(-2px); }
          75% { transform: translateX(1px); }
        }
        @keyframes btnBreath {
          0%,100% { transform: translateX(-50%) scale(1);    box-shadow: 3px 3px 10px rgba(0,0,0,0.55), 1px 1px 3px rgba(0,0,0,0.3), inset 1px 1px 0 rgba(255,255,255,0.05), inset -1px -1px 0 rgba(0,0,0,0.5); }
          50%      { transform: translateX(-50%) scale(1.04); box-shadow: 4px 4px 16px rgba(0,0,0,0.65), 2px 2px 6px rgba(0,0,0,0.4), 0 0 14px rgba(95,124,150,0.18), inset 1px 1px 0 rgba(255,255,255,0.08), inset -1px -1px 0 rgba(0,0,0,0.55); }
        }
      `}</style>
    </div>
    </div>
  );
}
