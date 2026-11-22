// "Install the app" pop-up: offers the home-screen install once in a while, so students don't have to hunt for it in Profile.
// Android/Chrome: one tap opens the phone's own install box. iPhone/iPad (Safari): shows the two steps, because iOS has no install button.
// Not shown when the app is already installed, while a quiz/match/reader is open, or on top of another pop-up.
import { state } from "./state.js";
import { myLevel } from "./lib/levels.js";
import { ls, esc } from "./lib/util.js";
import { sheet, icon, toast } from "./ui.js";
import { installDue, snooze, isIosSafari, DAY } from "./lib/installrules.js";

const QUIET = ["/login", "/signup", "/forgot", "/onboarding", "/terms", "/level"];
const isFocus = (p) => p.startsWith("/quiz") || p.startsWith("/play/") || p.startsWith("/matchplay/") || p.startsWith("/read/");
const STARTED = Date.now();
let showing = false;

export const isInstalled = () => {
  try { return !!(window.matchMedia?.("(display-mode: standalone)").matches || window.matchMedia?.("(display-mode: window-controls-overlay)").matches || navigator.standalone); } catch { return false; }
};
export const canInstall = () => !isInstalled() && (!!window.__installPrompt || isIosSafari());

/** Starts the phone's install box (Android/Chrome). Resolves true when the student accepted. Used by the pop-up and by Profile. */
export async function runInstall() {
  const ev = window.__installPrompt; if (!ev) return false;
  window.__installPrompt = null;
  try { await ev.prompt(); const c = await ev.userChoice; return c?.outcome === "accepted"; } catch { return false; }
}

export function maybeShowInstall(path) {
  if (showing || !state.user || !state.profile || !state.termsOk || !myLevel()) return;
  if (QUIET.includes(path) || isFocus(path) || document.querySelector(".sheet-back")) return;
  if (Date.now() - STARTED < (window.__installDelayMs ?? 15000) || !canInstall()) return;            // let the student settle in first
  const key = "install_ask_" + state.user.uid;
  if (!installDue(ls(key))) return;
  showing = true;
  const ios = !window.__installPrompt;
  ls(key, snooze(ls(key)));                                             // counts as asked; installing makes it irrelevant
  const s = sheet(`<div class="stack">
    <div class="row" style="align-items:flex-start;gap:12px"><span class="tile">${icon("arrow")}</span><div class="grow"><strong>Open SUMAS like a normal app</strong>
      <div class="small muted">Starts faster, works with a weak connection, and sits on your home screen.</div></div></div>
    ${ios ? `<ol class="small" style="margin:0;padding-left:1.2em"><li>Tap the <strong>Share</strong> button at the bottom of Safari.</li><li>Choose <strong>Add to Home Screen</strong>.</li></ol>
      <button class="btn primary block" data-ok>Got it</button>`
      : `<button class="btn primary block" data-yes>Install the app</button><button class="btn ghost block" data-no>Not now</button>`}</div>`,
    { title: "Install the app", onClose: () => { showing = false; } });
  s.el.querySelector("[data-ok]")?.addEventListener("click", s.close);
  s.el.querySelector("[data-no]")?.addEventListener("click", s.close);
  s.el.querySelector("[data-yes]")?.addEventListener("click", async () => { s.close(); if (await runInstall()) { ls(key, { n: 99, until: Date.now() + 3650 * DAY }); toast("Installing SUMAS", "good"); } });
}

window.addEventListener("appinstalled", () => { window.__installPrompt = null; try { document.querySelector("#install")?.remove(); } catch { /* ignore */ } });
