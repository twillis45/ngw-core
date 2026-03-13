import { useState, useMemo } from 'react';
import { useAppState, useDispatch } from '../context/AppContext';
import { saveSetup } from '../data/setupStore';
import { isEnabled } from '../modes/featureFlags';
import { buildRefTestSteps, buildRefQuickFixes } from '../transform';

import ZoomOverlay from '../cards/ZoomOverlay';
import ReferenceImageCard from '../cards/ReferenceImageCard';
import RefImageReadCard from '../cards/RefImageReadCard';
import RefLightingCard from '../cards/RefLightingCard';
import RefRecreationCard from '../cards/RefRecreationCard';
import RefInterpretationsCard from '../cards/RefInterpretationsCard';
import BestMatchCard from '../cards/BestMatchCard';
import ShootSetupCard from '../cards/ShootSetupCard';
import DiagramCard from '../cards/DiagramCard';
import SpaceCheckCard from '../cards/SpaceCheckCard';
import CameraSubjectCard from '../cards/CameraSubjectCard';
import HowToTestCard from '../cards/HowToTestCard';
import WhatToLookForCard from '../cards/WhatToLookForCard';
import QuickFixesCard from '../cards/QuickFixesCard';
import OtherSetupsCard from '../cards/OtherSetupsCard';
import SkinToneCard from '../cards/SkinToneCard';
import FeedbackCard from '../cards/FeedbackCard';
import TestShotCard from '../cards/TestShotCard';

function PhaseLabel({ label }) {
  return <div className="section-label" style={{ marginTop: 20, marginBottom: 8 }}>{label}</div>;
}

export default function ResultsScreen() {
  const { result, error } = useAppState();
  const dispatch = useDispatch();
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveTag, setSaveTag] = useState('personal');
  const [saved, setSaved] = useState(false);
  const [zoomSrc, setZoomSrc] = useState(null);

  /* Extract reference analysis layers (if present) */
  const refAnalysis = result?.referenceImageAnalysis?.description?.referenceAnalysis;
  const hasRefAnalysis = refAnalysis?.ok === true;
  const imageRead = hasRefAnalysis ? refAnalysis.image_read : null;
  const lightingRead = hasRefAnalysis ? refAnalysis.lighting_read : null;
  const recreationSetup = hasRefAnalysis ? refAnalysis.recreation_setup : null;

  /* Derive reference-specific test steps and quick fixes */
  const refTestSteps = useMemo(
    () => hasRefAnalysis ? buildRefTestSteps(lightingRead, recreationSetup) : [],
    [hasRefAnalysis, lightingRead, recreationSetup],
  );
  const refQuickFixes = useMemo(
    () => hasRefAnalysis ? buildRefQuickFixes(lightingRead, recreationSetup) : [],
    [hasRefAnalysis, lightingRead, recreationSetup],
  );

  function handleSave() {
    if (!saveName.trim()) return;
    saveSetup({ name: saveName.trim(), tag: saveTag, result });
    setSaveOpen(false);
    setSaveName('');
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  /* -- Error state -- */
  if (error) {
    return (
      <div className="screen">
        <div className="error-box">
          <div className="error-box__msg">{error}</div>
          <button className="btn btn--primary btn--sm" onClick={() => dispatch({ type: 'GO_BACK' })}>
            Back to Setup
          </button>
        </div>
      </div>
    );
  }

  /* -- No result yet -- */
  if (!result) {
    return (
      <div className="screen">
        <p style={{ color: 'var(--text-dim)', textAlign: 'center', marginTop: 40 }}>
          No results yet. Go back and run a recommendation.
        </p>
      </div>
    );
  }

  /* Merge test steps: ref-specific first, then generic */
  const testSteps = refTestSteps.length > 0
    ? refTestSteps
    : result.testSteps;

  /* Merge quick fixes: ref-specific prepended, then generic */
  const quickFixes = refQuickFixes.length > 0
    ? [...refQuickFixes, ...(result.quickFixes || [])]
    : result.quickFixes;

  /* Use detected diagram (from ref analysis) when available, fall back to matched system */
  const detectedDiagramSpec = result.referenceImageAnalysis?.detectedDiagram?.raw;

  /* -- Card stack (photographer workflow order) -- */
  return (
    <div className="screen">
      {/* Save Setup bar */}
      <div className="save-setup-bar">
        {saved ? (
          <span className="save-setup-bar__saved">{'\u2713'} Setup Saved</span>
        ) : (
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => setSaveOpen(!saveOpen)}
            type="button"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
              <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>
            </svg>
            Save Setup
          </button>
        )}
      </div>

      {saveOpen && (
        <div className="save-setup-form">
          <input
            className="save-setup-form__input"
            type="text"
            placeholder="Setup name..."
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            autoFocus
          />
          <div className="save-setup-form__tags">
            <button
              className={`chip${saveTag === 'personal' ? ' chip--selected' : ''}`}
              onClick={() => setSaveTag('personal')}
              type="button"
            >
              Personal
            </button>
            <button
              className={`chip${saveTag === 'studio' ? ' chip--selected' : ''}`}
              onClick={() => setSaveTag('studio')}
              type="button"
            >
              Studio
            </button>
          </div>
          <button
            className="btn btn--primary btn--sm"
            onClick={handleSave}
            disabled={!saveName.trim()}
            style={{ width: '100%' }}
          >
            Save
          </button>
        </div>
      )}

      {/* Reference image */}
      {zoomSrc && <ZoomOverlay src={zoomSrc} alt="Reference photo" onClose={() => setZoomSrc(null)} />}
      {result.referenceImage && (
        <div className="ref-hero">
          <div className="ref-hero__image">
            <img src={result.referenceImage} alt="Reference photo" onClick={() => setZoomSrc(result.referenceImage)} />
          </div>
        </div>
      )}

      {/* Image count badge */}
      {result.referenceImage && (
        <div className="ref-image-count">
          <span className="ref-image-count__badge">1 reference image</span>
        </div>
      )}

      {/* Narrative — directly under image for immediate context */}
      {imageRead?.narrative && (
        <div className="ref-hero__narrative">
          <span className="ref-hero__narrative-label">At a Glance</span>
          <p className="ref-hero__narrative-text">{imageRead.narrative}</p>
          {(imageRead.pose_notes || imageRead.scene_description) && (
            <p className="ref-hero__narrative-action">
              {imageRead.pose_notes || imageRead.scene_description}
            </p>
          )}
        </div>
      )}

      {/* Compact analysis when three-layer cards are NOT available */}
      {result.referenceImage && !hasRefAnalysis && (
        <div className="result-card">
          <ReferenceImageCard
            imageUrl={null}
            analysis={result.referenceImageAnalysis}
            mood={result.mood}
            lightingIntelligence={result.lightingIntelligence}
            compact
          />
        </div>
      )}

      {/* ── Reference Analysis cards (photographer flow: light → scene → recreate) ── */}
      {hasRefAnalysis && (
        <>
          <RefLightingCard lightingRead={lightingRead} />
          {(detectedDiagramSpec || result.diagram) && (
            <DiagramCard spec={detectedDiagramSpec || result.diagram} title="Lighting" />
          )}
          <RefImageReadCard imageRead={imageRead} />
          <RefRecreationCard recreationSetup={recreationSetup} />
          <RefInterpretationsCard lightingRead={lightingRead} recreationSetup={recreationSetup} />
        </>
      )}

      {/* Diagram when no reference analysis */}
      {!hasRefAnalysis && !result.referenceImage && (
        <DiagramCard spec={result.diagram} />
      )}

      {/* ── Mode CTAs ── */}
      <div className="mode-cta-bar">
        <button
          className="mode-cta"
          onClick={() => {
            dispatch({ type: 'SET_APP_MODE', mode: 'shoot' });
            dispatch({ type: 'NAVIGATE', screen: 'shoot_mode' });
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <circle cx="12" cy="12" r="6"/>
            <circle cx="12" cy="12" r="2"/>
          </svg>
          Open in Shoot Mode
        </button>
        {isEnabled('enable_shot_match') && (
          <button
            className="mode-cta mode-cta--secondary"
            onClick={() => {
              dispatch({ type: 'SET_APP_MODE', mode: 'shot_match' });
              dispatch({ type: 'NAVIGATE', screen: 'shot_match' });
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="8" height="18" rx="2"/>
              <rect x="14" y="3" width="8" height="18" rx="2"/>
              <path d="M12 8v8"/>
              <path d="M9 12h6"/>
            </svg>
            Compare My Attempt
          </button>
        )}
      </div>

      <PhaseLabel label="Your Setup" />
      <BestMatchCard data={result.bestMatch} />
      <ShootSetupCard lights={result.setup.lights} />
      <SkinToneCard data={result.skinToneAdjustments} />
      <SpaceCheckCard data={result.spaceCheck} />

      <PhaseLabel label="Camera & Subject" />
      <CameraSubjectCard camera={result.cameraSettings} subject={result.subject} background={result.background} />

      <PhaseLabel label="Test & Troubleshoot" />
      <HowToTestCard steps={testSteps} />
      <TestShotCard
        setupName={result.bestMatch.name}
        refAnalysis={result.referenceImageAnalysis}
      />
      <WhatToLookForCard goodSigns={result.goodSigns} warnings={result.warnings} />
      <QuickFixesCard fixes={quickFixes} />

      <FeedbackCard
        setupId={result.bestMatch.systemId || result.bestMatch.name}
        mood={result.mood}
        pattern={result.bestMatch.lightingPattern}
      />

      <PhaseLabel label="Alternatives" />
      <OtherSetupsCard alternatives={result.alternatives} substitutions={result.substitutions} />
    </div>
  );
}
