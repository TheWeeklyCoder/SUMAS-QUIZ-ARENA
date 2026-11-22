// Scheduled compulsory update (like WhatsApp's "update required by ..."). The admin sets requireBuild (+ optional requireBy, updateMessage)
// in settings/app. A student whose APP_BUILD is lower sees a notice with the date, then a blocking "Update required" screen once the date passes.
// Safety: nothing is enforced until the new files are really published (we read js/version.js from the server), and everything fails open offline.
import { state } from "./state.js";
import { APP_BUILD } from "./version.js";
import { toMillis, esc, fmtDateTime } from "./lib/util.js";

const isFocus = (p) => p.startsWith("/quiz") || p.startsWith("/play/") || p.startsWith("/matchplay/") || p.startsWith("/read/");
let deployed = null, deployedAt = 0;

/** What the admin asked for: { req, by, msg } (req 0 = nothing required). */
export function policy(settings = state.settings) {
  return { req: Number(settings?.requireBuild) || 0, by: toMillis(settings?.requireBy) || 0, msg: String(settings?.updateMessage || "").slice(0, 300) };
}

/** Pure decision, exported for tests. deployedBuild = build number published on the server (null = unknown). */
export function decide({ req, by }, deployedBuild, now = Date.now(), mine = APP_BUILD) {
  if (!req || mine >= req) return "none";
  if (deployedBuild == null || deployedBuild < req) return "none";   // not published yet (or unknown / offline): never lock anyone out
  return !by || now >= by ? "block" : "notice";
}

async function deployedBuildNumber() {
  if (deployed != null && Date.now() - deployedAt < 120000) return deployed;
  try {
    const r = await fetch(`js/version.js?cb=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return deployed;
    const m = /APP_BUILD\s*=\s*(\d+)/.exec(await r.text());
    deployed = m ? Number(m[1]) : null; deployedAt = Date.now();
  } catch { /* offline: keep what we knew */ }
  return deployed;
}

/** Refresh every file from the server, drop the old copies and reload. */
export async function applyUpdate() {
  try {
    const n = Number(sessionStorage.getItem("upd_try") || 0) + 1; sessionStorage.setItem("upd_try", String(n));
    try {   // the browser's own cache can keep old files for minutes, so re-download the app files first
      const sw = await (await fetch(`sw.js?cb=${Date.now()}`, { cache: "no-store" })).text();
      const files = [...new Set([...sw.matchAll(/"([^"]+\.(?:js|css|html|json|webmanifest))"/g)].map((m) => m[1]))];
      await Promise.allSettled(files.map((f) => fetch(f, { cache: "reload" })));
    } catch { /* carry on */ }
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) || [];
    await Promise.all(regs.map((r) => r.unregister()));
    await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
  } catch { /* still reload */ }
  location.replace(location.pathname + "?u=" + Date.now() + location.hash);
}

let ui = null;
const clear = () => { ui?.remove(); ui = null; };
const when = (by) => fmtDateTime(by);

function draw(mode, p) {
  clear();
  const tries = Number(sessionStorage.getItem("upd_try") || 0);
  ui = document.createElement("div");
  if (mode === "notice") {
    ui.style.cssText = "position:fixed;left:0;right:0;bottom:calc(env(safe-area-inset-bottom,0px) + 76px);z-index:90;display:flex;justify-content:center;padding:0 12px;pointer-events:none";
    ui.innerHTML = `<div class="banner banner-info" role="status" style="pointer-events:auto;border:2px solid var(--edge);border-radius:16px;max-width:520px"><span>Update required by <strong>${esc(when(p.by))}</strong>. ${esc(p.msg || "Update now so nothing stops working.")}</span><button class="btn small primary" data-up>Update now</button></div>`;
  } else {
    ui.style.cssText = "position:fixed;inset:0;z-index:300;background:var(--bg);display:flex;align-items:center;justify-content:center;padding:24px";
    ui.innerHTML = `<section class="card stack center" style="max-width:420px" role="alertdialog" aria-modal="true" aria-labelledby="updh"><h2 id="updh">Update required</h2>
      <p class="muted">${esc(p.msg || "A new version of SUMAS Quiz Arena is ready. Please update to keep using the app. Your progress is safe.")}</p>
      ${tries >= 2 ? '<p class="small error">Still on the old version? Close the app completely and open it again. If that does not help, clear this site\'s data in your browser settings (your progress is saved to your account).</p>' : ""}
      <button class="btn primary block" data-up>Update now</button></section>`;
  }
  document.body.append(ui);
  ui.querySelector("[data-up]").onclick = (e) => { e.target.disabled = true; e.target.textContent = "Updating..."; applyUpdate(); };
}

/** Call after settings refresh, on route changes and when the app comes back to the front. */
export async function checkUpdate(path = "/") {
  if (!state.user) { clear(); return "none"; }
  const p = policy();
  if (!p.req || APP_BUILD >= p.req) { clear(); sessionStorage.removeItem("upd_try"); return "none"; }
  const d = await deployedBuildNumber();
  let mode = decide(p, d);
  if (mode === "block" && isFocus(path)) mode = "notice";   // never cut off a quiz in progress; the block lands when it ends
  if (mode === "none") { clear(); return mode; }
  if (mode === "notice" && !p.by) p.by = Date.now();
  draw(mode, p);
  return mode;
}
