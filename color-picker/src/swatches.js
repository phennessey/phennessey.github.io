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

  // CIELAB L* (D50, 0–100) readout — the "Lab lightness" a P3 doc reports in
  // Photoshop. sRGB shows the clamped hex's L*, P3 the true colour's (they differ
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
            <span class="cmyk-readout"><span class="cmyk-tag region-badge">CMYK</span><span class="cb-tag region-badge">CB</span><span class="cmyk-v">0-0-0-0</span><span class="icon gamut-warning cmyk-gamut">${GAMUT_ICON_SVG}</span><span class="lightness-readout"></span></span>
          </div>
          <div class="cmyk-swatch-bias">
            <div class="cmyk-bias-track">
              <input type="range" class="cmyk-bias-slider" min="0" max="100" value="0" step="1"
                     aria-label="CMYK build lightness for this swatch">
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

// Rebuild the palette to match `list` (colour descriptors {h,s,L}): trim
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

// Shared behaviour of the two gamut icons: binary-search the largest OKHSL
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
  // sRGB gamut icon (the first .gamut-warning in the swatch is the P3 bar's):
  // reduce chroma at the same hue/lightness until the colour falls inside sRGB.
  container.querySelector('.gamut-warning')?.addEventListener('click', e => {
    e.stopPropagation();
    pullIntoGamut(container, c => computeP3AndSRGB(c).outOfSRGB, 1);
  });

  // CMYK gamut icon: same gesture against the CMYK gamut.
  container.querySelector('.cmyk-gamut')?.addEventListener('click', e => {
    e.stopPropagation();
    pullIntoGamut(container, isOutOfCMYK, S.colors[idxOf(container)].s);
  });

  // Per-swatch CMYK build-lightness slider (visible only on out-of-gamut CMYK
  // swatches). Its value biases just this swatch's build; updateSwatchCMYK reads
  // it. Magnetic snap to 0 (standard clip) near the low end. Repaint only this
  // swatch's CMYK region — the gamut ring and other swatches are unaffected.
  const biasSlider = container.querySelector('.cmyk-bias-slider');
  biasSlider?.addEventListener('input', e => {
    const sl = e.currentTarget;
    if (+sl.value <= 5) sl.value = '0';
    const ci = idxOf(container);
    updateSwatchCMYK(container, S.colors[ci], ci);
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
