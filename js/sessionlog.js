// Session log: one small document per visit, so the admin can see who was active and how heavily.
// Cost: 1 write when the visit starts, then at most one update every 45 seconds (and only when something changed).
// The rules allow exactly this: create {uid, startedAt, endedAt, attempts, setReads}, then change only endedAt/attempts/setReads.
// Never blocks the app: every call is fire-and-forget and errors are swallowed.
import { db, doc, collection, setDoc, updateDoc, serverTimestamp } from "./firebase.js";
import { state } from "./state.js";

const KEY = "sumas_log";
const MIN_GAP = 45000;
let ref = null, counts = { attempts: 0, setReads: 0 }, dirty = false, lastFlush = 0, timer = null, wired = false;

const enabled = () => state.settings?.sessionLogsEnabled !== false;
const save = (v) => { try { sessionStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage blocked */ } };
const load = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch { return null; } };

export function startSessionLog(uid) {
  if (!enabled() || !db) return;
  try {
    const saved = load();
    if (saved && saved.uid === uid) {                       // same tab, page reloaded: carry on with the same log
      ref = doc(db, "sessionLogs", saved.id); counts = saved.counts;
    } else {
      ref = doc(collection(db, "sessionLogs"));
      counts = { attempts: 0, setReads: 0 };
      save({ id: ref.id, uid, counts });
      setDoc(ref, { uid, startedAt: serverTimestamp(), endedAt: serverTimestamp(), attempts: 0, setReads: 0 }).catch(() => {});
    }
    if (!wired) {
      wired = true;
      document.addEventListener("visibilitychange", () => { if (document.hidden) flush(true); });
      window.addEventListener("pagehide", () => flush(true));
    }
  } catch { ref = null; }
}

export function stopSessionLog() { flush(true); ref = null; try { sessionStorage.removeItem(KEY); } catch { /* ignore */ } }

/** kind: "attempts" (a finished session) or "setReads" (a question set fetched from the server). */
export function noteSessionEvent(kind) {
  if (!ref || !(kind in counts)) return;
  counts[kind]++; dirty = true;
  save({ id: ref.id, uid: state.user?.uid, counts });
  schedule();
}

function schedule() {
  if (timer) return;
  const wait = Math.max(0, MIN_GAP - (Date.now() - lastFlush));
  timer = setTimeout(() => { timer = null; flush(); }, wait);
}

function flush(force = false) {
  if (!ref || !dirty && !force) return;
  if (!force && Date.now() - lastFlush < MIN_GAP) return schedule();
  if (!dirty && Date.now() - lastFlush < MIN_GAP) return;     // forced flush with nothing new, too soon after the last one
  dirty = false; lastFlush = Date.now();
  updateDoc(ref, { endedAt: serverTimestamp(), attempts: counts.attempts, setReads: counts.setReads }).catch(() => {});
}
