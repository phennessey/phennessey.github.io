// ══════════════════════════════════════════════════════════════════════
// Color library files — parsing, color-space detection, conversion
// ══════════════════════════════════════════════════════════════════════
// Pure functions: no DOM, no app state. They turn an imported file into a
// plain library description, so they can move to a Figma plugin unchanged.
//
// Every parser returns { name, format, swatches, labSpace? } where each swatch
// is { name, model, values, cmyk? }:
//   model  'rgb'  values [r, g, b] gamma-encoded 0–1
//          'lab'  values [L, a, b] as the file states them (CIELAB 0–100 or
//                 OKLab 0–1 — which one is decided by detectSpace)
//          'cmyk' values [c, m, y, k] in percent (an ink-only swatch)
//   cmyk   optional [c, m, y, k] in percent riding along with a color (a file
//          that carries both, like the old bundled Pantone table)
// `labSpace` is set when the format itself fixes the Lab flavor: Adobe's
// ASE / ACB / ACO Lab is ICC CIELAB with a D50 white.

import { convert, OKLab, XYZ, sRGB, DisplayP3 } from "./color.js";
import { labD50ToXYZd65 } from "./cmyk-ink.js";

// ── Spaces ───────────────────────────────────────────────────────────
// What a library's numbers mean. RGB data can be read as sRGB or Display P3;
// Lab data as CIELAB (D50 or D65 white) or OKLab. 'mixed' is an ASE whose
// swatches use different models: each keeps its own (RGB as sRGB, Lab as D50).
export const SPACES = {
  srgb:     { label: "sRGB",        family: "rgb" },
  p3:       { label: "Display P3",  family: "rgb" },
  "lab-d50": { label: "CIELAB D50", family: "lab" },
  "lab-d65": { label: "CIELAB D65", family: "lab" },
  oklab:    { label: "OKLab",       family: "lab" },
};
export const spacesForFamily = family => Object.keys(SPACES).filter(k => SPACES[k].family === family);

// ── Binary reading ───────────────────────────────────────────────────
function reader(buf) {
  const dv = new DataView(buf);
  let pos = 0;
  const need = n => { if (pos + n > dv.byteLength) throw new Error("file ends early"); };
  return {
    get pos() { return pos; },
    set pos(p) { pos = p; },
    get left() { return dv.byteLength - pos; },
    u8() { need(1); return dv.getUint8(pos++); },
    u16() { need(2); const v = dv.getUint16(pos); pos += 2; return v; },
    i16() { need(2); const v = dv.getInt16(pos); pos += 2; return v; },
    u32() { need(4); const v = dv.getUint32(pos); pos += 4; return v; },
    f32() { need(4); const v = dv.getFloat32(pos); pos += 4; return v; },
    ascii(n) { need(n); let s = ""; for (let i = 0; i < n; i++) s += String.fromCharCode(dv.getUint8(pos++)); return s; },
    utf16(n) {   // n UTF-16 code units, big-endian; a trailing NUL is dropped
      need(2 * n);
      let s = "";
      for (let i = 0; i < n; i++) s += String.fromCharCode(dv.getUint16(pos + 2 * i));
      pos += 2 * n;
      return s.replace(/\0+$/, "");
    },
  };
}

// ── ASE: Adobe Swatch Exchange ───────────────────────────────────────
// "ASEF", version (2 × u16), block count (u32), then blocks: u16 type, u32
// length. 0xC001 opens a group (its name), 0xC002 closes one, 0x0001 is a
// color: u16 name length (UTF-16 units incl. NUL), name, 4-char model, floats,
// u16 type (global / spot / process). Lab is L 0–1 (×100) with a, b as is.
function parseASE(buf, fileName) {
  const r = reader(buf);
  if (r.ascii(4) !== "ASEF") throw new Error("not an ASE file");
  r.u16(); r.u16();
  const blocks = r.u32();
  const swatches = [], groups = [];
  for (let i = 0; i < blocks && r.left >= 6; i++) {
    const type = r.u16(), len = r.u32(), end = r.pos + len;
    if (type === 0xc001 && len >= 2) {
      const name = adobeText(r.utf16(r.u16())).trim();
      if (name) groups.push(name);
    } else if (type === 0x0001) {
      const name = adobeText(r.utf16(r.u16())).trim();
      const model = r.ascii(4).trim().toUpperCase();
      if (model === "RGB") swatches.push({ name, model: "rgb", values: [r.f32(), r.f32(), r.f32()] });
      else if (model === "LAB") { const L = r.f32(), a = r.f32(), b = r.f32(); swatches.push({ name, model: "lab", values: [L * 100, a, b] }); }
      else if (model === "CMYK") swatches.push({ name, model: "cmyk", values: [r.f32() * 100, r.f32() * 100, r.f32() * 100, r.f32() * 100] });
      else if (model === "GRAY") { const g = r.f32(); swatches.push({ name, model: "rgb", values: [g, g, g] }); }
    }
    r.pos = end;
  }
  // One group names the library (Pantone's ASE exports); several are sections.
  return { name: groups.length === 1 ? groups[0] : baseName(fileName), format: "ASE", swatches, labSpace: "lab-d50" };
}

// ── ACB: Adobe Color Book ────────────────────────────────────────────
// "8BCB", version, book id, then four strings (u32 length + UTF-16): title,
// name prefix, name suffix, description. Then color count, page size, page
// selector offset, color space (0 RGB, 2 CMYK, 7 Lab), and per color: name
// string, 6-char code, components as bytes. Lab bytes: L·2.55, a+128, b+128.
// CMYK bytes are inverted (255 = no ink). Localized strings look like
// "$$$/colorbook/…=Value"; the value follows the "=" (Adobe's ASE and ACO
// presets use the same localization keys).
function adobeText(s) {
  let v = s.replace(/^"(.*)"$/, "$1");
  if (v.startsWith("$$$")) v = v.slice(v.indexOf("=") + 1);
  return v.replace(/\^R/g, "®").replace(/\^C/g, "©");
}
function parseACB(buf, fileName) {
  const r = reader(buf);
  if (r.ascii(4) !== "8BCB") throw new Error("not an ACB file");
  r.u16(); r.u16();
  const str = () => adobeText(r.utf16(r.u32()));
  const title = str(), prefix = str(), suffix = str();
  str();   // description
  const count = r.u16();
  r.u16(); r.u16();
  const space = r.u16();
  const channels = space === 2 ? 4 : space === 8 ? 1 : 3;
  const swatches = [];
  for (let i = 0; i < count; i++) {
    const raw = str().trim(), code = r.ascii(6).trim();
    const b = []; for (let k = 0; k < channels; k++) b.push(r.u8());
    if (!raw && !code) continue;   // page fillers
    const name = (prefix + (raw || code) + suffix).replace(/\s+/g, " ").trim();
    if (space === 7) swatches.push({ name, model: "lab", values: [b[0] / 2.55, b[1] - 128, b[2] - 128] });
    else if (space === 2) swatches.push({ name, model: "cmyk", values: b.map(v => (255 - v) / 2.55) });
    else if (space === 0) swatches.push({ name, model: "rgb", values: b.map(v => v / 255) });
    else if (space === 8) swatches.push({ name, model: "rgb", values: [b[0] / 255, b[0] / 255, b[0] / 255] });
  }
  return { name: title.replace(/\s+/g, " ").trim() || baseName(fileName), format: "ACB", swatches, labSpace: "lab-d50" };
}

// ── ACO: Photoshop swatches ──────────────────────────────────────────
// Version 1 (no names), usually followed by version 2 (with names): u16
// version, u16 count, then per color u16 space + four u16 values (+ in v2 a u32
// length and UTF-16 name). Spaces: 0 RGB, 1 HSB, 2 CMYK (inverted: 65535 = no
// ink), 7 Lab (L 0–10000, a and b signed ×100), 8 gray (0–10000, 10000 = black).
function parseACO(buf, fileName) {
  const r = reader(buf);
  let swatches = [];
  for (let pass = 0; pass < 2 && r.left >= 4; pass++) {
    const version = r.u16(), count = r.u16();
    if (version !== 1 && version !== 2) throw new Error("not an ACO file");
    const list = [];
    for (let i = 0; i < count; i++) {
      const space = r.u16(), w = r.u16(), x = r.u16(), y = r.u16(), z = r.u16();
      const name = version === 2 ? adobeText(r.utf16(r.u32())).trim() : `Color ${i + 1}`;
      const s16 = v => (v > 32767 ? v - 65536 : v);
      if (space === 0) list.push({ name, model: "rgb", values: [w / 65535, x / 65535, y / 65535] });
      else if (space === 1) list.push({ name, model: "rgb", values: hsbToRgb(w / 65535 * 360, x / 65535, y / 65535) });
      else if (space === 2) list.push({ name, model: "cmyk", values: [w, x, y, z].map(v => (65535 - v) / 655.35) });
      else if (space === 7) list.push({ name, model: "lab", values: [w / 100, s16(x) / 100, s16(y) / 100] });
      else if (space === 8) { const g = 1 - w / 10000; list.push({ name, model: "rgb", values: [g, g, g] }); }
    }
    swatches = list;   // version 2, when present, replaces version 1 (same colors, plus names)
    if (version === 2) break;
  }
  return { name: baseName(fileName), format: "ACO", swatches, labSpace: "lab-d50" };
}
function hsbToRgb(h, s, v) {
  const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return [f(5), f(3), f(1)];
}

// ── GPL: GIMP / Inkscape palette ─────────────────────────────────────
// "GIMP Palette", optional "Name:" and "Columns:" lines, "#" comments, then
// "R G B name" per line (0–255).
function parseGPL(text, fileName) {
  const lines = text.split(/\r?\n/);
  if (!/^GIMP Palette/i.test(lines[0] || "")) throw new Error("not a GIMP palette");
  let name = baseName(fileName);
  const swatches = [];
  for (const line of lines.slice(1)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = t.match(/^Name:\s*(.+)$/i);
    if (m) { name = m[1].trim(); continue; }
    if (/^Columns:/i.test(t)) continue;
    const c = t.match(/^(\d+)\s+(\d+)\s+(\d+)\s*(.*)$/);
    if (c) swatches.push({ name: c[4].trim() || `#${[c[1], c[2], c[3]].map(v => (+v).toString(16).padStart(2, "0")).join("").toUpperCase()}`, model: "rgb", values: [c[1] / 255, c[2] / 255, c[3] / 255] });
  }
  return { name, format: "GPL", swatches };
}

// ── CSV / TSV ────────────────────────────────────────────────────────
// A header row names the columns: name, hex, r/g/b (red/green/blue), l/a/b,
// oklab_l…, c/m/y/k (cyan/…). Without a header, each row is a name followed by
// cells: a #hex, numbers, or bracketed arrays like [0.86,-0.004,0.1] (three
// numbers = a color, four = CMYK) — which also reads the old bundled table.
function splitRows(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  // The delimiter is whichever of tab, semicolon, comma appears most in the
  // first line OUTSIDE brackets and quotes ("[0.86,-0.004,0.1]" is one cell).
  const bare = (lines[0] || "").replace(/"[^"]*"|\[[^\]]*\]/g, "");
  const delim = ["\t", ";", ","].map(d => [d, bare.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const cells = line => {
    const out = []; let cur = "", q = false, depth = 0;
    for (const ch of line) {
      if (ch === '"') { q = !q; continue; }
      if (!q && ch === "[") depth++;
      if (!q && ch === "]") depth--;
      if (!q && depth === 0 && ch === delim) { out.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  return lines.map(cells);
}
const num = s => { const v = parseFloat(s); return Number.isFinite(v) ? v : null; };
const hexRGB = s => {
  const m = String(s).trim().match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/./g, c => c + c) : m[1];
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
};
function parseCSV(text, fileName) {
  const rows = splitRows(text);
  if (!rows.length) throw new Error("empty file");
  // Header cells must BE column names ("Name", "L*", "oklab_l"); a first data
  // row like "6001 C" must not read as a "c" (cyan) header.
  const head = rows[0].map(h => h.toLowerCase().trim().replace(/[*\s-]+/g, "_").replace(/^_+|_+$/g, ""));
  const col = (...names) => head.findIndex(h => names.includes(h));
  const iName = col("name", "title", "label", "color", "colorname", "swatch");
  const iHex = col("hex", "hexcode", "html", "web");
  const iR = col("r", "red"), iG = col("g", "green"), iB = col("b", "blue");
  const iOL = col("oklab_l", "okl", "ok_l"), iOA = col("oklab_a", "oka", "ok_a"), iOB = col("oklab_b", "okb", "ok_b");
  const iL = col("l", "lab_l", "lstar"), iA = col("a", "lab_a", "astar"), iBb = col("lab_b", "bstar");
  const iC = col("c", "cyan"), iM = col("m", "magenta"), iY = col("y", "yellow"), iK = col("k", "black", "key");
  const hasHeader = iName >= 0 || iHex >= 0 || (iR >= 0 && iG >= 0) || iL >= 0 || iOL >= 0 || iC >= 0;
  const swatches = [];
  let labSpace = null;
  if (hasHeader) {
    // A "b" column is blue next to r/g, or Lab b next to l/a.
    const labB = iBb >= 0 ? iBb : (iL >= 0 && iR < 0 ? col("b") : -1);
    if (iOL >= 0) labSpace = "oklab";
    rows.slice(1).forEach((row, i) => {
      const name = (iName >= 0 ? row[iName] : "") || `Color ${i + 1}`;
      const s = { name };
      const n3 = (a, b, c) => [num(row[a]), num(row[b]), num(row[c])];
      const ok = v => v.every(x => x !== null);
      let v;
      if (iOL >= 0 && ok(v = n3(iOL, iOA, iOB))) { s.model = "lab"; s.values = v; }
      else if (iL >= 0 && labB >= 0 && ok(v = n3(iL, iA, labB))) { s.model = "lab"; s.values = v; }
      else if (iHex >= 0 && (v = hexRGB(row[iHex]))) { s.model = "rgb"; s.values = v; s._hex = true; }
      else if (iR >= 0 && iB >= 0 && ok(v = n3(iR, iG, iB))) { s.model = "rgb"; s.values = v; }
      if (iC >= 0 && iK >= 0) { const k = [num(row[iC]), num(row[iM]), num(row[iY]), num(row[iK])]; if (ok(k)) s.cmyk = k; }
      if (s.model) swatches.push(s);
      else if (s.cmyk) swatches.push({ name, model: "cmyk", values: s.cmyk });
    });
    scaleRGB(swatches);
    scaleCMYK(swatches);
  } else {
    for (const row of rows) {
      const s = { name: row[0] };
      for (const cell of row.slice(1)) {
        const arr = cell.startsWith("[") ? (() => { try { return JSON.parse(cell); } catch { return null; } })() : null;
        const hx = hexRGB(cell);
        if (arr && arr.length === 3 && !s.model) { s.model = "lab"; s.values = arr; }
        else if (arr && arr.length === 4) s.cmyk = arr;
        else if (hx && !s.model) { s.model = "rgb"; s.values = hx; }
      }
      if (s.model) swatches.push(s);
      else if (s.cmyk) swatches.push({ name: s.name, model: "cmyk", values: s.cmyk });
    }
    // Bracketed triples carry no unit: lightness ≤ 1 everywhere means OKLab.
    if (swatches.some(s => s.model === "lab") && swatches.every(s => s.model !== "lab" || s.values[0] <= 1.0001)) labSpace = "oklab";
  }
  return { name: baseName(fileName), format: /\.tsv$|\.txt$/i.test(fileName) ? "TSV" : "CSV", swatches, labSpace };
}
// RGB columns are 0–255 unless every value is ≤ 1.
function scaleRGB(swatches) {
  const rgb = swatches.filter(s => s.model === "rgb" && !s._hex);
  if (rgb.some(s => s.values.some(v => v > 1))) for (const s of rgb) s.values = s.values.map(v => v / 255);
}
// CMYK columns are percent unless every value is ≤ 1.
function scaleCMYK(swatches) {
  const all = swatches.flatMap(s => [s.cmyk, s.model === "cmyk" ? s.values : null]).filter(Boolean);
  if (all.length && all.every(k => k.every(v => v <= 1))) for (const s of swatches) {
    if (s.cmyk) s.cmyk = s.cmyk.map(v => v * 100);
    if (s.model === "cmyk") s.values = s.values.map(v => v * 100);
  }
}

// ── JSON ─────────────────────────────────────────────────────────────
// Our own export (see library-store.js) restores whole libraries. Otherwise a
// list of colors — an array, or an object holding one under colors / swatches /
// entries — where each color has a name plus hex, rgb, lab, oklab or cmyk; or a
// plain { name: [three numbers] } map.
export const EXPORT_TYPE = "color-picker-libraries";
function parseJSON(text, fileName) {
  const data = JSON.parse(text);
  if (data && data.type === EXPORT_TYPE) return { exportFile: data };
  let list = Array.isArray(data) ? data : (data && (data.colors || data.swatches || data.entries || data.records)) || null;
  let name = (data && !Array.isArray(data) && data.name) || baseName(fileName);
  const asList = o => Object.entries(o).map(([k, v]) => (Array.isArray(v) ? { name: k, values: v } : { name: k, ...v }));
  if (list && !Array.isArray(list) && typeof list === "object") list = asList(list);   // { name: {…} } records
  else if (!list && data && typeof data === "object") list = asList(data);
  // A file-level space for per-color "components" (e.g. a converted .acb).
  const fileSpace = String((data && !Array.isArray(data) && (data.colorSpace || data.space)) || "").toUpperCase();
  if (!Array.isArray(list)) throw new Error("no colors found");
  const swatches = [];
  let labSpace = null;
  list.forEach((c, i) => {
    if (!c || typeof c !== "object") return;
    const s = { name: String(c.name ?? c.title ?? c.label ?? `Color ${i + 1}`) };
    const arr = v => (Array.isArray(v) ? v.map(Number) : v && typeof v === "object" ? Object.values(v).map(Number) : null);
    if (c.oklab) { s.model = "lab"; s.values = arr(c.oklab); labSpace = "oklab"; }
    else if (c.lab) { s.model = "lab"; s.values = arr(c.lab); }
    else if (c.hex && hexRGB(c.hex)) { s.model = "rgb"; s.values = hexRGB(c.hex); s._hex = true; }
    else if (c.rgb) { s.model = "rgb"; s.values = arr(c.rgb); }
    else if (Array.isArray(c.components) && fileSpace === "CMYK") s.cmyk = c.components.map(Number);
    else if (Array.isArray(c.components) && c.components.length === 3) { s.model = /RGB/.test(fileSpace) ? "rgb" : "lab"; s.values = c.components.map(Number); }
    else if (Array.isArray(c.values) && c.values.length === 3) { s.model = "lab"; s.values = c.values.map(Number); }
    if (c.cmyk) s.cmyk = arr(c.cmyk);
    if (s.model && s.values?.length === 3 && s.values.every(Number.isFinite)) swatches.push(s);
    else if (s.cmyk?.length === 4) swatches.push({ name: s.name, model: "cmyk", values: s.cmyk });
  });
  scaleRGB(swatches);
  scaleCMYK(swatches);
  if (!labSpace && swatches.some(s => s.model === "lab") && swatches.every(s => s.model !== "lab" || s.values[0] <= 1.0001)) labSpace = "oklab";
  return { name, format: "JSON", swatches, labSpace };
}

// ── Entry point ──────────────────────────────────────────────────────
export const ACCEPT = ".ase,.acb,.aco,.gpl,.csv,.tsv,.txt,.json";
const baseName = f => String(f || "Library").replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "");

/** Parse one file (its name and contents) into a library description. */
export function parseLibraryFile(fileName, buf) {
  const head = new TextDecoder("ascii").decode(new Uint8Array(buf, 0, Math.min(4, buf.byteLength)));
  if (head === "ASEF") return parseASE(buf, fileName);
  if (head === "8BCB") return parseACB(buf, fileName);
  if (/\.aco$/i.test(fileName)) return parseACO(buf, fileName);
  const text = new TextDecoder("utf-8").decode(buf).replace(/^﻿/, "");
  if (/^GIMP Palette/i.test(text)) return parseGPL(text, fileName);
  if (/\.json$/i.test(fileName) || /^\s*[[{]/.test(text)) return parseJSON(text, fileName);
  return parseCSV(text, fileName);
}

// ── Detection ────────────────────────────────────────────────────────

/** How a parsed file's colors should be read: { kind: 'colors' | 'cmyk',
 *  family: 'rgb' | 'lab' | 'mixed', space } — 'cmyk' means ink-only (an
 *  add-on for another library). Lab without a stated flavor is OKLab when its
 *  numbers have OKLab's scale (lightness ≤ 1, a and b within ±0.5), else
 *  CIELAB D50 (Adobe's). */
export function detectSpace(parsed) {
  const colors = parsed.swatches.filter(s => s.model !== "cmyk");
  if (!colors.length) return { kind: "cmyk", family: null, space: null };
  const models = new Set(colors.map(s => s.model));
  if (models.size > 1) return { kind: "colors", family: "mixed", space: "mixed" };
  if (models.has("rgb")) return { kind: "colors", family: "rgb", space: "srgb" };
  let space = parsed.labSpace;
  if (!space || space === "lab-d50" && parsed.format !== "ASE" && parsed.format !== "ACB" && parsed.format !== "ACO") {
    const okScale = colors.every(s => s.values[0] <= 1.0001 && Math.abs(s.values[1]) <= 0.5 && Math.abs(s.values[2]) <= 0.5);
    space = okScale ? "oklab" : "lab-d50";
  }
  return { kind: "colors", family: "lab", space };
}

// ── Conversion ───────────────────────────────────────────────────────
const D65 = [0.95047, 1, 1.08883];
const _xyz = [0, 0, 0];
function labD65ToXYZ(L, a, b) {
  const e = 216 / 24389, k = 24389 / 27;
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const inv = f => (f ** 3 > e ? f ** 3 : (116 * f - 16) / k);
  return [inv(fx) * D65[0], inv(fy) * D65[1], inv(fz) * D65[2]];
}

/** A swatch's OKLab, given how its library's numbers are read. */
export function swatchToOKLab(sw, space, out = [0, 0, 0]) {
  const v = sw.values;
  const s = space === "mixed" ? (sw.model === "lab" ? "lab-d50" : "srgb") : space;
  if (s === "oklab") { out[0] = v[0]; out[1] = v[1]; out[2] = v[2]; return out; }
  if (s === "srgb") return convert(v, sRGB, OKLab, out);
  if (s === "p3") return convert(v, DisplayP3, OKLab, out);
  const xyz = s === "lab-d50" ? labD50ToXYZd65(v[0], v[1], v[2]) : labD65ToXYZ(v[0], v[1], v[2]);
  _xyz[0] = xyz[0]; _xyz[1] = xyz[1]; _xyz[2] = xyz[2];
  return convert(_xyz, XYZ, OKLab, out);
}

// ── Metallics ────────────────────────────────────────────────────────
// No format marks metallic inks. Deliberately naive (user decision
// 2026-10-20): a library is metallic when its NAME says "metallic" or
// "metallics" — so renaming a library is how you change it.
export const isMetallicLibraryName = name => /metallics?/i.test(String(name));

// ── Names, for pairing CMYK add-ons ──────────────────────────────────
// "PANTONE 186 CP" (Color Bridge) pairs with "PANTONE 186 C"; case, spacing,
// a leading PANTONE/PMS and trademark marks don't matter.
export function normalizeName(n) {
  return String(n).toUpperCase().replace(/[®™©]/g, " ").replace(/^\s*(PANTONE|PMS)\b/, " ")
    .replace(/\s+/g, " ").trim().replace(/ (C|U)P$/, " $1");
}
