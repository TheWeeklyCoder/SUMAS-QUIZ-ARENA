// Pure maths for the admin "Analyse" button and for "how did I rank?". No Firebase, no DOM.
//
// attempts/{uid_setId} documents are first attempts only, so every number here is "first try" data.
// The admin run turns new attempts into:
//   qStats/{setId}   n, total, miss{questionIndex: count}          (admin only)
//   setStats/{setId} n, hist[0..100], sumPct, top[]                (paid students read this)
//   profiles/{uid}   points, solved                                (admin writes)

export const FLAG_MIN_ATTEMPTS = 10;   // need at least this many students before a question can be flagged
export const FLAG_MISS_RATE = 0.85;    // "nearly everyone misses it" probably means a wrong answer key
export const TOP_KEPT = 10;            // best scores remembered per set
export const MAX_OPS = 480;            // one Firestore batch allows 500 writes; keep a margin
export const isTasterId = (setId) => String(setId).startsWith("taster_");

const pctOf = (score, total) => (total ? Math.round((score / total) * 100) : 0);

/**
 * Choose how many of the (oldest-first) attempts fit in one atomic batch and group them.
 * Writes needed: 2 per set (qStats + setStats; tasters need 1) + 1 per student (points) + 1 for the run marker.
 * Returns { used, bySet, byUser, ops, truncated }.
 */
export function planRun(attempts, maxOps = MAX_OPS) {
  const bySet = new Map(), byUser = new Map();
  let ops = 1, used = 0;
  for (const a of attempts) {
    const newSet = !bySet.has(a.setId), newUser = !byUser.has(a.uid) && !isTasterId(a.setId);
    const cost = (newSet ? (isTasterId(a.setId) ? 1 : 2) : 0) + (newUser ? 1 : 0);
    if (ops + cost > maxOps) break;
    ops += cost; used++;

    let s = bySet.get(a.setId);
    if (!s) { s = { setId: a.setId, bankId: a.bankId || "", taster: isTasterId(a.setId), n: 0, total: 0, miss: {}, hist: Array(101).fill(0), sumPct: 0, entries: [] }; bySet.set(a.setId, s); }
    const p = pctOf(a.score, a.total);
    s.n++; s.total = Math.max(s.total, a.total || 0);
    for (const i of new Set(a.wrong || [])) s.miss[i] = (s.miss[i] || 0) + 1;
    s.hist[p]++; s.sumPct += p;
    s.entries.push({ u: a.uid, score: a.score, total: a.total, sec: a.durationSec || 0, pct: p });

    if (!isTasterId(a.setId)) {
      const u = byUser.get(a.uid) || { uid: a.uid, points: 0, solved: 0 };
      u.points += a.score; u.solved += 1; byUser.set(a.uid, u);
    }
  }
  return { used, bySet, byUser, ops, truncated: used < attempts.length };
}

/** Add an increment (from planRun) to an existing qStats document (or null). */
export function mergeQStats(existing, inc) {
  const e = existing || {};
  const miss = { ...(e.miss || {}) };
  for (const [i, c] of Object.entries(inc.miss)) miss[i] = (miss[i] || 0) + c;
  return { bankId: inc.bankId || e.bankId || "", setId: inc.setId, n: (e.n || 0) + inc.n, total: Math.max(e.total || 0, inc.total), miss };
}

const better = (a, b) => b.pct - a.pct || a.sec - b.sec || String(a.u).localeCompare(String(b.u));

/** Add an increment to an existing setStats document (or null). `nicks` maps uid -> nickname for new entries. */
export function mergeSetStats(existing, inc, nicks = {}, keep = TOP_KEPT) {
  const e = existing || {};
  const hist = Array.from({ length: 101 }, (_, i) => ((e.hist || [])[i] || 0) + inc.hist[i]);
  const fresh = inc.entries.filter((x) => nicks[x.u]).map((x) => ({ ...x, nick: nicks[x.u] }));
  // One entry per student per set (attempts are first-attempt only, so this is just a safety net).
  const seen = new Set(), top = [];
  for (const x of [...(e.top || []), ...fresh].sort(better)) { if (!seen.has(x.u)) { seen.add(x.u); top.push(x); } }
  return { bankId: inc.bankId || e.bankId || "", setId: inc.setId, n: (e.n || 0) + inc.n, hist, sumPct: (e.sumPct || 0) + inc.sumPct, top: top.slice(0, keep) };
}

/** Questions that nearly everyone gets wrong. Returns [{ idx, missed, rate }] worst first. */
export function flaggedQuestions(q, minN = FLAG_MIN_ATTEMPTS, minRate = FLAG_MISS_RATE) {
  if (!q || !q.n || q.n < minN) return [];
  return Object.entries(q.miss || {})
    .map(([i, c]) => ({ idx: Number(i), missed: c, rate: c / q.n }))
    .filter((x) => x.rate >= minRate)
    .sort((a, b) => b.rate - a.rate || a.idx - b.idx);
}

/** Every question with its miss rate (including never-missed ones), hardest first. */
export function questionRates(q) {
  const out = [];
  for (let i = 0; i < (q?.total || 0); i++) { const c = (q.miss || {})[i] || 0; out.push({ idx: i, missed: c, rate: q.n ? c / q.n : 0 }); }
  return out.sort((a, b) => b.rate - a.rate || a.idx - b.idx);
}

/** Roll per-question rates up to topics. questions[i].topic is the topic of original question i. */
export function topicRates(q, questions) {
  const t = {};
  (questions || []).forEach((qu, i) => {
    const name = qu.topic || "General", x = (t[name] ||= { name, missed: 0, asked: 0 });
    x.missed += (q.miss || {})[i] || 0; x.asked += q.n || 0;
  });
  return Object.values(t).map((x) => ({ ...x, rate: x.asked ? x.missed / x.asked : 0 })).sort((a, b) => b.rate - a.rate);
}

/**
 * Where does a score fall among everyone who has done this set?
 * stats: a setStats document. myPct: 0-100. included: true when this student's own attempt is already in stats.
 * Returns null when there is nothing to compare with.
 */
export function rankFor(stats, myPct, included) {
  if (!stats || !stats.n || !Array.isArray(stats.hist)) return null;
  const p = Math.max(0, Math.min(100, Math.round(myPct)));
  let above = 0, below = 0;
  for (let i = 0; i <= 100; i++) { if (i > p) above += stats.hist[i] || 0; else if (i < p) below += stats.hist[i] || 0; }
  const others = included ? stats.n - 1 : stats.n;
  const of = included ? stats.n : stats.n + 1;
  const rank = above + 1;
  const beat = others > 0 ? Math.round((below / others) * 100) : null;
  return { rank, of, beat, topPct: Math.max(1, Math.ceil((rank / of) * 100)), avg: Math.round(stats.sumPct / stats.n), n: stats.n };
}

/** Sort profiles into the leaderboard shape. Students with no points are left out. */
export function buildLeaderboard(profiles, size = 100) {
  return profiles
    .filter((p) => (p.points || 0) > 0 && p.nickname)
    .sort((a, b) => b.points - a.points || (b.solved || 0) - (a.solved || 0) || String(a.nickname).localeCompare(String(b.nickname)))
    .slice(0, size)
    .map((p) => ({ uid: p.uid, nick: p.nickname, color: p.avatarColor || "", points: p.points, solved: p.solved || 0 }));
}
