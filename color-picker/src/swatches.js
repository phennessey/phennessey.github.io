// Swatch DOM: building/updating swatch elements, the +/delete buttons,
// and wiring per-swatch click/drag interactions.

import { MIDDLE_GRAY, MAX_COLORS, GAMUT_ICON_SVG, CLOSE_ICON_SVG } from './constants.js';
import { S, P, els, pantoneSelections } from './state.js';
import { idxOf } from './picker.js';
import { computeP3AndSRGB } from './color.js';
import { updateSwatchCMYK, isOutOfCMYK } from './cmyk.js';
import { buildMatchCells, matchRowObserver, updateSwatchMatches } from './pantone.js';
import { setActive, toggleMultiSelect, activateSwatch, exitMultiSelect } from './selection.js';
import { syncModKeys, requestRender } from './util.js';
import { flushPendingWheelSnapshot, recordSnapshot } from './history.js';

// Swatch DOM helpers

function swatchEl(i) { return els.swatches.querySelector(`[data-index="${i}"]`); }

function updateSwatch(index) {
  const container = swatchEl(index);
  if (!container) return;
  const { p3Css, p3Str, srgbCss, hex, outOfSRGB } = computeP3AndSRGB(S.colors[index]);

  container.querySelector('.color-swatch.srgb').style.background = srgbCss;
  container.querySelector('.color-swatch.p3').style.background   = p3Css;
  // The chip strip's backdrop (swatch colour, or promoted Pantone colour) is
  // owned by updateSwatchMatches, which knows the promotion state.

  const srgbEl = container.querySelector('.swatch-readout.srgb');
  if (srgbEl.textContent !== hex) srgbEl.textContent = hex;

  // P3 components live in separate spans so CSS can lay them out as one
  // line or stack them as four (P3 / r / g / b) when the swatch is narrow.
  const vEls = container.querySelectorAll('.p3-readout .p3-v');
  const parts = p3Str.split(' ');
  for (let k = 0; k < 3; k++) {
    if (vEls[k] && vEls[k].textContent !== parts[k]) vEls[k].textContent = parts[k];
  }

  container.classList.toggle('out-of-srgb', outOfSRGB);
  container.classList.toggle('light', S.colors[index].L > MIDDLE_GRAY);

  updateSwatchCMYK(container, S.colors[index]);
}

function createSwatchDOM(index) {
  const { p3Css, p3Str, srgbCss, hex, outOfSRGB } = computeP3AndSRGB(S.colors[index]);
  const container = document.createElement('div');
  container.className     = 'swatch-container';
  container.dataset.index = index;
  if (outOfSRGB)                         container.classList.add('out-of-srgb');
  if (S.colors[index].L > MIDDLE_GRAY)   container.classList.add('light');
  if (index === S.activeIndex)           container.classList.add('selected');

  container.innerHTML = `
    <div class="swatch-inner">
      <div class="color-row">
        <div class="color-stack">
          <div class="color-swatch srgb" style="background:${srgbCss}">
            <span class="icon delete-swatch">${CLOSE_ICON_SVG}</span>
            <div class="swatch-top-bar">
              <div class="swatch-readout srgb">${hex}</div>
            </div>
          </div>
          <div class="color-swatch p3" style="background:${p3Css}">
            <div class="swatch-top-bar">
              <span class="icon gamut-warning">${GAMUT_ICON_SVG}</span>
              <span class="p3-readout"><span class="p3-tag">P3</span><span class="p3-v"></span><span class="p3-v"></span><span class="p3-v"></span></span>
            </div>
          </div>
        </div>
        <div class="color-swatch cmyk">
          <div class="swatch-top-bar">
            <span class="icon gamut-warning cmyk-gamut">${GAMUT_ICON_SVG}</span>
            <span class="cmyk-readout"><span class="cmyk-tag">CMYK</span><span class="cmyk-v">0-0-0-0</span></span>
          </div>
        </div>
      </div>
    </div>`;

  els.swatches.appendChild(container);
  buildMatchCells(container);
  return container;
}

function reindex() {
  P.handles.forEach((h, i) => h.dataset.index = i);
  P.lightHandles.forEach((h, i) => h.dataset.index = i);
  els.swatches.querySelectorAll('.swatch-container').forEach((c, i) => c.dataset.index = i);
}

function removeColorAt(i) {
  els.discOverlay.removeChild(P.handles[i]);
  els.lightbarOverlay.removeChild(P.lightHandles[i]);
  const sw = swatchEl(i);
  if (sw) {
    const mc = sw.querySelector('.match-cells');
    if (mc) matchRowObserver.unobserve(mc);
    els.swatches.removeChild(sw);
  }
  P.handles.splice(i, 1);
  P.lightHandles.splice(i, 1);
  S.colors.splice(i, 1);
  const remapped = new Map();
  for (const [k, p] of pantoneSelections) {
    if (k === i) continue;
    remapped.set(k > i ? k - 1 : k, p);
  }
  pantoneSelections.clear();
  for (const [k, p] of remapped) pantoneSelections.set(k, p);
}


// Swatch management

function addLastDuplicate() {
  if (S.colors.length >= MAX_COLORS) return -1;
  const source = S.colors[S.colors.length - 1];
  S.colors.push({ h: source.h, s: source.s, L: source.L });
  const i = S.colors.length - 1;
  P.createHandle(i);
  P.createLightHandle(i);
  wireSwatch(createSwatchDOM(i));
  setActive(i);
  updateAddButton();
  return i;
}

function wireSwatch(container) {
  [container.querySelector('.gamut-warning'), container.querySelector('.p3-readout')].forEach(el => {
    el?.addEventListener('click', e => {
      e.stopPropagation();
      const ci = idxOf(container), { h, L } = S.colors[ci];
      let lo = 0, hi = 1;
      for (let i = 0; i < 16; i++) {
        const mid = (lo + hi) / 2;
        if (computeP3AndSRGB({ h, s: mid, L }).outOfSRGB) hi = mid; else lo = mid;
      }
      S.colors[ci] = { ...S.colors[ci], h, s: lo, L };
      if (pantoneSelections.has(ci)) {
        pantoneSelections.delete(ci);
        updateSwatchMatches(ci);
      }
      if (ci === S.activeIndex) P.invalidateCache();
      updateSwatch(ci);
      P.render();
      flushPendingWheelSnapshot();
      recordSnapshot();
    });
  });

  // CMYK gamut icon: reduce chroma (OKHSL saturation) at the same hue/lightness
  // until the colour falls inside the CMYK gamut — the largest in-gamut s. Mirrors
  // the sRGB gamut icon above.
  container.querySelector('.cmyk-gamut')?.addEventListener('click', e => {
    e.stopPropagation();
    const ci = idxOf(container), { h, L } = S.colors[ci];
    let lo = 0, hi = S.colors[ci].s;
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2;
      if (isOutOfCMYK({ h, s: mid, L })) hi = mid; else lo = mid;
    }
    S.colors[ci] = { ...S.colors[ci], h, s: lo, L };
    if (pantoneSelections.has(ci)) {
      pantoneSelections.delete(ci);
      updateSwatchMatches(ci);
    }
    if (ci === S.activeIndex) P.invalidateCache();
    updateSwatch(ci);
    P.render();
    flushPendingWheelSnapshot();
    recordSnapshot();
  });

  container.querySelector('.delete-swatch').addEventListener('click', e => {
    e.stopPropagation();
    if (S.colors.length <= 1) return;
    const ci = idxOf(container);

    if (S.multiSelect.has(ci)) S.multiSelect.delete(ci);
    const shifted = new Set();
    for (const idx of S.multiSelect) shifted.add(idx > ci ? idx - 1 : idx);
    S.multiSelect.clear();
    for (const idx of shifted) S.multiSelect.add(idx);
    if (S.multiSelect.size < 2) exitMultiSelect();

    removeColorAt(ci);

    if (S.activeIndex === ci)    S.activeIndex = -1;
    else if (S.activeIndex > ci) S.activeIndex--;
    reindex();

    if (S.activeIndex !== -1) {
      activateSwatch(S.activeIndex);
    } else {
      setActive(Math.min(ci, S.colors.length - 1));
    }
    updateAddButton();
    requestRender();
    flushPendingWheelSnapshot();
    recordSnapshot();
  });

  container.addEventListener('click', e => {
    if (e.target.closest('.swatch-readout')) return;  // allow text selection
    syncModKeys(e);
    if (e.shiftKey || e.metaKey) toggleMultiSelect(idxOf(container));
    else setActive(idxOf(container));
  }, true);
  // Hover highlight is pure CSS (.swatch-container:hover) — no JS class needed.
}


// Add button

const addBtn = document.getElementById('add-color-btn');

function updateAddButton() {
  if (addBtn) addBtn.disabled = S.colors.length >= MAX_COLORS;
}

addBtn?.addEventListener('click', e => {
  e.stopPropagation();
  if (addLastDuplicate() !== -1) { flushPendingWheelSnapshot(); recordSnapshot(); }
});



export { swatchEl, updateSwatch, createSwatchDOM, reindex, removeColorAt, wireSwatch, updateAddButton };
