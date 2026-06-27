// ══════════════════════════════════════════════════════════════════════
// CMYK via ICC profile
// ══════════════════════════════════════════════════════════════════════
// Converts the picker's true (P3-gamut) OKLab colour to CMYK through a real
// ICC output profile, and renders the resulting build back to a Display-P3
// swatch as a soft proof. CMYK "mode" is active while the CMYK tool section
// is open (see main.js).
//
// Pipeline (validated to reproduce Photoshop's relative-colorimetric + BPC
// conversion exactly for in-sRGB colours — see cmyk-test/ spike):
//
//   OKLab → XYZ(D65) [@texel/color] → CIELAB(D65) → jsColorEngine '*LabD65'
//         → ICC CMYK profile (BToA, relative colorimetric + BPC) → C M Y K
//
// jsColorEngine owns the D65→D50 PCS adaptation internally, so we never do a
// Bradford step by hand (the classic double-adapt bug). The D65 white used for
// our CIELAB is anchored to @texel/color's own OKLab-white so there is zero
// scaling drift between the two libraries.

import {
  convert, OKLab, XYZ, DisplayP3,
} from "https://esm.sh/@texel/color@1.1.11?bundle";
import { toOKLab, toe, toeInv, computeP3AndSRGB } from "./color.js";
import { els, P } from "./state.js";
import { requestRender } from "./util.js";

const CE = window.jsColorEngine;
const engineOK = !!(CE && CE.Transform && CE.Profile && CE.color);
if (!engineOK) console.error("jsColorEngine not loaded — CMYK feature disabled.");

const PROFILE_URLS = {
  gracol:  "profiles/GRACoL2006_Coated1v2.icc",
  swop:    "profiles/SWOP2006_Coated3v2.icc",
  fogra39: "profiles/Coated_Fogra39L_VIGC_300.icc",
};

// A colour whose round-trip (→CMYK→back) lands within this ΔEOK of the original
// is treated as reproducible; beyond it the profile clipped, i.e. out of gamut.
// ΔEOK = Euclidean distance in OKLab, which (unlike ΔE76) stays perceptually
// honest in the saturated/blue region where wide-gamut P3 colours live — so the
// flag now tracks what the eye sees, not CIE76's blue-blindness. 0.02 avoids
// false positives from ICC CLUT discretisation near the gamut boundary while
// still flagging genuinely unrepresentable colours.
const GAMUT_DE = 0.02;

// Public mode state. `active` mirrors the CMYK section open/closed; `ready` is
// true once a profile is parsed and its transforms are built. `bias` is the
// out-of-gamut clipping preference in [0, 1]: 0 = standard relative-colorimetric
// clip, increasing toward 1 locks the printed hue to the target's and raises
// lightness toward it (sacrificing chroma, never hue).
export const cmyk = { active: false, profileKey: "gracol", ready: false, bias: 0, showBoundary: false };

let fwd = null;  // CIELAB(D65) → CMYK
let rev = null;  // CMYK → CIELAB(D65)
const profileCache = {};

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
function colorToLabD65(color) {
  const { hex, outOfSRGB } = computeP3AndSRGB(color);
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

// Perceptual gamut metric: Euclidean distance in OKLab. Both inputs are
// CIELAB(D65); convert each through the shared XYZ anchor and measure there so
// the gamut flag matches perceived difference even for saturated colours.
const _deA = [0, 0, 0], _deB = [0, 0, 0];
const dEOK = (a, b) => {
  labD65ToOk(a, _deA); labD65ToOk(b, _deB);
  return Math.hypot(_deA[0] - _deB[0], _deA[1] - _deB[1], _deA[2] - _deB[2]);
};

/** Forward + reverse from a CIELAB(D65) input: the CMYK build, its printable
 *  Lab, and round-trip ΔE. */
function convertFromLab(lab) {
  const c    = fwd.transform(CE.color.Lab(lab.L, lab.a, lab.b));   // {C,M,Y,K} 0–100
  const back = rev.transform(CE.color.CMYK(c.C, c.M, c.Y, c.K));   // printable {L,a,b}
  return { lab, c, dE: dEOK(lab, back), back };
}

/** Forward + reverse for a picker colour (the raw, unbiased conversion). */
function convertColor(color) { return convertFromLab(colorToLabD65(color)); }

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
// The endpoint is an *in-gamut* hue-locked appearance — chroma capped just inside
// the gamut — so the biased build is self-consistent: feeding that appearance
// reproduces the same build. That keeps the soft-proof click idempotent (the
// snapped colour reproduces the shown CMYK and clears the gamut flag in one go).
//
// bias 0 reproduces the exact standard build; from there the input lerps (in
// OKLab) toward the endpoint = (target L, target hue, max in-gamut chroma there).
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

/** Printed appearance (rev∘fwd) of a CIELAB(D65) input. */
function cofLab(lab) {
  const c = fwd.transform(CE.color.Lab(lab.L, lab.a, lab.b));
  return rev.transform(CE.color.CMYK(c.C, c.M, c.Y, c.K));
}

// Hold the endpoint a hair inside the gamut so the snapped proof reliably clears
// the out-of-gamut flag (whose threshold is GAMUT_DE) in a single click.
const BIAS_GAMUT_DE = GAMUT_DE - 0.004;

/** Largest OKLab chroma at a locked lightness + hue whose direct CMYK round-trip
 *  stays inside the gamut — i.e. an appearance the profile reproduces faithfully. */
function maxChromaOk(L, cos, sin) {
  let lo = 0, hi = 0.4;
  for (let i = 0; i < 16; i++) {
    const m = (lo + hi) / 2;
    const lab = okToLabD65([L, m * cos, m * sin]);
    if (dEOK(lab, cofLab(lab)) <= BIAS_GAMUT_DE) lo = m; else hi = m;
  }
  return lo;
}

// The endpoint (standard appearance + hue-locked bright target) depends only on
// the colour + profile, not the slider, so memoise it across a slider drag.
const biasCache = new Map();
function biasEndpoint(raw) {
  const tgtOk = labD65ToOk(raw.lab);
  const key = `${cmyk.profileKey}:${tgtOk[0].toFixed(3)}:${tgtOk[1].toFixed(3)}:${tgtOk[2].toFixed(3)}`;
  let e = biasCache.get(key);
  if (!e) {
    const C = Math.hypot(tgtOk[1], tgtOk[2]);
    const cos = C < 1e-9 ? 1 : tgtOk[1] / C, sin = C < 1e-9 ? 0 : tgtOk[2] / C;
    const mc = maxChromaOk(tgtOk[0], cos, sin);
    e = { std: labD65ToOk(raw.back), endp: [tgtOk[0], mc * cos, mc * sin] };
    if (biasCache.size > 512) biasCache.clear();
    biasCache.set(key, e);
  }
  return e;
}

/**
 * The CIELAB(D65) input to feed the forward transform after applying the bias
 * (0 = standard … 1 = hue locked at the target hue, lightness raised toward the
 * target). Returns the unchanged Lab at bias 0 or for in-gamut colours.
 */
function biasedLab(raw) {
  if (cmyk.bias === 0 || raw.dE <= GAMUT_DE) return raw.lab;
  const { std, endp } = biasEndpoint(raw);
  const t = cmyk.bias;
  return okToLabD65([
    std[0] + (endp[0] - std[0]) * t,
    std[1] + (endp[1] - std[1]) * t,
    std[2] + (endp[2] - std[2]) * t,
  ]);
}

const cl3 = v => Math.max(0, Math.min(1, v)).toFixed(3);

/** Whether a picker colour falls outside the active CMYK profile's gamut. */
export function isOutOfCMYK(color) {
  if (!engineOK || !cmyk.ready) return false;
  return convertColor(color).dE > GAMUT_DE;
}

/**
 * Gamut predicate in the wheel's (hue, saturation, toe'd-lightness) space —
 * the CMYK analogue of inSRGB, used by the picker to trace the boundary ring.
 * `lr` is the toe'd reference lightness; convertColor wants the un-toe'd L, so
 * invert it. Returns true when the colour is reproducible by the active profile.
 */
export function inCMYKGamut(h, s, lr) {
  if (!engineOK || !cmyk.ready) return true;
  return convertColor({ h, s, L: toeInv(lr) }).dE <= GAMUT_DE;
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
 * and a profile is ready.
 *
 * The CMYK swatch always lives inside .color-row; the side/bottom split is pure
 * CSS, keyed off `.show-matches` and a .swatches-level (not per-swatch)
 * `:has(.match-cells.has-promotion)`, so every swatch shares one layout:
 *   • matches visible, or any promotion anywhere → side mode: .color-row is a
 *                                    row, CMYK the right half.
 *   • neither                                    → bottom mode: .color-row is a
 *                                    column, CMYK the bottom half (chip space).
 */
export function updateSwatchCMYK(container, color) {
  if (!engineOK || !cmyk.active) return;
  const cmykEl = container.querySelector(".color-swatch.cmyk");
  if (!cmykEl) return;

  if (!cmyk.ready) return;   // transforms still loading; leave placeholder

  // Flag from the raw (unbiased) ΔE — the icon reflects the true target. Build
  // and proof fill come from the biased conversion when the slider is engaged.
  const raw = convertColor(color);
  const { c, back } = (cmyk.bias !== 0 && raw.dE > GAMUT_DE)
    ? convertFromLab(biasedLab(raw)) : raw;
  convert(labD65ToXYZ(back), XYZ, DisplayP3, _p3);
  cmykEl.style.background = `color(display-p3 ${cl3(_p3[0])} ${cl3(_p3[1])} ${cl3(_p3[2])})`;

  const label = `${Math.round(c.C)}-${Math.round(c.M)}-${Math.round(c.Y)}-${Math.round(c.K)}`;
  const v = cmykEl.querySelector(".cmyk-v");
  if (v && v.textContent !== label) v.textContent = label;

  container.classList.toggle("out-of-cmyk", raw.dE > GAMUT_DE);
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
  rev = new CE.Transform(O); rev.create(p, "*LabD65", I);
}

/** Switch the active CMYK profile (async parse), then repaint. */
export async function setCMYKProfile(key) {
  if (!engineOK) return;
  cmyk.profileKey = key;
  cmyk.ready = false;
  biasCache.clear();   // gamut (and thus hue-locked endpoints) differ per profile
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
