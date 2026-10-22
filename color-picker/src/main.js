// make p3 color values stack when space is limited.
// add tool section labels for PANTONE, CMYK, and a new EXPORT section with buttons and options, so that SVGs with RGB colors can be exported. Also consider adding tool labels to the existing sections, and an 'info' button top left, which pops open a user guide
// add swatch options section on left, which includes visual feedback on background color for viewing, and also a gap/no-gap checkbox for swatch display.
// CMYK should have an option to display either an adobe conversion OR a Pantone color bridge option if the color has a selected Pantone active.
// Consider restricting lightness context background to only hue wheel itself, rather than rest of interface, which could become part of background or fixed at mid gray
// consider viability of integrating pantone/cmyk visibility options on a per-swatch basis, without relying on checkboxes above (may not be best idea)

// Entry point: wires the feature modules together, installs the render
// patch that keeps swatches/background/mesh/dots/hex in sync, and runs
// the initial setup.

import { S, P, els } from './state.js';
import { updateSwatch, createSwatchDOM, wireSwatch, swatchEl, updateAddButton, updateBackground, updateMesh, setActive } from './swatches.js';
import { updateSwatchMatches, updateDots, scheduleMatches } from './pantone.js';
import { initLibraries } from './libraries.js';
import { syncStateField } from './state-console.js';
import { recordSnapshot } from './history.js';
import { applyBgLevel } from './interactions.js';
import { setCMYKActive, setCMYKProfile, cmyk } from './cmyk.js';
import './mode.js';


// Render patch

const _coreRender = P.render.bind(P);
P.render = function () {
  _coreRender();
  // updateSwatch (swatch color/readout) is cheap and always synchronous so
  // the palette tracks changes exactly. During an active drag the expensive
  // Pantone match recompute is coalesced to one pass per frame via
  // scheduleMatches; the settled (non-drag) state recomputes synchronously
  // so chips are always correct without depending on a future frame.
  if (S.dragging) {
    if (S.isMultiMode()) {
      S.multiSelect.forEach(updateSwatch);
      scheduleMatches(S.multiSelect);
    } else if (S.activeIndex !== -1) {
      updateSwatch(S.activeIndex);
      scheduleMatches([S.activeIndex]);
    }
  } else {
    S.colors.forEach((_, i) => { updateSwatch(i); updateSwatchMatches(i); });
  }
  updateBackground();
  updateMesh();
  updateDots();
  syncStateField();
};

// Tool sections: Libraries and CMYK are each switched on and off by the
// checkbox in their header (.open marks a section on; the body always shows).
// View state only — never in undo history. The Libraries checkbox also switches
// library matches on and off (wired in pantone.js); the CMYK one drives CMYK
// "mode" (convert + show per swatch). (No section collapses any more — State
// was the last collapsible one, 2026-10-21.)
// While a section is switched off its (faded) body is inert — no clicks,
// hover, typing or keyboard focus — so nothing faded is usable (user decision
// 2026-10-21). Only the header switch stays live.
document.querySelectorAll('.section-toggle').forEach(cb => {
  const section = cb.closest('.ui-section');
  const body = section.querySelector('.section-body');
  const sync = () => {
    section.classList.toggle('open', cb.checked);
    if (body) body.inert = !cb.checked;
  };
  cb.addEventListener('change', sync);
  if (cb.id === 'toggle-cmyk') cb.addEventListener('change', () => setCMYKActive(cb.checked));
  sync();
});

// Init

applyBgLevel();
P.createHandle(0);
P.createLightHandle(0);
wireSwatch(createSwatchDOM(0));
els.swatches.classList.add('none-selected');
setActive(0);
P.render();
updateAddButton();
recordSnapshot();
initLibraries();

// Pre-warm the default CMYK profile (transforms + gamut LUT) in the background so
// switching CMYK on the first time is instant — no fetch/build delay. The build runs
// after the profile fetch resolves, so it doesn't block the initial paint.
setCMYKProfile(cmyk.profileKey);
