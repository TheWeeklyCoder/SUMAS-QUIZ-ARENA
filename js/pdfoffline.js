// Offline reading for study-library PDFs. A student taps "Save for offline reading" and the file is kept on the phone
// (Cache Storage). The list of what was saved is kept per student, so another account on the same phone sees nothing.
// Everything is removed when the student logs out (same rule as the cached question sets), and a saved document still
// needs an active subscription (or a "free" mark) to open: that check happens in the reader, using the cached profile.
import { ls } from "./lib/util.js";

export const FILES_CACHE = "sumas-pdf-files";      // the PDFs (never deleted by the service worker's cleanup)
export const LIB_CACHE = "sumas-pdf-lib";          // pdf.js itself (served by the service worker, see sw.js)
export const MAX_BYTES = 100 * 1024 * 1024;        // one file
const LIB_BASE = new URL("./vendor/pdfjs/", import.meta.url).href;
const LIB_FILES = ["pdf.min.js", "pdf.worker.min.js", "wasm/jbig2.wasm", "wasm/openjpeg.wasm", "wasm/qcms_bg.wasm",
  ...["FoxitDingbats.pfb", "FoxitFixed.pfb", "FoxitFixedBold.pfb", "FoxitFixedBoldItalic.pfb", "FoxitFixedItalic.pfb", "FoxitSerif.pfb", "FoxitSerifBold.pfb",
    "FoxitSerifBoldItalic.pfb", "FoxitSerifItalic.pfb", "FoxitSymbol.pfb", "LiberationSans-Bold.ttf", "LiberationSans-BoldItalic.ttf", "LiberationSans-Italic.ttf", "LiberationSans-Regular.ttf"].map((f) => "standard_fonts/" + f)];

export const supported = () => typeof caches !== "undefined" && typeof Response !== "undefined";
const mkey = (uid) => `pdfoff_${uid}`;
const reqFor = (uid, id) => new Request(new URL(`./__offline/${encodeURIComponent(uid)}/${encodeURIComponent(id)}`, location.href).href);

/** What this student has saved: { [docId]: { id, title, desc, level, access, pages, bytes, url, at } } */
export const savedMap = (uid) => { const m = ls(mkey(uid)); return m && typeof m === "object" ? m : {}; };
export const savedMeta = (uid, id) => savedMap(uid)[id] || null;
export const savedList = (uid) => Object.values(savedMap(uid)).sort((a, b) => (b.at || 0) - (a.at || 0));
const putMeta = (uid, m) => ls(mkey(uid), m);

/** A PDF must start with %PDF. Anything else (an HTML error page, a sign-in page) is refused so it is never saved. */
export const looksLikePdf = (bytes) => !!bytes && bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;

export function fmtBytes(n) { n = Number(n) || 0; return n >= 1048576 ? (n / 1048576).toFixed(n >= 10485760 ? 0 : 1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }

/** Download `url` and keep it for offline reading. Throws Error with .code in: offline, http, notpdf, toobig, space, failed. */
export async function savePdf(uid, item, url, { onProgress, signal, fetchFn = fetch } = {}) {
  if (!supported()) { const e = new Error("unsupported"); e.code = "unsupported"; throw e; }
  const fail = (code, msg) => { const e = new Error(msg || code); e.code = code; return e; };
  let res;
  try { res = await fetchFn(url, { credentials: "omit", signal }); } catch (e) { if (e?.name === "AbortError") throw e; throw fail(navigator.onLine === false ? "offline" : "failed", String(e?.message || e)); }
  if (!res.ok) throw fail("http", "HTTP " + res.status);
  const total = Number(res.headers.get("content-length")) || 0;
  if (total > MAX_BYTES) throw fail("toobig");
  try {                                                                   // make sure there is room before downloading a big file
    const est = await navigator.storage?.estimate?.();
    if (est?.quota && total && est.quota - (est.usage || 0) < total * 1.3) throw fail("space");
  } catch (e) { if (e.code) throw e; }
  const parts = []; let got = 0;
  if (res.body?.getReader) {
    const rd = res.body.getReader();
    for (;;) {
      const { done, value } = await rd.read(); if (done) break;
      parts.push(value); got += value.length;
      if (got > MAX_BYTES) { try { rd.cancel(); } catch { /* ignore */ } throw fail("toobig"); }
      if (total) onProgress?.(Math.min(1, got / total));
    }
  } else { const b = new Uint8Array(await res.arrayBuffer()); parts.push(b); got = b.length; }
  if (!got) throw fail("notpdf");
  const head = parts[0].subarray(0, 8);
  if (!looksLikePdf(head)) throw fail("notpdf");
  const blob = new Blob(parts, { type: "application/pdf" });
  try {
    const cache = await caches.open(FILES_CACHE);
    await cache.put(reqFor(uid, item.id), new Response(blob, { headers: { "content-type": "application/pdf", "content-length": String(got) } }));
  } catch (e) { try { await removePdf(uid, item.id); } catch { /* ignore */ } throw fail(/quota/i.test(String(e?.name) + String(e?.message)) ? "space" : "failed", String(e?.message || e)); }
  const m = savedMap(uid);
  m[item.id] = { id: item.id, title: item.title || "Document", desc: item.desc || "", level: item.level || 0, access: item.access === "free" ? "free" : "paid", pages: item.pages || 0, bytes: got, url, at: Date.now() };
  putMeta(uid, m);
  onProgress?.(1);
  try { navigator.storage?.persist?.(); } catch { /* ignore */ }
  return m[item.id];
}

/** The saved file's bytes, or null (not saved, or the phone cleared it: the entry is dropped in that case). */
export async function readSaved(uid, id) {
  if (!supported() || !savedMeta(uid, id)) return null;
  try {
    const hit = await (await caches.open(FILES_CACHE)).match(reqFor(uid, id));
    if (hit) { const b = new Uint8Array(await hit.arrayBuffer()); if (looksLikePdf(b)) return b; }
  } catch { /* fall through */ }
  const m = savedMap(uid); delete m[id]; putMeta(uid, m);
  return null;
}

export async function removePdf(uid, id) {
  const m = savedMap(uid); delete m[id]; putMeta(uid, m);
  try { await (await caches.open(FILES_CACHE)).delete(reqFor(uid, id)); } catch { /* ignore */ }
}

/** Drop saved copies of documents that no longer exist in the library. */
export async function pruneSaved(uid, liveIds) {
  const live = new Set(liveIds);
  for (const id of Object.keys(savedMap(uid))) if (!live.has(id)) await removePdf(uid, id);
}

/** Log out: forget everything saved on this phone (all students). */
export async function clearOffline() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.startsWith("pdfoff_") && k !== "pdfoff_lib") localStorage.removeItem(k); }
  } catch { /* storage blocked */ }
  try { if (supported()) await caches.delete(FILES_CACHE); } catch { /* ignore */ }
}

/** Keep pdf.js (about 2.5 MB) for offline use too: the service worker serves it from LIB_CACHE. Runs once; safe to call again. */
export async function warmLib(fetchFn = fetch) {
  if (!supported() || ls("pdfoff_lib") === LIB_FILES.length) return;
  try {
    const cache = await caches.open(LIB_CACHE);
    for (const f of LIB_FILES) {
      const u = LIB_BASE + f;
      if (await cache.match(u)) continue;
      const r = await fetchFn(u, { credentials: "omit" });
      if (r.ok) await cache.put(u, r);
    }
    ls("pdfoff_lib", LIB_FILES.length);
  } catch { /* offline or blocked: the reader still works online, and the next save tries again */ }
}
