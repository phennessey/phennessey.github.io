// Cross-cutting helpers: render invalidation, pointer/drag math, modifier
// key syncing, and squircle clip-path generation.

import { P, els, DISC_R, S } from './state.js';

// Squircle clip path

function squirclePath(w, h, r) {
  // Control magnitudes stay fractional — they define the precise superellipse
  // curve and must NOT be rounded. Only `w` (the right edge) is pixel-snapped
  // by the caller; every point here is a fractional offset measured leftward
  // from w (or inward from the other edges).
  const [a, b, c, d, e, f] = [567, 452, 329, 194, 88, 39].map(n => r * n / 524);
  const cr = [ [a,0], [b,0], [c,f], [d,e], [e,d], [f,c], [0,b], [0,a], [0,r] ];
  const C = pts => 'C ' + pts.map(p => p.join(' ')).join(' ');
  return `M ${r} 0 H ${w-r} ` +
    C(cr.map(([x,y]) => [w-x, y])) + ` V ${h-r} ` +
    C(cr.map(([x,y]) => [w-y, h-x])) + ` H ${r} ` +
    C(cr.map(([x,y]) => [x, h-y])) + ` V ${r} ` +
    C(cr.map(([x,y]) => [y, x])) + ` Z`;
}

function applySquircle(el) {
  const rect = el.getBoundingClientRect();
  el.style.maxWidth = 'var(--squircle-r)';
  const r = parseFloat(getComputedStyle(el).maxWidth);
  el.style.maxWidth = '';
  // The clip's right/bottom edges (local x = w, y = h) must coincide EXACTLY
  // with the box's painted edges — just as the left/top edges sit exactly at
  // local 0. Those edges are at the true, fractional border-box size, so use
  // it verbatim: offsetWidth/offsetHeight round down (corner pulled inside →
  // soft), and rounding up pushes the corner outside the box (clipped away →
  // hard edge). Either rounding breaks the match; the exact size does not.
  const w = rect.width, h = rect.height;
  if (w > 0 && h && r) el.style.clipPath = `path('${squirclePath(w, h, r)}')`;
}

const squircleObserver = new ResizeObserver(entries => {
  for (const entry of entries) applySquircle(entry.target);
});

function observeSquircle(el) { squircleObserver.observe(el); }


// Utility helpers

// drawDisc/drawLightbar self-invalidate on lightness and (h,s) respectively,
// so a plain render() repaints exactly when needed. (Name kept for callers.)
function invalidateAndRender() { P.render(); }

function discXY(ev) {
  const rect = els.wheelCanvas.getBoundingClientRect();
  return { dx: ev.clientX - rect.left - DISC_R, dy: ev.clientY - rect.top - DISC_R };
}

function captureDrag(overlay, ev, onMove, onDone) {
  overlay.setPointerCapture(ev.pointerId);
  const move = e => onMove(e);
  const up   = () => { onDone(); overlay.removeEventListener('pointermove', move); overlay.removeEventListener('pointerup', up); };
  overlay.addEventListener('pointermove', move);
  overlay.addEventListener('pointerup',   up);
}

function syncModKeys(ev) {
  S.modKeys.shift = ev.shiftKey;
  S.modKeys.meta  = ev.metaKey;
}



export { invalidateAndRender, discXY, captureDrag, syncModKeys, observeSquircle };
