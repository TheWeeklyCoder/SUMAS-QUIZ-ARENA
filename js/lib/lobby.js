// Pure logic for group matches, live activity pop-ups and backup restore. No Firebase, no DOM.
import { mulberry32, shuffle } from "./quiz.js";

export const LOBBY_DEFAULTS = { minPlayers: 10, maxPlayers: 40, extendMinutes: 5, matchMinutes: 20, maxExtensions: 6 };
export const lobbyConfig = (s = {}) => {
  const maxPlayers = Math.max(2, Math.min(60, Number(s.maxPlayers) || LOBBY_DEFAULTS.maxPlayers));
  return {
  minPlayers: Math.min(maxPlayers, Math.max(2, Number(s.minPlayers) || LOBBY_DEFAULTS.minPlayers)),   // a minimum above the maximum could never be reached
  maxPlayers,
  extendMinutes: Math.max(1, Math.min(30, Number(s.extendMinutes) || LOBBY_DEFAULTS.extendMinutes)),
  matchMinutes: Math.max(5, Math.min(90, Number(s.matchMinutes) || LOBBY_DEFAULTS.matchMinutes)),
  maxExtensions: LOBBY_DEFAULTS.maxExtensions,
  };
};

/**
 * One word for where a lobby is. l: { status, opensAtMs, startsAtMs, endsAtMs, joinedCount, minPlayers }
 * upcoming (join not open yet) | joining | waiting (start time passed, not enough players) | live | ended (awaiting grading) | cancelled | graded
 */
export function lState(l, now = Date.now()) {
  if (!l) return "cancelled";
  if (l.status === "cancelled") return "cancelled";
  if (l.status === "graded") return "graded";
  if (now >= l.endsAtMs) return "ended";
  if (now < l.opensAtMs) return "upcoming";
  if (now < l.startsAtMs) return "joining";
  return (l.joinedCount || 0) >= (l.minPlayers || LOBBY_DEFAULTS.minPlayers) ? "live" : "waiting";
}

/**
 * The host's rule, applied at the start time when too few players have joined:
 * extend by N minutes once; after an extension, cancel if nobody NEW joined, otherwise extend again (up to a cap).
 * Returns { action: "none" | "extend" | "cancel", reason }.
 */
export function decide(l, now, cfg = lobbyConfig()) {
  if (!l || l.status !== "scheduled") return { action: "none", reason: "not scheduled" };
  if (now < l.startsAtMs) return { action: "none", reason: "not started" };
  const min = l.minPlayers || cfg.minPlayers, joined = l.joinedCount || 0;
  if (joined >= min) return { action: "none", reason: "enough players" };
  const ext = l.extensions || 0;
  if (ext === 0) return { action: "extend", reason: "short of players, first extension" };
  if (ext >= cfg.maxExtensions) return { action: "cancel", reason: "too many extensions" };
  if (joined <= (l.joinedAtExtend ?? 0)) return { action: "cancel", reason: "nobody new joined during the extension" };
  return { action: "extend", reason: "new players joined, still short" };
}

/** The fields to write when extending (start and end both move, so the match length stays the same). */
export const extensionPatch = (l, cfg = lobbyConfig()) => ({
  startsAtMs: l.startsAtMs + cfg.extendMinutes * 60000, endsAtMs: l.endsAtMs + cfg.extendMinutes * 60000,
  extensions: (l.extensions || 0) + 1, joinedAtExtend: l.joinedCount || 0,
});

/**
 * entries: [{ uid, answers[], durationSec, submittedAt(ms) }], key: [int]. Best score first; a faster time wins a tie, then the earlier submission.
 * Returns rows with rank. Players who never submitted are not ranked.
 */
export function gradeMatch(entries, key) {
  const total = key.length;
  const rows = entries.map((e) => {
    let score = 0;
    for (let i = 0; i < total; i++) if (Array.isArray(e.answers) && e.answers[i] === key[i]) score++;
    return { uid: e.uid, score, total, sec: Math.round(e.durationSec || 0), submittedAt: e.submittedAt || 0 };
  });
  rows.sort((a, b) => b.score - a.score || a.sec - b.sec || a.submittedAt - b.submittedAt || String(a.uid).localeCompare(String(b.uid)));
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

/** Random subset of a set for a match. Keeps each question with its own answer. */
export function sampleQuestions(set, n, seed = Date.now()) {
  const idx = shuffle([...Array(set.questions.length).keys()], mulberry32(seed)).slice(0, Math.min(n, set.questions.length));
  return { questions: idx.map((i) => set.questions[i]), answers: idx.map((i) => set.answers[i]) };
}

/** The same start time on several consecutive days. Returns an array of start timestamps (ms). */
export function dailyStarts(firstStartMs, days) {
  const d0 = new Date(firstStartMs), out = [];
  for (let i = 0; i < Math.max(1, Math.min(14, days)); i++) out.push(new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + i, d0.getHours(), d0.getMinutes()).getTime());
  return out;
}
/** Matches are meant for the evening: 17:00 to 23:59. */
export const isEveningStart = (ms) => { const h = new Date(ms).getHours(); return h >= 17; };

/* ---------------- live activity pop-ups ---------------- */
export const ACTIVITY = { minPollMinutes: 5, maxAgeMs: 30 * 60000, postGapMs: 10 * 60000, showMs: 6000, dailyReadBudget: 400, readsPerPoll: 3 };

export const activityText = (e) => (e.type === "joined" ? `@${e.nick} joined ${e.bank}` : e.type === "record" ? `${e.bank}` : `@${e.nick} just finished ${e.bank}`);

/** Newest event that is recent, not mine, and newer than the last one already shown. events: [{ id, uid, nick, type, bank, at(ms) }] */
export function pickActivity(events, { me, now = Date.now(), lastShownAt = 0, maxAgeMs = ACTIVITY.maxAgeMs } = {}) {
  return [...events].sort((a, b) => b.at - a.at).find((e) => e.uid !== me && e.at > lastShownAt && now - e.at <= maxAgeMs) || null;
}
/** May this device post another activity event? (keeps writes low) */
export const mayPostActivity = (lastPostMs, now = Date.now(), gap = ACTIVITY.postGapMs) => !lastPostMs || now - lastPostMs >= gap;

/* ---------------- backup restore ---------------- */
// Collections the admin can safely write back under the current rules.
export const RESTORABLE = ["banks", "tasters", "sets", "settings", "products", "subscriptions", "setStats", "qStats", "leaderboard", "hallOfFame", "tournaments", "tournamentQuestions", "tournamentKeys"];
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
/** Turn ISO date strings written by the backup back into timestamps (mk = ms => Timestamp). */
export function reviveTimestamps(v, mk) {
  if (typeof v === "string") return ISO.test(v) ? mk(Date.parse(v)) : v;
  if (Array.isArray(v)) return v.map((x) => reviveTimestamps(x, mk));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, reviveTimestamps(x, mk)]));
  return v;
}
/** Read a backup file's text. Returns { ok, error, data, counts }. */
export function readBackup(text) {
  let j; try { j = JSON.parse(text); } catch { return { ok: false, error: "That file isn't a valid backup (it can't be read as JSON)." }; }
  if (!j || j.app !== "sumas-quiz-arena" || typeof j.data !== "object") return { ok: false, error: "That doesn't look like a SUMAS backup file." };
  const counts = Object.fromEntries(Object.entries(j.data).map(([k, v]) => [k, Object.keys(v || {}).length]));
  return { ok: true, data: j.data, counts, exportedAt: j.exportedAt };
}
