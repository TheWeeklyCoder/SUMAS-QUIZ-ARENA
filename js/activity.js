// Live activity pop-ups (paid students only). Real events only. Built to be cheap on the free plan:
//  - no live listener: one small read (3 documents) every 5 minutes or more, only while the app is visible and online
//  - never during a quiz, tournament or match; at most one pop-up per poll, shown for 6 seconds
//  - a per-device daily read budget, a kill switch in Admin > Settings, and an opt-out in Profile
//  - writing is limited too: one event per 10 minutes per device, and only if the student allows being shown
import { db, collection, doc, getDocs, setDoc, query, orderBy, limit, serverTimestamp } from "./firebase.js";
import { state, isPaid } from "./state.js";
import { ACTIVITY, pickActivity, activityText, mayPostActivity } from "./lib/lobby.js";
import { ls, toMillis, dayKey, esc } from "./lib/util.js";
import { isOnline } from "./net.js";
import { icon } from "./ui.js";

const enabled = () => state.settings?.activityFeedEnabled === true;
const everyMs = () => window.__act_every ?? Math.max(ACTIVITY.minPollMinutes, Number(state.settings?.activityEveryMin) || ACTIVITY.minPollMinutes) * 60000;   // window.__act_* only exist so tests can run fast
export const viewPref = () => ls("activity_view") !== false;
export const setViewPref = (on) => ls("activity_view", !!on);

/** Tell the feed about something this student just did. Quietly does nothing when not allowed. */
export function postActivity(type, bank) {
  try {
    if (!enabled() || !isPaid() || !state.profile?.showActivity || !state.user) return;
    const key = "activity_post_" + state.user.uid;
    if (!mayPostActivity(ls(key))) return;
    ls(key, Date.now());
    setDoc(doc(collection(db, "activity")), { uid: state.user.uid, nick: state.profile.nickname, type, bank: String(bank || "a set").slice(0, 60), createdAt: serverTimestamp() }).catch(() => {});
  } catch { /* never get in the way */ }
}

const quietRoute = () => /^#\/(quiz|play|matchplay)\//.test(location.hash);
let timer = null, gen = 0;

function show(text) {
  document.getElementById("act-pop")?.remove();
  const el = document.createElement("div");
  el.id = "act-pop"; el.className = "act-pop"; el.setAttribute("role", "status");
  el.innerHTML = `${icon("sparkle", "sm")}<span>${esc(text)}</span>`;
  el.onclick = () => el.remove();
  document.body.append(el);
  setTimeout(() => el.remove(), ACTIVITY.showMs);
}

async function poll() {
  if (!state.user || !enabled() || !isPaid() || !viewPref() || document.hidden || !isOnline() || quietRoute()) return;
  const day = "activity_reads_" + dayKey(), used = ls(day) || 0;
  if (used + ACTIVITY.readsPerPoll > ACTIVITY.dailyReadBudget) return;
  try {
    const snap = await getDocs(query(collection(db, "activity"), orderBy("createdAt", "desc"), limit(ACTIVITY.readsPerPoll)));
    ls(day, used + Math.max(1, snap.size));
    const events = snap.docs.map((d) => ({ id: d.id, ...d.data(), at: toMillis(d.data().createdAt) || 0 }));
    const ev = pickActivity(events, { me: state.user.uid, lastShownAt: ls("activity_last_" + state.user.uid) || 0 });
    if (ev) { ls("activity_last_" + state.user.uid, ev.at); show(activityText(ev)); }
  } catch { /* offline or locked: try again next time */ }
}

export function startActivityFeed() {
  stopActivityFeed();
  const my = ++gen;      // a poll still running from a previous login must not start a second loop
  const loop = () => { timer = setTimeout(async () => { await poll(); if (timer && my === gen) loop(); }, everyMs()); };
  timer = setTimeout(async () => { await poll(); if (timer && my === gen) loop(); }, window.__act_first ?? 45000);
}
export function stopActivityFeed() { if (timer) clearTimeout(timer); timer = null; document.getElementById("act-pop")?.remove(); }
