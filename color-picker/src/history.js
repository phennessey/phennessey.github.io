// Undo/redo: snapshotting swatch state and restoring it.

import { HISTORY_LIMIT, WHEEL_DEBOUNCE_MS } from './constants.js';
import { S, els, pantoneSelections } from './state.js';
import {
  setPalette, reindex, updateSwatch, updateAddButton, swatchEl,
  exitMultiSelect, deactivateSwatch, setActive, setHandles, applyMultiVisuals, computeFrozenEdges,
} from './swatches.js';
import { findPantoneByKey, updateMatchesVisibility } from './pantone.js';
import { activateLibraries } from './libraries.js';
import { requestRender } from './util.js';
import { hexTextarea } from './hex.js';
import { getGamutMode, resaturate } from './color.js';

// History

let history      = [];
let historyIndex = -1;
let wheelSnapshotTimer = null;
let pointerSnapshot    = null;

// Each entry records the gamut mode its `s` was measured in (saturation is
// relative to the gamut), so a snapshot restored after a mode switch is
// re-measured in the current mode instead of being misread.
function takeSnapshot() {
  const mode = getGamutMode();
  return S.colors.map((c, i) => ({
    h: c.h, s: c.s, L: c.L, mode,
    selected: i === S.activeIndex || S.multiSelect.has(i),
    pantoneKey: pantoneSelections.get(i)?.key ?? null,
  }));
}

// Selection is not undoable, so it's excluded here: selecting a different swatch
// (with no color/order/promotion change) must NOT create a history entry. The
// per-swatch `selected` flag is still recorded — but only to restore a multi-edit
// group on undo/redo (see restoreSnapshot).
function snapshotsEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].h !== b[i].h || a[i].s !== b[i].s || a[i].L !== b[i].L
        || a[i].pantoneKey !== b[i].pantoneKey) return false;
  }
  return true;
}

function recordSnapshot() {
  const snap = takeSnapshot();
  if (historyIndex >= 0 && snapshotsEqual(snap, history[historyIndex])) return;
  history.length = historyIndex + 1;
  history.push(snap);
  if (history.length > HISTORY_LIMIT) history.shift();
  else historyIndex++;
}

function scheduleWheelSnapshot() {
  if (wheelSnapshotTimer) clearTimeout(wheelSnapshotTimer);
  wheelSnapshotTimer = setTimeout(() => {
    wheelSnapshotTimer = null;
    recordSnapshot();
  }, WHEEL_DEBOUNCE_MS);
}

function flushPendingWheelSnapshot() {
  if (wheelSnapshotTimer) {
    clearTimeout(wheelSnapshotTimer);
    wheelSnapshotTimer = null;
    recordSnapshot();
  }
}

document.addEventListener('pointerdown', () => {
  flushPendingWheelSnapshot();
  pointerSnapshot = takeSnapshot();
});

document.addEventListener('pointerup', () => {
  const before = pointerSnapshot;
  pointerSnapshot = null;
  if (!before) return;
  queueMicrotask(() => {
    if (!snapshotsEqual(before, takeSnapshot())) recordSnapshot();
  });
});

function restoreSnapshot(snap) {
  // Selection is not undoable: remember the current selection so the revert can
  // keep it. The one exception is a multi-edit snapshot, which restores its group.
  const prevActive = S.activeIndex;
  const prevMulti  = new Set(S.multiSelect);

  exitMultiSelect();

  if (S.activeIndex < S.colors.length) deactivateSwatch(S.activeIndex);
  S.activeIndex = -1;

  pantoneSelections.clear();

  const mode = getGamutMode();
  setPalette(snap.map(e => e.mode === mode ? e : { ...e, s: resaturate(e, e.mode, mode) }));

  const neededLibs = new Set();
  for (let i = 0; i < snap.length; i++) {
    const key = snap[i].pantoneKey;
    if (!key) continue;
    const entry = findPantoneByKey(key);
    if (!entry) continue;   // its library was removed since
    pantoneSelections.set(i, entry);
    // A promoted swatch IS its library color, so re-place it from the color
    // itself (rim-clamped in this gamut) rather than from the other mode's clip.
    if (snap[i].mode !== mode) S.colors[i].s = Math.min(1, entry.s);
    neededLibs.add(entry.libId);
  }
  if (neededLibs.size > 0) {
    // Show what the restored promotions need: the Libraries section open and
    // their libraries switched on (view state; no history of its own).
    S.libraryFilters.base = true;
    const toggle = document.getElementById('toggle-libraries');
    if (toggle && !toggle.checked) { toggle.checked = true; toggle.dispatchEvent(new Event('change')); }
    activateLibraries(neededLibs);
    updateMatchesVisibility();
  }

  reindex();
  S.colors.forEach((_, i) => updateSwatch(i));

  // Selection. By default keep whatever was selected before the undo/redo so the
  // revert doesn't move the user's selection. The one exception: a multi-swatch
  // edit restores its own group, so undoing/redoing a multi change keeps that
  // group selected. (Indices are clamped — a reverted add/remove can shrink the
  // palette.)
  const applyMulti = (indices) => {
    for (const i of indices) S.multiSelect.add(i);
    S.activeIndex = indices[0];
    setHandles(S.activeIndex, true);
    els.swatches.classList.remove('none-selected');
    applyMultiVisuals();
    computeFrozenEdges();
    requestRender();
  };

  const snapMulti = snap.reduce((acc, s, i) => { if (s.selected) acc.push(i); return acc; }, [])
                        .filter(i => i < S.colors.length);
  const prevMultiValid = [...prevMulti].filter(i => i < S.colors.length);

  if (snapMulti.length > 1) {
    applyMulti(snapMulti);                 // restore the multi-edit's group
  } else if (prevMultiValid.length > 1) {
    applyMulti(prevMultiValid);            // preserve an existing multi-selection
  } else if (prevActive >= 0 && prevActive < S.colors.length) {
    setActive(prevActive);                 // preserve the single selection
  } else {
    els.swatches.classList.add('none-selected');
    requestRender();
  }

  updateAddButton();
}

function undo() {
  flushPendingWheelSnapshot();
  if (historyIndex <= 0) return;
  historyIndex--;
  restoreSnapshot(history[historyIndex]);
}

function redo() {
  flushPendingWheelSnapshot();
  if (historyIndex >= history.length - 1) return;
  historyIndex++;
  restoreSnapshot(history[historyIndex]);
}

document.addEventListener('keydown', e => {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod || e.key.toLowerCase() !== 'z') return;
  // Text fields (the hex box, library names) keep their own undo.
  if (document.activeElement === hexTextarea || document.activeElement?.matches('input[type="text"]')) return;
  e.preventDefault();
  if (e.shiftKey) redo(); else undo();
});



export { recordSnapshot, flushPendingWheelSnapshot, scheduleWheelSnapshot };
