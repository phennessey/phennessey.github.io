// The hex textarea: reading swatch hex values out and applying pasted /
// entered hex lists back into the palette.

import { MAX_COLORS } from './constants.js';
import { S, pantoneSelections } from './state.js';
import { srgbToOKHSL } from './color.js';
import { swatchEl, setPalette, reindex, updateSwatch, updateAddButton, exitMultiSelect, setActive } from './swatches.js';
import { updateSwatchMatches } from './pantone.js';
import { flushPendingWheelSnapshot, recordSnapshot } from './history.js';

// Hex input

const hexTextarea = document.querySelector('.hex-input');

function syncHexField() {
  if (document.activeElement === hexTextarea) return;
  const lines = [];
  for (let i = 0; i < S.colors.length; i++) {
    const el = swatchEl(i)?.querySelector('.swatch-readout.srgb');
    lines.push(el?.textContent ?? '');
  }
  hexTextarea.value = lines.join('\n');
}

function parseHexList(text) {
  const out = [];
  for (const m of text.matchAll(/#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) {
    let h = m[1];
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    out.push([parseInt(h.slice(0,2),16)/255, parseInt(h.slice(2,4),16)/255, parseInt(h.slice(4,6),16)/255]);
  }
  return out;
}

function applyHexInput(rgbList) {
  if (!rgbList.length) return;
  if (rgbList.length > MAX_COLORS) rgbList = rgbList.slice(0, MAX_COLORS);
  exitMultiSelect();

  const priorPromotedKeys = [...pantoneSelections.keys()];
  pantoneSelections.clear();
  for (const k of priorPromotedKeys) updateSwatchMatches(k);

  setPalette(rgbList.map(rgb => srgbToOKHSL(...rgb)));

  S.activeIndex = -1;
  reindex();
  S.colors.forEach((_, i) => updateSwatch(i));
  setActive(0);
  updateAddButton();
  flushPendingWheelSnapshot();
  recordSnapshot();
}

hexTextarea.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const list = parseHexList(hexTextarea.value);
    if (list.length) applyHexInput(list);
    hexTextarea.blur();
  }
});

hexTextarea.addEventListener('paste', () => {
  setTimeout(() => {
    const list = parseHexList(hexTextarea.value);
    if (list.length) applyHexInput(list);
  }, 0);
});



export { hexTextarea, syncHexField };
