// Plans, manual bank-transfer payment submission, and the payment status tracker.
import { db, doc, getDoc, getDocs, addDoc, collection, query, where, serverTimestamp } from "../firebase.js";
import { state, isPaid, hasPaidSub, freeForAll, waLink } from "../state.js";
import { go } from "../router.js";
import { APP } from "../config.js";
import { PLANS, PLAN_KEYS, priceOf, perWeek, paymentCode, isComp } from "../lib/plans.js";
import { esc, naira, fmtDate, fmtDateTime, daysLeft, toMillis, dayKey, ls } from "../lib/util.js";
import { icon, hint, skeleton, copyText, toast } from "../ui.js";
import { handleError } from "../net.js";
import { compressImage, uploadToCloudinary } from "../imagetools.js";

/** Re-read the subscription (after an approval happened while the app was open). */
export async function refreshSub() {
  try {
    const s = await getDoc(doc(db, "subscriptions", state.user.uid));
    const d = s.exists() ? s.data() : null;
    state.sub = d && { plan: d.plan, expiresAt: toMillis(d.expiresAt) };
    ls("sub_" + state.user.uid, state.sub);
  } catch { /* keep what we have */ }
}

const price = (k) => priceOf(state.plans, k);

export default function plansPage(ctx) {
  const paid = hasPaidSub();
  ctx.view.innerHTML = `<div class="stack-l"><header><p class="muted" style="margin:0">Pay once for the time you need. No auto-renewal, no surprises.</p></header>
    ${!paid && freeForAll() ? `<div class="card accent"><strong>Everything is free for everyone right now</strong><p class="small muted" style="margin:4px 0 0">You do not need to pay at the moment. A plan you buy now starts counting when you pay.</p></div>` : ""}
    ${isComp(state.sub) ? `<div class="card accent"><strong>You have complimentary access</strong><p class="small muted" style="margin:4px 0 0">You don't need to buy a plan.</p></div>` : paid ? `<div class="card accent"><strong>Active until ${fmtDate(state.sub.expiresAt)}</strong>
      <p class="small muted" style="margin:4px 0 0">${daysLeft(state.sub.expiresAt)} days left. A renewal is added on top of your remaining time.</p></div>` : ""}
    <div class="stack">${PLAN_KEYS.map((k) => {
      const pr = price(k), best = k === "3m";
      return `<div class="card plan ${best ? "best" : ""} stack-s">${best ? '<span class="badge gold ribbon">Best value</span>' : ""}
        <div class="row between"><h2 style="margin:0">${PLANS[k].label}</h2><span class="price">${pr ? naira(pr) : "Soon"}</span></div>
        <p class="muted small" style="margin:0">${pr ? `About ${naira(perWeek(pr, k))} per week` : "Price not set yet"} · full question banks, ranks, progress charts and group matches.</p>
        <a class="btn ${best ? "gold" : "primary"} block ${pr ? "" : "disabled"}" ${pr ? `href="#/pay/${k}"` : 'aria-disabled="true" tabindex="-1" style="opacity:.5;pointer-events:none"'}>Choose ${PLANS[k].label}</a></div>`;
    }).join("")}</div>
    <a class="item" href="#/payments"><span class="tile">${icon("check")}</span><div class="grow"><strong>My payments</strong><div class="meta">Check the status of a payment</div></div>${icon("chevron")}</a>
    ${hint("We approve payments manually, usually within 24 hours.", "info")}</div>`;
}

export function payPage(ctx) {
  const plan = ctx.params.plan;
  if (!PLAN_KEYS.includes(plan)) return go("/plans", { replace: true });   // "comp" is never for sale
  const amount = price(plan), s = state.settings || {}, uid = state.user.uid, code = paymentCode(uid);
  const hasAccount = s.accountNumber;
  const cl = APP.cloudinary;

  ctx.view.innerHTML = `<div class="stack-l"><header><h1>Pay for ${PLANS[plan].label}</h1>
    <p class="muted" style="margin:0">Make a bank transfer, then tell us about it below.</p></header>
    <section class="card stack"><h2>1. Transfer ${amount ? `<strong>${naira(amount)}</strong>` : "the plan amount"}</h2>
      ${hasAccount ? `<dl class="kv"><dt>Bank</dt><dd>${esc(s.bankName || "")}</dd><dt>Account name</dt><dd>${esc(s.accountName || "")}</dd><dt>Account number</dt>
        <dd><span class="row"><strong>${esc(s.accountNumber)}</strong><button class="linkbtn small" data-copy="${esc(s.accountNumber)}">Copy</button></span></dd></dl>`
        : `<div class="notice warn">Payment details haven't been added yet. Please <a href="${esc(waLink("Hi, I want to pay for the " + PLANS[plan].label + " plan. Please send the account details."))}" target="_blank" rel="noopener">message us on WhatsApp</a>.</div>`}
      <div><p class="small muted" style="margin-bottom:6px">Put this code in the transfer narration so we can match it quickly:</p>
        <div class="copybox"><span>${esc(code)}</span><button class="linkbtn small" data-copy="${esc(code)}">Copy</button></div></div></section>
    <form id="f" class="card stack" novalidate><h2>2. Tell us about it</h2>
      <label>Transfer reference or session ID<input id="ref" maxlength="60" autocomplete="off" required><span class="field-hint">From your bank receipt or alert. At least 4 characters.</span></label>
      <label>Amount you sent (₦)<input id="amt" type="number" inputmode="numeric" min="1" value="${amount || ""}" required></label>
      <label>Date you paid<input id="date" type="date" value="${dayKey()}" max="${dayKey()}" required></label>
      ${cl.cloudName ? '<label>Receipt screenshot (optional)<input id="rcpt" type="file" accept="image/*"><span class="field-hint">Helps us approve faster. Max 5 MB.</span></label>' : ""}
      <label class="check"><input type="checkbox" id="ok"><span class="small">I understand the refund rule: within 7 days if my payment was approved but I couldn't get access. No refunds once access has been used.</span></label>
      <p id="err" class="error" role="alert" hidden></p>
      <button class="btn primary block" id="send" type="submit">Submit payment</button>
      ${hint("After you submit, you can follow the status on the next screen. Usually within 24 hours.", "check")}</form></div>`;

  ctx.view.querySelectorAll("[data-copy]").forEach((b) => (b.onclick = () => copyText(b.dataset.copy)));
  const $ = (q) => ctx.view.querySelector(q), err = (m) => { $("#err").textContent = m; $("#err").hidden = !m; };

  $("#f").addEventListener("submit", async (e) => {
    e.preventDefault(); err("");
    const reference = $("#ref").value.trim(), amt = Number($("#amt").value), paidOn = $("#date").value, file = $("#rcpt")?.files?.[0];
    if (reference.length < 4) return err("Please enter the transfer reference (at least 4 characters).");
    if (!(amt > 0)) return err("Please enter the amount you sent.");
    if (!paidOn) return err("Please choose the date you paid.");
    if (!$("#ok").checked) return err("Please tick the box to confirm you understand the refund rule.");
    if (file && (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024)) return err("The receipt must be an image under 5 MB.");
    const btn = $("#send"); btn.disabled = true; btn.textContent = "Submitting...";
    try {
      let receiptUrl = "";
      if (file && cl.cloudName) {
        const small = await compressImage(file, { maxSide: 1400, quality: 0.75 });
        receiptUrl = (await uploadToCloudinary(small.blob, small.name, cl.folder)).url;
      }
      await addDoc(collection(db, "payments"), {
        uid, plan, amount: amt, reference, paidOn, receiptUrl, status: "pending", createdAt: serverTimestamp(),
      });
      toast("Payment submitted. We'll review it shortly.", "good");
      go("/payments");
    } catch (ex) {
      btn.disabled = false; btn.textContent = "Submit payment";
      if (ex.code === "upload-failed") err("The receipt couldn't be uploaded. Remove it and submit again, or try later.");
      else if (!handleError(ex)) err("Couldn't submit. Please check your internet and try again.");
      else err("Couldn't submit right now. Please try again.");
    }
  });
}

const STEPS = ["Submitted", "Under review", "Approved"];
const stepOf = { pending: 0, reviewing: 1, approved: 2, rejected: 1 };

export async function paymentsPage(ctx) {
  const uid = state.user.uid;
  ctx.view.innerHTML = `<div class="stack-l"><header><p class="muted" style="margin:0">We review payments manually, usually within 24 hours.</p></header><div id="list">${skeleton(2)}</div></div>`;
  const box = ctx.view.querySelector("#list");
  try {
    const [snap] = await Promise.all([getDocs(query(collection(db, "payments"), where("uid", "==", uid))), refreshSub()]);
    if (!ctx.alive()) return;
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data(), at: toMillis(d.data().createdAt) })).sort((a, b) => (b.at || Date.now()) - (a.at || Date.now()));
    box.innerHTML = rows.length ? `<div class="stack">${rows.map((p) => {
      const st = stepOf[p.status] ?? 0, bad = p.status === "rejected";
      return `<div class="card stack-s"><div class="row between"><strong>${esc(PLANS[p.plan]?.label || p.plan)} · ${naira(p.amount)}</strong>
          <span class="badge ${p.status === "approved" ? "green" : bad ? "red" : "gold"}">${bad ? "Rejected" : p.status === "approved" ? "Approved" : p.status === "reviewing" ? "Under review" : "Submitted"}</span></div>
        <div class="steps" aria-label="Payment status">${STEPS.map((l, i) => `<div class="step ${i <= st ? "on" : ""} ${bad && i === 1 ? "bad" : ""}"><i></i>${bad && i === 1 ? "Not approved" : l}</div>`).join("")}</div>
        <p class="small muted" style="margin:0">Reference ${esc(p.reference)} · sent ${esc(p.paidOn || "")}${p.at ? ` · submitted ${fmtDateTime(p.at)}` : " · syncing..."}</p>
        ${p.status === "approved" ? `<p class="small" style="margin:0;color:var(--emerald)">Access is active${state.sub ? ` until ${fmtDate(state.sub.expiresAt)}` : ""}. You're all set.</p>` : ""}
        ${bad ? '<p class="small" style="margin:0">We couldn\'t match this payment. Message us and we\'ll sort it out.</p>' : ""}
        ${p.status !== "approved" ? `<a class="small" href="${esc(waLink(`Hi, I need help with my payment.\nReference: ${p.reference}\nPlan: ${PLANS[p.plan]?.label || p.plan}\nNickname: @${state.profile.nickname}`))}" target="_blank" rel="noopener">Need help? Chat on WhatsApp</a>` : ""}</div>`;
    }).join("")}</div>` : '<div class="card center stack"><p class="muted">No payments yet.</p><a class="btn primary" href="#/plans">See plans</a></div>';
  } catch (e) {
    if (!ctx.alive()) return;
    box.innerHTML = '<div class="card center"><p class="muted">Couldn\'t load your payments.</p></div>';
    handleError(e, { retry: () => paymentsPage(ctx) });
  }
}
