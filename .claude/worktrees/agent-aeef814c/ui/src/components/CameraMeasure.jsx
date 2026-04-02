import { useState, useRef, useEffect, useCallback } from 'react';
import { REFERENCE_OBJECTS } from '../data/roomPresets';
import {
  estimateRoomFromReference,
  readFocalLength35mm,
} from '../spatial/perspectiveEstimator';

/**
 * CameraMeasure — camera-based room dimension estimation.
 *
 * Uses the device rear camera + a known reference object to estimate
 * room dimensions via single-image perspective analysis.
 *
 * Props:
 *   onEstimate  - ({ lengthFt, widthFt, ceilingFt, confidence }) => void
 *   onClose     - () => void
 */
export default function CameraMeasure({ onEstimate, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const capturedDataUrl = useRef(null);

  const [phase, setPhase] = useState('prompt');  // prompt | init | live | captured | marking | result | error
  const [error, setError] = useState(null);
  const [refType, setRefType] = useState(0);   // index into REFERENCE_OBJECTS
  const [customHeight, setCustomHeight] = useState('');
  const [marks, setMarks] = useState([]);      // [{x,y}] tap points on image
  const [imageData, setImageData] = useState(null);  // { width, height, blob }
  const [result, setResult] = useState(null);

  const selectedRef = REFERENCE_OBJECTS[refType];
  const needsInput = selectedRef?.requiresInput;
  const refHeightFt = needsInput ? parseFloat(customHeight) || 0 : selectedRef?.heightFt;

  /* ── Camera lifecycle ───────────────────────────────── */

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(playErr => {
          console.warn('Autoplay failed:', playErr.message);
          // Still in 'live' phase — user tap/interaction often unblocks playback
        });
      }
      setPhase('live');
      setError(null);
    } catch (err) {
      setPhase('error');
      const messages = {
        NotAllowedError: 'Camera permission denied. Enter room dimensions manually.',
        NotFoundError: 'No camera found on this device. Enter room dimensions manually.',
        NotReadableError: 'Camera is in use by another app. Close it and try again.',
        OverconstrainedError: 'Camera does not support the required resolution. Try again.',
      };
      setError(messages[err.name] || `Camera error: ${err.message}`);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  // Clean up stream on unmount (don't auto-start — requires user gesture on iOS/Safari)
  useEffect(() => stopCamera, [stopCamera]);

  /* ── Capture frame ──────────────────────────────────── */

  function captureFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    // Guard against camera not fully initialized
    if (!video.videoWidth || !video.videoHeight) {
      setError('Camera not ready yet. Wait a moment and try again.');
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    // Cache the captured frame for redrawing marks later
    capturedDataUrl.current = canvas.toDataURL('image/jpeg', 0.9);

    // Get blob for EXIF reading
    canvas.toBlob(blob => {
      if (!blob) {
        setError('Failed to capture image. Please try again.');
        setPhase('error');
        return;
      }
      setImageData({
        width: canvas.width,
        height: canvas.height,
        blob,
      });
    }, 'image/jpeg', 0.9);

    stopCamera();
    setPhase('captured');
    setMarks([]);
  }

  /* ── Handle taps on captured image ──────────────────── */

  function handleCanvasTap(e) {
    if (phase !== 'captured' && phase !== 'marking') return;
    if (marks.length >= 2) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const newMarks = [...marks, { x, y }];
    setMarks(newMarks);

    // Draw crosshair
    drawMarks(newMarks);

    if (newMarks.length === 2) {
      setPhase('marking');
    }
  }

  function drawMarks(marksList) {
    const canvas = canvasRef.current;
    if (!canvas || !capturedDataUrl.current) return;

    const ctx = canvas.getContext('2d');
    // Redraw the captured frame from cached data URL (not circular canvas read)
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      marksList.forEach((m, i) => {
        const size = 20;
        ctx.strokeStyle = i === 0 ? '#00ff88' : '#ff4444';
        ctx.lineWidth = 3;
        // Crosshair
        ctx.beginPath();
        ctx.moveTo(m.x - size, m.y);
        ctx.lineTo(m.x + size, m.y);
        ctx.moveTo(m.x, m.y - size);
        ctx.lineTo(m.x, m.y + size);
        ctx.stroke();
        // Circle
        ctx.beginPath();
        ctx.arc(m.x, m.y, size * 0.7, 0, Math.PI * 2);
        ctx.stroke();
        // Label
        ctx.fillStyle = i === 0 ? '#00ff88' : '#ff4444';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(i === 0 ? 'TOP' : 'BOTTOM', m.x + size + 4, m.y + 5);
      });

      // Draw line between marks
      if (marksList.length === 2) {
        ctx.strokeStyle = '#ffaa00';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);
        ctx.beginPath();
        ctx.moveTo(marksList[0].x, marksList[0].y);
        ctx.lineTo(marksList[1].x, marksList[1].y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    };
    img.src = capturedDataUrl.current;
  }

  /* ── Run estimation ─────────────────────────────────── */

  async function runEstimate() {
    if (marks.length < 2 || !imageData || !refHeightFt) return;

    const refPixelHeight = Math.abs(marks[1].y - marks[0].y);
    const refCenterX = ((marks[0].x + marks[1].x) / 2) / imageData.width;
    const refBottomY = Math.max(marks[0].y, marks[1].y) / imageData.height;

    // Try to read EXIF focal length
    let focalLength35mm = null;
    if (imageData.blob) {
      focalLength35mm = await readFocalLength35mm(imageData.blob);
    }

    const est = estimateRoomFromReference({
      imageWidth: imageData.width,
      imageHeight: imageData.height,
      refPixelHeight,
      refRealHeightFt: refHeightFt,
      refCenterX,
      refBottomY,
      focalLength35mm,
    });

    setResult(est);
    setPhase('result');
  }

  /* ── Accept estimate ────────────────────────────────── */

  function handleAccept() {
    if (!result) return;
    onEstimate({
      lengthFt: result.estimatedDepthFt,
      widthFt: result.estimatedWidthFt,
      ceilingFt: result.estimatedCeilingFt,
      confidence: result.confidence,
    });
  }

  function handleRetake() {
    setMarks([]);
    setResult(null);
    setPhase('init');
    startCamera();
  }

  /* ── Render ─────────────────────────────────────────── */

  return (
    <div className="camera-measure">
      {/* Header */}
      <div className="camera-measure__header">
        <span className="camera-measure__title"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6, verticalAlign: 'text-bottom' }}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>Camera Measure</span>
        <button className="camera-measure__close" onClick={onClose}>{'\u2715'}</button>
      </div>

      {/* Permission prompt — shown before camera starts */}
      {phase === 'prompt' && (
        <div className="camera-measure__prompt">
          <p>Camera access is needed to estimate room dimensions.</p>
          <p className="camera-measure__prompt-note">Your browser will ask for permission.</p>
          <div className="camera-measure__actions">
            <button className="btn btn--secondary" onClick={onClose}>Enter Manually</button>
            <button className="btn btn--primary" onClick={startCamera}>Allow Camera</button>
          </div>
        </div>
      )}

      {/* Error state */}
      {phase === 'error' && (
        <div className="camera-measure__error">
          <p>{error}</p>
          <button className="btn btn--secondary" onClick={onClose}>Enter Manually</button>
        </div>
      )}

      {/* Reference object selector */}
      {(phase === 'init' || phase === 'live') && (
        <div className="camera-measure__ref-selector">
          <label className="camera-measure__ref-label">Reference Object</label>
          <div className="camera-measure__ref-chips">
            {REFERENCE_OBJECTS.map((ref, i) => (
              <button
                key={i}
                className={`chip ${refType === i ? 'chip--selected' : ''}`}
                onClick={() => setRefType(i)}
              >
                {ref.label} {ref.description && !ref.requiresInput ? `(${ref.description})` : ''}
              </button>
            ))}
          </div>
          {needsInput && (
            <div className="camera-measure__custom-input">
              <label>Height (feet):</label>
              <input
                type="number"
                step="0.1"
                min="1"
                max="20"
                value={customHeight}
                onChange={e => setCustomHeight(e.target.value)}
                placeholder="5.7"
              />
            </div>
          )}
        </div>
      )}

      {/* Viewfinder */}
      <div className="camera-measure__viewfinder">
        <video
          ref={videoRef}
          className="camera-measure__video"
          autoPlay
          playsInline
          muted
          style={{ display: phase === 'live' || phase === 'init' ? 'block' : 'none' }}
        />
        <canvas
          ref={canvasRef}
          className="camera-measure__canvas"
          style={{ display: phase !== 'live' && phase !== 'init' && phase !== 'error' ? 'block' : 'none' }}
          onClick={handleCanvasTap}
        />
      </div>

      {/* Instructions */}
      {phase === 'live' && (
        <div className="camera-measure__instructions">
          <p>Point camera at the room from a corner. Include the {selectedRef?.label?.toLowerCase() || 'reference object'} in frame.</p>
          <button
            className="btn btn--primary camera-measure__capture-btn"
            onClick={captureFrame}
            disabled={needsInput && !refHeightFt}
          >
            Capture
          </button>
        </div>
      )}

      {phase === 'captured' && marks.length < 2 && (
        <div className="camera-measure__instructions">
          <p>
            {marks.length === 0
              ? `Tap the TOP of the ${selectedRef?.label?.toLowerCase() || 'reference object'}`
              : `Now tap the BOTTOM of the ${selectedRef?.label?.toLowerCase() || 'reference object'}`
            }
          </p>
        </div>
      )}

      {phase === 'marking' && (
        <div className="camera-measure__instructions">
          <p>Reference marked! Tap "Estimate" to calculate room dimensions.</p>
          <div className="camera-measure__actions">
            <button className="btn btn--secondary" onClick={() => { setMarks([]); setPhase('captured'); }}>
              Redo Marks
            </button>
            <button className="btn btn--primary" onClick={runEstimate}>
              Estimate Dimensions
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      {phase === 'result' && result && (
        <div className="camera-measure__result">
          <div className="camera-measure__result-header">
            Estimated Dimensions
            <span className="camera-measure__confidence">
              Confidence: {Math.round(result.confidence * 100)}%
            </span>
          </div>
          <div className="camera-measure__result-grid">
            <div className="camera-measure__result-item">
              <span className="camera-measure__result-label">Depth</span>
              <span className="camera-measure__result-value">{result.estimatedDepthFt} ft</span>
            </div>
            <div className="camera-measure__result-item">
              <span className="camera-measure__result-label">Width</span>
              <span className="camera-measure__result-value">{result.estimatedWidthFt} ft</span>
            </div>
            <div className="camera-measure__result-item">
              <span className="camera-measure__result-label">Ceiling</span>
              <span className="camera-measure__result-value">{result.estimatedCeilingFt} ft</span>
            </div>
          </div>
          <p className="camera-measure__result-note">
            These are estimates. You can adjust them after accepting.
          </p>
          <div className="camera-measure__actions">
            <button className="btn btn--secondary" onClick={handleRetake}>Retake</button>
            <button className="btn btn--primary" onClick={handleAccept}>Accept Estimates</button>
          </div>
        </div>
      )}
    </div>
  );
}
