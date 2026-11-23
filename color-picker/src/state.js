// Shared application state: the central state object `S`, the picker
// instance `P` (plus its derived geometry and DOM refs), and the map of
// per-swatch promoted Pantone selections. Every feature module imports
// from here, which is what lets the app be split without circular data.

import { createPicker } from './picker.js?v=917f20e';
import {
  DISC_SIZE, DISC_LB_GAP, LB_WIDTH, LB_HEIGHT, HANDLE_R, HANDLE_SW,
  MIDDLE_GRAY,
} from './constants.js?v=917f20e';

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
  // Shift / Meta redraw the wheel (its guides) only while the
  // pointer is over the wheel or the lightbar, or hovers a handle, or a drag
  // is under way (user decision 2026-11-22; was anywhere over the color map panel).
  modGuidesLive() { return this.pointerInPicker || this.pointerInLightbar || this.hoveredHandle !== -1 || this.dragging; },
  dragging:          false,
  mouseHueAngle:     0,
  hoveredHandle:     -1,

  discChromaLock: null,
  hueConvergeDrag:  null,

  libraryFilters: { base: true },    // base: matches on. Always, since Libraries has no section switch (2026-11-22); each library has its own
};

// Renderer + derived geometry
export const P = createPicker(S, { DISC_SIZE, DISC_LB_GAP, LB_WIDTH, LB_HEIGHT, HANDLE_R, HANDLE_SW, MIDDLE_GRAY });
export const { els, DISC_R, handlePos, yToToeL, toeLToY } = P;

// Per-swatch promoted Pantone selections (swatch index → pantone entry)
export const pantoneSelections = new Map();
