// Active-swatch and multi-select state: selection visuals, the mesh that
// connects multi-selected handles, and the picker-background tint.

import { MIDDLE_GRAY } from './constants.js';
import { S, P, els, handlePos } from './state.js';
import { meshEdgesFor } from './picker.js';
import { neutralP3 } from './color.js';
import { swatchEl } from './swatches.js';
import { invalidateAndRender } from './util.js';

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
  const guidesActive = (S.mouseInPickerWrap || S.dragging) && (S.modKeys.shift || S.modKeys.meta);
  if (guidesActive) { P.clearMesh(); return; }
  const refIdx = S.multiSelect.has(S.activeIndex) ? S.activeIndex : [...S.multiSelect][0];
  const stroke = S.colors[refIdx]?.L > MIDDLE_GRAY ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)';
  P.updateMesh(S.frozenEdges, i => handlePos(S.colors[i]), stroke);
}


// Background

function updateBackground() {
  const idx = S.activeIndex !== -1 ? S.activeIndex : S.lastActiveIndex;
  const L = S.colors[idx]?.L ?? 0.5;
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
  if (!silent) invalidateAndRender();
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
  invalidateAndRender();
}

function deselect() {
  exitMultiSelect();
  deactivateSwatch(S.activeIndex);
  clearAllHandleActive();
  S.activeIndex = -1;
  els.swatches.classList.add('none-selected');
  P.render();
}



export {
  setActive, toggleMultiSelect, deselect, setHandles, deactivateSwatch,
  activateSwatch, exitMultiSelect, applyMultiVisuals, computeFrozenEdges,
  updateMesh, updateBackground,
};
