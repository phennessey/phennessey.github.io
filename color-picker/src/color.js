// ══════════════════════════════════════════════════════════════════════
// Color science
// ══════════════════════════════════════════════════════════════════════
// Pure colour-space conversions and gamut helpers, independent of the DOM
// and the picker widget. New colour work (CMYK, Pantone colour bridge,
// export) belongs here.

import {
  convert,
  OKHSLToOKLab,
  OKLabToOKHSL,
  OKLab,
  OKLCH,
  XYZ,
  DisplayP3,
  sRGB,
  DisplayP3Gamut,
  sRGBGamut,
  gamutMapOKLCH,
  findCuspOKLCH,
  MapToL,
} from "https://esm.sh/@texel/color@1.1.11?bundle";

// Single home for the vendored @texel/color dependency: every other module
// imports these through color.js, so the pinned version above is the only
// place the URL lives.
export { convert, OKHSLToOKLab, OKLabToOKHSL, OKLab, XYZ, DisplayP3, sRGB, DisplayP3Gamut };

// ── Numeric helpers ──────────────────────────────────────────────────

export const clamp01 = v => Math.max(0, Math.min(1, v));
export const to255   = v => Math.round(clamp01(v) * 255);

// Perceptual lightness toe
const k1 = 0.206, k2 = 0.03, k3 = (1 + k1) / (1 + k2);
export function toe(L)    { return 0.5 * (k3*L - k1 + Math.sqrt((k3*L - k1)**2 + 4*k2*k3*L)); }
export function toeInv(r) { return r * (r + k1) / (k3 * (r + k2)); }

// Logit / sigmoid for lightbar compression
export function lToRaw(toeL) {
  const p = Math.min(Math.max(toeL, 1e-6), 1 - 1e-6);
  return Math.log(p / (1 - p));
}
export function rawToL(raw) { return 1 / (1 + Math.exp(-raw)); }

// Hue difference in [-0.5, 0.5] range.
export function hueDiff(a, b) { return ((a - b + 1.5) % 1) - 0.5; }

// ── Scratch arrays (module-private, reused across calls) ─────────────

const _lab = [0, 0, 0];
const _lch = [0, 0, 0];
const _p3  = [0, 0, 0];
const _rgb = [0, 0, 0];
const _hsl = [0, 0, 0];

// ── Core color conversions ───────────────────────────────────────────

/** OKHSL → OKLab using the Display P3 gamut reference. */
export function toOKLab(h, s, lr, out = _lab) {
  OKHSLToOKLab([h * 360, s, lr], DisplayP3Gamut, out);
  return out;
}

/** sRGB [0–1] → picker's {h, s, L} descriptor. */
export function srgbToOKHSL(r, g, b) {
  convert([r, g, b], sRGB, OKLab, _lab);
  OKLabToOKHSL(_lab, DisplayP3Gamut, _hsl);
  return { h: _hsl[0] / 360, s: _hsl[1], L: toeInv(_hsl[2]) };
}

/** Binary-search for the OKHSL saturation that yields a given OKLCH chroma. */
export function sForChroma(h, targetC, lr) {
  convert(toOKLab(h, 1, lr), OKLab, OKLCH, _lch);
  if (_lch[1] <= targetC) return 1;
  let lo = 0, hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) * 0.5;
    convert(toOKLab(h, mid, lr), OKLab, OKLCH, _lch);
    if (_lch[1] < targetC) lo = mid; else hi = mid;
  }
  return (lo + hi) * 0.5;
}

/** Return the OKLCH chroma of a color descriptor {h, s, L}. */
export function chromaOf(col) {
  convert(toOKLab(col.h, col.s, toe(col.L)), OKLab, OKLCH, _lch);
  return _lch[1];
}

/** Lightness (col.L space) of the Display-P3 chroma cusp for a hue — the
 *  lightness at which this hue can reach its maximum chroma. findCuspOKLCH
 *  returns OKLab L, which equals col.L (toeInv of the OKHSL lightness), so it
 *  can be assigned to col.L directly. Depends on hue only, not saturation. */
export function cuspL(h) {
  const H = h * Math.PI * 2;
  return findCuspOKLCH(Math.cos(H), Math.sin(H), DisplayP3Gamut)[0];
}

/** Test whether an (h, s, lr) triple falls within the sRGB gamut. */
export function inSRGB(h, s, lr) {
  convert(toOKLab(h, s, lr), OKLab, sRGB, _rgb);
  return _rgb.every(v => v >= -1e-5 && v <= 1 + 1e-5);
}

// ── Gamut-mapped output computation ──────────────────────────────────

export function computeP3AndSRGB(color) {
  toOKLab(color.h, color.s, toe(color.L));
  convert(_lab, OKLab, DisplayP3, _p3);
  _p3[0] = Math.max(0, _p3[0]);
  _p3[1] = Math.max(0, _p3[1]);
  _p3[2] = Math.max(0, _p3[2]);
  // 3 decimals is finer than even a 10-bit P3 panel can resolve (step ≈ 0.001),
  // so the readout and the fill share one rounded string — they can't drift.
  const p3Str = `${_p3[0].toFixed(3)} ${_p3[1].toFixed(3)} ${_p3[2].toFixed(3)}`;
  const p3Css = `color(display-p3 ${p3Str})`;
  convert(_lab, OKLab, sRGB, _rgb);
  const outOfSRGB = _rgb.some(v => v < -1e-4 || v > 1 + 1e-4);
  convert(_lab, OKLab, OKLCH, _lch);
  gamutMapOKLCH(_lch, sRGBGamut, sRGB, _rgb, MapToL);
  const hex = '#' + _rgb.map(v => to255(v).toString(16).padStart(2, '0').toUpperCase()).join('');
  // The sRGB swatch fill must agree with the hex readout exactly, so paint it
  // with the same 8-bit value rather than a higher-precision color(srgb …) that
  // could drift from the displayed hex (a 1px lightness nudge can change the
  // true colour by less than one 8-bit step — same hex, different fill). The
  // only finer / wider-than-sRGB fill is the P3 swatch (p3Css), shown solely
  // when the colour falls outside sRGB.
  const srgbCss = hex;
  return { p3Str, p3Css, srgbCss, hex, outOfSRGB };
}

// ── Background lightness → P3 CSS ────────────────────────────────────

export function neutralP3(L) {
  _lab[0] = L; _lab[1] = 0; _lab[2] = 0;
  convert(_lab, OKLab, DisplayP3, _p3);
  return `color(display-p3 ${_p3[0].toFixed(3)} ${_p3[1].toFixed(3)} ${_p3[2].toFixed(3)})`;
}
