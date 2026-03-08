import { useAppState, useDispatch } from '../context/AppContext';
import StickyBottomBar from '../components/StickyBottomBar';

import BestMatchCard from '../cards/BestMatchCard';
import ShootSetupCard from '../cards/ShootSetupCard';
import SpaceCheckCard from '../cards/SpaceCheckCard';
import DiagramCard from '../cards/DiagramCard';
import CameraSettingsCard from '../cards/CameraSettingsCard';
import HowToTestCard from '../cards/HowToTestCard';
import WhatToLookForCard from '../cards/WhatToLookForCard';
import QuickFixesCard from '../cards/QuickFixesCard';
import OtherSetupsCard from '../cards/OtherSetupsCard';

export default function ResultsScreen() {
  const { result, error } = useAppState();
  const dispatch = useDispatch();

  function editSetup() {
    dispatch({ type: 'GO_BACK' });
  }

  function copySetup() {
    if (!result) return;
    const lines = [];
    lines.push(`Best Match: ${result.bestMatch.name}`);
    lines.push(`Reliability: ${result.bestMatch.reliabilityLabel}`);
    lines.push('');
    result.setup.lights.forEach(l => {
      lines.push(`${l.label}: ${l.positionText}, ${l.distanceFt}, ${l.modifier}`);
    });
    if (result.cameraSettings) {
      lines.push('');
      lines.push(`Camera: ${result.cameraSettings.aperture}, ISO ${result.cameraSettings.iso}, ${result.cameraSettings.shutter}, ${result.cameraSettings.wb}`);
    }
    navigator.clipboard.writeText(lines.join('\n')).catch(() => {});
  }

  /* ── Error state ─────── */
  if (error) {
    return (
      <div className="screen">
        <div className="error-box">
          <div className="error-box__msg">{error}</div>
          <button className="btn btn--primary btn--sm" onClick={editSetup}>
            Back to Setup
          </button>
        </div>
      </div>
    );
  }

  /* ── No result yet ───── */
  if (!result) {
    return (
      <div className="screen">
        <p style={{ color: 'var(--text-dim)', textAlign: 'center', marginTop: 40 }}>
          No results yet. Go back and run a recommendation.
        </p>
      </div>
    );
  }

  /* ── Card stack ───────── */
  return (
    <div className="screen">
      {/* 1. Best Match (hero) */}
      <BestMatchCard data={result.bestMatch} />

      {/* 2. Shoot This Setup */}
      <ShootSetupCard lights={result.setup.lights} />

      {/* 3. Space Check */}
      <SpaceCheckCard data={result.spaceCheck} />

      {/* 4. Lighting Diagram */}
      <DiagramCard spec={result.diagram} />

      {/* 5. Camera Settings */}
      <CameraSettingsCard settings={result.cameraSettings} />

      {/* 6. How to Test */}
      <HowToTestCard steps={result.testSteps} />

      {/* 7. What to Look For */}
      <WhatToLookForCard goodSigns={result.goodSigns} warnings={result.warnings} />

      {/* 8. Quick Fixes */}
      <QuickFixesCard fixes={result.quickFixes} />

      {/* 9. Other Setups */}
      <OtherSetupsCard alternatives={result.alternatives} />

      {/* Sticky bottom actions */}
      <StickyBottomBar>
        <button className="btn btn--secondary" onClick={editSetup}>
          Edit Setup
        </button>
        <button className="btn btn--ghost" onClick={copySetup}>
          Share {'\u{1F4CB}'}
        </button>
      </StickyBottomBar>
    </div>
  );
}
