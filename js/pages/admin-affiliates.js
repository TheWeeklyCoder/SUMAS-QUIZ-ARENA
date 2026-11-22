// Admin > Affiliates: applications, payout requests, rewards, commission settings.
import { db, doc, getDoc, getDocs, setDoc, collection, query, where, limit, writeBatch, serverTimestamp, Timestamp } from "../firebase.js";
import { state } from "../state.js";
import { PLANS, extendedByDays } from "../lib/plans.js";
import { affPct, affMin, affStats, affDays, moneyOn, affiliateRows, dayWord, makeCode, PAYOUT_DAYS } from "../lib/affiliate.js";
import { esc, naira, fmtDate, toMillis, ls, toCSV, downloadText } from "../lib/util.js";
import { confirmBox, toast } from "../ui.js";
import { handleError } from "../net.js";

export async function affiliatesTab(body, ctx) {
  const fail = (e) => { if (!handleError(e)) toast("That didn't work. Please try again.", "bad"); };
  let affs, refs, coms, pays, query_ = "";
  async function draw() {
    body.innerHTML = '<div class="skeleton" style="height:120px"></div>';
    try {
      const [a, r, c, p] = await Promise.all([
        getDocs(query(collection(db, "affiliates"), limit(300))), getDocs(query(collection(db, "referrals"), limit(2000))),
        getDocs(query(collection(db, "commissions"), where("status", "==", "unpaid"), limit(2000))), getDocs(query(collection(db, "payouts"), where("status", "==", "requested"), limit(200)))]);
      affs = a.docs.map((d) => ({ id: d.id, ...d.data() })); refs = r.docs.map((d) => ({ ...d.data(), createdAt: toMillis(d.data().createdAt) }));
      coms = c.docs.map((d) => ({ id: d.id, ...d.data() })); pays = p.docs.map((d) => ({ id: d.id, ...d.data(), createdAt: toMillis(d.data().createdAt) }));
    } catch (e) { if (ctx.alive()) { body.innerHTML = '<div class="card center"><p class="muted">Couldn\'t load affiliates.</p></div>'; handleError(e); } return; }
    if (!ctx.alive()) return;
    render();
  }
  function render() {
    const mine = (uid) => ({ referrals: refs.filter((r) => r.affiliateUid === uid), commissions: coms.filter((c) => c.affiliateUid === uid) });
    const pending = affs.filter((a) => a.status === "pending"), approved = affs.filter((a) => a.status === "approved"), rejected = affs.filter((a) => a.status === "rejected");
    const apply = (a) => `<div class="card stack-s"><div class="row wrap" style="justify-content:space-between"><strong>@${esc(a.nickname)}</strong><span class="small muted">${fmtDate(toMillis(a.createdAt))}</span></div>
      <div class="small">${esc(a.platform)}: <strong>${esc(a.handle)}</strong> · ${Number(a.followers)} followers</div>${a.note ? `<div class="small muted">${esc(a.note)}</div>` : ""}
      <div class="small muted">Check the account yourself before approving.</div>
      <div class="row wrap"><button class="btn small primary" data-ap="${a.id}">Approve</button><button class="btn small danger" data-rj="${a.id}">Reject</button></div></div>`;
    const payout = (p) => { const a = affs.find((x) => x.id === p.affiliateUid), m = mine(p.affiliateUid), owed = m.commissions.filter((c) => (toMillis(c.createdAt) || 0) <= p.createdAt + 1000).reduce((t, c) => t + (Number(c.amount) || 0), 0);
      return `<div class="card stack-s"><div class="row wrap" style="justify-content:space-between"><strong>@${esc(a?.nickname || p.affiliateUid.slice(0, 6))}</strong><strong>${naira(p.amount)}</strong></div>
        <div class="small">${esc(p.accountName)} · ${esc(p.bankName)} · <strong>${esc(p.accountNumber)}</strong></div>
        <div class="small muted">Requested ${fmtDate(p.createdAt)}. Pay within ${PAYOUT_DAYS} days. Recorded earnings at that time: ${naira(owed)}${owed !== p.amount ? " (differs from the request, check before paying)" : ""}.</div>
        <button class="btn small primary" data-pd="${p.id}">I have paid this. Mark paid</button></div>`; };
    const q = query_.trim().toLowerCase();
    const row = (a) => { const m = mine(a.id), st = affStats({ ...m, payouts: [], aff: a }, state.settings), money = moneyOn(state.settings) || st.unpaid > 0;
      const people = [...m.referrals].sort((x, y) => y.createdAt - x.createdAt);
      return `<div class="card stack-s"><div class="row wrap" style="justify-content:space-between"><strong>@${esc(a.nickname)} · ${esc(a.code || "")}</strong><span class="small muted">${esc(a.platform)} ${esc(a.handle)} · ${Number(a.followers)}</span></div>
        <div class="small">${st.signups} signed up · ${st.subscribed} subscribed (${st.conversion}%)${st.lastAt ? ` · last ${fmtDate(st.lastAt)}` : ""}${money ? ` · waiting ${naira(st.unpaid)}` : ""}</div>
        <div class="small muted">Earned ${dayWord(st.daysEarned)} · given ${dayWord(st.daysGranted)} · <strong>${st.daysPending ? dayWord(st.daysPending) + " to give" : "nothing to give"}</strong></div>
        <div class="row wrap">${st.daysPending ? `<button class="btn small gold" data-gd="${a.id}:${st.daysPending}">Give ${dayWord(st.daysPending)} free</button>` : ""}${people.length ? `<button class="btn small ghost" data-pp="${a.id}">People (${people.length})</button>` : ""}</div>
        <div class="stack-s" data-ppbox="${a.id}" hidden>${people.map((r) => `<div class="row small" style="justify-content:space-between"><span>@${esc(r.nickname)}</span><span class="muted">${fmtDate(r.createdAt)}</span><span class="badge ${r.subscribed ? "green" : ""}">${r.subscribed ? "Subscribed" : "Free"}</span></div>`).join("")}</div></div>`; };
    const shown = approved.filter((a) => !q || `${a.nickname} ${a.code} ${a.handle}`.toLowerCase().includes(q)).sort((x, y) => mine(y.id).referrals.length - mine(x.id).referrals.length);
    const tot = approved.reduce((t, a) => { const st = affStats({ ...mine(a.id), payouts: [], aff: a }, state.settings); return { su: t.su + st.signups, sb: t.sb + st.subscribed, pd: t.pd + st.daysPending, n: t.n + (st.daysPending ? 1 : 0) }; }, { su: 0, sb: 0, pd: 0, n: 0 });
    const d = affDays(state.settings);
    body.innerHTML = `<div class="stack-l">
      <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px"><div class="card stat"><div class="price">${approved.length}</div><div class="small muted">Affiliates</div></div><div class="card stat"><div class="price">${tot.su}</div><div class="small muted">Sign-ups through them</div></div>
        <div class="card stat"><div class="price">${tot.sb}</div><div class="small muted">Of those subscribed</div></div><div class="card stat"><div class="price">${tot.pd}</div><div class="small muted">Free days to give${tot.n ? ` (${tot.n} people)` : ""}</div></div></div>
      <div class="card stack-s"><strong>Rewards</strong><div class="row wrap" style="gap:10px">
        <label class="grow">Free days per sign-up<input id="ds" type="number" min="0" max="30" value="${d.signup}"></label>
        <label class="grow">Extra days when they subscribe<input id="dp" type="number" min="0" max="30" value="${d.paid}"></label></div>
        <label class="check"><input type="checkbox" id="mo" ${moneyOn(state.settings) ? "checked" : ""}><span class="small">Also pay money commission (off by default; payouts stay manual)</span></label>
        <div class="row wrap" style="gap:10px" id="mbox" ${moneyOn(state.settings) ? "" : "hidden"}><label class="grow">Commission %<input id="cp" type="number" min="1" max="50" value="${affPct(state.settings)}"></label>
        <label class="grow">Minimum payout (naira)<input id="cm" type="number" min="1000" step="500" value="${affMin(state.settings)}"></label></div>
        <button class="btn small primary" id="cs">Save</button><span class="small muted">Students see these numbers. Changing them changes what everyone has earned so far, so set them once.</span></div>
      <div class="stack-s"><h2>Payout requests (${pays.length})</h2>${pays.map(payout).join("") || '<p class="muted small">None waiting.</p>'}</div>
      <div class="stack-s"><h2>Applications (${pending.length})</h2>${pending.map(apply).join("") || '<p class="muted small">No new applications.</p>'}</div>
      <div class="stack-s"><div class="row between wrap"><h2 style="margin:0">Affiliates (${approved.length})</h2><span class="row wrap"><button class="btn small ghost" id="ex1">Download report</button><button class="btn small ghost" id="ex2">Download all referrals</button></span></div>
        ${approved.length > 4 ? '<input id="aq" type="search" placeholder="Search name, code or handle" aria-label="Search affiliates">' : ""}
        ${shown.map(row).join("") || '<p class="muted small">No approved affiliates yet.</p>'}${tot.n > 1 ? `<button class="btn primary block" id="gall">Give all pending days (${tot.n} people)</button>` : ""}</div>
      ${rejected.length ? `<div class="stack-s"><h2>Rejected (${rejected.length})</h2>${rejected.map((a) => `<div class="card row wrap" style="justify-content:space-between"><span>@${esc(a.nickname)} · ${esc(a.handle)}</span><button class="btn small ghost" data-rm="${a.id}">Let them apply again</button></div>`).join("")}</div>` : ""}</div>`;
    const on = (sel, key, fn) => body.querySelectorAll(sel).forEach((b) => (b.onclick = async () => { b.disabled = true; try { await fn(b.dataset[key]); } catch (e) { fail(e); } draw(); }));
    const mo = body.querySelector("#mo"); mo.onchange = () => { body.querySelector("#mbox").hidden = !mo.checked; };
    body.querySelector("#cs").onclick = async () => {
      const ds = Math.round(Number(body.querySelector("#ds").value)), dp = Math.round(Number(body.querySelector("#dp").value)), money = mo.checked;
      const p = Math.round(Number(body.querySelector("#cp").value)), m = Math.round(Number(body.querySelector("#cm").value));
      if (!(ds >= 0 && ds <= 30 && dp >= 0 && dp <= 30)) return toast("Days must be between 0 and 30", "bad");
      if (money && (!(p >= 1 && p <= 50) || !(m >= 1000))) return toast("Commission 1 to 50%, minimum payout at least 1,000", "bad");
      const patch = { affiliateDaysSignup: ds, affiliateDaysPaid: dp, affiliateMoney: money, ...(money ? { affiliatePct: p, affiliateMin: m } : {}) };
      try { await setDoc(doc(db, "settings", "app"), patch, { merge: true }); state.settings = { ...state.settings, ...patch }; ls("settings_app", state.settings); toast("Saved", "good"); draw(); } catch (e) { fail(e); }
    };
    body.querySelectorAll("[data-pp]").forEach((b) => (b.onclick = () => { const box = body.querySelector(`[data-ppbox="${b.dataset.pp}"]`); box.hidden = !box.hidden; }));
    const aq = body.querySelector("#aq"); if (aq) { aq.value = query_; aq.addEventListener("input", () => { query_ = aq.value; const pos = aq.selectionStart; render(); const i = body.querySelector("#aq"); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch {} } }); }
    body.querySelector("#ex1")?.addEventListener("click", () => downloadText(`affiliates-${new Date().toISOString().slice(0, 10)}.csv`, (() => { const rows = affiliateRows(affs, refs, state.settings); return toCSV([Object.keys(rows[0] || { nickname: 1 }), ...rows.map((r) => Object.values(r))]); })(), "text/csv"));
    body.querySelector("#ex2")?.addEventListener("click", () => { const nick = (uid) => affs.find((a) => a.id === uid)?.nickname || uid; downloadText(`referrals-${new Date().toISOString().slice(0, 10)}.csv`, toCSV([["affiliate", "code", "student", "joined", "subscribed"], ...refs.map((r) => [nick(r.affiliateUid), r.code || "", r.nickname || "", r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : "", r.subscribed ? "yes" : "no"])]), "text/csv"); });
    async function give(uid, n) {
      const aff = affs.find((a) => a.id === uid), subRef = doc(db, "subscriptions", uid), cur = await getDoc(subRef), comp = cur.exists() && cur.data().plan === "comp";
      const active = cur.exists() && !comp ? toMillis(cur.data().expiresAt) : 0, exp = extendedByDays(active, Date.now(), n);
      const b = writeBatch(db);
      if (!comp) b.set(subRef, { plan: active > Date.now() ? cur.data().plan : "free", expiresAt: Timestamp.fromMillis(exp), updatedAt: serverTimestamp() });
      b.update(doc(db, "affiliates", uid), { daysGranted: (Number(aff?.daysGranted) || 0) + n, lastGrantAt: serverTimestamp() });
      await b.commit(); return exp;
    }
    body.querySelector("#gall")?.addEventListener("click", async () => {
      const todo = approved.map((a) => ({ a, n: affStats({ ...mine(a.id), payouts: [], aff: a }, state.settings).daysPending })).filter((x) => x.n > 0);
      if (!(await confirmBox({ title: `Give free days to ${todo.length} people?`, text: "Each person's access is extended by the days they have earned and not yet received.", okLabel: "Give all" }))) return;
      let ok = 0; for (const x of todo) { try { await give(x.a.id, x.n); ok++; } catch (e) { fail(e); break; } }
      toast(`Done for ${ok} of ${todo.length}`, ok === todo.length ? "good" : "bad"); draw();
    });
    on("[data-gd]", "gd", async (arg) => {
      const [uid, n] = arg.split(":"), days = Number(n), a = affs.find((x) => x.id === uid);
      if (!(await confirmBox({ title: `Give ${dayWord(days)} free to @${a?.nickname || ""}?`, text: "Their access is extended by that many days (added on top of any time they have left).", okLabel: "Give" }))) return;
      const exp = await give(uid, days); toast(`Done. Access until ${fmtDate(exp)}`, "good");
    });
    on("[data-ap]", "ap", async (uid) => {
      let code = "";
      for (let i = 0; i < 6 && !code; i++) { const c = makeCode(); if (!(await getDoc(doc(db, "affiliateCodes", c))).exists()) code = c; }
      if (!code) throw new Error("code");
      const b = writeBatch(db);
      b.update(doc(db, "affiliates", uid), { status: "approved", code, approvedAt: serverTimestamp() });
      b.set(doc(db, "affiliateCodes", code), { uid, createdAt: serverTimestamp() });
      await b.commit(); toast(`Approved. Code ${code}`, "good");
    });
    on("[data-rj]", "rj", async (uid) => {
      if (!(await confirmBox({ title: "Reject this application?", text: "They will see that it was not approved.", okLabel: "Reject", danger: true }))) return;
      const b = writeBatch(db); b.update(doc(db, "affiliates", uid), { status: "rejected", reviewedAt: serverTimestamp() }); await b.commit();
    });
    on("[data-rm]", "rm", async (uid) => { const b = writeBatch(db); b.delete(doc(db, "affiliates", uid)); await b.commit(); });
    on("[data-pd]", "pd", async (id) => {
      const p = pays.find((x) => x.id === id);
      if (!(await confirmBox({ title: `Mark ${naira(p.amount)} as paid?`, text: "Only do this after you have sent the money. It marks their earnings up to the request as paid.", okLabel: "Mark paid" }))) return;
      const all = await getDocs(query(collection(db, "commissions"), where("affiliateUid", "==", p.affiliateUid), where("status", "==", "unpaid"), limit(400)));
      const b = writeBatch(db);
      b.update(doc(db, "payouts", id), { status: "paid", paidAt: serverTimestamp() });
      all.docs.filter((d) => (toMillis(d.data().createdAt) || 0) <= p.createdAt + 1000).forEach((d) => b.update(doc(db, "commissions", d.id), { status: "paid", payoutId: id }));
      await b.commit(); toast("Marked as paid", "good");
    });
  }
  await draw();
}
