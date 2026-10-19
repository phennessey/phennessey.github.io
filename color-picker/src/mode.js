// Gamut mode switch: the "P3" switch in the color map panel. On (the
// default) = P3 mode; off = sRGB mode, where the wheel is Ottosson's
// original OKHSL — the disc edge is the sRGB boundary — and every colour the
// interface shows is limited to sRGB. Switching keeps each swatch's actual
// colour: its saturation is re-measured in the new gamut, and a colour outside
// sRGB moves to the rim at the same hue and lightness.

import { S, P, pantoneSelections } from './state.js';
import { getGamutMode, setGamutMode, resaturate } from './color.js';
import { remapPantoneToGamut } from './pantone.js';
import { refreshCMYKGamut } from './cmyk.js';
import { flushPendingWheelSnapshot } from './history.js';

const toggle = document.getElementById('gamut-toggle');

function switchGamut(mode) {
  const from = getGamutMode();
  if (mode === from) return;
  flushPendingWheelSnapshot();

  setGamutMode(mode);
  for (const c of S.colors) c.s = resaturate(c, from, mode);
  remapPantoneToGamut();
  // A promoted swatch IS its Pantone: re-place it from the Pantone's own
  // position in the new gamut, so a round trip through sRGB restores it.
  for (const [i, entry] of pantoneSelections) {
    if (S.colors[i]) S.colors[i].s = Math.min(1, entry.s);
  }
  refreshCMYKGamut();

  P.invalidateCache();
  P.render();
  toggle?.setAttribute('aria-checked', String(mode === 'p3'));
}

// A view setting, not an edit: stop the pointerdown so the document-level
// handlers don't record the switch as an undo step.
toggle?.addEventListener('pointerdown', e => e.stopPropagation());

// Move the switch first, then redraw: flip it now so the dot starts sliding on
// this frame, and run the ~50 ms of re-placing and repainting two frames later,
// once the slide is underway. `target` tracks rapid clicks, so the redraw
// always lands on the switch's final position.
let target = getGamutMode();
toggle?.addEventListener('click', () => {
  target = target === 'p3' ? 'srgb' : 'p3';
  toggle.setAttribute('aria-checked', String(target === 'p3'));
  requestAnimationFrame(() => requestAnimationFrame(() => switchGamut(target)));
});

export { switchGamut };
