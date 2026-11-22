// Connectivity banner: one non-blocking, plain-language message at a time (aria-live).
import { esc } from "./lib/util.js";

const PRIORITY = { offline: 5, busy: 4, error: 4, locked: 3, slow: 2, online: 1, info: 1 };
const MESSAGES = {
  offline: "You're offline. Sets you've opened still work and progress will sync when you're back.",
  online: "Back online. Syncing your progress...",
  slow: "Your connection is slow. Loading may take a bit. Nothing is lost.",
  error: "Couldn't load this. Check your internet and tap Retry.",
  locked: "This needs an active subscription.",
  info: "There is something new.",
  busy: "We're very busy today. Please try again later. Your progress is safe.",
};

let shown = null;   // { kind }
let hideTimer = null;
const slot = () => document.getElementById("banner");

export function showBanner(kind, { text, action, actionLabel, href, hrefLabel, autoHide } = {}) {
  if (shown && PRIORITY[shown.kind] > PRIORITY[kind] && kind !== "online") return;
  clearTimeout(hideTimer);
  shown = { kind };
  const el = slot(); if (!el) return;
  el.innerHTML = `<div class="banner banner-${kind}" role="status"><span>${esc(text || MESSAGES[kind])}</span>` +
    (action ? `<button class="btn small" data-act>${esc(actionLabel || "Retry")}</button>` : "") +
    (href ? `<a class="btn small" href="${esc(href)}">${esc(hrefLabel || "See plans")}</a>` : "") + `</div>`;
  if (action) el.querySelector("[data-act]").onclick = () => { clearBanner(kind); action(); };
  if (autoHide) hideTimer = setTimeout(() => clearBanner(kind), autoHide);
}

export function clearBanner(kind) {
  if (kind && shown?.kind !== kind) return;
  clearTimeout(hideTimer);
  shown = null;
  const el = slot(); if (el) el.innerHTML = "";
}

export const isOnline = () => navigator.onLine !== false;

/** Wrap a promise: if it takes longer than `ms`, show the "slow" banner until it settles. */
export async function track(promise, ms = 8000) {
  const t = setTimeout(() => { if (isOnline()) showBanner("slow"); }, ms);
  try { return await promise; }
  finally { clearTimeout(t); clearBanner("slow"); }
}

/** Turn a Firebase error into the right banner. Returns true if it was a known kind. */
export function handleError(e, { retry } = {}) {
  const code = String(e?.code || "").replace("firestore/", "");
  if (code === "permission-denied") { showBanner("locked", { href: "#/plans" }); return true; }
  if (code === "resource-exhausted") { showBanner("busy"); return true; }
  if (code === "unavailable" || code === "timeout" || code === "auth/network-request-failed" || !isOnline()) {
    showBanner(isOnline() ? "error" : "offline", isOnline() ? { action: retry } : {});
    return true;
  }
  return false;
}

export function initNet() {
  window.addEventListener("offline", () => showBanner("offline"));
  window.addEventListener("online", () => {
    showBanner("online", { autoHide: 3000 });
    window.dispatchEvent(new CustomEvent("sumas:online"));
  });
  const c = navigator.connection;
  const check = () => { if (c && /(^|-)2g$/.test(c.effectiveType || "") && isOnline()) showBanner("slow"); else clearBanner("slow"); };
  if (c && c.addEventListener) { c.addEventListener("change", check); check(); }
  if (!isOnline()) showBanner("offline");
}
