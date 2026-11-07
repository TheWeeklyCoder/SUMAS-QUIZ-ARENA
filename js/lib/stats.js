// Pure helpers for the student Progress page. Everything is computed from progress/{uid}.recent (no extra reads).
import { dayKey, pct } from "./util.js";

const DAY = 86400000;
export const MAX_WRONG_KEPT = 100;     // per session, keeps the progress document small

/** Grid of the last `weeks` weeks, Monday first. Each cell: { day, n, today, future }. */
export function calendarDays(recent, weeks = 5, now = Date.now()) {
  const counts = {};
  for (const r of recent || []) { const k = dayKey(new Date(r.at)); counts[k] = (counts[k] || 0) + 1; }
  const today = new Date(now); today.setHours(12, 0, 0, 0);
  const mondayOffset = (today.getDay() + 6) % 7;
  const start = new Date(today.getTime() - (mondayOffset + (weeks - 1) * 7) * DAY);
  const out = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start.getTime() + i * DAY), k = dayKey(d);
    out.push({ day: k, n: counts[k] || 0, today: k === dayKey(today), future: d.getTime() > today.getTime() + 6 * 3600000 });
  }
  return out;
}

/** Accuracy per bank over all saved sessions: [{ bank, c, t, pct, sessions }] best first. */
export function bankAccuracy(recent) {
  const m = new Map();
  for (const r of recent || []) {
    const b = r.bank || "other", x = m.get(b) || { bank: b, c: 0, t: 0, sessions: 0 };
    x.c += r.score; x.t += r.total; x.sessions++; m.set(b, x);
  }
  return [...m.values()].map((x) => ({ ...x, pct: pct(x.c, x.t) })).sort((a, b) => b.t - a.t);
}

/** Average seconds per question across sessions that recorded a time. */
export function avgSecPerQuestion(recent) {
  let s = 0, q = 0;
  for (const r of recent || []) if (r.sec > 0 && r.total > 0) { s += r.sec; q += r.total; }
  return q ? Math.round(s / q) : null;
}

/** Latest session against the average of up to 3 sessions before it. null if there is nothing to compare. */
export function improvement(recent) {
  const rs = (recent || []).filter((r) => r.total > 0);
  if (rs.length < 2) return null;
  const last = pct(rs[0].score, rs[0].total), prev = rs.slice(1, 4).map((r) => pct(r.score, r.total));
  const prevAvg = Math.round(prev.reduce((a, b) => a + b, 0) / prev.length);
  return { last, prevAvg, delta: last - prevAvg, sessions: prev.length };
}

/** Route segment for an attempt id: taster attempts are stored as taster_<bank> but opened as /quiz/<bank>/taster. */
export const routeSetId = (attemptId) => (String(attemptId).startsWith("taster_") ? "taster" : attemptId);

/**
 * A fail log made at version `v` still matches the live set (version `live`) when no question number has moved since.
 * `stable` is the first version whose numbering is still intact (appending questions keeps it; replacing a set resets it).
 */
export const logStillValid = (v, live, stable) => v <= live && v >= (stable === undefined ? live : stable);

/**
 * "Questions you keep missing". Looks at the saved fail logs (recent[].w) per set.
 * versionOf(attemptId) returns the live version of that set so we ignore logs from an older upload (question numbers may have moved).
 * Returns [{ id, bank, title, current:[idx], repeat:[idx] }] where current = missed in the latest session
 * and repeat = missed in two or more sessions.
 */
export function keepMissing(recent, versionOf = () => undefined, stableOf = () => undefined) {
  const by = new Map();
  for (const r of recent || []) {                      // newest first
    if (!Array.isArray(r.w)) continue;
    const live = versionOf(r.id);
    if (live === -1) continue;                         // the set no longer exists
    if (live !== undefined && r.v !== undefined && !logStillValid(r.v, live, stableOf(r.id))) continue;
    (by.get(r.id) || by.set(r.id, []).get(r.id)).push(r);
  }
  const out = [];
  for (const [id, list] of by) {
    const latest = list[0], counts = {};
    for (const s of list) for (const i of new Set(s.w)) counts[i] = (counts[i] || 0) + 1;
    const current = [...new Set(latest.w)].sort((a, b) => a - b);
    if (!current.length) continue;
    const repeat = current.filter((i) => counts[i] >= 2);
    out.push({ id, bank: latest.bank, title: latest.title, current, repeat, sessions: list.length });
  }
  return out.sort((a, b) => b.repeat.length - a.repeat.length || b.current.length - a.current.length);
}

/** Trim a wrong-list for storage. */
export const keepWrong = (wrong) => (wrong || []).slice(0, MAX_WRONG_KEPT);
