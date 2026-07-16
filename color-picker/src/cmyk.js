// ══════════════════════════════════════════════════════════════════════
// CMYK via ICC profile
// ══════════════════════════════════════════════════════════════════════
// Converts the picker's true (P3-gamut) OKLab colour to CMYK through a real
// ICC output profile, and renders the resulting build back to a Display-P3
// swatch as a soft proof. CMYK "mode" is active while the CMYK tool section
// is open (see main.js).
//
// SOFT-PROOF APPEARANCE: the swatch fill reverses the final CMYK build to the
// engine's NATIVE PCS — ICC CIELAB(D50) via '*LabD50' — then goes CIELAB(D50) →
// XYZ(D50) → Bradford D50→D65 → Display-P3 (@texel). Because CMYK is always inside
// P3, this renders every printable colour exactly, in-gamut or not, and — unlike a
// CMYK → '*sRGB' reverse — it does NOT clip builds that print outside sRGB but
// inside P3 (the cyan/green edge), so the CMYK swatch matches the P3 region as a P3
// pipeline should. Validated over the whole device cube: it reproduces the engine's
// own CMYK → '*sRGB' (Adobe-exact) to <1/255 for every in-sRGB build.
//
// The reverse MUST use the raw '*LabD50' PCS, NOT '*LabD65': the engine's '*LabD65'
// pre-adapts D50→D65 with its own CAT, and reinterpreting that with a texel-D65
// white double-adapts (the old "~19/255 too little red" drift on #4D7AAF). Using
// the untouched D50 PCS plus one explicit Bradford removes the ambiguity. Gamut
// membership is still flagged separately by the LUT.
//
// Pipeline — forward build has two paths, chosen by whether the colour is in sRGB:
//
//   in-sRGB:  quantised 8-bit hex → jsColorEngine '*sRGB'
//                → ICC CMYK profile (BToA, relative colorimetric + BPC) → C M Y K
//   out-of-sRGB: OKLab → XYZ(D65) [@texel] → Bradford D65→D50 → CIELAB(D50, the
//                engine's native PCS) → '*LabD50'
//                → ICC CMYK profile (BToA, relative colorimetric + BPC) → C M Y K
//
// CRITICAL — never use '*LabD65' for either direction: the engine's '*LabD65'
// pre-adapts the D50 PCS to D65 with its own CAT, so feeding/reading it against
// @texel's D65 white double-adapts and drifts (forward #9628ff → 65-88-0-0 vs the
// correct 70-85-0-0; reverse #4D7AAF proofs ~17/255 too little red). We instead
// hand the engine its RAW native PCS ('*LabD50') and do ONE explicit Bradford
// D65↔D50 ourselves — drift-free (validated over the whole device cube to <1/255
// vs the '*sRGB' path where they overlap). For in-sRGB colours the forward build
// still prefers '*sRGB' (fed 8-bit RGB) because it reproduces Adobe's exact
// sRGB→CMYK readout; '*LabD50' is the fallback for colours OUTSIDE sRGB, which the
// engine has no RGB device profile for (no '*P3').
//
// Gamut membership (the out-of-gamut flag + the boundary ring) is a SEPARATE
// concern from the soft-proof appearance above: it's decided against the
// profile's true reproducible colour solid via a precomputed device-cube LUT
// (see "True gamut membership" below), not the soft-proof round-trip.

import {
  convert, OKLab, XYZ, DisplayP3, sRGB, OKLabToOKHSL, DisplayP3Gamut,
  toOKLab, toe, computeP3AndSRGB, cielabL,
} from "./color.js";
import { S, els, P, pantoneSelections } from "./state.js";
import { requestRender } from "./util.js";
import { MIDDLE_GRAY } from "./constants.js";

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
// true once a profile is parsed and its transforms are built. The out-of-gamut
// build-lightness preference is now PER SWATCH: each out-of-gamut CMYK swatch
// carries its own slider (see updateSwatchCMYK), so there is no global bias here.
export const cmyk = { active: false, profileKey: "gracol", ready: false, showBoundary: false, useColorBridge: false };

let fwd = null;  // CIELAB(D50, native PCS) → CMYK  (out-of-sRGB colours only)
let fwdSRGB = null;  // native *sRGB → CMYK (in-sRGB colours; matches Adobe exactly)
let revLab50 = null;  // CMYK → native PCS CIELAB(D50): soft-proof P3 fill + bias `back`
let gamutLUT = null;          // Float32Array[LUT_L*LUT_H] of max OKHSL s, active profile
const profileCache = {};
const lutCache = {};          // gamut LUT per profile key (built once)

// ── Native PCS = CIELAB(D50). Every engine Lab interchange (forward build,
//    soft-proof reverse, bias `back`, gamut LUT) uses the engine's raw D50 PCS;
//    we Bradford-adapt to/from XYZ(D65) ourselves in ONE step so it stays
//    interchangeable with @texel's D65 primaries. Using the engine's pre-adapted
//    '*LabD65' plus a texel-D65 reinterpretation double-adapts and drifts — see
//    the header block.
const EPS = 216 / 24389, KAP = 24389 / 27;
const fLab    = t => (t > EPS ? Math.cbrt(t) : (KAP * t + 16) / 116);
const fLabInv = f => { const f3 = f * f * f; return f3 > EPS ? f3 : (116 * f - 16) / KAP; };

const PCS_D50 = [0.96422, 1, 0.82521];   // engine's ICC PCS white
const BRADFORD_D50_D65 = [
  [ 0.9555766, -0.0230393,  0.0631636],
  [-0.0282895,  1.0099416,  0.0210077],
  [ 0.0122982, -0.0204830,  1.3299098],
];
const BRADFORD_D65_D50 = [
  [ 1.0478112,  0.0228866, -0.0501270],
  [ 0.0295424,  0.9904844, -0.0170491],
  [-0.0092345,  0.0150436,  0.7521316],
];
const mul3 = (M, v) => [
  M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
  M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
  M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2],
];

const _xyz   = [0, 0, 0];
const _p3    = [0, 0, 0];
const _cmykXyz = [0, 0, 0];  // XYZ(D65) scratch for the Color-Bridge L* readout
const _regionOk  = [0, 0, 0];   // proof OKLab/OKHSL scratch for the region's own
const _regionHsl = [0, 0, 0];   // light/dark chrome decision (see updateSwatchCMYK)

// sRGB gamma → linear (IEC 61966-2-1)
const linearize = v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;

/** XYZ(D65) → CIELAB(D50, native PCS): Bradford to the PCS D50 white, then Lab. */
function xyzD65ToLabD50(xyz65) {
  const [X, Y, Z] = mul3(BRADFORD_D65_D50, xyz65);
  const fx = fLab(X / PCS_D50[0]), fy = fLab(Y / PCS_D50[1]), fz = fLab(Z / PCS_D50[2]);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** CIELAB(D50, native PCS) {L,a,b} → XYZ(D65): Bradford D50→D65. @texel then
 *  takes XYZ(D65) to Display-P3 / OKLab. */
function labD50ToXYZd65(L, a, b) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const xyz50 = [fLabInv(fx) * PCS_D50[0], fLabInv(fy) * PCS_D50[1], fLabInv(fz) * PCS_D50[2]];
  return mul3(BRADFORD_D50_D65, xyz50);
}

/**
 * Picker colour {h,s,L} → CIELAB(D50, the engine's native PCS) {L,a,b}.
 *
 * When the colour is within sRGB, derive XYZ from the quantised 8-bit hex so
 * the CMYK values match Photoshop's readout for the same hex code exactly.
 * Only fall back to the continuous P3 path for colours outside sRGB. Either way
 * we land in XYZ(D65), then Bradford to the PCS D50 white.
 */
function colorToLab(color, info) {
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
  return xyzD65ToLabD50(_xyz);
}

/** Forward + reverse for a picker colour (the raw, unbiased conversion).
 *  In-sRGB colours convert through the engine's native '*sRGB' profile (Adobe-exact);
 *  only colours outside sRGB fall back to the native D50 PCS ('*LabD50') path. */
function convertColor(color) {
  const info = computeP3AndSRGB(color);
  const lab = colorToLab(color, info);
  let c;
  if (!info.outOfSRGB && fwdSRGB) {
    const n = parseInt(info.hex.slice(1), 16);
    c = fwdSRGB.transform(CE.color.RGB((n >> 16) & 0xFF, (n >> 8) & 0xFF, n & 0xFF));
  } else {
    c = fwd.transform(CE.color.Lab(lab.L, lab.a, lab.b));
  }
  const back = revLab50.transform(CE.color.CMYK(c.C, c.M, c.Y, c.K));
  return { lab, c, back };
}

// ── Out-of-gamut bias: ink-space only — NEVER adds an ink the build lacks ──
//
// The per-swatch slider (0 = standard clip … 1 = full travel) adjusts an
// out-of-gamut colour's build toward the INPUT's apparent lightness (CIELAB L*,
// what a Lab-measuring app reports), working entirely in INK space on the
// standard build:
//
//   • DARKEN (input prints darker than the clip): hold C/M/Y, add K only —
//     capped at K=100 and the press TAC (darkenedBuild).
//   • LIGHTEN (input prints lighter): scale ALL FOUR inks down by ONE common
//     factor toward paper white (lightenPath). The C:M:Y ratio is preserved so
//     the hue angle holds, and K scales with them so no gray floor is left
//     behind — bare paper (all channels zero) is the far end, so any lighter
//     target is reachable. No channel ratio ever changes; no ink is introduced.
//
// Landing: both paths bisect their travel so the painted proof's CIELAB L*
// lands on the input's at bias 1 (as close as ink limits allow). Probes are
// single REVERSE transforms of candidate builds (rounded like the label) —
// monotone, no forward round-trip, hence immune to the BPC-cancel trap that
// poisoned the old endpoint search (see the gamut-LUT header + CLAUDE.md).
// bias 0 is exactly the raw Adobe-matching build, and both paths are continuous
// in bias by construction. In-gamut colours have nothing to trade → no-op.

/**
 * Lighten path: the raw build with all four inks scaled down by one common
 * factor (1−p) toward paper. p=0 is the raw build exactly; p=1 is bare paper.
 * Because C, M, Y and K all scale together the C:M:Y ratio (hue angle) and the
 * K:CMY balance are preserved, and no ink is ever introduced.
 */
function lightenPath(raw, p) {
  const s = 1 - p;                                                 // fraction of ink kept
  const { C, M, Y, K } = raw.c;
  return { C: C * s, M: M * s, Y: Y * s, K: K * s };
}

/**
 * Lighten-direction build: bisect how far along lightenPath the painted proof's
 * CIELAB L* reaches the input's, then travel that far, scaled by the bias. The
 * probe is one reverse transform of the rounded candidate build — monotone in p
 * (removing ink only ever lightens). Full removal is bare paper (L* ≈ 100), so a
 * lighter-than-clip target is always reachable.
 */
function lightenedBuild(raw, bias, target) {
  const proofL = p => {
    const b = lightenPath(raw, p);
    return revLab50.transform(CE.color.CMYK(
      Math.round(b.C), Math.round(b.M), Math.round(b.Y), Math.round(b.K))).L;
  };
  let lo = 0, hi = 1;
  for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (proofL(mid) < target) lo = mid; else hi = mid; }
  return lightenPath(raw, ((lo + hi) / 2) * bias);
}

// Total-ink (TAC) limits of the bundled press conditions — the K-add darkening
// path must never write builds a preflight would reject. (GRACoL 2006 = 320%;
// SWOP 2006 = 300%; the FOGRA39L VIGC profile = 300%, per its filename.)
const PROFILE_TAC = { gracol: 320, swop: 300, fogra39: 300 };

/**
 * Darken-direction build: the input prints DARKER than the standard clip. Hold
 * C/M/Y exactly as the standard build has them and add K ONLY, bisecting K so the
 * painted proof's CIELAB L* lands on the input's at full travel — capped at K=100
 * and the press TAC (C+M+Y+K ≤ the profile limit). C/M/Y never change, so the
 * standard separation's hue and chroma are untouched and K only ever increases.
 * If even max K can't reach the target, the slider honestly maxes out at this
 * press's darkest. The probe is a single reverse transform of the rounded build —
 * monotone in K, no forward round-trip, so no BPC-cancel hazard.
 */
function darkenedBuild(raw, bias, target) {
  const { C, M, Y, K } = raw.c;
  const tac = PROFILE_TAC[cmyk.profileKey] ?? 300;
  const Kcap = Math.min(100, Math.max(0, tac - (C + M + Y)));      // K headroom under TAC
  const pr = k => revLab50.transform(CE.color.CMYK(
    Math.round(C), Math.round(M), Math.round(Y), Math.round(k))).L;
  let Kend = Kcap;
  if (pr(Kcap) < target) {             // max K overshoots the target → bisect the landing
    let lo = K, hi = Kcap;
    for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (pr(mid) > target) lo = mid; else hi = mid; }
    Kend = (lo + hi) / 2;
  }
  return { C, M, Y, K: K + (Kend - K) * bias };   // glide K raw → landing; C/M/Y held
}

/**
 * The biased CMYK build. Direction by apparent lightness: input darker than the
 * clip → hold C/M/Y and add K only (darkenedBuild); input lighter → scale all
 * four inks down toward paper by one common factor (lightenedBuild). See the
 * section header — neither path introduces an ink the standard build lacks, and
 * neither changes the C:M:Y ratio, so the hue angle holds in both directions.
 */
function biasedBuild(raw, color, oog, bias) {
  if (bias === 0 || !oog) return raw.c;
  const target = cielabL(color);
  if (target < raw.back.L - 0.25) return darkenedBuild(raw, bias, target);
  return lightenedBuild(raw, bias, target);
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

  // Per-swatch out-of-gamut build-lightness slider (rendered below the CMYK
  // label). Its value IS the state — it lives on the element, so it survives
  // reindexing. Reset it to 0 whenever THIS swatch's colour changes: we key the
  // reset on the colour so slider-driven repaints (colour unchanged) don't wipe
  // it. Only used for an out-of-gamut build below; hidden by CSS otherwise.
  const biasSlider = container.querySelector(".cmyk-bias-slider");
  let bias = 0;
  if (biasSlider) {
    const key = `${color.h.toFixed(6)}:${color.s.toFixed(6)}:${color.L.toFixed(6)}`;
    if (biasSlider.dataset.colorKey !== key) { biasSlider.value = "0"; biasSlider.dataset.colorKey = key; }
    bias = +biasSlider.value / 100;
  }

  // Color Bridge substitution: option on + this swatch has a promoted Pantone
  // that ships its own Color Bridge build → bypass the ICC pathway entirely.
  const promoted = index != null ? pantoneSelections.get(index) : null;
  const bridge = cmyk.useColorBridge && promoted && promoted.cbCMYK && promoted.cbHex
    ? promoted : null;

  // The CMYK region's light/dark chrome FOLLOWS THE INTERFACE — the container's
  // input-colour .light state — and diverges to the soft proof's own state only
  // when the proof sits CLEARLY on the other side of middle gray (dead band
  // below). Deciding purely from the proof flickered wildly during drags: the
  // proof's lightness wobbles across the bare threshold while the colour changes.
  // Anchoring to the container keeps the state stable, and the band ensures a
  // switch only for a genuine mismatch (e.g. a light input whose printable clip
  // is plainly dark).
  const LIGHT_BAND = 0.05;              // OKHSL-lightness dead band around toe(MIDDLE_GRAY)
  const proofLightnessOf = xyz65 => {   // the proof's OKHSL lightness
    convert(xyz65, XYZ, OKLab, _regionOk);
    OKLabToOKHSL(_regionOk, DisplayP3Gamut, _regionHsl);
    return _regionHsl[2];
  };

  let label, cmykBg, oog, cmykL, biasInert = false, proofLh = null;
  if (bridge) {
    const [C, M, Y, K] = bridge.cbCMYK;
    label = `${C}-${M}-${Y}-${K}`;          // Pantone's own recipe, verbatim
    cmykBg = bridge.cbHex;                   // Pantone's published soft-proof (sRGB hex)
    oog = false;                             // a real Pantone build is in-gamut by definition
    const nb = parseInt(bridge.cbHex.slice(1), 16);
    convert([((nb >> 16) & 255) / 255, ((nb >> 8) & 255) / 255, (nb & 255) / 255], sRGB, XYZ, _cmykXyz);
    cmykL = xyzD65ToLabD50(_cmykXyz).L;      // CIELAB L* (D50) of Pantone's published soft-proof hex
    proofLh = proofLightnessOf(_cmykXyz);
  } else {
    // Flag from true gamut membership (the LUT). The CMYK build comes from the
    // biased conversion when the slider is engaged on an out-of-gamut colour.
    oog = isOutOfCMYK(color);
    const raw = convertColor(color);
    const c = biasedBuild(raw, color, oog, bias);
    // Show the slider only when it can DO something: if the full-travel build
    // rounds to the same four inks as the standard build, every slider position
    // paints identically, so hide it (.cmyk-bias-inert, see CSS). The full-travel
    // probe runs the darken optimizer (~65 rev transforms), so during a drag the
    // last settled answer is kept — it is recomputed on the settled render.
    if (oog) {
      if (S.dragging) {
        biasInert = container.classList.contains("cmyk-bias-inert");
      } else {
        const b1 = bias === 1 ? c : biasedBuild(raw, color, oog, 1);
        biasInert = Math.round(b1.C) === Math.round(raw.c.C) && Math.round(b1.M) === Math.round(raw.c.M)
                 && Math.round(b1.Y) === Math.round(raw.c.Y) && Math.round(b1.K) === Math.round(raw.c.K);
      }
    }
    // Soft-proof appearance: reverse the FINAL CMYK build to the engine's native
    // PCS CIELAB(D50), then CIELAB(D50) → XYZ(D65) → Display-P3. This matches the
    // engine's own CMYK→'*sRGB' (Adobe-exact) to <1/255 for in-sRGB builds, and
    // renders builds outside sRGB but inside P3 at their true P3 chroma instead of
    // clipping them to the sRGB box — so the CMYK swatch agrees with the P3 region.
    // See the header block for why '*LabD50' (raw PCS), not '*LabD65', is used.
    // Round ONCE to the integer percentages the label displays, and proof THOSE
    // values — the numbers on screen are exactly what the user will type into their
    // print file, so the swatch must show what those numbers print as (a float build
    // proofed behind an integer label could differ by a fraction of an ink percent).
    const C = Math.round(c.C), M = Math.round(c.M), Y = Math.round(c.Y), K = Math.round(c.K);
    const proof = revLab50.transform(CE.color.CMYK(C, M, Y, K));
    const proofXyz = labD50ToXYZd65(proof.L, proof.a, proof.b);
    convert(proofXyz, XYZ, DisplayP3, _p3);
    cmykBg = `color(display-p3 ${cl3(_p3[0])} ${cl3(_p3[1])} ${cl3(_p3[2])})`;
    label = `${C}-${M}-${Y}-${K}`;
    cmykL = proof.L;   // CIELAB L* (D50) directly — matches Photoshop's Lab L for a P3 doc
    proofLh = proofLightnessOf(proofXyz);
  }

  cmykEl.style.background = cmykBg;
  cmykEl.style.setProperty('--region-bg', cmykBg);

  const v = cmykEl.querySelector(".cmyk-v");
  if (v && v.textContent !== label) v.textContent = label;

  // Proof's CIELAB L* (D50), appended in brackets — tracks the bias slider so it can
  // be read against the input's L* on the sRGB/P3 labels (matches Photoshop's Lab L).
  const cmykLEl = cmykEl.querySelector(".lightness-readout");
  const cmykLtxt = `[${cmykL.toFixed(3)}]`;
  if (cmykLEl && cmykLEl.textContent !== cmykLtxt) cmykLEl.textContent = cmykLtxt;

  container.classList.toggle("out-of-cmyk", oog);
  container.classList.toggle("cmyk-bridge", !!bridge);   // shows the "CB" badge
  container.classList.toggle("cmyk-bias-inert", biasInert);   // hides a do-nothing slider

  // Region chrome state: the interface's (container's) state, unless the proof
  // clearly contradicts it — see the LIGHT_BAND comment above.
  const containerLight = color.L > MIDDLE_GRAY;   // the same test updateSwatch uses
  let regionLight = containerLight;
  if (proofLh != null) {
    const T = toe(MIDDLE_GRAY);
    if (containerLight && proofLh < T - LIGHT_BAND) regionLight = false;
    else if (!containerLight && proofLh > T + LIGHT_BAND) regionLight = true;
  }
  cmykEl.classList.toggle("light", regionLight);
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
  src.create(profile, "*LabD50", CE.eIntent.relative);   // CMYK device → Lab(D50, native PCS)
  const data = new Float32Array(LUT_H * LUT_L);
  const ok = [0, 0, 0], hsl = [0, 0, 0];
  const add = (C, M, Y, K) => {
    const lab = src.transform(CE.color.CMYK(C, M, Y, K));
    convert(labD50ToXYZd65(lab.L, lab.a, lab.b), XYZ, OKLab, ok);
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
  fwd = new CE.Transform(O); fwd.create("*LabD50", p, I);
  fwdSRGB = new CE.Transform(O); fwdSRGB.create("*sRGB", p, I);
  revLab50 = new CE.Transform(O); revLab50.create(p, "*LabD50", I);
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

// ── Init: wire the profile dropdown ──────────────────────────────────
// (The out-of-gamut build-lightness slider is now per-swatch — built and wired
//  in swatches.js, read in updateSwatchCMYK above.)
const profileSel = document.getElementById("cmyk-profile");
if (engineOK && profileSel) {
  cmyk.profileKey = profileSel.value;
  profileSel.addEventListener("change", () => setCMYKProfile(profileSel.value));
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
