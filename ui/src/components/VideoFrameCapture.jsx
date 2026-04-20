/**
 * VideoFrameCapture — extract a frame from a video file for analysis.
 *
 * Client-side only: uses HTML5 <video> + canvas to capture a JPEG frame.
 * No server-side video processing needed.
 */
import { useState, useRef, useCallback } from 'react';
import { C, steel, MACHINED_SHADOW } from '../theme/studioMatte';

const MAX_VIDEO_MB = 500;

export default function VideoFrameCapture({ onCapture, onClose }) {
  const [videoUrl, setVideoUrl] = useState(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
      setError(`Video exceeds ${MAX_VIDEO_MB} MB limit.`);
      return;
    }

    if (!file.type.startsWith('video/')) {
      setError('Please select a video file (MP4, MOV, WebM).');
      return;
    }

    setError(null);
    setFileName(file.name);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      setDuration(video.duration);
      setCurrentTime(0);
    }
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (video) setCurrentTime(video.currentTime);
  }, []);

  const handleSeek = useCallback((e) => {
    const video = videoRef.current;
    if (!video || !duration) return;
    const pct = parseFloat(e.target.value);
    video.currentTime = pct * duration;
  }, [duration]);

  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const frameFile = new File(
        [blob],
        `${fileName.replace(/\.[^.]+$/, '')}_frame_${Math.round(currentTime * 10) / 10}s.jpg`,
        { type: 'image/jpeg' }
      );
      onCapture?.(frameFile);
    }, 'image/jpeg', 0.92);
  }, [fileName, currentTime, onCapture]);

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        width: '100%', maxWidth: 640,
        background: `linear-gradient(141.71deg, ${C.panelBg} 0%, ${C.slotBg} 100%)`,
        borderRadius: 16,
        boxShadow: MACHINED_SHADOW || '8px 8px 24px rgba(0,0,0,0.6)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 16px', borderBottom: `1px solid ${steel(0.08)}`,
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary }}>
            Capture Frame from Video
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', color: steel(0.4),
              fontSize: 18, cursor: 'pointer', padding: '4px 8px',
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: 16 }}>
          {!videoUrl ? (
            /* File picker */
            <label style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
              padding: '40px 20px',
              border: `2px dashed ${steel(0.15)}`,
              borderRadius: 12,
              cursor: 'pointer',
              background: C.slotBg,
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={steel(0.4)} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="23 7 16 12 23 17 23 7"/>
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
              </svg>
              <span style={{ fontSize: 14, fontWeight: 600, color: steel(0.5) }}>
                Select a video file
              </span>
              <span style={{ fontSize: 11, color: steel(0.3) }}>
                MP4, MOV, WebM · Max {MAX_VIDEO_MB} MB
              </span>
              <input
                type="file"
                accept="video/*"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
            </label>
          ) : (
            /* Video player + scrubber */
            <>
              <video
                ref={videoRef}
                src={videoUrl}
                onLoadedMetadata={handleLoadedMetadata}
                onTimeUpdate={handleTimeUpdate}
                style={{
                  width: '100%', borderRadius: 8,
                  background: '#000',
                  maxHeight: 360,
                }}
                playsInline
                muted
              />

              {/* Scrubber */}
              <div style={{ marginTop: 12 }}>
                <input
                  type="range"
                  min="0" max="1" step="0.001"
                  value={duration ? currentTime / duration : 0}
                  onChange={handleSeek}
                  style={{ width: '100%', accentColor: '#849eb8' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: steel(0.4), marginTop: 4 }}>
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              {/* Play/Pause + Capture */}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  onClick={() => {
                    const v = videoRef.current;
                    if (!v) return;
                    v.paused ? v.play() : v.pause();
                  }}
                  style={{
                    padding: '10px 20px', borderRadius: 8, border: 'none',
                    background: C.slotBg, color: steel(0.6),
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.4)',
                  }}
                >
                  Play / Pause
                </button>
                <button
                  onClick={handleCapture}
                  style={{
                    flex: 1,
                    padding: '10px 20px', borderRadius: 8, border: 'none',
                    background: `linear-gradient(141.71deg, ${C.ctaFrom} 0%, ${C.ctaMid} 50%, ${C.ctaTo} 100%)`,
                    color: steel(0.8),
                    fontSize: 12, fontWeight: 700, letterSpacing: '0.06em',
                    cursor: 'pointer',
                    boxShadow: `3px 3px 8px rgba(0,0,0,0.5), 0 0 0 0.5px ${steel(0.2)}`,
                  }}
                >
                  Capture This Frame
                </button>
              </div>
            </>
          )}

          {error && (
            <div style={{
              marginTop: 12, padding: '10px 14px', borderRadius: 8,
              background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)',
              color: '#f87171', fontSize: 13,
            }}>
              {error}
            </div>
          )}
        </div>

        {/* Hidden canvas for frame capture */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>
    </div>
  );
}
