import { useState, useEffect, useRef } from 'react';
import HomeScreen from './HomeScreen';
import ProcessingScreen from './ProcessingScreen';
import ResultScreen from './ResultScreen';
import SetupScreen from './SetupScreen';
import { analyzeImage } from '../data/labApi';
import { getUser, clearAuth } from '../data/authApi';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

/** Downsample an image file via canvas if it exceeds the size limit. */
function downsampleImage(file, maxBytes) {
  return new Promise((resolve) => {
    if (file.size <= maxBytes) return resolve(file);
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      // Scale factor to roughly hit target size (JPEG ~8:1 from raw pixels)
      const ratio = Math.sqrt(maxBytes / file.size);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) return resolve(file);
          const smaller = new File([blob], file.name, { type: 'image/jpeg' });
          // If still too big, recurse with lower quality
          if (smaller.size > maxBytes) {
            canvas.toBlob(
              (blob2) => resolve(blob2 ? new File([blob2], file.name, { type: 'image/jpeg' }) : smaller),
              'image/jpeg', 0.6
            );
          } else {
            resolve(smaller);
          }
        },
        'image/jpeg', 0.82
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

/**
 * Day 1 Demo App
 * Studio Matte design — matches Figma prototype (file: YQgGd8KZyZoXzZwJV7p4b6, Studio Matte Theme page)
 * Flow: Home → Processing → Result (High/Low confidence) → Save Setup
 *
 * Wired to real analysis engine: POST /api/lab/analyze
 */

/** Convert snake_case canonical pattern → display name (e.g. "ring_light" → "RING LIGHT") */
function displayPattern(name) {
  if (!name) return 'UNKNOWN';
  return name.replace(/_/g, ' ').toUpperCase();
}

/** Map API response → ResultScreen prop shape */
function mapApiResult(data) {
  const li = data.lighting_inference || {};
  const ci = li.catchlight_intelligence || {};
  const sd = data.signal_diagnostics || {};
  const signals = sd.signals || {};

  // Confidence: API returns 0–1 float → display as 0–100 int
  const confidence = Math.round((data.authoritative_confidence || 0) * 100);
  const pattern = displayPattern(data.authoritative_pattern);

  // Meta pills — short descriptors from lighting inference (display as uppercase)
  const meta = [
    li.key_position_text,
    li.modifier_family,
    li.light_count ? `${li.light_count} light${li.light_count !== 1 ? 's' : ''}` : null,
    li.detected_environment,
  ].filter(Boolean).map(s => s.replace(/_/g, ' ').toUpperCase());

  // Pattern candidates — primary + construct alternates from available data
  const candidates = [{ name: pattern, score: confidence }];
  const sdFinal = sd.final_pattern || '';
  if (sdFinal && sdFinal !== data.authoritative_pattern) {
    candidates.push({ name: displayPattern(sdFinal), score: Math.round(confidence * 0.7) });
  }
  // Shadow-pass pattern as a weaker alternate
  const shadowPassPattern = signals.shadow_pass_pattern || '';
  const existingNames = candidates.map(c => c.name.toLowerCase());
  if (shadowPassPattern && !existingNames.includes(displayPattern(shadowPassPattern).toLowerCase())) {
    candidates.push({ name: displayPattern(shadowPassPattern), score: Math.round(confidence * 0.5) });
  }

  // Shadow analysis — build readable sentence from signal diagnostics
  let shadowAnalysis = '';
  if (li.notes && li.notes.length > 0) {
    shadowAnalysis = li.notes.join('. ');
  } else {
    const parts = [];
    if (signals.shadow_pass_pattern) parts.push(`Shadow pass: ${signals.shadow_pass_pattern}`);
    if (signals.nose_shadow_angle_deg) parts.push(`nose shadow at ${signals.nose_shadow_angle_deg}°`);
    if (signals.left_right_asymmetry) parts.push(`L/R asymmetry: ${(signals.left_right_asymmetry * 100).toFixed(1)}%`);
    if (signals.triangle_isolation > 0) parts.push(`triangle isolation: ${(signals.triangle_isolation * 100).toFixed(1)}%`);
    shadowAnalysis = parts.join('. ') || 'Shadow analysis complete.';
  }

  // Catchlight & modifier — build from catchlight intelligence
  let catchlightModifier = '';
  if (ci && ci.modifier) {
    const mod = ci.modifier;
    catchlightModifier = `${mod.family || li.modifier_family || 'Unknown'} ${mod.size_label || ''}`.trim();
    if (ci.primary_key) {
      const pk = ci.primary_key;
      catchlightModifier += `. Key catchlight at ${pk.position || 'unknown'}, ${pk.shape || ''} shape`;
    }
  } else if (li.modifier_family) {
    catchlightModifier = li.modifier_family;
    if (sd.catchlights && sd.catchlights.length > 0) {
      const first = sd.catchlights[0];
      if (first.position) catchlightModifier += ` — catchlight at ${first.position}`;
      if (first.shape) catchlightModifier += `, ${first.shape} shape`;
    }
  } else {
    catchlightModifier = 'Modifier analysis complete.';
  }

  return {
    pattern,
    confidence,
    meta,
    sections: {
      patternCandidates: candidates,
      shadowAnalysis,
      catchlightModifier,
    },
    _raw: data,
  };
}

export default function Day1DemoApp() {
  const [screen, setScreen] = useState('home');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [result, setResult] = useState(null);
  const [analysisError, setAnalysisError] = useState(null);
  const [analysisReady, setAnalysisReady] = useState(false);
  const [user, setUser] = useState(() => getUser());
  const [lastAnalysisTime, setLastAnalysisTime] = useState(null);
  const abortRef = useRef(null);
  const wakeLockRef = useRef(null);

  // Keep screen awake while app is active
  useEffect(() => {
    async function requestWakeLock() {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
        }
      } catch { /* user denied or not supported */ }
    }
    requestWakeLock();
    // Re-acquire on visibility change (browser releases on tab switch)
    const reacquire = () => { if (document.visibilityState === 'visible') requestWakeLock(); };
    document.addEventListener('visibilitychange', reacquire);
    return () => {
      document.removeEventListener('visibilitychange', reacquire);
      if (wakeLockRef.current) wakeLockRef.current.release().catch(() => {});
    };
  }, []);

  const handleAnalyze = (file, preview) => {
    setImageFile(file);
    setImagePreview(preview);
    setResult(null);
    setAnalysisError(null);
    setAnalysisReady(false);
    setScreen('processing');

    const controller = new AbortController();
    abortRef.current = controller;

    // Downsample if over 10 MB, then analyze
    downsampleImage(file, MAX_UPLOAD_BYTES)
      .then(readyFile => analyzeImage(readyFile, { signal: controller.signal }))
      .then(data => {
        setResult(mapApiResult(data));
        setAnalysisReady(true);
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          console.error('[Day1] Analysis failed:', err);
          setAnalysisError(err.message);
          setAnalysisReady(true);
        }
      });
  };

  // Persist last result for quick recall from home screen
  const [lastResult, setLastResult] = useState(() => {
    try { const r = sessionStorage.getItem('ngw_last_result'); return r ? JSON.parse(r) : null; } catch { return null; }
  });
  const [lastPreview, setLastPreview] = useState(() => sessionStorage.getItem('ngw_last_preview') || null);

  // Transition to result when analysis finishes (ProcessingScreen stays until ready)
  useEffect(() => {
    if (screen === 'processing' && analysisReady) {
      if (result) {
        setScreen('result');
        // Cache for last-result recall
        setLastResult(result);
        setLastPreview(imagePreview);
        setLastAnalysisTime(Date.now());
        try {
          sessionStorage.setItem('ngw_last_result', JSON.stringify(result));
          if (imagePreview) sessionStorage.setItem('ngw_last_preview', imagePreview);
        } catch { /* quota */ }
      } else if (analysisError) {
        alert(`Analysis failed: ${analysisError}`);
        setScreen('home');
      }
    }
  }, [screen, analysisReady, result, analysisError, imagePreview]);

  const handleViewLastResult = () => {
    if (lastResult) {
      setResult(lastResult);
      setImagePreview(lastPreview);
      setScreen('result');
    }
  };

  const handleSetup = () => setScreen('setup');

  const handleSetupSave = () => {
    setScreen('home');
    setImageFile(null);
    setImagePreview(null);
    setResult(null);
  };

  const handleSetupCancel = () => setScreen('result');

  const handleRetry = () => {
    // Abort any in-flight analysis
    if (abortRef.current) abortRef.current.abort();
    setScreen('home');
    setImageFile(null);
    setImagePreview(null);
    setResult(null);
    setAnalysisError(null);
    setAnalysisReady(false);
  };

  switch (screen) {
    case 'home':
      return (
        <HomeScreen
          onAnalyze={handleAnalyze}
          hasLastResult={!!lastResult}
          onViewLastResult={handleViewLastResult}
          user={user}
          onLogout={() => { clearAuth(); setUser(null); }}
          lastAnalysisTime={lastAnalysisTime}
        />
      );
    case 'processing':
      return <ProcessingScreen imagePreview={imagePreview} analysisComplete={analysisReady} />;
    case 'result':
      return (
        <ResultScreen
          result={result}
          imagePreview={imagePreview}
          onSetup={handleSetup}
          onRetry={handleRetry}
        />
      );
    case 'setup':
      return (
        <SetupScreen
          result={result}
          onSave={handleSetupSave}
          onCancel={handleSetupCancel}
        />
      );
    default:
      return (
        <HomeScreen
          onAnalyze={handleAnalyze}
          hasLastResult={!!lastResult}
          onViewLastResult={handleViewLastResult}
          user={user}
          onLogout={() => { clearAuth(); setUser(null); }}
          lastAnalysisTime={lastAnalysisTime}
        />
      );
  }
}
