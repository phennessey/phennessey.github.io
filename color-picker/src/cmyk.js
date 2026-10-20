// ══════════════════════════════════════════════════════════════════════
// CMYK via ICC profile
// ══════════════════════════════════════════════════════════════════════
// Converts the picker's true (P3-gamut) OKLab color to CMYK through a real
// ICC output profile, and renders the build back to a Display-P3 swatch as a
// soft proof. CMYK "mode" is active while the CMYK tool section is open (see
// main.js).
//
// Relative colorimetric WITH black-point compensation (cmyk-ink.js USE_BPC),
// as Photoshop and InDesign convert by default: the press's darkest rich black
// stands in for the screen's black and the tones between scale to fit, so every
// shadow has a printable match. A build's proof is what its recipe prints,
// shown with the press's black as black.
//
//   Gamut (flag + ring): the profile's precomputed gamut table (lib/gamut/,
//     built by tools/gamut-tables.html): the most OKLab chroma any ink recipe
//     within the press's total-ink limit prints, per hue and lightness. A color
//     is out of gamut when its chroma exceeds the table's. The dashed ring draws
//     the same table, so flag and ring agree by construction.
//   Build (in gamut): an ink recipe whose proof matches the color — the
//     profile's own separation when it already does, otherwise the solver's
//     (cmyk-ink.js). The profile's table misses some printable colors (its
//     black generation can't reach K-heavy dark browns and olives).
//   Build (out of gamut): Adobe's build — the profile's own conversion
//     (relative colorimetric + BPC, Photoshop's default) — blended in over a
//     narrow band just past the gamut boundary (see ADOBE_BLEND_BAND). At the
//     boundary itself the build is the exact recipe for the color there, so it
//     meets the in-gamut build with no jump; by the band's far edge it is
//     Adobe's build as-is. User requirements 2026-10-19/20: start from Adobe's
//     build, and no discontinuous CMYK change when only one parameter moves.
//     Switching straight to Adobe's build at the boundary jumped wherever the
//     profile's table can't make the exact recipe (an olive went 0-7-100-41 →
//     36-36-100-3).
//   Swatch: the proof of the build ROUNDED to whole percents — exactly what the
//     numbers on the label print.
//
// Lab interchange uses the engine's raw D50 PCS ('*LabD50') with one explicit
// Bradford, never '*LabD65' (it double-adapts — see cmyk-ink.js / CLAUDE.md).
// The soft proof goes CIELAB(D50) → XYZ(D65) → Display-P3, so builds that print
// outside sRGB but inside P3 (the cyan/green edge) keep their true chroma.

import {
  convert, OKLab, XYZ, DisplayP3, sRGB, oklabToOKHSL,
  toOKLab, toe, toeInv, isSRGBMode, clampOKLabToSRGB, sForChroma,
} from "./color.js";
import {
  makeInkSolver, xyzD65ToLabD50, labD50ToXYZd65, parseGamutTable, tableChroma, PROFILE_TAC, USE_BPC,
} from "./cmyk-ink.js";
import { els, P, pantoneSelections } from "./state.js";
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
const TABLE_URL = key => `lib/gamut/${key}.f32`;

// Public mode state. `active` mirrors the CMYK section open/closed; `ready` is
// true once a profile is parsed and its transforms are built. The out-of-gamut
// build-lightness preference is PER SWATCH: each out-of-gamut CMYK swatch
// carries its own slider (see updateSwatchCMYK), so there is no global bias here.
export const cmyk = { active: false, profileKey: "gracol", ready: false, showBoundary: true, useColorBridge: false };

// Float transforms ('objectFloat'), relative colorimetric, BPC per USE_BPC.
let revLab50 = null;   // CMYK → native PCS CIELAB(D50): soft proof + bias probes
let solver = null;     // cmyk-ink.js solver over the active profile
let gamutTable = null; // the active profile's gamut table (null if it failed to load)
const profileCache = {};
const tableCache = {};

// Builds are carried in percent (0–100, float); the engine's float CMYK is 0–1.
/** Proof of a (float, percent) build: its CIELAB(D50) through the profile. */
const proofOf = c => revLab50.transform(CE.color.CMYKf(c.C / 100, c.M / 100, c.Y / 100, c.K / 100));
const roundBuild = c => ({ C: Math.round(c.C), M: Math.round(c.M), Y: Math.round(c.Y), K: Math.round(c.K) });

const _ok    = [0, 0, 0];
const _xyz   = [0, 0, 0];
const _p3    = [0, 0, 0];
const _cmykXyz = [0, 0, 0];  // XYZ(D65) scratch for the Color-Bridge L* readout
const _proofOk   = [0, 0, 0];   // proof OKLab scratch for the sRGB-mode clip
const _regionOk  = [0, 0, 0];   // proof OKLab/OKHSL scratch for the region's own
const _regionHsl = [0, 0, 0];   // light/dark chrome decision (see updateSwatchCMYK)

/** Picker color {h,s,L} → its OKLab (into _ok) and CIELAB(D50, native PCS). */
function colorToLab(color) {
  toOKLab(color.h, color.s, toe(color.L), _ok);
  convert(_ok, OKLab, XYZ, _xyz);
  return xyzD65ToLabD50(_xyz);
}

/** The most OKLab chroma the press prints at the hue and lightness of the
 *  OKLab in _ok (left there by colorToLab/toOKLab); Infinity with no table. */
function okEdgeChroma() {
  if (!gamutTable) return Infinity;
  return tableChroma(gamutTable, Math.atan2(_ok[2], _ok[1]) / (2 * Math.PI), toe(_ok[0]));
}

/** Out of gamut: the color's OKLab chroma exceeds the edge's (see above). */
function okOutOfGamut() {
  return Math.hypot(_ok[1], _ok[2]) > okEdgeChroma();
}

// Out of gamut, the build fades from the exact recipe at the gamut boundary to
// Adobe's build over this much chroma past it, relative to the boundary's own
// chroma (0.02 = the first 2%), on a smoothstep so it eases in and out.
const ADOBE_BLEND_BAND = 0.02;
const smoothstep = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** The standard conversion: the input's CIELAB(D50), whether it's out of gamut,
 *  its build and that build's float proof. In gamut the build matches the
 *  input; out of gamut it is Adobe's build, blended in from the exact recipe
 *  for the color pulled in to the boundary (same hue and lightness, chroma cut
 *  to the edge) over ADOBE_BLEND_BAND — see the header. */
function convertColor(color) {
  const lab = colorToLab(color);
  const ok = [_ok[0], _ok[1], _ok[2]];   // the input's OKLab, before any pull-in
  const oog = okOutOfGamut();
  const C = Math.hypot(_ok[1], _ok[2]);
  if (!oog || C === 0) {   // (a flagged neutral — the sliver above black — has no chroma to cut)
    const c = solver.solve(lab).c;
    return { lab, ok, oog, c, back: proofOf(c) };
  }
  // The exact recipe for the color pulled in to the boundary — same hue and
  // lightness, the most chroma that prints there. It anchors the blend at the
  // boundary and is the slider's far end (see "Out-of-gamut slider").
  const edge = Math.max(0, okEdgeChroma());
  const f = edge / C;
  _ok[1] *= f; _ok[2] *= f;
  convert(_ok, OKLab, XYZ, _xyz);
  const keepL = solver.solve(xyzD65ToLabD50(_xyz)).c;
  const w = edge > 0 ? smoothstep((C - edge) / (ADOBE_BLEND_BAND * edge)) : 1;
  const adobe = solver.clip(lab);
  const c = { C: keepL.C + (adobe.C - keepL.C) * w, M: keepL.M + (adobe.M - keepL.M) * w,
              Y: keepL.Y + (adobe.Y - keepL.Y) * w, K: keepL.K + (adobe.K - keepL.K) * w };
  return { lab, ok, oog, c, keepL, back: proofOf(c) };
}

// ── Out-of-gamut slider: Adobe's build ↔ exact lightness ──────────────
//
// An out-of-gamut color can't be printed, so its build has to give up some
// lightness accuracy, some saturation, or a mix. Slider 0 is the default build
// (Adobe's, see convertColor), which often lands lighter or darker than the
// input. The far end (100) gives up saturation to get the lightness right: the
// input's hue and exact CIELAB lightness L* (the [L*] readout on the swatch,
// and what Photoshop/InDesign report) with the most saturation that prints
// there, matched exactly by the solver. It's found on the gamut boundary at the
// input's OKLab hue by bisecting the lightness until the point's L* equals the
// input's. (Keeping OKLab lightness instead missed L* by up to 5 for blues —
// #0000FF ended at L* 34.9 against 29.6 — since the two lightness scales
// disagree there.) At the boundary itself this is the input, so it's continuous
// with the in-gamut build.
// In between, the inks blend from one to the other, so the build is continuous
// in both the slider and the color. Hidden when the two ends round to the same
// inks. (User decisions 2026-10-20. Two far ends were tried and rejected: the
// press's most saturated point overshot by 20+ ΔE00, and the CIEDE2000-closest
// point along a constant-hue lightness walk kept saturation at lightness's
// expense — #B9B1F9 on GRACoL ended 4 L* too dark at 35-31-0-0, where the user
// matched it in InDesign at 30-28-0-0; this end gives 30-27-0-0.)

/** The slider's far end (see above): the exact recipe for the boundary point at
 *  the input's hue whose CIELAB L* equals the input's; cached on `raw`. */
const _mOk = [0, 0, 0], _mXyz = [0, 0, 0];
function matchLightnessBuild(raw) {
  if (raw.matchL) return raw.matchL;
  const [, a, b] = raw.ok, C = Math.hypot(a, b), h = Math.atan2(b, a) / (2 * Math.PI);
  const at = lr => {   // the most-saturated printable point at OKHSL lightness lr (≤ the input's chroma)
    const f = Math.min(C, Math.max(0, tableChroma(gamutTable, h, lr))) / C;
    _mOk[0] = toeInv(lr); _mOk[1] = a * f; _mOk[2] = b * f;
    convert(_mOk, OKLab, XYZ, _mXyz);
    return xyzD65ToLabD50(_mXyz);
  };
  let lo = 0, hi = 1;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (at(m).L < raw.lab.L) lo = m; else hi = m; }
  return (raw.matchL = solver.solve(at((lo + hi) / 2)).c);
}

/** The slider's build: 0 is the default build exactly, 1 the exact-lightness
 *  build; in between, the inks blend from one to the other. */
function biasedBuild(raw, color, oog, bias) {
  if (bias === 0 || !oog || !raw.keepL || !gamutTable) return raw.c;
  const d = raw.c, e = matchLightnessBuild(raw);
  return { C: d.C + (e.C - d.C) * bias, M: d.M + (e.M - d.M) * bias,
           Y: d.Y + (e.Y - d.Y) * bias, K: d.K + (e.K - d.K) * bias };
}

const cl3 = v => Math.max(0, Math.min(1, v)).toFixed(3);

/** Whether a picker color lies outside the active profile's printable gamut
 *  (see the header). Also drives click-to-pull in swatches.js. */
export function isOutOfCMYK(color) {
  if (!engineOK || !cmyk.ready) return false;
  toOKLab(color.h, color.s, toe(color.L), _ok);
  return okOutOfGamut();
}

/** The boundary ring's radius — the OKHSL saturation of the gamut's edge — at
 *  hue `h` and OKHSL lightness `lr` in the current gamut mode; negative where
 *  nothing prints. Capped at 1, the disc's edge (in sRGB mode, printable colors
 *  outside sRGB sit on the rim). */
export function cmykRingRadius(h, lr) {
  if (!engineOK || !cmyk.ready || !gamutTable) return -1;
  const C = tableChroma(gamutTable, h, lr);
  return C < 0 ? -1 : sForChroma(h, C, lr);
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
  // reindexing. Reset it to 0 whenever THIS swatch's color changes: we key the
  // reset on the color so slider-driven repaints (color unchanged) don't wipe
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
  // input-color .light state — and diverges to the soft proof's own state only
  // when the proof sits CLEARLY on the other side of middle gray (dead band
  // below). Deciding purely from the proof flickered wildly during drags: the
  // proof's lightness wobbles across the bare threshold while the color changes.
  // Anchoring to the container keeps the state stable, and the band ensures a
  // switch only for a genuine mismatch (e.g. a light input whose printable clip
  // is plainly dark).
  const LIGHT_BAND = 0.05;              // OKHSL-lightness dead band around toe(MIDDLE_GRAY)
  const proofLightnessOf = xyz65 => {   // the proof's OKHSL lightness
    convert(xyz65, XYZ, OKLab, _regionOk);
    oklabToOKHSL(_regionOk, _regionHsl);
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
    // Flag: is the input outside the printable gamut? (see the header). The CMYK
    // build comes from the biased conversion when the slider is engaged on a
    // flagged color.
    const raw = convertColor(color);
    oog = raw.oog;
    const c = biasedBuild(raw, color, oog, bias);
    // Show the slider only when it can DO something: if the full-travel build
    // rounds to the same four inks as the default build, every slider position
    // paints identically, so hide it (.cmyk-bias-inert, see CSS). The probe is
    // cheap (table lookups and one solve), so it runs on every render, drags
    // included — freezing it mid-drag left a stale slider showing or hidden.
    if (oog) {
      const b1 = bias === 1 ? c : biasedBuild(raw, color, oog, 1);
      biasInert = Math.round(b1.C) === Math.round(raw.c.C) && Math.round(b1.M) === Math.round(raw.c.M)
               && Math.round(b1.Y) === Math.round(raw.c.Y) && Math.round(b1.K) === Math.round(raw.c.K);
    }
    // Soft-proof appearance: the label's whole-percent build, reversed to the
    // engine's native PCS CIELAB(D50), then CIELAB(D50) → XYZ(D65) → Display-P3
    // (true P3 chroma, not clipped to the sRGB box). The swatch shows exactly
    // what the printed numbers produce; rounding costs ≤ ~0.6 ΔE00 in the worst
    // dark regions. The flag doesn't depend on it (it reads the gamut table), so
    // the rounding can't make the flag speckle.
    const { C, M, Y, K } = roundBuild(c);
    const proof = proofOf({ C, M, Y, K });
    const proofXyz = labD50ToXYZd65(proof.L, proof.a, proof.b);
    // sRGB mode limits everything shown to sRGB, so a proof outside sRGB (the
    // printable cyans) is pulled radially to the sRGB edge, like the wheel does.
    if (isSRGBMode()) {
      convert(proofXyz, XYZ, OKLab, _proofOk);
      convert(clampOKLabToSRGB(_proofOk, _proofOk), OKLab, DisplayP3, _p3);
    } else {
      convert(proofXyz, XYZ, DisplayP3, _p3);
    }
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

async function loadTable(key) {
  if (tableCache[key]) return tableCache[key];
  const r = await fetch(TABLE_URL(key));
  if (!r.ok) throw new Error(`HTTP ${r.status} fetching ${TABLE_URL(key)}`);
  const t = parseGamutTable(await r.arrayBuffer());
  if (t.bpc !== USE_BPC) throw new Error(`${TABLE_URL(key)} was built with BPC ${t.bpc ? "on" : "off"} — rebuild it`);
  return (tableCache[key] = t);
}

async function buildTransforms(key) {
  const [p, table] = await Promise.all([
    loadProfile(key),
    // Without its table the profile still converts; there is just no flag or ring.
    loadTable(key).catch(e => { console.error("CMYK gamut table load failed:", e); return null; }),
  ]);
  const I = CE.eIntent.relative, O = { dataFormat: "objectFloat", BPC: USE_BPC };
  const fwd = new CE.Transform(O); fwd.create("*LabD50", p, I);
  revLab50 = new CE.Transform(O); revLab50.create(p, "*LabD50", I);
  solver = makeInkSolver(CE, fwd, revLab50, PROFILE_TAC[key] ?? 300);
  gamutTable = table;
}

/** Gamut-mode switch: saturation is relative to the wheel's gamut, so the ring's
 *  shape in (h, s) changes with the mode — redraw it. (The flag reads chroma, so
 *  it doesn't change.) */
export function refreshCMYKGamut() {
  if (!engineOK || !cmyk.ready) return;
  P.invalidateCMYKBoundary();
  syncBoundary();
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
  P.setCMYKBoundaryFn(cmykRingRadius);
  cmyk.showBoundary = boundaryToggle.checked;   // sync state to the DOM's initial (checked) state
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
