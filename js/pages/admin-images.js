// Admin > Images: compress on the phone, upload to Cloudinary, track how much you've stored.
// The running total lives in settings/imageLog (admin-written; no rules change needed) and only counts uploads made here.
import { db, doc, getDoc, setDoc } from "../firebase.js";
import { APP } from "../config.js";
import { compressImage, uploadToCloudinary, fmtBytes, cloudinaryReady } from "../imagetools.js";
import { esc, fmtDateTime } from "../lib/util.js";
import { toast, copyText } from "../ui.js";
import { handleError } from "../net.js";

const QUALITY = { "0.9": "Best quality", "0.8": "Balanced (recommended)", "0.65": "Smallest file" };

export default async function imagesTab(body, ctx) {
  const snap = await getDoc(doc(db, "settings", "imageLog"));
  if (!ctx.alive()) return;
  const log = { count: 0, totalBytes: 0, originalBytes: 0, items: [], ...(snap.exists() ? snap.data() : {}) };
  const saved = log.originalBytes ? Math.round((1 - log.totalBytes / log.originalBytes) * 100) : 0;
  let batch = []; // { file, res, url, status }

  body.innerHTML = `<div class="stack-l">
    <section class="card stack-s"><h2>Stored on Cloudinary</h2>
      <div class="row wrap" style="gap:24px"><div><div class="price">${fmtBytes(log.totalBytes)}</div><div class="muted small">total size</div></div>
        <div><div class="price">${log.count}</div><div class="muted small">images</div></div>
        <div><div class="price">${saved}%</div><div class="muted small">saved by compression</div></div></div>
      <p class="muted small" style="margin:0">Counts only images uploaded from this page. Your Cloudinary dashboard has the official usage.</p></section>
    ${cloudinaryReady() ? `<section class="card stack"><h2>Upload images</h2>
      <label>Quality<select id="q">${Object.entries(QUALITY).map(([v, l]) => `<option value="${v}" ${v === "0.8" ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label>Pick pictures<input id="files" type="file" accept="image/*" multiple><span class="field-hint">Pictures are shrunk to 1200 px wide and compressed on your phone before upload.</span></label>
      <div id="rows" class="stack-s"></div><div id="sum" class="small muted" aria-live="polite"></div>
      <button class="btn primary block" id="up" disabled>Upload</button></section>`
      : `<div class="notice warn"><strong>Cloudinary isn't connected yet.</strong><br>Open <code>js/config.js</code>, fill in <code>cloudName</code> and <code>uploadPreset</code> (an unsigned preset limited to images), then reload. Until then you can't upload from here.</div>`}
    <section class="stack-s"><h2>Recent uploads</h2>
      ${log.items.length ? `<div class="list">${log.items.slice(0, 30).map((it) => `<div class="item"><img src="${esc(it.url)}" alt="" width="48" height="48" style="object-fit:cover;border-radius:8px;background:#fff" loading="lazy">
        <div class="grow" style="min-width:0"><strong style="word-break:break-all">${esc(it.name)}</strong><div class="meta">${fmtBytes(it.bytes)} · ${fmtDateTime(it.at)}</div></div>
        <button class="btn small" data-copy="${esc(it.url)}">Copy link</button></div>`).join("")}</div>` : '<p class="muted">Nothing uploaded yet.</p>'}</section></div>`;

  body.querySelectorAll("[data-copy]").forEach((b) => (b.onclick = () => copyText(b.dataset.copy)));
  if (!cloudinaryReady()) return;
  const $ = (s) => body.querySelector(s);

  function drawRows() {
    $("#rows").innerHTML = batch.map((b, i) => `<div class="item"><img src="${esc(b.preview)}" alt="" width="48" height="48" style="object-fit:cover;border-radius:8px">
      <div class="grow" style="min-width:0"><strong style="word-break:break-all">${esc(b.res.name)}</strong>
      <div class="meta">${fmtBytes(b.res.original)} → ${fmtBytes(b.res.size)} · ${b.res.kept ? "already small, kept" : `saved ${b.res.savedPct}%`} · ${b.res.w}×${b.res.h}</div>
      ${b.status === "done" ? `<div class="small" style="color:var(--emerald)">Uploaded</div>` : b.status === "error" ? '<div class="small error">Failed. Try again.</div>' : ""}</div>
      ${b.status === "done" ? `<button class="btn small" data-copy="${esc(b.url)}">Copy link</button>` : ""}</div>`).join("");
    $("#rows").querySelectorAll("[data-copy]").forEach((x) => (x.onclick = () => copyText(x.dataset.copy)));
    const orig = batch.reduce((s, b) => s + b.res.original, 0), now = batch.reduce((s, b) => s + b.res.size, 0);
    $("#sum").textContent = batch.length ? `${batch.length} picture${batch.length === 1 ? "" : "s"}: ${fmtBytes(orig)} → ${fmtBytes(now)} (${orig ? Math.round((1 - now / orig) * 100) : 0}% smaller)` : "";
    $("#up").disabled = !batch.some((b) => b.status !== "done");
  }

  let prepRun = 0;
  async function prepare() {
    const files = [...$("#files").files]; if (!files.length) return;
    batch.forEach((b) => URL.revokeObjectURL(b.preview));
    $("#sum").textContent = "Compressing...";
    const quality = Number($("#q").value);
    const run = ++prepRun, next = [];
    batch = [];
    for (const file of files) {
      const res = await compressImage(file, { maxSide: 1200, quality });
      if (run !== prepRun) { return; }          // a newer pick or quality change took over
      next.push({ file, res, preview: URL.createObjectURL(res.blob), status: "ready" });
    }
    batch = next;
    drawRows();
  }
  $("#files").onchange = prepare; $("#q").onchange = prepare;

  $("#up").onclick = async () => {
    const btn = $("#up"); btn.disabled = true; btn.textContent = "Uploading...";
    let added = 0;
    for (const b of batch.filter((x) => x.status !== "done")) {
      try {
        const out = await uploadToCloudinary(b.res.blob, b.res.name);
        b.url = out.url; b.status = "done"; added++;
        log.count++; log.totalBytes += out.bytes; log.originalBytes += b.res.original;
        log.items.unshift({ url: out.url, name: b.res.name, bytes: out.bytes, at: Date.now() });
      } catch { b.status = "error"; }
      drawRows();
    }
    log.items = log.items.slice(0, 200);
    try { if (added) await setDoc(doc(db, "settings", "imageLog"), { count: log.count, totalBytes: log.totalBytes, originalBytes: log.originalBytes, items: log.items }); }
    catch (e) { if (!handleError(e)) toast("Uploaded, but the total couldn't be saved.", "bad"); }
    btn.textContent = "Upload";
    if (added) toast(`${added} image${added === 1 ? "" : "s"} uploaded. Copy the link into your set's image column.`, "good");
    drawRows();
  };
}
