/**
 * formatFeedback — transform layer for Shoot Mode step text.
 *
 * Same underlying data, different presentation per mode:
 *
 *   photographer  conversational, includes slight reasoning      (default, no-op)
 *   assistant     direct, executable movement commands with safe approximate ranges
 *   learning      full text + explicit cause-and-effect framing
 *
 * Rules:
 *  - Never mutates source data
 *  - Falls back to 'photographer' (no-op) on invalid mode
 *  - Ignores nullish/non-string values (returns them unchanged)
 */

import { sequenceFixes } from './sequenceFixes';

const VALID_MODES = new Set(['photographer', 'assistant', 'learning']);

// ── Safe range constants (spec-defined) ───────────────────────────────────
// "slight" is always the default — safest range for on-set adjustments

const SLIGHT = {
  angle:    '5–10°',
  height:   '4–6 inches',
  distance: '0.5–1 ft',
  power:    '0.3–0.5 stop',
  side:     '6–12 inches',
  center:   '4–6 inches',
};
const MODERATE = {
  angle:    '10–20°',
  height:   '6–12 inches',
  distance: '1–2 ft',
  power:    '0.5–1 stop',
  side:     '12–18 inches',
  center:   '6–10 inches',
};

function getMagnitude(text) {
  if (/\b(slightly|a\s+little|small|minor|subtle|gently|a\s+few|touch|inch|inches)\b/i.test(text)) return SLIGHT;
  if (/\b(significantly|considerably|a\s+lot|substantially|much|quite|very|dramatically)\b/i.test(text)) return MODERATE;
  return SLIGHT; // safest default when magnitude is unspecified
}

function getLightLabel(text) {
  if (/\bkey\b/i.test(text))        return 'key';
  if (/\bfill\b/i.test(text))       return 'fill';
  if (/\brim\b/i.test(text))        return 'rim';
  if (/\bhair\b/i.test(text))       return 'hair';
  if (/\bbackground\b/i.test(text)) return 'background';
  return 'key'; // sensible default
}

// ── Snake-case diagnostic code → command lookup ───────────────────────────
// Each entry: { doThis(mag), result }

const SNAKE_COMMANDS = {
  reduce_fill:                { doThis: (mag) => `Power: Reduce fill ~${mag.power}.`,             result: 'Shadow side darkens, increases contrast.' },
  move_fill_farther:          { doThis: (mag) => `Light: Move fill back ~${mag.distance}.`,        result: 'Fill weakens, shadow deepens on far side.' },
  bring_fill_closer:          { doThis: (mag) => `Light: Move fill closer ~${mag.distance}.`,      result: 'Fill strengthens, shadows lift.' },
  add_fill:                   { doThis: ()    => 'Light: Add fill on shadow side.',                result: 'Shadow side brightens, contrast drops.' },
  move_key_off_axis:          { doThis: (mag) => `Light: Move key to the side ~${mag.side}.`,     result: 'Shadow appears on face, adds dimension.' },
  lower_key:                  { doThis: (mag) => `Light: Lower key ~${mag.height}.`,              result: 'Catchlights drop, face opens up.' },
  raise_key:                  { doThis: (mag) => `Light: Raise key ~${mag.height}.`,              result: 'Catchlights lift, shadow lengthens slightly.' },
  move_key_forward:           { doThis: (mag) => `Light: Move key forward ~${mag.distance}.`,     result: 'Key shifts position, shadow angle changes.' },
  move_key_closer:            { doThis: (mag) => `Light: Move key closer ~${mag.distance}.`,      result: 'Light wraps more, shadow edges soften.' },
  move_key_farther:           { doThis: (mag) => `Light: Move key back ~${mag.distance}.`,        result: 'More even coverage, shadow edges sharpen slightly.' },
  feather_rim:                { doThis: ()    => 'Light: Feather rim — rotate slightly away.',     result: 'Rim softens, reduces flare risk.' },
  reduce_rim_power:           { doThis: (mag) => `Power: Reduce rim ~${mag.power}.`,              result: 'Rim dims, edge is less distracting.' },
  move_rim_farther:           { doThis: (mag) => `Light: Move rim back ~${mag.distance}.`,        result: 'Rim narrows, separation reduces slightly.' },
  add_rim_light:              { doThis: ()    => 'Light: Add rim light behind subject.',           result: 'Subject separates cleanly from background.' },
  adjust_subject_chin:        { doThis: (mag) => `Subject: Tilt chin ~${mag.angle}.`,             result: 'Changes face shape and shadow pattern.' },
  move_subject_forward:       { doThis: (mag) => `Subject: Move subject forward ~${mag.distance}.`, result: 'Subject separates from background.' },
  increase_source_size:       { doThis: ()    => 'Light: Use a larger or closer modifier.',       result: 'Shadow edges soften, light wraps more.' },
  move_light_closer:          { doThis: (mag) => `Light: Move closer ~${mag.distance}.`,          result: 'Light wraps more, shadow edges soften.' },
  reduce_background_exposure: { doThis: (mag) => `Power: Reduce background ~${mag.power}.`,      result: 'Background darkens, subject pops forward.' },
};

function _isSnakeCase(text) {
  return /^[a-z][a-z0-9_]+[a-z0-9]$/.test(text.trim());
}

function _capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function _fromSnakeCase(code) {
  const key = code.trim().toLowerCase();
  const entry = SNAKE_COMMANDS[key];
  if (entry) return `Do this: ${entry.doThis(SLIGHT)}`; // string form for backward compat
  return `Do this: ${_capitalize(key.replace(/_/g, ' '))}.`;
}

function _fromSnakeCaseStructured(code) {
  const key = code.trim().toLowerCase();
  const entry = SNAKE_COMMANDS[key];
  if (entry) return { doThis: entry.doThis(SLIGHT), result: entry.result };
  const humanized = _capitalize(key.replace(/_/g, ' ')) + '.';
  return { doThis: humanized, result: null };
}

// ── Problem:action text splitter ─────────────────────────────────────────
// Handles: "No catchlight: lower the key a few inches."
// Extracts action text after the colon.

function _extractAction(text) {
  const colonIdx = text.indexOf(':');
  if (colonIdx > 0 && colonIdx < text.length - 2) {
    const after = text.slice(colonIdx + 1).trim();
    if (after.length >= 4) return after;
  }
  return text;
}

// ── Movement pattern rules ────────────────────────────────────────────────
// Each rule: { test (RegExp), build (fn(mag, l) → doThis string), result (string) }

const COMMAND_RULES = [
  // Raise height
  { test: /\b(raise|lift|higher|up\s+a\s+bit)\b/i,
    build:  (mag, l) => `Light: Raise ${l} ~${mag.height}.`,
    result: 'Catchlights lift, shadow lengthens slightly.' },

  // Lower height (explicit object reference)
  { test: /\b(lower|drop)\b.{0,20}\b(key|fill|rim|hair|light|it)\b|\b(lower|drop)\s+the\s+(key|fill|rim)/i,
    build:  (mag, l) => `Light: Lower ${l} ~${mag.height}.`,
    result: 'Catchlights drop, face opens up.' },

  // Move closer / in
  { test: /\b(move|bring|pull)\b.{0,15}\b(closer|in|nearer)\b|\bcloser\s+to\b/i,
    build:  (mag, l) => `Light: Move ${l} closer ~${mag.distance}.`,
    result: 'Light wraps more, shadow edges soften.' },

  // Move back / farther
  { test: /\b(move|push|pull)\b.{0,15}\b(back|farther|further|away)\b/i,
    build:  (mag, l) => `Light: Move ${l} back ~${mag.distance}.`,
    result: 'More even coverage, shadow edges sharpen slightly.' },

  // Move to the side (directional correction — not camera-relative)
  { test: /\b(move|shift|slide)\b.{0,15}\b(to\s+the\s+side|sideways|laterally|off[\s-]?axis)\b/i,
    build:  (mag, l) => `Light: Move ${l} to the side ~${mag.side}.`,
    result: 'Shadow appears on face, adds dimension.' },

  // Bring toward center / flatten direction
  { test: /\b(bring|move|shift)\b.{0,20}\b(toward\s+center|to\s+center|more\s+central|flatter|front)\b/i,
    build:  (mag, l) => `Light: Bring ${l} toward center ~${mag.center}.`,
    result: 'Light flattens slightly, evens out the face.' },

  // Camera-left
  { test: /camera[\s-]?left/i,
    build:  (mag, l) => `Light: Move ${l} camera-left ~${mag.side}.`,
    result: 'Shadow moves right, adds depth.' },

  // Camera-right
  { test: /camera[\s-]?right/i,
    build:  (mag, l) => `Light: Move ${l} camera-right ~${mag.side}.`,
    result: 'Shadow moves left, adds depth.' },

  // Increase flash/strobe power
  { test: /\b(increase|boost|turn\s+up|add\s+power)\b.{0,20}\b(power|output|flash|strobe|brightness|exposure|stop)\b/i,
    build:  (mag, l) => `Power: Increase ${l} ~${mag.power}.`,
    result: 'Brighter exposure, shadows deepen.' },

  // Reduce fill ratio specifically
  { test: /\b(reduce|lower|drop|back\s+off)\b.{0,10}\b(fill|ratio|fill[\s-]ratio)\b|\bfill\b.{0,10}\b(reduce|lower|weaken)\b/i,
    build:  (mag) => `Power: Reduce fill ~${mag.power}.`,
    result: 'Shadow side darkens, increases contrast.' },

  // Reduce power (generic)
  { test: /\b(reduce|decrease|lower|cut|dial\s+down)\b.{0,20}\b(power|output|stop|flash|strobe|brightness)\b/i,
    build:  (mag, l) => `Power: Reduce ${l} ~${mag.power}.`,
    result: 'Exposure drops, shadows lighten slightly.' },

  // Subject rules BEFORE light-rotation rules
  // (prevents "Rotate subject toward key" matching the light rule on "key")

  // Subject: rotate toward light
  { test: /\b(rotate|turn|angle|face)\b.{0,20}\b(subject|model|talent|person)\b/i,
    build:  (mag) => `Subject: Rotate toward light ~${mag.angle}.`,
    result: 'More light on face, shadow shifts.' },

  // Subject: chin / head tilt
  { test: /\b(tilt|chin|head\s+down|head\s+up|chin\s+down|chin\s+up)\b/i,
    build:  (mag) => `Subject: Tilt chin ~${mag.angle}.`,
    result: 'Changes face shape and shadow pattern.' },

  // Move subject forward
  { test: /\b(move|step)\b.{0,15}\b(subject|model|talent|person)\b.{0,10}\bforward\b|\bsubject\b.{0,15}\bforward\b/i,
    build:  (mag) => `Subject: Move forward ~${mag.distance}.`,
    result: 'Subject separates from background.' },

  // Feather / flag (before rotate so "feather key" is caught here)
  { test: /\b(feather|flag)\b/i,
    build:  (_, l) => `Light: Feather ${l} — rotate slightly away.`,
    result: 'Hot spot softens, light spreads more evenly.' },

  // Rotate / angle light
  { test: /\b(rotate|angle|swing)\b.{0,20}\b(light|key|fill|rim|hair)\b/i,
    build:  (mag, l) => `Light: Rotate ${l} ~${mag.angle}.`,
    result: 'Shadow pattern shifts across face.' },

  // Move/reposition key without a specific direction
  { test: /\b(move|reposition|shift)\b.{0,10}\b(the\s+)?(key|fill|rim|hair)\b/i,
    build:  (mag, l) => `Light: Reposition ${l} ~${mag.side}.`,
    result: 'Shadow shifts to new position.' },

  // Aim at eyes / aim more toward face
  { test: /\baim\b.{0,25}\b(eyes|face|toward)\b/i,
    build:  (mag, l) => `Light: Re-aim ${l} toward face ~${mag.angle}.`,
    result: 'Catchlights center in eyes.' },

  // Adjust/balance power
  { test: /\b(adjust|balance|tweak)\b.{0,15}\b(power|output|ratio|stop)\b/i,
    build:  (mag, l) => `Power: Adjust ${l} ~${mag.power}.`,
    result: 'Exposure balance shifts slightly.' },

  // Add reflector / bounce card
  { test: /\b(add|place|use|position)\b.{0,15}\b(reflector|bounce\s+card|card)\b/i,
    build:  () => 'Light: Add reflector on shadow side.',
    result: 'Shadow side fills in, reduces contrast.' },

  // Add rim / separation light
  { test: /\badd\b.{0,15}\b(rim|hair|separation)\b/i,
    build:  () => 'Light: Add rim light behind subject.',
    result: 'Subject separates cleanly from background.' },

  // Background separation
  { test: /\b(background\s+separation|separate\s+background|pop\s+subject)\b/i,
    build:  () => 'Light: Increase background separation.',
    result: 'Subject pops forward from background.' },
];

// Does the text look like an instruction (has an action verb)?
const ACTION_VERB_RE = /\b(raise|lower|move|rotate|turn|angle|increase|reduce|decrease|boost|drop|lift|add|place|position|flag|feather|block|adjust|check|verify|take|ensure|set|use|bring|push|pull|aim|dial|cut|reduce|tighten|loosen|open|close)\b/i;

function _isActionText(text) {
  return ACTION_VERB_RE.test(text);
}

// ── Sentence extraction ───────────────────────────────────────────────────

function firstSentence(text) {
  const m = text.match(/^[^.!?]+[.!?]?/);
  return m ? m[0].trim() : text.trim();
}

const REASON_PATTERNS = [
  /[,;]?\s+(which|that)\s+(will|can|help|helps|create|creates|give|gives|allow|allows|ensure|ensures|add|adds)\b[^.!?]*/gi,
  /[,;]?\s+so\s+(that|you)\b[^.!?]*/gi,
  /[,;]?\s+this\s+(will|create|creates|help|helps|give|gives|ensure|ensures|produce|produces)\b[^.!?]*/gi,
  /[,;]?\s+because\b[^.!?]*/gi,
  /\s+—[^.!?]*/g,
  /[,]\s*$/,
];

function stripReasoning(text) {
  let out = firstSentence(text);
  for (const p of REASON_PATTERNS) {
    out = out.replace(p, '');
  }
  out = out.replace(/\s{2,}/g, ' ').replace(/[,;]\s*$/, '').trim();
  if (out && !/[.!?]$/.test(out)) out += '.';
  return out;
}

// ── Core command builders ─────────────────────────────────────────────────

/**
 * Internal: match text against COMMAND_RULES and return { doThis, result } or null.
 */
function _matchRule(actionText) {
  const mag   = getMagnitude(actionText);
  const light = getLightLabel(actionText);
  for (const rule of COMMAND_RULES) {
    if (rule.test.test(actionText)) {
      return { doThis: rule.build(mag, light), result: rule.result || null };
    }
  }
  return null;
}

/**
 * Internal: build the fallback doThis string when no rule matches.
 */
function _fallbackDoThis(actionText) {
  const stripped = stripReasoning(actionText)
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const clean = (stripped && !/[.!?]$/.test(stripped)) ? stripped + '.' : stripped;
  const bare  = clean.replace(/[.!?]$/, '').trim();
  if (bare.length < 6 || !_isActionText(bare)) return 'Adjust and re-test.';
  return clean;
}

/**
 * Transform any feedback text into a direct, executable assistant command string.
 * Returns a string starting with "Do this:" for backward compatibility.
 *
 * @param {string} text
 * @returns {string}
 */
export function formatAssistantCommand(text) {
  if (!text || typeof text !== 'string' || !text.trim()) return null;

  const trimmed = text.trim();

  if (_isSnakeCase(trimmed)) return _fromSnakeCase(trimmed);

  const actionText = _extractAction(trimmed);
  const match = _matchRule(actionText);
  if (match) return `Do this: ${match.doThis}`;

  return `Do this: ${_fallbackDoThis(actionText)}`;
}

/**
 * Transform any feedback text into a structured { doThis, result } command object.
 * Used by formatFixes() in assistant mode to enable the two-line "Do this / Result" UI.
 *
 * @param {string} text
 * @returns {{ doThis: string, result: string|null }}
 */
export function formatAssistantCommandStructured(text) {
  if (!text || typeof text !== 'string' || !text.trim()) {
    return { doThis: 'Adjust and re-test.', result: null };
  }

  const trimmed = text.trim();

  if (_isSnakeCase(trimmed)) return _fromSnakeCaseStructured(trimmed);

  const actionText = _extractAction(trimmed);
  const match = _matchRule(actionText);
  if (match) return match;

  return { doThis: _fallbackDoThis(actionText), result: null };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Format a single text string for the given mode.
 *
 * @param {string|any}  text
 * @param {string}      mode     - 'photographer' | 'assistant' | 'learning'
 * @param {'title'|'subtitle'|'tip'|'fix'|'warning'} [context='subtitle']
 * @returns {string|null}  null means "hide this element"
 */
export function formatFeedback(text, mode, context = 'subtitle') {
  if (text == null || typeof text !== 'string') return text;
  if (!text.trim()) return text;

  const m = VALID_MODES.has(mode) ? mode : 'photographer';

  switch (m) {
    case 'photographer':
      return text;

    case 'assistant': {
      // Tips are explanatory by nature — suppress entirely
      if (context === 'tip') return null;

      // Only apply command formatting to text that describes an action
      if (context === 'subtitle') {
        if (_isActionText(text)) {
          return formatAssistantCommand(text);
        }
        // Descriptor text (modifier names, spec values) — show as-is
        return text;
      }

      // For fix/warning/title contexts: apply if actionable, else strip reasoning
      if (_isActionText(text)) {
        return formatAssistantCommand(text);
      }
      return stripReasoning(text);
    }

    case 'learning': {
      if (context === 'tip') return `Why this matters: ${text}`;
      return text;
    }

    default:
      return text;
  }
}

/**
 * Format a tips array.
 * Assistant: hidden. Learning: "Why this matters:" prefix.
 *
 * @param {string[]} tips
 * @param {string}   mode
 * @returns {string[]}
 */
export function formatTips(tips, mode) {
  if (!Array.isArray(tips)) return tips;
  const m = VALID_MODES.has(mode) ? mode : 'photographer';

  // Assistant mode: show tips — they're operational on-set, not just educational
  if (m === 'assistant') return tips;
  if (m === 'learning')  return tips.map(t => `Why this matters: ${t}`);
  return tips;
}

/**
 * Format a quickFixes array.
 * Assistant: convert to direct commands using formatAssistantCommand.
 *
 * @param {Array<string|{problem?:string, fix?:string, text?:string}>} fixes
 * @param {string} mode
 * @returns {Array}
 */
export function formatFixes(fixes, mode) {
  if (!Array.isArray(fixes)) return fixes;
  const m = VALID_MODES.has(mode) ? mode : 'photographer';

  if (m !== 'assistant') return fixes;

  return sequenceFixes(fixes).map(fix => {
    const raw = typeof fix === 'string' ? fix : (fix.fix || fix.text || '');
    if (!raw) return { doThis: 'Adjust and re-test.', result: null };
    const structured = formatAssistantCommandStructured(raw);
    return structured;
  });
}

/**
 * Format a diagnostic fixes array.
 * These are typically snake_case codes from the engine (e.g. "lower_key").
 * Assistant: translate each code to a direct command.
 *
 * @param {string[]} fixes
 * @param {string}   mode
 * @returns {string[]}
 */
export function formatDiagFixes(fixes, mode) {
  if (!Array.isArray(fixes)) return fixes;
  const m = VALID_MODES.has(mode) ? mode : 'photographer';

  if (m !== 'assistant') return fixes;

  // Return structured objects so DiagContent can render Do this / Result
  return fixes.map(f => {
    const raw = typeof f === 'string' ? f : String(f);
    return formatAssistantCommandStructured(raw);
  });
}
