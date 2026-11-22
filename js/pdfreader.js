// In-app PDF viewer built on Mozilla's pdf.js (vendored in js/vendor/pdfjs, the "legacy" build that also runs on older phones).
// Pages are drawn on demand (only the ones near the screen) so long PDFs stay light on low-end phones.
const BASE = new URL("./vendor/pdfjs/", import.meta.url).href;
let libPromise = null;
function loadLib() {
  return (libPromise ||= import("./vendor/pdfjs/pdf.min.js").then((m) => { m.GlobalWorkerOptions.workerSrc = BASE + "pdf.worker.min.js"; return m; }).catch((e) => { libPromise = null; throw e; }));
}

export const ZOOMS = [0.75, 1, 1.25, 1.5, 2, 3];
const MAX_PIXELS = 12e6;    // per page canvas, so one page can never exhaust a phone's memory

/** Read a PDF's page count (used by the admin "Test link" button). Throws with pdf.js's error name on failure. */
export async function probePdf(url) {
  const lib = await loadLib();
  const task = lib.getDocument({ url, ...opts() });
  try { const d = await task.promise; return d.numPages; } finally { try { await task.destroy(); } catch { /* already closed */ } }
}
const opts = () => ({ standardFontDataUrl: BASE + "standard_fonts/", wasmUrl: BASE + "wasm/", isEvalSupported: false, enableScripting: false, withCredentials: false });

/**
 * Open `url` and draw it into `host` (an empty block element). Options: data (bytes of a copy saved for offline; `url` is ignored then), startPage, zoom, night, onPage(n,total), onProgress(0..1).
 * Resolves with a controller { pages, page, goTo(n), setZoom(z), zoom, setNight(b), destroy() }.
 */
export async function openPdf(url, host, o = {}) {
  const lib = await loadLib();
  const task = lib.getDocument(o.data ? { data: o.data, ...opts() } : { url, ...opts(), rangeChunkSize: 262144 });
  if (o.onProgress) task.onProgress = ({ loaded, total }) => { if (total) o.onProgress(Math.min(1, loaded / total)); };
  const pdf = await task.promise;
  const total = pdf.numPages;
  const first = await pdf.getPage(1), v1 = first.getViewport({ scale: 1 });
  let zoom = o.zoom || 1, current = Math.min(total, Math.max(1, o.startPage || 1)), dead = false;
  const boxes = [], state = new Map();          // state: page number -> { canvas, task, token }
  const queue = []; let busy = false;
  host.classList.add("rd-pages"); host.classList.toggle("rd-night", !!o.night);
  host.innerHTML = "";
  host.addEventListener("contextmenu", (e) => e.preventDefault());

  const fit = () => Math.max(120, host.clientWidth || 320);
  const sizes = () => { const s = (fit() / v1.width) * zoom; return { s, w: Math.floor(v1.width * s), h: Math.floor(v1.height * s) }; };
  let dims = sizes();
  for (let i = 1; i <= total; i++) {
    const d = document.createElement("div"); d.className = "rd-pg"; d.dataset.n = String(i); d.style.width = dims.w + "px"; d.style.height = dims.h + "px"; d.setAttribute("aria-label", `Page ${i} of ${total}`);
    host.append(d); boxes[i] = d;
  }

  async function draw(n, token) {
    const box = boxes[n]; if (!box || dead) return;
    const page = n === 1 ? first : await pdf.getPage(n);
    if (dead || state.get(n)?.token !== token) return;
    const base = page.getViewport({ scale: 1 }), s = (fit() / base.width) * zoom;
    const vp = page.getViewport({ scale: s });
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (vp.width * vp.height * dpr * dpr > MAX_PIXELS) dpr = Math.max(1, Math.sqrt(MAX_PIXELS / (vp.width * vp.height)));
    const c = document.createElement("canvas");
    c.width = Math.floor(vp.width * dpr); c.height = Math.floor(vp.height * dpr); c.style.width = Math.floor(vp.width) + "px"; c.style.height = Math.floor(vp.height) + "px";
    const rt = page.render({ canvasContext: c.getContext("2d"), viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null });
    const st = state.get(n); if (st) st.task = rt;
    try { await rt.promise; } catch (e) { if (e?.name === "RenderingCancelledException") return; throw e; }
    if (dead || state.get(n)?.token !== token) return;
    box.style.width = Math.floor(vp.width) + "px"; box.style.height = Math.floor(vp.height) + "px";   // pages of another size keep their own shape
    box.replaceChildren(c); box.classList.add("done");
    page.cleanup?.();
  }
  async function pump() {
    if (busy) return; busy = true;
    try { while (queue.length && !dead) { const [n, token] = queue.shift(); if (state.get(n)?.token === token) { try { await draw(n, token); } catch (e) { if (!dead) console.warn("pdf page", n, e); } } } }
    finally { busy = false; }
  }
  function want(n) { if (state.has(n)) return; const token = Symbol(); state.set(n, { token }); queue.push([n, token]); pump(); }
  function release(n) { const st = state.get(n); if (!st) return; st.task?.cancel?.(); state.delete(n); const b = boxes[n]; if (b) { b.replaceChildren(); b.classList.remove("done"); } }

  // Draw pages near the screen; free the ones far away.
  const near = new Set();
  const io = new IntersectionObserver((es) => {
    for (const e of es) { const n = +e.target.dataset.n; if (e.isIntersecting) { near.add(n); want(n); } else near.delete(n); }
    for (const n of [...state.keys()]) if (!near.has(n) && ![...near].some((k) => Math.abs(k - n) <= 3)) release(n);
    queue.sort((a, b) => Math.abs(a[0] - current) - Math.abs(b[0] - current));
  }, { rootMargin: "120% 0px 120% 0px" });
  boxes.slice(1).forEach((b) => io.observe(b));

  // Which page is on screen: the last page whose top is above 45% of the screen height (binary search, so it is right straight after a jump).
  let raf = 0;
  const track = () => {
    raf = 0; const mid = window.innerHeight * 0.45; let lo = 1, hi = total, best = 1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (boxes[m].getBoundingClientRect().top <= mid) { best = m; lo = m + 1; } else hi = m - 1; }
    if (best !== current) { current = best; o.onPage?.(current, total); }
  };
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(track); };
  window.addEventListener("scroll", onScroll, { passive: true });

  const header = () => (document.querySelector(".rd-top")?.offsetHeight || 0) + 6;
  const goTo = (n) => { n = Math.min(total, Math.max(1, Math.round(n) || 1)); current = n; const r = boxes[n].getBoundingClientRect(); window.scrollTo({ top: window.scrollY + r.top - header(), behavior: "auto" }); o.onPage?.(current, total); want(n); };

  function relayout() {
    const keep = current; dims = sizes();
    for (let i = 1; i <= total; i++) { release(i); boxes[i].style.width = dims.w + "px"; boxes[i].style.height = dims.h + "px"; }
    near.clear(); io.disconnect(); boxes.slice(1).forEach((b) => io.observe(b));
    requestAnimationFrame(() => goTo(keep));
  }
  let rz = 0, lastW = host.clientWidth;
  const onResize = () => { clearTimeout(rz); rz = setTimeout(() => { if (!dead && Math.abs(host.clientWidth - lastW) > 40) { lastW = host.clientWidth; relayout(); } }, 250); };
  window.addEventListener("resize", onResize);

  const ctl = {
    pages: total, get page() { return current; }, get zoom() { return zoom; },
    goTo,
    setZoom(z) { z = Math.min(ZOOMS[ZOOMS.length - 1], Math.max(ZOOMS[0], z)); if (z === zoom) return; zoom = z; relayout(); },
    setNight(b) { host.classList.toggle("rd-night", !!b); },
    destroy() { dead = true; window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onResize); io.disconnect(); for (const n of [...state.keys()]) release(n); queue.length = 0; try { pdf.destroy?.(); } catch {} try { task.destroy(); } catch {} host.replaceChildren(); },
  };
  if (current > 1) requestAnimationFrame(() => goTo(current)); else want(1);
  o.onPage?.(current, total);
  return ctl;
}
