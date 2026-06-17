// Cross-cutting helpers: render invalidation, pointer/drag math, and modifier
// key syncing. (Squircle corners are now native CSS — `border-radius` +
// `corner-shape: superellipse(…)` — so the old clip-path/SVG-outline pipeline
// is gone.)

import { P, els, DISC_R, S } from './state.js';


// Utility helpers

// drawDisc/drawLightbar self-invalidate on lightness and (h,s) respectively,
// so a plain render() repaints exactly when needed — callers just request a
// render without managing the cache.
function requestRender() { P.render(); }

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



export { requestRender, discXY, captureDrag, syncModKeys };
