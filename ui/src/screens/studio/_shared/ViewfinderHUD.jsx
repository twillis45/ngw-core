/**
 * ViewfinderHUD — shared grid + cross-mark + AF bracket overlay
 *
 * Renders the camera-viewfinder HUD elements used identically across
 * HomeScreen, ProcessingScreen, and ResultScreen:
 *   - 2 vertical third lines
 *   - 2 horizontal third lines
 *   - 8 rule-of-thirds intersection cross-marks (12px at each intersection)
 *   - 8 AF bracket corner marks (centered 40x40px)
 *
 * Props:
 *   dimmed (boolean, optional) — halves all opacities for processing state
 */

import React from 'react';
import { steel } from '../../../theme/studioMatte';

export default function ViewfinderHUD({ dimmed = false }) {
  const k = dimmed ? 0.5 : 1;          // opacity multiplier
  const grid = steel(0.12 * k);         // third-line colour
  const cross = steel(0.28 * k);        // intersection cross colour
  const af = steel(0.48 * k);           // AF bracket colour

  return (
    <>
      {/* Grid: vertical thirds */}
      <div style={{ position: 'absolute', left: '33.33%', top: 0, width: 0.5, height: '100%', background: grid, zIndex: 2 }} />
      <div style={{ position: 'absolute', left: '66.67%', top: 0, width: 0.5, height: '100%', background: grid, zIndex: 2 }} />
      {/* Grid: horizontal thirds */}
      <div style={{ position: 'absolute', left: 0, top: '33.33%', right: 0, height: 0.5, background: grid, zIndex: 2 }} />
      <div style={{ position: 'absolute', left: 0, top: '66.67%', right: 0, height: 0.5, background: grid, zIndex: 2 }} />

      {/* Rule-of-thirds intersection cross-marks */}
      {/* top-left */}
      <div style={{ position: 'absolute', left: 'calc(33.33% - 6px)', top: '33.33%',            width: 12,  height: 0.5, background: cross, zIndex: 3 }} />
      <div style={{ position: 'absolute', left: '33.33%',            top: 'calc(33.33% - 6px)', width: 0.5, height: 12,  background: cross, zIndex: 3 }} />
      {/* top-right */}
      <div style={{ position: 'absolute', left: 'calc(66.67% - 6px)', top: '33.33%',            width: 12,  height: 0.5, background: cross, zIndex: 3 }} />
      <div style={{ position: 'absolute', left: '66.67%',            top: 'calc(33.33% - 6px)', width: 0.5, height: 12,  background: cross, zIndex: 3 }} />
      {/* bottom-left */}
      <div style={{ position: 'absolute', left: 'calc(33.33% - 6px)', top: '66.67%',            width: 12,  height: 0.5, background: cross, zIndex: 3 }} />
      <div style={{ position: 'absolute', left: '33.33%',            top: 'calc(66.67% - 6px)', width: 0.5, height: 12,  background: cross, zIndex: 3 }} />
      {/* bottom-right */}
      <div style={{ position: 'absolute', left: 'calc(66.67% - 6px)', top: '66.67%',            width: 12,  height: 0.5, background: cross, zIndex: 3 }} />
      <div style={{ position: 'absolute', left: '66.67%',            top: 'calc(66.67% - 6px)', width: 0.5, height: 12,  background: cross, zIndex: 3 }} />

      {/* AF bracket — 40x40px centered */}
      {/* top-left */}
      <div style={{ position: 'absolute', left: 'calc(50% - 20px)', top: 'calc(50% - 20px)', width: 10, height: 1,  background: af, zIndex: 4 }} />
      <div style={{ position: 'absolute', left: 'calc(50% - 20px)', top: 'calc(50% - 20px)', width: 1,  height: 10, background: af, zIndex: 4 }} />
      {/* top-right */}
      <div style={{ position: 'absolute', left: 'calc(50% + 10px)', top: 'calc(50% - 20px)', width: 10, height: 1,  background: af, zIndex: 4 }} />
      <div style={{ position: 'absolute', left: 'calc(50% + 19px)', top: 'calc(50% - 20px)', width: 1,  height: 10, background: af, zIndex: 4 }} />
      {/* bottom-left */}
      <div style={{ position: 'absolute', left: 'calc(50% - 20px)', top: 'calc(50% + 19px)', width: 10, height: 1,  background: af, zIndex: 4 }} />
      <div style={{ position: 'absolute', left: 'calc(50% - 20px)', top: 'calc(50% + 10px)', width: 1,  height: 10, background: af, zIndex: 4 }} />
      {/* bottom-right */}
      <div style={{ position: 'absolute', left: 'calc(50% + 10px)', top: 'calc(50% + 19px)', width: 10, height: 1,  background: af, zIndex: 4 }} />
      <div style={{ position: 'absolute', left: 'calc(50% + 19px)', top: 'calc(50% + 10px)', width: 1,  height: 10, background: af, zIndex: 4 }} />
    </>
  );
}
