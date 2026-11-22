// Admin > Library: add PDFs that students read inside the app (notes, summaries, past papers, the roadmap...).
// The list (title, level, access) is in library/{id}; the file link is kept apart in libraryFiles/{id}, which the rules only show to students allowed to read it.
import { db, doc, getDocs, setDoc, deleteDoc, writeBatch, collection, query, limit, getDoc, serverTimestamp } from "../firebase.js";
import { LEVEL_CHOICES, levelName, cleanDoc, newDocId, resolvePdfUrl } from "../lib/library.js";
import { resetLibrary } from "../data.js";
import { esc, fmtDate, toMillis } from "../lib/util.js";
import { badge, confirmBox, sheet, toast, skeleton } from "../ui.js";
import { handleError } from "../net.js";

const fail = (e) => { if (!handleError(e)) toast("That didn't work. Please try again.", "bad"); };
const appBase = () => new URL("./", location.href).href;

export default async function libraryTab(body, ctx) {
  body.innerHTML = skeleton(3);
  let items = [];
  try { const s = await getDocs(query(collection(db, "library"), limit(200))); items = s.docs.map((d) => ({ id: d.id, ...d.data(), at: toMillis(d.data().createdAt) })).sort((a, b) => b.at - a.at); }
  catch (e) { if (ctx.alive()) { body.innerHTML = '<div class="card center"><p class="muted">Couldn\'t load the library. Republish firestore.rules (library) and try again.</p></div>'; handleError(e); } return; }
  if (!ctx.alive()) return;

  function draw() {
    body.innerHTML = `<div class="stack-l"><div class="row between wrap" style="gap:10px"><div class="grow"><h2 style="margin:0">Study library (${items.length})</h2><div class="small muted">PDFs students read inside the app. Subscribers read everything; documents marked "everyone" are free for all signed-in students.</div></div><button class="btn primary small" id="add">Add PDF</button></div>
      ${items.length ? items.map((d) => `<article class="card stack-s"><div class="row between wrap" style="gap:8px"><div class="grow" style="min-width:0"><strong>${esc(d.title)}</strong><div class="small muted">${esc(levelName(d.level))}${d.pages ? ` · ${d.pages} pages` : ""} · added ${d.at ? fmtDate(d.at) : "just now"}</div>${d.desc ? `<div class="small">${esc(d.desc)}</div>` : ""}</div>
          ${badge(d.access === "free" ? "Everyone" : "Subscribers", d.access === "free" ? "green" : "gold")}</div>
          <div class="row wrap"><a class="btn small" href="#/read/${esc(d.id)}">Open</a><button class="btn small" data-ed="${esc(d.id)}">Edit</button><button class="btn small danger" data-dl="${esc(d.id)}">Delete</button></div></article>`).join("")
        : '<div class="card center"><p class="muted" style="margin:0">No PDFs yet. Tap "Add PDF".</p></div>'}
      <details><summary class="small"><strong>Where do I keep the PDF file?</strong></summary><div class="small stack-s" style="margin-top:8px">
        <div><strong>Easiest: in your app folder.</strong> Put the file in <code>content/pdf/</code> (for example <code>content/pdf/roadmap.pdf</code>), upload it to GitHub with the app, then type <code>content/pdf/roadmap.pdf</code> as the file link.</div>
        <div><strong>Or any https link</strong> from a host that lets apps read it (Cloudinary does; Google Drive and Dropbox links usually do not). Use "Test link" to check before saving.</div>
        <div class="muted">Students can't download from the reader, but anyone who gets the file's direct link can open it, so don't put exam papers you must keep secret in a public folder.</div></div></details></div>`;
    body.querySelector("#add").onclick = () => form(null);
    body.querySelectorAll("[data-ed]").forEach((b) => (b.onclick = () => form(items.find((x) => x.id === b.dataset.ed))));
    body.querySelectorAll("[data-dl]").forEach((b) => (b.onclick = async () => {
      const d = items.find((x) => x.id === b.dataset.dl);
      if (!(await confirmBox({ title: `Delete "${d.title}"?`, text: "It disappears from the library. The PDF file itself is not deleted from wherever you keep it.", okLabel: "Delete", danger: true }))) return;
      try { const w = writeBatch(db); w.delete(doc(db, "library", d.id)); w.delete(doc(db, "libraryFiles", d.id)); await w.commit(); items = items.filter((x) => x.id !== d.id); resetLibrary(); draw(); } catch (e) { fail(e); }
    }));
  }

  async function form(x) {
    let oldUrl = "";
    if (x) { try { const f = await getDoc(doc(db, "libraryFiles", x.id)); oldUrl = f.exists() ? f.data().url || "" : ""; } catch { /* leave empty */ } }
    const s = sheet(`<div class="stack"><label>Title<input id="ti" maxlength="100" value="${esc(x?.title || "")}" placeholder="e.g. Anatomy summary notes"></label>
      <label>About (optional)<input id="de" maxlength="200" value="${esc(x?.desc || "")}" placeholder="e.g. Chapters 1 to 4, short notes"></label>
      <label>File link<input id="ur" maxlength="400" value="${esc(oldUrl)}" placeholder="content/pdf/notes.pdf or https://..." autocomplete="off" autocapitalize="off"></label>
      <div class="row wrap" style="gap:10px;align-items:center"><button type="button" class="btn small" id="tt">Test link</button><span class="small muted" id="tr">${x?.pages ? x.pages + " pages" : ""}</span></div>
      <div class="row wrap" style="gap:10px"><label class="grow">Level<select id="lv">${LEVEL_CHOICES.map(([v, l]) => `<option value="${v}" ${v === (x?.level || 0) ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <label class="grow">Who can read<select id="ac"><option value="paid" ${x?.access === "free" ? "" : "selected"}>Subscribers only</option><option value="free" ${x?.access === "free" ? "selected" : ""}>Everyone (free)</option></select></label></div>
      <input type="hidden" id="pg" value="${x?.pages || 0}">
      <div class="row" style="justify-content:flex-end"><button class="btn ghost" data-c>Cancel</button><button class="btn primary" id="sv">Save</button></div></div>`, { title: x ? "Edit PDF" : "Add PDF" });
    const $ = (q) => s.el.querySelector(q); $("[data-c]").onclick = s.close;
    $("#tt").onclick = async (ev) => {
      const u = resolvePdfUrl($("#ur").value, appBase()); if (!u) return toast("Type a link that starts with https:// or a file in your app folder", "bad");
      const b = ev.currentTarget; b.disabled = true; $("#tr").textContent = "Testing...";
      try { const { probePdf } = await import("../pdfreader.js"); const n = await probePdf(u); $("#pg").value = n; $("#tr").textContent = `Works: ${n} page${n === 1 ? "" : "s"}`; }
      catch (e) { $("#tr").textContent = /Missing|404/i.test(String(e?.name + e?.message)) ? "File not found at that link" : "Couldn't read it. The file may not exist, or that host blocks apps from reading it."; }
      b.disabled = false;
    };
    $("#sv").onclick = async () => {
      const id = x?.id || newDocId($("#ti").value);
      const r = cleanDoc({ title: $("#ti").value, desc: $("#de").value, url: $("#ur").value, level: $("#lv").value, access: $("#ac").value, pages: $("#pg").value }, id, appBase());
      if (!r.ok) return toast(r.error, "bad");
      const b = $("#sv"); b.disabled = true;
      try {
        const w = writeBatch(db);
        w.set(doc(db, "library", id), { ...r.meta, ...(x ? {} : { createdAt: serverTimestamp() }), updatedAt: serverTimestamp() }, { merge: true });
        w.set(doc(db, "libraryFiles", id), { url: r.url, updatedAt: serverTimestamp() });
        await w.commit(); resetLibrary();
        const keep = x ? x.at : Date.now();
        items = [{ id, ...r.meta, at: keep }, ...items.filter((i) => i.id !== id)].sort((a, c) => c.at - a.at);
        s.close(); toast("Saved", "good"); draw();
      } catch (e) { b.disabled = false; fail(e); }
    };
  }
  draw();
}
