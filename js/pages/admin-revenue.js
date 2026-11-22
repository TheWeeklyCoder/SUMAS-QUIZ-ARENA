// Admin > Revenue: subscription income (from approved payments), sponsor and other income, and expenses (prizes, tools...), by month.
// Entries you type in are saved in the admin-only `ledger` collection.
import { db, doc, getDocs, setDoc, deleteDoc, collection, query, where, limit, serverTimestamp } from "../firebase.js";
import { CATEGORIES, categoryLabel, cleanEntry, summarize, periodRange, monthLabel, dayMs } from "../lib/revenue.js";
import { PACKAGES, toDay } from "../lib/sponsors.js";
import { esc, naira, toMillis, toCSV, downloadText, fmtDate } from "../lib/util.js";
import { badge, confirmBox, sheet, toast, skeleton } from "../ui.js";
import { handleError } from "../net.js";

const fail = (e) => { if (!handleError(e)) toast("That didn't work. Please try again.", "bad"); };
const PERIODS = [["month", "This month"], ["30", "Last 30 days"], ["year", "This year"], ["all", "All time"]];

export default async function revenueTab(body, ctx) {
  body.innerHTML = skeleton(3);
  let payments = [], ledger = [], truncated = false;
  async function load() {
    const [p, l] = await Promise.all([getDocs(query(collection(db, "payments"), where("status", "==", "approved"), limit(1000))), getDocs(query(collection(db, "ledger"), limit(1000)))]);
    payments = p.docs.map((d) => { const x = d.data(); return { id: d.id, amount: x.amount, status: x.status, plan: x.plan, reviewedAtMs: toMillis(x.reviewedAt), createdAtMs: toMillis(x.createdAt) }; });
    ledger = l.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.date < b.date ? 1 : -1));
    truncated = p.size >= 1000;
  }
  try { await load(); } catch (e) { if (ctx.alive()) { body.innerHTML = '<div class="card center"><p class="muted">Couldn\'t load revenue. Republish firestore.rules (ledger) and try again.</p></div>'; handleError(e); } return; }
  if (!ctx.alive()) return;
  let period = "month";

  function draw() {
    const r = periodRange(period), sm = summarize({ payments, ledger }, r);
    const inR = ledger.filter((e) => { const t = dayMs(e.date); return t >= (r.from || 0) && t <= r.to; });
    body.innerHTML = `<div class="stack-l">
      <div class="chips" role="group" aria-label="Period">${PERIODS.map(([k, l]) => `<button class="chip" data-p="${k}" aria-pressed="${k === period}">${l}</button>`).join("")}</div>
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px">
        <div class="card stat"><div class="price">${naira(sm.subs)}</div><div class="small muted">Subscriptions (${sm.nSubs})</div></div>
        <div class="card stat"><div class="price">${naira(sm.income)}</div><div class="small muted">Sponsors and other income</div></div>
        <div class="card stat"><div class="price">${naira(sm.expenses)}</div><div class="small muted">Expenses</div></div>
        <div class="card stat ${sm.net >= 0 ? "accent" : ""}"><div class="price">${sm.net < 0 ? "-" : ""}${naira(Math.abs(sm.net))}</div><div class="small muted">Net</div></div></div>
      ${truncated ? '<p class="small muted" style="margin:0">Only the latest 1,000 approved payments are counted.</p>' : ""}
      <div class="row between wrap" style="gap:10px"><h2 style="margin:0">Money in and out</h2><button class="btn primary small" id="add">Add entry</button></div>
      ${inR.length ? `<div class="list">${inR.map((e) => `<div class="item"><div class="grow" style="min-width:0"><strong>${esc(e.name || categoryLabel(e.type, e.category))}</strong>
          <div class="meta">${esc(categoryLabel(e.type, e.category))} · ${fmtDate(dayMs(e.date))}${e.note ? " · " + esc(e.note) : ""}</div></div>
          ${badge((e.type === "expense" ? "-" : "+") + naira(e.amount), e.type === "expense" ? "red" : "green")}<button class="btn small ghost" data-rm="${esc(e.id)}" aria-label="Delete entry">Delete</button></div>`).join("")}</div>`
        : '<div class="card center"><p class="muted" style="margin:0">No entries for this period. Subscription income is added for you. Add sponsor money, prizes you paid and other costs here.</p></div>'}
      ${sm.rows.length ? `<div class="stack-s"><h2>By month</h2><div class="tablewrap"><table><thead><tr><th>Month</th><th>Subscriptions</th><th>Other income</th><th>Expenses</th><th>Net</th></tr></thead><tbody>
        ${sm.rows.map((m) => `<tr><td>${monthLabel(m.key)}</td><td>${naira(m.subs)}</td><td>${naira(m.income)}</td><td>${naira(m.expenses)}</td><td><strong>${m.net < 0 ? "-" : ""}${naira(Math.abs(m.net))}</strong></td></tr>`).join("")}</tbody></table></div></div>` : ""}
      <div class="row wrap"><button class="btn small ghost" id="x1">Download entries (CSV)</button><button class="btn small ghost" id="x2">Download monthly summary (CSV)</button></div>
      <p class="small muted" style="margin:0">Subscription income counts on the day you approved the payment. Free days given to affiliates and free-for-all periods are not money, so they are not counted.</p></div>`;
    body.querySelectorAll("[data-p]").forEach((b) => (b.onclick = () => { period = b.dataset.p; draw(); }));
    body.querySelector("#add").onclick = () => form();
    body.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = async () => {
      if (!(await confirmBox({ title: "Delete this entry?", text: "It is removed from your totals.", okLabel: "Delete", danger: true }))) return;
      try { await deleteDoc(doc(db, "ledger", b.dataset.rm)); ledger = ledger.filter((e) => e.id !== b.dataset.rm); draw(); } catch (e) { fail(e); }
    }));
    body.querySelector("#x1").onclick = () => downloadText(`revenue-entries-${toDay(Date.now())}.csv`, toCSV([["date", "type", "category", "name", "amount", "note"], ...ledger.map((e) => [e.date, e.type, categoryLabel(e.type, e.category), e.name || "", e.amount, e.note || ""])]), "text/csv");
    body.querySelector("#x2").onclick = () => { const a = summarize({ payments, ledger }, periodRange("all")); downloadText(`revenue-by-month-${toDay(Date.now())}.csv`, toCSV([["month", "subscriptions", "other income", "expenses", "net", "payments"], ...a.rows.map((m) => [m.key, m.subs, m.income, m.expenses, m.net, m.payments])]), "text/csv"); };
  }

  function form() {
    const s = sheet(`<div class="stack"><div class="chips" role="group" aria-label="Type"><button class="chip" data-t="income" aria-pressed="true">Money in</button><button class="chip" data-t="expense" aria-pressed="false">Money out</button></div>
      <label>Category<select id="ct"></select></label>
      <label>From or to (optional)<input id="nm" maxlength="80" placeholder="e.g. Acme Pharmacy, or the winner's nickname"></label>
      <label>Amount (naira)<input id="am" type="number" inputmode="numeric" min="1" placeholder="e.g. 20000"></label>
      <label>Date<input id="dt" type="date" value="${toDay(Date.now())}"></label>
      <label>Note (optional)<input id="nt" maxlength="200"></label>
      <div id="pk" class="stack-s"><span class="small muted">Suggested sponsor packages (tap to fill):</span><div class="row wrap">${PACKAGES.map((p, i) => `<button type="button" class="btn small ghost" data-pk="${i}">${esc(p.label.split(" (")[0])} ${naira(p.price)}</button>`).join("")}</div></div>
      <div class="row" style="justify-content:flex-end"><button class="btn ghost" data-c>Cancel</button><button class="btn primary" id="sv">Save</button></div></div>`, { title: "Add entry" });
    const $ = (q) => s.el.querySelector(q); let type = "income";
    const cats = () => { $("#ct").innerHTML = Object.entries(CATEGORIES[type]).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join(""); $("#pk").hidden = type !== "income"; };
    cats(); $("[data-c]").onclick = s.close;
    s.el.querySelectorAll("[data-t]").forEach((b) => (b.onclick = () => { type = b.dataset.t; s.el.querySelectorAll("[data-t]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); cats(); }));
    s.el.querySelectorAll("[data-pk]").forEach((b) => (b.onclick = () => { const p = PACKAGES[+b.dataset.pk]; $("#ct").value = "sponsorship"; $("#am").value = p.price; $("#nt").value = p.label; }));
    $("#sv").onclick = async () => {
      const r = cleanEntry({ type, category: $("#ct").value, name: $("#nm").value, amount: $("#am").value, date: $("#dt").value, note: $("#nt").value });
      if (!r.ok) return toast(r.error, "bad");
      try { const ref = doc(collection(db, "ledger")); await setDoc(ref, { ...r.entry, createdAt: serverTimestamp() }); ledger = [{ id: ref.id, ...r.entry }, ...ledger].sort((a, b) => (a.date < b.date ? 1 : -1)); s.close(); toast("Saved", "good"); draw(); } catch (e) { fail(e); }
    };
  }
  draw();
}
