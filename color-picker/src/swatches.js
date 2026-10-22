// Swatch DOM & selection: building/updating swatch elements, the +/delete
// buttons, wiring per-swatch click/drag interactions, and active/multi-select
// state — selection visuals, the mesh that connects multi-selected handles,
// and the picker-background tint.

import { MIDDLE_GRAY, MAX_COLORS, GAMUT_ICON_SVG, CLOSE_ICON_SVG } from './constants.js';
import { S, P, els, pantoneSelections, handlePos } from './state.js';
import { idxOf, meshEdgesFor } from './picker.js';
import { computeP3AndSRGB, neutralP3, cielabL, cielabLOfSrgb } from './color.js';
import { updateSwatchCMYK, isOutOfCMYK } from './cmyk.js';
import { buildMatchCells, matchRowObserver, updateSwatchMatches } from './pantone.js';
import { syncModKeys, requestRender } from './util.js';
import { flushPendingWheelSnapshot, recordSnapshot } from './history.js';

// Swatch DOM helpers

function swatchEl(i) { return els.swatches.querySelector(`[data-index="${i}"]`); }

function updateSwatch(index) {
  const container = swatchEl(index);
  if (!container) return;
  const { p3Css, p3Str, srgbCss, hex, outOfSRGB } = computeP3AndSRGB(S.colors[index]);

  const srgbSwatchEl = container.querySelector('.color-swatch.srgb');
  srgbSwatchEl.style.background = srgbCss;
  srgbSwatchEl.style.setProperty('--region-bg', srgbCss);
  const p3SwatchEl = container.querySelector('.color-swatch.p3');
  p3SwatchEl.style.background = p3Css;
  p3SwatchEl.style.setProperty('--region-bg', p3Css);
  // The chip strip's backdrop (swatch color, or promoted Pantone color) is
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

  // CIELAB L* (D50, 0–100) readout — the "Lab lightness" a P3 doc reports in
  // Photoshop. sRGB shows the clamped hex's L*, P3 the true color's (they differ
  // only when out of sRGB). CMYK's own L* is set in updateSwatchCMYK (the proof's,
  // which tracks the bias slider).
  const nH = parseInt(hex.slice(1), 16);
  const srgbLtxt = `[${cielabLOfSrgb(((nH >> 16) & 255)/255, ((nH >> 8) & 255)/255, (nH & 255)/255).toFixed(3)}]`;
  const srgbLEl = container.querySelector('.color-swatch.srgb .lightness-readout');
  if (srgbLEl && srgbLEl.textContent !== srgbLtxt) srgbLEl.textContent = srgbLtxt;
  const p3Ltxt = `[${cielabL(S.colors[index]).toFixed(3)}]`;
  const p3LEl = container.querySelector('.color-swatch.p3 .lightness-readout');
  if (p3LEl && p3LEl.textContent !== p3Ltxt) p3LEl.textContent = p3Ltxt;

  container.classList.toggle('out-of-srgb', outOfSRGB);
  container.classList.toggle('light', S.colors[index].L > MIDDLE_GRAY);

  updateSwatchCMYK(container, S.colors[index], index);
  fitTopBars(container);
}

// A region's label row (badge + values) that doesn't fit on one line wraps to
// two: the badge alone, then the values (.wrapped; user decision 2026-10-21).
// Decided from the row's one-line width — the sum of its items, which wrapping
// doesn't change — against the room it has (region width less its inset and
// the delete button's 20px), so it can't flip-flop. Then measure how much
// taller each row came out, so what's positioned below it moves down by that
// much: --srgb-extra (the out-of-sRGB strip and the P3 row under it) and
// --cmyk-extra (the CMYK slider). Runs on every
// swatch update and when the swatch resizes.
const ROW_GAP = 4, DELETE_ROOM = 20;
function fitBar(bar) {
  const region = bar?.parentElement;
  if (!bar || !region || !region.offsetWidth) return 0;   // region hidden
  bar.classList.remove('wrapped');   // measure the one-line widths unwrapped (same frame, never painted)
  const items = [];
  for (const ch of bar.children) {
    if (ch.matches('.p3-readout, .cmyk-readout')) items.push(...ch.children); else items.push(ch);
  }
  const widths = items.map(x => x.offsetWidth).filter(w => w > 0);
  const oneLine = widths.reduce((a, b) => a + b, 0) + ROW_GAP * Math.max(0, widths.length - 1);
  bar.classList.toggle('wrapped', oneLine > region.clientWidth - bar.offsetLeft - DELETE_ROOM);
  const badge = bar.querySelector('.region-badge');
  const extra = bar.offsetHeight - (badge ? badge.offsetHeight : bar.offsetHeight);
  return extra > 3 ? extra : 0;
}
function setExtra(container, name, px) {
  const v = `${px}px`;
  if (container.style.getPropertyValue(name) !== v) container.style.setProperty(name, v);
}
// The promoted library color's row (library badge, color name, gamut icon,
// close box) wraps the same way: badge alone, then the rest.
function fitPromoted(cell) {
  if (!cell || !cell.offsetWidth) return;
  cell.classList.remove('wrapped');
  const cs = getComputedStyle(cell);
  const room = cell.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const oneLine = [...cell.children].reduce((sum, ch) => sum + ch.offsetWidth, 0);   // (no flex gap)
  cell.classList.toggle('wrapped', oneLine > room);
}
function fitTopBars(container) {
  setExtra(container, '--srgb-extra', fitBar(container.querySelector('.color-swatch.srgb .swatch-top-bar')));
  fitBar(container.querySelector('.color-swatch.p3 .swatch-top-bar'));
  setExtra(container, '--cmyk-extra', fitBar(container.querySelector('.color-swatch.cmyk .swatch-top-bar')));
  fitPromoted(container.querySelector('.promoted-cell'));
}
const topBarObserver = new ResizeObserver(entries => { for (const e of entries) fitTopBars(e.target); });

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
      <span class="icon delete-swatch">${CLOSE_ICON_SVG}</span>
      <div class="color-row">
        <div class="color-stack">
          <div class="color-swatch srgb" style="background:${srgbCss};--region-bg:${srgbCss}">
            <div class="swatch-top-bar">
              <span class="region-badge">sRGB</span>
              <div class="swatch-readout srgb">${hex}</div>
              <span class="lightness-readout"></span>
            </div>
          </div>
          <div class="color-swatch p3" style="background:${p3Css};--region-bg:${p3Css}">
            <div class="swatch-top-bar">
              <span class="p3-readout"><span class="p3-tag region-badge">P3</span><span class="p3-v"></span><span class="p3-v"></span><span class="p3-v"></span><span class="icon gamut-warning">${GAMUT_ICON_SVG}</span><span class="lightness-readout"></span></span>
            </div>
          </div>
        </div>
        <div class="color-swatch cmyk">
          <div class="swatch-top-bar">
            <span class="cmyk-readout"><span class="cmyk-tag region-badge">CMYK</span><span class="cmyk-v">0-0-0-0</span><span class="icon gamut-warning cmyk-gamut">${GAMUT_ICON_SVG}</span><button type="button" class="cmyk-alt-check" role="checkbox" aria-checked="false" title="Use the book's CMYK for this color"><span class="cmyk-alt-box" aria-hidden="true"><svg class="cmyk-alt-mark" viewBox="0 0 16.17 15.09"><polygon points="13.51 0 5.61 9.8 2.46 6.75 0 9.21 5.88 15.09 16.17 2.2 13.51 0"/></svg></span><span class="cmyk-alt-label">BOOK</span></button><span class="lightness-readout"></span></span>
          </div>
          <div class="cmyk-swatch-bias">
            <div class="cmyk-bias-track">
              <input type="range" class="cmyk-bias-slider" min="0" max="100" value="0" step="1"
                     aria-label="Move this swatch's CMYK build from the exact lightness toward Adobe's build">
            </div>
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
    topBarObserver.unobserve(sw);
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

// Rebuild the palette to match `list` (color descriptors {h,s,L}): trim
// extra swatches, overwrite the ones that remain, and create handles + swatch
// DOM for any new indices. Callers own selection, promotion and history.
function setPalette(list) {
  while (S.colors.length > list.length) removeColorAt(S.colors.length - 1);
  for (let i = 0; i < S.colors.length; i++) {
    S.colors[i] = { h: list[i].h, s: list[i].s, L: list[i].L };
  }
  for (let i = S.colors.length; i < list.length; i++) {
    S.colors.push({ h: list[i].h, s: list[i].s, L: list[i].L });
    P.createHandle(i);
    P.createLightHandle(i);
    wireSwatch(createSwatchDOM(i));
  }
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

// Shared behavior of the two gamut icons: binary-search the largest OKHSL
// saturation (same hue/lightness) still inside the gamut per `isOut`, apply
// it, drop any promoted Pantone, repaint, and snapshot. `hi` is the search's
// upper bound — 1 for sRGB, the current s for CMYK.
function pullIntoGamut(container, isOut, hi) {
  const ci = idxOf(container), { h, L } = S.colors[ci];
  let lo = 0;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (isOut({ h, s: mid, L })) hi = mid; else lo = mid;
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
}

function wireSwatch(container) {
  topBarObserver.observe(container);
  // sRGB gamut icon (the first .gamut-warning in the swatch is the P3 bar's):
  // reduce chroma at the same hue/lightness until the color falls inside sRGB.
  container.querySelector('.gamut-warning')?.addEventListener('click', e => {
    e.stopPropagation();
    pullIntoGamut(container, c => computeP3AndSRGB(c).outOfSRGB, 1);
  });

  // CMYK gamut icon: same gesture against the CMYK gamut.
  container.querySelector('.cmyk-gamut')?.addEventListener('click', e => {
    e.stopPropagation();
    pullIntoGamut(container, isOutOfCMYK, S.colors[idxOf(container)].s);
  });

  // "BOOK" checkbox on the CMYK readout's row (shown only when this swatch's
  // promoted color has a CMYK alternate in its library, e.g. Pantone Color
  // Bridge): switches this swatch's CMYK output to that alternate. The choice
  // lives on the element, keyed to the promoted color, so demoting (or
  // promoting another color) clears it — see updateSwatchCMYK.
  container.querySelector('.cmyk-alt-check')?.addEventListener('click', e => {
    e.stopPropagation();
    const ci = idxOf(container), p = pantoneSelections.get(ci);
    if (!p || !p.cbCMYK) return;
    if (container.dataset.cmykLibKey === p.key) delete container.dataset.cmykLibKey;
    else container.dataset.cmykLibKey = p.key;
    updateSwatchCMYK(container, S.colors[ci], ci);
    fitTopBars(container);   // the CMYK value's length may have changed
  });

  // Per-swatch CMYK slider (visible only on out-of-gamut CMYK swatches): the
  // default build — exact hue and lightness (0) ↔ Adobe's build (100); see cmyk.js. Its
  // value biases just this swatch's build; updateSwatchCMYK reads it. Magnetic
  // snap to 0 (the default build) near the low end. Repaint only this
  // swatch's CMYK region — the gamut ring and other swatches are unaffected.
  const biasSlider = container.querySelector('.cmyk-bias-slider');
  biasSlider?.addEventListener('input', e => {
    const sl = e.currentTarget;
    if (+sl.value <= 5) sl.value = '0';
    const ci = idxOf(container);
    updateSwatchCMYK(container, S.colors[ci], ci);
    fitTopBars(container);   // the CMYK value's length may have changed
  });
  // A finished drag leaves the input FOCUSED, which pins the slider's hover alpha
  // via :focus-within until something else is clicked. Release focus when the
  // pointer interaction ends (keyboard focus/adjustment is unaffected).
  biasSlider?.addEventListener('pointerup', e => e.currentTarget.blur());

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



// Multi-select visuals

function clearMultiVisuals() {
  els.swatches.querySelectorAll('.swatch-container.multi-selected')
    .forEach(el => el.classList.remove('multi-selected'));
  P.handles.forEach(h => h.classList.remove('multi'));
  P.lightHandles.forEach(h => h.classList.remove('multi'));
}

function applyMultiVisuals() {
  for (const i of S.multiSelect) {
    swatchEl(i)?.classList.add('multi-selected');
    P.handles[i]?.classList.add('multi');
    P.lightHandles[i]?.classList.add('multi');
  }
}


// Mesh edges

function computeFrozenEdges() {
  const indices = [...S.multiSelect];
  const pts = indices.map(i => handlePos(S.colors[i]));
  const localEdges = meshEdgesFor(pts);
  S.frozenEdges = localEdges.map(([a, b]) => [indices[a], indices[b]]);
}

function updateMesh() {
  if (!S.isMultiMode() || !S.frozenEdges) { P.clearMesh(); return; }
  const guidesActive = (S.pointerInPickerWrap || S.dragging) && (S.modKeys.shift || S.modKeys.meta);
  if (guidesActive) { P.clearMesh(); return; }
  const refIdx = S.multiSelect.has(S.activeIndex) ? S.activeIndex : [...S.multiSelect][0];
  const stroke = S.colors[refIdx]?.L > MIDDLE_GRAY ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)';
  P.updateMesh(S.frozenEdges, i => handlePos(S.colors[i]), stroke);
}


// Background

function updateBackground() {
  // Nothing selected: drop the lightness tint and let the page background show
  // through the color map panel (the frame + body behind it are the body bg).
  if (S.activeIndex === -1) {
    els.pickerWrap.style.backgroundColor = 'transparent';
    els.pickerWrap.classList.remove('light-bg');
    return;
  }
  const L = S.colors[S.activeIndex]?.L ?? 0.5;
  els.pickerWrap.style.backgroundColor = neutralP3(L);
  els.pickerWrap.classList.toggle('light-bg', L > MIDDLE_GRAY);
}


// Selection management

function setHandles(i, active) {
  P.setHandleActive(P.handles[i], active);
  P.setHandleActive(P.lightHandles[i], active);
}

function activateSwatch(i) {
  setHandles(i, true);
  swatchEl(i)?.classList.add('selected');
}

function deactivateSwatch(i) {
  if (i === -1) return;
  setHandles(i, false);
  swatchEl(i)?.classList.remove('selected');
}

function clearAllHandleActive() {
  P.handles.forEach(h => h?.classList.remove('active'));
  P.lightHandles.forEach(h => h?.classList.remove('active'));
}

function exitMultiSelect() {
  S.multiSelect.clear();
  S.frozenEdges = null;
  clearMultiVisuals();
  updateMesh();
}

function setActive(index, { silent = false } = {}) {
  exitMultiSelect();
  deactivateSwatch(S.activeIndex);
  clearAllHandleActive();
  S.activeIndex = index;
  els.swatches.classList.remove('none-selected');
  activateSwatch(index);
  els.discOverlay.appendChild(P.handles[index]);
  els.lightbarOverlay.appendChild(P.lightHandles[index]);
  if (!silent) requestRender();
}

function toggleMultiSelect(index) {
  if (!S.isMultiMode() && S.activeIndex !== -1 && S.activeIndex !== index) {
    swatchEl(S.activeIndex)?.classList.remove('selected');
    setHandles(S.activeIndex, false);
    S.multiSelect.add(S.activeIndex);
  }
  if (!S.multiSelect.has(index)) S.multiSelect.add(index);
  applyMultiVisuals();
  if (S.multiSelect.has(index)) S.activeIndex = index;
  els.swatches.classList.remove('none-selected');
  computeFrozenEdges();
  requestRender();
}

function deselect() {
  exitMultiSelect();
  deactivateSwatch(S.activeIndex);
  clearAllHandleActive();
  S.activeIndex = -1;
  els.swatches.classList.add('none-selected');
  P.render();
}



export { swatchEl, updateSwatch, createSwatchDOM, reindex, removeColorAt, setPalette, wireSwatch, updateAddButton };
export {
  setActive, toggleMultiSelect, deselect, setHandles, deactivateSwatch,
  activateSwatch, exitMultiSelect, applyMultiVisuals, computeFrozenEdges,
  updateMesh, updateBackground,
};
