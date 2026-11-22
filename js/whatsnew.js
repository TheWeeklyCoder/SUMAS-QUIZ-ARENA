// "What's new" pop-up: shows the newest release the student has not seen yet, once, with only the items that matter to them.
import { state, isPaid, freeForAll } from "./state.js";
import { RELEASES } from "./lib/releases.js";
import { myLevel } from "./lib/levels.js";
import { ls, esc } from "./lib/util.js";
import { sheet, icon } from "./ui.js";

const QUIET = ["/login", "/signup", "/forgot", "/onboarding", "/terms", "/level"];
const isFocus = (p) => p.startsWith("/quiz") || p.startsWith("/play/") || p.startsWith("/matchplay/") || p.startsWith("/read/");
let showing = false;

/** The release to show right now, with its visible items, or null. Pure apart from reading state; exported for tests. */
export function pendingRelease(releases = RELEASES) {
  const uid = state.user?.uid; if (!uid || !state.profile) return null;
  const seen = ls("seen_release_" + uid);
  const joined = Number(state.profile.createdAt) || 0;
  const u = { level: myLevel(), paid: isPaid(), free: freeForAll(), admin: !!state.isAdmin };
  for (const r of releases) {                       // newest first
    if (r.id === seen) return null;                 // everything from here down is older or already seen
    if (joined && joined >= Date.parse(r.at)) continue;   // joined after it shipped: not new to them
    const items = r.items.filter((i) => { try { return i.show ? i.show(u) : true; } catch { return false; } });
    if (items.length) return { ...r, items };
  }
  return null;
}

export function maybeShowWhatsNew(path) {
  if (showing || !state.user || !state.profile || !state.termsOk || !myLevel()) return;
  if (QUIET.includes(path) || isFocus(path) || document.querySelector(".sheet-back")) return;
  const r = pendingRelease(); if (!r) return;
  showing = true;
  ls("seen_release_" + state.user.uid, RELEASES[0].id);   // mark the newest as seen so older ones never queue up behind it
  const s = sheet(`<div class="stack">
    ${r.items.map((i) => `<div class="row" style="align-items:flex-start;gap:12px"><span class="tile">${icon(i.icon || "sparkle")}</span><div class="grow"><strong>${esc(i.title)}</strong><div class="small muted">${esc(i.text)}</div></div></div>`).join("")}
    <button class="btn primary block" data-ok>Got it</button></div>`, { title: r.title, onClose: () => { showing = false; } });
  s.el.querySelector("[data-ok]").onclick = s.close;
}
