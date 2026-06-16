// Shared application state: the central state object `S`, the picker
// instance `P` (plus its derived geometry and DOM refs), and the map of
// per-swatch promoted Pantone selections. Every feature module imports
// from here, which is what lets the app be split without circular data.

import { createPicker } from './picker.js';
import {
  DISC_SIZE, DISC_LB_GAP, LB_WIDTH, LB_HEIGHT, HANDLE_R, HANDLE_SW,
  MIDDLE_GRAY, N_MATCHES, MIN_MATCHES, MAX_MATCHES,
} from './constants.js';

// Preferred match-chip count lives in user space (localStorage), NOT in the
// undo history: changing how many Pantone chips a swatch shows is a display
// preference, not an edit to the colour document. New swatches default to the
// last-used count; if it can't be read (private mode, blocked storage, never
// set), we fall back to N_MATCHES.
const MATCH_COUNT_KEY = 'okhsl.matchCount';

export function loadPreferredMatchCount() {
  try {
    const v = parseInt(localStorage.getItem(MATCH_COUNT_KEY), 10);
    if (Number.isFinite(v) && v >= MIN_MATCHES && v <= MAX_MATCHES) return v;
  } catch { /* storage unavailable */ }
  return N_MATCHES;
}

export function savePreferredMatchCount(n) {
  try { localStorage.setItem(MATCH_COUNT_KEY, String(n)); } catch { /* storage unavailable */ }
}

export const S = {
  colors:          [{ h: 0, s: 0, L: MIDDLE_GRAY, matchCount: loadPreferredMatchCount() }],
  activeIndex:     -1,
  lastActiveIndex: 0,
  multiSelect:     new Set(),
  isMultiMode()    { return this.multiSelect.size > 1; },

  modKeys:           { shift: false, meta: false },
  mouseInPicker:     false,
  mouseInPickerWrap: false,
  mouseInLightbar:   false,
  dragging:          false,
  mouseHueAngle:     0,
  hoveredHandle:     -1,

  lockedChromaPath: null,
  frozenEdges:      null,
  hueConvergeDrag:  null,

  libraryFilters: { base: false, pastel: false, neon: false, sp: false, xgc: false, metallic: false },

  sortChipsByHue: false,
};

// Renderer + derived geometry
export const P = createPicker(S, { DISC_SIZE, DISC_LB_GAP, LB_WIDTH, LB_HEIGHT, HANDLE_R, HANDLE_SW, MIDDLE_GRAY });
export const { els, DISC_R, handlePos, yToToeL, toeLToY } = P;

// Per-swatch promoted Pantone selections (swatch index → pantone entry)
export const pantoneSelections = new Map();
