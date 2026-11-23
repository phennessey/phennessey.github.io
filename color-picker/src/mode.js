// Gamut mode switch: SRGB · P3 · P3A in the color map panel. P3 (the default)
// measures the wheel against Display P3; sRGB mode is Ottosson's original
// OKHSL, where the disc edge is the sRGB boundary and every color the
// interface shows is limited to sRGB; P3A is the PROLED XDR "P3 + Adobe RGB"
// panel (color.js). Switching keeps each swatch's actual color: its
// saturation is re-measured in the new gamut, and a color outside it moves to
// the rim at the same hue and lightness.

import { S, P, pantoneSelections } from './state.js';
import { getGamutMode, setGamutMode, resaturate, GAMUT_MODES } from './color.js';
import { remapPantoneToGamut } from './pantone.js';
import { refreshCMYKGamut } from './cmyk.js';
import { flushPendingWheelSnapshot } from './history.js';

const group = document.getElementById('gamut-switch');
const radios = group ? [...group.querySelectorAll('[role="radio"]')] : [];

function showMode(mode) {
  for (const r of radios) {
    const on = r.dataset.mode === mode;
    r.setAttribute('aria-checked', String(on));
    r.tabIndex = on ? 0 : -1;
  }
}

function switchGamut(mode) {
  const from = getGamutMode();
  if (mode === from) return;
  flushPendingWheelSnapshot();

  setGamutMode(mode);
  for (const c of S.colors) c.s = resaturate(c, from, mode);
  remapPantoneToGamut();
  // A promoted swatch IS its library color: re-place it from that color's own
  // position in the new gamut, so a round trip through a smaller gamut restores it.
  for (const [i, entry] of pantoneSelections) {
    if (S.colors[i]) S.colors[i].s = Math.min(1, entry.s);
  }
  refreshCMYKGamut();

  P.invalidateCache();
  P.render();
  showMode(mode);
  target = mode;
}

// A view setting, not an edit: stop the pointerdown so the document-level
// handlers don't record the switch as an undo step.
group?.addEventListener('pointerdown', e => e.stopPropagation());

// Move the pill first, then redraw: show the new state on this frame, and run
// the re-placing and repainting two frames later. `target` tracks rapid
// clicks, so the redraw always lands on the switch's final position.
let target = getGamutMode();
function choose(mode) {
  target = mode;
  showMode(mode);
  requestAnimationFrame(() => requestAnimationFrame(() => switchGamut(target)));
}
group?.addEventListener('click', e => {
  const r = e.target.closest('[role="radio"]');
  if (r) choose(r.dataset.mode);
});
// Radio-group keys: arrows move the choice (and focus), wrapping at the ends.
group?.addEventListener('keydown', e => {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
  if (!step) return;
  e.preventDefault();
  const i = (GAMUT_MODES.indexOf(target) + step + GAMUT_MODES.length) % GAMUT_MODES.length;
  choose(GAMUT_MODES[i]);
  radios.find(r => r.dataset.mode === GAMUT_MODES[i])?.focus();
});

export { switchGamut };
