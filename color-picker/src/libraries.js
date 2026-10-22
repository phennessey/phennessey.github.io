// ══════════════════════════════════════════════════════════════════════
// Libraries panel — imported color libraries
// ══════════════════════════════════════════════════════════════════════
// The list of imported libraries and the "Import libraries" button under it
// (the only way to import: it opens the file chooser, several files at once;
// the export feature was removed 2026-10-21, though an old export file still
// imports). Each row is
// an outlined box holding only a check box, the name, the +CMYK badge (when the library has
// a CMYK add-on) and a ▾ that opens the row's menu: Rename, Remove, and "Set
// input space ›" (a submenu). Rows stay in import order (drag-reordering was
// removed, 2026-10-21). Clicking the row itself (not its ▾) enables /
// disables the library, as the old tool's
// library pills did: a disabled row is grayed and its colors drop out of
// matching, dots and chips. Rename makes
// the name editable until Return or a click elsewhere (Escape cancels); Remove
// removes the library at once. A metallic library (by name, see
// isMetallicLibraryName) also gets "Simulate metallic texture", a check item
// that turns the texture on for its colors' chips and promoted fields (off by
// default; it replaced a global checkbox). (User decisions 2026-10-21.) Parsing lives in library-formats.js and storage in
// library-store.js; this module keeps the list, saves it, and hands the colors
// to pantone.js (matches, dots, promotion).
//
// CMYK-only files (e.g. Pantone Color Bridge) are never libraries of their
// own: they attach to the library they share names with, which gets a CMYK
// badge (styled like the swatches' badges; not removable). One with no match
// is ignored; importing another replaces it. A
// promoted color with an alternate gets a "BOOK" checkbox in its swatch's CMYK
// region (see cmyk.js).

import { parseLibraryFile, detectSpace, swatchToOKLab, SPACES, spacesForFamily, normalizeName, isMetallicLibraryName, ACCEPT } from "./library-formats.js";
import { loadLibraries, saveLibraries, libraryFromParsed, attachCMYK, librariesFromExport } from "./library-store.js";
import { setLibraryEntries, setActiveLibraries } from "./pantone.js";

let libraries = [];

const list = document.getElementById("lib-list");
const addBtn = document.getElementById("lib-add");

// At most this many color libraries (user decision 2026-10-21). CMYK add-ons
// (e.g. Color Bridge) ride on a library and don't take a slot. IMPORT is
// disabled while the list is full.
const MAX_LIBRARIES = 5;
// A library's content, for spotting one that's already imported (renaming or
// changing its input space doesn't make it a different library).
const contentOf = lib => JSON.stringify(lib.swatches);
const fileInput = document.getElementById("lib-file");


// ── State → matches ──────────────────────────────────────────────────

const activeIds = () => libraries.filter(l => l.active).map(l => l.id);

/** Every library's colors in the form pantone.js matches against. A color's
 *  key is its library id plus its position, stable for the library's life. */
function buildEntries() {
  const out = [], ok = [0, 0, 0];
  for (const lib of libraries) {
    // Texture only for a metallic library (by name — renaming changes it, see
    // library-formats.js) whose "Simulate metallic texture" is on.
    const metallicTexture = isMetallicLibraryName(lib.name) && !!lib.metallicTexture;
    lib.swatches.forEach((sw, i) => {
      swatchToOKLab({ model: sw.m, values: sw.v }, lib.space, ok);
      if (!ok.every(Number.isFinite)) return;
      out.push({
        key: `${lib.id}:${i}`, libId: lib.id, libName: lib.name, name: sw.n,
        L: ok[0], a: ok[1], b: ok[2], metallicTexture,
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

const MENU_ARROW_SVG = `<svg viewBox="0 0 8 5" aria-hidden="true"><polygon points="0 0 8 0 4 5" fill="currentColor"/></svg>`;

function rowFor(lib) {
  // The row is the enable/disable toggle (click, or Space/Return when focused);
  // the check box before the name shows its state (user decision 2026-10-22).
  const row = el("div", "lib-row" + (lib.active ? "" : " lib-off"), {
    role: "checkbox", tabindex: "0", "aria-checked": String(!!lib.active), "aria-label": lib.name,
    title: `${lib.swatches.length} colors · ${lib.format}${lib.fileName ? " · " + lib.fileName : ""}`,
  });
  row.dataset.id = lib.id;

  row.appendChild(el("span", "lib-check", { "aria-hidden": "true" }));

  // The name reads as plain text; Rename (menu) makes it editable for one edit.
  const name = el("input", "lib-name", {
    type: "text", spellcheck: "false", autocomplete: "off", "aria-label": "Library name",
    tabindex: "-1",
  });
  name.value = lib.name;
  name.readOnly = true;
  row.appendChild(name);

  if (lib.cmyk) row.appendChild(el("span", "lib-cmyk", { text: "+CMYK", title: `CMYK add-on: ${lib.cmyk.name}` }));

  row.appendChild(el("button", "lib-menu-btn", {
    type: "button", html: MENU_ARROW_SVG, title: "Library options",
    "aria-label": `Options for ${lib.name}`, "aria-haspopup": "menu", "aria-expanded": "false",
  }));
  return row;
}

function render() {
  closeMenu();
  list.replaceChildren(...libraries.map(rowFor));
  const full = libraries.length >= MAX_LIBRARIES;
  addBtn.disabled = full;
  addBtn.title = full ? `${MAX_LIBRARIES} libraries is the limit — remove one to import another` : "Import libraries";
}

const libOf = node => libraries.find(l => l.id === node.closest(".lib-row")?.dataset.id);
const rowOf = lib => list.querySelector(`.lib-row[data-id="${CSS.escape(lib.id)}"]`);

// ── Row actions (from the row menu) ──────────────────────────────────

function setActive(lib, on) {
  lib.active = on;
  persist();
  const row = rowOf(lib);
  row?.classList.toggle("lib-off", !on);
  row?.setAttribute("aria-checked", String(on));
  publishActive();
}

function deleteLibrary(lib) {
  libraries = libraries.filter(l => l !== lib);
  persist(); render(); publish();
}

function setMetallicTexture(lib, on) {
  lib.metallicTexture = on;
  persist(); publish();
}

function setSpace(lib, key) {
  if (lib.space === key) return;
  lib.space = key;
  persist(); publish();
}

/** Make the row's name editable until Return or a click elsewhere commits it
 *  (an empty name keeps the old one); Escape cancels. Each of those ends the
 *  edit directly — not only through the field losing focus, which doesn't
 *  happen if focus never reached it — so a row can't stay stuck mid-rename
 *  (and, while renaming, ignore clicks as its toggle). */
function startRename(lib) {
  const input = rowOf(lib)?.querySelector(".lib-name");
  if (!input) return;
  input.readOnly = false;
  input.closest(".lib-row").classList.add("renaming");
  input.focus();
  input.select();
  let done = false;
  const finish = (commit = true) => {
    if (done) return;
    done = true;
    input.removeEventListener("keydown", onKey);
    input.removeEventListener("blur", onBlur);
    document.removeEventListener("pointerdown", onOutside, true);
    input.readOnly = true;
    input.closest(".lib-row")?.classList.remove("renaming");
    input.setSelectionRange(0, 0);
    if (document.activeElement === input) input.blur();
    const v = input.value.trim();
    if (!commit || !v || v === lib.name) { input.value = lib.name; return; }
    lib.name = v;
    persist(); render(); publish();
  };
  const onKey = ev => {
    if (ev.key === "Enter") { ev.preventDefault(); finish(true); }
    else if (ev.key === "Escape") { ev.preventDefault(); finish(false); }
  };
  const onBlur = () => finish(true);
  const onOutside = ev => { if (ev.target !== input) finish(true); };
  input.addEventListener("keydown", onKey);
  input.addEventListener("blur", onBlur);
  document.addEventListener("pointerdown", onOutside, true);
}

list.addEventListener("click", ev => {
  const lib = libOf(ev.target);
  if (!lib) return;
  const btn = ev.target.closest(".lib-menu-btn");
  if (btn) { if (menuFor === lib) closeMenu(); else openMenu(lib, btn); return; }
  // Anywhere else on the row toggles the library — except while its name is
  // being edited.
  if (ev.target.closest(".lib-row").classList.contains("renaming")) return;
  setActive(lib, !lib.active);
});

list.addEventListener("keydown", ev => {
  if (!ev.target.classList?.contains("lib-row") || (ev.key !== " " && ev.key !== "Enter")) return;
  const lib = libOf(ev.target);
  if (!lib) return;
  ev.preventDefault();
  setActive(lib, !lib.active);
});

// ── Row menu ─────────────────────────────────────────────────────────
// One menu at a time, floating at the page level (the section clips its
// contents), placed under the row's ▾ and kept on screen. "Set input space ›"
// opens a submenu beside it on hover, click or →. Closes on a choice, a click
// elsewhere, Escape, scrolling or resizing.

let menuEl = null, subEl = null, menuFor = null, menuBtn = null;

function menuItem(label, onPick, opts = {}) {
  const b = el("button", "lib-menu-item" + (opts.sub ? " has-sub" : ""), { type: "button", role: "menuitem" });
  if (opts.checked != null) b.setAttribute("role", "menuitemradio"), b.setAttribute("aria-checked", String(opts.checked));
  // A check-mark column: on a check item, and on its neighbors (opts.indent) so
  // every label in the menu lines up.
  if (opts.checked != null || opts.indent) b.appendChild(el("span", "lib-menu-mark", { "aria-hidden": "true" }));
  b.appendChild(el("span", "lib-menu-label", { text: label }));
  if (opts.sub) { b.appendChild(el("span", "lib-menu-more", { text: "›", "aria-hidden": "true" })); b.setAttribute("aria-haspopup", "menu"); }
  if (opts.disabled) b.disabled = true;
  if (onPick) b.addEventListener("click", ev => { ev.stopPropagation(); onPick(); });
  return b;
}

function place(menu, x, y, flipX) {
  menu.style.left = "0px"; menu.style.top = "0px";
  const r = menu.getBoundingClientRect(), pad = 6;
  let left = x, top = y;
  if (left + r.width > innerWidth - pad) left = flipX != null ? flipX - r.width : innerWidth - pad - r.width;
  if (top + r.height > innerHeight - pad) top = Math.max(pad, innerHeight - pad - r.height);
  menu.style.left = `${Math.max(pad, left)}px`;
  menu.style.top = `${top}px`;
}

function openSpaceMenu(lib, item) {
  closeSubmenu();
  subEl = el("div", "lib-menu lib-submenu", { role: "menu", "aria-label": "Input space" });
  const keys = lib.space === "mixed" ? ["mixed"] : spacesForFamily(lib.family);
  for (const key of keys) {
    const label = key === "mixed" ? "Mixed" : SPACES[key].label;
    subEl.appendChild(menuItem(label, key === "mixed" ? null : () => { setSpace(lib, key); closeMenu(); },
      { checked: key === lib.space, disabled: key === "mixed" }));
  }
  if (lib.space === "mixed") subEl.title = "This file uses several color spaces; each color keeps its own";
  document.body.appendChild(subEl);
  item.classList.add("open");
  item.setAttribute("aria-expanded", "true");
  const r = item.getBoundingClientRect();
  place(subEl, r.right + 2, r.top - 4, r.left - 2);
  return subEl;
}

function closeSubmenu() {
  subEl?.remove(); subEl = null;
  menuEl?.querySelectorAll(".has-sub").forEach(b => { b.classList.remove("open"); b.setAttribute("aria-expanded", "false"); });
}

function openMenu(lib, btn) {
  closeMenu();
  menuFor = lib; menuBtn = btn;
  btn.setAttribute("aria-expanded", "true");
  rowOf(lib)?.classList.add("menu-open");
  menuEl = el("div", "lib-menu", { role: "menu", "aria-label": `${lib.name} options` });
  const indent = isMetallicLibraryName(lib.name);   // it has a check item: line the labels up
  menuEl.appendChild(menuItem("Rename", () => { closeMenu(); startRename(lib); }, { indent }));
  menuEl.appendChild(menuItem("Remove", () => { closeMenu(); deleteLibrary(lib); }, { indent }));
  if (indent) {
    const tex = menuItem("Simulate metallic texture", () => { closeMenu(); setMetallicTexture(lib, !lib.metallicTexture); },
      { checked: !!lib.metallicTexture });
    tex.setAttribute("role", "menuitemcheckbox");
    menuEl.appendChild(tex);
  }
  // "Set input space ›" is always the last item, whatever else the menu holds
  // (user rule 2026-10-21).
  const spaceItem = menuItem("Set input space", () => openSpaceMenu(lib, spaceItem), { sub: true, indent });
  spaceItem.addEventListener("pointerenter", () => { if (!subEl) openSpaceMenu(lib, spaceItem); });
  menuEl.appendChild(spaceItem);
  // Hovering another item closes the submenu.
  for (const b of menuEl.children) if (b !== spaceItem) b.addEventListener("pointerenter", closeSubmenu);
  document.body.appendChild(menuEl);
  const r = btn.getBoundingClientRect();
  place(menuEl, r.right - menuEl.getBoundingClientRect().width, r.bottom + 3);
  menuEl.querySelector(".lib-menu-item")?.focus();
}

function closeMenu() {
  closeSubmenu();
  menuEl?.remove(); menuEl = null;
  if (menuBtn) menuBtn.setAttribute("aria-expanded", "false");
  if (menuFor) rowOf(menuFor)?.classList.remove("menu-open");
  menuFor = null; menuBtn = null;
}

// A click anywhere outside the menus (or their ▾) closes them.
document.addEventListener("pointerdown", ev => {
  if (!menuEl) return;
  if (menuEl.contains(ev.target) || subEl?.contains(ev.target) || ev.target.closest(".lib-menu-btn") === menuBtn) return;
  closeMenu();
}, true);
window.addEventListener("resize", () => closeMenu());
document.addEventListener("scroll", () => closeMenu(), true);

// Keyboard: ↑/↓ move, → opens the submenu, ← or Escape backs out, Return picks.
document.addEventListener("keydown", ev => {
  if (!menuEl) return;
  const inSub = subEl?.contains(document.activeElement);
  const items = [...(inSub ? subEl : menuEl).querySelectorAll(".lib-menu-item:not(:disabled)")];
  const i = items.indexOf(document.activeElement);
  if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
    ev.preventDefault(); ev.stopPropagation();
    const n = items.length, next = i < 0 ? 0 : (i + (ev.key === "ArrowDown" ? 1 : n - 1)) % n;
    items[next]?.focus();
  } else if (ev.key === "ArrowRight" && !inSub && document.activeElement?.classList.contains("has-sub")) {
    ev.preventDefault(); ev.stopPropagation();
    const sub = openSpaceMenu(menuFor, document.activeElement);
    (sub.querySelector('[aria-checked="true"]:not(:disabled)') || sub.querySelector(".lib-menu-item:not(:disabled)"))?.focus();
  } else if ((ev.key === "ArrowLeft" && inSub) || (ev.key === "Escape" && inSub)) {
    ev.preventDefault(); ev.stopPropagation();
    const owner = menuEl.querySelector(".has-sub");
    closeSubmenu(); owner?.focus();
  } else if (ev.key === "Escape") {
    ev.preventDefault(); ev.stopPropagation();
    const btn = menuBtn;
    closeMenu(); btn?.focus();
  }
}, true);

// ── Import ───────────────────────────────────────────────────────────

/** Import any number of files at once. Color files become libraries first, so
 *  a CMYK file chosen together with its library finds it. Skipped, and noted in
 *  the console only (there is no import readout, by design): a file that can't
 *  be read, a CMYK file with no matching library, a library that's already
 *  imported (nothing happens — user rule 2026-10-21), and any library past the
 *  MAX_LIBRARIES limit. */
async function importFiles(files) {
  const addons = [], have = new Set(libraries.map(contentOf));
  let changed = false;
  const add = (lib, fileName) => {
    const content = contentOf(lib);
    if (have.has(content)) { console.info(`${fileName}: “${lib.name}” is already imported — skipped`); return; }
    if (libraries.length >= MAX_LIBRARIES) { console.warn(`${fileName}: the ${MAX_LIBRARIES}-library limit is reached — “${lib.name}” skipped`); return; }
    have.add(content);
    libraries.push(lib);
    changed = true;
  };
  for (const file of files) {
    try {
      const parsed = parseLibraryFile(file.name, await file.arrayBuffer());
      if (parsed.exportFile) { for (const lib of librariesFromExport(parsed.exportFile)) add(lib, file.name); continue; }
      if (!parsed.swatches.length) { console.warn(`${file.name}: no colors found`); continue; }
      if (detectSpace(parsed).kind === "cmyk") { addons.push({ parsed, fileName: file.name }); continue; }
      add(libraryFromParsed(parsed, file.name), file.name);
    } catch (e) {
      console.warn(`${file.name} couldn't be read:`, e.message);
    }
  }
  for (const { parsed, fileName } of addons) if (attachCMYK(libraries, parsed, fileName)) changed = true;
  if (!changed) return;   // nothing new (e.g. only duplicates): leave everything as it is
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
