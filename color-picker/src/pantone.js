// Pantone library: loading the data file, rendering disc dots, finding
// closest matches per swatch, the match-chip row, and the library filter
// checkboxes.

import {
  DOT_RADIUS, DOT_PEAK_OPACITY, DOT_FALLOFF_L, DOT_PROMOTED_RADIUS, DOT_PROMOTED_STROKE,
  MIDDLE_GRAY, DISC_SIZE, DEFAULT_MATCH_COUNT, MIN_MATCHES, MAX_MATCHES, MIN_MATCH_WIDTH,
  MIN_VISIBLE_CHIPS, MIN_CHIP_CUTOFF, MAX_CHIP_CUTOFF, MIN_GAMUT_BAR_H,
  GAMUT_ICON_SVG, CLOSE_ICON_SVG,
} from './constants.js';
import { S, P, els, pantoneSelections, savePreferredMatchCount, saveChipCutoff } from './state.js';
import { TAU, svgEl, idxOf } from './picker.js';
import { toe, toOKLab, computeP3AndSRGB } from './color.js';
import { OKLabToOKHSL, OKHSLToOKLab, DisplayP3Gamut, convert, OKLab, DisplayP3 } from 'https://esm.sh/@texel/color@1.1.11?bundle';
import { swatchEl } from './swatches.js';
import { flushPendingWheelSnapshot, recordSnapshot } from './history.js';

const PANTONE_URL = new URL('../Pantone_OKLAB.txt', import.meta.url);

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


// Pantone library

const pantoneData = [];

const discDots = svgEl('g', { 'pointer-events': 'none', id: 'pantone-dots' });
els.discOverlay.insertBefore(discDots, els.discOverlay.firstChild.nextSibling);

function categoryOf(name) {
  if (name.includes('PASTEL')) return 'pastel';
  if (name.includes('NEON'))   return 'neon';
  if (/\bSP\b/.test(name))     return 'sp';   // skin-tone library, e.g. "SP 1-1 C"
  if (name.includes('XGC'))    return 'xgc';
  if (name.includes('METALLIC'))    return 'metallic';
  return 'base';
}

function isCategoryVisible(cat) {
  if (!S.libraryFilters.base) return false;
  if (cat === 'base') return true;
  return !!S.libraryFilters[cat];
}

function anyLibraryEnabled() { return !!S.libraryFilters.base; }

function isCategoryEnabled(category) {
  if (category === 'base') return true;
  return !!S.libraryFilters[category];
}

async function loadPantoneLibrary() {
  let text;
  try {
    const res = await fetch(PANTONE_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    text = await res.text();
  } catch (err) {
    console.warn('Pantone library failed to load:', err);
    return;
  }

  const labBuf = [0, 0, 0];
  const p3Check = [0, 0, 0];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const name = line.slice(0, tab).trim();
    const rest = line.slice(tab + 1).trim();
    let lab;
    try { lab = JSON.parse(rest); } catch { continue; }
    if (!Array.isArray(lab) || lab.length !== 3) continue;

    const hsl = [0, 0, 0];
    OKLabToOKHSL(lab, DisplayP3Gamut, hsl);
    const h = hsl[0] / 360;
    const s = hsl[1];
    const L = lab[0];

    labBuf[0] = L; labBuf[1] = lab[1]; labBuf[2] = lab[2];
    convert(labBuf, OKLab, DisplayP3, p3Check);
    const outOfP3 = p3Check[0] < -1e-4 || p3Check[0] > 1 + 1e-4
                 || p3Check[1] < -1e-4 || p3Check[1] > 1 + 1e-4
                 || p3Check[2] < -1e-4 || p3Check[2] > 1 + 1e-4;

    pantoneData.push({ name, category: categoryOf(name), L, a: lab[1], b: lab[2], h, s, outOfP3, el: null });
  }

  buildDots();
  updateDots();
  updateMatchesVisibility();
  updateAllSwatchMatches();
}

function buildDots() {
  discDots.innerHTML = '';
  const DISC_R_LOCAL = DISC_SIZE / 2;
  const frag = document.createDocumentFragment();
  for (const entry of pantoneData) {
    const ang = entry.h * TAU;
    const s   = Math.min(1, entry.s);  // clamp OOG pantones to the rim
    const cx  = DISC_R_LOCAL + Math.cos(ang) * s * DISC_R_LOCAL;
    const cy  = DISC_R_LOCAL - Math.sin(ang) * s * DISC_R_LOCAL;
    const circ = svgEl('circle', {
      cx: cx.toFixed(2), cy: cy.toFixed(2), r: DOT_RADIUS,
      fill: '#000', 'fill-opacity': '0',
    });
    frag.appendChild(circ);
    entry.el = circ;
    entry._stateKey = '';   // last applied-state key (see updateDots)
  }
  discDots.appendChild(frag);   // one DOM insertion instead of ~5000
}

let lastDotsActiveL   = NaN;
let lastDotsFilterSig = '';

function dotsFilterSig() {
  const f = S.libraryFilters;
  const filterPart = `${f.base ? 1 : 0}${f.pastel ? 1 : 0}${f.neon ? 1 : 0}${f.sp ? 1 : 0}${f.xgc ? 1 : 0}${f.metallic ? 1 : 0}`;
  const promotedPart = [...pantoneSelections.entries()]
    .map(([i, e]) => `${i}:${e.name}`).sort().join('|');
  const multi = [...S.multiSelect].sort((a, b) => a - b).join(',');
  const selPart = `${S.activeIndex}/${multi}`;
  return `${filterPart}:${promotedPart}:${selPart}`;
}

function swatchHandleOpacity(i) {
  if (S.multiSelect.has(i)) return 1;
  if (i === S.activeIndex && !S.isMultiMode()) return 0.6;
  return 0.1;
}

function updateDots() {
  if (!pantoneData.length) return;
  const idx = S.activeIndex !== -1 ? S.activeIndex : S.lastActiveIndex;
  const activeL    = S.colors[idx]?.L ?? 0.5;
  const filterSig  = dotsFilterSig();
  if (activeL === lastDotsActiveL && filterSig === lastDotsFilterSig) return;
  lastDotsActiveL   = activeL;
  lastDotsFilterSig = filterSig;

  const color = activeL > MIDDLE_GRAY ? '#000' : '#fff';

  const promotedBy = new Map();
  for (const [i, entry] of pantoneSelections) promotedBy.set(entry, i);

  for (const entry of pantoneData) {
    const el = entry.el;
    if (!el) continue;

    // Derive this dot's desired applied-state key, then skip all DOM
    // writes if it is unchanged since the last update. During a lightbar
    // drag only the thin band of dots near the new lightness changes
    // state, so this avoids re-touching ~5000 unchanged dots per frame.
    const ownerIdx = promotedBy.get(entry);
    let st, opacity;
    if (ownerIdx !== undefined) {
      st = `P${color}${swatchHandleOpacity(ownerIdx).toFixed(3)}`;
    } else if (!isCategoryVisible(entry.category)) {
      st = 'H';
    } else {
      const dL = Math.abs(entry.L - activeL);
      if (dL >= DOT_FALLOFF_L) {
        st = 'H';
      } else {
        opacity = DOT_PEAK_OPACITY * (1 - dL / DOT_FALLOFF_L);
        st = `D${color}${opacity.toFixed(3)}`;
      }
    }

    if (st === entry._stateKey) continue;
    entry._stateKey = st;

    if (st === 'H') {
      el.style.display = 'none';
    } else if (st[0] === 'P') {
      el.style.display = '';
      el.setAttribute('r', DOT_PROMOTED_RADIUS);
      el.setAttribute('fill', 'none');
      el.setAttribute('stroke', color);
      el.setAttribute('stroke-width', DOT_PROMOTED_STROKE);
      el.setAttribute('stroke-opacity', swatchHandleOpacity(ownerIdx).toFixed(3));
      el.removeAttribute('fill-opacity');
    } else {
      el.style.display = '';
      el.setAttribute('r', DOT_RADIUS);
      el.setAttribute('fill', color);
      el.setAttribute('fill-opacity', opacity.toFixed(3));
      el.removeAttribute('stroke');
      el.removeAttribute('stroke-width');
      el.removeAttribute('stroke-opacity');
    }
  }
}


// Pantone matching

// Scratch buffers
const okhslInput    = [0, 0, 0];
const swatchLabBuf = [0, 0, 0];
const p3Buf       = [0, 0, 0];
const oklabBuf    = [0, 0, 0];

function findClosestMatches(targetL, targetA, targetB, n = MAX_MATCHES) {
  const top = [];
  for (const e of pantoneData) {
    if (!isCategoryVisible(e.category)) continue;
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

// The `n` closest matches to a swatch (closest-first). Each swatch shows a
// fixed count `n` (wheel-set); the per-colour cutoff is then derived from these
// distances so the skyline always fills (see updateSwatchMatches).
function closestN(c, n) {
  okhslInput[0] = c.h * 360;
  okhslInput[1] = c.s;
  okhslInput[2] = toe(c.L);
  OKHSLToOKLab(okhslInput, DisplayP3Gamut, swatchLabBuf);
  return findClosestMatches(swatchLabBuf[0], swatchLabBuf[1], swatchLabBuf[2], n);
}

// The visible count for a swatch: the wheel-set preference, floored so some
// chips always show and capped by what the row physically holds.
function chipCountFor(c, visibleMax) {
  const desired = c.matchCount ?? DEFAULT_MATCH_COUNT;
  const cap = Math.min(visibleMax, MAX_MATCHES);
  return Math.max(Math.min(MIN_VISIBLE_CHIPS, cap), Math.min(desired, cap));
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

function renderPromoted(cell, p) {
  if (!cell) return;
  if (p) {
    cell.style.display = '';
    cell.style.background = pantoneP3Css(p);
    cell.dataset.pantoneName = p.name;
    cell.classList.toggle('light', p.L > MIDDLE_GRAY);
    cell.classList.toggle('metallic', p.category === 'metallic');
    renderPantoneLabel(cell.querySelector('.match-label'), p.name);
  } else {
    cell.style.display = 'none';
    cell.classList.remove('light', 'metallic');
    delete cell.dataset.pantoneName;
  }
}

function clearChipCell(cell) {
  cell.style.display = 'none';
  cell.classList.remove('out-of-p3', 'chip-short', 'metallic', 'promoted-match', 'best-match');
  delete cell.dataset.pantoneName;
}

function renderChipCell(cell, m, isBest, isPromoted, chipTopRatio, hideGamut) {
  cell.style.display    = '';
  // Bar top slides down from the midpoint by deltaE/cutoff (see updateSwatchMatches).
  cell.style.setProperty('--chip-top', (chipTopRatio * 100).toFixed(2) + '%');
  cell.querySelector('.chip-fill').style.background = pantoneP3Css(m);
  cell.dataset.pantoneName = m.name;
  cell.classList.toggle('out-of-p3', !!m.outOfP3);
  cell.classList.toggle('chip-short', !!hideGamut);
  cell.classList.toggle('metallic', m.category === 'metallic');
  cell.classList.toggle('promoted-match', !!isPromoted);
  cell.classList.toggle('best-match', !!isBest);
  renderPantoneLabel(cell.querySelector('.match-label'), m.name);
}

function buildDisplayOrder(matches) {
  if (!matches.length) return { displayOrder: [], bestDomIdx: -1 };
  if (!S.sortChipsByHue) return { displayOrder: matches, bestDomIdx: 0 };
  const anchor = matches[0];

  // Plain ascending sort by Lab hue angle, with the 0°/360° seam
  // placed in the largest gap between chips so no cluster is split
  // across the wraparound.
  const hueOf = m => (Math.atan2(m.b, m.a) / TAU + 1) % 1;
  const angles = matches.map(hueOf).sort((a, b) => a - b);

  // Find largest gap on the circle (including the wraparound gap).
  let seam = 0, maxGap = -1;
  for (let i = 0; i < angles.length; i++) {
    const next = i === angles.length - 1 ? angles[0] + 1 : angles[i + 1];
    const gap = next - angles[i];
    if (gap > maxGap) { maxGap = gap; seam = (angles[i] + gap / 2) % 1; }
  }

  const keyOf = m => (hueOf(m) - seam + 1) % 1;
  const visual = matches.slice().sort((a, b) => keyOf(a) - keyOf(b));
  const displayOrder = visual.slice().reverse();
  return { displayOrder, bestDomIdx: displayOrder.indexOf(anchor) };
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
  if (selected && !isCategoryEnabled(selected.category)) {
    pantoneSelections.delete(index);
    selected = null;
  }

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

  // The wheel sets this swatch's candidate count `n` (a cap); the global cutoff
  // (slider, same for every swatch) then hides any of those n beyond the cutoff
  // and sets the skyline scale: ratio = deltaE / cutoff, closest at the top,
  // matches at/beyond the cutoff dropped.
  const cutoff = S.chipCutoff;
  const n = chipCountFor(c, visibleMax);
  const pool = closestN(c, n);

  const ratioByEntry = new Map();
  const kept = [];
  for (const { entry, distSq } of pool) {
    const ratio = Math.sqrt(distSq) / cutoff;
    if (ratio >= 1) continue;
    ratioByEntry.set(entry, ratio);
    kept.push(entry);
  }

  renderPromoted(promotedCell, selected);

  // The chip strip fills with the promoted Pantone's colour when one is pinned,
  // otherwise the swatch's own colour — so the field reads as continuous behind
  // the bars. (Owned here, not in updateSwatch, so promote/un-promote — which
  // only call updateSwatchMatches — update the backdrop too.)
  const matchCellsEl = container.querySelector('.match-cells');
  if (matchCellsEl) {
    if (selected) {
      matchCellsEl.style.background = pantoneP3Css(selected);
    } else {
      const { p3Css, srgbCss, outOfSRGB } = computeP3AndSRGB(c);
      matchCellsEl.style.background = outOfSRGB ? p3Css : srgbCss;
    }
  }

  const { displayOrder, bestDomIdx } = buildDisplayOrder(kept);

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
      cells[i], entry, i === bestDomIdx,
      !!selected && entry.name === selected.name, ratio, hideGamut,
    );
  }
}

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

function findPantoneByName(name) {
  for (const e of pantoneData) if (e.name === name) return e;
  return null;
}

function oklabToP3Css(L, a, b) {
  oklabBuf[0] = L; oklabBuf[1] = a; oklabBuf[2] = b;
  convert(oklabBuf, OKLab, DisplayP3, p3Buf);
  return `color(display-p3 ${Math.max(0, p3Buf[0]).toFixed(3)} ${Math.max(0, p3Buf[1]).toFixed(3)} ${Math.max(0, p3Buf[2]).toFixed(3)})`;
}

// A pantone's pickable P3 colour: hold hue and lightness, pull the OKHSL
// saturation in to the P3 rim (s ≤ 1) for out-of-P3 pantones — radial chroma
// reduction, not a per-channel clip. This is the SAME point the swatch stores
// on assignment (s = min(1, entry.s)), so the chip, promoted cell, drag dot and
// swatch fill all render the identical colour. In-gamut pantones (s ≤ 1) are
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

  const promotedCell = document.createElement('div');
  promotedCell.className = 'promoted-cell';
  promotedCell.style.display = 'none';
  const promotedClose = document.createElement('span');
  promotedClose.className = 'icon promoted-close';
  promotedClose.innerHTML = CLOSE_ICON_SVG;
  promotedClose.addEventListener('click', ev => {
    ev.stopPropagation();
    const i = idxOf(container);
    if (!Number.isInteger(i) || i < 0 || i >= S.colors.length) return;
    pantoneSelections.delete(i);
    updateSwatchMatches(i);
    updateDots();
    flushPendingWheelSnapshot();
    recordSnapshot();
  });
  promotedCell.appendChild(promotedClose);
  const promotedLabel = document.createElement('div');
  promotedLabel.className = 'match-label';
  promotedCell.appendChild(promotedLabel);
  const promotedNoise = document.createElement('div');
  promotedNoise.className = 'noise-overlay';
  promotedCell.appendChild(promotedNoise);
  matchRow.appendChild(promotedCell);

  const matchCells = document.createElement('div');
  matchCells.className = 'match-cells';
  for (let i = 0; i < MAX_MATCHES; i++) {
    const cell = document.createElement('div');
    cell.className = 'match-cell';
    cell.style.display = 'none';
    const cap = document.createElement('div');
    cap.className = 'match-cap';
    cell.appendChild(cap);
    const dot = document.createElement('div');
    dot.className = 'match-dot';
    dot.textContent = '●';
    cell.appendChild(dot);
    // The colour bar: anchored to the strip bottom, its top edge set per-chip
    // by --chip-top. Label + metallic noise ride inside it, so they track the
    // skyline; the gamut icon stays pinned to the (full-height) cell bottom.
    const fill = document.createElement('div');
    fill.className = 'chip-fill';
    const label = document.createElement('div');
    label.className = 'match-label';
    fill.appendChild(label);
    const noiseEl = document.createElement('div');
    noiseEl.className = 'noise-overlay';
    fill.appendChild(noiseEl);
    cell.appendChild(fill);
    const gamutIcon = document.createElement('span');
    gamutIcon.className = 'icon chip-gamut-warning';
    gamutIcon.innerHTML = GAMUT_ICON_SVG;
    cell.appendChild(gamutIcon);
    matchCells.appendChild(cell);
  }
  matchRow.appendChild(matchCells);

  const tooltip = document.createElement('div');
  tooltip.className = 'chip-gamut-tooltip';
  tooltip.textContent = 'This Pantone color is outside the color space of this display';
  swatchInner.appendChild(tooltip);

  swatchInner.appendChild(matchRow);
  matchRowObserver.observe(matchCells);   // width drives how many chips fit
  wireMatchRowWheel(matchRow, container);
  wireMatchRowClick(matchRow, container);
}

function updateAllSwatchMatches() {
  for (let i = 0; i < S.colors.length; i++) updateSwatchMatches(i);
}

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

const matchRowObserver = new ResizeObserver(entries => {
  for (const entry of entries) {
    const container = entry.target.closest('.swatch-container');
    if (!container) continue;
    const w = entry.target.clientWidth;   // entry.target is .match-cells
    const h = entry.target.clientHeight;  // strip height drives the gamut-icon cutoff
    if (container._matchCellsWidth === w && container._matchCellsHeight === h) continue;
    container._matchCellsWidth = w;
    container._matchCellsHeight = h;
    const i = idxOf(container);
    if (Number.isInteger(i) && i >= 0 && i < S.colors.length) updateSwatchMatches(i);
  }
});

function wireMatchRowWheel(matchRow, container) {
  matchRow.addEventListener('wheel', ev => {
    if (!anyLibraryEnabled()) return;            // let event pass through when pantones hidden
    const i = idxOf(container);
    if (!Number.isInteger(i) || i < 0 || i >= S.colors.length) return;
    ev.preventDefault();
    ev.stopPropagation();
    const c = S.colors[i];
    // Holding Shift makes the OS deliver wheel scroll on the X axis, so deltaY
    // is 0 and the value lands in deltaX — read whichever axis carries it.
    const scroll = ev.deltaY || ev.deltaX;
    if (!scroll) return;

    // The wheel sets n — how many chips this swatch shows. Each colour then
    // derives its own cutoff from that count (see updateSwatchMatches).
    const visibleMax = Math.min(visibleMaxForRow(container), MAX_MATCHES);
    const floor = Math.min(MIN_VISIBLE_CHIPS, visibleMax);
    const cur = chipCountFor(c, visibleMax);
    const next = Math.max(floor, Math.min(visibleMax, cur + (scroll > 0 ? 1 : -1)));
    if (next === (c.matchCount ?? DEFAULT_MATCH_COUNT)) return;
    c.matchCount = next;
    // Persist as the user's last-used preference; do NOT snapshot — chip
    // count is intentionally excluded from undo history.
    savePreferredMatchCount(next);
    updateSwatchMatches(i);
  }, { passive: false });
}

function wireMatchRowClick(matchRow, container) {
  matchRow.addEventListener('click', ev => {
    if (ev.target.closest('.chip-gamut-warning')) return;

    if (ev.target.closest('.promoted-cell')) return;

    const cell = ev.target.closest('.match-cell');
    if (!cell) return;
    const i = idxOf(container);
    if (!Number.isInteger(i) || i < 0 || i >= S.colors.length) return;

    const name = cell.dataset.pantoneName;
    if (!name) return;
    const entry = findPantoneByName(name);
    if (!entry) return;

    // Clicking a match chip promotes it; clicking the already-promoted chip
    // again toggles it back off (in addition to the promoted cell's close box
    // and swatch-colour changes).
    if (pantoneSelections.get(i) === entry) pantoneSelections.delete(i);
    else pantoneSelections.set(i, entry);
    updateSwatchMatches(i);
    updateDots();
    flushPendingWheelSnapshot();
    recordSnapshot();
  });
}


// Library filter checkboxes

const libraryPanel = document.getElementById('library-panel');
const cutoffSlider = document.getElementById('cutoff-slider');
const cutoffValue  = document.getElementById('cutoff-value');
if (libraryPanel) {
  libraryPanel.querySelectorAll('input[type="checkbox"][data-library]').forEach(cb => {
    cb.addEventListener('change', () => {
      S.libraryFilters[cb.dataset.library] = cb.checked;
      syncLibraryCheckboxState();
      updateDots();
      updateMatchesVisibility();
      updateAllSwatchMatches();
    });
  });

  libraryPanel.querySelectorAll('input[type="checkbox"][data-option]').forEach(cb => {
    if (cb.dataset.option === 'sort') {
      cb.checked = !!S.sortChipsByHue;
      cb.addEventListener('change', () => {
        S.sortChipsByHue = cb.checked;
        updateAllSwatchMatches();
      });
    }
  });

  wireCutoffSlider();
  syncLibraryCheckboxState();
}

function wireCutoffSlider() {
  if (!cutoffSlider) return;
  cutoffSlider.min   = MIN_CHIP_CUTOFF;
  cutoffSlider.max   = MAX_CHIP_CUTOFF;
  cutoffSlider.step  = 0.005;
  cutoffSlider.value = S.chipCutoff;
  if (cutoffValue) cutoffValue.textContent = S.chipCutoff.toFixed(3);
  cutoffSlider.addEventListener('input', () => {
    const v = parseFloat(cutoffSlider.value);
    if (!Number.isFinite(v)) return;
    S.chipCutoff = v;                 // one global cutoff for every swatch
    saveChipCutoff(v);
    if (cutoffValue) cutoffValue.textContent = v.toFixed(3);
    updateAllSwatchMatches();
  });
}

function syncLibraryCheckboxState() {
  if (!libraryPanel) return;
  const baseOn = S.libraryFilters.base;
  libraryPanel.querySelectorAll('input[type="checkbox"][data-library]').forEach(cb => {
    if (cb.dataset.library === 'base') return;
    cb.disabled = !baseOn;
  });
  libraryPanel.querySelectorAll('input[type="checkbox"][data-option]').forEach(cb => {
    cb.disabled = !baseOn;
  });
  if (cutoffSlider) cutoffSlider.disabled = !baseOn;
}

function updateMatchesVisibility() {
  els.swatches.classList.toggle('show-matches', anyLibraryEnabled());
}



export {
  clearPromotedOnEdit, loadPantoneLibrary, updateSwatchMatches, updateDots,
  scheduleMatches, updateMatchesVisibility, syncLibraryCheckboxState,
  findPantoneByName, pantoneP3Css, buildMatchCells, matchRowObserver, libraryPanel,
};
