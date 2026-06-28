// Undo/redo: snapshotting swatch state and restoring it.

import { HISTORY_LIMIT, WHEEL_DEBOUNCE_MS } from './constants.js';
import { S, P, els, pantoneSelections } from './state.js';
import { exitMultiSelect, deactivateSwatch, setActive, setHandles, applyMultiVisuals, computeFrozenEdges } from './selection.js';
import { removeColorAt, createSwatchDOM, reindex, updateSwatch, wireSwatch, updateAddButton, swatchEl } from './swatches.js';
import { findPantoneByName, syncLibraryCheckboxState, updateMatchesVisibility, libraryPanel } from './pantone.js';
import { requestRender } from './util.js';
import { hexTextarea } from './hex.js';

// History

let history      = [];
let historyIndex = -1;
let wheelSnapshotTimer = null;
let pointerSnapshot    = null;

function takeSnapshot() {
  return S.colors.map((c, i) => ({
    h: c.h, s: c.s, L: c.L,
    selected: i === S.activeIndex || S.multiSelect.has(i),
    pantoneName: pantoneSelections.get(i)?.name ?? null,
  }));
}

// Selection is not undoable, so it's excluded here: selecting a different swatch
// (with no colour/order/promotion change) must NOT create a history entry. The
// per-swatch `selected` flag is still recorded — but only to restore a multi-edit
// group on undo/redo (see restoreSnapshot).
function snapshotsEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].h !== b[i].h || a[i].s !== b[i].s || a[i].L !== b[i].L
        || a[i].pantoneName !== b[i].pantoneName) return false;
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

  while (S.colors.length > snap.length) removeColorAt(S.colors.length - 1);

  for (let i = 0; i < S.colors.length; i++) {
    S.colors[i] = { h: snap[i].h, s: snap[i].s, L: snap[i].L };
  }
  for (let i = S.colors.length; i < snap.length; i++) {
    S.colors.push({ h: snap[i].h, s: snap[i].s, L: snap[i].L });
    P.createHandle(i);
    P.createLightHandle(i);
    wireSwatch(createSwatchDOM(i));
  }

  const neededCategories = new Set();
  for (let i = 0; i < snap.length; i++) {
    const name = snap[i].pantoneName;
    if (!name) continue;
    const entry = findPantoneByName(name);
    if (!entry) continue;
    pantoneSelections.set(i, entry);
    neededCategories.add(entry.category);
  }
  if (neededCategories.size > 0) {
    S.libraryFilters.base = true;
    for (const cat of neededCategories) {
      if (cat !== 'base') S.libraryFilters[cat] = true;
    }
    // The base toggle lives outside #library-panel (in the section head), so
    // query the whole document for every data-library checkbox.
    document.querySelectorAll('input[type="checkbox"][data-library]').forEach(cb => {
      cb.checked = !!S.libraryFilters[cb.dataset.library];
    });
    // Keep the collapsible pantone section's open-state in sync with the base
    // filter when a restore turns it on (view-state only, no history effect).
    const pantoneSection = document.querySelector('.section-pantone');
    if (pantoneSection) pantoneSection.classList.toggle('open', S.libraryFilters.base);
    syncLibraryCheckboxState();
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
  if (document.activeElement === hexTextarea) return;
  e.preventDefault();
  if (e.shiftKey) redo(); else undo();
});



export { recordSnapshot, flushPendingWheelSnapshot, scheduleWheelSnapshot };
