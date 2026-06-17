// Shared application state: the central state object `S`, the picker
// instance `P` (plus its derived geometry and DOM refs), and the map of
// per-swatch promoted Pantone selections. Every feature module imports
// from here, which is what lets the app be split without circular data.

import { createPicker } from './picker.js';
import {
  DISC_SIZE, DISC_LB_GAP, LB_WIDTH, LB_HEIGHT, HANDLE_R, HANDLE_SW,
  MIDDLE_GRAY, DEFAULT_MATCH_COUNT, MIN_MATCHES, MAX_MATCHES,
  DEFAULT_CHIP_CUTOFF, MIN_CHIP_CUTOFF, MAX_CHIP_CUTOFF,
} from './constants.js';

// Preferred match-chip count lives in user space (localStorage), NOT in the
// undo history: changing how many Pantone chips a swatch shows is a display
// preference, not an edit to the colour document. New swatches default to the
// last-used count; if it can't be read (private mode, blocked storage, never
// set), we fall back to DEFAULT_MATCH_COUNT.
const MATCH_COUNT_KEY = 'okhsl.matchCount';

export function loadPreferredMatchCount() {
  try {
    const v = parseInt(localStorage.getItem(MATCH_COUNT_KEY), 10);
    if (Number.isFinite(v) && v >= MIN_MATCHES && v <= MAX_MATCHES) return v;
  } catch { /* storage unavailable */ }
  return DEFAULT_MATCH_COUNT;
}

export function savePreferredMatchCount(n) {
  try { localStorage.setItem(MATCH_COUNT_KEY, String(n)); } catch { /* storage unavailable */ }
}

// Chip delta-E cutoff (deltaE → fully hidden) is a display preference (localStorage).
const CHIP_CUTOFF_KEY = 'okhsl.chipCutoff';

export function loadChipCutoff() {
  try {
    const v = parseFloat(localStorage.getItem(CHIP_CUTOFF_KEY));
    if (Number.isFinite(v) && v >= MIN_CHIP_CUTOFF && v <= MAX_CHIP_CUTOFF) return v;
  } catch { /* storage unavailable */ }
  return DEFAULT_CHIP_CUTOFF;
}

export function saveChipCutoff(v) {
  try { localStorage.setItem(CHIP_CUTOFF_KEY, String(v)); } catch { /* storage unavailable */ }
}

export const S = {
  colors:          [{ h: 0, s: 0, L: MIDDLE_GRAY, matchCount: loadPreferredMatchCount() }],
  activeIndex:     -1,
  lastActiveIndex: 0,
  multiSelect:     new Set(),
  isMultiMode()    { return this.multiSelect.size > 1; },

  modKeys:           { shift: false, meta: false },
  pointerInPicker:     false,
  pointerInPickerWrap: false,
  pointerInLightbar:   false,
  dragging:          false,
  mouseHueAngle:     0,
  hoveredHandle:     -1,

  discChromaLock: null,
  frozenEdges:      null,
  hueConvergeDrag:  null,

  libraryFilters: { base: false, pastel: false, neon: false, sp: false, xgc: false, metallic: false },

  sortChipsByHue: false,

  // Delta-E cutoff driving the chip "skyline" (see constants.js).
  chipCutoff: loadChipCutoff(),
};

// Renderer + derived geometry
export const P = createPicker(S, { DISC_SIZE, DISC_LB_GAP, LB_WIDTH, LB_HEIGHT, HANDLE_R, HANDLE_SW, MIDDLE_GRAY });
export const { els, DISC_R, handlePos, yToToeL, toeLToY } = P;

// Per-swatch promoted Pantone selections (swatch index → pantone entry)
export const pantoneSelections = new Map();
