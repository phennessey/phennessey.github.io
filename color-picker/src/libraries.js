// ══════════════════════════════════════════════════════════════════════
// Libraries panel — imported color libraries
// ══════════════════════════════════════════════════════════════════════
// The list of imported libraries (one row each: grab handle, on/off, name,
// input space, remove), the + button (the only way to import: it
// opens the file chooser, several files at once), and "Export all". Parsing lives in library-formats.js and storage in
// library-store.js; this module keeps the list, saves it, and hands the colors
// to pantone.js (matches, dots, promotion).
//
// CMYK-only files (e.g. Pantone Color Bridge) are never libraries of their
// own: they attach to the library they share names with, which gets a [CMYK]
// pill (its × removes just the add-on). One with no match is ignored. A
// promoted color with an alternate gets a "LIBRARY" checkbox in its swatch's CMYK
// region (see cmyk.js).

import { parseLibraryFile, detectSpace, swatchToOKLab, SPACES, spacesForFamily, normalizeName, isMetallicLibraryName, ACCEPT } from "./library-formats.js";
import { loadLibraries, saveLibraries, libraryFromParsed, attachCMYK, exportFile, librariesFromExport } from "./library-store.js";
import { setLibraryEntries, setActiveLibraries } from "./pantone.js";
import { CLOSE_ICON_SVG } from "./constants.js";

let libraries = [];

const list = document.getElementById("lib-list");
const emptyNote = document.getElementById("lib-empty");
const addBtn = document.getElementById("lib-add");
const exportBtn = document.getElementById("lib-export");
const fileInput = document.getElementById("lib-file");

const GRIP_SVG = `<svg viewBox="0 0 6 10" fill="currentColor" aria-hidden="true"><circle cx="1.2" cy="1.2" r="1.2"/><circle cx="4.8" cy="1.2" r="1.2"/><circle cx="1.2" cy="5" r="1.2"/><circle cx="4.8" cy="5" r="1.2"/><circle cx="1.2" cy="8.8" r="1.2"/><circle cx="4.8" cy="8.8" r="1.2"/></svg>`;

// ── State → matches ──────────────────────────────────────────────────

const activeIds = () => libraries.filter(l => l.active).map(l => l.id);

/** Every library's colors in the form pantone.js matches against. A color's
 *  key is its library id plus its position, stable for the library's life. */
function buildEntries() {
  const out = [], ok = [0, 0, 0];
  for (const lib of libraries) {
    const metallic = isMetallicLibraryName(lib.name);   // renaming changes it (see library-formats.js)
    lib.swatches.forEach((sw, i) => {
      swatchToOKLab({ model: sw.m, values: sw.v }, lib.space, ok);
      if (!ok.every(Number.isFinite)) return;
      out.push({
        key: `${lib.id}:${i}`, libId: lib.id, libName: lib.name, name: sw.n,
        L: ok[0], a: ok[1], b: ok[2], metallic,
        cbCMYK: (lib.cmyk && lib.cmyk.map[normalizeName(sw.n)]) || null,
      });
    });
  }
  return out;
}

const publish = () => setLibraryEntries(buildEntries(), activeIds());
const publishActive = () => setActiveLibraries(activeIds());
const persist = () => saveLibraries(libraries);

/** Switch libraries on (undo restoring a promotion from one that's off). */
export function activateLibraries(ids) {
  let changed = false;
  for (const lib of libraries) if (ids.has(lib.id) && !lib.active) { lib.active = true; changed = true; }
  if (!changed) return;
  persist();
  render();
  publishActive();
}

/** Load the saved libraries and show them (called once at startup). */
export async function initLibraries() {
  libraries = await loadLibraries();
  render();
  publish();
}

// ── Rows ─────────────────────────────────────────────────────────────

function el(tag, cls, attrs = {}) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "html") n.innerHTML = v;
    else if (k === "text") n.textContent = v;
    else n.setAttribute(k, v);
  }
  return n;
}

function rowFor(lib) {
  const row = el("div", "lib-row");
  row.dataset.id = lib.id;

  row.appendChild(el("span", "lib-grab", { html: GRIP_SVG, title: "Drag to reorder" }));

  const on = el("input", "lib-on", { type: "checkbox", "aria-label": `Use ${lib.name}` });
  on.checked = !!lib.active;
  row.appendChild(on);

  const nameWrap = el("span", "lib-name-wrap");
  const name = el("input", "lib-name", {
    type: "text", spellcheck: "false", autocomplete: "off", "aria-label": "Library name",
    title: `${lib.swatches.length} colors · ${lib.format}${lib.fileName ? " · " + lib.fileName : ""}`,
  });
  name.value = lib.name;
  nameWrap.appendChild(name);
  if (lib.cmyk) {
    const pill = el("span", "lib-cmyk", { title: `CMYK add-on: ${lib.cmyk.name}` });
    pill.appendChild(el("span", "lib-cmyk-text", { text: "CMYK" }));
    pill.appendChild(el("span", "lib-cmyk-x", { html: CLOSE_ICON_SVG, title: "Remove the CMYK add-on", role: "button" }));
    nameWrap.appendChild(pill);
  }
  row.appendChild(nameWrap);

  const space = el("select", "lib-space", { "aria-label": "Input color space" });
  if (lib.space === "mixed") {
    space.appendChild(el("option", null, { value: "mixed", text: "Mixed" }));
    space.disabled = true;
    space.title = "This file uses several color spaces; each color keeps its own";
  } else {
    for (const key of spacesForFamily(lib.family)) {
      const o = el("option", null, { value: key, text: SPACES[key].label });
      if (key === lib.space) o.selected = true;
      space.appendChild(o);
    }
  }
  row.appendChild(space);


  row.appendChild(el("span", "lib-del", { html: CLOSE_ICON_SVG, title: "Remove library", role: "button" }));
  return row;
}

function render() {
  list.replaceChildren(...libraries.map(rowFor));
  emptyNote.hidden = libraries.length > 0;
  exportBtn.disabled = libraries.length === 0;
}

const libOf = node => libraries.find(l => l.id === node.closest(".lib-row")?.dataset.id);

list.addEventListener("change", ev => {
  const lib = libOf(ev.target);
  if (!lib) return;
  const t = ev.target;
  if (t.classList.contains("lib-on")) { lib.active = t.checked; persist(); publishActive(); return; }
  if (t.classList.contains("lib-name")) {
    const v = t.value.trim();
    if (!v) { t.value = lib.name; return; }
    lib.name = v; persist(); publish(); return;
  }
  if (t.classList.contains("lib-space")) { lib.space = t.value; persist(); publish(); }
});

// Enter commits a name edit; Escape restores it.
list.addEventListener("keydown", ev => {
  if (!ev.target.classList.contains("lib-name")) return;
  if (ev.key === "Enter") ev.target.blur();
  else if (ev.key === "Escape") { const lib = libOf(ev.target); if (lib) ev.target.value = lib.name; ev.target.blur(); }
});

list.addEventListener("click", ev => {
  const lib = libOf(ev.target);
  if (!lib) return;
  if (ev.target.closest(".lib-cmyk-x")) {
    lib.cmyk = null;
    persist(); render(); publish();
    return;
  }
  if (ev.target.closest(".lib-del")) {
    if (!confirm(`Remove “${lib.name}”? Export your libraries first if you may want it back.`)) return;
    libraries = libraries.filter(l => l !== lib);
    persist(); render(); publish();
  }
});

// Reorder by dragging a row's grab handle. Order is only for organizing the
// list — it never affects matching or the order of match chips.
list.addEventListener("pointerdown", ev => {
  const grab = ev.target.closest(".lib-grab");
  if (!grab) return;
  ev.preventDefault();
  const row = grab.closest(".lib-row");
  row.classList.add("dragging");
  // Listen on the window, not the handle: moving the row in the DOM releases
  // pointer capture, so the handle would never hear the pointerup.
  const move = e => {
    let before = null;
    for (const r of list.children) {
      if (r === row) continue;
      const rect = r.getBoundingClientRect();
      if (e.clientY < rect.top + rect.height / 2) { before = r; break; }
    }
    if (row.nextSibling !== before) list.insertBefore(row, before);
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
    row.classList.remove("dragging");
    const order = [...list.children].map(r => r.dataset.id);
    libraries.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    persist();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
});

// ── Import ───────────────────────────────────────────────────────────

/** Import any number of files at once. Color files become libraries first, so
 *  a CMYK file chosen together with its library finds it. A file that can't be
 *  read, or a CMYK file with no matching library, is skipped (noted in the
 *  console only — there is no import readout, by design). */
async function importFiles(files) {
  const addons = [];
  for (const file of files) {
    try {
      const parsed = parseLibraryFile(file.name, await file.arrayBuffer());
      if (parsed.exportFile) { libraries.push(...librariesFromExport(parsed.exportFile)); continue; }
      if (!parsed.swatches.length) { console.warn(`${file.name}: no colors found`); continue; }
      if (detectSpace(parsed).kind === "cmyk") { addons.push({ parsed, fileName: file.name }); continue; }
      libraries.push(libraryFromParsed(parsed, file.name));
    } catch (e) {
      console.warn(`${file.name} couldn't be read:`, e.message);
    }
  }
  for (const { parsed, fileName } of addons) attachCMYK(libraries, parsed, fileName);
  persist();
  render();
  publish();
}

fileInput.accept = ACCEPT;
addBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  if (fileInput.files.length) importFiles([...fileInput.files]);
  fileInput.value = "";
});

// ── Export ───────────────────────────────────────────────────────────

exportBtn.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(exportFile(libraries))], { type: "application/json" });
  const a = el("a", null, { href: URL.createObjectURL(blob), download: "color-libraries.json" });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
