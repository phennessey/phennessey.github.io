// All pointer/drag/scroll input: disc dragging (single, constellation,
// hue-convergence), the lightbar, swatch & chip drag-and-drop, modifier
// keys, and background-brightness scrolling.

import { BG_LEVELS, MIDDLE_GRAY, LB_HEIGHT } from './constants.js';
import { S, P, els, DISC_R, handlePos, yToToeL, toeLToY, pantoneSelections, loadPreferredMatchCount } from './state.js';
import { TAU, idxOf } from './picker.js';
import { toe, toeInv, clamp01, lToRaw, rawToL, sForChroma, getActiveChroma, hueDiff, computeP3AndSRGB } from './color.js';
import { discXY, captureDrag, syncModKeys, invalidateAndRender } from './util.js';
import { setActive, toggleMultiSelect, deselect, updateMesh } from './selection.js';
import { updateSwatch } from './swatches.js';
import { demoteActiveMutation, findPantoneByName, pantoneP3Css } from './pantone.js';
import { flushPendingWheelSnapshot, recordSnapshot, scheduleWheelSnapshot } from './history.js';

// Modifier-key tracking

document.addEventListener('keydown', e => {
  if (e.key === 'Shift') S.modKeys.shift = true;
  else if (e.key === 'Meta') S.modKeys.meta = true;
  else return;
  P.updateDiscGuides(); updateMesh();
});

document.addEventListener('keyup', e => {
  if (e.key === 'Shift') S.modKeys.shift = false;
  else if (e.key === 'Meta') { S.modKeys.meta = false; S.lockedChromaPath = null; }
  else return;
  if (S.hueConvergeDrag) S.hueConvergeDrag.needsReanchor = true;
  P.updateDiscGuides(); updateMesh();
});

els.pickerWrap.addEventListener('pointerenter', () => {
  S.mouseInPickerWrap = true;
  if (S.modKeys.shift || S.modKeys.meta) { P.updateDiscGuides(); updateMesh(); }
});
els.pickerWrap.addEventListener('pointerleave', () => {
  S.mouseInPickerWrap = false;
  if (S.modKeys.shift || S.modKeys.meta) { P.updateDiscGuides(); updateMesh(); }
});


// Disc hover tracking

els.discOverlay.addEventListener('pointermove', ev => {
  syncModKeys(ev);
  if (S.dragging) return;
  const { dx, dy } = discXY(ev);
  S.mouseInPicker   = Math.hypot(dx, dy) <= DISC_R;
  S.mouseHueAngle   = ((Math.atan2(-dy, dx) / TAU) + 1) % 1;

  const hEl      = ev.target.closest('.disc-handle');
  const newHover = hEl ? idxOf(hEl) : -1;
  if (newHover !== S.hoveredHandle) {
    S.hoveredHandle = newHover;
    if (S.modKeys.shift || S.modKeys.meta) { P.updateDiscGuides(); updateMesh(); }
  }

  if (S.isMultiMode() && S.modKeys.shift && S.modKeys.meta && S.mouseInPicker) {
    P.updateDiscGuides();
  }
});

els.discOverlay.addEventListener('pointerleave', () => {
  S.mouseInPicker = false;
  if (S.hoveredHandle !== -1) { S.hoveredHandle = -1; P.updateDiscGuides(); updateMesh(); }
});


// Disc drag — single color

function applyDiscPointer(ev) {
  syncModKeys(ev);
  const { dx: rdx, dy: rdy } = discXY(ev);
  trackCursorOverDisc(rdx, rdy);
  const dx  = rdx - discDragOffset.x;
  const dy  = rdy - discDragOffset.y;
  const col = S.colors[S.activeIndex];

  if (S.modKeys.meta && !S.modKeys.shift) {
    const angle = Math.atan2(-rdy, rdx);
    if (!S.lockedChromaPath) {
      const result = P.updateDiscGuides();
      S.lockedChromaPath = {
        targetC: getActiveChroma(col), L: col.L,
        cx: result ? result.cx : DISC_R, cy: result ? result.cy : DISC_R,
        lastAngle: angle,   // anchor: rotate from here, tracking cursor delta only
      };
    }
    // Rotate the hue by the cursor's angular delta rather than snapping to the
    // cursor — like grabbing a wheel at its current position. Normalise the
    // delta across the ±π seam so a wraparound doesn't cause a jump.
    let d = angle - S.lockedChromaPath.lastAngle;
    d = ((d + Math.PI) % TAU + TAU) % TAU - Math.PI;
    S.lockedChromaPath.lastAngle = angle;
    col.h = ((col.h + d / TAU) % 1 + 1) % 1;
    col.s = sForChroma(col.h, S.lockedChromaPath.targetC, toe(S.lockedChromaPath.L));
  } else {
    if (S.modKeys.shift && !S.modKeys.meta) {
      const a = col.h * TAU;
      col.s = clamp01((dx * Math.cos(a) - dy * Math.sin(a)) / DISC_R);
    } else {
      col.h = (Math.atan2(-dy, dx) / TAU + 1) % 1;
      col.s = Math.min(1, Math.sqrt(dx * dx + dy * dy) / DISC_R);
    }
    S.lockedChromaPath = null;
  }
  demoteActiveMutation();
  invalidateAndRender();
}


// Disc drag — multi (constellation)

let multiDrag = null;

function startMultiDrag(ev, dragIdx) {
  const anchorPx  = handlePos(S.colors[dragIdx]);
  const rect      = els.wheelCanvas.getBoundingClientRect();
  const grabOffset = { x: ev.clientX - rect.left - anchorPx.x, y: ev.clientY - rect.top - anchorPx.y };
  const offsets   = new Map();
  for (const i of S.multiSelect) {
    const px = handlePos(S.colors[i]);
    offsets.set(i, { dx: px.x - anchorPx.x, dy: px.y - anchorPx.y });
  }
  multiDrag = { offsets, grabOffset, anchorIdx: dragIdx };
}

function applyMultiDrag(ev) {
  syncModKeys(ev);
  const { dx: rawDx, dy: rawDy } = discXY(ev);
  trackCursorOverDisc(rawDx, rawDy);
  const { offsets, grabOffset, anchorIdx } = multiDrag;
  const rect = els.wheelCanvas.getBoundingClientRect();
  const ax   = ev.clientX - rect.left - grabOffset.x;
  const ay   = ev.clientY - rect.top  - grabOffset.y;

  const adx = ax - DISC_R, ady = ay - DISC_R;
  const ad  = Math.hypot(adx, ady);
  const scale = ad > DISC_R ? DISC_R / ad : 1;
  const dx = adx * scale, dy = ady * scale;
  S.colors[anchorIdx].h = (Math.atan2(-dy, dx) / TAU + 1) % 1;
  S.colors[anchorIdx].s = Math.min(1, ad * scale / DISC_R);

  for (const [idx, off] of offsets) {
    if (idx === anchorIdx) continue;
    const px = ax + off.dx, py = ay + off.dy;
    const pdx = px - DISC_R, pdy = py - DISC_R;
    S.colors[idx].h = (Math.atan2(-pdy, pdx) / TAU + 1) % 1;
    S.colors[idx].s = Math.min(1, Math.hypot(pdx, pdy) / DISC_R);
  }
  demoteActiveMutation();
  invalidateAndRender();
}

function stopMultiDrag() { multiDrag = null; }


// Disc drag — hue convergence (Shift+Meta)

function startHueConvergeDrag(ev) {
  const { dx, dy } = discXY(ev);
  const lockedH    = ((Math.atan2(-dy, dx) / TAU) + 1) % 1;
  const nodes      = new Map();
  for (const i of S.multiSelect) {
    const col = S.colors[i], lr = toe(col.L);
    nodes.set(i, { targetC: getActiveChroma(col), lr, startS: col.s, startOffset: hueDiff(col.h, lockedH) });
  }
  S.hueConvergeDrag = { lockedH, nodes };
}

function applyHueConvergeDrag(ev) {
  syncModKeys(ev);
  const hcd = S.hueConvergeDrag;
  const { dx, dy } = discXY(ev);
  trackCursorOverDisc(dx, dy);

  if (!ev.shiftKey && !ev.metaKey) {
    if (!multiDrag) {
      startMultiDrag(ev, S.activeIndex !== -1 && S.multiSelect.has(S.activeIndex)
        ? S.activeIndex : [...S.multiSelect][0]);
    }
    applyMultiDrag(ev);
    return;
  }

  if (hcd.needsReanchor || ev.shiftKey !== hcd.lastShift || ev.metaKey !== hcd.lastMeta) {
    if (multiDrag) multiDrag = null;
    Object.assign(hcd, { lastShift: ev.shiftKey, lastMeta: ev.metaKey, needsReanchor: false,
      startProj: null, lastAmount: null, prevDX: null, prevDY: null, sliderAxis: null });
    for (const [i, node] of hcd.nodes) {
      const col = S.colors[i], lr = toe(col.L);
      Object.assign(node, { targetC: getActiveChroma(col), lr, startS: col.s, startOffset: hueDiff(col.h, hcd.lockedH) });
    }
  }

  if (ev.shiftKey && ev.metaKey) {
    const { nodes, lockedH } = hcd;
    const hueAngle = lockedH * TAU;
    const projDir  = { x: Math.cos(hueAngle), y: -Math.sin(hueAngle) };
    const proj     = dx * projDir.x + dy * projDir.y;
    if (hcd.startProj == null) hcd.startProj = proj;
    const amount = Math.max(0, (proj - hcd.startProj) / DISC_R * 0.5);
    if (amount === (hcd.lastAmount ?? 0)) return;
    hcd.lastAmount = amount;
    const decay = Math.exp(-amount);
    for (const [i, { targetC, lr, startOffset }] of nodes) {
      const newH = ((lockedH + startOffset * decay) % 1 + 1) % 1;
      S.colors[i].h = newH;
      S.colors[i].s = sForChroma(newH, targetC, lr);
    }
    demoteActiveMutation();
    invalidateAndRender();
    return;
  }

  if (ev.shiftKey) {
    const { nodes } = hcd;
    if (hcd.prevDX == null) { hcd.prevDX = dx; hcd.prevDY = dy; }
    if (!hcd.sliderAxis) {
      const moveDX = dx - hcd.prevDX, moveDY = dy - hcd.prevDY;
      const moveDist = Math.hypot(moveDX, moveDY);
      if (moveDist > 1) {
        const axis = { x: moveDX / moveDist, y: moveDY / moveDist };
        const sign = Math.hypot(dx, dy) >= Math.hypot(hcd.prevDX, hcd.prevDY) ? 1 : -1;
        Object.assign(hcd, { sliderAxis: axis, sliderSign: sign, sliderOrigin: { x: hcd.prevDX, y: hcd.prevDY } });
      }
      hcd.prevDX = dx; hcd.prevDY = dy;
    }
    let delta = 0;
    if (hcd.sliderAxis) {
      const { sliderAxis, sliderSign, sliderOrigin } = hcd;
      delta = ((dx - sliderOrigin.x) * sliderAxis.x + (dy - sliderOrigin.y) * sliderAxis.y) * sliderSign / DISC_R * 2;
    }
    const C_REF = 0.4;
    for (const [i, { targetC, lr }] of nodes) {
      const tStart = clamp01(targetC / C_REF);
      const tNew   = clamp01(rawToL(lToRaw(tStart) + delta));
      S.colors[i].s = sForChroma(S.colors[i].h, tNew * C_REF, lr);
    }
  } else if (ev.metaKey) {
    const { nodes } = hcd;
    const angle = Math.atan2(-dy, dx);
    if (hcd.lastAngle == null) hcd.lastAngle = angle;
    const angleDelta = angle - hcd.lastAngle;
    for (const [i, { targetC, lr }] of nodes) {
      const newH = ((S.colors[i].h + angleDelta / TAU) % 1 + 1) % 1;
      S.colors[i].h = newH;
      S.colors[i].s = sForChroma(newH, targetC, lr);
    }
    hcd.lastAngle = angle;
  }

  demoteActiveMutation();
  invalidateAndRender();
}

function stopHueConvergeDrag() {
  S.hueConvergeDrag = null;
  P.hideHueLine();
  if (multiDrag) stopMultiDrag();
}


// Disc pointerdown dispatcher

let discDragOffset = { x: 0, y: 0 };

function startDiscDrag({ hideCursor = false } = {}) {
  S.dragging = true;
  document.body.classList.add('disc-dragging');
  if (hideCursor) document.body.classList.add('disc-dragging-single');
  window.getSelection()?.removeAllRanges();
}

function endDiscDrag() {
  S.dragging = false;
  document.body.classList.remove('disc-dragging', 'disc-dragging-single', 'cursor-outside-disc');
  P.render();  // full sweep to catch up hex field and any skipped swatch state
}

function trackCursorOverDisc(dx, dy) {
  document.body.classList.toggle('cursor-outside-disc', Math.hypot(dx, dy) > DISC_R);
}

const discActions = {
  'single:disc:none': 'drag', 'single:disc:shift': 'drag', 'single:disc:meta': 'drag', 'single:disc:shiftMeta': 'drag',
  'single:other:none': 'select', 'single:other:shift': 'multi', 'single:other:meta': 'multi', 'single:other:shiftMeta': 'multi',
  'multi:selected:none': 'constellation', 'multi:selected:shift': 'converge', 'multi:selected:meta': 'converge', 'multi:selected:shiftMeta': 'converge',
  'multi:disc:none': 'deselect', 'multi:disc:shift': 'converge', 'multi:disc:meta': 'converge', 'multi:disc:shiftMeta': 'converge',
  'multi:unselected:none': 'select', 'multi:unselected:shift': 'multi', 'multi:unselected:meta': 'multi', 'multi:unselected:shiftMeta': 'multi',
};

els.discOverlay.addEventListener('pointerdown', ev => {
  syncModKeys(ev);
  const handleEl = ev.target.closest('.disc-handle');
  const { dx: rawDx, dy: rawDy } = discXY(ev);
  const inDisc   = Math.hypot(rawDx, rawDy) <= DISC_R;

  let target;
  if (!handleEl) target = inDisc ? 'disc' : null;
  else if (S.isMultiMode()) target = S.multiSelect.has(idxOf(handleEl)) ? 'selected' : 'unselected';
  else target = idxOf(handleEl) === S.activeIndex ? 'disc' : 'other';
  if (!target) return;
  if (S.activeIndex === -1 && target === 'disc') return;

  const mod    = ev.shiftKey && ev.metaKey ? 'shiftMeta' : ev.shiftKey ? 'shift' : ev.metaKey ? 'meta' : 'none';
  const action = discActions[`${S.isMultiMode() ? 'multi' : 'single'}:${target}:${mod}`];

  switch (action) {
    case 'drag':
      if (handleEl) {
        const col = S.colors[S.activeIndex], a = col.h * TAU;
        discDragOffset = { x: rawDx - Math.cos(a) * col.s * DISC_R, y: rawDy + Math.sin(a) * col.s * DISC_R };
      } else { discDragOffset = { x: 0, y: 0 }; }
      startDiscDrag({ hideCursor: true });
      applyDiscPointer(ev);
      captureDrag(els.discOverlay, ev, applyDiscPointer, () => {
        endDiscDrag(); S.lockedChromaPath = null; discDragOffset = { x: 0, y: 0 };
      });
      break;
    case 'select':
      setActive(idxOf(handleEl));
      {
        const col = S.colors[S.activeIndex], a = col.h * TAU;
        discDragOffset = { x: rawDx - Math.cos(a) * col.s * DISC_R, y: rawDy + Math.sin(a) * col.s * DISC_R };
      }
      startDiscDrag({ hideCursor: true });
      applyDiscPointer(ev);
      captureDrag(els.discOverlay, ev, applyDiscPointer, () => {
        endDiscDrag(); S.lockedChromaPath = null; discDragOffset = { x: 0, y: 0 };
      });
      break;
    case 'multi':
      toggleMultiSelect(idxOf(handleEl));
      break;
    case 'constellation':
      startMultiDrag(ev, idxOf(handleEl));
      startDiscDrag();
      captureDrag(els.discOverlay, ev, applyMultiDrag, () => { stopMultiDrag(); endDiscDrag(); });
      break;
    case 'converge':
      startHueConvergeDrag(ev);
      startDiscDrag();
      captureDrag(els.discOverlay, ev, applyHueConvergeDrag, () => { stopHueConvergeDrag(); endDiscDrag(); });
      break;
    case 'deselect':
      deselect();
      break;
  }
});


let lbDragOffset = 0;
let lbMultiDrag  = null;
let lbLockedChroma = null;   // non-null while meta is held

function applyLightbarPointer(ev) {
  syncModKeys(ev);
  const rect = els.lightbarEl.getBoundingClientRect();
  const col  = S.colors[S.activeIndex];

  if (S.modKeys.meta) {
    if (lbLockedChroma === null) lbLockedChroma = getActiveChroma(col);
  } else {
    lbLockedChroma = null;
  }

  col.L = toeInv(yToToeL(ev.clientY - rect.top - lbDragOffset));
  if (lbLockedChroma !== null) {
    col.s = sForChroma(col.h, lbLockedChroma, toe(col.L));
  }
  demoteActiveMutation();
  invalidateAndRender();
}

function startLbMultiDrag(ev, dragIdx) {
  const rect        = els.lightbarEl.getBoundingClientRect();
  const anchorY     = toeLToY(toe(S.colors[dragIdx].L));
  const grabOffsetY = ev.clientY - rect.top - anchorY;
  const anchorRawL  = lToRaw(toe(S.colors[dragIdx].L));
  const offsets     = new Map();
  for (const i of S.multiSelect) offsets.set(i, { dRawL: lToRaw(toe(S.colors[i].L)) - anchorRawL });
  lbMultiDrag = { anchorIdx: dragIdx, grabOffsetY, offsets, chromaLocks: null };
}

function applyLbMultiDrag(ev) {
  syncModKeys(ev);
  const { anchorIdx, grabOffsetY, offsets } = lbMultiDrag;
  const rect        = els.lightbarEl.getBoundingClientRect();

  if (S.modKeys.meta) {
    if (!lbMultiDrag.chromaLocks) {
      const locks = new Map();
      for (const i of S.multiSelect) locks.set(i, getActiveChroma(S.colors[i]));
      lbMultiDrag.chromaLocks = locks;
    }
  } else {
    lbMultiDrag.chromaLocks = null;
  }

  const anchorToeL  = yToToeL(ev.clientY - rect.top - grabOffsetY);
  S.colors[anchorIdx].L = toeInv(anchorToeL);
  const anchorRawL  = lToRaw(anchorToeL);
  for (const [idx, off] of offsets) {
    if (idx === anchorIdx) continue;
    S.colors[idx].L = toeInv(rawToL(anchorRawL + off.dRawL));
  }

  if (lbMultiDrag.chromaLocks) {
    for (const [idx, targetC] of lbMultiDrag.chromaLocks) {
      const col = S.colors[idx];
      col.s = sForChroma(col.h, targetC, toe(col.L));
    }
  }

  demoteActiveMutation();
  invalidateAndRender();
}

els.lightbarOverlay.addEventListener('pointerdown', ev => {
  syncModKeys(ev);
  if (S.activeIndex === -1) return;

  if (S.isMultiMode()) {
    const handleEl = ev.target.closest('.light-handle');
    if (!handleEl) return;
    const dragIdx = idxOf(handleEl);
    if (!S.multiSelect.has(dragIdx)) return;
    startLbMultiDrag(ev, dragIdx);
    captureDrag(els.lightbarOverlay, ev, applyLbMultiDrag, () => { lbMultiDrag = null; });
    return;
  }

  const handleEl = ev.target.closest('.light-handle');
  if (handleEl && idxOf(handleEl) !== S.activeIndex) return;
  if (handleEl) {
    const rect = els.lightbarEl.getBoundingClientRect();
    lbDragOffset = ev.clientY - rect.top - toeLToY(toe(S.colors[S.activeIndex].L));
  } else { lbDragOffset = 0; }

  applyLightbarPointer(ev);
  captureDrag(els.lightbarOverlay, ev, applyLightbarPointer, () => {
    lbDragOffset = 0;
    lbLockedChroma = null;
  });
});

// Lightbar hover tracking. Shift while the cursor is over the lightbar switches
// the wheel to fine-adjustment mode (below) instead of the disc's saturation
// guides, so refresh the disc guides on enter/leave to apply the change at once
// when Shift is already held (and works either order: shift-then-hover or
// hover-then-shift, since both are read live).
function enterLightbar() {
  if (S.mouseInLightbar) return;
  S.mouseInLightbar = true;
  if (S.modKeys.shift) P.updateDiscGuides();   // clear any disc saturation guide
}
function leaveLightbar() {
  if (!S.mouseInLightbar) return;
  S.mouseInLightbar = false;
  if (S.modKeys.shift) P.updateDiscGuides();   // restore disc guides off the lightbar
}
els.lightbarOverlay.addEventListener('pointerenter', enterLightbar);
els.lightbarOverlay.addEventListener('pointermove',  enterLightbar);   // belt-and-suspenders if enter is missed
els.lightbarOverlay.addEventListener('pointerleave', leaveLightbar);

els.lightbarOverlay.addEventListener('wheel', ev => {
  syncModKeys(ev);
  if (S.activeIndex === -1) return;
  ev.preventDefault();
  enterLightbar();   // the wheel fired over the lightbar, so we're definitely on it

  // Shift over the lightbar = fine adjustment: move the handle ~1px per wheel
  // notch (1px = 1/LB_HEIGHT in toe-L space) instead of the normal coarse step.
  const fine = S.modKeys.shift && S.mouseInLightbar;
  // Holding Shift makes the OS deliver wheel scroll on the X axis, so deltaY is
  // 0 and the value lands in deltaX — read whichever axis carries the scroll,
  // else the direction gets stuck going one way.
  const scroll = ev.deltaY || ev.deltaX;
  if (!scroll) return;
  const dir  = scroll > 0 ? -1 : 1;

  const lockChroma = S.modKeys.meta;

  if (S.isMultiMode()) {
    const preLocks = lockChroma ? new Map() : null;
    if (preLocks) {
      for (const i of S.multiSelect) preLocks.set(i, getActiveChroma(S.colors[i]));
    }
    for (const i of S.multiSelect) {
      S.colors[i].L = fine
        ? toeInv(clamp01(toe(S.colors[i].L) + dir / LB_HEIGHT))
        : toeInv(rawToL(lToRaw(toe(S.colors[i].L)) + dir / 8));
    }
    if (preLocks) {
      for (const [i, targetC] of preLocks) {
        S.colors[i].s = sForChroma(S.colors[i].h, targetC, toe(S.colors[i].L));
      }
    }
  } else {
    const col = S.colors[S.activeIndex];
    const targetC = lockChroma ? getActiveChroma(col) : null;
    const step = fine ? 1 / LB_HEIGHT : 1 / 32;
    col.L = toeInv(clamp01(toe(col.L) + dir * step));
    if (targetC !== null) col.s = sForChroma(col.h, targetC, toe(col.L));
  }
  demoteActiveMutation();
  invalidateAndRender();
  scheduleWheelSnapshot();
}, { passive: false });


// Drag handling

const dragDot = document.createElement('div');
dragDot.id = 'swatch-dot';
document.body.appendChild(dragDot);

function swatchAt(x, y) {
  for (const el of document.elementsFromPoint(x, y)) {
    const sc = el.closest('.swatch-container');
    if (sc) return sc;
  }
  return null;
}

function chipDropTargetAt(x, y) {
  for (const el of document.elementsFromPoint(x, y)) {
    if (!el.classList) continue;
    if (el.classList.contains('color-swatch') || el.classList.contains('promoted-cell')) {
      return el.closest('.swatch-container');
    }
  }
  return null;
}

function clearSwapHighlights() {
  els.swatches.querySelectorAll('.swap-target, .swap-source')
    .forEach(el => el.classList.remove('swap-target', 'swap-source'));
}

function startDrag(ev, { dotBg, findTarget, onMove, onDrop }) {
  const startX = ev.clientX, startY = ev.clientY;
  let active = false;
  const move = e => {
    if (!active) {
      if (Math.hypot(e.clientX - startX, e.clientY - startY) < 6) return;
      active = true;
      dragDot.style.background = dotBg;
      dragDot.classList.add('visible');
      document.body.classList.add('swatch-dragging');
      window.getSelection()?.removeAllRanges();   // drop any text selection begun before the drag threshold
    }
    dragDot.style.left = `${e.clientX}px`;
    dragDot.style.top  = `${e.clientY}px`;
    clearSwapHighlights();
    onMove?.(e, findTarget(e.clientX, e.clientY));
  };
  const up = e => {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup',   up);
    if (!active) return;
    dragDot.classList.remove('visible');
    document.body.classList.remove('swatch-dragging');
    clearSwapHighlights();
    onDrop(e, findTarget(e.clientX, e.clientY));
  };
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup',   up);
}

els.swatches.addEventListener('pointerdown', ev => {
  syncModKeys(ev);
  const container = ev.target.closest('.swatch-container');
  if (!container) return;
  if (ev.target.closest('.icon, .swatch-readout, .match-cells')) return;
  if (S.colors.length < 2) return;
  const si = idxOf(container);

  startDrag(ev, {
    dotBg: computeP3AndSRGB(S.colors[si]).p3Css,
    findTarget: swatchAt,
    onMove: (_, target) => {
      container.classList.add('swap-source');
      if (target && idxOf(target) !== si) target.classList.add('swap-target');
    },
    onDrop: (_, target) => {
      if (!target) return;
      const ti = idxOf(target);
      if (ti === si) return;
      [S.colors[ti], S.colors[si]] = [{ ...S.colors[si] }, { ...S.colors[ti] }];
      const a = pantoneSelections.get(si);
      const b = pantoneSelections.get(ti);
      if (a) pantoneSelections.set(ti, a); else pantoneSelections.delete(ti);
      if (b) pantoneSelections.set(si, b); else pantoneSelections.delete(si);
      updateSwatch(si);
      updateSwatch(ti);
      P.invalidateCache();
      setActive(ti);
      flushPendingWheelSnapshot();
      recordSnapshot();
    },
  });
});

els.swatches.addEventListener('pointerdown', ev => {
  if (ev.target.closest('.chip-gamut-warning')) return;
  const sourceCell = ev.target.closest('.match-cell');
  if (!sourceCell) return;
  const entry = findPantoneByName(sourceCell.dataset.pantoneName);
  if (!entry) return;

  startDrag(ev, {
    dotBg: pantoneP3Css(entry),
    findTarget: chipDropTargetAt,
    onMove: (_, target) => { if (target) target.classList.add('swap-target'); },
    onDrop: (_, target) => {
      if (!target) return;
      const ti = idxOf(target);
      if (!Number.isInteger(ti) || ti < 0 || ti >= S.colors.length) return;
      const prevCount = S.colors[ti].matchCount ?? loadPreferredMatchCount();
      // Store the pantone projected to the P3 rim (radial chroma reduction:
      // hold hue + lightness, clamp OKHSL saturation to ≤ 1). This is the only
      // colour we can actually pick, and it renders identically to the chip /
      // promoted cell / drag dot (all via pantoneP3Css). The true out-of-P3
      // pantone is still recorded as the promoted selection + caution icon.
      S.colors[ti] = { h: entry.h, s: Math.min(1, entry.s), L: entry.L, matchCount: prevCount };
      pantoneSelections.set(ti, entry);
      if (ti === S.activeIndex) P.invalidateCache();
      updateSwatch(ti);
      P.render();
      flushPendingWheelSnapshot();
      recordSnapshot();
    },
  });
});


document.addEventListener('pointerdown', ev => {
  if (ev.target.closest('.picker-wrap') || ev.target.closest('.swatches')) return;
  if (S.activeIndex === -1 && !S.isMultiMode()) return;
  deselect();
});


// Background brightness scroll

const _initBg    = getComputedStyle(document.body).backgroundColor;
const _initMatch = _initBg.match(/\d+/);
let bgLevel = Math.round((_initMatch ? parseInt(_initMatch[0]) : 102) / 255 * (BG_LEVELS - 1));

function applyBgLevel() {
  const hex = Math.round(bgLevel / (BG_LEVELS - 1) * 255).toString(16).padStart(2, '0');
  document.body.style.backgroundColor = `#${hex}${hex}${hex}`;
  document.body.classList.toggle('light-bg', bgLevel / (BG_LEVELS - 1) > MIDDLE_GRAY);
}

document.addEventListener('wheel', ev => {
  if (ev.target.closest('.picker-wrap, .swatch-container')) return;
  ev.preventDefault();
  bgLevel = Math.max(0, Math.min(BG_LEVELS - 1, bgLevel + (ev.deltaY > 0 ? -1 : 1)));
  applyBgLevel();
}, { passive: false });



export { applyBgLevel };
