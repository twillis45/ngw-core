/**
 * BuildWizardScreen — Studio Matte design
 * "Build from Scratch" multi-step wizard for creating custom lighting setups.
 *
 * Three consolidated steps:
 *   1. The Shot — mood, subject, skin tone, style reference
 *   2. The Space — environment, ceiling, gear question
 *   3. Gear Entry — light/modifier/support selection
 *
 * Self-contained state — no AppContext dependency. Calls onComplete(payload)
 * when the wizard finishes, or onBack() to exit.
 *
 * Studio Matte tokens throughout — no CSS variables from the old system.
 */
import { useState, useCallback, useMemo, useEffect } from 'react';
import { tapHaptic, navHaptic, warnHaptic } from '../../../utils/haptics';
import { softClickSound, navSlideSound, segmentPressSound } from '../../../utils/sounds';
import { useIsDesktop } from '../../../utils/useIsDesktop';
import { steel, accent, C, FONT_SMOOTH, PANEL_SHADOW, PANEL_BEVEL,
         CTA_BG, CTA_SHADOW, CTA_BEVEL, SCREEN_BG, KEY_ACCENT } from '../../../theme/studioMatte';
import MatteBackground from '../_shared/MatteBackground';
const STEP_NAMES = ['The Shot', 'The Space', 'Your Gear'];

// ─── Data ────────────────────────────────────────────────────────────────────
const MOODS = [
  { value: 'beauty',    label: 'Beauty',    icon: '✦',  desc: 'Clean, even, shadow-free' },
  { value: 'cinematic', label: 'Cinematic',  icon: '◐',  desc: 'Directional, high contrast' },
  { value: 'corporate', label: 'Corporate',  icon: '▣',  desc: 'Controlled softness' },
  { value: 'editorial', label: 'Editorial',  icon: '◈',  desc: 'Stylized highlights' },
  { value: 'natural',   label: 'Natural',    icon: '◎',  desc: 'Soft, window-driven' },
  { value: 'high_key',  label: 'High Key',   icon: '☼',  desc: 'Bright, minimal shadow' },
  { value: 'low_key',   label: 'Low Key',    icon: '◑',  desc: 'Deep shadow, selective reveal' },
];

const SUBJECTS = [
  { value: 'headshot',    label: 'Headshot',    hint: 'Tight control' },
  { value: 'half_body',   label: 'Half Body',   hint: 'Mid-range' },
  { value: 'full_body',   label: 'Full Body',   hint: 'Wide spread' },
  { value: 'couple',      label: 'Couple',      hint: 'Dual position' },
  { value: 'small_group', label: 'Small Group', hint: 'Even spread' },
  { value: 'product',     label: 'Product',     hint: 'Controlled' },
  { value: 'food',        label: 'Food',        hint: 'Textured light' },
  { value: 'interior',    label: 'Interior',    hint: 'Ambient balance' },
];

const SKIN_TONES = [
  { value: 'light',  label: 'Light',  color: '#FDDBB4' },
  { value: 'medium', label: 'Medium', color: '#C68642' },
  { value: 'dark',   label: 'Dark',   color: '#8D5524' },
  { value: 'mixed',  label: 'Mixed',  color: null },
];

const STYLE_REFS = [
  { id: null,          label: 'Default',    desc: 'Standard NGW' },
  { id: 'hurley',      label: 'Hurley',     desc: 'Clean commercial' },
  { id: 'adler',       label: 'Adler',      desc: 'Fashion/beauty sculpting' },
  { id: 'heisler',     label: 'Heisler',    desc: 'Narrative portrait' },
  { id: 'bryce',       label: 'Bryce',      desc: 'Soft feminine' },
  { id: 'caravaggio',  label: 'Caravaggio', desc: 'Dramatic chiaroscuro' },
  { id: 'penn',        label: 'Penn',       desc: 'Hard light minimalism' },
  { id: 'karsh',       label: 'Karsh',      desc: 'Heroic portraiture' },
  { id: 'leibovitz',   label: 'Leibovitz',  desc: 'Complex editorial' },
];

const ENV_CONTROLLED = [
  { value: 'studio_small',  label: 'Small Studio' },
  { value: 'home_studio',   label: 'Home Studio' },
  { value: 'studio_medium', label: 'Medium Studio' },
  { value: 'studio_large',  label: 'Large Studio' },
];

const ENV_LOCATION = [
  { value: 'on_location_indoor',  label: 'Indoor Location' },
  { value: 'on_location_outdoor', label: 'Outdoor Location' },
  { value: 'event',               label: 'Event' },
];

// Only truly outdoor/event locations skip ceiling height — indoor locations
// (ballrooms, hotel rooms, offices) absolutely have ceiling constraints.
const NO_CEILING = ['on_location_outdoor', 'event'];

const CEILING_OPTIONS = [
  { value: 'under_8',  label: 'Under 8 ft' },
  { value: '8_9',      label: '8–9 ft' },
  { value: '10_12',    label: '10–12 ft' },
  { value: '12_plus',  label: '12+ ft' },
];

const GEAR_QUESTION = [
  { value: 'my_gear',    label: 'Use My Gear',         desc: 'Adapted to what you own', icon: '⚙' },
  { value: 'best_setup', label: 'Best Possible Setup',  desc: 'Show me the ideal rig',   icon: '★' },
];

// Light categories for gear entry
const LIGHT_TYPES = [
  { value: 'strobe_mono',   label: 'Monolight Strobe' },
  { value: 'strobe_pack',   label: 'Pack & Head Strobe' },
  { value: 'speedlight',    label: 'Speedlight / Flash' },
  { value: 'led_panel',     label: 'LED Panel' },
  { value: 'led_tube',      label: 'LED Tube' },
  { value: 'continuous_hmi',label: 'HMI / Continuous' },
  { value: 'ring_light',    label: 'Ring Light' },
  { value: 'natural_only',  label: 'Natural Light Only' },
];

const MODIFIER_TYPES = [
  { value: 'softbox',      label: 'Softbox' },
  { value: 'beauty_dish',  label: 'Beauty Dish' },
  { value: 'umbrella',     label: 'Umbrella' },
  { value: 'stripbox',     label: 'Strip Box' },
  { value: 'grid_spot',    label: 'Grid / Spot' },
  { value: 'snoot',        label: 'Snoot' },
  { value: 'barn_doors',   label: 'Barn Doors' },
  { value: 'reflector',    label: 'Reflector' },
  { value: 'diffusion',    label: 'Diffusion Panel' },
  { value: 'scrim',        label: 'Scrim / Flag' },
];

// ─── Shared Components ──────────────────────────────────────────────────────

/** Standard Studio Matte primary CTA — matches SetupScreen "Build This Light". */
function CTA({ label, disabled, onClick, isDesktop }) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onClick={() => { if (!disabled) onClick?.(); }}
      disabled={disabled}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      style={{
        width: '100%',
        height: isDesktop ? 56 : 50, borderRadius: isDesktop ? 28 : 24,
        border: 'none',
        background: disabled ? steel(0.08) : CTA_BG,
        boxShadow: disabled
          ? 'none'
          : pressed
            ? 'inset 0px 2px 4px rgba(0,0,0,0.5)'
            : `${CTA_SHADOW}, ${CTA_BEVEL}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transform: pressed && !disabled ? 'scale(0.98)' : 'scale(1)',
        transition: 'transform 0.1s ease, box-shadow 0.1s ease',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span style={{
        fontSize: isDesktop ? 14 : 13, fontWeight: 700,
        color: disabled ? steel(0.3) : 'rgba(245,247,250,0.92)',
        letterSpacing: '1.5px', textTransform: 'uppercase',
        pointerEvents: 'none', ...FONT_SMOOTH,
      }}>
        {label}
      </span>
    </button>
  );
}

function WizardProgress({ step, total }) {
  return (
    <div style={{
      display: 'flex', gap: 6,
      position: 'relative', zIndex: 2,
    }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{
          flex: 1, height: 3, borderRadius: 2,
          background: i <= step
            ? `linear-gradient(90deg, ${KEY_ACCENT}, ${accent(0.6)})`
            : steel(0.10),
          transition: 'background 0.3s ease',
        }} />
      ))}
    </div>
  );
}

function SectionLabel({ children }) {
  const isDesktop = useIsDesktop();
  return (
    <p style={{
      margin: '0 0 10px', fontSize: isDesktop ? 11 : 10, fontWeight: 600,
      color: steel(0.55), letterSpacing: '1.2px',
      textTransform: 'uppercase', ...FONT_SMOOTH,
    }}>
      {children}
    </p>
  );
}

function OptionChip({ label, hint, selected, onClick, icon }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={() => { tapHaptic(); segmentPressSound(); onClick(); }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: hint ? '10px 14px' : '10px 14px',
        minHeight: 44,
        borderRadius: 10,
        border: `1px solid ${selected ? KEY_ACCENT : steel(hover ? 0.15 : 0.10)}`,
        background: selected
          ? accent(0.12)
          : hover ? steel(0.06) : steel(0.03),
        cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
        justifyContent: 'center',
        transition: 'all 0.15s ease',
        WebkitTapHighlightColor: 'transparent',
        ...FONT_SMOOTH,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {icon && <span style={{ fontSize: 13, opacity: selected ? 1 : 0.5, ...FONT_SMOOTH }}>{icon}</span>}
        <span style={{
          fontSize: 13, fontWeight: 600,
          color: selected ? KEY_ACCENT : C.textSub,
          ...FONT_SMOOTH,
        }}>
          {label}
        </span>
      </div>
      {hint && (
        <span style={{ fontSize: 10, color: steel(0.4), fontWeight: 400, ...FONT_SMOOTH }}>{hint}</span>
      )}
    </button>
  );
}

function IntentCard({ icon, label, desc, onClick, disabled }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={() => { if (!disabled) { tapHaptic(); softClickSound(); onClick?.(); } }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: '100%', padding: '16px 18px',
        borderRadius: 14,
        border: `1px solid ${steel(disabled ? 0.06 : hover ? 0.18 : 0.12)}`,
        background: disabled
          ? steel(0.02)
          : hover ? steel(0.08) : `linear-gradient(135deg, ${steel(0.06)}, ${steel(0.03)})`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        display: 'flex', alignItems: 'center', gap: 14,
        textAlign: 'left',
        transition: 'all 0.15s ease',
        boxShadow: disabled ? 'none' : `${PANEL_SHADOW}, ${PANEL_BEVEL}`,
        WebkitTapHighlightColor: 'transparent',
        ...FONT_SMOOTH,
      }}
    >
      <span style={{
        fontSize: 22, width: 40, height: 40, borderRadius: 10,
        background: steel(0.06), border: `1px solid ${steel(0.10)}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, ...FONT_SMOOTH,
      }}>
        {icon}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.textPrimary, marginBottom: 2, ...FONT_SMOOTH }}>{label}</div>
        <div style={{ fontSize: 11, color: steel(0.45), fontWeight: 400, ...FONT_SMOOTH }}>{desc}</div>
      </div>
      <span style={{ fontSize: 16, color: steel(0.3), ...FONT_SMOOTH }}>›</span>
    </button>
  );
}

function SkinToneChip({ tone, selected, onClick }) {
  const [hover, setHover] = useState(false);
  const isMixed = tone.value === 'mixed';
  return (
    <button
      onClick={() => { tapHaptic(); segmentPressSound(); onClick(); }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 12px', borderRadius: 8,
        border: `1px solid ${selected ? KEY_ACCENT : steel(hover ? 0.15 : 0.08)}`,
        background: selected ? accent(0.10) : 'transparent',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        WebkitTapHighlightColor: 'transparent',
        ...FONT_SMOOTH,
      }}
    >
      <span style={{
        width: 16, height: 16, borderRadius: '50%',
        background: isMixed
          ? 'linear-gradient(135deg, #FDDBB4 33%, #C68642 66%, #8D5524 100%)'
          : tone.color,
        border: `1px solid ${steel(0.15)}`,
        flexShrink: 0,
      }} />
      <span style={{ fontSize: 12, color: selected ? KEY_ACCENT : steel(0.55), fontWeight: 500, ...FONT_SMOOTH }}>
        {tone.label}
      </span>
    </button>
  );
}

// ─── Step 1: The Shot ───────────────────────────────────────────────────────
function StepTheShot({ state, onChange }) {
  const { mood, subject, skinTone, styleRef } = state;
  const [styleOpen, setStyleOpen] = useState(!!styleRef);
  const isDesktop = useIsDesktop();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Mood */}
      <div>
        <SectionLabel>Look / Mood</SectionLabel>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isDesktop ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)',
          gap: 8,
        }}>
          {MOODS.map(m => (
            <OptionChip
              key={m.value}
              label={m.label}
              hint={m.desc}
              icon={m.icon}
              selected={mood === m.value}
              onClick={() => onChange({ mood: m.value })}
            />
          ))}
        </div>
      </div>

      {/* Subject */}
      <div>
        <SectionLabel>Subject</SectionLabel>
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 8,
        }}>
          {SUBJECTS.map(s => (
            <OptionChip
              key={s.value}
              label={s.label}
              hint={s.hint}
              selected={subject === s.value}
              onClick={() => onChange({ subject: s.value })}
            />
          ))}
        </div>
      </div>

      {/* Skin Tone */}
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
          <SectionLabel>Skin Tone</SectionLabel>
          <span style={{ fontSize: 10, color: steel(0.3), fontWeight: 400, ...FONT_SMOOTH }}>optional</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {SKIN_TONES.map(t => (
            <SkinToneChip
              key={t.value}
              tone={t}
              selected={skinTone === t.value}
              onClick={() => onChange({ skinTone: skinTone === t.value ? null : t.value })}
            />
          ))}
        </div>
      </div>

      {/* Style Reference (collapsed) */}
      <div>
        <button
          onClick={() => { tapHaptic(); setStyleOpen(o => !o); }}
          style={{
            width: '100%', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 0', border: 'none', background: 'none',
            cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            ...FONT_SMOOTH,
          }}
        >
          <span style={{ fontSize: 10, fontWeight: 600, color: steel(0.55), letterSpacing: '1.2px', textTransform: 'uppercase', ...FONT_SMOOTH }}>
            STYLE REFERENCE
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: steel(0.35) }}>
              {styleRef ? STYLE_REFS.find(r => r.id === styleRef)?.label || 'Custom' : 'optional'}
            </span>
            <span style={{
              fontSize: 10, color: steel(0.3),
              transform: styleOpen ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s ease',
            }}>▼</span>
          </span>
        </button>
        {styleOpen && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: isDesktop ? 'repeat(3, 1fr)' : '1fr',
            gap: 6, marginTop: 4,
          }}>
            {STYLE_REFS.map(r => (
              <OptionChip
                key={r.id || 'default'}
                label={r.label}
                hint={r.desc}
                selected={styleRef === r.id}
                onClick={() => onChange({ styleRef: r.id })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Step 2: The Space ──────────────────────────────────────────────────────
function StepTheSpace({ state, onChange, onGearPick }) {
  const { environment, ceiling } = state;
  const isOutdoor = NO_CEILING.includes(environment);
  const envReady = environment && (isOutdoor || ceiling);
  const isDesktop = useIsDesktop();

  // Auto-set ceiling for outdoor
  useEffect(() => {
    if (isOutdoor && ceiling !== '12_plus') {
      onChange({ ceiling: '12_plus' });
    }
  }, [isOutdoor]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Environment */}
      <div>
        <SectionLabel>Controlled Space</SectionLabel>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isDesktop ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)',
          gap: 8, marginBottom: 16,
        }}>
          {ENV_CONTROLLED.map(e => (
            <OptionChip
              key={e.value}
              label={e.label}
              selected={environment === e.value}
              onClick={() => onChange({ environment: e.value })}
            />
          ))}
        </div>

        <SectionLabel>On Location</SectionLabel>
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 8,
        }}>
          {ENV_LOCATION.map(e => (
            <OptionChip
              key={e.value}
              label={e.label}
              selected={environment === e.value}
              onClick={() => onChange({ environment: e.value })}
            />
          ))}
        </div>
      </div>

      {/* Ceiling height (indoor only) */}
      {environment && !isOutdoor && (
        <div>
          <SectionLabel>Ceiling Height</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {CEILING_OPTIONS.map(c => (
              <OptionChip
                key={c.value}
                label={c.label}
                selected={ceiling === c.value}
                onClick={() => onChange({ ceiling: c.value })}
              />
            ))}
          </div>
          <p style={{
            margin: '8px 0 0', fontSize: 11, color: steel(0.35),
            lineHeight: 1.5, ...FONT_SMOOTH,
          }}>
            Low ceilings limit overhead positions and restrict hair lights.
          </p>
        </div>
      )}

      {/* Gear Question */}
      <div style={{ opacity: envReady ? 1 : 0.35, transition: 'opacity 0.2s ease' }}>
        <SectionLabel>Your Gear</SectionLabel>
        <p style={{
          margin: '0 0 12px', fontSize: 11, color: steel(0.4),
          lineHeight: 1.5, ...FONT_SMOOTH,
        }}>
          NGW adapts the blueprint to what you own. "Best Setup" shows the ideal rig.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {GEAR_QUESTION.map(g => (
            <IntentCard
              key={g.value}
              icon={g.icon}
              label={g.label}
              desc={g.desc}
              disabled={!envReady}
              onClick={() => onGearPick(g.value)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Step 3: Gear Entry ─────────────────────────────────────────────────────
function StepGearEntry({ state, onChange }) {
  const { lights, modifiers } = state;
  const isDesktop = useIsDesktop();

  function toggleItem(list, value, field) {
    const current = list || [];
    const next = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value];
    onChange({ [field]: next });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Lights */}
      <div>
        <SectionLabel>Lights You Own</SectionLabel>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isDesktop ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)',
          gap: 8,
        }}>
          {LIGHT_TYPES.map(l => (
            <OptionChip
              key={l.value}
              label={l.label}
              selected={(lights || []).includes(l.value)}
              onClick={() => toggleItem(lights, l.value, 'lights')}
            />
          ))}
        </div>
      </div>

      {/* Modifiers */}
      <div>
        <SectionLabel>Modifiers Available</SectionLabel>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isDesktop ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)',
          gap: 8,
        }}>
          {MODIFIER_TYPES.map(m => (
            <OptionChip
              key={m.value}
              label={m.label}
              selected={(modifiers || []).includes(m.value)}
              onClick={() => toggleItem(modifiers, m.value, 'modifiers')}
            />
          ))}
        </div>
      </div>

      {/* Summary */}
      {(lights?.length > 0 || modifiers?.length > 0) && (
        <div style={{
          padding: '10px 14px', borderRadius: 10,
          background: steel(0.04), border: `1px solid ${steel(0.08)}`,
          ...FONT_SMOOTH,
        }}>
          <span style={{ fontSize: 11, color: steel(0.45) }}>
            {lights?.length || 0} light type{lights?.length !== 1 ? 's' : ''} · {modifiers?.length || 0} modifier{modifiers?.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Main Screen ────────────────────────────────────────────────────────────
export default function BuildWizardScreen({ onComplete, onBack }) {
  const isDesktop = useIsDesktop();
  const [step, setStep] = useState(0);

  // Wizard state
  const [wizState, setWizState] = useState({
    mood: null,
    subject: null,
    skinTone: null,
    styleRef: null,
    environment: null,
    ceiling: null,
    gearMode: null,  // 'my_gear' | 'best_setup'
    lights: [],
    modifiers: [],
  });

  const update = useCallback((patch) => {
    setWizState(prev => ({ ...prev, ...patch }));
  }, []);

  // Step validation
  const canNext = useMemo(() => {
    switch (step) {
      case 0: return !!wizState.mood && !!wizState.subject;
      case 1: return false; // Step 2 advances via gear cards
      case 2: return (wizState.lights?.length > 0) || (wizState.modifiers?.length > 0);
      default: return false;
    }
  }, [step, wizState]);

  function handleNext() {
    if (step === 2) {
      // Final step — submit
      tapHaptic(); softClickSound();
      onComplete?.(buildPayload());
    } else if (step === 0) {
      tapHaptic(); navSlideSound();
      setStep(1);
    }
  }

  function handleBack() {
    if (step === 0) {
      navHaptic(); navSlideSound();
      onBack?.();
    } else {
      navHaptic(); navSlideSound();
      setStep(s => s - 1);
    }
  }

  function handleGearPick(mode) {
    update({ gearMode: mode });
    if (mode === 'best_setup') {
      // Skip gear entry — submit directly
      tapHaptic(); softClickSound();
      onComplete?.(buildPayload({ gearMode: mode }));
    } else {
      // Go to gear entry step
      tapHaptic(); navSlideSound();
      setStep(2);
    }
  }

  function buildPayload(overrides) {
    const s = { ...wizState, ...overrides };
    return {
      mood: s.mood,
      subject: s.subject,
      skinTone: s.skinTone,
      styleRef: s.styleRef,
      environment: s.environment,
      ceiling: s.ceiling,
      gearMode: s.gearMode,
      lights: s.lights,
      modifiers: s.modifiers,
    };
  }

  const stepHeadings = [
    "What's the look?",
    "Where are you shooting?",
    "What do you own?",
  ];

  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      backgroundColor: SCREEN_BG,
      overflow: 'hidden',
    }}>
      <MatteBackground />

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: isDesktop ? '16px 40px 8px' : '16px 22px 8px',
        position: 'relative', zIndex: 2,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button aria-label="Back" onClick={handleBack} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '10px 12px 10px 0', display: 'flex', alignItems: 'center',
            WebkitTapHighlightColor: 'transparent',
            minWidth: 44, minHeight: 44,
          }}>
            <span style={{ fontSize: 22, color: C.textMeta, lineHeight: 1, ...FONT_SMOOTH }}>‹</span>
          </button>
          <p style={{
            margin: 0, fontSize: isDesktop ? 11 : 10, fontWeight: 600,
            color: steel(0.65), letterSpacing: '1.2px', ...FONT_SMOOTH,
          }}>
            BUILD FROM SCRATCH
          </p>
        </div>
        <p style={{
          margin: 0, fontSize: isDesktop ? 13 : 11, fontWeight: 500,
          color: steel(0.4), ...FONT_SMOOTH,
        }}>
          Step {step + 1} of 3
        </p>
      </div>

      {/* ── Progress Bar ── */}
      <div style={{ padding: isDesktop ? '0 40px 12px' : '0 22px 12px', position: 'relative', zIndex: 2 }}>
        <WizardProgress step={step} total={3} />
      </div>

      {/* ── Step Heading ── */}
      <div style={{
        padding: isDesktop ? '0 40px 16px' : '0 22px 16px',
        position: 'relative', zIndex: 2,
      }}>
        <h2 style={{
          margin: 0, fontSize: isDesktop ? 24 : 20, fontWeight: 700,
          color: C.textPrimary, letterSpacing: '-0.3px',
          ...FONT_SMOOTH,
        }}>
          {stepHeadings[step]}
        </h2>
      </div>

      {/* ── Step Content ── */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: isDesktop ? '0 40px 120px' : '0 22px 120px',
        position: 'relative', zIndex: 1,
      }}>
        {step === 0 && <StepTheShot state={wizState} onChange={update} />}
        {step === 1 && <StepTheSpace state={wizState} onChange={update} onGearPick={handleGearPick} />}
        {step === 2 && <StepGearEntry state={wizState} onChange={update} />}
      </div>

      {/* ── Sticky Bottom Bar ── */}
      {(step === 0 || step === 2) && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          padding: isDesktop ? '16px 40px 24px' : '16px 22px 34px',
          background: `linear-gradient(transparent, ${SCREEN_BG}f2 30%)`,
          zIndex: 10,
        }}>
          <CTA
            label={step === 2 ? 'BUILD THIS SETUP →' : 'NEXT →'}
            disabled={!canNext}
            onClick={handleNext}
            isDesktop={isDesktop}
          />
        </div>
      )}
    </div>
  );
}
