// Money in and out, for Admin > Revenue. Subscription income comes from approved payments; everything else is typed in by the admin
// (ledger entries). Pure functions, no Firebase.
export const CATEGORIES = {
  income: { sponsorship: "Sponsorship", other_income: "Other income" },
  expense: { prize: "Prize paid out", marketing: "Marketing", tools: "Tools and hosting", other_expense: "Other expense" },
};
export const categoryLabel = (type, cat) => CATEGORIES[type]?.[cat] || cat || "";

const p2 = (n) => String(n).padStart(2, "0");
export const monthKey = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}`; };
export const monthLabel = (key) => { const [y, m] = key.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" }); };
/** A ledger date (yyyy-mm-dd) to local noon in ms, so time zones cannot move it to another day. */
export const dayMs = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3], 12).getTime() : 0; };

/** When an approved payment counts: the day it was approved (falls back to when it was submitted). */
export const paymentAt = (p) => Number(p.approvedAtMs || p.reviewedAtMs || p.createdAtMs) || 0;

/** Validate a typed ledger entry. */
export function cleanEntry(f) {
  const amount = Math.round(Number(f.amount));
  if (!(amount > 0) || amount > 100000000) return { ok: false, error: "Enter an amount above zero." };
  if (!dayMs(f.date)) return { ok: false, error: "Pick the date." };
  const type = f.type === "expense" ? "expense" : "income";
  const category = CATEGORIES[type][f.category] ? f.category : Object.keys(CATEGORIES[type])[0];
  return { ok: true, entry: { type, category, amount, date: f.date, name: String(f.name || "").trim().slice(0, 80), note: String(f.note || "").trim().slice(0, 200) } };
}

/**
 * payments: [{ amount, status, reviewedAtMs, createdAtMs }]; ledger: [{ type, category, amount, date }].
 * range: { from, to } in ms (either may be 0/omitted). Returns totals and one row per month (newest first).
 */
export function summarize({ payments = [], ledger = [] }, range = {}) {
  const from = range.from || 0, to = range.to || Infinity;
  const inR = (t) => t >= from && t <= to;
  const months = new Map();
  const row = (k) => { if (!months.has(k)) months.set(k, { key: k, subs: 0, income: 0, expenses: 0, payments: 0 }); return months.get(k); };
  let subs = 0, nSubs = 0, income = 0, expenses = 0;
  const byCat = {};
  for (const p of payments) {
    if (p.status !== "approved") continue;
    const t = paymentAt(p); if (!t || !inR(t)) continue;
    const a = Number(p.amount) || 0; subs += a; nSubs++; const r = row(monthKey(t)); r.subs += a; r.payments++;
  }
  for (const e of ledger) {
    const t = dayMs(e.date); if (!t || !inR(t)) continue;
    const a = Number(e.amount) || 0, r = row(monthKey(t));
    if (e.type === "expense") { expenses += a; r.expenses += a; } else { income += a; r.income += a; }
    const k = e.type + ":" + e.category; byCat[k] = (byCat[k] || 0) + a;
  }
  const rows = [...months.values()].sort((a, b) => (a.key < b.key ? 1 : -1)).map((r) => ({ ...r, net: r.subs + r.income - r.expenses }));
  return { subs, nSubs, income, expenses, net: subs + income - expenses, rows, byCat };
}

/** Start of a period in ms for the filter chips. */
export function periodRange(kind, now = Date.now()) {
  const d = new Date(now);
  if (kind === "month") return { from: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), to: now + 86400000 };
  if (kind === "30") return { from: now - 30 * 86400000, to: now + 86400000 };
  if (kind === "year") return { from: new Date(d.getFullYear(), 0, 1).getTime(), to: now + 86400000 };
  return { from: 0, to: now + 86400000 };
}
