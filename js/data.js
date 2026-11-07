// Data access: user context, catalogue, question sets (cached), progress and attempts.
// Everything is written to keep Firestore reads low (free plan).
import { db, doc, getDoc, getDocs, setDoc, collection, query, where, limit, serverTimestamp } from "./firebase.js";
import { state, isPaid } from "./state.js";
import { APP } from "./config.js";
import { cacheGet, cacheSet } from "./cache.js";
import { isOnline } from "./net.js";
import { TERMS_VERSION } from "./terms.js";
import { ls, toMillis, plain, settle, slug, dayKey, weekKey } from "./lib/util.js";
import { keepWrong } from "./lib/stats.js";
import { noteSessionEvent } from "./sessionlog.js";
import { setCustomAvatars, setPremiumAvatars } from "./avatars.js";

const DAY = 86400000;

/* ---------- User context (profile, subscription, admin flag, settings) ---------- */

export async function loadSettings() {
  const [a, p, av] = await Promise.allSettled([getDoc(doc(db, "settings", "app")), getDoc(doc(db, "settings", "plans")), getDoc(doc(db, "settings", "avatars"))]);
  // Extra profile pictures added by the admin; kept on this phone so they still show offline.
  if (av.status === "fulfilled") { const d = av.value.exists() ? plain(av.value.data()) : {}; setCustomAvatars(d.items || []); setPremiumAvatars(d.premium ?? null); ls("avatars_custom", { items: d.items || [], premium: d.premium ?? null }); }
  else { const c = ls("avatars_custom") || {}; setCustomAvatars(Array.isArray(c) ? c : c.items || []); setPremiumAvatars(c.premium ?? null); }
  const okA = a.status === "fulfilled", okP = p.status === "fulfilled";
  state.settings = okA ? (a.value.exists() ? plain(a.value.data()) : {}) : ls("settings_app") || {};
  state.plans = okP ? (p.value.exists() ? plain(p.value.data()) : {}) : ls("settings_plans") || {};
  if (okA) ls("settings_app", state.settings);
  if (okP) ls("settings_plans", state.plans);
}

export async function loadQuotes() {
  try {
    const r = await fetch("content/quotes.json", { cache: "no-cache" });
    state.quotes = await r.json();
  } catch {
    state.quotes = { home: ["Keep going. Every question counts."], low: ["Review the missed ones and try again."], medium: ["Good work. Keep practising."], high: ["Excellent work."] };
  }
  // Quotes the admin added (Admin > Quotes) are mixed in with the built-in ones. They are { t, by? } objects.
  let extra = ls("quotes_admin") || {};
  // One read at most every 6 hours (quotes change rarely), so this costs almost nothing on the free plan.
  if (Date.now() - (Number(ls("quotes_admin_at")) || 0) > 6 * 3600 * 1000) {
    try { const s = await getDoc(doc(db, "settings", "quotes")); extra = s.exists() ? plain(s.data()) : {}; ls("quotes_admin", extra); ls("quotes_admin_at", Date.now()); } catch { /* offline: use the saved copy */ }
  }
  for (const band of ["home", "low", "medium", "high"]) if (Array.isArray(extra[band])) state.quotes[band] = [...(state.quotes[band] || []), ...extra[band]];
}

/** Returns { ok } where ok=false means we could not reach the server and have no cached copy. */
export async function loadUserContext(user) {
  const uid = user.uid;
  const [prof, sub, adm] = await Promise.allSettled([
    getDoc(doc(db, "profiles", uid)), getDoc(doc(db, "subscriptions", uid)), getDoc(doc(db, "admins", uid)),
  ]);

  if (prof.status === "fulfilled") {
    const d = prof.value.exists() ? prof.value.data() : null;
    state.profile = d && { ...d, nicknameChangedAt: toMillis(d.nicknameChangedAt), createdAt: toMillis(d.createdAt) };
    ls("profile_" + uid, state.profile);
  } else {
    const cached = ls("profile_" + uid);
    if (!cached) return { ok: false };
    state.profile = cached;
  }

  if (sub.status === "fulfilled") {
    const d = sub.value.exists() ? sub.value.data() : null;
    state.sub = d && { plan: d.plan, expiresAt: toMillis(d.expiresAt) };
    ls("sub_" + uid, state.sub);
  } else state.sub = ls("sub_" + uid);

  if (adm.status === "fulfilled") { state.isAdmin = adm.value.exists(); ls("admin_" + uid, state.isAdmin); }
  else state.isAdmin = !!ls("admin_" + uid);

  await Promise.all([loadSettings(), state.profile ? loadProgress(uid) : null]);
  if (state.profile) await checkTerms(uid);
  return { ok: true };
}

/** Terms accepted for the current version? Cached per version so we don't read every login. */
export async function checkTerms(uid) {
  if (ls("terms_" + uid) === TERMS_VERSION) { state.termsOk = true; return true; }
  try {
    const s = await getDoc(doc(db, "termsAcceptances", `${uid}_${TERMS_VERSION}`));
    state.termsOk = s.exists();
  } catch (e) {
    // A missing document is denied by the rules (resource is null), which means "not accepted yet".
    state.termsOk = false;
    if (e?.code !== "permission-denied" && !isOnline()) state.termsOk = !!ls("terms_" + uid);
  }
  if (state.termsOk) ls("terms_" + uid, TERMS_VERSION);
  return state.termsOk;
}

/* ---------- Catalogue and content ---------- */

let banksMem = null, banksAt = 0, banksStale = false;
const byTitle = (a, b) => String(a.title).localeCompare(String(b.title));

export async function loadBanks({ force = false } = {}) {
  if (banksStale) { force = true; banksStale = false; }   // the admin changed something: skip both caches once
  const ttl = APP.banksCacheMinutes * 60000;
  if (!force && banksMem && Date.now() - banksAt < ttl) return banksMem;
  const cached = await cacheGet("banks");
  if (!force && cached && Date.now() - cached.savedAt < ttl) { banksMem = cached.value; banksAt = cached.savedAt; return banksMem; }
  try {
    const snap = await getDocs(collection(db, "banks"));
    banksMem = plain(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byTitle));
    banksAt = Date.now();
    await cacheSet("banks", banksMem);
    return banksMem;
  } catch (e) {
    if (cached) { banksMem = cached.value; return banksMem; }
    throw e;
  }
}
export const invalidateBanks = () => { banksMem = null; banksAt = 0; banksStale = true; };

export async function loadTaster(bankId) {
  const key = "taster:" + bankId;
  const cached = await cacheGet(key);
  const fresh = cached && Date.now() - cached.savedAt < APP.tasterCacheHours * 3600000;
  if (fresh || (cached && !isOnline())) return cached.value;
  try {
    const s = await getDoc(doc(db, "tasters", bankId));
    if (!s.exists()) return null;
    const value = plain({ id: bankId, ...s.data() });
    noteSessionEvent("setReads");
    await cacheSet(key, value);
    return value;
  } catch (e) { if (cached) return cached.value; throw e; }
}

/** Full set. Needs an active subscription (the rules enforce it; the check here just saves a failed read). */
export async function loadSet(setId, catalogueVersion) {
  const key = "set:" + setId;
  const cached = await cacheGet(key);
  const fresh = cached && Date.now() - cached.savedAt < APP.setCacheDays * DAY;
  if (isOnline() && !isPaid()) throw Object.assign(new Error("locked"), { code: "permission-denied" });
  if (cached && fresh && (!isOnline() || (catalogueVersion && cached.value.version === catalogueVersion))) return cached.value;
  try {
    const s = await getDoc(doc(db, "sets", setId));
    if (!s.exists()) throw Object.assign(new Error("missing"), { code: "not-found" });
    const value = plain({ id: setId, ...s.data() });
    noteSessionEvent("setReads");
    await cacheSet(key, value);
    return value;
  } catch (e) { if (cached && fresh && e?.code !== "permission-denied") return cached.value; throw e; }
}

/* ---------- Progress and attempts ---------- */

export const defaultProgress = () => ({
  recent: [], topics: {}, streak: 0, lastActiveDay: null, weeklyGoal: 5,
  weekProgress: { week: "", n: 0 }, bestScore: 0, totalScore: 0,
});
const PROGRESS_KEYS = Object.keys(defaultProgress());
const cleanProgress = (d) => { const o = defaultProgress(); for (const k of PROGRESS_KEYS) if (d[k] !== undefined) o[k] = d[k]; return o; };

export async function loadProgress(uid) {
  try {
    const s = await getDoc(doc(db, "progress", uid));
    state.progress = s.exists() ? cleanProgress(plain(s.data())) : defaultProgress();
    ls("progress_" + uid, state.progress);
  } catch {
    state.progress = ls("progress_" + uid) || defaultProgress();
  }
  return state.progress;
}

/**
 * Record a finished session: one attempts write (first attempt only, carries the fail log)
 * and one progress write. Both are queued offline by Firestore and sync later.
 * partial = a custom run (fewer questions than the set, or one topic). It counts toward streak, weekly goal and topic totals,
 * but is never the "first attempt": no attempts write, no points, no rank, and it can't use up the student's one ranked go.
 */
export async function saveSession({ bankId, attemptId, title, score, total, wrong, durationSec, byTopic, version, partial = false }) {
  const uid = state.user.uid;
  const doneKey = "done_" + uid;
  const done = new Set(ls(doneKey) || []);
  const p = plain(state.progress || defaultProgress());
  let first = !partial && !done.has(attemptId) && !p.recent.some((r) => r.id === attemptId && !r.part);
  let status = "saved";

  if (first) {
    const r = await settle(setDoc(doc(db, "attempts", `${uid}_${attemptId}`), {
      uid, setId: attemptId, bankId, score, total, wrong, durationSec: Math.round(durationSec), createdAt: serverTimestamp(),
    }));
    if (r === "denied") first = false;        // an attempt already exists: this one is a repeat
    else if (r === "pending") status = "queued";
  }
  if (!partial) { done.add(attemptId); ls(doneKey, [...done]); }

  // w = original numbers of the questions missed, v = set version: "questions you keep missing" is built from these.
  p.recent.unshift({ id: attemptId, bank: bankId, title, score, total, sec: Math.round(durationSec), at: Date.now(), first, w: keepWrong(wrong), v: version, ...(partial ? { part: true } : {}) });
  p.recent = p.recent.slice(0, 50);
  for (const [name, v] of Object.entries(byTopic)) {
    const k = slug(name) || "general";
    const cur = p.topics[k] || { name, c: 0, t: 0 };
    cur.c += v.c; cur.t += v.t; cur.name = name; p.topics[k] = cur;
  }
  const today = dayKey();
  if (p.lastActiveDay !== today) {
    p.streak = p.lastActiveDay === dayKey(new Date(Date.now() - DAY)) ? p.streak + 1 : 1;
    p.lastActiveDay = today;
  }
  const wk = weekKey();
  if (p.weekProgress.week !== wk) p.weekProgress = { week: wk, n: 0 };
  p.weekProgress.n++;
  if (!partial) p.bestScore = Math.max(p.bestScore, total ? Math.round((score / total) * 100) : 0);
  if (first) p.totalScore += score;

  const { updatedAt, ...rest } = p;
  const r2 = await settle(setDoc(doc(db, "progress", uid), { ...cleanProgress(rest), updatedAt: serverTimestamp() }));
  if (r2 === "pending") status = "queued";
  state.progress = p; ls("progress_" + uid, p);
  noteSessionEvent("attempts");
  return { status, first };
}

/** Change the weekly session goal (1 to 14). Saved with the rest of the progress document. */
export async function setWeeklyGoal(n) {
  const goal = Math.max(1, Math.min(14, Math.round(Number(n)) || 5));
  const p = plain(state.progress || defaultProgress());
  p.weeklyGoal = goal;
  const { updatedAt, ...rest } = p;
  const r = await settle(setDoc(doc(db, "progress", state.user.uid), { ...cleanProgress(rest), updatedAt: serverTimestamp() }));
  state.progress = p; ls("progress_" + state.user.uid, p);
  return r === "pending" ? "queued" : "saved";
}

/* ---------- Comparison data (paid students; the rules enforce it) ---------- */

/** setStats/{setId}: score distribution and top scores, built by the admin's Analyse button. 1 read. */
export async function loadSetStats(setId) {
  const s = await getDoc(doc(db, "setStats", setId));
  if (!s.exists()) return null;
  const d = plain(s.data());
  return { ...d, updatedAtMs: toMillis(s.data().updatedAt) };
}

let boardMem = null, boardAt = 0;
/** leaderboard/top100, rebuilt by the admin. 1 read, kept in memory for 5 minutes. */
export async function loadLeaderboard({ force = false } = {}) {
  if (!force && boardMem && Date.now() - boardAt < 300000) return boardMem;
  const s = await getDoc(doc(db, "leaderboard", "top100"));
  boardMem = s.exists() ? { entries: plain(s.data().entries || []), updatedAtMs: toMillis(s.data().updatedAt) } : { entries: [], updatedAtMs: null };
  boardAt = Date.now();
  return boardMem;
}

/** Find students whose nickname starts with `prefix` (max 15 reads). */
export async function searchStudents(prefix) {
  const q = String(prefix || "").trim().toLowerCase().replace(/^@/, "");
  if (q.length < 2) return [];
  const snap = await getDocs(query(collection(db, "profiles"), where("nicknameLower", ">=", q), where("nicknameLower", "<=", q + "\uf8ff"), limit(15)));
  return snap.docs.map((d) => {
    const x = d.data();
    return { uid: d.id, nick: x.nickname, color: x.avatarColor, points: x.points || 0, solved: x.solved || 0, since: toMillis(x.createdAt) };
  });
}
