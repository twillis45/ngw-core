import { useState, useEffect, useRef } from "react";

/* ─────────────────────────────────────────────
   THEME TOKENS
   ───────────────────────────────────────────── */
const T = {
  bg: "#0E0F12",
  card: "#17191F",
  cardUp: "#1E2129",
  cardHover: "#252830",
  text: "#F4F6F8",
  textSec: "#A9AFBB",
  textDim: "#6B7280",
  border: "#2A2E38",
  accent: "#4DA3FF",
  accentDim: "#4DA3FF33",
  success: "#39D98A",
  successDim: "#39D98A22",
  warn: "#F5B041",
  warnDim: "#F5B04122",
  error: "#FF5D5D",
  errorDim: "#FF5D5D22",
  creative: "#9B7CFF",
  creativeDim: "#9B7CFF22",
  radius: "14px",
  radiusSm: "10px",
  radiusChip: "100px",
  shadow: "0 2px 16px rgba(0,0,0,.35)",
  font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  fontMono: "'SF Mono', 'Cascadia Code', 'Consolas', monospace",
};

const glow = (color) => `0 0 20px ${color}33, 0 0 40px ${color}11`;

/* ─────────────────────────────────────────────
   ICON COMPONENTS (inline SVG, no deps)
   ───────────────────────────────────────────── */
const Icon = ({ d, size = 20, color = T.textSec, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d={d} />
  </svg>
);
const Icons = {
  camera: (p) => <Icon d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" {...p} />,
  flash: (p) => <Icon d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" {...p} />,
  grid: (p) => <Icon d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" {...p} />,
  check: (p) => <Icon d="M20 6L9 17l-5-5" {...p} />,
  chevRight: (p) => <Icon d="M9 18l6-6-6-6" {...p} />,
  chevLeft: (p) => <Icon d="M15 18l-6-6 6-6" {...p} />,
  chevDown: (p) => <Icon d="M6 9l6 6 6-6" {...p} />,
  plus: (p) => <Icon d="M12 5v14M5 12h14" {...p} />,
  minus: (p) => <Icon d="M5 12h14" {...p} />,
  star: (p) => <Icon d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" {...p} />,
  target: (p) => <Icon d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" {...p} />,
  sun: (p) => <Icon d="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" {...p} />,
  eye: (p) => <Icon d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" {...p} />,
  tool: (p) => <Icon d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" {...p} />,
  layout: (p) => <Icon d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM3 9h18M9 21V9" {...p} />,
  alertTriangle: (p) => <Icon d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01" {...p} />,
  zap: (p) => <Icon d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" {...p} />,
  image: (p) => <Icon d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21" {...p} />,
  sliders: (p) => <Icon d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" {...p} />,
};

/* ─────────────────────────────────────────────
   ANIMATION HELPERS
   ───────────────────────────────────────────── */
const fadeUp = {
  opacity: 0,
  transform: "translateY(16px)",
  animation: "fadeUp .45s cubic-bezier(.16,1,.3,1) forwards",
};
const fadeUpStyle = `@keyframes fadeUp{to{opacity:1;transform:translateY(0)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}@keyframes shimmer{to{background-position:200% center}}`;
const stagger = (i) => ({ ...fadeUp, animationDelay: `${i * 0.06}s` });

/* ─────────────────────────────────────────────
   DATA
   ───────────────────────────────────────────── */
const SUBJECT_TYPES = ["Portrait", "Headshot", "Beauty", "Fashion", "Product", "Athletic", "Lifestyle", "Couples", "Group", "Editorial"];
const MOODS = ["Clean & Classic", "Moody & Dramatic", "Soft & Ethereal", "Bold & Edgy", "Warm & Intimate", "High Fashion", "Natural & Available", "Cinematic"];
const ENVIRONMENTS = ["Small Room", "Home Studio", "Medium Studio", "Large Studio", "Outdoor", "Window Light", "Office", "Event Venue", "Garage/Warehouse"];
const CEILING_HEIGHTS = ["Under 8 ft", "8 ft", "9 ft", "10 ft (standard)", "12 ft+", "Outdoors / No ceiling"];
const LIGHTS = ["Speedlight", "AD200", "AD400", "AD600", "B10", "LED Panel", "COB", "LED Tube", "Strobe Pack"];
const MODIFIERS = ["Softbox", "Octa", "Beauty Dish", "Stripbox", "Umbrella", "Grid", "Reflector", "V-Flat", "Snoot", "Scrim"];
const SUPPORT = ["Boom Arm", "C-Stand", "Light Stand", "Background Stand", "Apple Box", "Sandbag"];

/* ─────────────────────────────────────────────
   MOCK RECOMMENDATION ENGINE OUTPUT
   ───────────────────────────────────────────── */
const generateMockResults = (params) => {
  const isFashion = params.subject === "Fashion" || params.subject === "Beauty";
  const isMoody = params.mood?.includes("Moody") || params.mood?.includes("Dramatic") || params.mood?.includes("Cinematic");
  const isSoft = params.mood?.includes("Soft") || params.mood?.includes("Natural");
  const lowCeiling = params.ceiling === "Under 8 ft" || params.ceiling === "8 ft";

  return {
    bestMatch: {
      name: isFashion ? "Butterfly / Paramount" : isMoody ? "Split Light Dramatic" : "Modified Loop",
      reliability: isFashion ? 94 : isMoody ? 87 : 91,
      reliabilityLabel: isFashion ? "Very Reliable" : "Reliable",
      why: isFashion
        ? "Butterfly lighting is the go-to for beauty and fashion work. The overhead key with a beauty dish creates that iconic nose shadow and sculpted cheekbones. Easy to control, fast to set."
        : isMoody
        ? "Split light brings drama without complexity. One light, one side. Perfect for mood-driven work. Add a subtle fill to taste."
        : "Loop lighting is the workhorse of portrait photography. It flatters nearly every face shape and works in tight spaces. The slight angle creates dimension without harsh shadows.",
    },
    lights: [
      {
        role: "Key Light",
        modifier: isFashion ? "Beauty Dish (22\")" : isMoody ? "Stripbox (12×36\")" : lowCeiling ? "Softbox (24×24\")" : "Octa (47\")",
        angle: isFashion ? "Directly above lens axis" : isMoody ? "90° camera left" : "45° camera right, feathered toward camera",
        height: isFashion ? "24\" above forehead, angled down 45°" : isMoody ? "Even with subject face" : "20\" above subject eyes",
        distSubject: isFashion ? "4 ft" : isMoody ? "3 ft" : "5 ft",
        distBg: null,
        purpose: isFashion ? "Punchy fashion key with defined nose shadow" : isMoody ? "Hard side light for dramatic contrast" : "Flattering main light with soft wrap",
        power: "1/4 → adjust to f/8",
      },
      ...(isMoody
        ? []
        : [
            {
              role: "Fill Light",
              modifier: isSoft ? "Umbrella (white, shoot-through)" : "Reflector (silver)",
              angle: isFashion ? "Below lens, clamshell position" : "Opposite key, 30° off axis",
              height: isFashion ? "Waist height, angled up" : "Subject eye level",
              distSubject: isFashion ? "3 ft" : "6 ft",
              distBg: null,
              purpose: isFashion ? "Open up shadows under chin and neck" : "Gentle fill to keep shadow detail",
              power: isSoft ? "1/8" : "Passive reflector",
            },
          ]),
      {
        role: isMoody ? "Accent / Rim" : "Rim Light",
        modifier: "Grid (20°) on Reflector",
        angle: isMoody ? "135° camera right, behind subject" : "135° opposite key, behind subject",
        height: "Shoulder height",
        distSubject: "4 ft",
        distBg: null,
        purpose: "Edge separation from background",
        power: "1/8 → adjust to taste",
      },
    ],
    camera: {
      lens: isFashion ? "85–105mm" : "85mm",
      height: isFashion ? "Slightly above subject eye level" : "At subject eye level",
      angle: isFashion ? "Straight-on or very slight high angle" : isMoody ? "Straight-on" : "Straight-on",
      distance: isFashion ? "8–10 ft" : "8 ft",
      settings: "ISO 100 · 1/200 · f/8",
      wb: "Flash / 5600K",
    },
    subject: {
      distBg: isMoody ? "4–6 ft" : "6–8 ft",
      pose: isFashion ? "Chin slightly up, shoulders square" : isMoody ? "Chin slightly down, eyes to camera" : "Slight chin down, body at 30° to camera",
    },
    background: {
      light: isMoody ? null : { modifier: "Grid spot", distance: "3 ft from background", effect: "Subtle vignette, 1 stop under key" },
    },
    spaceCheck: {
      minCeiling: lowCeiling ? "8 ft (tight — use compact modifier)" : "9 ft",
      recCeiling: "10 ft",
      minWidth: "12 ft",
      subjectToBg: isMoody ? "4–6 ft" : "6–8 ft",
      cameraToSubject: "8–10 ft",
      notes: lowCeiling
        ? "Low ceiling — swap to a smaller softbox or beauty dish. Avoid large octas."
        : "Standard setup. You have room to work.",
    },
    testSteps: [
      "Turn on key light only",
      `Meter key at subject position → target f/8`,
      "Take a test frame — check nose shadow shape",
      "Check catchlights — should be at 1 o'clock position",
      isMoody ? "Skip fill — this is meant to be dark" : "Add fill light — meter fill 2 stops under key",
      "Check face contrast (key-to-fill ratio should be ~3:1)",
      "Add rim light — check for edge separation",
      "Confirm rim isn't blowing out hair or shoulders",
      ...(isMoody ? [] : ["Add background light if using"]),
      "Final full-power test frame",
      "Check histogram — watch right edge for clipping",
    ],
    lookFor: {
      good: [
        "Clean catchlight in both eyes",
        isFashion ? "Butterfly nose shadow (small, centered)" : "Short nose shadow, not touching lip",
        "Defined jawline separation",
        "Balanced rim — visible but not overpowering",
        "Even skin exposure across face",
      ],
      warnings: [
        { sign: "Shadow too long on nose", fix: "Key is too high → lower it" },
        { sign: "Face looks flat", fix: "Fill is too strong → pull it back or reduce power" },
        { sign: "Rim blowing out", fix: "Rim is too close or too hot → move it back or reduce power" },
        { sign: "No background separation", fix: "Subject too close to background → move them forward" },
        { sign: "Hot spot on forehead", fix: "Key too close → feather it or move back 6\"" },
      ],
    },
    quickFixes: [
      { problem: "Face too flat", fix: "Reduce fill power or move fill farther" },
      { problem: "Shadow too harsh", fix: "Move key closer or use larger modifier" },
      { problem: "Rim too bright", fix: "Move rim farther back or add diffusion" },
      { problem: "Background too bright", fix: "Increase subject distance from background" },
      { problem: "Double catchlight", fix: "Reposition fill below lens axis" },
      { problem: "Chin shadow too dark", fix: "Add white reflector below face" },
    ],
    substitutions: [
      {
        ifMissing: isFashion ? "Beauty Dish" : "Octa (47\")",
        use: isFashion ? "Softbox (24×24\") with grid" : "Softbox (36×48\")",
        tradeoff: isFashion
          ? "Loses the signature contrasty-yet-smooth quality. Becomes flatter but still workable."
          : "Rectangular catchlights instead of round. Slightly less wrap on cheekbones.",
      },
      {
        ifMissing: "Grid (20°)",
        use: "Snoot or barn doors",
        tradeoff: "Less even light spread. Snoot gives tighter spot; barn doors give more control over spill.",
      },
      ...(isMoody
        ? []
        : [
            {
              ifMissing: "Reflector (silver)",
              use: "White V-flat or foam core",
              tradeoff: "Softer, more neutral fill. Less punch than silver but more forgiving.",
            },
          ]),
    ],
    alternatives: [
      {
        name: "Rembrandt",
        reliability: 82,
        desc: "More dramatic triangle lighting. Same gear, just move key to 60° and raise slightly.",
      },
      {
        name: "Clamshell",
        reliability: 78,
        desc: "Key above + fill below for beauty work. Very flattering, minimal shadows.",
      },
      {
        name: isMoody ? "Broad Light" : "Short Light",
        reliability: 71,
        desc: isMoody ? "Light the side facing camera for a wider face look." : "Light the short side for more sculpted, slimming result.",
      },
    ],
  };
};

/* ─────────────────────────────────────────────
   UTILITY COMPONENTS
   ───────────────────────────────────────────── */
const Chip = ({ label, selected, onTap, accent = T.accent, dimBg, small }) => (
  <button
    onClick={onTap}
    style={{
      padding: small ? "6px 14px" : "10px 18px",
      borderRadius: T.radiusChip,
      border: `1.5px solid ${selected ? accent : T.border}`,
      background: selected ? (dimBg || accent + "18") : "transparent",
      color: selected ? T.text : T.textSec,
      fontSize: small ? 13 : 14,
      fontWeight: selected ? 600 : 400,
      fontFamily: T.font,
      cursor: "pointer",
      transition: "all .2s",
      whiteSpace: "nowrap",
    }}
  >
    {label}
  </button>
);

const ChipGroup = ({ items, selected, onSelect, accent, multi, small }) => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
    {items.map((item) => (
      <Chip
        key={item}
        label={item}
        selected={multi ? (selected || []).includes(item) : selected === item}
        accent={accent}
        small={small}
        onTap={() => {
          if (multi) {
            const arr = selected || [];
            onSelect(arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item]);
          } else {
            onSelect(item);
          }
        }}
      />
    ))}
  </div>
);

const QuantityStepper = ({ label, count, onChange }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: "8px 14px",
      borderRadius: T.radiusSm,
      background: count > 0 ? T.accentDim : "transparent",
      border: `1.5px solid ${count > 0 ? T.accent : T.border}`,
      transition: "all .2s",
    }}
  >
    <span style={{ flex: 1, color: count > 0 ? T.text : T.textSec, fontSize: 14, fontWeight: count > 0 ? 600 : 400 }}>{label}</span>
    <button onClick={() => onChange(Math.max(0, count - 1))} style={{ ...btnCircle, opacity: count === 0 ? 0.3 : 1 }}>
      {Icons.minus({ size: 14, color: T.text })}
    </button>
    <span style={{ minWidth: 20, textAlign: "center", color: T.text, fontSize: 15, fontWeight: 600, fontFamily: T.fontMono }}>{count}</span>
    <button onClick={() => onChange(count + 1)} style={btnCircle}>
      {Icons.plus({ size: 14, color: T.text })}
    </button>
  </div>
);

const btnCircle = {
  width: 30,
  height: 30,
  borderRadius: "50%",
  border: `1px solid ${T.border}`,
  background: T.cardUp,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  padding: 0,
};

const Card = ({ children, style, delay = 0 }) => (
  <div
    style={{
      background: T.card,
      borderRadius: T.radius,
      border: `1px solid ${T.border}`,
      padding: 20,
      ...stagger(delay),
      ...style,
    }}
  >
    {children}
  </div>
);

const CardHeader = ({ icon, title, subtitle, accent = T.accent, tag }) => (
  <div style={{ marginBottom: 16 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: subtitle ? 6 : 0 }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: accent + "18", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {icon}
      </div>
      <h3 style={{ margin: 0, color: T.text, fontSize: 17, fontWeight: 700, flex: 1 }}>{title}</h3>
      {tag && (
        <span
          style={{
            padding: "3px 10px",
            borderRadius: T.radiusChip,
            background: accent + "18",
            color: accent,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: ".02em",
          }}
        >
          {tag}
        </span>
      )}
    </div>
    {subtitle && <p style={{ margin: 0, color: T.textSec, fontSize: 14, lineHeight: 1.5, paddingLeft: 42 }}>{subtitle}</p>}
  </div>
);

const SectionLabel = ({ children }) => (
  <p style={{ margin: "0 0 10px", color: T.textDim, fontSize: 12, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase" }}>{children}</p>
);

const Btn = ({ children, onClick, primary, accent = T.accent, style: sx, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      padding: "14px 24px",
      borderRadius: T.radiusSm,
      border: primary ? "none" : `1.5px solid ${T.border}`,
      background: primary ? accent : "transparent",
      color: primary ? "#000" : T.text,
      fontSize: 15,
      fontWeight: 700,
      fontFamily: T.font,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.4 : 1,
      transition: "all .2s",
      ...sx,
    }}
  >
    {children}
  </button>
);

const reliabilityColor = (score) => (score >= 90 ? T.success : score >= 75 ? T.accent : score >= 60 ? T.warn : T.error);
const reliabilityLabel = (score) => (score >= 90 ? "Very Reliable" : score >= 75 ? "Reliable" : score >= 60 ? "Good Option" : score >= 40 ? "Experimental" : "Not Ideal");

const ProgressDots = ({ total, current }) => (
  <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 24 }}>
    {Array.from({ length: total }).map((_, i) => (
      <div
        key={i}
        style={{
          width: i === current ? 24 : 8,
          height: 8,
          borderRadius: 4,
          background: i === current ? T.accent : i < current ? T.accent + "66" : T.border,
          transition: "all .3s",
        }}
      />
    ))}
  </div>
);

/* ─────────────────────────────────────────────
   TOP-DOWN DIAGRAM (SVG)
   ───────────────────────────────────────────── */
const SetupDiagram = ({ lights, camera, subject }) => {
  const W = 320, H = 380;
  const cx = W / 2, subY = H * 0.45;
  const camY = H * 0.82;

  const lightPositions = lights.map((l, i) => {
    const isKey = l.role.includes("Key");
    const isFill = l.role.includes("Fill");
    const isRim = l.role.includes("Rim") || l.role.includes("Accent");
    const isBg = l.role.includes("Background");
    if (isKey) return { x: cx + 70, y: subY - 60, label: "Key", light: l };
    if (isFill) return { x: cx - 70, y: subY + 10, label: "Fill", light: l };
    if (isRim) return { x: cx - 50, y: subY - 80, label: "Rim", light: l };
    if (isBg) return { x: cx, y: 40, label: "BG", light: l };
    return { x: cx + 50 * (i - 1), y: subY - 60, label: l.role, light: l };
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 360, display: "block", margin: "0 auto" }}>
      <defs>
        <radialGradient id="lglow" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor={T.accent} stopOpacity=".15" /><stop offset="100%" stopColor={T.accent} stopOpacity="0" /></radialGradient>
      </defs>
      {/* Background zone */}
      <rect x={cx - 80} y={16} width={160} height={10} rx={3} fill={T.border} />
      <text x={cx} y={12} textAnchor="middle" fill={T.textDim} fontSize="10" fontFamily={T.font}>BACKGROUND</text>

      {/* Subject */}
      <circle cx={cx} cy={subY} r={16} fill={T.cardUp} stroke={T.accent} strokeWidth={2} />
      <text x={cx} y={subY + 4} textAnchor="middle" fill={T.text} fontSize="9" fontWeight="700" fontFamily={T.font}>SUBJ</text>

      {/* Camera */}
      <rect x={cx - 14} y={camY - 10} width={28} height={20} rx={4} fill={T.cardUp} stroke={T.textSec} strokeWidth={1.5} />
      <circle cx={cx} cy={camY} r={5} fill={T.border} stroke={T.textSec} strokeWidth={1} />
      <text x={cx} y={camY + 28} textAnchor="middle" fill={T.textDim} fontSize="9" fontFamily={T.font}>CAMERA</text>

      {/* Lights */}
      {lightPositions.map((lp, i) => (
        <g key={i}>
          <circle cx={lp.x} cy={lp.y} r={30} fill="url(#lglow)" />
          <line x1={lp.x} y1={lp.y} x2={cx} y2={subY} stroke={T.accent} strokeWidth={0.8} strokeDasharray="4 3" opacity={0.4} />
          <rect x={lp.x - 12} y={lp.y - 12} width={24} height={24} rx={5} fill={T.card} stroke={T.accent} strokeWidth={1.5} />
          <text x={lp.x} y={lp.y + 3} textAnchor="middle" fill={T.accent} fontSize="7" fontWeight="700" fontFamily={T.font}>{lp.label.toUpperCase()}</text>
          <text x={lp.x} y={lp.y + 24} textAnchor="middle" fill={T.textDim} fontSize="8" fontFamily={T.font}>{lp.light.distSubject}</text>
        </g>
      ))}

      {/* Distance labels */}
      <line x1={cx + 22} y1={subY} x2={cx + 22} y2={camY - 12} stroke={T.textDim} strokeWidth={0.8} strokeDasharray="3 2" />
      <text x={cx + 30} y={(subY + camY) / 2} fill={T.textDim} fontSize="8" fontFamily={T.fontMono}>{camera.distance}</text>

      <line x1={cx} y1={subY - 18} x2={cx} y2={28} stroke={T.textDim} strokeWidth={0.8} strokeDasharray="3 2" />
      <text x={cx + 8} y={(subY + 28) / 2 - 4} fill={T.textDim} fontSize="8" fontFamily={T.fontMono}>{subject.distBg}</text>
    </svg>
  );
};

/* ─────────────────────────────────────────────
   RESULT CARDS
   ───────────────────────────────────────────── */
const BestMatchCard = ({ data, delay }) => {
  const color = reliabilityColor(data.reliability);
  return (
    <Card delay={delay} style={{ borderColor: color + "44", boxShadow: glow(color) }}>
      <CardHeader icon={Icons.star({ size: 18, color })} title="Best Match" accent={color} tag={reliabilityLabel(data.reliability)} />
      <h2 style={{ margin: "0 0 8px", color: T.text, fontSize: 24, fontWeight: 800 }}>{data.name}</h2>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <div style={{ flex: 1, height: 4, borderRadius: 2, background: T.border }}>
          <div style={{ width: `${data.reliability}%`, height: "100%", borderRadius: 2, background: color, transition: "width 1s ease" }} />
        </div>
        <span style={{ color, fontSize: 13, fontWeight: 700, fontFamily: T.fontMono }}>{data.reliability}%</span>
      </div>
      <div style={{ background: color + "0D", borderRadius: T.radiusSm, padding: 14, border: `1px solid ${color}22` }}>
        <SectionLabel>Why This Works</SectionLabel>
        <p style={{ margin: 0, color: T.textSec, fontSize: 14, lineHeight: 1.6 }}>{data.why}</p>
      </div>
    </Card>
  );
};

const LightCard = ({ light, index, delay }) => (
  <div style={{ ...stagger(delay), padding: 16, background: T.cardUp, borderRadius: T.radiusSm, border: `1px solid ${T.border}` }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <div style={{ width: 28, height: 28, borderRadius: 6, background: T.accentDim, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {Icons.flash({ size: 14, color: T.accent })}
      </div>
      <span style={{ color: T.accent, fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>{light.role}</span>
      {light.power && <span style={{ marginLeft: "auto", color: T.textDim, fontSize: 12, fontFamily: T.fontMono }}>{light.power}</span>}
    </div>
    {[
      ["Modifier", light.modifier],
      ["Angle", light.angle],
      ["Height", light.height],
      ["Distance", light.distSubject],
      ["Purpose", light.purpose],
    ]
      .filter(([, v]) => v)
      .map(([k, v]) => (
        <div key={k} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
          <span style={{ color: T.textDim, fontSize: 13, minWidth: 70, flexShrink: 0 }}>{k}</span>
          <span style={{ color: T.text, fontSize: 13, lineHeight: 1.5 }}>{v}</span>
        </div>
      ))}
  </div>
);

const ShootSetupCard = ({ lights, delay }) => (
  <Card delay={delay}>
    <CardHeader icon={Icons.flash({ size: 18, color: T.accent })} title="Shoot This Setup" subtitle={`${lights.length} light${lights.length > 1 ? "s" : ""}`} />
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {lights.map((l, i) => (
        <LightCard key={i} light={l} index={i} delay={delay + i + 1} />
      ))}
    </div>
  </Card>
);

const CameraCard = ({ camera, subject, bg, delay }) => (
  <Card delay={delay}>
    <CardHeader icon={Icons.camera({ size: 18, color: T.creative })} title="Camera & Subject" accent={T.creative} />
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      {[
        ["Lens", camera.lens],
        ["Height", camera.height],
        ["Angle", camera.angle],
        ["Distance", camera.distance],
        ["Settings", camera.settings],
        ["White Bal", camera.wb],
      ].map(([k, v]) => (
        <div key={k} style={{ padding: 10, background: T.cardUp, borderRadius: T.radiusSm }}>
          <div style={{ color: T.textDim, fontSize: 11, marginBottom: 3, textTransform: "uppercase", letterSpacing: ".06em" }}>{k}</div>
          <div style={{ color: T.text, fontSize: 13, fontWeight: 600 }}>{v}</div>
        </div>
      ))}
    </div>
    <div style={{ marginTop: 14 }}>
      <SectionLabel>Subject</SectionLabel>
      <p style={{ margin: "0 0 4px", color: T.textSec, fontSize: 13 }}>
        <strong style={{ color: T.text }}>Distance from BG:</strong> {subject.distBg}
      </p>
      {subject.pose && (
        <p style={{ margin: 0, color: T.textSec, fontSize: 13 }}>
          <strong style={{ color: T.text }}>Pose:</strong> {subject.pose}
        </p>
      )}
    </div>
    {bg?.light && (
      <div style={{ marginTop: 14 }}>
        <SectionLabel>Background Light</SectionLabel>
        <p style={{ margin: 0, color: T.textSec, fontSize: 13 }}>
          {bg.light.modifier} · {bg.light.distance} · {bg.light.effect}
        </p>
      </div>
    )}
  </Card>
);

const SpaceCheckCard = ({ data, delay }) => {
  const tight = data.notes?.includes("tight") || data.notes?.includes("Low");
  return (
    <Card delay={delay}>
      <CardHeader
        icon={Icons.layout({ size: 18, color: tight ? T.warn : T.success })}
        title="Space Check"
        accent={tight ? T.warn : T.success}
        tag={tight ? "Tight Fit" : "Good to Go"}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {[
          ["Min Ceiling", data.minCeiling],
          ["Recommended", data.recCeiling],
          ["Min Width", data.minWidth],
          ["Subject → BG", data.subjectToBg],
          ["Camera → Subject", data.cameraToSubject],
        ].map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: T.cardUp, borderRadius: T.radiusSm }}>
            <span style={{ color: T.textSec, fontSize: 13 }}>{k}</span>
            <span style={{ color: T.text, fontSize: 13, fontWeight: 600, fontFamily: T.fontMono }}>{v}</span>
          </div>
        ))}
      </div>
      {data.notes && (
        <div style={{ marginTop: 12, padding: 12, background: tight ? T.warnDim : T.successDim, borderRadius: T.radiusSm, border: `1px solid ${tight ? T.warn : T.success}22` }}>
          <p style={{ margin: 0, color: tight ? T.warn : T.success, fontSize: 13 }}>
            {tight ? "⚠ " : "✓ "}
            {data.notes}
          </p>
        </div>
      )}
    </Card>
  );
};

const DiagramCard = ({ lights, camera, subject, delay }) => (
  <Card delay={delay}>
    <CardHeader icon={Icons.target({ size: 18, color: T.accent })} title="Setup Diagram" subtitle="Top-down view · distances labeled" />
    <SetupDiagram lights={lights} camera={camera} subject={subject} />
  </Card>
);

const TestStepsCard = ({ steps, delay }) => {
  const [checked, setChecked] = useState([]);
  return (
    <Card delay={delay}>
      <CardHeader icon={Icons.check({ size: 18, color: T.success })} title="How to Test This Setup" accent={T.success} tag={`${checked.length}/${steps.length}`} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {steps.map((step, i) => {
          const done = checked.includes(i);
          return (
            <button
              key={i}
              onClick={() => setChecked(done ? checked.filter((x) => x !== i) : [...checked, i])}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "10px 12px",
                background: done ? T.successDim : T.cardUp,
                borderRadius: T.radiusSm,
                border: `1px solid ${done ? T.success + "33" : T.border}`,
                cursor: "pointer",
                textAlign: "left",
                fontFamily: T.font,
                transition: "all .2s",
              }}
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  border: `2px solid ${done ? T.success : T.border}`,
                  background: done ? T.success : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginTop: 1,
                  transition: "all .2s",
                }}
              >
                {done && Icons.check({ size: 13, color: "#000" })}
              </div>
              <span style={{ color: done ? T.success : T.textSec, fontSize: 14, lineHeight: 1.5, textDecoration: done ? "line-through" : "none", transition: "all .2s" }}>
                <span style={{ color: T.textDim, fontFamily: T.fontMono, fontSize: 12, marginRight: 6 }}>{i + 1}.</span>
                {step}
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
};

const LookForCard = ({ data, delay }) => (
  <Card delay={delay}>
    <CardHeader icon={Icons.eye({ size: 18, color: T.accent })} title="What to Look For" />
    <SectionLabel>Good Signs</SectionLabel>
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
      {data.good.map((g, i) => (
        <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <span style={{ color: T.success, fontSize: 14, marginTop: 2 }}>✓</span>
          <span style={{ color: T.textSec, fontSize: 14, lineHeight: 1.5 }}>{g}</span>
        </div>
      ))}
    </div>
    <SectionLabel>Warnings</SectionLabel>
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {data.warnings.map((w, i) => (
        <div key={i} style={{ padding: 10, background: T.warnDim, borderRadius: T.radiusSm, border: `1px solid ${T.warn}15` }}>
          <div style={{ color: T.warn, fontSize: 13, fontWeight: 600, marginBottom: 3 }}>⚠ {w.sign}</div>
          <div style={{ color: T.textSec, fontSize: 13 }}>→ {w.fix}</div>
        </div>
      ))}
    </div>
  </Card>
);

const QuickFixesCard = ({ fixes, delay }) => (
  <Card delay={delay}>
    <CardHeader icon={Icons.tool({ size: 18, color: T.warn })} title="Quick Fixes" accent={T.warn} />
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {fixes.map((f, i) => (
        <div key={i} style={{ display: "flex", gap: 12, padding: 10, background: T.cardUp, borderRadius: T.radiusSm }}>
          <span style={{ color: T.error, fontSize: 13, fontWeight: 600, minWidth: 120, flexShrink: 0 }}>{f.problem}</span>
          <span style={{ color: T.textSec, fontSize: 13 }}>→ {f.fix}</span>
        </div>
      ))}
    </div>
  </Card>
);

const SubstitutionsCard = ({ subs, delay }) => (
  <Card delay={delay}>
    <CardHeader icon={Icons.zap({ size: 18, color: T.creative })} title="Substitutions" accent={T.creative} subtitle="If you don't have a piece of gear" />
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {subs.map((s, i) => (
        <div key={i} style={{ padding: 14, background: T.cardUp, borderRadius: T.radiusSm, border: `1px solid ${T.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ color: T.error, fontSize: 13, fontWeight: 600 }}>Missing</span>
            <span style={{ color: T.text, fontSize: 14, fontWeight: 600 }}>{s.ifMissing}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ color: T.success, fontSize: 13, fontWeight: 600 }}>Use</span>
            <span style={{ color: T.text, fontSize: 14, fontWeight: 600 }}>{s.use}</span>
          </div>
          <p style={{ margin: 0, color: T.textSec, fontSize: 13, lineHeight: 1.5, paddingLeft: 0 }}>
            {s.tradeoff}
          </p>
        </div>
      ))}
    </div>
  </Card>
);

const AlternativesCard = ({ alts, delay }) => (
  <Card delay={delay}>
    <CardHeader icon={Icons.grid({ size: 18, color: T.creative })} title="Other Setups You Could Try" accent={T.creative} />
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {alts.map((a, i) => {
        const color = reliabilityColor(a.reliability);
        return (
          <div key={i} style={{ padding: 14, background: T.cardUp, borderRadius: T.radiusSm, border: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ color: T.text, fontSize: 15, fontWeight: 700 }}>{a.name}</span>
              <span style={{ color, fontSize: 12, fontWeight: 700, fontFamily: T.fontMono }}>{reliabilityLabel(a.reliability)}</span>
            </div>
            <p style={{ margin: 0, color: T.textSec, fontSize: 13, lineHeight: 1.5 }}>{a.desc}</p>
          </div>
        );
      })}
    </div>
  </Card>
);

/* ─────────────────────────────────────────────
   SCREENS
   ───────────────────────────────────────────── */

// START SCREEN
const StartScreen = ({ onSelect }) => (
  <div style={{ ...stagger(0), padding: 24, minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center" }}>
    <div style={{ textAlign: "center", marginBottom: 40 }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        {Icons.flash({ size: 24, color: T.accent })}
        <span style={{ color: T.accent, fontSize: 13, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase" }}>NGW Lighting</span>
      </div>
      <h1 style={{ margin: "0 0 8px", color: T.text, fontSize: 28, fontWeight: 800, lineHeight: 1.2 }}>How do you want to start?</h1>
      <p style={{ margin: 0, color: T.textSec, fontSize: 15 }}>Choose your workflow</p>
    </div>

    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 400, margin: "0 auto", width: "100%" }}>
      <button onClick={() => onSelect("match")} style={startBtn}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: T.accentDim, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {Icons.image({ size: 22, color: T.accent })}
        </div>
        <div style={{ flex: 1, textAlign: "left" }}>
          <div style={{ color: T.text, fontSize: 17, fontWeight: 700, marginBottom: 3 }}>Match a Look</div>
          <div style={{ color: T.textSec, fontSize: 13 }}>Use a reference photo and recreate the lighting</div>
        </div>
        {Icons.chevRight({ size: 18, color: T.textDim })}
      </button>

      <button onClick={() => onSelect("build")} style={startBtn}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: T.creativeDim, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {Icons.sliders({ size: 22, color: T.creative })}
        </div>
        <div style={{ flex: 1, textAlign: "left" }}>
          <div style={{ color: T.text, fontSize: 17, fontWeight: 700, marginBottom: 3 }}>Build From Scratch</div>
          <div style={{ color: T.textSec, fontSize: 13 }}>Start with your subject, mood, space, and gear</div>
        </div>
        {Icons.chevRight({ size: 18, color: T.textDim })}
      </button>
    </div>
  </div>
);

const startBtn = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  padding: 18,
  borderRadius: T.radius,
  border: `1.5px solid ${T.border}`,
  background: T.card,
  cursor: "pointer",
  transition: "all .2s",
  fontFamily: T.font,
};

// GEAR MODE SCREEN
const GearModeScreen = ({ onSelect }) => (
  <div style={{ ...stagger(0), padding: 24, minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center" }}>
    <div style={{ textAlign: "center", marginBottom: 40 }}>
      <h1 style={{ margin: "0 0 8px", color: T.text, fontSize: 24, fontWeight: 800 }}>Are we building around your gear?</h1>
      <p style={{ margin: 0, color: T.textSec, fontSize: 15 }}>This shapes which setups we recommend</p>
    </div>

    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 400, margin: "0 auto", width: "100%" }}>
      <button onClick={() => onSelect("myGear")} style={startBtn}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: T.successDim, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {Icons.tool({ size: 22, color: T.success })}
        </div>
        <div style={{ flex: 1, textAlign: "left" }}>
          <div style={{ color: T.text, fontSize: 17, fontWeight: 700, marginBottom: 3 }}>Use My Gear</div>
          <div style={{ color: T.textSec, fontSize: 13 }}>Recommend setups I can actually build</div>
        </div>
        {Icons.chevRight({ size: 18, color: T.textDim })}
      </button>

      <button onClick={() => onSelect("bestPossible")} style={startBtn}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: T.accentDim, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {Icons.star({ size: 22, color: T.accent })}
        </div>
        <div style={{ flex: 1, textAlign: "left" }}>
          <div style={{ color: T.text, fontSize: 17, fontWeight: 700, marginBottom: 3 }}>Best Possible Setup</div>
          <div style={{ color: T.textSec, fontSize: 13 }}>Show me the ideal regardless of what I own</div>
        </div>
        {Icons.chevRight({ size: 18, color: T.textDim })}
      </button>
    </div>
  </div>
);

// WIZARD SCREEN
const WizardScreen = ({ mode, gearMode, onComplete, onBack }) => {
  const isMatch = mode === "match";
  const showGear = gearMode === "myGear";

  const totalSteps = (isMatch ? 3 : 4) + (showGear ? 1 : 0);
  const [step, setStep] = useState(0);

  const [subject, setSubject] = useState(null);
  const [mood, setMood] = useState(null);
  const [env, setEnv] = useState(null);
  const [ceiling, setCeiling] = useState(null);
  const [gear, setGear] = useState({ lights: {}, modifiers: {}, support: {} });

  const setGearItem = (category, item, qty) => {
    setGear((prev) => ({
      ...prev,
      [category]: { ...prev[category], [item]: qty },
    }));
  };

  const steps = [];
  if (isMatch) {
    steps.push({
      title: "What are you shooting?",
      subtitle: "Choose subject type and environment",
      content: (
        <>
          <SectionLabel>Subject Type</SectionLabel>
          <ChipGroup items={SUBJECT_TYPES} selected={subject} onSelect={setSubject} />
          <div style={{ height: 20 }} />
          <SectionLabel>Environment</SectionLabel>
          <ChipGroup items={ENVIRONMENTS} selected={env} onSelect={setEnv} accent={T.creative} />
        </>
      ),
      valid: subject && env,
    });
    steps.push({
      title: "Ceiling height?",
      subtitle: "Affects modifier choices and placement",
      content: (
        <>
          <SectionLabel>Ceiling Height</SectionLabel>
          <ChipGroup items={CEILING_HEIGHTS} selected={ceiling} onSelect={setCeiling} accent={T.warn} />
        </>
      ),
      valid: ceiling,
    });
  } else {
    steps.push({
      title: "What are you shooting?",
      subtitle: "Subject type",
      content: (
        <>
          <SectionLabel>Subject Type</SectionLabel>
          <ChipGroup items={SUBJECT_TYPES} selected={subject} onSelect={setSubject} />
        </>
      ),
      valid: subject,
    });
    steps.push({
      title: "What's the mood?",
      subtitle: "The look you're going for",
      content: (
        <>
          <SectionLabel>Mood / Look</SectionLabel>
          <ChipGroup items={MOODS} selected={mood} onSelect={setMood} accent={T.creative} />
        </>
      ),
      valid: mood,
    });
    steps.push({
      title: "Where are you shooting?",
      subtitle: "Environment and ceiling",
      content: (
        <>
          <SectionLabel>Environment</SectionLabel>
          <ChipGroup items={ENVIRONMENTS} selected={env} onSelect={setEnv} />
          <div style={{ height: 20 }} />
          <SectionLabel>Ceiling Height</SectionLabel>
          <ChipGroup items={CEILING_HEIGHTS} selected={ceiling} onSelect={setCeiling} accent={T.warn} />
        </>
      ),
      valid: env && ceiling,
    });
  }

  if (showGear) {
    steps.push({
      title: "What gear do you have?",
      subtitle: "Tap to add, use steppers for quantity",
      content: (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <SectionLabel>Lights</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {LIGHTS.map((l) => (
                <QuantityStepper key={l} label={l} count={gear.lights[l] || 0} onChange={(v) => setGearItem("lights", l, v)} />
              ))}
            </div>
          </div>
          <div>
            <SectionLabel>Modifiers</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {MODIFIERS.map((m) => (
                <QuantityStepper key={m} label={m} count={gear.modifiers[m] || 0} onChange={(v) => setGearItem("modifiers", m, v)} />
              ))}
            </div>
          </div>
          <div>
            <SectionLabel>Support</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {SUPPORT.map((s) => (
                <QuantityStepper key={s} label={s} count={gear.support[s] || 0} onChange={(v) => setGearItem("support", s, v)} />
              ))}
            </div>
          </div>
        </div>
      ),
      valid: true,
    });
  }

  // Add final review / "generate" step marker
  steps.push({
    title: "Ready to go",
    subtitle: "Here's what we're working with",
    content: (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {[
          ["Subject", subject],
          ["Mood", mood],
          ["Environment", env],
          ["Ceiling", ceiling],
          ["Gear Mode", gearMode === "myGear" ? "Your gear" : "Best possible"],
        ]
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: T.cardUp, borderRadius: T.radiusSm }}>
              <span style={{ color: T.textSec, fontSize: 14 }}>{k}</span>
              <span style={{ color: T.text, fontSize: 14, fontWeight: 600 }}>{v}</span>
            </div>
          ))}
      </div>
    ),
    valid: true,
  });

  const cur = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <div style={{ padding: 24, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button onClick={() => (step === 0 ? onBack() : setStep(step - 1))} style={{ ...btnCircle, background: T.card }}>
          {Icons.chevLeft({ size: 18, color: T.textSec })}
        </button>
        <div style={{ flex: 1 }}>
          <ProgressDots total={steps.length} current={step} />
        </div>
        <div style={{ width: 30 }} />
      </div>

      {/* Content */}
      <div key={step} style={{ ...fadeUp, flex: 1 }}>
        <h2 style={{ margin: "0 0 6px", color: T.text, fontSize: 22, fontWeight: 800 }}>{cur.title}</h2>
        <p style={{ margin: "0 0 24px", color: T.textSec, fontSize: 14 }}>{cur.subtitle}</p>
        {cur.content}
      </div>

      {/* Bottom action */}
      <div style={{ paddingTop: 20, paddingBottom: 12 }}>
        <Btn
          primary
          disabled={!cur.valid}
          onClick={() => {
            if (isLast) {
              onComplete({ subject, mood: mood || "Clean & Classic", env, ceiling, gearMode, gear });
            } else {
              setStep(step + 1);
            }
          }}
          style={{ width: "100%" }}
        >
          {isLast ? "Show Me the Setup →" : "Continue"}
        </Btn>
      </div>
    </div>
  );
};

// RESULTS SCREEN
const ResultsScreen = ({ params, onRestart }) => {
  const results = generateMockResults(params);

  return (
    <div style={{ padding: 16, paddingBottom: 100 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, ...stagger(0) }}>
        <button onClick={onRestart} style={{ ...btnCircle, background: T.card }}>
          {Icons.chevLeft({ size: 18, color: T.textSec })}
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ color: T.textDim, fontSize: 12, textTransform: "uppercase", letterSpacing: ".08em" }}>
            {params.subject} · {params.mood}
          </div>
          <div style={{ color: T.text, fontSize: 17, fontWeight: 700 }}>Your Lighting Setup</div>
        </div>
      </div>

      {/* Cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <BestMatchCard data={results.bestMatch} delay={1} />
        <ShootSetupCard lights={results.lights} delay={3} />
        <CameraCard camera={results.camera} subject={results.subject} bg={results.background} delay={6} />
        <SpaceCheckCard data={results.spaceCheck} delay={7} />
        <DiagramCard lights={results.lights} camera={results.camera} subject={results.subject} delay={8} />
        <TestStepsCard steps={results.testSteps} delay={9} />
        <LookForCard data={results.lookFor} delay={10} />
        <QuickFixesCard fixes={results.quickFixes} delay={11} />
        <SubstitutionsCard subs={results.substitutions} delay={12} />
        <AlternativesCard alts={results.alternatives} delay={13} />
      </div>

      {/* Sticky bottom bar */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          padding: "12px 16px",
          background: `linear-gradient(transparent, ${T.bg} 30%)`,
          display: "flex",
          gap: 8,
          justifyContent: "center",
          paddingTop: 32,
        }}
      >
        <Btn onClick={() => {}} style={{ fontSize: 13, padding: "10px 16px" }}>
          Adapt
        </Btn>
        <Btn onClick={() => {}} style={{ fontSize: 13, padding: "10px 16px" }}>
          Save
        </Btn>
        <Btn onClick={onRestart} style={{ fontSize: 13, padding: "10px 16px" }}>
          Rebuild
        </Btn>
        <Btn onClick={() => {}} style={{ fontSize: 13, padding: "10px 16px" }}>
          Fewer Lights
        </Btn>
      </div>
    </div>
  );
};

/* ─────────────────────────────────────────────
   APP ROOT
   ───────────────────────────────────────────── */
export default function App() {
  const [screen, setScreen] = useState("start"); // start | gearMode | wizard | results
  const [mode, setMode] = useState(null); // match | build
  const [gearMode, setGearMode] = useState(null); // myGear | bestPossible
  const [resultParams, setResultParams] = useState(null);

  const containerRef = useRef(null);

  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0;
  }, [screen]);

  return (
    <div
      ref={containerRef}
      style={{
        fontFamily: T.font,
        background: T.bg,
        color: T.text,
        minHeight: "100vh",
        maxWidth: 480,
        margin: "0 auto",
        position: "relative",
        overflowX: "hidden",
      }}
    >
      <style>{fadeUpStyle}{`
        *, *::before, *::after { box-sizing: border-box; }
        body { margin: 0; background: ${T.bg}; }
        button { font-family: ${T.font}; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 2px; }
      `}</style>

      {/* Subtle ambient gradient */}
      <div
        style={{
          position: "fixed",
          top: -200,
          left: "50%",
          transform: "translateX(-50%)",
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${T.accent}08 0%, transparent 70%)`,
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      <div style={{ position: "relative", zIndex: 1 }}>
        {screen === "start" && (
          <StartScreen
            onSelect={(m) => {
              setMode(m);
              setScreen("gearMode");
            }}
          />
        )}

        {screen === "gearMode" && (
          <GearModeScreen
            onSelect={(gm) => {
              setGearMode(gm);
              setScreen("wizard");
            }}
          />
        )}

        {screen === "wizard" && (
          <WizardScreen
            mode={mode}
            gearMode={gearMode}
            onBack={() => setScreen("gearMode")}
            onComplete={(params) => {
              setResultParams(params);
              setScreen("results");
            }}
          />
        )}

        {screen === "results" && (
          <ResultsScreen
            params={resultParams}
            onRestart={() => {
              setScreen("start");
              setMode(null);
              setGearMode(null);
              setResultParams(null);
            }}
          />
        )}
      </div>
    </div>
  );
}
