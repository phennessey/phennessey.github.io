// ══════════════════════════════════════════════════════════════════════
// CMYK via ICC profile
// ══════════════════════════════════════════════════════════════════════
// Converts the picker's true (P3-gamut) OKLab colour to CMYK through a real
// ICC output profile, and renders the resulting build back to a Display-P3
// swatch as a soft proof. CMYK "mode" is active while the CMYK tool section
// is open (see main.js).
//
// SOFT-PROOF APPEARANCE: the swatch fill reverses the final CMYK build through
// the engine's own native '*sRGB' profile (CMYK → '*sRGB'), the symmetric inverse
// of the forward '*sRGB' path, then expresses that sRGB in the P3 swatch container.
// This is the validated reference (cmyk-test/ spike) and matches Adobe's on-screen
// proof exactly. Do NOT hand-roll CMYK → '*LabD65' → XYZ → Display-P3: that path
// drifts badly (#4D7AAF proofs ~19/255 too little red) because our D65 Lab→XYZ
// interpretation isn't interchangeable with the engine's PCS-Lab adaptation — the
// same lesson as the forward '*sRGB' gotcha below. (As a soft proof on an sRGB-or-
// wider display this also clips CMYK colours that exceed sRGB to the display gamut,
// exactly as Adobe does; gamut membership is flagged separately by the LUT.)
//
// Pipeline — two paths, chosen by whether the colour is inside sRGB:
//
//   in-sRGB:  quantised 8-bit hex → jsColorEngine '*sRGB'
//                → ICC CMYK profile (BToA, relative colorimetric + BPC) → C M Y K
//   out-of-sRGB: OKLab → XYZ(D65) [@texel/color] → CIELAB(D65) → '*LabD65'
//                → ICC CMYK profile (BToA, relative colorimetric + BPC) → C M Y K
//
// CRITICAL: in-sRGB colours MUST go through the engine's native '*sRGB' profile,
// not the hand-rolled CIELAB(D65) → '*LabD65' path. The '*sRGB' profile reproduces
// Adobe's exact sRGB→CMYK readout (Photoshop/InDesign, relative-colorimetric + BPC
// — e.g. #9628ff → 70-85-0-0 in GRACoL2006); the '*LabD65' path drifts a few points
// (→ 65-88-0-0) because feeding "D65 Lab → D50 PCS" adapts differently than the sRGB
// profile's own primaries/adaptation. The '*sRGB' path is the validated reference
// (see cmyk-test/ spike). '*LabD65' is only a fallback for colours OUTSIDE sRGB,
// which the engine has no RGB device profile for (no '*P3').
//
// jsColorEngine owns the D65→D50 PCS adaptation internally, so we never do a
// Bradford step by hand (the classic double-adapt bug). The D65 white used for
// our CIELAB is anchored to @texel/color's own OKLab-white so there is zero
// scaling drift between the two libraries.
//
// Gamut membership (the out-of-gamut flag + the boundary ring) is a SEPARATE
// concern from the soft-proof appearance above: it's decided against the
// profile's true reproducible colour solid via a precomputed device-cube LUT
// (see "True gamut membership" below), not the soft-proof round-trip.

import {
  convert, OKLab, XYZ, DisplayP3, sRGB, OKLabToOKHSL, DisplayP3Gamut,
} from "https://esm.sh/@texel/color@1.1.11?bundle";
import { toOKLab, toe, computeP3AndSRGB } from "./color.js";
import { els, P, pantoneSelections } from "./state.js";
import { requestRender } from "./util.js";

const CE = window.jsColorEngine;
const engineOK = !!(CE && CE.Transform && CE.Profile && CE.color);
if (!engineOK) console.error("jsColorEngine not loaded — CMYK feature disabled.");

const PROFILE_URLS = {
  gracol:  "lib/profiles/GRACoL2006_Coated1v2.icc",
  swop:    "lib/profiles/SWOP2006_Coated3v2.icc",
  fogra39: "lib/profiles/Coated_Fogra39L_VIGC_300.icc",
};

// ── True gamut membership via a precomputed LUT ──────────────────────
//
// Gamut membership is decided against the profile's ACTUAL reproducible colour
// solid, not a soft-proof round-trip. We sample the CMYK device cube through the
// profile's device→Lab table (relative, NO black-point compensation — BPC is a
// conversion-time remap, not part of the gamut), project each point into the
// wheel's own OKHSL space, and keep the max saturation per (hue, lightness) cell.
// A colour is out of gamut iff its OKHSL s exceeds that cell's max — i.e. "no
// CMYK ink combination reaches this chroma here." The boundary ring reads the
// same table, so flag and ring are consistent by construction.
//
// Why not the round-trip: rel-colorimetric + BPC applied on both legs cancels,
// so dark out-of-gamut colours falsely round-trip clean, inflating the shadows
// (worst for shallow-black profiles). The device-cube LUT matches the published
// gamut comparisons (GRACoL ≈ FOGRA39, SWOP smaller); the round-trip did not.
const LUT_H = 72;         // hue cells (5°) — coarse enough that every cell is well
const LUT_L = 40;         // OKHSL-lightness cells   sampled; bilinear lookup + the
                          // picker's 3-tap smooth recover a clean ring.
const DEV_FACE = 28;      // Chebyshev samples per face axis (accuracy is grid-
                          // limited beyond this; keeps the one-time build ~1s)
const GAMUT_EPS = 0.012;  // s tolerance: covers the LUT's slight (~0.01) under-
                          // estimate so reproducible colours aren't false-flagged,
                          // and keeps flag and drawn ring consistent at the edge.

// Public mode state. `active` mirrors the CMYK section open/closed; `ready` is
// true once a profile is parsed and its transforms are built. `bias` is the
// out-of-gamut clipping preference in [0, 1]: 0 = standard relative-colorimetric
// clip, increasing toward 1 locks the printed hue to the target's and raises
// lightness toward it (sacrificing chroma, never hue).
export const cmyk = { active: false, profileKey: "gracol", ready: false, bias: 0, showBoundary: false, useColorBridge: false };

let fwd = null;  // CIELAB(D65) → CMYK  (out-of-sRGB colours only)
let fwdSRGB = null;  // native *sRGB → CMYK (in-sRGB colours; matches Adobe exactly)
let rev = null;  // CMYK → CIELAB(D65)  (bias math only — see updateSwatchCMYK)
let revSRGB = null;  // native CMYK → *sRGB (soft-proof appearance; Adobe-exact)
let gamutLUT = null;          // Float32Array[LUT_L*LUT_H] of max OKHSL s, active profile
const profileCache = {};
const lutCache = {};          // gamut LUT per profile key (built once)

// ── CIELAB(D65) anchored to @texel/color's own white ─────────────────
const _w = [0, 0, 0];
if (engineOK) convert([1, 0, 0], OKLab, XYZ, _w);
const Xn = _w[0] || 0.9504559, Yn = _w[1] || 1, Zn = _w[2] || 1.0890578;
const EPS = 216 / 24389, KAP = 24389 / 27;
const fLab    = t => (t > EPS ? Math.cbrt(t) : (KAP * t + 16) / 116);
const fLabInv = f => { const f3 = f * f * f; return f3 > EPS ? f3 : (116 * f - 16) / KAP; };

const _xyz   = [0, 0, 0];
const _p3    = [0, 0, 0];

// sRGB gamma → linear (IEC 61966-2-1)
const linearize = v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;

/**
 * Picker colour {h,s,L} → CIELAB(D65) {L,a,b}.
 *
 * When the colour is within sRGB, derive XYZ from the quantised 8-bit hex so
 * the CMYK values match Photoshop's readout for the same hex code exactly.
 * Only fall back to the continuous P3 path for colours outside sRGB.
 */
function colorToLabD65(color, info) {
  const { hex, outOfSRGB } = info || computeP3AndSRGB(color);
  if (!outOfSRGB) {
    const n = parseInt(hex.slice(1), 16);
    const r = linearize(((n >> 16) & 0xFF) / 255);
    const g = linearize(((n >>  8) & 0xFF) / 255);
    const b = linearize((n & 0xFF) / 255);
    // Linear sRGB → XYZ D65 (IEC 61966-2-1 primaries)
    _xyz[0] = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
    _xyz[1] = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b;
    _xyz[2] = 0.0193339 * r + 0.1191920 * g + 0.9503041 * b;
  } else {
    const lab = toOKLab(color.h, color.s, toe(color.L));
    convert(lab, OKLab, XYZ, _xyz);
  }
  const fx = fLab(_xyz[0] / Xn), fy = fLab(_xyz[1] / Yn), fz = fLab(_xyz[2] / Zn);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** CIELAB(D65) {L,a,b} → XYZ (D65) array. */
function labD65ToXYZ(lab) {
  const fy = (lab.L + 16) / 116, fx = fy + lab.a / 500, fz = fy - lab.b / 200;
  return [fLabInv(fx) * Xn, fLabInv(fy) * Yn, fLabInv(fz) * Zn];
}

/** Forward + reverse from a CIELAB(D65) input: the CMYK build and its printable
 *  Lab (the soft-proof appearance). Gamut membership is decided separately by the
 *  LUT, so no round-trip ΔE is needed here. */
function convertFromLab(lab) {
  const c    = fwd.transform(CE.color.Lab(lab.L, lab.a, lab.b));   // {C,M,Y,K} 0–100
  const back = rev.transform(CE.color.CMYK(c.C, c.M, c.Y, c.K));   // printable {L,a,b}
  return { lab, c, back };
}

/** Forward + reverse for a picker colour (the raw, unbiased conversion).
 *  In-sRGB colours convert through the engine's native '*sRGB' profile (Adobe-exact);
 *  only colours outside sRGB fall back to the CIELAB(D65) → '*LabD65' path. */
function convertColor(color) {
  const info = computeP3AndSRGB(color);
  const lab = colorToLabD65(color, info);
  let c;
  if (!info.outOfSRGB && fwdSRGB) {
    const n = parseInt(info.hex.slice(1), 16);
    c = fwdSRGB.transform(CE.color.RGB((n >> 16) & 0xFF, (n >> 8) & 0xFF, n & 0xFF));
  } else {
    c = fwd.transform(CE.color.Lab(lab.L, lab.a, lab.b));
  }
  const back = rev.transform(CE.color.CMYK(c.C, c.M, c.Y, c.K));
  return { lab, c, back };
}

// ── Out-of-gamut bias: hue-locked, brightness toward target ──────────
//
// The slider (0 = standard … 1) keeps the colour's HUE locked to the target's and
// raises its lightness toward the target's, sacrificing chroma — never hue. Where
// the gamut runs out (e.g. a deep blue at higher lightness) the build desaturates
// toward grey rather than bending hue, so the gamut's limits stay visible.
//
// Everything is solved in OKLab (the picker's own space), NOT CIELAB: the two
// disagree most on blue hue, so locking CIELAB hue would swing blue toward purple.
//
// The endpoint = (target hue, target lightness, max in-gamut chroma there), read
// from the gamut LUT and held a hair inside the ring. bias 0 reproduces the exact
// standard build; from there the input lerps (in OKLab) toward that endpoint.
// In-gamut colours have nothing to trade → no-op.

// CIELAB(D65) ↔ OKLab(D65) through the shared XYZ anchor.
function labD65ToOk(lab, out = [0, 0, 0]) {
  convert(labD65ToXYZ(lab), XYZ, OKLab, out);
  return out;
}
const _okxyz = [0, 0, 0];
function okToLabD65(ok) {
  convert(ok, OKLab, XYZ, _okxyz);
  const fx = fLab(_okxyz[0] / Xn), fy = fLab(_okxyz[1] / Yn), fz = fLab(_okxyz[2] / Zn);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/**
 * The CIELAB(D65) input to feed the forward transform after applying the bias.
 * 0 = standard relative-colorimetric clip (raw.back). Toward 1, lerp (in OKLab)
 * to an in-gamut endpoint at the TARGET hue + lightness carrying the max chroma
 * the gamut allows there (from the LUT, held a hair inside the ring) — so hue
 * stays locked and lightness is raised toward the target, sacrificing only
 * chroma. Unchanged at bias 0 or for in-gamut colours.
 */
function biasedLab(raw, color, oog) {
  if (cmyk.bias === 0 || !oog) return raw.lab;
  const Lh = toe(color.L);
  const maxS = Math.max(0, lutLookup(color.h, Lh) - GAMUT_EPS);  // just inside the ring
  const e = toOKLab(color.h, maxS, Lh);
  const endp = [e[0], e[1], e[2]];          // copy: toOKLab returns a shared scratch
  const std = labD65ToOk(raw.back);
  const t = cmyk.bias;
  return okToLabD65([
    std[0] + (endp[0] - std[0]) * t,
    std[1] + (endp[1] - std[1]) * t,
    std[2] + (endp[2] - std[2]) * t,
  ]);
}

const cl3 = v => Math.max(0, Math.min(1, v)).toFixed(3);

/** Whether a picker colour falls outside the active CMYK profile's true gamut:
 *  its OKHSL saturation exceeds the max any CMYK ink combination reaches at this
 *  hue + lightness — i.e. "cannot be reproduced with CMYK ink." */
export function isOutOfCMYK(color) {
  if (!engineOK || !cmyk.ready || !gamutLUT) return false;
  return color.s > lutLookup(color.h, toe(color.L)) + GAMUT_EPS;
}

/**
 * Gamut predicate in the wheel's (hue, saturation, OKHSL-lightness) space — the
 * CMYK analogue of inSRGB, used by the picker to trace the boundary ring. `lr` is
 * the OKHSL (toe'd) reference lightness, exactly the LUT's lightness coordinate.
 */
export function inCMYKGamut(h, s, lr) {
  if (!engineOK || !cmyk.ready || !gamutLUT) return true;
  return s <= lutLookup(h, lr) + GAMUT_EPS;
}

/** Push current boundary visibility (mode + checkbox + profile-ready) to the
 *  picker and request a repaint. Centralised so every trigger stays in sync. */
function syncBoundary() {
  P.setCMYKBoundaryVisible(cmyk.active && cmyk.ready && cmyk.showBoundary);
  if (cmyk.active) requestRender();
}

/**
 * Paint a swatch's CMYK region: the proof fill (CMYK→display-P3), the
 * "C-M-Y-K" label, and the out-of-gamut flag. No-op unless CMYK mode is active
 * and a profile is ready. `index` is the swatch index, used to look up a
 * promoted Pantone for the Color Bridge substitution below.
 *
 * Color Bridge: when "Use Pantone Color Bridge values" is on and this swatch's
 * promoted Pantone carries a Color Bridge build, the ICC conversion is bypassed
 * — the label shows Pantone's own CMYK and the fill is painted from Pantone's
 * published soft-proof hex. Such swatches get the .cmyk-bridge class (→ "CB" badge).
 *
 * The CMYK swatch always lives inside .color-row; the side/bottom split is pure
 * CSS, keyed off `.show-matches` and a .swatches-level (not per-swatch)
 * `:has(.match-cells.has-promotion)`, so every swatch shares one layout:
 *   • matches visible, or any promotion anywhere → side mode: .color-row is a
 *                                    row, CMYK the right half.
 *   • neither                                    → bottom mode: .color-row is a
 *                                    column, CMYK the bottom half (chip space).
 */
export function updateSwatchCMYK(container, color, index) {
  if (!engineOK || !cmyk.active) return;
  const cmykEl = container.querySelector(".color-swatch.cmyk");
  if (!cmykEl) return;

  if (!cmyk.ready) return;   // transforms still loading; leave placeholder

  // Color Bridge substitution: option on + this swatch has a promoted Pantone
  // that ships its own Color Bridge build → bypass the ICC pathway entirely.
  const promoted = index != null ? pantoneSelections.get(index) : null;
  const bridge = cmyk.useColorBridge && promoted && promoted.cbCMYK && promoted.cbHex
    ? promoted : null;

  let label, cmykBg, oog;
  if (bridge) {
    const [C, M, Y, K] = bridge.cbCMYK;
    label = `${C}-${M}-${Y}-${K}`;          // Pantone's own recipe, verbatim
    cmykBg = bridge.cbHex;                   // Pantone's published soft-proof (sRGB hex)
    oog = false;                             // a real Pantone build is in-gamut by definition
  } else {
    // Flag from true gamut membership (the LUT). The CMYK build comes from the
    // biased conversion when the slider is engaged on an out-of-gamut colour.
    oog = isOutOfCMYK(color);
    const raw = convertColor(color);
    const c = (cmyk.bias !== 0 && oog)
      ? convertFromLab(biasedLab(raw, color, oog)).c : raw.c;
    // Soft-proof appearance: reverse the FINAL CMYK build through the engine's own
    // native '*sRGB' profile — the symmetric inverse of the forward '*sRGB' path,
    // so the proof is Adobe-exact (and matches the sRGB swatch for in-gamut colours)
    // — then express it in the P3 swatch container. We do NOT hand-roll
    // CMYK→*LabD65→XYZ→P3: that drifts badly (e.g. #4D7AAF proofs ~19/255 too little
    // red). The engine reconciles its own PCS Lab back to RGB correctly; our D65
    // Lab→XYZ interpretation does not — the same lesson as the forward gotcha above.
    const proof = revSRGB.transform(CE.color.CMYK(c.C, c.M, c.Y, c.K));
    convert([proof.R / 255, proof.G / 255, proof.B / 255], sRGB, DisplayP3, _p3);
    cmykBg = `color(display-p3 ${cl3(_p3[0])} ${cl3(_p3[1])} ${cl3(_p3[2])})`;
    label = `${Math.round(c.C)}-${Math.round(c.M)}-${Math.round(c.Y)}-${Math.round(c.K)}`;
  }

  cmykEl.style.background = cmykBg;
  cmykEl.style.setProperty('--region-bg', cmykBg);

  const v = cmykEl.querySelector(".cmyk-v");
  if (v && v.textContent !== label) v.textContent = label;

  container.classList.toggle("out-of-cmyk", oog);
  container.classList.toggle("cmyk-bridge", !!bridge);   // shows the "CB" badge
}

// ── Gamut LUT: max OKHSL saturation per (hue, lightness) cell ─────────

/** Bilinear lookup into the active gamut LUT. Hue wraps; lightness clamps.
 *  Returns the max reproducible OKHSL s at (hue 0–1, OKHSL-lightness 0–1). */
function lutLookup(hue, Lh) {
  if (!gamutLUT) return 1;
  const hf = (((hue % 1) + 1) % 1) * LUT_H;
  const lf = Math.max(0, Math.min(1, Lh)) * (LUT_L - 1);
  const h0 = Math.floor(hf) % LUT_H, h1 = (h0 + 1) % LUT_H, ht = hf - Math.floor(hf);
  const l0 = Math.floor(lf), l1 = Math.min(LUT_L - 1, l0 + 1), lt = lf - l0;
  const g = (hb, lb) => gamutLUT[lb * LUT_H + hb];
  const a = g(h0, l0) * (1 - ht) + g(h1, l0) * ht;
  const b = g(h0, l1) * (1 - ht) + g(h1, l1) * ht;
  return a * (1 - lt) + b * lt;
}

/** Fill empty hue cells in each lightness row by circular interpolation between
 *  the nearest filled neighbours. Rows with NO samples (a lightness the profile
 *  can't reach at all) are left at 0 — correctly "nothing reproducible here". */
function fillGaps(data) {
  for (let lb = 0; lb < LUT_L; lb++) {
    const row = lb * LUT_H;
    let any = false;
    for (let hb = 0; hb < LUT_H; hb++) if (data[row + hb] > 0) { any = true; break; }
    if (!any) continue;
    for (let hb = 0; hb < LUT_H; hb++) {
      if (data[row + hb] > 0) continue;
      let dPrev = 0, prevV = 0, dNext = 0, nextV = 0;
      for (let k = 1; k <= LUT_H; k++) { const j = (hb - k + LUT_H) % LUT_H; if (data[row + j] > 0) { dPrev = k; prevV = data[row + j]; break; } }
      for (let k = 1; k <= LUT_H; k++) { const j = (hb + k) % LUT_H; if (data[row + j] > 0) { dNext = k; nextV = data[row + j]; break; } }
      data[row + hb] = (prevV * dNext + nextV * dPrev) / (dPrev + dNext);
    }
  }
}

/** Build the true-gamut LUT: sample the CMYK device cube through the profile's
 *  device→Lab table (relative, no BPC), project to OKHSL, keep max s per cell.
 *
 *  Only the cube's SURFACE is sampled — the 8 3-faces where one channel is pinned
 *  to 0 or 100. The gamut boundary is the image of the cube boundary, so every
 *  max-chroma point lives on a face; full-interior sampling wastes the budget on
 *  low-chroma points and underestimates the surface at the same cost.
 *
 *  Ink levels use Chebyshev spacing (denser near 0% and 100%), where the gamut
 *  surface moves fastest — uniform spacing badly undersampled the light tints.
 *  OKHSL s is capped at 1: it goes numerically unstable (s ≫ 1) near pure white,
 *  and CMYK lives within Display-P3 so 1 is the meaningful ceiling. */
function buildGamutLUT(profile) {
  const src = new CE.Transform({ dataFormat: "object", BPC: false });
  src.create(profile, "*LabD65", CE.eIntent.relative);   // CMYK device → Lab(D65)
  const data = new Float32Array(LUT_H * LUT_L);
  const ok = [0, 0, 0], hsl = [0, 0, 0];
  const add = (C, M, Y, K) => {
    const lab = src.transform(CE.color.CMYK(C, M, Y, K));
    convert(labD65ToXYZ(lab), XYZ, OKLab, ok);
    OKLabToOKHSL(ok, DisplayP3Gamut, hsl);               // [H 0–360, s, L 0–1]
    const s = Math.min(1, hsl[1]);
    const hb = ((Math.floor(hsl[0] / 360 * LUT_H) % LUT_H) + LUT_H) % LUT_H;
    const lb = Math.max(0, Math.min(LUT_L - 1, Math.round(hsl[2] * (LUT_L - 1))));
    const idx = lb * LUT_H + hb;
    if (s > data[idx]) data[idx] = s;
  };
  const N = DEV_FACE, v = i => 50 * (1 - Math.cos(Math.PI * i / N));  // Chebyshev 0–100
  for (let a = 0; a <= N; a++) for (let b = 0; b <= N; b++) for (let c = 0; c <= N; c++) {
    const A = v(a), B = v(b), C = v(c);
    add(0, A, B, C); add(100, A, B, C);                  // C pinned
    add(A, 0, B, C); add(A, 100, B, C);                  // M pinned
    add(A, B, 0, C); add(A, B, 100, C);                  // Y pinned
    add(A, B, C, 0); add(A, B, C, 100);                  // K pinned
  }
  fillGaps(data);
  return data;
}

// ── Profile loading + transform building ─────────────────────────────

async function loadProfile(key) {
  if (profileCache[key]) return profileCache[key];
  const r = await fetch(PROFILE_URLS[key]);
  if (!r.ok) throw new Error(`HTTP ${r.status} fetching ${PROFILE_URLS[key]}`);
  const p = new CE.Profile();
  await p.loadPromise(new Uint8Array(await r.arrayBuffer()));
  if (!p.loaded) throw new Error(p.lastError || "profile did not load");
  profileCache[key] = p;
  return p;
}

async function buildTransforms(key) {
  const p = await loadProfile(key);
  const I = CE.eIntent.relative, O = { dataFormat: "object", BPC: true };
  fwd = new CE.Transform(O); fwd.create("*LabD65", p, I);
  fwdSRGB = new CE.Transform(O); fwdSRGB.create("*sRGB", p, I);
  rev = new CE.Transform(O); rev.create(p, "*LabD65", I);
  revSRGB = new CE.Transform(O); revSRGB.create(p, "*sRGB", I);
  gamutLUT = lutCache[key] || (lutCache[key] = buildGamutLUT(p));
}

/** Switch the active CMYK profile (async parse), then repaint. */
export async function setCMYKProfile(key) {
  if (!engineOK) return;
  cmyk.profileKey = key;
  cmyk.ready = false;
  try {
    await buildTransforms(key);
    cmyk.ready = true;
    P.invalidateCMYKBoundary();   // gamut differs per profile → re-trace the ring
    syncBoundary();
    if (cmyk.active) requestRender();
  } catch (e) {
    console.error("CMYK profile load failed:", e);
  }
}

/** Enter/leave CMYK mode (driven by the CMYK section open/closed). */
export function setCMYKActive(on) {
  if (!engineOK) return;
  cmyk.active = on;
  els.swatches.classList.toggle("cmyk-active", on);
  if (on && !cmyk.ready) setCMYKProfile(cmyk.profileKey);
  else { syncBoundary(); requestRender(); }
}

// ── Init: wire the profile dropdown + bias slider ────────────────────
const profileSel = document.getElementById("cmyk-profile");
if (engineOK && profileSel) {
  cmyk.profileKey = profileSel.value;
  profileSel.addEventListener("change", () => setCMYKProfile(profileSel.value));
}

const biasSlider = document.getElementById("cmyk-bias");
if (engineOK && biasSlider) {
  biasSlider.addEventListener("input", () => {
    let raw = +biasSlider.value / 100;              // 0 (standard) … 1 (closer lightness)
    if (raw <= 0.05) { raw = 0; biasSlider.value = "0"; }   // magnetic snap to standard
    cmyk.bias = raw;
    if (cmyk.active) requestRender();
  });
}

const boundaryToggle = document.getElementById("cmyk-show-boundary");
if (engineOK && boundaryToggle) {
  P.setCMYKBoundaryFn(inCMYKGamut);
  boundaryToggle.addEventListener("change", () => {
    cmyk.showBoundary = boundaryToggle.checked;
    syncBoundary();
  });
}

// "Use Pantone Color Bridge values when possible": when on, a swatch whose
// promoted Pantone carries a Color Bridge build shows that build verbatim
// instead of the ICC conversion (see updateSwatchCMYK). A repaint re-evaluates
// every swatch, so it picks up / drops the substitution immediately.
const bridgeToggle = document.getElementById("cmyk-use-bridge");
if (engineOK && bridgeToggle) {
  cmyk.useColorBridge = bridgeToggle.checked;
  bridgeToggle.addEventListener("change", () => {
    cmyk.useColorBridge = bridgeToggle.checked;
    if (cmyk.active) requestRender();
  });
}
