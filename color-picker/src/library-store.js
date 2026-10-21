// ══════════════════════════════════════════════════════════════════════
// Imported libraries — the stored form, persistence, export
// ══════════════════════════════════════════════════════════════════════
// No DOM. A library is kept stripped down to what the picker needs: each
// swatch's name and its ORIGINAL values (so changing the input-space dropdown
// later recomputes colors exactly), plus the library's settings and an optional
// CMYK add-on. The imported file itself is not kept.
//
//   { id, name, active, format, fileName, importedAt,
//     family: 'rgb' | 'lab' | 'mixed',  space: a SPACES key or 'mixed',
//     swatches: [{ n: name, m: 'rgb' | 'lab', v: [x, y, z] }],
//     cmyk: null | { name, fileName, importedAt, map: { normalizedName: [c, m, y, k] } } }
//
// Libraries live in this browser's IndexedDB (one record, in list order), so
// clearing site data removes them — hence "Export all libraries".

import { detectSpace, normalizeName, EXPORT_TYPE } from "./library-formats.js";

const DB = "color-picker", STORE = "kv", KEY = "libraries";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** The saved libraries, in list order ([] when none or storage is unavailable). */
export async function loadLibraries() {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn("Libraries could not be loaded:", e);
    return [];
  }
}

/** Save the whole list (writes are coalesced to one per task). */
let pending = null;
export function saveLibraries(list) {
  pending = list;
  queueMicrotask(async () => {
    if (!pending) return;
    const value = pending;
    pending = null;
    try {
      const db = await openDB();
      db.transaction(STORE, "readwrite").objectStore(STORE).put(value, KEY);
    } catch (e) {
      console.warn("Libraries could not be saved:", e);
    }
  });
}

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

/** A stored library from a parsed color file (see library-formats.js). Colors
 *  that also carry CMYK (e.g. the old bundled table) become its own add-on. */
export function libraryFromParsed(parsed, fileName) {
  const det = detectSpace(parsed);
  const colors = parsed.swatches.filter(s => s.model !== "cmyk");
  const importedAt = Date.now();
  const map = {};
  for (const s of colors) if (s.cmyk) map[normalizeName(s.name)] = s.cmyk.map(Number);
  return {
    id: newId(),
    name: parsed.name,
    active: true,
    format: parsed.format,
    fileName,
    importedAt,
    family: det.family,
    space: det.space,
    swatches: colors.map(s => ({ n: s.name, m: s.model, v: s.values.map(Number) })),
    cmyk: Object.keys(map).length ? { name: parsed.name, fileName, importedAt, map } : null,
  };
}

/** Attach an ink-only (CMYK) file to the library it belongs with: any library
 *  sharing at least one swatch name, the most recently imported if several.
 *  Replaces that library's previous add-on. Returns the library, or null when
 *  nothing matches (the caller ignores the file). */
export function attachCMYK(libraries, parsed, fileName) {
  const map = {};
  for (const s of parsed.swatches) if (s.model === "cmyk") map[normalizeName(s.name)] = s.values.map(Number);
  let best = null;
  for (const lib of libraries) {
    if (!lib.swatches.some(s => map[normalizeName(s.n)])) continue;
    if (!best || lib.importedAt > best.importedAt) best = lib;
  }
  if (best) best.cmyk = { name: parsed.name, fileName, importedAt: Date.now(), map };
  return best;
}

/** The "Export all libraries" file. */
export function exportFile(libraries) {
  return { type: EXPORT_TYPE, version: 1, exportedAt: new Date().toISOString(), libraries };
}

/** Libraries from an export file, with fresh ids so a re-import never collides
 *  with what's already here. */
export function librariesFromExport(data) {
  if (!data || data.type !== EXPORT_TYPE || !Array.isArray(data.libraries)) return [];
  return data.libraries
    .filter(l => l && Array.isArray(l.swatches))
    .map(l => ({ ...l, id: newId(), active: l.active !== false, cmyk: l.cmyk || null }));
}
