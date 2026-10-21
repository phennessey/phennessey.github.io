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
//   Build — ONE rule for every color: the exact recipe for its printable
//     target (see printableTarget). In gamut the target is the color itself;
//     out of gamut it is the most saturated printable color with the input's
//     exact hue and CIELAB lightness L*. The target moves smoothly with the
//     input and equals it at the gamut boundary, so the build never jumps when
//     one parameter moves (user requirement 2026-10-19). The exact recipe is
//     the profile's own separation when its proof already matches, otherwise
//     the solver's (cmyk-ink.js) — the profile's table misses some printable
//     colors (its black generation can't reach K-heavy dark browns and olives).
//   Slider (out of gamut only): fades the inks from that build (0) toward
//     Adobe's build (100) — the profile's own conversion (relative colorimetric
//     + BPC, Photoshop's default), which keeps more saturation by giving up
//     lightness. User decision 2026-10-20 (replacing "default = Adobe's build"):
//     Adobe's build can be a different recipe altogether — A36911 on GRACoL went
//     0-47-100-39 at the boundary to 27-59-100-10 just past it, launching the
//     swatch brighter.
//   Swatch: the proof of the build ROUNDED to whole percents — exactly what the
//     numbers on the label print.
//
// Lab interchange uses the engine's raw D50 PCS ('*LabD50') with one explicit
// Bradford, never '*LabD65' (it double-adapts — see cmyk-ink.js / CLAUDE.md).
// The soft proof goes CIELAB(D50) → XYZ(D65) → Display-P3, so builds that print
// outside sRGB but inside P3 (the cyan/green edge) keep their true chroma.

import {
  convert, OKLab, XYZ, DisplayP3, oklabToOKHSL,
  toOKLab, toe, toeInv, isSRGBMode, clampOKLabToSRGB, sForChroma,
} from "./color.js";
import {
  makeInkSolver, xyzD65ToLabD50, labD50ToXYZd65, parseGamutTable, tableChroma, PROFILE_TAC, USE_BPC,
} from "./cmyk-ink.js";
import { els, P, pantoneSelections } from "./state.js";
import { isPromotionShown } from "./pantone.js";
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
export const cmyk = { active: false, profileKey: "gracol", ready: false, showBoundary: true };

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

/** The input's printable target, as CIELAB(D50): the input itself when it
 *  prints; otherwise the point on the gamut boundary at the input's OKLab hue
 *  whose CIELAB L* equals the input's — the most saturation that prints at that
 *  hue and lightness (chroma never above the input's). Found by bisecting the
 *  boundary's lightness until L* matches; at the boundary it IS the input, so
 *  the target is continuous across it. (CIELAB L*, not OKLab lightness — the
 *  [L*] readout and what Photoshop/InDesign report; keeping OKLab lightness
 *  missed L* by up to 5 for blues: #0000FF ended at L* 34.9 against 29.6.) */
const _mOk = [0, 0, 0], _mXyz = [0, 0, 0];
function printableTarget(lab, ok, oog) {
  const [, a, b] = ok, C = Math.hypot(a, b);
  if (!oog || C === 0) return lab;   // (a flagged neutral — the sliver above black — has no chroma to cut)
  const h = Math.atan2(b, a) / (2 * Math.PI);
  const at = lr => {   // the boundary point at OKHSL lightness lr
    const f = Math.min(C, Math.max(0, tableChroma(gamutTable, h, lr))) / C;
    _mOk[0] = toeInv(lr); _mOk[1] = a * f; _mOk[2] = b * f;
    convert(_mOk, OKLab, XYZ, _mXyz);
    return xyzD65ToLabD50(_mXyz);
  };
  let lo = 0, hi = 1;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (at(m).L < lab.L) lo = m; else hi = m; }
  return at((lo + hi) / 2);
}

/** The standard conversion: the input's CIELAB(D50) and OKLab, whether it's out
 *  of gamut, and its build — the exact recipe for its printable target. */
function convertColor(color) {
  const lab = colorToLab(color);
  const ok = [_ok[0], _ok[1], _ok[2]];
  const oog = okOutOfGamut();
  const c = solver.solve(printableTarget(lab, ok, oog)).c;
  return { lab, ok, oog, c };
}

// ── Out-of-gamut slider: exact build ↔ Adobe's build ──────────────────
//
// An out-of-gamut color can't be printed, so its build has to give up some
// saturation, some lightness accuracy, or a mix. Slider 0 is the default
// build (exact hue and lightness, the most saturation that prints there). 100
// is Adobe's build, which typically keeps more saturation by moving the
// lightness (and sometimes the hue). In between, the inks blend linearly (≤ 1
// ink point per 1%), so the build is continuous in the slider. Hidden when the
// two ends round to the same inks. (History, 2026-10-20: the slider first ran
// the other way — Adobe's build as the default, exact lightness at 100 — but
// Adobe's build could launch away from the in-gamut recipe just past the
// boundary, and a hue-searching far end tried the same day was a patch on it.)

/** The slider's build: 0 is the default build, 1 Adobe's; in between, the
 *  inks blend from one to the other. Adobe's is cached on `raw`. */
function biasedBuild(raw, bias) {
  if (bias === 0 || !raw.oog) return raw.c;
  const d = raw.c, e = (raw.adobe ??= solver.clip(raw.lab));
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
 * and a profile is ready. `index` is the swatch index, used to look up the
 * promoted library color for the library alternate below.
 *
 * Library alternate: when the swatch's "LIBRARY" checkbox is on, the ICC conversion
 * is bypassed — the label shows the library's own CMYK for the promoted color
 * and the fill is that recipe as the active press profile prints it. Such
 * swatches get .cmyk-lib-on (and the checkbox shows checked).
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

  // Library alternate, per swatch: when this swatch's promoted color has a CMYK
  // alternate in its library (a CMYK add-on such as Pantone Color Bridge), a
  // "LIBRARY" checkbox appears below the CMYK readout; checking it (swatches.js) stores
  // the promoted color's key on the element and the build becomes that
  // alternate. Demoting, or promoting another color, clears it. Hidden — not
  // cleared — while the promoted color's library is switched off.
  const promoted = index != null ? pantoneSelections.get(index) : null;
  if (!promoted || container.dataset.cmykLibKey !== promoted.key) delete container.dataset.cmykLibKey;
  const alt = promoted && promoted.cbCMYK && isPromotionShown(promoted) ? promoted : null;
  const bridge = alt && container.dataset.cmykLibKey === alt.key ? alt : null;
  container.classList.toggle("cmyk-has-lib", !!alt);

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

  // Soft-proof appearance of a whole-percent build: reversed to the engine's
  // native PCS CIELAB(D50), then CIELAB(D50) → XYZ(D65) → Display-P3 (true P3
  // chroma, not clipped to the sRGB box). sRGB mode limits everything shown to
  // sRGB, so a proof outside it (the printable cyans) is pulled radially to the
  // sRGB edge, like the wheel does.
  const paintProof = build => {
    const proof = proofOf(build);
    const proofXyz = labD50ToXYZd65(proof.L, proof.a, proof.b);
    if (isSRGBMode()) {
      convert(proofXyz, XYZ, OKLab, _proofOk);
      convert(clampOKLabToSRGB(_proofOk, _proofOk), OKLab, DisplayP3, _p3);
    } else {
      convert(proofXyz, XYZ, DisplayP3, _p3);
    }
    cmykBg = `color(display-p3 ${cl3(_p3[0])} ${cl3(_p3[1])} ${cl3(_p3[2])})`;
    cmykL = proof.L;   // CIELAB L* (D50) directly — matches Photoshop's Lab L for a P3 doc
    proofLh = proofLightnessOf(proofXyz);
  };

  let label, cmykBg, oog, cmykL, biasInert = false, proofLh = null;
  if (bridge) {
    // The add-on's own recipe (whole percents), painted as this press prints it.
    const [C, M, Y, K] = bridge.cbCMYK.map(v => Math.round(v));
    label = `${C}-${M}-${Y}-${K}`;
    oog = false;                             // a published build is printable by definition
    paintProof({ C, M, Y, K });
  } else {
    // Flag: is the input outside the printable gamut? (see the header). The CMYK
    // build comes from the biased conversion when the slider is engaged on a
    // flagged color.
    const raw = convertColor(color);
    oog = raw.oog;
    const c = biasedBuild(raw, bias);
    // Show the slider only when it can DO something: if the full-travel build
    // rounds to the same four inks as the default build, every slider position
    // paints identically, so hide it (.cmyk-bias-inert, see CSS). The probe is
    // cheap (table lookups and one solve), so it runs on every render, drags
    // included — freezing it mid-drag left a stale slider showing or hidden.
    if (oog) {
      const b1 = bias === 1 ? c : biasedBuild(raw, 1);
      biasInert = Math.round(b1.C) === Math.round(raw.c.C) && Math.round(b1.M) === Math.round(raw.c.M)
               && Math.round(b1.Y) === Math.round(raw.c.Y) && Math.round(b1.K) === Math.round(raw.c.K);
    }
    // The swatch shows exactly what the label's whole-percent numbers print;
    // rounding costs ≤ ~0.6 ΔE00 in the worst dark regions. The flag doesn't
    // depend on it (it reads the gamut table), so rounding can't make it speckle.
    const { C, M, Y, K } = roundBuild(c);
    label = `${C}-${M}-${Y}-${K}`;
    paintProof({ C, M, Y, K });
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
  container.classList.toggle("cmyk-lib-on", !!bridge);
  const altCheck = container.querySelector(".cmyk-alt-check");
  if (altCheck) altCheck.setAttribute("aria-checked", String(!!bridge));
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
