/**
 * DiagramCard — Interactive lighting diagram with top-down, side, and
 * floor-plan views. Supports light selection, zoom overlay, and print.
 *
 * Canvas rendering is delegated to the diagram/ module.
 * This file is the React shell only.
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import ZoomOverlay from './ZoomOverlay';
import CardIcon from '../components/CardIcon';
import { selectHaptic } from '../utils/haptics';
import useSettings from '../hooks/useSettings';
import { formatRoomDim } from '../utils/units';
import { formatEnginePowerHint } from '../transform';

import {
  drawTopView, drawFloorPlan, drawSideView,
  getThemeColors, lightColor, fmtDist, handlePrint,
  SHORT_MOD, ROLE_DESC,
} from '../diagram';

export default function DiagramCard({ spec, title, inline, spaceCheck, roomDimensions, highlightRole, twoHostSetup, onLightSelect, onItemSelect, legendCollapsed = false }) {
  const canvasRef = useRef(null);
  const layoutRef = useRef(null);
  const [view, setView] = useState('top');
  const [zoomSrc, setZoomSrc] = useState(null);
  const [selectedRole, setSelectedRole] = useState(null);
  const [selectedItemType, setSelectedItemType] = useState(null);
  const [legendOpen, setLegendOpen] = useState(!legendCollapsed);
  const [showBeams, setShowBeams] = useState(true);
  const [showAngles, setShowAngles] = useState(true);
  const { units, powerDisplay } = useSettings();

  // Re-render canvas when theme changes (light ↔ dark)
  const [themeKey, setThemeKey] = useState(() =>
    document.documentElement.getAttribute('data-theme') || 'dark'
  );
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setThemeKey(document.documentElement.getAttribute('data-theme') || 'dark');
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const effectiveHighlight = highlightRole || selectedRole;

  useEffect(() => {
    let layout;
    if (view === 'space') {
      layout = drawFloorPlan(canvasRef.current, spec, units, spaceCheck, roomDimensions, effectiveHighlight, showBeams, showAngles);
    } else if (view === 'side') {
      layout = drawSideView(canvasRef.current, spec, units, effectiveHighlight, showBeams, showAngles);
    } else {
      layout = drawTopView(canvasRef.current, spec, units, effectiveHighlight, twoHostSetup, selectedItemType, showBeams);
    }
    layoutRef.current = layout;

    function onResize() {
      if (view === 'space') { layoutRef.current = drawFloorPlan(canvasRef.current, spec, units, spaceCheck, roomDimensions, effectiveHighlight, showBeams, showAngles); }
      else if (view === 'side') { layoutRef.current = drawSideView(canvasRef.current, spec, units, effectiveHighlight, showBeams, showAngles); }
      else { layoutRef.current = drawTopView(canvasRef.current, spec, units, effectiveHighlight, twoHostSetup, selectedItemType, showBeams); }
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [spec, view, units, spaceCheck, roomDimensions, effectiveHighlight, twoHostSetup, selectedItemType, showBeams, showAngles, themeKey]);

  // ── Pointer handlers for light selection ──
  function getCanvasXY(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function hitTestItem(px, py) {
    const layout = layoutRef.current;
    if (!layout) return null;
    const threshold = 22;
    if (layout.lights) {
      for (const l of layout.lights) {
        const dx = px - l.lx;
        const dy = py - l.ly;
        if (Math.sqrt(dx * dx + dy * dy) < threshold) return { type: 'light', role: l.role };
      }
    }
    if (layout.subjectX != null && layout.subjectY != null) {
      const dx = px - layout.subjectX;
      const dy = py - layout.subjectY;
      if (Math.sqrt(dx * dx + dy * dy) < threshold) return { type: 'subject' };
    }
    if (layout.camX != null && layout.camY != null) {
      const dx = px - layout.camX;
      const dy = py - layout.camY;
      if (Math.sqrt(dx * dx + dy * dy) < threshold) return { type: 'camera' };
    }
    if (layout.bgX != null && layout.bgY != null) {
      if (px >= layout.bgX && px <= layout.bgX + layout.bgW &&
          py >= layout.bgY && py <= layout.bgY + layout.bgH) {
        return { type: 'background' };
      }
    }
    return null;
  }

  const handlePointerDown = useCallback((e) => {
    const { x, y } = getCanvasXY(e);
    const hit = hitTestItem(x, y);
    if (hit) {
      e.preventDefault();
      if (hit.type === 'light') {
        if (selectedRole === hit.role) {
          setSelectedRole(null); setSelectedItemType(null); selectHaptic();
          onLightSelect?.(null); onItemSelect?.(null);
        } else {
          setSelectedRole(hit.role); setSelectedItemType(null); selectHaptic();
          onLightSelect?.(hit.role); onItemSelect?.({ type: 'light', role: hit.role });
        }
      } else {
        if (selectedItemType === hit.type) {
          setSelectedRole(null); setSelectedItemType(null); selectHaptic();
          onItemSelect?.(null);
        } else {
          setSelectedRole(null); setSelectedItemType(hit.type); selectHaptic();
          onItemSelect?.(hit);
        }
      }
    } else {
      setSelectedRole(null); setSelectedItemType(null);
      onItemSelect?.(null);
    }
  }, [selectedRole, selectedItemType, onLightSelect, onItemSelect]);

  const handlePointerMove = useCallback((e) => {
    if (canvasRef.current) {
      const { x, y } = getCanvasXY(e);
      const hit = hitTestItem(x, y);
      canvasRef.current.style.cursor = hit ? 'pointer' : 'default';
    }
  }, []);

  const handleCanvasZoom = useCallback(() => {
    if (canvasRef.current) {
      setZoomSrc(canvasRef.current.toDataURL('image/png'));
    }
  }, []);

  if (!spec) return null;

  const lights = spec.lights || [];
  const tc = getThemeColors();

  const inner = (
    <>
      {zoomSrc && <ZoomOverlay src={zoomSrc} alt="Lighting diagram" onClose={() => setZoomSrc(null)} />}
      <div className="diagram-view-toggle" style={inline ? { marginBottom: 4 } : undefined}>
        <button
          className={`diagram-view-btn${view === 'top' ? ' diagram-view-btn--active' : ''}`}
          onClick={() => setView('top')}
          type="button"
        >Top</button>
        <button
          className={`diagram-view-btn${view === 'side' ? ' diagram-view-btn--active' : ''}`}
          onClick={() => setView('side')}
          type="button"
        >Side</button>
        {spaceCheck && (spaceCheck.minCeilingFt || spaceCheck.minWidthFt) && (
          <button
            className={`diagram-view-btn${view === 'space' ? ' diagram-view-btn--active' : ''}`}
            onClick={() => setView('space')}
            type="button"
          >Floor Plan</button>
        )}
        <button
          className={`diagram-print-btn${showBeams ? '' : ' diagram-print-btn--off'}`}
          onClick={() => setShowBeams(b => !b)}
          type="button"
          title={showBeams ? 'Hide beams' : 'Show beams'}
          aria-label={showBeams ? 'Hide beams' : 'Show beams'}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="12,2 2,22 22,22" />
          </svg>
          <span className="diagram-btn-label">Beams</span>
        </button>
        <button
          className={`diagram-print-btn${showAngles ? '' : ' diagram-print-btn--off'}`}
          onClick={() => setShowAngles(a => !a)}
          type="button"
          title={showAngles ? 'Hide angles' : 'Show angles'}
          aria-label={showAngles ? 'Hide angles' : 'Show angles'}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="4,20 4,4 20,20" /><path d="M4 15 A11 11 0 0 1 9.5 20" />
          </svg>
          <span className="diagram-btn-label">Angles</span>
        </button>
        <button
          className="diagram-print-btn"
          onClick={handleCanvasZoom}
          type="button"
          title="Zoom diagram"
          aria-label="Zoom diagram"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
          </svg>
          <span className="diagram-btn-label">Zoom</span>
        </button>
        <button
          className="diagram-print-btn"
          onClick={() => handlePrint(canvasRef.current, spec, title, view)}
          type="button"
          title="Print / Save diagram"
          aria-label="Print diagram"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="6 9 6 2 18 2 18 9"/>
            <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
            <rect x="6" y="14" width="12" height="8"/>
          </svg>
          <span className="diagram-btn-label">Print</span>
        </button>
      </div>
      <div className="diagram-layout">
        <div className="diagram-layout__canvas">
          <canvas
            ref={canvasRef}
            className="diagram-canvas"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
          />
        </div>
        <div className="diagram-layout__sidebar">
          <button
            className="diagram-legend__toggle"
            onClick={() => setLegendOpen(v => !v)}
            type="button"
            aria-expanded={legendOpen}
          >
            <span className="diagram-legend__toggle-label">Legend</span>
            <svg className={`diagram-legend__toggle-chevron${legendOpen ? ' diagram-legend__toggle-chevron--open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {legendOpen && <div className="diagram-legend diagram-legend--detailed">
            {lights.map((l, i) => {
              const modText = SHORT_MOD[l.modifier] || (l.modifier || '').replace(/_/g, ' ');
              const roleName = l.label || l.role.replace(/_/g, ' ');
              const role = l.role.toLowerCase();
              const extra = formatEnginePowerHint(l.power_hint, powerDisplay) || l.ratio_hint || '';
              const isHighlightedLegend = highlightRole && (
                l.role === highlightRole || l.role.startsWith(highlightRole) || highlightRole.startsWith(l.role)
              );
              return (
                <div className={`diagram-legend__row${isHighlightedLegend ? ' diagram-legend__row--highlighted' : ''}`} key={`${l.role}-${i}`}>
                  <span
                    className="diagram-legend__dot"
                    style={{ background: lightColor(l.role, tc.lightColors) }}
                  />
                  <span className="diagram-legend__info">
                    <div className="diagram-legend__header">
                      <span className="diagram-legend__name">{roleName}</span>
                    </div>
                    {ROLE_DESC[role] && (
                      <span className="diagram-legend__role-desc">{ROLE_DESC[role]}</span>
                    )}
                    <div className="diagram-legend__fields">
                      {modText && (
                        <span className="diagram-legend__field">
                          <span className="diagram-legend__field-key">Mod</span>{modText}
                        </span>
                      )}
                      <span className="diagram-legend__field">
                        <span className="diagram-legend__field-key">Pos</span>
                        {showAngles && <>{Math.round(Math.abs(l.angle_deg ?? l.angle ?? 0))}&deg;&nbsp;&middot;&nbsp;</>}
                        {fmtDist(l.distance_m, units)}&nbsp;&middot;&nbsp;
                        {fmtDist(l.height_m || 1.7, units)} high
                      </span>
                      {extra && (
                        <span className="diagram-legend__field">
                          <span className="diagram-legend__field-key">Pwr</span>{extra}
                        </span>
                      )}
                    </div>
                  </span>
                </div>
              );
            })}
          </div>}
          {spaceCheck && (spaceCheck.minCeilingFt || spaceCheck.minWidthFt) && (() => {
            const ceilFail = roomDimensions && parseFloat(roomDimensions.ceilingFt) < parseFloat(spaceCheck.minCeilingFt);
            const wFail = roomDimensions && parseFloat(roomDimensions.widthFt) < parseFloat(spaceCheck.minWidthFt);
            const dFail = roomDimensions && parseFloat(roomDimensions.lengthFt) < parseFloat(spaceCheck.minDepthFt);
            const hasRoom = !!roomDimensions;
            const anyFail = ceilFail || wFail || dFail;
            const allPass = hasRoom && !anyFail;

            const wFt = parseFloat(spaceCheck.minWidthFt) || 0;
            const dFt = parseFloat(spaceCheck.minDepthFt) || 0;
            const hasArea = wFt > 0 && dFt > 0;
            const areaLabel = hasArea
              ? units === 'metric'
                ? `${((wFt * 0.3048) * (dFt * 0.3048)).toFixed(1)} m²`
                : `${Math.round(wFt * dFt)} sq ft`
              : null;

            return (
              <div className={`diagram-space-footer${anyFail ? ' diagram-space-footer--fail' : allPass ? ' diagram-space-footer--pass' : ''}`}>
                <div className="diagram-space-footer__heading">
                  <span className="diagram-space-footer__dot" />
                  <span className="diagram-space-footer__label">Space needed for this setup</span>
                  {anyFail && <span className="diagram-space-footer__warn-badge">⚠ too small</span>}
                  {allPass && <span className="diagram-space-footer__pass-badge">✓ fits</span>}
                </div>
                <div className="diagram-space-footer__rows">
                  {spaceCheck.minCeilingFt && (
                    <div className={`diagram-space-footer__row${hasRoom ? (ceilFail ? ' diagram-space-footer__dim--fail' : ' diagram-space-footer__dim--pass') : ''}`}>
                      <span className="diagram-space-footer__row-label">Ceiling height</span>
                      <span className="diagram-space-footer__row-val">≥ {formatRoomDim(spaceCheck.minCeilingFt, units)}</span>
                    </div>
                  )}
                  {(spaceCheck.minWidthFt || spaceCheck.minDepthFt) && (
                    <div className={`diagram-space-footer__row${hasRoom ? ((wFail || dFail) ? ' diagram-space-footer__dim--fail' : ' diagram-space-footer__dim--pass') : ''}`}>
                      <span className="diagram-space-footer__row-label">Floor space</span>
                      <span className="diagram-space-footer__row-val">
                        {spaceCheck.minWidthFt && formatRoomDim(spaceCheck.minWidthFt, units)}
                        {spaceCheck.minWidthFt && spaceCheck.minDepthFt && ' × '}
                        {spaceCheck.minDepthFt && formatRoomDim(spaceCheck.minDepthFt, units)}
                        {areaLabel && <span className="diagram-space-footer__area"> — {areaLabel}</span>}
                      </span>
                    </div>
                  )}
                </div>
                {spaceCheck?.warnings?.length > 0 && (
                  <div className="diagram-space-footer__warn-hint">⚠ {spaceCheck.warnings[0]}</div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </>
  );

  if (inline) return inner;

  const patternLabel = spec.pattern
    ? spec.pattern.charAt(0).toUpperCase() + spec.pattern.slice(1).replace(/[-_]/g, ' ')
    : null;

  return (
    <div className="result-card">
      <div className="result-card__header">
        <CardIcon name="map" />
        <span>{title || 'Lighting Diagram'}{patternLabel ? ` \u2014 ${patternLabel}` : ''}</span>
      </div>
      {inner}
    </div>
  );
}
