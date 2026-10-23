// ══════════════════════════════════════════════════════════════════════
// Color science
// ══════════════════════════════════════════════════════════════════════
// Pure color-space conversions and gamut helpers, independent of the DOM
// and the picker widget. New color work (CMYK, Pantone color bridge,
// export) belongs here.

import {
  convert,
  OKLab,
  OKLCH,
  XYZ,
  DisplayP3,
  sRGB,
  DisplayP3Gamut,
  sRGBGamut,
  findGamutIntersectionOKLCH,
  OKLabToOKHSL as texelOKLabToOKHSL,
  OKLab_to_LMS_M,
  LMS_to_linear_sRGB_M,
  LMS_to_linear_DisplayP3_M,
} from "https://esm.sh/@texel/color@1.1.11?bundle";

// Single home for the vendored @texel/color dependency: every other module
// imports these through color.js, so the pinned version above is the only
// place the URL lives.
export { convert, OKLab, XYZ, DisplayP3, sRGB };
// @texel/color's own OKLab → LMS and LMS → linear RGB matrices, for the wheel
// renderer's inlined conversion (picker.js) — the same numbers convert() uses.
export { OKLab_to_LMS_M, LMS_to_linear_sRGB_M, LMS_to_linear_DisplayP3_M };

// ── OKHSL, owned here (Ottosson's method; P3 gets its own fit) ───────
//
// A port of Björn Ottosson's okhsl_to_srgb / srgb_to_okhsl (MIT; reference
// bottosson.github.io/misc/colorpicker/colorconversion.js) on @texel/color's
// findGamutIntersectionOKLCH and an exact cusp (see "The cusp" below). Two pieces of
// his method are fitted to the gamut: get_ST_mid ("a smooth approximation of
// the location of the cusp", kept below it) and C_0's constant shape ("roughly
// the average values of ST"). @texel/color's OKHSL reuses his sRGB fits for
// every gamut, which left P3's mid curve ~20% inside P3's cusp (s = 0.8 reached
// 70% of the edge chroma vs his 85%). So each gamut carries its own values:
//  • sRGB — his published values, unchanged (matches @texel/color's OKHSL).
//  • Display P3 — get_ST_mid transferred hue by hue: target = P3 cusp × (his
//    curve ÷ sRGB cusp), refit to his formula by weighted least squares over
//    720 hues (constant term grid-searched in 0.005 steps). C_0 = his 0.4 / 0.8
//    × the P3/sRGB ratio of average cusp S / T (1.15033 / 1.14758). Result
//    matches his sRGB spacing: chroma at s = 0.2 / 0.5 / 0.8 is 22.0 / 53.5 /
//    85.4% of the edge (his sRGB: 22.5 / 54.1 / 85.2%). His own fitting process
//    was never published, so this keeps his curve's per-hue relationship to the
//    cusp rather than re-running his optimization.
//
// P3_SPACING_BLEND then mixes the P3 fit back toward his sRGB-tuned values
// (0 = his sRGB curves on P3's edge, as @texel/color had it; 1 = the full P3
// fit above). It sets how much of the P3 wheel's radius the sRGB colors take.
// The full fit spaces P3 exactly like his sRGB but pulls the sRGB ring in to a
// median 0.81 of the radius; his sRGB curves leave it at 0.92, cramming P3-only
// colors into the outer 8%. 0.536 puts the median sRGB ring at 0.8615 of the
// radius — exactly the measured size difference: across hues and lightness, the
// sRGB edge reaches a median 0.8615 of P3's edge chroma (P3 ≈ 16% larger), and
// the wheel's radius represents chroma. Spacing at this setting: s = 0.8 reaches
// ~0.79 of the edge chroma (his sRGB 0.852).
const P3_SPACING_BLEND = 0.536;

const OKHSL_FIT = new Map([
  [sRGBGamut, {
    S: [0.11516993, 7.44778970, 4.15901240, -2.19557347, 1.75198401, -2.13704948, -10.02301043, -4.24894561, 5.38770819, 4.69891013],
    T: [0.11239642, 1.61320320, -0.68124379, 0.40370612, 0.90148123, -0.27087943, 0.61223990, 0.00299215, -0.45399568, -0.14661872],
    c0S: 0.4, c0T: 0.8,
  }],
  [DisplayP3Gamut, {
    S: [0.105, 5.422384452, 2.513960247, -1.016298257, 0.6211271393, -2.231023915, -4.553936801, -1.235881320, 2.392231699, 1.986019271],
    T: [0.215, 1.761351023, -0.9392327315, 0.3332985699, 0.7457244888, -0.5943952091, 0.8429335838, 0.01100052257, -0.2204482476, -0.1016102000],
    c0S: 0.46013066, c0T: 0.91806165,
    blend: P3_SPACING_BLEND,   // mixed toward the sRGB entry's values (see above)
  }],
]);
// Apply each fit's blend: C_0's constants mix directly; the mid curve mixes by
// value in getCs (its coefficients aren't linear in the curve).
for (const [g, p] of OKHSL_FIT) {
  if (p.blend === undefined) continue;
  const base = OKHSL_FIT.get(sRGBGamut);
  p.base = base;
  p.c0S = (1 - p.blend) * base.c0S + p.blend * p.c0S;
  p.c0T = (1 - p.blend) * base.c0T + p.blend * p.c0T;
}

// ── The cusp, computed exactly ───────────────────────────────────────
//
// The cusp (the most saturated color of a hue) anchors OKHSL's edge. Ottosson's
// approximation (@texel/color's findCuspOKLCH) picks the wrong channel's
// equation on the cyan side of pure blue (hue 264.05°), so the wheel's edge
// stopped ~4% short there and snapped out at blue: a visible step, e.g. edge
// colors #0126AD → #0300C4 across a hair of hue. Here it's exact: along a ray
// from black at saturation S = C/L, each linear channel is a cubic in S, and
// the cusp's S is the most saturated S at which every channel is ≥ 0. Then, as
// in his find_cusp, the cusp's L scales that color until its largest channel
// is 1.
//
// sRGB alone has a true break there too: just cyan-side of pure blue the gamut
// grows a thin spike out to the blue primary — along those hues S runs in
// gamut, out, then in again at the spike's tip — and pure #0000FF IS that tip.
// Cutting the spike off would put every #0000xx 19% past the wheel's edge (user
// decision 2026-10-20: no color may be unreachable). So the edge reaches the
// tip and is ramped instead: the cusp's S may fall off at most CUSP_RAMP_SLOPE
// per degree of hue from any neighbor (an upper envelope). The ramp runs ~1° on
// the cyan side of blue, where the edge sits up to 2/255 outside sRGB (drawn
// clipped). Elsewhere S never changes faster than 0.031/degree, so nothing else
// moves. P3 has no spike and no ramp.
//
// Cusps are tabulated every 0.01° of hue per gamut (built on first use, ~70 ms)
// and interpolated linearly. The gamut's six corners (R, G, B and C, M, Y — each
// is the exact cusp at its own hue) are spliced in as extra points: the cusp
// has a sharp corner there, and interpolating across it cut pure #0000FF off
// the sRGB edge by 0.12% (the edge read #0001FF).
const CUSP_STEPS = 36000, CUSP_DEG = 360 / CUSP_STEPS;
const CUSP_RAMP_SLOPE = 0.1;   // max fall-off of the cusp's S per degree (sRGB only)
const CUSP_GAMUT = new Map([
  [sRGBGamut, { M: LMS_to_linear_sRGB_M, ramp: CUSP_RAMP_SLOPE, space: sRGB }],
  [DisplayP3Gamut, { M: LMS_to_linear_DisplayP3_M, ramp: 0, space: DisplayP3 }],
]);
const CUSP_CORNERS = [[1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1], [1, 0, 1]];

/** Positive real roots of c0 + c1·S + c2·S² + c3·S³ (below 1000), ascending:
 *  the cubic is monotone between its turning points, so bisect each stretch
 *  whose ends differ in sign. */
function cubicRoots(c0, c1, c2, c3, out) {
  const f = S => c0 + S * (c1 + S * (c2 + S * c3));
  const A = 3 * c3, B = 2 * c2, disc = B * B - 4 * A * c1, ends = [];
  if (Math.abs(A) > 1e-15) {
    if (disc >= 0) { const q = Math.sqrt(disc); ends.push((-B - q) / (2 * A), (-B + q) / (2 * A)); }
  } else if (Math.abs(B) > 1e-15) ends.push(-c1 / B);
  const stops = ends.filter(s => s > 0).sort((x, y) => x - y);
  stops.push(1e3);
  let lo = 0, flo = f(0);
  for (const hi of stops) {
    const fhi = f(hi);
    if ((flo > 0) !== (fhi > 0)) {
      let l = lo, h = hi;
      for (let i = 0; i < 52; i++) { const m = (l + h) / 2; if ((f(m) > 0) === (flo > 0)) l = m; else h = m; }
      out.push(l);
    }
    lo = hi; flo = fhi;
  }
  return out;
}

/** The most saturated S at which the color (L = 1, C = S) along unit hue (a, b)
 *  has every linear channel ≥ 0. Channel i is Σⱼ M[i][j]·(1 + S·kⱼ)³ — a cubic
 *  in S; the in-gamut S form one or more stretches between its roots, and the
 *  answer is the top of the last one. */
function cuspSaturation(M, a, b) {
  const k = [0, 1, 2].map(j => OKLab_to_LMS_M[j][1] * a + OKLab_to_LMS_M[j][2] * b);
  const coef = M.map(r => [
    r[0] + r[1] + r[2],
    3 * (r[0] * k[0] + r[1] * k[1] + r[2] * k[2]),
    3 * (r[0] * k[0] ** 2 + r[1] * k[1] ** 2 + r[2] * k[2] ** 2),
    r[0] * k[0] ** 3 + r[1] * k[1] ** 3 + r[2] * k[2] ** 3,
  ]);
  const inGamut = S => coef.every(([c0, c1, c2, c3]) => c0 + S * (c1 + S * (c2 + S * c3)) >= 0);
  const roots = [];
  for (const c of coef) cubicRoots(c[0], c[1], c[2], c[3], roots);
  roots.sort((x, y) => x - y);
  let top = 0, lo = 0;
  for (const r of roots) {
    if (r > lo && inGamut((lo + r) / 2)) top = r;   // [lo, r] is an in-gamut stretch
    lo = r;
  }
  return top;
}

const cuspTables = new Map();   // gamut → { L, C } Float64Arrays over hue
function cuspTable(g) {
  let t = cuspTables.get(g);
  if (t) return t;
  const { M, ramp, space } = CUSP_GAMUT.get(g);
  const S = new Float64Array(CUSP_STEPS), Lc = new Float64Array(CUSP_STEPS), Cc = new Float64Array(CUSP_STEPS);
  const ang = i => i * CUSP_DEG * Math.PI / 180;
  for (let i = 0; i < CUSP_STEPS; i++) S[i] = cuspSaturation(M, Math.cos(ang(i)), Math.sin(ang(i)));
  if (ramp) {   // upper envelope: S falls off at most `ramp` per degree, around the circle
    const d = ramp * CUSP_DEG, N = CUSP_STEPS;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < N; i++) S[i] = Math.max(S[i], S[(i + N - 1) % N] - d);
      for (let i = N - 1; i >= 0; i--) S[i] = Math.max(S[i], S[(i + 1) % N] - d);
    }
  }
  const lms = [0, 0, 0];
  for (let i = 0; i < CUSP_STEPS; i++) {
    const a = Math.cos(ang(i)) * S[i], b = Math.sin(ang(i)) * S[i];
    for (let j = 0; j < 3; j++) lms[j] = (1 + OKLab_to_LMS_M[j][1] * a + OKLab_to_LMS_M[j][2] * b) ** 3;
    let top = 0;
    for (const r of M) top = Math.max(top, r[0] * lms[0] + r[1] * lms[1] + r[2] * lms[2]);
    Lc[i] = Math.cbrt(1 / top); Cc[i] = Lc[i] * S[i];
  }
  // The corners, keyed by the table step they fall in: [position in steps, L, C].
  const corners = new Map(), ok = [0, 0, 0];
  for (const rgb of CUSP_CORNERS) {
    convert(rgb, space, OKLab, ok);
    const x = ((Math.atan2(ok[2], ok[1]) * 180 / Math.PI % 360 + 360) % 360) / CUSP_DEG;
    corners.set(Math.floor(x) % CUSP_STEPS, [x, ok[0], Math.hypot(ok[1], ok[2])]);
  }
  t = { L: Lc, C: Cc, corners };
  cuspTables.set(g, t);
  return t;
}

/** The cusp [L, C] for unit hue (a_, b_) in gamut `g` (see above). */
const _cusp = [0, 0];
function findCusp(a_, b_, g) {
  const t = cuspTable(g);
  const x = (((Math.atan2(b_, a_) * 180 / Math.PI) % 360 + 360) % 360) / CUSP_DEG;
  const i = Math.floor(x) % CUSP_STEPS, j = (i + 1) % CUSP_STEPS, f = x - Math.floor(x);
  const c = t.corners.get(i);
  if (c) {   // a corner falls in this step: interpolate to or from it
    const fc = c[0] - Math.floor(c[0]);
    if (f <= fc) { const u = fc > 0 ? f / fc : 1; _cusp[0] = t.L[i] + (c[1] - t.L[i]) * u; _cusp[1] = t.C[i] + (c[2] - t.C[i]) * u; }
    else { const u = (f - fc) / (1 - fc); _cusp[0] = c[1] + (t.L[j] - c[1]) * u; _cusp[1] = c[2] + (t.C[j] - c[2]) * u; }
    return _cusp;
  }
  _cusp[0] = t.L[i] + (t.L[j] - t.L[i]) * f;
  _cusp[1] = t.C[i] + (t.C[j] - t.C[i]) * f;
  return _cusp;
}

// get_ST_mid's form: X = c0 + 1/(c1 + c2·b + a(c3 + c4·b + a(c5 + c6·b + a(c7 + c8·b + c9·a))))
const stMid = (c, a, b) => c[0] + 1 / (c[1] + c[2]*b + a*(c[3] + c[4]*b + a*(c[5] + c[6]*b + a*(c[7] + c[8]*b + c[9]*a))));

/** His get_Cs: [C_0, C_mid, C_max] at OKLab lightness L along unit hue (a_, b_). */
function getCs(L, a_, b_, g, out) {
  const p = OKHSL_FIT.get(g);
  const cusp = findCusp(a_, b_, g);
  const Cmax = findGamutIntersectionOKLCH(a_, b_, L, 1, L, cusp, g);
  const k = Cmax / Math.min(L * (cusp[1] / cusp[0]), (1 - L) * (cusp[1] / (1 - cusp[0])));
  let Sm = stMid(p.S, a_, b_), Tm = stMid(p.T, a_, b_);
  if (p.base) {
    Sm = (1 - p.blend) * stMid(p.base.S, a_, b_) + p.blend * Sm;
    Tm = (1 - p.blend) * stMid(p.base.T, a_, b_) + p.blend * Tm;
  }
  const Ca = L * Sm, Cb = (1 - L) * Tm;
  out[1] = 0.9 * k * Math.sqrt(Math.sqrt(1 / (1 / Ca**4 + 1 / Cb**4)));
  const C0a = L * p.c0S, C0b = (1 - L) * p.c0T;
  out[0] = Math.sqrt(1 / (1 / C0a**2 + 1 / C0b**2));
  out[2] = Cmax;
  return out;
}

const _cs = [0, 0, 0];
const wrap360 = d => ((d % 360) + 360) % 360;

/** OKHSL [H 0–360, s, l] → OKLab in gamut `g` (his okhsl_to_srgb, stopping at OKLab). */
function hslToLab(hsl, g, out) {
  const h = wrap360(hsl[0]) / 360, s = hsl[1], L = toeInv(hsl[2]);
  let A = 0, B = 0;
  if (L !== 0 && L !== 1 && s !== 0) {
    const a_ = Math.cos(2 * Math.PI * h), b_ = Math.sin(2 * Math.PI * h);
    const [C0, Cmid, Cmax] = getCs(L, a_, b_, g, _cs);
    let t, k0, k1, k2;
    if (s < 0.8) { t = 1.25 * s; k0 = 0; k1 = 0.8 * C0; k2 = 1 - k1 / Cmid; }
    else { t = 5 * (s - 0.8); k0 = Cmid; k1 = 0.2 * Cmid * Cmid * 1.25 * 1.25 / C0; k2 = 1 - k1 / (Cmax - Cmid); }
    const C = k0 + t * k1 / (1 - k2 * t);
    A = C * a_; B = C * b_;
  }
  out[0] = L; out[1] = A; out[2] = B;
  return out;
}

/** OKLab → OKHSL [H 0–360, s, l] in gamut `g` (his srgb_to_okhsl, starting from OKLab). */
function labToHsl(lab, g, out) {
  const L = lab[0], C = Math.sqrt(lab[1] ** 2 + lab[2] ** 2), l = toe(L);
  const h = 0.5 + Math.atan2(-lab[2], -lab[1]) / (2 * Math.PI);
  let s = 0;
  if (l !== 0 && l !== 1 && C !== 0) {
    const [C0, Cmid, Cmax] = getCs(L, lab[1] / C, lab[2] / C, g, _cs);
    if (C < Cmid) {
      const k1 = 0.8 * C0, k2 = 1 - k1 / Cmid;
      s = 0.8 * (C / (k1 + k2 * C));
    } else {
      const k0 = Cmid, k1 = 0.2 * Cmid * Cmid * 1.25 * 1.25 / C0, k2 = 1 - k1 / (Cmax - Cmid);
      s = 0.8 + 0.2 * ((C - k0) / (k1 + k2 * (C - k0)));
    }
  }
  // Pure black / white carry no saturation (the same guard @texel/color uses).
  if (Math.abs(s) >= 1e-4 && (l === 0 || Math.abs(1 - l) < 1e-7)) s = 0;
  out[0] = wrap360(h * 360); out[1] = s; out[2] = l;
  return out;
}

// ── Gamut mode ───────────────────────────────────────────────────────
//
// OKHSL saturation is relative to a gamut: s = 1 is that gamut's edge at the
// given hue and lightness. 'p3' (the default) measures it against Display P3;
// 'srgb' measures it against sRGB, which is Ottosson's original OKHSL. Hue and
// lightness don't depend on the gamut, so switching modes only changes `s`.
// Every OKHSL ⇄ OKLab conversion in the app goes through this module so it
// picks up the current gamut.

let gamutMode = 'p3';
let gamut = DisplayP3Gamut;
const gamutFor = mode => (mode === 'srgb' ? sRGBGamut : DisplayP3Gamut);

export function getGamutMode() { return gamutMode; }
export function isSRGBMode()   { return gamutMode === 'srgb'; }
export function setGamutMode(mode) {
  gamutMode = mode === 'srgb' ? 'srgb' : 'p3';
  gamut = gamutFor(gamutMode);
}

/** OKHSL [H 0–360, s, l] → OKLab in the current gamut. */
export function okhslToOKLab(hsl, out) { return hslToLab(hsl, gamut, out); }

// OKHSL's saturation curve is defined only up to the gamut edge (s = 1). Past
// it, extrapolating the formula runs away — s shoots far past 1 and can turn
// negative (sRGB: −2944 for one Pantone; P3 with its own fit: up to 503) — so a
// color outside the gamut would land wildly far from the disc, or inside it.
// Pantone dots are the only thing placed past the edge, by these rules:
//  • P3: past P3's edge, s is read off @texel/color's P3 OKHSL (his sRGB-tuned
//    curves). It shares P3's exact edge (s = 1 at the same chroma), so it's
//    continuous at the rim, and its extrapolation is well behaved (≤ 1.27 across
//    the Pantone library) — the out-of-gamut Pantone map is unchanged from before
//    P3 got its own fit.
//  • sRGB: past sRGB's edge, a color is placed by its position in the P3 wheel,
//    scaled so the sRGB ring becomes the disc edge: s = s_P3(color) / s_P3(sRGB
//    edge at the same hue and lightness). It sits relative to the sRGB circle
//    exactly as it sits relative to the sRGB ring in P3 mode.
const _xsEdge = [0, 0, 0], _xsP3 = [0, 0, 0], _xsP3Edge = [0, 0, 0];
function oklabToOKHSLExtended(lab, g, out) {
  labToHsl(lab, g, out);
  const edge = g === sRGBGamut ? _xsEdge : _xsP3Edge;
  hslToLab([out[0], 1, out[2]], g, edge);
  if (Math.hypot(lab[1], lab[2]) <= Math.hypot(edge[1], edge[2])) return out;
  if (g !== sRGBGamut) {
    out[1] = texelOKLabToOKHSL(lab, DisplayP3Gamut, _xsP3)[1];
    return out;
  }
  const sColor = oklabToOKHSLExtended(lab, DisplayP3Gamut, _xsP3)[1];
  const sEdge   = labToHsl(_xsEdge, DisplayP3Gamut, _xsP3)[1];
  if (sEdge > 0) out[1] = Math.max(1, sColor / sEdge);
  return out;
}

/** OKLab → OKHSL [H 0–360, s, l] in the current gamut; past the sRGB edge in
 *  sRGB mode, s is read off the P3 wheel (see oklabToOKHSLExtended). */
export function oklabToOKHSL(lab, out) { return oklabToOKHSLExtended(lab, gamut, out); }
/** The same, in a given mode's gamut rather than the current one. */
export function oklabToOKHSLIn(mode, lab, out) { return oklabToOKHSLExtended(lab, gamutFor(mode), out); }

// ── Swatch colors past the edge (exact round trip) ──────────────────
//
// A swatch typed in as hex can sit a little past the wheel's edge: Ottosson's
// edge estimate falls short near blue (the real sRGB edge bulges past his
// triangle; P3's estimate falls short along the whole black–blue edge). OKHSL's
// own formula is no use there — past the edge it flattens, so e.g. every chroma
// from 0.0506 to 0.0528 at #00000F's hue reads s = 1.0000000006 in P3, and the
// color can't be recovered. So for swatches, past the edge s is chroma ÷ edge
// chroma at the same hue and lightness, with its exact inverse: the edge color
// scaled by s. Inside the edge (everything the wheel draws) OKHSL is untouched.
// Pantone dot placement uses its own rule (oklabToOKHSLExtended above).

const _swEdge = [0, 0, 0];
function swatchLabFromHsl(h360, s, l, g, out) {
  if (s <= 1) return hslToLab([h360, s, l], g, out);
  hslToLab([h360, 1, l], g, out);
  out[1] *= s; out[2] *= s;
  return out;
}
function swatchHslFromLabRaw(lab, g, out) {
  labToHsl(lab, g, out);
  hslToLab([out[0], 1, out[2]], g, _swEdge);
  const C = Math.hypot(lab[1], lab[2]), Cmax = Math.hypot(_swEdge[1], _swEdge[2]);
  if (Cmax > 0 && C > Cmax) out[1] = C / Cmax;
  return out;
}
// (A ±1e-9 rad hue nudge used to live here: @texel/color's cusp finder was
// unstable at exactly pure blue's hue, which every #0000xx shares. The exact
// cusp above is stable there, so swatches read straight through.)
const swatchHslFromLab = swatchHslFromLabRaw;

const _rsLab = [0, 0, 0], _rsHsl = [0, 0, 0];
/** The saturation a color {h, s, L} measured in `fromMode` has in `toMode`,
 *  capped at that gamut's edge (1). Hue and L carry over unchanged. */
export function resaturate(col, fromMode, toMode) {
  if (fromMode === toMode || col.s === 0) return col.s;
  swatchLabFromHsl(col.h * 360, col.s, toe(col.L), gamutFor(fromMode), _rsLab);
  oklabToOKHSLExtended(_rsLab, gamutFor(toMode), _rsHsl);
  return Math.min(1, _rsHsl[1]);
}

/** Pull an OKLab color radially (same hue and lightness) to the sRGB edge if
 *  it lies outside sRGB — the same treatment the wheel gives every color in
 *  sRGB mode. In-gamut colors are copied through unchanged. */
export function clampOKLabToSRGB(lab, out) {
  oklabToOKHSLExtended(lab, sRGBGamut, _rsHsl);
  if (_rsHsl[1] <= 1) { out[0] = lab[0]; out[1] = lab[1]; out[2] = lab[2]; return out; }
  _rsHsl[1] = 1;
  return hslToLab(_rsHsl, sRGBGamut, out);
}

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
const _xyzc = [0, 0, 0];

// ── Core color conversions ───────────────────────────────────────────

/** OKHSL → OKLab in the current gamut (see Gamut mode). s > 1 (a swatch typed
 *  in past the edge) is the exact inverse of srgbToOKHSL's reading. */
export function toOKLab(h, s, lr, out = _lab) {
  return swatchLabFromHsl(h * 360, s, lr, gamut, out);
}

/** For the wheel renderer (picker.js): OKHSL's hue-dependent part — getCs's
 *  C_0, C_mid and C_max — at OKHSL lightness lr (0 < lr < 1) for n evenly
 *  spaced hues h = i/n (turns), in the current gamut, packed [C0, Cmid, Cmax, …].
 *  At one lightness these don't depend on saturation, so the wheel builds this
 *  table once per lightness instead of recomputing it for every pixel; with
 *  them, hslToLab's remaining step is a few multiplies. */
export function okhslHueTable(lr, n, out = new Float64Array(3 * n)) {
  const L = toeInv(lr);
  for (let i = 0; i < n; i++) {
    const a = 2 * Math.PI * i / n;
    getCs(L, Math.cos(a), Math.sin(a), gamut, _cs);
    out[3 * i] = _cs[0]; out[3 * i + 1] = _cs[1]; out[3 * i + 2] = _cs[2];
  }
  return out;
}

/** sRGB [0–1] → picker's {h, s, L} descriptor. Exact: toOKLab gives back the
 *  same OKLab, even for colors just past the wheel's edge. */
export function srgbToOKHSL(r, g, b) {
  convert([r, g, b], sRGB, OKLab, _lab);
  swatchHslFromLab(_lab, gamut, _hsl);
  return { h: _hsl[0] / 360, s: _hsl[1], L: toeInv(_hsl[2]) };
}

/** Display P3 [0–1] → picker's {h, s, L} descriptor, like srgbToOKHSL (exact:
 *  toOKLab gives back the same OKLab, even past the wheel's edge). */
export function p3ToOKHSL(r, g, b) {
  convert([r, g, b], DisplayP3, OKLab, _lab);
  swatchHslFromLab(_lab, gamut, _hsl);
  return { h: _hsl[0] / 360, s: _hsl[1], L: toeInv(_hsl[2]) };
}

/** The OKHSL saturation that yields a given OKLCH chroma (closed form). */
export function sForChroma(h, targetC, lr) {
  // OKHSL's own inverse (labToHsl's chroma → s step) at this hue and
  // lightness: exact, and one getCs instead of the 25 OKHSL conversions a
  // bisection took (this runs per hue for the CMYK ring and the chroma guide,
  // and per swatch during chroma-locked drags). s = 1 is C_max, the edge.
  const L = toeInv(lr);
  if (!(L > 0 && L < 1)) return 1;   // pure black / white: no chroma at all
  if (!(targetC > 0)) return 0;
  const [C0, Cmid, Cmax] = getCs(L, Math.cos(2 * Math.PI * h), Math.sin(2 * Math.PI * h), gamut, _cs);
  if (Cmax <= targetC) return 1;
  if (targetC < Cmid) {
    const k1 = 0.8 * C0, k2 = 1 - k1 / Cmid;
    return 0.8 * (targetC / (k1 + k2 * targetC));
  }
  const k1 = 0.2 * Cmid * Cmid * 1.25 * 1.25 / C0, k2 = 1 - k1 / (Cmax - Cmid), d = targetC - Cmid;
  return 0.8 + 0.2 * (d / (k1 + k2 * d));
}

/** Return the OKLCH chroma of a color descriptor {h, s, L}. */
export function chromaOf(col) {
  convert(toOKLab(col.h, col.s, toe(col.L)), OKLab, OKLCH, _lch);
  return _lch[1];
}

/** Lightness (col.L space) of the current gamut's chroma cusp for a hue — the
 *  lightness at which this hue can reach its maximum chroma. The cusp's L is
 *  OKLab L, which equals col.L (toeInv of the OKHSL lightness), so it
 *  can be assigned to col.L directly. Depends on hue only, not saturation. */
export function cuspL(h) {
  const H = h * Math.PI * 2;
  return findCusp(Math.cos(H), Math.sin(H), gamut)[0];
}

/** Whether a color sits on the wheel's rim — full saturation (s = 1, or past
 *  the edge for a typed-in color). The chroma cusp only means something there:
 *  the cusp marker and the Shift snap to it are active only on the rim (user
 *  decision 2026-10-23). */
export const onRim = col => col.s >= 1 - 1e-4;

/** Test whether an (h, s, lr) triple falls within the sRGB gamut. */
export function inSRGB(h, s, lr) {
  convert(toOKLab(h, s, lr), OKLab, sRGB, _rgb);
  return _rgb.every(v => v >= -1e-5 && v <= 1 + 1e-5);
}

// ── Gamut-mapped output computation ──────────────────────────────────

const _mapLab = [0, 0, 0];
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
  const beyondSRGB = _rgb.some(v => v < -1e-4 || v > 1 + 1e-4);
  // In sRGB mode s ≤ 1 keeps every color inside sRGB by construction, so any
  // overshoot here is float noise at the edge — never a real P3-only color.
  const outOfSRGB = gamutMode === 'p3' && beyondSRGB;
  // Inside sRGB (within float noise), round the channels as they are. Only a
  // color truly outside is pulled in to the sRGB edge at the same hue and
  // lightness (clampOKLabToSRGB — the sRGB wheel's own edge, exact cusp). Never
  // run in-gamut colors through a mapping: @texel/color's gamutMapOKLCH (used
  // here until 2026-10-20) turned a typed #00005A, exactly on the edge, into
  // #000B4F, and its approximate cusp made P3-mode hex readouts jump at pure
  // blue (#0126AD → #0300C4).
  if (beyondSRGB) {
    convert(clampOKLabToSRGB(_lab, _mapLab), OKLab, sRGB, _rgb);
  }
  const hex = '#' + _rgb.map(v => to255(v).toString(16).padStart(2, '0').toUpperCase()).join('');
  // The sRGB swatch fill must agree with the hex readout exactly, so paint it
  // with the same 8-bit value rather than a higher-precision color(srgb …) that
  // could drift from the displayed hex (a 1px lightness nudge can change the
  // true color by less than one 8-bit step — same hex, different fill). The
  // only finer / wider-than-sRGB fill is the P3 swatch (p3Css), shown solely
  // when the color falls outside sRGB.
  const srgbCss = hex;
  return { p3Str, p3Css, srgbCss, hex, outOfSRGB };
}

// ── CIELAB L* (the "Lab lightness" Photoshop reports) ────────────────
//
// Display readout only — NOT used in any color/gamut calculation. Photoshop's Lab
// PCS is D50, so we Bradford-adapt XYZ(D65, @texel's XYZ) to D50 and take the CIELAB
// L* nonlinearity. L* depends only on luminance, so just the Bradford Y (luminance)
// row is needed. Scale is 0–100 to match Photoshop's Lab readout.
const _bfY = [0.0295424, 0.9904844, -0.0170491];   // Bradford D65→D50, Y (luminance) row
const _labEps = 216 / 24389, _labKap = 24389 / 27;
function cielabLFromXYZ(xyz65) {
  const Y = _bfY[0]*xyz65[0] + _bfY[1]*xyz65[1] + _bfY[2]*xyz65[2];   // D50 white Y = 1
  return 116 * (Y > _labEps ? Math.cbrt(Y) : (_labKap*Y + 16)/116) - 16;
}
/** CIELAB L* (D50, 0–100) of a picker color — its true (P3-gamut) color. */
export function cielabL(color) {
  toOKLab(color.h, color.s, toe(color.L), _lab);
  convert(_lab, OKLab, XYZ, _xyzc);
  return cielabLFromXYZ(_xyzc);
}
/** CIELAB L* (D50, 0–100) of an sRGB [0–1] color — e.g. the displayed sRGB hex. */
export function cielabLOfSrgb(r, g, b) {
  convert([r, g, b], sRGB, XYZ, _xyzc);
  return cielabLFromXYZ(_xyzc);
}

// ── Background lightness → P3 CSS ────────────────────────────────────

export function neutralP3(L) {
  _lab[0] = L; _lab[1] = 0; _lab[2] = 0;
  convert(_lab, OKLab, DisplayP3, _p3);
  return `color(display-p3 ${_p3[0].toFixed(3)} ${_p3[1].toFixed(3)} ${_p3[2].toFixed(3)})`;
}
