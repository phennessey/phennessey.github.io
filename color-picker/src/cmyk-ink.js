// ══════════════════════════════════════════════════════════════════════
// CMYK ink math — PCS helpers, the exact-match ink solver, gamut tables
// ══════════════════════════════════════════════════════════════════════
// Pure math with no app state, shared by cmyk.js (runtime) and
// tools/gamut-tables.js (the generator for lib/gamut/*.f32). The engine and its
// transforms are passed in, so this module has no DOM or app dependencies.
//
// Relative colorimetric WITH black-point compensation (BPC), as Photoshop and
// InDesign convert by default: the press's darkest black (a rich four-ink black
// near the TAC, ~L* 10–11 on paper) stands in for the screen's black, and the
// tones between scale to fit. So every shadow has a printable match, and a
// build's proof is what the recipe prints with its black shown as black.

// ── Native PCS = CIELAB(D50) ─────────────────────────────────────────
// The engine's raw D50 PCS ('*LabD50') plus ONE explicit Bradford D65↔D50, so
// it stays interchangeable with @texel's D65 primaries. Never use the engine's
// '*LabD65': it pre-adapts with its own CAT, and reinterpreting that against a
// texel-D65 white double-adapts and drifts (see CLAUDE.md).
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

/** XYZ(D65) → CIELAB(D50, native PCS): Bradford to the PCS D50 white, then Lab. */
export function xyzD65ToLabD50(xyz65) {
  const [X, Y, Z] = mul3(BRADFORD_D65_D50, xyz65);
  const fx = fLab(X / PCS_D50[0]), fy = fLab(Y / PCS_D50[1]), fz = fLab(Z / PCS_D50[2]);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** CIELAB(D50, native PCS) → XYZ(D65): Bradford D50→D65. */
export function labD50ToXYZd65(L, a, b) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const xyz50 = [fLabInv(fx) * PCS_D50[0], fLabInv(fy) * PCS_D50[1], fLabInv(fz) * PCS_D50[2]];
  return mul3(BRADFORD_D50_D65, xyz50);
}

// ── Press conditions ─────────────────────────────────────────────────
// Black-point compensation for every transform (forward build and proof). The
// gamut tables are built with the same setting and record it; cmyk.js refuses a
// table built the other way.
export const USE_BPC = true;

// Total-ink (TAC) limits of the bundled press conditions. No build may exceed
// them. (GRACoL 2006 = 320%; SWOP 2006 = 300%; FOGRA39L VIGC = 300%, per its
// filename.)
export const PROFILE_TAC = { gracol: 320, swop: 300, fogra39: 300 };

// A recipe "matches" when its proof is within EXACT_DE of the target (CIEDE2000;
// the solver stops there). A colour is "printable" — inside the gamut table —
// when the solver can get within GAMUT_DE of it.
export const EXACT_DE = 0.1;
export const GAMUT_DE = 0.5;

// ── The exact-match ink solver ───────────────────────────────────────
//
// The profile's own separation (its BToA table) is a fine first guess, but its
// black-generation policy misses some printable colours outright (K-heavy dark
// browns and olives: #392E1A on GRACoL — the table's 70-73-94-56 proofs at
// ΔE00 1.55, while 9-41-94-91 prints at 0.17). So the solver starts from the
// profile's recipe and, if that misses, solves for one that matches:
//
//   projected Levenberg–Marquardt on all four inks, minimising the proof's Lab
//   error, inside the box 0–100% and under the TAC. An ink pinned at a limit
//   (with the gradient pushing past it) drops out of the step. Seeds: the
//   profile's recipe at its own K, then at K moved ±25, K=100, K+50, K=0 — so
//   the answer stays as close to the profile's black generation as it can.
//
// Three equations (L, a, b), four unknowns: printable colours have a whole
// family of exact recipes; starting at the profile's recipe picks the nearby one.

/**
 * Make a solver over one profile. `fwd` is CIELAB(D50) → CMYK and `rev` is CMYK
 * → CIELAB(D50), both float, relative colorimetric, BPC per USE_BPC. Builds are
 * {C, M, Y, K} in percent (floats).
 */
export function makeInkSolver(CE, fwd, rev, tac) {
  const proof = c => rev.transform(CE.color.CMYKf(c.C / 100, c.M / 100, c.Y / 100, c.K / 100));
  const proofArr = x => rev.transform(CE.color.CMYKf(x[0] / 100, x[1] / 100, x[2] / 100, x[3] / 100));
  const dE = (lab, x) => CE.color.deltaE2000(lab, proofArr(x));

  /** The profile's own recipe for a colour (its BToA separation, clipping
   *  anything out of gamut the profile's colorimetric way). */
  function clip(lab) {
    const f = fwd.transform(CE.color.Lab(lab.L, lab.a, lab.b));
    return { C: f.Cf * 100, M: f.Mf * 100, Y: f.Yf * 100, K: f.Kf * 100 };
  }

  // Euclidean-ish projection onto [0,100]^4 ∩ {sum ≤ tac}: clamp, then spread
  // any excess over the inks still above zero, and repeat.
  function project(x) {
    for (let it = 0; it < 6; it++) {
      for (let i = 0; i < 4; i++) x[i] = Math.min(100, Math.max(0, x[i]));
      const sum = x[0] + x[1] + x[2] + x[3];
      if (sum <= tac + 1e-9) break;
      let n = 0; for (let i = 0; i < 4; i++) if (x[i] > 0) n++;
      const d = (sum - tac) / n;
      for (let i = 0; i < 4; i++) if (x[i] > 0) x[i] -= d;
    }
    return x;
  }

  // Solve the n×n system A·x = b in place (Gaussian elimination, partial pivot).
  function solveLinear(A, b) {
    const n = b.length;
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
      if (Math.abs(A[c][c]) < 1e-12) return null;
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = A[r][c] / A[c][c];
        for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
        b[r] -= f * b[c];
      }
    }
    return b.map((v, i) => v / A[i][i]);
  }

  // Levenberg–Marquardt from x0 (array [C,M,Y,K]); returns the best recipe found.
  function descend(lab, x0) {
    const res = x => { const q = proofArr(x); return [q.L - lab.L, q.a - lab.a, q.b - lab.b]; };
    let x = project([...x0]), r = res(x), e = r[0] * r[0] + r[1] * r[1] + r[2] * r[2], mu = 1e-3;
    for (let it = 0; it < 25 && e > 1e-4; it++) {
      // Jacobian by forward differences (stepping inward at the 100% limit).
      const J = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
      for (let i = 0; i < 4; i++) {
        const h = x[i] > 99 ? -0.5 : 0.5, xd = [...x]; xd[i] += h;
        const rd = res(xd);
        for (let k = 0; k < 3; k++) J[k][i] = (rd[k] - r[k]) / h;
      }
      const g = [0, 1, 2, 3].map(i => J[0][i] * r[0] + J[1][i] * r[1] + J[2][i] * r[2]);
      const free = [0, 1, 2, 3].filter(i => !((x[i] <= 1e-9 && g[i] > 0) || (x[i] >= 100 - 1e-9 && g[i] < 0)));
      if (!free.length) break;
      let accepted = false;
      for (let tries = 0; tries < 8 && !accepted; tries++) {
        const A = free.map(i => free.map(j => J[0][i] * J[0][j] + J[1][i] * J[1][j] + J[2][i] * J[2][j]));
        for (let a = 0; a < free.length; a++) A[a][a] += mu * (1 + A[a][a]);
        const step = solveLinear(A, free.map(i => -g[i]));
        if (!step) { mu *= 6; continue; }
        const xn = [...x]; free.forEach((i, a) => { xn[i] += step[a]; });
        project(xn);
        const rn = res(xn), en = rn[0] * rn[0] + rn[1] * rn[1] + rn[2] * rn[2];
        if (en < e) { x = xn; r = rn; e = en; mu = Math.max(1e-7, mu / 4); accepted = true; }
        else mu *= 6;
      }
      if (!accepted) break;
    }
    return x;
  }

  /** The closest recipe the solver finds for a CIELAB(D50) target, starting
   *  from the profile's own: { c: {C,M,Y,K}, de: ΔE00 of its proof }. */
  function solve(lab) {
    const p = clip(lab), start = [p.C, p.M, p.Y, p.K];
    let best = start, bestE = dE(lab, start);
    if (bestE > EXACT_DE) {
      const K0 = p.K, seen = new Set();
      for (const K of [K0, K0 + 25, K0 - 25, 100, K0 + 50, 0]) {
        const k = Math.round(Math.min(100, Math.max(0, K)));
        if (seen.has(k)) continue;
        seen.add(k);
        const x = descend(lab, [p.C, p.M, p.Y, K === K0 ? K0 : k]), d = dE(lab, x);
        if (d < bestE) { best = x; bestE = d; }
        if (bestE <= EXACT_DE) break;
      }
    }
    return { c: { C: best[0], M: best[1], Y: best[2], K: best[3] }, de: bestE };
  }

  return { proof, clip, solve };
}

// ── Gamut tables ─────────────────────────────────────────────────────
//
// A profile's printable gamut, precomputed by tools/gamut-tables.html into
// lib/gamut/<profile>.f32: for each (OKLab hue, OKHSL lightness) node, the most
// OKLab chroma the solver can print within GAMUT_DE (with BPC, per USE_BPC). Chroma (not OKHSL s) so one
// table serves both gamut modes and survives any retuning of the wheel's OKHSL.
// A node where not even the neutral prints holds a negative value, so
// everything there reads as out of gamut (with BPC this is at most the very
// last sliver above black, where the ink limit stops just short of the
// profile's own black).
//
// File format: little-endian Float32Array —
//   [MAGIC, H, LN, TAC, GAMUT_DE, BPC (1/0), ...H×LN chroma values, row-major
//    by lightness]
// Node (i, j) is hue i/H (turns) and OKHSL lightness j/(LN−1).
export const TABLE_MAGIC = 0x434d594b;   // "CMYK" as a number — catches a wrong file
export const NO_PRINT = -0.02;           // chroma marker: nothing prints here

/** Parse a gamut-table file; throws if it isn't one. */
export function parseGamutTable(buf) {
  const f = new Float32Array(buf);
  if (f.length < 6 || f[0] !== Math.fround(TABLE_MAGIC)) throw new Error("not a gamut table");
  const H = f[1], LN = f[2];
  if (f.length !== 6 + H * LN) throw new Error("gamut table has the wrong size — rebuild it");
  return { H, LN, tac: f[3], tol: f[4], bpc: f[5] === 1, data: f.subarray(6) };
}

/** Pack a table for writing (the generator's side of parseGamutTable). */
export function packGamutTable(H, LN, tac, data) {
  const f = new Float32Array(6 + H * LN);
  f.set([TABLE_MAGIC, H, LN, tac, GAMUT_DE, USE_BPC ? 1 : 0]);
  f.set(data, 6);
  return f.buffer;
}

/** Max printable OKLab chroma at hue `h` (turns, wraps) and OKHSL lightness
 *  `lr` (clamped): bilinear between the four surrounding nodes. */
export function tableChroma(t, h, lr) {
  const { H, LN, data } = t;
  const hf = (((h % 1) + 1) % 1) * H;
  const lf = Math.max(0, Math.min(1, lr)) * (LN - 1);
  const h0 = Math.floor(hf) % H, h1 = (h0 + 1) % H, ht = hf - Math.floor(hf);
  const l0 = Math.min(LN - 2, Math.floor(lf)), lt = lf - l0;
  const a = data[l0 * H + h0] * (1 - ht) + data[l0 * H + h1] * ht;
  const b = data[(l0 + 1) * H + h0] * (1 - ht) + data[(l0 + 1) * H + h1] * ht;
  return a * (1 - lt) + b * lt;
}
