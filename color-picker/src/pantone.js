// Library colors on the wheel and in the swatches: disc dots, closest matches
// per swatch, the match-chip row and promotion. The colors come from the
// imported libraries (libraries.js → setLibraryEntries); this module only
// renders and matches them. (Named for the Pantone feature it grew out of.)

import {
  DOT_RADIUS, DOT_PEAK_OPACITY, DOT_FALLOFF_L, DOT_PROMOTED_RADIUS, DOT_PROMOTED_STROKE,
  MIDDLE_GRAY, DISC_SIZE, DEFAULT_MATCH_COUNT, MIN_MATCHES, MAX_MATCHES, MIN_MATCH_WIDTH,
  SKYLINE_FLOOR, MIN_GAMUT_BAR_H,
  GAMUT_ICON_SVG, CLOSE_ICON_SVG,
} from './constants.js';
import { S, P, els, pantoneSelections } from './state.js';
import { TAU, idxOf } from './picker.js';
import {
  toe, toOKLab, computeP3AndSRGB, isSRGBMode,
  oklabToOKHSL, okhslToOKLab, convert, OKLab, DisplayP3, sRGB,
} from './color.js';
import { swatchEl, updateSwatch } from './swatches.js';
import { flushPendingWheelSnapshot, recordSnapshot } from './history.js';

function clearPromotedOnEdit() {
  const targets = S.isMultiMode() ? S.multiSelect
                : S.activeIndex !== -1 ? [S.activeIndex]
                : [];
  let changed = false;
  for (const i of targets) {
    if (pantoneSelections.has(i)) {
      pantoneSelections.delete(i);
      updateSwatchMatches(i);
      changed = true;
    }
  }
  if (changed) updateDots();
}


// Library colors

// Every imported library's colors, active or not (a promotion from a library
// that's switched off is kept, hidden, and restored when it's switched back on).
// Each entry: { key, libId, libName, name, L, a, b (OKLab), metallic, cbCMYK,
// outOfP3, outOfSRGB, h, s, outOfGamut, x, y (dot position) }.
const pantoneData = [];
let activeLibIds = new Set();

// The dots are drawn on one canvas rather than as one SVG element each: with
// tens of thousands of library colors, per-element style and layout dominated
// every lightness change. It sits between the disc and its SVG overlay — the
// same stacking the dots had as the overlay's first visible layer, under the
// gamut boundaries, guides and handles — and reaches DOT_MARGIN past the disc
// on every side for out-of-gamut dots (compressed to ≤ 1.2× the radius, see
// dotRadiusS). Drawn at the display's pixel ratio; never takes the pointer.
const DOT_MARGIN = 40;
const dotCanvas = document.createElement('canvas');
dotCanvas.id = 'pantone-dots';
dotCanvas.style.cssText = `position:absolute;left:${-DOT_MARGIN}px;top:${-DOT_MARGIN}px;` +
  `width:${DISC_SIZE + 2 * DOT_MARGIN}px;height:${DISC_SIZE + 2 * DOT_MARGIN}px;pointer-events:none;`;
els.discOverlay.before(dotCanvas);
const dotCtx = dotCanvas.getContext('2d');
let dotDpr = 0;

// A color shows (dots, chips) when the Libraries section is open and its own
// library is switched on.
function isEntryVisible(e) { return !!S.libraryFilters.base && activeLibIds.has(e.libId); }
// Matching is on when the Libraries section is open AND at least one library
// is switched on; otherwise the match strip hides entirely (unchecking the last
// library hides the chips at once, user decision 2026-10-20).
function anyLibraryEnabled() { return !!S.libraryFilters.base && activeLibIds.size > 0; }
function isEntryEnabled(e) { return activeLibIds.has(e.libId); }
/** Whether a promotion is in effect (its library is switched on). */
const isPromotionShown = isEntryEnabled;

const _chk = [0, 0, 0];
const outside = rgb => rgb[0] < -1e-4 || rgb[0] > 1 + 1e-4
                    || rgb[1] < -1e-4 || rgb[1] > 1 + 1e-4
                    || rgb[2] < -1e-4 || rgb[2] > 1 + 1e-4;

/** Replace the library colors (from libraries.js): `entries` carry key, libId,
 *  libName, name, OKLab L/a/b, metallic and cbCMYK. Promotions are carried
 *  over by key; one whose color no longer exists is dropped. */
function setLibraryEntries(entries, activeIds) {
  activeLibIds = new Set(activeIds);
  pantoneData.length = 0;
  const byKey = new Map();
  for (const src of entries) {
    const e = { ...src };
    _chk[0] = e.L; _chk[1] = e.a; _chk[2] = e.b;
    e.outOfP3 = outside(convert(_chk, OKLab, DisplayP3, [0, 0, 0]));
    e.outOfSRGB = outside(convert(_chk, OKLab, sRGB, [0, 0, 0]));
    placeEntry(e);
    pantoneData.push(e);
    byKey.set(e.key, e);
  }
  for (const [i, old] of [...pantoneSelections]) {
    const e = byKey.get(old.key);
    if (e) pantoneSelections.set(i, e); else pantoneSelections.delete(i);
  }
  lastDotsFilterSig = '';   // force a redraw
  updateDots();
  updateMatchesVisibility();
  updateAllSwatchMatches();
  for (let i = 0; i < S.colors.length; i++) updateSwatch(i);
}

/** Which libraries are switched on (from libraries.js). */
function setActiveLibraries(activeIds) {
  activeLibIds = new Set(activeIds);
  updateDots();
  updateMatchesVisibility();
  updateAllSwatchMatches();
  for (let i = 0; i < S.colors.length; i++) updateSwatch(i);
  P.render();   // the CMYK swatch layout follows match visibility (side vs bottom)
}

// A Pantone's wheel coordinates in the current gamut. `s` can exceed 1: a
// Pantone outside the gamut sits beyond the disc edge at its true saturation.
// `outOfGamut` drives the chip/promoted warning icon — outside Display P3 in P3
// mode, outside sRGB in sRGB mode (everything shown is limited to that gamut).
const _placeHsl = [0, 0, 0];
function placeEntry(entry) {
  oklabToOKHSL([entry.L, entry.a, entry.b], _placeHsl);
  entry.h = _placeHsl[0] / 360;
  entry.s = _placeHsl[1];
  entry.outOfGamut = isSRGBMode() ? entry.outOfSRGB : entry.outOfP3;
  // Its dot's disc position. Out-of-gamut colors sit beyond the rim,
  // compressed (see dotRadiusS).
  const R = DISC_SIZE / 2, ang = entry.h * TAU, r = dotRadiusS(entry.s) * R;
  entry.x = R + Math.cos(ang) * r;
  entry.y = R - Math.sin(ang) * r;
}

/** Re-place every Pantone for a gamut-mode switch: new disc coordinates, new
 *  out-of-gamut flags, rebuilt dots and match chips. */
function remapPantoneToGamut() {
  if (!pantoneData.length) return;
  for (const entry of pantoneData) placeEntry(entry);
  lastDotsFilterSig = '';   // positions changed: force a redraw
  updateDots();
  updateAllSwatchMatches();
}

// How far beyond the rim an out-of-gamut library dot may be drawn, as a
// fraction of the wheel's radius. True positions can reach far outside the
// interface (out-of-sRGB colors ~1.56× the radius in sRGB mode, neons well past
// the P3 rim), so the excess x beyond the rim is compressed exponentially:
//
//     x → m · (1 − e^(−k·x/m))      m = band, k = falloff
//
// The farther a color sits the harder it's squeezed; dots approach m but never
// reach it, and order is preserved. k is the curve's intensity — its slope at
// the rim: 1 leaves dots just outside the rim at their true spot; below 1
// pulls every dot in harder (they bunch near the rim); above 1 pushes them out
// toward the band's edge sooner. Each gamut mode has its own pair (user
// decision 2026-10-20), since sRGB mode has far more, and farther, out-of-gamut
// colors: P3 0.2 / 8 (a dot just past the rim → 1.11×, the farthest neon,
// truly 1.26× → 1.20×); sRGB 0.6 / 0.5 (just past → 1.01×, the farthest,
// truly 1.55× → 1.22×). Display only — the color's real saturation (entry.s)
// is untouched for matching and promotion.
const DOT_COMPRESSION = {
  p3:   { band: 0.2, falloff: 8 },
  srgb: { band: 0.6, falloff: 0.5 },
};
function dotRadiusS(s) {
  if (s <= 1) return s;
  const { band, falloff } = DOT_COMPRESSION[isSRGBMode() ? 'srgb' : 'p3'];
  if (band <= 0) return 1;   // no band: every out-of-gamut dot sits on the rim
  return 1 + band * (1 - Math.exp(-falloff * (s - 1) / band));
}


let lastDotsActiveL   = NaN;
let lastDotsFilterSig = '';

function dotsFilterSig() {
  const filterPart = `${S.libraryFilters.base ? 1 : 0}/${[...activeLibIds].sort().join(',')}`;
  const promotedPart = [...pantoneSelections.entries()]
    .map(([i, e]) => `${i}:${e.key}`).sort().join('|');
  const multi = [...S.multiSelect].sort((a, b) => a - b).join(',');
  const selPart = `${S.activeIndex}/${multi}`;
  return `${filterPart}:${promotedPart}:${selPart}`;
}

function swatchHandleOpacity(i) {
  if (S.multiSelect.has(i)) return 1;
  if (i === S.activeIndex && !S.isMultiMode()) return 0.6;
  return 0.1;
}

// Dot opacities are drawn in this many steps (0.3 / 64 ≈ 0.005 apart, finer
// than the eye can tell on a 1.5 px dot), so each step's dots fill as one path.
const DOT_ALPHA_STEPS = 64;
const _dotBuckets = Array.from({ length: DOT_ALPHA_STEPS + 1 }, () => []);

function updateDots() {
  const idx = S.activeIndex !== -1 ? S.activeIndex : S.lastActiveIndex;
  const activeL    = S.colors[idx]?.L ?? 0.5;
  const filterSig  = dotsFilterSig();
  if (activeL === lastDotsActiveL && filterSig === lastDotsFilterSig && dotDpr === devicePixelRatio) return;
  lastDotsActiveL   = activeL;
  lastDotsFilterSig = filterSig;

  // Size the backing store to the display (and again if the window moves to
  // a display with another pixel ratio); draw in disc coordinates.
  const dpr = devicePixelRatio || 1, side = DISC_SIZE + 2 * DOT_MARGIN;
  if (dotDpr !== dpr) { dotCanvas.width = dotCanvas.height = Math.round(side * dpr); dotDpr = dpr; }
  dotCtx.setTransform(1, 0, 0, 1, 0, 0);
  dotCtx.clearRect(0, 0, dotCanvas.width, dotCanvas.height);
  dotCtx.setTransform(dpr, 0, 0, dpr, DOT_MARGIN * dpr, DOT_MARGIN * dpr);

  const color = activeL > MIDDLE_GRAY ? '#000' : '#fff';
  const promotedBy = new Map();
  for (const [i, entry] of pantoneSelections) promotedBy.set(entry, i);

  // Plain dots: those within DOT_FALLOFF_L of the active lightness, fading
  // out with distance, bucketed by opacity step.
  for (const b of _dotBuckets) b.length = 0;
  for (const entry of pantoneData) {
    if (promotedBy.has(entry) || !isEntryVisible(entry)) continue;
    const dL = Math.abs(entry.L - activeL);
    if (dL >= DOT_FALLOFF_L) continue;
    _dotBuckets[Math.round(DOT_ALPHA_STEPS * (1 - dL / DOT_FALLOFF_L))].push(entry);
  }
  dotCtx.fillStyle = color;
  for (let k = 1; k <= DOT_ALPHA_STEPS; k++) {
    const b = _dotBuckets[k];
    if (!b.length) continue;
    dotCtx.globalAlpha = DOT_PEAK_OPACITY * k / DOT_ALPHA_STEPS;
    dotCtx.beginPath();
    for (const e of b) { dotCtx.moveTo(e.x + DOT_RADIUS, e.y); dotCtx.arc(e.x, e.y, DOT_RADIUS, 0, TAU); }
    dotCtx.fill();
  }

  // Promoted colors: a ring at their swatch handle's opacity, drawn on top so
  // nearby dots never cover one (shown whatever the lightness or filter).
  dotCtx.strokeStyle = color;
  dotCtx.lineWidth = DOT_PROMOTED_STROKE;
  for (const [entry, i] of promotedBy) {
    dotCtx.globalAlpha = swatchHandleOpacity(i);
    dotCtx.beginPath();
    dotCtx.arc(entry.x, entry.y, DOT_PROMOTED_RADIUS, 0, TAU);
    dotCtx.stroke();
  }
  dotCtx.globalAlpha = 1;
}


// Pantone matching

// Scratch buffers
const okhslInput    = [0, 0, 0];
const swatchLabBuf = [0, 0, 0];
const hueLabBuf   = [0, 0, 0];
const p3Buf       = [0, 0, 0];
const oklabBuf    = [0, 0, 0];

function findClosestMatches(targetL, targetA, targetB, n = MAX_MATCHES) {
  const top = [];
  for (const e of pantoneData) {
    if (!isEntryVisible(e)) continue;
    const dL = e.L - targetL, da = e.a - targetA, db = e.b - targetB;
    const distSq = dL*dL + da*da + db*db;
    if (top.length < n) {
      let i = top.length;
      while (i > 0 && top[i-1].distSq > distSq) i--;
      top.splice(i, 0, { entry: e, distSq });
    } else if (distSq < top[n-1].distSq) {
      let i = n - 1;
      while (i > 0 && top[i-1].distSq > distSq) i--;
      top.splice(i, 0, { entry: e, distSq });
      top.length = n;
    }
  }
  return top;   // [{ entry, distSq }], nearest first
}

// Pure white (L=1) and pure black (L=0) are nudged just inside the extremes for
// matching only, so the chip lineup doesn't snap to a degenerate state when the
// lightbar bottoms/tops out — it holds the state it had just before the limit.
function clampMatchL(L) {
  return Math.min(0.999, Math.max(0.0001, L));
}

// Fill swatchLabBuf with the swatch's OKLab (with L clamped, see clampMatchL).
function fillTargetLab(c) {
  okhslInput[0] = c.h * 360;
  okhslInput[1] = c.s;
  okhslInput[2] = toe(clampMatchL(c.L));
  okhslToOKLab(okhslInput, swatchLabBuf);
}

// The `n` closest matches to a swatch (closest-first). `n` is just how many
// chips physically fit (see updateSwatchMatches).
function closestN(c, n) {
  fillTargetLab(c);
  return findClosestMatches(swatchLabBuf[0], swatchLabBuf[1], swatchLabBuf[2], n);
}

// The swatch's hue angle in the chips' OKLab-atan2 space. Computed at full
// saturation so it stays well-defined even when the swatch is neutral — the hue
// is latent state, the angle the color descended from (the disc preserves the
// stored `h` at dead-center, so a gray keeps its last hue).
function swatchHueAngle(c) {
  okhslInput[0] = c.h * 360;
  okhslInput[1] = 1;
  okhslInput[2] = toe(clampMatchL(c.L));
  okhslToOKLab(okhslInput, hueLabBuf);
  return (Math.atan2(hueLabBuf[2], hueLabBuf[1]) / TAU + 1) % 1;
}

function visibleMaxForRow(container) {
  if (!container) return DEFAULT_MATCH_COUNT;
  // Prefer the width cached by matchRowObserver (read post-layout, so it
  // costs no reflow here). Fall back to a live read until the observer has
  // first reported, so correctness never depends on observer timing.
  let w = container._matchCellsWidth;
  if (!w) {   // null/0 (e.g. hidden or just re-shown) -> read live width
    const matchCells = container.querySelector('.match-cells');
    w = (matchCells && matchCells.clientWidth) || container.clientWidth;
  }
  if (!w) return DEFAULT_MATCH_COUNT;
  return Math.max(MIN_MATCHES, Math.floor(w / MIN_MATCH_WIDTH));
}

// Field metallic texture is on when a metallic chip is hovered OR a metallic
// Pantone is promoted; either flag drives the .metallic-field class.
function syncFieldMetallic(matchCells) {
  if (!matchCells) return;
  matchCells.classList.toggle('metallic-field', !!(matchCells._metalHover || matchCells._metalPromoted));
}

function renderPromoted(cell, p) {
  if (!cell) return;
  const matchCells = cell.parentElement;
  const warn = cell.querySelector('.promoted-gamut-warning');
  if (matchCells) {
    matchCells._metalPromoted = !!(p && p.metallic);
    syncFieldMetallic(matchCells);
  }
  if (p) {
    cell.dataset.pantoneKey = p.key;
    const badge = cell.querySelector('.region-badge');
    if (badge && badge.textContent !== p.libName) badge.textContent = p.libName;
    renderPantoneLabel(cell.querySelector('.match-label'), p.name);
    cell.classList.toggle('out-of-gamut', !!p.outOfGamut);
    if (warn) warn.style.display = p.outOfGamut ? '' : 'none';
    if (matchCells && !matchCells.classList.contains('has-promotion')) {
      startChipTransition(matchCells);
    }
    if (matchCells) matchCells.classList.add('has-promotion');
  } else {
    delete cell.dataset.pantoneKey;
    cell.classList.remove('out-of-gamut');
    if (warn) warn.style.display = 'none';
    if (matchCells && matchCells.classList.contains('has-promotion')) {
      startChipTransition(matchCells);
    }
    if (matchCells) matchCells.classList.remove('has-promotion');
  }
}

function startChipTransition(matchCells) {
  clearTimeout(matchCells._chipTransitionTimer);
  matchCells.classList.add('chips-transitioning');
  matchCells._chipTransitionTimer = setTimeout(() => {
    matchCells.classList.remove('chips-transitioning');
  }, 250);
}

function clearChipCell(cell) {
  cell.style.display = 'none';
  cell.classList.remove('out-of-gamut', 'chip-short', 'metallic', 'promoted-match', 'hue-match');
  delete cell.dataset.pantoneKey;
}

function renderChipCell(cell, m, isHueMatch, isPromoted, chipTopRatio, hideGamut) {
  cell.style.display    = '';
  // Bar top slides down from the midpoint by deltaE/cutoff (see updateSwatchMatches).
  cell.style.setProperty('--chip-top', (chipTopRatio * 100).toFixed(2) + '%');
  // Cache the ratio so a height-only resize can re-evaluate the gamut cutoff
  // without re-running the (expensive) match scan (see applyGamutCutoff).
  cell._chipRatio = chipTopRatio;
  cell.querySelector('.chip-fill').style.background = pantoneP3Css(m);
  cell.dataset.pantoneKey = m.key;
  cell.classList.toggle('out-of-gamut', !!m.outOfGamut);
  cell.classList.toggle('chip-short', !!hideGamut);
  cell.classList.toggle('metallic', !!m.metallic);
  cell.classList.toggle('promoted-match', !!isPromoted);
  cell.classList.toggle('hue-match', !!isHueMatch);
  renderPantoneLabel(cell.querySelector('.match-label'), m.name);
}

const hueOf = m => (Math.atan2(m.b, m.a) / TAU + 1) % 1;
const hueDist = (a, b) => { const d = Math.abs(a - b) % 1; return Math.min(d, 1 - d); };

// The chip whose hue is closest to the target (gets the triangle marker).
function closestByHue(entries, targetHue) {
  let best = entries[0], bestD = Infinity;
  for (const e of entries) {
    const d = hueDist(hueOf(e), targetHue);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

// Sort matches by hue for display, centered on `targetHue`, and report where
// `markEntry` lands (the cell that gets the triangle marker).
function buildDisplayOrder(matches, targetHue, markEntry) {
  if (!matches.length) return { displayOrder: [], markDomIdx: -1 };

  // Cut the hue wheel at the antipode of the target hue (targetHue + 0.5) so the
  // chips fan out by hue with the target-hue chips in the MIDDLE of the lineup.
  // The arrangement rotates smoothly as the target hue moves — only the farthest
  // (antipodal) chips wrap across the seam at the outer edges — so a swatch
  // descending toward neutral keeps the order it had, centered on the hue it came
  // from (a latent angle; see swatchHueAngle).
  const seam = (targetHue + 0.5) % 1;
  const keyOf = m => (hueOf(m) - seam + 1) % 1;
  const displayOrder = matches.slice().sort((a, b) => keyOf(a) - keyOf(b));

  return { displayOrder, markDomIdx: displayOrder.indexOf(markEntry) };
}

function updateSwatchMatches(index) {
  const container = swatchEl(index);
  if (!container) return;
  const promotedCell = container.querySelector('.promoted-cell');
  const cells = container.querySelectorAll('.match-cells > .match-cell');
  if (!cells.length) return;

  const c = S.colors[index];
  const visibleMax = visibleMaxForRow(container);

  let selected = pantoneSelections.get(index) || null;
  // A promotion whose library is currently turned off stays STORED (so toggling
  // the library back on restores it, and the toggle records no history) but is
  // hidden — rendered as if un-promoted. Only explicit edits/depromotions, which
  // delete it outright, count as demotions.
  if (selected && !isEntryEnabled(selected)) selected = null;

  const hideAllChips = () => {
    for (const cell of cells) cell.style.display = 'none';
  };

  if (!pantoneData.length) {
    renderPromoted(promotedCell, null);
    hideAllChips();
    return;
  }

  if (!anyLibraryEnabled()) {
    hideAllChips();
    renderPromoted(promotedCell, selected);
    return;
  }

  // The vertical scale is GLOBAL, not per-row: heights are always derived from
  // the full MAX_MATCHES-deep pool — the worst of those sits at SKYLINE_FLOOR
  // and the rest scale toward full height (closest is tallest). `ratio` is the
  // chip's top offset (0 = top of strip, full bar); height = 1 - ratio. When
  // fewer chips physically fit (`visibleMax`) we simply DROP the worst matches
  // from view; the chips that remain keep the exact heights they'd have at full
  // width, so resizing the window or adding swatches never re-stretches them.
  // Chips are ordered by hue and the triangle flags the chip closest in hue to
  // the swatch — using the swatch's latent hue angle, so a neutral gray still
  // resolves a hue (the one it last descended from) rather than snapping.
  const pool = closestN(c, MAX_MATCHES);
  const targetHue = swatchHueAngle(c);

  let maxDeltaE = 0;
  for (const { distSq } of pool) {
    const dE = Math.sqrt(distSq);
    if (dE > maxDeltaE) maxDeltaE = dE;
  }

  // Keep only the closest `visibleMax` for display (pool is closest-first), but
  // scale every kept chip against the global maxDeltaE above.
  // (The pool is shorter than MAX_MATCHES when the switched-on libraries hold
  // fewer colors than that.)
  const keptCount = Math.min(visibleMax, pool.length);
  const ratioByEntry = new Map();
  const kept = [];
  const span = 1 - SKYLINE_FLOOR;
  for (let i = 0; i < keptCount; i++) {
    const { entry, distSq } = pool[i];
    const ratio = maxDeltaE > 0 ? (Math.sqrt(distSq) / maxDeltaE) * span : 0;
    ratioByEntry.set(entry, ratio);
    kept.push(entry);
  }

  const matchCellsEl = container.querySelector('.match-cells');

  renderPromoted(promotedCell, selected);

  // The chip strip fills with the promoted Pantone's color when one is pinned,
  // otherwise the swatch's own color — so the field reads as continuous behind
  // the bars. (Owned here, not in updateSwatch, so promote/un-promote — which
  // only call updateSwatchMatches — update the backdrop too.)
  if (matchCellsEl) {
    let bg;
    if (selected) {
      bg = pantoneP3Css(selected);
    } else {
      const { p3Css, srgbCss, outOfSRGB } = computeP3AndSRGB(c);
      bg = outOfSRGB ? p3Css : srgbCss;
    }
    // Remember the resting background; while a chip is being hovered the
    // strip shows that chip's color instead (see chip hover preview below),
    // and restores to this when the pointer leaves.
    matchCellsEl._baseBg = bg;
    if (!matchCellsEl._chipHover) {
      matchCellsEl.style.background = bg;
      matchCellsEl.style.setProperty('--region-bg', bg);
    }
  }

  const { displayOrder, markDomIdx } = buildDisplayOrder(kept, targetHue, closestByHue(kept, targetHue));

  // The closest-hue flag is meaningless for a true neutral (chroma 0) or pure
  // black/white, so suppress it there.
  const showHueMark = !(c.s === 0 || c.L >= 1 || c.L <= 0);

  // Bar height = (1 - ratio) × strip height; hide the gamut icon below the
  // minimum height where it would no longer fit.
  const stripH = container._matchCellsHeight
    || container.querySelector('.match-cells')?.clientHeight || 0;

  for (let i = 0; i < cells.length; i++) {
    const entry = displayOrder[i];
    if (!entry) { clearChipCell(cells[i]); continue; }
    const ratio = ratioByEntry.get(entry);
    const hideGamut = (1 - ratio) * stripH < MIN_GAMUT_BAR_H;
    renderChipCell(
      cells[i], entry, showHueMark && i === markDomIdx,
      !!selected && entry.key === selected.key, ratio, hideGamut,
    );
  }

}

// Hide a chip's text label when it won't fit cleanly: either the bar is too
// short to show the whole label, or the label collides with the (still-visible)
// out-of-gamut icon. Both reduce to one test — the label's text must end above a
// "floor": the icon's top edge when the icon shows, otherwise the bar's bottom.
// Measured post-layout, batched to one reflow; the label keeps its layout box
// (visibility, not display) so the measurement stays stable across frames.

function renderPantoneLabel(labelEl, name) {
  labelEl.textContent = name;
  const m = name.match(/^(.*?)\s+(NEON|PASTEL|METALLIC)\s*$/i);
  if (m && labelWraps(labelEl)) labelEl.textContent = m[1];
}

function labelWraps(el) {
  if (!el.firstChild) return false;
  const range = document.createRange();
  range.selectNodeContents(el);
  return range.getClientRects().length > 1;
}

function findPantoneByKey(key) {
  for (const e of pantoneData) if (e.key === key) return e;
  return null;
}

function oklabToP3Css(L, a, b) {
  oklabBuf[0] = L; oklabBuf[1] = a; oklabBuf[2] = b;
  convert(oklabBuf, OKLab, DisplayP3, p3Buf);
  return `color(display-p3 ${Math.max(0, p3Buf[0]).toFixed(3)} ${Math.max(0, p3Buf[1]).toFixed(3)} ${Math.max(0, p3Buf[2]).toFixed(3)})`;
}

// A pantone's pickable color: hold hue and lightness, pull the OKHSL
// saturation in to the rim of the current gamut (s ≤ 1) for out-of-gamut
// pantones — the P3 rim in P3 mode, the sRGB rim in sRGB mode — radial chroma
// reduction, not a per-channel clip. This is the SAME point the swatch stores
// on assignment (s = min(1, entry.s)), so the chip, promoted cell, drag dot and
// swatch fill all render the identical color. In-gamut pantones (s ≤ 1) are
// unchanged.
function pantoneP3Css(entry) {
  const lab = toOKLab(entry.h, Math.min(1, entry.s), toe(entry.L));
  return oklabToP3Css(lab[0], lab[1], lab[2]);
}

function buildMatchCells(container) {
  const swatchInner = container.querySelector('.swatch-inner');
  if (!swatchInner || swatchInner.querySelector('.match-row')) return;

  const matchRow = document.createElement('div');
  matchRow.className = 'match-row';

  const matchCells = document.createElement('div');
  matchCells.className = 'match-cells';

  // Field-level metallic texture: overlays the color field (behind the chips)
  // while a metallic chip is hovered or a metallic Pantone is promoted. First
  // child so it sits under the chips — only the open field reads as metallic.
  const fieldNoise = document.createElement('div');
  fieldNoise.className = 'noise-overlay match-field-noise';
  matchCells.appendChild(fieldNoise);

  const promotedCell = document.createElement('div');
  promotedCell.className = 'promoted-cell';
  const depromote = ev => {
    ev.stopPropagation();
    const i = idxOf(container);
    if (!Number.isInteger(i) || i < 0 || i >= S.colors.length) return;
    pantoneSelections.delete(i);
    updateSwatchMatches(i);
    updateDots();
    updateSwatch(i);   // refresh CMYK region (the library alternate depends on promotion)
    flushPendingWheelSnapshot();
    recordSnapshot();
  };
  // Badge left of the name
  const promotedBadge = document.createElement('span');
  promotedBadge.className = 'region-badge';
  promotedBadge.textContent = 'Library';   // replaced by the library's name on promotion
  promotedCell.appendChild(promotedBadge);
  const promotedLabel = document.createElement('div');
  promotedLabel.className = 'match-label';
  promotedCell.appendChild(promotedLabel);
  // Out-of-P3 caution to the right of the name
  const promotedWarn = document.createElement('span');
  promotedWarn.className = 'icon promoted-gamut-warning';
  promotedWarn.innerHTML = GAMUT_ICON_SVG;
  promotedWarn.style.display = 'none';
  promotedCell.appendChild(promotedWarn);
  // Close button at the far right
  const promotedClose = document.createElement('span');
  promotedClose.className = 'icon promoted-close';
  promotedClose.innerHTML = CLOSE_ICON_SVG;
  promotedClose.addEventListener('click', depromote);
  promotedCell.appendChild(promotedClose);
  matchCells.appendChild(promotedCell);

  for (let i = 0; i < MAX_MATCHES; i++) {
    const cell = document.createElement('div');
    cell.className = 'match-cell';
    // row-reverse puts the first DOM cell at the visual right edge; it has no
    // chip to its right, so it never draws a right border (see CSS).
    if (i === 0) cell.classList.add('chip-rightmost');
    cell.style.display = 'none';
    // Two triangle markers per chip:
    //  • .hue-marker   — bottom, on the chip boundary; flags the closest-hue chip.
    //  • .promoted-chip — top cap over the bar; shows on hover, stays on the promoted chip.
    const hueMarker = document.createElement('div');
    hueMarker.className = 'hue-marker';
    cell.appendChild(hueMarker);
    const promotedChip = document.createElement('div');
    promotedChip.className = 'promoted-chip';
    cell.appendChild(promotedChip);
    // The color bar: background + border only. Label lives in a sibling
    // .chip-label-wrap so it can be masked independently without fading
    // the chip's background color.
    const fill = document.createElement('div');
    fill.className = 'chip-fill';
    const noiseEl = document.createElement('div');
    noiseEl.className = 'noise-overlay';
    fill.appendChild(noiseEl);
    cell.appendChild(fill);
    const labelWrap = document.createElement('div');
    labelWrap.className = 'chip-label-wrap';
    const label = document.createElement('div');
    label.className = 'match-label';
    labelWrap.appendChild(label);
    cell.appendChild(labelWrap);
    const gamutIcon = document.createElement('span');
    gamutIcon.className = 'icon chip-gamut-warning';
    gamutIcon.innerHTML = GAMUT_ICON_SVG;
    cell.appendChild(gamutIcon);
    matchCells.appendChild(cell);
  }
  matchRow.appendChild(matchCells);

  swatchInner.appendChild(matchRow);
  matchRowObserver.observe(matchCells);   // width drives how many chips fit
  wireMatchRowClick(matchRow, container);
}

function updateAllSwatchMatches() {
  for (let i = 0; i < S.colors.length; i++) updateSwatchMatches(i);
}

// Labels are measured against the (mono) font; if it isn't ready at first paint,

// Coalesce match recomputes (the ~1ms-per-swatch findClosestMatches scan)
// to one pass per animation frame, so multiple pointer events within a
// frame collapse into a single recompute and the work runs off the
// pointer handler rather than synchronously inside it.
let _matchRAF = 0;
const _dirtyMatches = new Set();

function scheduleMatches(indices) {
  for (const i of indices) _dirtyMatches.add(i);
  if (_matchRAF) return;
  _matchRAF = requestAnimationFrame(() => {
    _matchRAF = 0;
    const ids = [..._dirtyMatches];
    _dirtyMatches.clear();
    for (const i of ids) if (i < S.colors.length) updateSwatchMatches(i);
  });
}

// Height-only update. The match SET is independent of strip height — only each
// chip's gamut-icon cutoff (hideGamut) depends on it. So a vertical resize just
// re-toggles `chip-short` from each chip's cached ratio, with NO library scan.
function applyGamutCutoff(index) {
  const container = swatchEl(index);
  if (!container) return;
  const stripH = container._matchCellsHeight
    || container.querySelector('.match-cells')?.clientHeight || 0;
  if (!stripH) return;
  for (const cell of container.querySelectorAll('.match-cells > .match-cell')) {
    if (cell.style.display === 'none') continue;
    const ratio = cell._chipRatio;
    if (ratio == null) continue;
    cell.classList.toggle('chip-short', (1 - ratio) * stripH < MIN_GAMUT_BAR_H);
  }
}

let _cutoffRAF = 0;
const _dirtyCutoff = new Set();
function scheduleGamutCutoff(index) {
  _dirtyCutoff.add(index);
  if (_cutoffRAF) return;
  _cutoffRAF = requestAnimationFrame(() => {
    _cutoffRAF = 0;
    const ids = [..._dirtyCutoff];
    _dirtyCutoff.clear();
    for (const i of ids) if (i < S.colors.length) applyGamutCutoff(i);
  });
}

const matchRowObserver = new ResizeObserver(entries => {
  for (const entry of entries) {
    const container = entry.target.closest('.swatch-container');
    if (!container) continue;
    const w = entry.target.clientWidth;   // entry.target is .match-cells
    const h = entry.target.clientHeight;  // strip height drives the gamut-icon cutoff
    // Always cache the live size so updateSwatchMatches/visibleMaxForRow can read
    // it without forcing a reflow. Both width and height change every frame during
    // a drag-resize, but the actual rendering only steps on two discrete things:
    //  - CHIP COUNT (derived from width, capped at MAX_MATCHES) → the match SET
    //    changes, so a full recompute is needed (coalesced via scheduleMatches).
    //  - STRIP HEIGHT → only each chip's gamut-icon cutoff changes, never the set,
    //    so a cheap cutoff-only pass suffices (scheduleGamutCutoff) — no library
    //    scan. Both are rAF-coalesced; a frame where neither stepped does nothing.
    // This keeps a continuous (especially vertical) resize on a wide window with a
    // full chip complement from stalling the frame (canvas included).
    container._matchCellsWidth = w;
    container._matchCellsHeight = h;
    const chipCount = w ? Math.min(MAX_MATCHES, Math.max(MIN_MATCHES, Math.floor(w / MIN_MATCH_WIDTH))) : 0;
    const countChanged = chipCount !== container._matchChipCount;
    const heightChanged = h !== container._matchRenderedHeight;
    if (!countChanged && !heightChanged) continue;
    container._matchChipCount = chipCount;
    container._matchRenderedHeight = h;
    const i = idxOf(container);
    if (!Number.isInteger(i) || i < 0 || i >= S.colors.length) continue;
    if (countChanged) scheduleMatches([i]);       // set may change → full recompute
    else scheduleGamutCutoff(i);                   // height-only → cheap cutoff pass
  }
});

function wireMatchRowClick(matchRow, container) {
  matchRow.addEventListener('click', ev => {
    // Only the chip body toggles promotion — the empty field above a chip is not
    // a target. The bar, its gamut icon (part of the chip body), and the promoted
    // chip's triangle marker all count.
    const hit = ev.target.closest('.chip-fill, .chip-gamut-warning');
    if (!hit) return;
    const cell = hit.closest('.match-cell');
    if (!cell) return;
    const i = idxOf(container);
    if (!Number.isInteger(i) || i < 0 || i >= S.colors.length) return;

    const key = cell.dataset.pantoneKey;
    if (!key) return;
    const entry = findPantoneByKey(key);
    if (!entry) return;

    // Clicking a match chip promotes it; clicking the already-promoted chip's
    // marker toggles it back off.
    if (pantoneSelections.get(i) === entry) pantoneSelections.delete(i);
    else pantoneSelections.set(i, entry);
    updateSwatchMatches(i);
    updateDots();
    updateSwatch(i);   // refresh CMYK region (the library alternate depends on promotion)
    flushPendingWheelSnapshot();
    recordSnapshot();
  });
}


// Status region: a shared line below the swatches for transient notes. Hovering
// an out-of-gamut caution (a chip's, or the promoted cell's) shows the note;
// leaving the swatch area clears it. Other features can call setStatus() too.
const statusRegion = document.getElementById('status-region');
const gamutStatus = () => isSRGBMode()
  ? "This library color is outside the sRGB color gamut of this browser's current display mode."
  : "This library color is outside the Display P3 color gamut of this browser's current display mode.";
function setStatus(text) { if (statusRegion) statusRegion.textContent = text || ''; }

els.swatches.addEventListener('pointerover', ev => {
  // Hovering the chip body (the bar or its gamut icon — not the empty strip
  // above) of an out-of-gamut chip, or the promoted swatch's overlay when its
  // pantone is out of gamut, surfaces the note.
  const chipHit = ev.target.closest('.chip-fill, .chip-gamut-warning');
  const onChip = chipHit && chipHit.closest('.match-cell.out-of-gamut');
  const onPromoted = ev.target.closest('.promoted-gamut-warning');
  // A swatch's own gamut warnings say what clicking them does (swatches.js):
  // the P3 bar's snaps to sRGB; the CMYK region's names the current mode's gamut.
  const swatchWarn = ev.target.closest('.gamut-warning');
  if (swatchWarn) {
    const space = swatchWarn.classList.contains('cmyk-gamut') && !isSRGBMode() ? 'P3' : 'sRGB';
    setStatus(`Snap swatch to closest in-gamut ${space} color`);
    return;
  }
  setStatus(onChip || onPromoted ? gamutStatus() : '');
});
els.swatches.addEventListener('pointerleave', () => setStatus(''));

// Hovering a chip body (the bar or its gamut icon — not the empty strip above)
// previews that chip's color as the match-strip background; leaving the chip
// restores the strip's resting background (see updateSwatchMatches, _baseBg).
function chipBgPreview(ev) {
  const matchCells = ev.target.closest('.match-cells');
  if (!matchCells) return;
  const hit = ev.target.closest('.chip-fill, .chip-gamut-warning');
  const cell = hit && hit.closest('.match-cell');
  const key = cell && cell.dataset.pantoneKey;
  if (key) {
    const entry = findPantoneByKey(key);
    if (entry) {
      clearTimeout(matchCells._chipHoverTimer);
      matchCells._chipHover = true;
      matchCells.classList.add('chip-hover-preview');
      matchCells.style.background = pantoneP3Css(entry);
      matchCells._metalHover = !!entry.metallic;
      syncFieldMetallic(matchCells);
      return;
    }
  }
  endChipPreview(matchCells);
}
// Restore the resting background, keeping the preview class on through the
// 0.1s transition so the restore eases too, then drop the class.
function endChipPreview(matchCells) {
  if (!matchCells._chipHover) return;
  matchCells._chipHover = false;
  matchCells._metalHover = false;
  syncFieldMetallic(matchCells);       // texture stays only if a metallic is promoted
  matchCells.style.background = matchCells._baseBg || '';
  clearTimeout(matchCells._chipHoverTimer);
  matchCells._chipHoverTimer = setTimeout(() => {
    if (!matchCells._chipHover) matchCells.classList.remove('chip-hover-preview');
  }, 110);
}
els.swatches.addEventListener('pointermove', chipBgPreview);
els.swatches.addEventListener('pointerout', ev => {
  const matchCells = ev.target.closest('.match-cells');
  if (matchCells && !matchCells.contains(ev.relatedTarget)) endChipPreview(matchCells);
});


// Library filter checkboxes + pantone option checkboxes

const metallicTextureCb = document.getElementById('toggle-metallic-texture');
if (metallicTextureCb) {
  metallicTextureCb.addEventListener('change', () => {
    els.swatches.classList.toggle('metallic-texture', metallicTextureCb.checked);
  });
}

const hideOnPromoteCb = document.getElementById('toggle-hide-on-promote');
if (hideOnPromoteCb) {
  // Initialize to match the checkbox's default (checked).
  els.swatches.classList.toggle('hide-chips-on-promote', hideOnPromoteCb.checked);
  hideOnPromoteCb.addEventListener('change', () => {
    // Animate chips in/out on every promoted row.
    els.swatches.querySelectorAll('.match-cells.has-promotion').forEach(startChipTransition);
    els.swatches.classList.toggle('hide-chips-on-promote', hideOnPromoteCb.checked);
  });
}

// The Libraries section's own toggle (#toggle-libraries, in the section head)
// switches the whole feature on or off — matches, dots, promotions on view.
const sectionToggle = document.getElementById('toggle-libraries');
if (sectionToggle) {
  S.libraryFilters.base = sectionToggle.checked;
  sectionToggle.addEventListener('change', () => {
    S.libraryFilters.base = sectionToggle.checked;
    updateDots();
    updateMatchesVisibility();
    updateAllSwatchMatches();
    // CMYK swatch layout depends on match visibility (bottom vs side mode),
    // so trigger a render whenever library state changes.
    P.render();
  });
}

function updateMatchesVisibility() {
  els.swatches.classList.toggle('show-matches', anyLibraryEnabled());
}



export {
  clearPromotedOnEdit, setLibraryEntries, setActiveLibraries, isPromotionShown, updateSwatchMatches, updateDots,
  scheduleMatches, updateMatchesVisibility,
  findPantoneByKey, pantoneP3Css, buildMatchCells, matchRowObserver,
  remapPantoneToGamut,
};
