// The State console (the "State" section's text box): a live readout of every
// swatch, one line each, that can also be edited — but only into a state the
// picker itself could reach (user decision 2026-10-21). A line reads
//
//   #RRGGBB | wide color | library color name | C-M-Y-K [CB]
//
// The hex ALWAYS comes first (user rule 2026-11-22: never drop it). After it,
// only when the color needs one, the widest space it needs, as CSS you can
// paste into code: display-p3 R G B outside sRGB (the inside of color(); user
// decision 2026-11-22), or oklch(L C H) outside P3 (P3A mode only) — the same
// space and digits as the swatch's top label (lines always held "p3 R G B"
// before). The name shows only when a library color is promoted;
// CMYK only while CMYK is switched on, with "CB" when the swatch uses its
// promoted color's CMYK alternate (the BOOK checkbox). [!] after the name or
// the CMYK build marks a gamut flag. Fields are recognized by their form, so
// the order and separators are forgiving; a bare list of hex codes still works
// for pasting.
//
// Return applies the whole box (Shift+Return adds a line); Escape or clicking
// away goes back to the live readout. Each line is compared with its swatch, and
// only the fields you changed count as edits:
//   • hex — sets the color (any sRGB hex is on the wheel).
//   • wide color — display-p3 R G B or oklch(…) (also "p3 R G B",
//     color(display-p3 …) and "oklch L C H" without the parentheses). P3 values run
//     0–1; either must sit on the current wheel (sRGB mode shows only sRGB, P3
//     mode only P3, P3A mode only the panel's gamut). A changed wide color wins
//     over the hex, which is only its sRGB clamp.
//   Either one also removes the swatch's library match (and with it a CB
//   build), whatever the line's name says.
//   • name — promotes that color from a switched-on library: in place when it's
//     among the swatch's chips, otherwise moving the swatch to it (as dropping
//     a chip on a swatch does). Removing the name demotes.
//   • CMYK — never moves the color: it must be a build the swatch can show — in
//     gamut its one build, out of gamut a position of its slider (which this
//     sets) — or, with "CB", its promoted color's alternate.
// Changing a color clears what depended on the old one (its promotion and CMYK
// slider), as the picker does, unless the same line also sets them anew.
// Adding or removing lines adds or removes swatches (1–MAX_COLORS). If any line
// can't be reached, nothing is applied: the box keeps your text, selects the
// line, and the status line under the swatches says why.

import { MAX_COLORS } from './constants.js';
import { S, P, els, pantoneSelections } from './state.js';
import { srgbToOKHSL, p3ToOKHSL, oklchToOKHSL, computeP3AndSRGB, isSRGBMode, getGamutMode, convert, DisplayP3, sRGB } from './color.js';
import { swatchEl, setPalette, reindex, updateAddButton, exitMultiSelect, setActive } from './swatches.js';
import {
  isPromotionShown, updateDots, findEnabledEntryByName, isChipCandidate, entryColor, promotionsOnView,
} from './pantone.js';
import { cmyk, cmykSliderPositionFor, cmykReachableRange, setSwatchCMYKBias } from './cmyk.js';
import { flushPendingWheelSnapshot, recordSnapshot } from './history.js';

const stateField = document.querySelector('.hex-input');
const statusRegion = document.getElementById('status-region');

// ── Reading the state ────────────────────────────────────────────────

const cmykOnView = () => cmyk.active && cmyk.ready;

/** Swatch i's fields, as the console shows them. */
function fieldsOf(i) {
  const { hex, p3Str, oklchStr, outOfSRGB, outOfP3 } = computeP3AndSRGB(S.colors[i]);
  // After the hex, only when needed: the widest space the color needs (CSS-ready).
  const wide = outOfP3 ? `oklch(${oklchStr})` : outOfSRGB ? `display-p3 ${p3Str}` : null;
  const f = { hex, wide, p3: p3Str, oklch: oklchStr, name: null, entry: null, cmyk: null, cb: false };
  const p = pantoneSelections.get(i);
  if (p && isPromotionShown(p) && promotionsOnView()) { f.name = p.name; f.entry = p; }
  if (cmykOnView()) {
    const sw = swatchEl(i);
    f.cmyk = sw?.querySelector('.cmyk-v')?.textContent || null;
    f.cb = !!sw?.classList.contains('cmyk-lib-on');
    f.cmykOOG = !!sw?.classList.contains('out-of-cmyk');   // (a CB build is printable by definition)
  }
  return f;
}

// [!] carries the swatch's gamut flags into the console (user decisions
// 2026-10-21; plain ASCII, not ⚠) — the same states as its warning icons: after
// the name, the promoted library color is outside the current gamut; after the
// CMYK build, the color is outside the press's gamut. (The color itself needs
// none: its form says which gamut it's in.) Display only — the parser ignores it.
const WARN = '[!]';
const flag = on => (on ? ' ' + WARN : '');
const lineOf = f => [f.hex, f.wide, f.name && f.name + flag(f.entry.outOfGamut),
  f.cmyk && f.cmyk + (f.cb ? ' CB' : '') + flag(f.cmykOOG)].filter(Boolean).join(' | ');

/** Write the live state into the box — unless you're editing it. Cheap, and
 *  written only when the text changes, so it can run on every render. */
function syncStateField() {
  if (document.activeElement === stateField) return;
  const text = S.colors.map((_, i) => lineOf(fieldsOf(i))).join('\n');
  if (stateField.value !== text) { stateField.value = text; fitStateWidth(); }
}

// The box is at least MIN_WIDTH wide and grows to fit its longest line (the
// top UI frame grows with it) — never wrapping or scrolling sideways (user
// decision 2026-10-21). Measured from the text itself: shrink to the minimum,
// read the scroll width, widen to it.
const MIN_WIDTH = 380;
function fitStateWidth() {
  const panel = stateField.parentElement;
  panel.style.width = `${MIN_WIDTH}px`;
  const border = stateField.offsetWidth - stateField.clientWidth;   // (no scrollbar at this point)
  const need = Math.ceil(stateField.scrollWidth + border);
  if (need > MIN_WIDTH) panel.style.width = `${need}px`;
}

// Also follow changes that don't go through a full render (the CMYK slider, the
// BOOK checkbox, libraries switched on or off): any readout change in the
// swatches schedules a sync for the next frame.
let syncQueued = false;
new MutationObserver(() => {
  if (syncQueued) return;
  syncQueued = true;
  requestAnimationFrame(() => { syncQueued = false; syncStateField(); });
}).observe(els.swatches, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class'] });

// ── Parsing ──────────────────────────────────────────────────────────

const HEX6 = /^#?([0-9a-f]{6})$/i, HEX3 = /^#([0-9a-f]{3})$/i;
const P3 = /^(?:p3\s+|display-p3\s+|color\(\s*display-p3\s+)(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+)\s*\)?$/i;
const OKLCH = /^oklch\(?\s*(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+)(?:deg)?\s*\)?$/i;
// The gamut flag, stripped before parsing: [!] (also ⚠, its first form).
const WARN_MARK = /\s*(?:\[!\]|\u26A0\uFE0F?)/g;
const CMYK = /^(\d{1,3})\s*-\s*(\d{1,3})\s*-\s*(\d{1,3})\s*-\s*(\d{1,3})(\s+CB)?$/i;

const hexOf = seg => {
  let m = seg.match(HEX6);
  if (m) return '#' + m[1].toUpperCase();
  m = seg.match(HEX3);
  return m ? '#' + [...m[1]].map(c => c + c).join('').toUpperCase() : null;
};

/** The box's text as one entry per swatch. A line with no "|" that holds only
 *  hex codes (a pasted list) counts as one swatch per code. */
function linesOf(text) {
  const out = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (!line.includes('|')) {
      const tokens = line.split(/[\s,;]+/).filter(Boolean);
      if (tokens.length > 1 && tokens.every(hexOf)) { out.push(...tokens); continue; }
    }
    out.push(line);
  }
  return out;
}

function parseLine(line) {
  const f = { hex: null, p3: null, oklch: null, name: null, cmyk: null, cb: false };
  const oneWide = () => (f.p3 || f.oklch ? { error: 'it has two wide colors (display-p3 or oklch)' } : null);
  for (const raw of line.split('|')) {
    const seg = raw.replace(WARN_MARK, '').trim();
    if (!seg) continue;
    let m;
    const hex = hexOf(seg);
    if (hex) {
      if (f.hex) return { error: 'it has two hex codes' };
      f.hex = hex;
    } else if ((m = seg.match(P3))) {
      if (oneWide()) return oneWide();
      f.p3 = [m[1], m[2], m[3]].map(Number);
      if (f.p3.some(v => !Number.isFinite(v))) return { error: `“${seg}” isn't a P3 color` };
    } else if ((m = seg.match(OKLCH))) {
      if (oneWide()) return oneWide();
      f.oklch = [m[1], m[2], m[3]].map(Number);
      if (f.oklch.some(v => !Number.isFinite(v))) return { error: `“${seg}” isn't an OKLCH color` };
    } else if ((m = seg.match(CMYK))) {
      if (f.cmyk) return { error: 'it has two CMYK builds' };
      f.cmyk = `${+m[1]}-${+m[2]}-${+m[3]}-${+m[4]}`;
      f.cb = !!m[5];
    } else {
      if (f.name) return { error: `it has two names (“${f.name}”, “${seg}”)` };
      f.name = seg;
    }
  }
  return f;
}

const sameP3 = (a, b) => b && a.every((v, k) => Math.abs(v - Number(b.split(' ')[k])) < 0.0005);
const sameOKLCH = (a, b) => b && a.every((v, k) => Math.abs(v - Number(b.split(' ')[k])) < (k === 2 ? 0.05 : 0.0005));
const WHEEL_NAMES = { srgb: 'sRGB', p3: 'P3', p3a: 'P3A' };
const sameName = (a, b) => b != null && a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase();
const cbLabel = e => e.cbCMYK.map(v => Math.round(v)).join('-');

// ── Validating ───────────────────────────────────────────────────────

/** What swatch i would become from `f`, or { error }. `cur` is the swatch's
 *  current fields (null for a new swatch). */
function planLine(i, f, cur) {
  // Color.
  let color = cur ? S.colors[i] : null, colorChanged = false;
  if (f.oklch && !(cur && sameOKLCH(f.oklch, cur.oklch))) {
    const [L, C, H] = f.oklch;
    if (L < 0 || L > 1 || C < 0) return { error: 'OKLCH lightness runs from 0 to 1, and chroma from 0 up' };
    color = oklchToOKHSL(L, C, H);
    // On the wheel (a hair of slack for the readout's own rounding).
    if (color.s > 1.002) return { error: `that color is outside the ${WHEEL_NAMES[getGamutMode()]} wheel` };
    color.s = Math.min(1, color.s);
    colorChanged = true;
  } else if (f.p3 && !(cur && sameP3(f.p3, cur.p3))) {
    if (f.p3.some(v => v < 0 || v > 1)) return { error: 'P3 values run from 0 to 1' };
    // (Tested on the values themselves: in sRGB mode the swatch readouts already
    // report every color limited to sRGB.)
    if (isSRGBMode() && convert(f.p3, DisplayP3, sRGB, [0, 0, 0]).some(v => v < -1e-4 || v > 1 + 1e-4)) {
      return { error: 'that P3 color is outside sRGB, and sRGB mode shows only sRGB colors' };
    }
    color = p3ToOKHSL(...f.p3);
    colorChanged = true;
  } else if (f.hex && !(cur && f.hex === cur.hex)) {
    const n = parseInt(f.hex.slice(1), 16);
    color = srgbToOKHSL(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
    colorChanged = true;
  }

  // Promotion. Editing an existing swatch's hex or p3 removes its library
  // match, whatever the name field says (user decision 2026-10-21). Otherwise
  // an unchanged name keeps its promotion and a new name promotes — on a new
  // swatch too, after its hex or p3 places it.
  const colorEdited = colorChanged && !!cur;
  let entry = null;
  if (f.name && !colorEdited) {
    if (cur && cur.entry && sameName(f.name, cur.name)) {
      entry = cur.entry;
    } else {
      entry = findEnabledEntryByName(f.name);
      if (!entry) {
        return { error: promotionsOnView()
          ? `“${f.name}” isn't a color in a switched-on library`
          : 'library colors can be promoted only while Libraries is switched on' };
      }
      if (!color || !isChipCandidate(i, color, entry)) { color = entryColor(entry); colorChanged = true; }
    }
  }
  if (!color) return { error: 'a new swatch needs a color (hex, display-p3 or oklch) or a library color name' };
  // A promotion that isn't on view (its library switched off, or Libraries
  // switched off) isn't in the text: keep it while the color stays put.
  const hidden = cur && !cur.entry ? pantoneSelections.get(i) : null;
  if (!f.name && hidden && !colorChanged) entry = hidden;

  // CMYK. A field you didn't touch keeps the slider (or, if the color changed,
  // resets it, as the picker does); an edited one must be reachable.
  let bias = 'keep', bridge = 'keep';
  const cmykEdited = f.cmyk && !(cur && f.cmyk === cur.cmyk && f.cb === cur.cb);
  if (f.cmyk && !cmykOnView()) return { error: 'CMYK can be set only while CMYK is switched on' };
  if (cmykEdited) {
    if (f.cb) {
      if (!entry || !entry.cbCMYK) return { error: 'CB needs a promoted library color with a CMYK alternate' };
      if (cbLabel(entry) !== f.cmyk) return { error: `its library alternate is ${cbLabel(entry)} CB` };
      bias = 0; bridge = true;
    } else {
      const k = cmykSliderPositionFor(color, f.cmyk);
      if (k < 0) {
        const r = cmykReachableRange(color);
        return { error: r && r.adjustOff
          ? `${f.cmyk} isn't reachable — adjustments are off, so this color's build is ${r.from}`
          : r && r.oog
          ? `${f.cmyk} isn't reachable — its CMYK slider runs from ${r.from} to ${r.to}`
          : `${f.cmyk} isn't reachable — this color's build is ${r ? r.from : 'unknown'}` };
      }
      bias = k; bridge = false;
    }
  } else if (!f.cmyk && cmykOnView() && cur && cur.cmyk) {
    bias = 0; bridge = false;   // the field was removed: back to the default build
  }
  if (colorChanged && bias === 'keep') { bias = 0; bridge = false; }
  if (bridge === 'keep' && cur && cur.cb && entry !== cur.entry) bridge = false;   // its promotion changed
  if (bridge === true && !(entry && entry.cbCMYK)) bridge = false;
  return { color, colorChanged, entry, bias, bridge };
}

// ── Applying ─────────────────────────────────────────────────────────

function showError(lineIndex, lines, msg) {
  stateField.classList.add('invalid');
  if (statusRegion) statusRegion.textContent = `Line ${lineIndex + 1}: ${msg}.`;
  // Select the offending line so it can be fixed in place.
  const text = stateField.value;
  let pos = 0, seen = -1;
  for (const raw of text.split('\n')) {
    if (raw.trim()) seen++;
    if (seen === lineIndex) { stateField.setSelectionRange(pos, pos + raw.length); break; }
    pos += raw.length + 1;
  }
}

function clearError() {
  if (!stateField.classList.contains('invalid')) return;
  stateField.classList.remove('invalid');
  if (statusRegion) statusRegion.textContent = '';
}

/** Validate every line, then apply them all — or none. Returns success. */
function commit() {
  const lines = linesOf(stateField.value);
  if (!lines.length) { showError(0, lines, 'the palette needs at least one swatch'); return false; }
  if (lines.length > MAX_COLORS) { showError(MAX_COLORS, lines, `the palette holds at most ${MAX_COLORS} swatches`); return false; }

  const plans = [];
  for (let i = 0; i < lines.length; i++) {
    const f = parseLine(lines[i]);
    if (f.error) { showError(i, lines, f.error); return false; }
    const plan = planLine(i, f, i < S.colors.length ? fieldsOf(i) : null);
    if (plan.error) { showError(i, lines, plan.error); return false; }
    plans.push(plan);
  }

  clearError();
  const countChanged = plans.length !== S.colors.length;
  const priorActive = S.activeIndex;
  exitMultiSelect();
  setPalette(plans.map(p => p.color));
  plans.forEach((p, i) => {
    if (p.entry) pantoneSelections.set(i, p.entry); else pantoneSelections.delete(i);
    const sw = swatchEl(i);
    if (p.bias !== 'keep') setSwatchCMYKBias(sw, p.color, p.bias);
    if (sw && p.bridge !== 'keep') { if (p.bridge) sw.dataset.cmykLibKey = p.entry.key; else delete sw.dataset.cmykLibKey; }
  });
  if (countChanged) {
    S.activeIndex = -1;
    reindex();
    setActive(Math.min(Math.max(priorActive, 0), plans.length - 1), { silent: true });
  }
  updateAddButton();
  updateDots();
  P.render();
  flushPendingWheelSnapshot();
  recordSnapshot();
  return true;
}

// ── Wiring ───────────────────────────────────────────────────────────

stateField.setAttribute('wrap', 'off');   // one swatch per line, never wrapped

// Leave the box and show the live readout again. Done directly, not only from
// the blur event, which doesn't always fire (e.g. while the window is in the
// background) — a stale box would keep showing the typed text.
function leave() {
  stateField.blur();
  clearError();
  syncStateField();
}

stateField.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (commit()) leave();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    leave();
  }
});

// A pasted state (or hex list) applies at once, like Return.
stateField.addEventListener('paste', () => setTimeout(() => { if (commit()) leave(); }, 0));

stateField.addEventListener('input', () => { clearError(); fitStateWidth(); });

// Clicking away returns it to the live readout.
stateField.addEventListener('blur', () => { clearError(); syncStateField(); });

export { stateField, syncStateField };
