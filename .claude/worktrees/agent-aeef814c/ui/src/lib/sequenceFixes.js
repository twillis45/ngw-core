/**
 * sequenceFixes — priority-sorted fix sequencer for Shoot Mode.
 *
 * Priority order (what matters most on-set):
 *   1. position  — move/place the light
 *   2. angle     — rotate/feather/direction
 *   3. height    — raise/lower
 *   4. distance  — move closer/farther
 *   5. power     — adjust output/stop
 *   6. other     — everything else
 *
 * Returns max `maxSteps` fixes sorted by priority.
 */

const PRIORITY = {
  position: 1,
  angle:    2,
  height:   3,
  distance: 4,
  power:    5,
  other:    6,
};

const PATTERNS = [
  [/\b(position|place|reposit|set\s+up)\b/i,               'position'],
  [/\b(angle|rotate|feather|direct|flag)\b/i,               'angle'],
  [/\b(height|raise|lower|higher|lower)\b/i,                'height'],
  [/\b(distance|closer|farther|back|forward|move|step)\b/i, 'distance'],
  [/\b(power|output|stop|exposure|reduce|increase|boost|cut)\b/i, 'power'],
];

function getPriority(fix) {
  const text = (
    typeof fix === 'string' ? fix
      : fix.fix || fix.text || fix.action || fix.problem || ''
  ).toLowerCase();
  for (const [pattern, key] of PATTERNS) {
    if (pattern.test(text)) return PRIORITY[key];
  }
  return PRIORITY.other;
}

/**
 * Sort fixes by on-set priority, capped at maxSteps.
 * @param {Array} fixes
 * @param {number} [maxSteps=4]
 * @returns {Array}
 */
export function sequenceFixes(fixes, maxSteps = 4) {
  if (!fixes?.length) return [];
  return [...fixes]
    .sort((a, b) => getPriority(a) - getPriority(b))
    .slice(0, maxSteps);
}

/**
 * Format sequenced fixes as numbered step strings.
 * @param {Array}    fixes      - raw fix array
 * @param {Function} formatCmd  - (text: string) => string  formatter (e.g. formatAssistantCommand)
 * @returns {string[]}  e.g. ["Step 1 — Do this: Lower key ~4–6 inches.", ...]
 */
export function formatSequencedSteps(fixes, formatCmd) {
  return sequenceFixes(fixes).map((fix, i) => {
    const raw =
      typeof fix === 'string' ? fix
        : fix.fix || fix.text || fix.action || fix.problem || '';
    const cmd = formatCmd ? formatCmd(raw) : raw;
    return `Step ${i + 1} — ${cmd}`;
  });
}
