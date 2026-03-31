/**
 * Diagram module — public API.
 *
 * Exports canvas renderers, constants, and utilities
 * for the lighting diagram card.
 */

export { default as drawTopView } from './drawTopView';
export { default as drawFloorPlan } from './drawFloorPlan';
export { default as drawSideView } from './drawSideView';

export {
  LIGHT_COLORS_DARK, LIGHT_COLORS_LIGHT,
  FONT_STACK, SHORT_MOD, ROLE_DESC,
} from './diagramConstants';

export {
  getThemeColors, lightColor, fmtDist, mToFt,
  distLabelWidth, fontScale, setupCanvas, handlePrint,
} from './diagramUtils';
