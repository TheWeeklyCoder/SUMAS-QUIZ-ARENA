// Pure tournament logic: states, answer mapping, grading and hall-of-fame rows. No Firebase, no DOM.

/** upcoming | open | closed | graded | draft. Drafts are hidden from students. */
export function tState(t, now = Date.now()) {
  if (!t || t.status === "draft") return "draft";
  if (t.status === "graded") return "graded";
  const s = t.startsAtMs, e = t.endsAtMs;
  if (now < s) return "upcoming";
  if (now < e) return "open";
  return "closed";
}

/** What we store in the entry: answers[originalIndex] = originally-numbered option, or -1 when skipped. */
export function toEntryAnswers(items, picks, total) {
  const out = Array(total).fill(-1);
  items.forEach((it, i) => { if (picks[i] !== null && picks[i] !== undefined) out[it.orig] = it.optOrder[picks[i]]; });
  return out;
}

/** Rank one mode's results: highest score first, earlier submission wins a tie. */
const order = (a, b) => b.score - a.score || a.submittedAt - b.submittedAt || String(a.uid).localeCompare(String(b.uid));

/**
 * entries: [{ uid, mode, answers[], submittedAt(ms) }], key: [int]
 * Returns { results, byMode:{prize:[...], fun:[...]} }. Each result has rank and of (within its own mode).
 * Prizes only ever go to prize-mode entries; fun-mode players get a score and a place among fun players.
 */
export function gradeEntries(entries, key) {
  const total = key.length, byMode = { prize: [], fun: [] };
  for (const e of entries) {
    const mode = e.mode === "prize" ? "prize" : "fun";
    let score = 0;
    for (let i = 0; i < total; i++) if (Array.isArray(e.answers) && e.answers[i] === key[i]) score++;
    byMode[mode].push({ uid: e.uid, mode, score, total, submittedAt: e.submittedAt || 0 });
  }
  for (const m of Object.keys(byMode)) {
    byMode[m].sort(order);
    byMode[m].forEach((r, i) => { r.rank = i + 1; r.of = byMode[m].length; });
  }
  return { results: [...byMode.prize, ...byMode.fun], byMode };
}

/** Rows for the public Hall of Fame: the top `n` prize-mode players. nicks maps uid -> nickname. */
export function hallRows(t, prizeRanked, nicks, n = 3) {
  return prizeRanked.slice(0, n).filter((r) => nicks[r.uid]).map((r) => ({
    tournamentId: t.id, title: t.title, sponsorName: t.sponsorName || "", prizeText: t.prizeText || "",
    nick: nicks[r.uid], place: r.rank, score: r.score, total: r.total,
  }));
}

const p2 = (n) => String(n).padStart(2, "0");
/** ms <-> the value of <input type="datetime-local"> (local time). */
export const toLocalInput = (ms) => { if (!ms) return ""; const d = new Date(ms); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`; };
export const fromLocalInput = (v) => { const t = new Date(v).getTime(); return Number.isNaN(t) ? null : t; };

/** "2d 4h", "3h 10m", "12m" for a countdown. */
export function countdown(ms) {
  if (ms <= 0) return "now";
  const m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  return d ? `${d}d ${h}h` : h ? `${h}h ${mm}m` : `${Math.max(1, mm)}m`;
}

/** Only real https links are allowed for Selar products. */
export const isHttpsUrl = (u) => { try { return new URL(u).protocol === "https:"; } catch { return false; } };
