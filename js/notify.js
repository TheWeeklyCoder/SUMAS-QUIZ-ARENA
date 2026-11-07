// Alerts for new group matches and tournaments, without a server.
// While the app is open (or comes back to the front) we look for matches and tournaments this phone has not seen yet and say so.
// If the student switched on phone notifications in Profile, the alert also appears as a normal phone notification (only while the app
// is still running in the background: a closed app can't be woken without a push server, which the free plan doesn't have).
// Cost: at most 2 small reads (3 to 5 documents each) every 3 hours per student, and nothing while the app is closed.
import { db, collection, getDocs, query, orderBy, limit } from "./firebase.js";
import { state, isPaid } from "./state.js";
import { ls, toMillis } from "./lib/util.js";
import { lState } from "./lib/lobby.js";
import { tState } from "./lib/tournament.js";
import { showBanner } from "./net.js";
import { go } from "./router.js";

const EVERY = 3 * 3600 * 1000;     // look at most this often
const SEEN_MAX = 60;

/** Pure: which of these items are worth telling the student about? items: [{ kind, id, title, startsAtMs, st }] */
export function newAlerts(items, seen) {
  const have = new Set(seen || []);
  return items.filter((x) => !have.has(`${x.kind}:${x.id}`) && ["upcoming", "joining", "waiting", "open"].includes(x.st))
    .sort((a, b) => a.startsAtMs - b.startsAtMs);
}

export const alertsOn = () => ls("alerts_on") !== false;           // in-app alerts: on unless switched off
export const pushOn = () => ls("alerts_push") === true && typeof Notification !== "undefined" && Notification.permission === "granted";

/** Turn phone notifications on or off (asks the browser for permission the first time). Returns the resulting state. */
export async function setPush(on) {
  if (!on) { ls("alerts_push", false); return false; }
  if (typeof Notification === "undefined") return false;
  const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  ls("alerts_push", perm === "granted"); return perm === "granted";
}

async function fetchItems() {
  const out = [];
  const jobs = [];
  if (isPaid()) jobs.push(getDocs(query(collection(db, "lobbies"), orderBy("startsAt", "desc"), limit(5))).then((s) => s.docs.forEach((d) => {
    const x = d.data(), l = { ...x, startsAtMs: toMillis(x.startsAt), opensAtMs: toMillis(x.opensAt), endsAtMs: toMillis(x.endsAt) };
    out.push({ kind: "match", id: d.id, title: x.title || "Group match", startsAtMs: l.startsAtMs, st: lState(l) });
  })).catch(() => {}));
  jobs.push(getDocs(query(collection(db, "tournaments"), orderBy("startsAt", "desc"), limit(5))).then((s) => s.docs.forEach((d) => {
    const x = d.data(); if (x.status !== "published") return;
    const t = { ...x, startsAtMs: toMillis(x.startsAt), endsAtMs: toMillis(x.endsAt) };
    out.push({ kind: "tournament", id: d.id, title: x.title || "Tournament", startsAtMs: t.startsAtMs, st: tState(t) });
  })).catch(() => {}));
  await Promise.all(jobs);
  return out;
}

function tell(list) {
  const first = list[0], path = `/${first.kind}/${first.id}`;
  const text = list.length === 1 ? `New ${first.kind === "match" ? "match" : "tournament"}: ${first.title}` : `${list.length} new matches and tournaments, starting with ${first.title}`;
  showBanner("info", { text, action: () => go(list.length === 1 ? path : "/arena"), actionLabel: "View", autoHide: 15000 });
  if (pushOn() && document.hidden && "serviceWorker" in navigator) {
    navigator.serviceWorker.ready.then((r) => r.showNotification("SUMAS Quiz Arena", { body: text, icon: "icons/icon-192.png", tag: "sumas-new", data: { url: `${location.pathname}#${list.length === 1 ? path : "/arena"}` } })).catch(() => {});
  }
}

let timer = null, busy = false;
export async function checkNow({ force = false } = {}) {
  if (busy || !state.user || !state.profile || !state.termsOk || !alertsOn() || !navigator.onLine) return;
  const last = Number(ls("alerts_checked_at")) || 0;
  if (!force && Date.now() - last < EVERY) return;
  busy = true;
  try {
    const items = await fetchItems();
    const first = last === 0;                          // first ever look on this phone: remember what exists, don't announce it
    const seen = ls("alerts_seen") || [];
    const fresh = first ? [] : newAlerts(items, seen);
    ls("alerts_seen", [...new Set([...items.map((x) => `${x.kind}:${x.id}`), ...seen])].slice(0, SEEN_MAX));
    ls("alerts_checked_at", Date.now());
    if (fresh.length) tell(fresh);
  } catch { /* never bother the student */ } finally { busy = false; }
}

const onVisible = () => { if (!document.hidden) checkNow(); };
export function startNotifier() {
  stopNotifier();
  setTimeout(() => checkNow(), 4000);                  // after the first screen has loaded
  document.addEventListener("visibilitychange", onVisible);
  timer = setInterval(() => { if (!document.hidden) checkNow(); }, 30 * 60 * 1000);
}
export function stopNotifier() { clearInterval(timer); timer = null; document.removeEventListener("visibilitychange", onVisible); }
