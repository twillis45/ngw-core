/**
 * getLightContext — returns a human-readable context label for a light role.
 *
 * If blueprint contains position data for the role, appends clock position
 * or angle: "key (2:00)" | "key (45°)" | "key"
 *
 * Never fabricates data — returns plain roleKey if no position found.
 *
 * @param {string} roleKey  - "key" | "fill" | "rim" | "background"
 * @param {object} blueprint - result object containing lights array
 * @returns {string}
 */
export function getLightContext(roleKey, blueprint) {
  if (!roleKey) return '';

  const lights =
    blueprint?.lights ||
    blueprint?.setup?.lights ||
    blueprint?.cards?.shootThisSetup?.lights ||
    [];

  const light = lights.find(l => {
    const r = (l.roleKey || l.role || '').toLowerCase();
    return r === roleKey.toLowerCase() || r.startsWith(roleKey.toLowerCase());
  });

  if (!light) return roleKey;

  const pos = light.position || light.positionText || '';

  // Clock position: "2:00", "10 o'clock", "4 o'clock position", etc.
  const clockMatch = pos.match(/\b(\d{1,2}(?::\d{2})?)\s*(?:o'?clock)?\b/i);
  if (clockMatch) return `${roleKey} (${clockMatch[1]})`;

  // Angle: "45°", "45 degrees", "45deg"
  const angleMatch = pos.match(/\b(\d{2,3})\s*(?:°|deg(?:rees?)?)/i);
  if (angleMatch) return `${roleKey} (${angleMatch[1]}°)`;

  return roleKey;
}
