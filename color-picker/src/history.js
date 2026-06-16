// Undo/redo: snapshotting swatch state and restoring it.

import { HISTORY_LIMIT, WHEEL_DEBOUNCE_MS } from './constants.js';
import { S, P, els, pantoneSelections, loadPreferredMatchCount } from './state.js';
import { exitMultiSelect, deactivateSwatch, setActive, setHandles, applyMultiVisuals, computeFrozenEdges } from './selection.js';
import { removeColorAt, createSwatchDOM, reindex, updateSwatch, wireSwatch, updateAddButton, swatchEl } from './swatches.js';
import { findPantoneByName, syncLibraryCheckboxState, updateMatchesVisibility, libraryPanel } from './pantone.js';
import { invalidateAndRender, observeSquircle } from './util.js';
import { hexTextarea } from './hex.js';

// History

let history      = [];
let historyIndex = -1;
let wheelSnapshotTimer = null;
let pointerSnapshot    = null;

// matchCount is deliberately absent from snapshots: the visible chip count is
// a persistent user-space preference (see state.js), not part of the undoable
// colour document. Undo/redo preserves whatever count each swatch currently
// has rather than rewinding it.
function takeSnapshot() {
  return S.colors.map((c, i) => ({
    h: c.h, s: c.s, L: c.L,
    selected: i === S.activeIndex || S.multiSelect.has(i),
    pantoneName: pantoneSelections.get(i)?.name ?? null,
  }));
}

function snapshotsEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].h !== b[i].h || a[i].s !== b[i].s || a[i].L !== b[i].L
        || a[i].selected !== b[i].selected
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
  exitMultiSelect();

  if (S.activeIndex < S.colors.length) deactivateSwatch(S.activeIndex);
  S.activeIndex = -1;

  pantoneSelections.clear();

  while (S.colors.length > snap.length) removeColorAt(S.colors.length - 1);

  // Preserve each existing swatch's live matchCount (it's a user-space
  // preference, not part of the snapshot); swatches re-created by this restore
  // adopt the last-used preferred count.
  for (let i = 0; i < S.colors.length; i++) {
    S.colors[i] = {
      h: snap[i].h, s: snap[i].s, L: snap[i].L,
      matchCount: S.colors[i].matchCount ?? loadPreferredMatchCount(),
    };
  }
  for (let i = S.colors.length; i < snap.length; i++) {
    S.colors.push({
      h: snap[i].h, s: snap[i].s, L: snap[i].L,
      matchCount: loadPreferredMatchCount(),
    });
    P.createHandle(i);
    P.createLightHandle(i);
    wireSwatch(createSwatchDOM(i));
    observeSquircle(swatchEl(i).querySelector('.swatch-inner'));
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
    if (libraryPanel) {
      libraryPanel.querySelectorAll('input[type="checkbox"][data-library]').forEach(cb => {
        cb.checked = !!S.libraryFilters[cb.dataset.library];
      });
      syncLibraryCheckboxState();
    }
    updateMatchesVisibility();
  }

  reindex();
  S.colors.forEach((_, i) => updateSwatch(i));

  const selectedIndices = snap.reduce((acc, s, i) => { if (s.selected) acc.push(i); return acc; }, []);

  if (selectedIndices.length === 0) {
    els.swatches.classList.add('none-selected');
    invalidateAndRender();
  } else if (selectedIndices.length === 1) {
    setActive(selectedIndices[0]);
  } else {
    for (const i of selectedIndices) S.multiSelect.add(i);
    S.activeIndex = selectedIndices[0];
    setHandles(S.activeIndex, true);
    els.swatches.classList.remove('none-selected');
    applyMultiVisuals();
    computeFrozenEdges();
    invalidateAndRender();
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
