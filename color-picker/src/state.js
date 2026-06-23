// Shared application state: the central state object `S`, the picker
// instance `P` (plus its derived geometry and DOM refs), and the map of
// per-swatch promoted Pantone selections. Every feature module imports
// from here, which is what lets the app be split without circular data.

import { createPicker } from './picker.js';
import {
  DISC_SIZE, DISC_LB_GAP, LB_WIDTH, LB_HEIGHT, HANDLE_R, HANDLE_SW,
  MIDDLE_GRAY,
} from './constants.js';

export const S = {
  colors:          [{ h: 0, s: 0, L: MIDDLE_GRAY }],
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
};

// Renderer + derived geometry
export const P = createPicker(S, { DISC_SIZE, DISC_LB_GAP, LB_WIDTH, LB_HEIGHT, HANDLE_R, HANDLE_SW, MIDDLE_GRAY });
export const { els, DISC_R, handlePos, yToToeL, toeLToY } = P;

// Per-swatch promoted Pantone selections (swatch index → pantone entry)
export const pantoneSelections = new Map();
