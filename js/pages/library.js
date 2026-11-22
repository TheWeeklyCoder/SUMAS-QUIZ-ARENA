// Study library: PDFs added by the admin, read inside the app. Subscribers read everything; "free for everyone" documents are open to all.
import { db, doc, getDoc } from "../firebase.js";
import { state, isPaid } from "../state.js";
import { loadLibrary } from "../data.js";
import { visibleDocs, canRead, levelName, resolvePdfUrl, posKey, openError } from "../lib/library.js";
import { myLevel } from "../lib/levels.js";
import { esc, ls, debounce } from "../lib/util.js";
import { icon, skeleton, lockedCard, toast } from "../ui.js";
import { handleError, isOnline } from "../net.js";
import { savedMap, savedMeta, savedList, savePdf, readSaved, removePdf, pruneSaved, warmLib, fmtBytes, supported } from "../pdfoffline.js";

const appBase = () => new URL("./", location.href).href;

/* ------------------------------- the list ------------------------------- */
export default async function library(ctx) {
  ctx.view.innerHTML = `<div class="stack-l"><header><h1>Study library</h1><p class="muted" style="margin:0">Notes, summaries and past papers you can read right here in the app.</p></header><div id="lb">${skeleton(3)}</div></div>`;
  const box = ctx.view.querySelector("#lb");
  let items, offlineList = false, loadErr = null;
  const uid = state.user.uid;
  try { items = await loadLibrary(); pruneSaved(uid, items.map((d) => d.id)); } catch (e) {
    if (!ctx.alive()) return; loadErr = e;
    const mine = savedList(uid);
    if (mine.length) { items = mine.map((m) => ({ ...m, createdAtMs: m.at })); offlineList = true; }
  }
  if (!items) {
    box.innerHTML = '<div class="card center stack"><p class="muted">Couldn\'t load the library.</p><button class="btn" id="r">Try again</button></div>';
    box.querySelector("#r").onclick = () => library(ctx); handleError(loadErr, { retry: () => library(ctx) }); return;
  }
  if (!ctx.alive()) return;
  const paid = isPaid(), lvl = myLevel() || 0, saved = savedMap(uid);
  let level = lvl, q = "";
  const draw = () => {
    const shown = visibleDocs(items, { level, q });
    box.innerHTML = `<div class="stack">
      ${offlineList ? '<div class="notice warn" role="status">You\'re offline. Showing the documents saved on this phone.</div>' : ""}
      ${!paid ? `<div class="card gold row" style="gap:12px;align-items:flex-start"><span class="tile gold">${icon("lock")}</span><div class="grow"><strong>Reading is for subscribers</strong><div class="small muted">Free documents are marked below. <a href="#/plans">See plans</a></div></div></div>` : ""}
      ${items.length ? `<div class="chips" role="group" aria-label="Level"><button class="chip" data-l="${lvl}" aria-pressed="${level === lvl && !!lvl}">My level</button><button class="chip" data-l="0" aria-pressed="${level === 0}">All levels</button></div>
        ${items.length > 6 ? '<input id="q" type="search" placeholder="Search documents" aria-label="Search documents" autocomplete="off">' : ""}` : ""}
      ${shown.length ? `<div class="list">${shown.map((d) => { const ok = canRead(d, paid);
        return `<a class="item" href="${ok ? "#/read/" + esc(d.id) : "#/plans"}"><span class="tile ${ok ? "" : "gold"}">${icon(ok ? "book" : "lock")}</span><div class="grow" style="min-width:0"><strong>${esc(d.title)}</strong>
          <div class="meta">${esc(levelName(d.level))}${d.pages ? ` · ${d.pages} page${d.pages === 1 ? "" : "s"}` : ""}${saved[d.id] ? " · Saved offline" : ""}${d.desc ? " · " + esc(d.desc) : ""}</div></div>
          ${d.access === "free" ? '<span class="badge green">Free</span>' : ok ? "" : '<span class="badge gold">Subscribers</span>'}${icon("chevron")}</a>`; }).join("")}</div>`
        : `<div class="card center"><p class="muted" style="margin:0">${items.length ? "No documents match." : "No documents yet. Check back soon."}</p></div>`}</div>`;
    box.querySelectorAll("[data-l]").forEach((b) => (b.onclick = () => { level = Number(b.dataset.l); draw(); }));
    const qi = box.querySelector("#q"); if (qi) { qi.value = q; qi.oninput = debounce(() => { q = qi.value; const pos = qi.selectionStart; draw(); const n = box.querySelector("#q"); n?.focus(); try { n?.setSelectionRange(pos, pos); } catch {} }, 250); }
  };
  draw();
}

/* ------------------------------- the reader ------------------------------- */
export async function readerPage(ctx) {
  const id = ctx.params.id, uid = state.user.uid, paid = isPaid();
  const shell = (inner) => { ctx.view.innerHTML = inner; };
  const msg = (title, text, extra = "") => shell(`<div class="card center stack"><h2>${esc(title)}</h2><p class="muted" style="margin:0">${esc(text)}</p>${extra}<a class="btn" href="#/library">Back to the library</a></div>`);
  shell(`<div class="stack-l">${skeleton(2)}</div>`);

  const off = savedMeta(uid, id);            // a copy saved on this phone (works with no connection)
  let item = null, loaded = false;
  try { const all = await loadLibrary(); item = all.find((d) => d.id === id) || (await loadLibrary({ force: true })).find((d) => d.id === id) || null; loaded = true; }
  catch (e) { if (!off) { if (ctx.alive()) { msg("Couldn't load this document", isOnline() ? "Please try again in a moment." : "You're offline. Save documents for offline reading while you have data, then open them here."); handleError(e); } return; } }
  if (!ctx.alive()) return;
  if (loaded && !item) { if (off) removePdf(uid, id); return msg("Document not found", "It may have been removed."); }
  if (!item) item = off;                       // offline: the saved copy's own details
  if (!canRead(item, paid)) return shell(`<div class="stack-l"><header><h1>${esc(item.title)}</h1></header>${lockedCard("Reading is for subscribers", "Subscribe to read notes, summaries and past papers inside the app.")}<a class="btn" href="#/library">Back to the library</a></div>`);

  let url = off ? off.url : "", data = off ? await readSaved(uid, id) : null;
  if (!ctx.alive()) return;
  if (!data) {
    try { const f = await getDoc(doc(db, "libraryFiles", id)); url = f.exists() ? resolvePdfUrl(f.data().url, appBase()) : ""; }
    catch (e) { if (ctx.alive()) { msg("Couldn't open this document", isOnline() ? "Please try again in a moment." : "You're offline. Connect to the internet to read this document."); handleError(e); } return; }
    if (!ctx.alive()) return;
    if (!url) return msg("This document isn't available", "Its file link is missing or not valid. Please tell us on WhatsApp.");
  }

  const saved = Number(ls(posKey(uid, id))) || 1, zoomSaved = Number(ls("pdf_zoom")) || 1, nightSaved = ls("pdf_night") === 1;
  shell(`<div class="reader"><header class="rd-top"><a class="iconbtn" href="#/library" aria-label="Back to the library">${icon("back")}</a>
      <div class="grow" style="min-width:0"><strong class="rd-title">${esc(item.title)}</strong><div class="small muted" id="pg">Opening...</div></div>
      <button class="iconbtn rd-btn" id="zo" aria-label="Zoom out">&minus;</button><button class="iconbtn rd-btn" id="zi" aria-label="Zoom in">+</button><button class="iconbtn" id="nt" aria-label="Night reading">${icon("moon")}</button></header>
    <div id="st" class="rd-status"><div class="skeleton" style="height:12px;border-radius:99px"><i id="bar" style="display:block;height:100%;width:0;background:var(--brand);border-radius:99px"></i></div><p class="small muted center" style="margin:8px 0 0">Loading the document...</p></div>
    <div class="rd-off small" id="off" hidden></div>
    <div id="pages"></div>
    <div class="rd-jump" id="jump" hidden><label class="small muted">Go to page <input id="jn" type="number" inputmode="numeric" min="1" style="width:5.5em"></label><button class="btn small" id="jg">Go</button></div></div>`);
  const $ = (q) => ctx.view.querySelector(q);
  let ctl = null, night = nightSaved;
  ctx.onLeave(() => { try { ctl?.destroy(); } catch {} });
  const savePos = debounce((n) => ls(posKey(uid, id), n), 500);

  // "Save for offline reading" bar under the title
  let working = false;
  const saveErr = { offline: "You're offline. Connect to the internet to save it.", http: "The file couldn't be downloaded. Please try again later.", notpdf: "That link isn't a readable PDF.", toobig: "This file is too large to save on a phone.", space: "Not enough free space on this phone.", unsupported: "This browser can't save files for offline reading." };
  function offlineBar() {
    const bar = $("#off"); if (!bar || !supported()) return;
    const m = savedMeta(uid, id); bar.hidden = false;
    bar.innerHTML = m ? `<span class="grow">Saved on this phone (${esc(fmtBytes(m.bytes))}). It stays until you log out.</span>${isOnline() ? '<button class="btn small" id="ou">Update</button>' : ""}<button class="btn small" id="orm">Remove</button>`
      : `<span class="grow">Read this without data.</span><button class="btn small" id="osv">${isOnline() ? "Save for offline reading" : "Offline"}</button>`;
    const run = async () => {
      if (working) return; if (!isOnline()) return toast(saveErr.offline, "bad");
      working = true; const b = bar.querySelector("#osv") || bar.querySelector("#ou"); if (b) { b.disabled = true; b.textContent = "Saving 0%"; }
      try {
        const src = url || (await getDoc(doc(db, "libraryFiles", id)).then((f) => (f.exists() ? resolvePdfUrl(f.data().url, appBase()) : "")));
        if (!src) throw Object.assign(new Error("nolink"), { code: "http" });
        await savePdf(uid, item, src, { onProgress: (f) => { if (b && ctx.alive()) b.textContent = `Saving ${Math.round(f * 100)}%`; } });
        warmLib(); if (ctx.alive()) toast("Saved. You can read it offline now.", "good");
      } catch (e) { if (e?.name !== "AbortError") toast(saveErr[e?.code] || "Couldn't save it. Please try again.", "bad"); }
      finally { working = false; if (ctx.alive()) offlineBar(); }
    };
    bar.querySelector("#osv")?.addEventListener("click", run); bar.querySelector("#ou")?.addEventListener("click", run);
    bar.querySelector("#orm")?.addEventListener("click", async () => { await removePdf(uid, id); toast("Removed from this phone"); if (ctx.alive()) offlineBar(); });
  }
  if (data) warmLib();

  try {
    const { openPdf, ZOOMS } = await import("../pdfreader.js");
    ctl = await openPdf(url, $("#pages"), {
      data, startPage: saved, zoom: zoomSaved, night,
      onProgress: (f) => { const b = $("#bar"); if (b) b.style.width = Math.round(f * 100) + "%"; },
      onPage: (n, total) => { const e = $("#pg"); if (e) e.textContent = `Page ${n} of ${total}`; savePos(n); },
    });
    if (!ctx.alive()) { ctl.destroy(); return; }
    $("#st").remove(); $("#jump").hidden = false; offlineBar(); $("#jn").max = String(ctl.pages);
    const step = (dir) => { const i = ZOOMS.findIndex((z) => z >= ctl.zoom - 0.001); ctl.setZoom(ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, i + dir))]); ls("pdf_zoom", ctl.zoom); };
    $("#zo").onclick = () => step(-1); $("#zi").onclick = () => step(1);
    $("#nt").setAttribute("aria-pressed", String(night));
    $("#nt").onclick = () => { night = !night; ctl.setNight(night); ls("pdf_night", night ? 1 : 0); $("#nt").setAttribute("aria-pressed", String(night)); };
    $("#jg").onclick = () => ctl.goTo(Number($("#jn").value));
    $("#jn").addEventListener("keydown", (e) => { if (e.key === "Enter") ctl.goTo(Number($("#jn").value)); });
  } catch (e) {
    if (!ctx.alive()) return;
    console.warn("pdf open", e);
    $("#st").innerHTML = `<div class="card center stack"><p class="muted" style="margin:0">${esc(openError(e, isOnline()))}</p><button class="btn" id="rt">Try again</button></div>`;
    $("#rt").onclick = () => readerPage(ctx);
  }
}
