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
import { updateSwatch, createSwatchDOM, wireSwatch, swatchEl, updateAddButton } from './swatches.js';
import { updateSwatchMatches, updateDots, scheduleMatches, loadPantoneLibrary } from './pantone.js';
import { updateBackground, updateMesh, setActive } from './selection.js';
import { syncHexField, hexTextarea } from './hex.js';
import { recordSnapshot } from './history.js';
import { applyBgLevel } from './interactions.js';


// Render patch

const _coreRender = P.render.bind(P);
P.render = function () {
  _coreRender();
  // updateSwatch (swatch colour/readout) is cheap and always synchronous so
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
  syncHexField();
};

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
loadPantoneLibrary();
