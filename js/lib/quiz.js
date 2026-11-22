// Pure quiz logic: per-user shuffling and auto-marking. No Firebase, no DOM.
import { fx } from "./symbols.js";

export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const FIXED_ORDER = /\b(all|none|both)\s+of\s+(the\s+)?(above|these)\b|\bnone\s+of\s+the\s+above\b/i;

/**
 * Build the list of questions to show.
 * set: { questions:[{text,options,image,explanation,topic}], answers:[int] }
 * seed: string (uid + attempt id) so each student sees a stable but different order.
 * only: optional array of ORIGINAL question indices (used for "retry missed").
 * Each item keeps `orig` so results, reports and the fail log always use the uploaded numbering.
 */
export function prepareQuiz(set, seed, only = null) {
  const n = set.questions.length;
  let order = shuffle([...Array(n).keys()], mulberry32(hashStr(seed)));
  if (only) { const keep = new Set(only); order = order.filter((i) => keep.has(i)); }
  return order.map((orig) => {
    const q = set.questions[orig];
    const idx = q.options.map((_, i) => i);
    const optOrder = q.options.some((o) => FIXED_ORDER.test(String(o)))
      ? idx
      : shuffle(idx, mulberry32(hashStr(`${seed}:${orig}`)));
    return {
      orig,
      optOrder,                       // displayed option j was originally option optOrder[j]
      text: fx(q.text),               // symbol conversion is idempotent, so sets stored before it existed still show m⁻², H₂O ...
      image: q.image || "",
      eimage: q.eimage || "",
      topic: fx(q.topic) || "General",
      kind: q.kind === "abstract" ? "abstract" : "normal",
      explanation: fx(q.explanation || ""),
      options: optOrder.map((i) => fx(q.options[i])),
      correct: optOrder.indexOf(set.answers[orig]),
      correctText: fx(q.options[set.answers[orig]]),
    };
  });
}

export const kindOfQ = (q) => (q?.kind === "abstract" ? "abstract" : "normal");

/** How many "normal" and "abstract" questions a set has (optionally within one topic). */
export function kindCounts(set, topic = "") {
  const c = { normal: 0, abstract: 0 };
  (set?.questions || []).forEach((q) => { if (!topic || (fx(q.topic) || "General") === topic) c[kindOfQ(q)]++; });
  return c;
}

/** Topics of a set with how many questions each has, biggest first: [{ topic, n }]. */
export function topicCounts(set) {
  const m = new Map();
  (set?.questions || []).forEach((q) => { const t = fx(q.topic) || "General"; m.set(t, (m.get(t) || 0) + 1); });
  return [...m].map(([topic, n]) => ({ topic, n })).sort((a, b) => b.n - a.n || a.topic.localeCompare(b.topic));
}

/**
 * Choose which questions a custom run uses: { n, topic } -> ORIGINAL indices (sorted), or null when the run is the whole set.
 * The same seed always gives the same pick, so a resumed run keeps its questions; a new run uses a new seed.
 */
export function pickQuestions(set, { n = Infinity, topic = "", kind = "" } = {}, seed = "") {
  const all = [...Array(set.questions.length).keys()];
  const pool = all.filter((i) => (!topic || (fx(set.questions[i].topic) || "General") === topic) && (!kind || kindOfQ(set.questions[i]) === kind));
  const want = Math.max(1, Math.min(pool.length, Math.floor(Number(n)) || pool.length));
  if (!topic && !kind && want >= all.length) return null;
  return shuffle(pool, mulberry32(hashStr(seed + ":pick"))).slice(0, want).sort((a, b) => a - b);
}

/** picks[i] = displayed option index chosen for items[i] (or null if unanswered). */
export function grade(items, picks) {
  let score = 0;
  const wrong = [];
  const byTopic = {};
  items.forEach((it, i) => {
    const ok = picks[i] === it.correct;
    if (ok) score++; else wrong.push(it.orig);
    const t = (byTopic[it.topic] ||= { c: 0, t: 0 });
    t.t++; if (ok) t.c++;
  });
  wrong.sort((a, b) => a - b);
  return { score, total: items.length, wrong, byTopic };
}

export function band(pctScore) {
  return pctScore < 50 ? "low" : pctScore < 80 ? "medium" : "high";
}
