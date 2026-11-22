// Affiliate program (student side): apply, then share a personal link, track sign-ups, rewards and earnings, request a payout.
import { db, doc, getDoc, setDoc, addDoc, collection, query, where, getDocs, serverTimestamp } from "../firebase.js";
import { state } from "../state.js";
import { handleError } from "../net.js";
import { linkTo, copyLink, shareLink } from "../share.js";
import { MIN_FOLLOWERS, PAYOUT_DAYS, PLATFORMS, affPct, affStats, affDays, moneyOn, dayWord } from "../lib/affiliate.js";
import { esc, naira, fmtDate, toMillis, settle } from "../lib/util.js";
import { icon, skeleton, toast } from "../ui.js";

const pct = () => affPct(state.settings);
const minPay = () => affStats({}, state.settings).min;

export default async function affiliatePage(ctx) {
  const uid = state.user.uid;
  ctx.view.innerHTML = `<section class="stack-l"><header><h1>Affiliate program</h1><p class="muted" style="margin:0">Share SUMAS Quiz Arena and earn free app access for every friend who joins.</p></header><div id="a">${skeleton(3)}</div></section>`;
  const box = ctx.view.querySelector("#a");
  let aff;
  try { const s = await getDoc(doc(db, "affiliates", uid)); aff = s.exists() ? s.data() : null; }
  catch (e) { if (ctx.alive()) { box.innerHTML = '<div class="card center"><p class="muted">Couldn\'t load this right now.</p></div>'; handleError(e); } return; }
  if (!ctx.alive()) return;
  if (!aff) return applyForm(ctx, box);
  if (aff.status === "pending") { box.innerHTML = `<div class="card center stack-s"><span class="tile" style="margin:0 auto">${icon("info")}</span><h2>Application received</h2><p class="muted" style="margin:0">We are checking your ${esc(aff.platform)} account (${esc(aff.handle)}). You will get your personal link here once you are approved.</p></div>`; return; }
  if (aff.status !== "approved") { box.innerHTML = `<div class="card center stack-s"><h2>Not approved this time</h2><p class="muted" style="margin:0">${esc(aff.reviewNote || "Your application did not meet the requirements.")} Message us on WhatsApp if you think this is a mistake.</p></div>`; return; }
  return dashboard(ctx, box, aff);
}

function requirements() {
  const d = affDays(state.settings), money = moneyOn(state.settings);
  return `<div class="card stack-s"><strong>How it works</strong>
    <div class="small stack-s" style="gap:6px">
      <div>1. Apply with a social account that has <strong>${MIN_FOLLOWERS}+ followers</strong>. We check it by hand.</div>
      <div>2. You get a personal referral link and code.</div>
      <div>3. For every new student who signs up with your link you get <strong>${dayWord(d.signup)} of free app access</strong>.</div>
      ${d.paid ? `<div>4. When one of them subscribes, you get <strong>${d.paid} more free days</strong>.</div>` : ""}
      ${money ? `<div>${d.paid ? 5 : 4}. You also earn <strong>${pct()}%</strong> of every subscription they pay for. Once you have <strong>${naira(minPay())}</strong> you can request a payout. We pay by hand within <strong>${PAYOUT_DAYS} days</strong>.</div>` : ""}</div>
    <p class="small muted" style="margin:0">Only new students who sign up with your link in their first days count. Signing yourself up or fake accounts will get you removed. Free days are added to your account by us after we check your numbers.</p></div>`;
}

function applyForm(ctx, box) {
  box.innerHTML = `${requirements()}
    <form id="f" class="card stack" novalidate><strong>Apply</strong>
      <label>Platform<select id="pf">${PLATFORMS.map((p) => `<option>${esc(p)}</option>`).join("")}</select></label>
      <label>Your username or link<input id="hd" maxlength="120" placeholder="@yourname or the link to your page" required></label>
      <label>Followers<input id="fl" type="number" inputmode="numeric" min="0" placeholder="e.g. 120" required><span class="field-hint">You need at least ${MIN_FOLLOWERS}.</span></label>
      <label>Anything to add? (optional)<input id="nt" maxlength="300" placeholder="e.g. I post study tips for pharmacy students"></label>
      <p class="error" id="err" role="alert" hidden></p>
      <button class="btn primary block" id="go" type="submit">Send application</button></form>`;
  const f = box.querySelector("#f"), err = box.querySelector("#err");
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const handle = f.querySelector("#hd").value.trim(), followers = Math.floor(Number(f.querySelector("#fl").value));
    err.hidden = false;
    if (handle.length < 2) { err.textContent = "Add your username or the link to your page."; return; }
    if (!(followers >= MIN_FOLLOWERS)) { err.textContent = `You need at least ${MIN_FOLLOWERS} followers to join for now. Come back when you have more.`; return; }
    err.hidden = true; const btn = f.querySelector("#go"); btn.disabled = true;
    const r = await settle(setDoc(doc(db, "affiliates", state.user.uid), { uid: state.user.uid, nickname: state.profile.nickname, platform: f.querySelector("#pf").value, handle, followers, note: f.querySelector("#nt").value.trim(), status: "pending", createdAt: serverTimestamp() }), 10000);
    if (r === "denied") { btn.disabled = false; err.hidden = false; err.textContent = "We couldn't send that. Check your connection and try again."; return; }
    toast(r === "pending" ? "Saved. It will send when you are online" : "Application sent", "good"); if (ctx.alive()) affiliatePage(ctx);
  });
}

async function dashboard(ctx, box, aff) {
  const uid = state.user.uid;
  let referrals = [], commissions = [], payouts = [];
  try {
    const q = (c) => getDocs(query(collection(db, c), where("affiliateUid", "==", uid)));
    const [r, c, p] = await Promise.all([q("referrals"), q("commissions"), q("payouts")]);
    referrals = r.docs.map((d) => ({ ...d.data(), createdAt: toMillis(d.data().createdAt) }));
    commissions = c.docs.map((d) => d.data());
    payouts = p.docs.map((d) => ({ id: d.id, ...d.data(), createdAt: toMillis(d.data().createdAt), paidAt: toMillis(d.data().paidAt) })).sort((a, b) => b.createdAt - a.createdAt);
  } catch (e) { if (ctx.alive()) { box.innerHTML = '<div class="card center"><p class="muted">Couldn\'t load your numbers right now.</p></div>'; handleError(e); } return; }
  if (!ctx.alive()) return;
  const st = affStats({ referrals, commissions, payouts, aff }, state.settings);
  const link = linkTo("/signup?ref=" + aff.code);
  const d = affDays(state.settings), money = moneyOn(state.settings) || st.unpaid > 0 || st.paid > 0 || payouts.length > 0;
  box.innerHTML = `<div class="stack-l">
    <div class="card stack-s"><span class="small muted">Your referral code</span><div class="price" style="letter-spacing:.12em">${esc(aff.code)}</div>
      <div class="small" style="word-break:break-all">${esc(link)}</div>
      <div class="row wrap"><button class="btn small primary" id="cp">${icon("copy", "sm")} Copy link</button><button class="btn small" id="sh">${icon("share", "sm")} Share</button></div></div>
    <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px"><div class="card stat"><div class="price">${st.signups}</div><div class="small muted">Signed up</div></div><div class="card stat"><div class="price">${st.subscribed}</div><div class="small muted">Subscribed</div></div><div class="card stat"><div class="price">${st.daysPending}</div><div class="small muted">Days coming</div></div></div>
    <div class="card stack-s"><h2>Free access</h2>
      <div class="row" style="justify-content:space-between"><span>Earned so far</span><strong>${dayWord(st.daysEarned)}</strong></div>
      <div class="row" style="justify-content:space-between"><span>Already added to your account</span><strong>${dayWord(st.daysGranted)}</strong></div>
      <div class="row" style="justify-content:space-between"><span>Coming soon</span><strong>${dayWord(st.daysPending)}</strong></div>
      <p class="small muted" style="margin:0">You get ${dayWord(d.signup)} for each sign-up${d.paid ? ` and ${d.paid} more when they subscribe` : ""}. We add earned days to your account by hand, usually within a day or two.</p></div>
    ${money ? `<div class="card stack-s"><h2>Earnings</h2>
      <div class="row" style="justify-content:space-between"><span>Ready to pay out</span><strong>${naira(st.unpaid)}</strong></div>
      <div class="row" style="justify-content:space-between"><span>Already paid</span><strong>${naira(st.paid)}</strong></div>
      <p class="small muted" style="margin:0">Payouts start at ${naira(st.min)} and are paid within ${PAYOUT_DAYS} days of your request.</p>
      <div id="po">${st.open ? '<div class="notice warn small">Your payout request is with us. We pay within ' + PAYOUT_DAYS + ' days.</div>' : st.canRequest ? '<button class="btn primary block" id="rq">Request payout of ' + naira(st.unpaid) + '</button>' : `<div class="small muted">Keep going: ${naira(Math.max(0, st.min - st.unpaid))} more to reach the ${naira(st.min)} minimum.</div>`}</div>
      ${payouts.length ? `<div class="stack-s"><strong class="small">Payouts</strong>${payouts.map((p) => `<div class="row small" style="justify-content:space-between"><span>${fmtDate(p.createdAt)}</span><span>${naira(p.amount)}</span><span class="badge ${p.status === "paid" ? "green" : "gold"}">${p.status === "paid" ? "Paid " + fmtDate(p.paidAt) : "Requested"}</span></div>`).join("")}</div>` : ""}</div>` : ""}
    ${referrals.length ? `<div class="stack-s"><h2>Your people</h2><div class="list">${[...referrals].sort((a, b) => b.createdAt - a.createdAt).map((r) => `<div class="item"><div class="grow"><strong>@${esc(r.nickname)}</strong><div class="meta">Joined ${fmtDate(r.createdAt)}</div></div><span class="badge ${r.subscribed ? "green" : ""}">${r.subscribed ? "Subscribed" : "Free"}</span></div>`).join("")}</div></div>` : ""}
    ${requirements()}</div>`;
  box.querySelector("#cp").onclick = () => copyLink("/signup?ref=" + aff.code);
  box.querySelector("#sh").onclick = () => shareLink({ title: "SUMAS Quiz Arena", text: `Practise past-question style banks and compete in prize tournaments on SUMAS Quiz Arena. Sign up with my code ${aff.code}:`, path: "/signup?ref=" + aff.code });
  box.querySelector("#rq")?.addEventListener("click", () => payoutForm(ctx, st.unpaid));
}

function payoutForm(ctx, amount) {
  import("../ui.js").then(({ sheet }) => {
    const s = sheet(`<form class="stack" id="pf" novalidate><p class="small muted" style="margin:0">Where should we send ${naira(amount)}? We pay by hand within ${PAYOUT_DAYS} days.</p>
      <label>Account name<input id="an" maxlength="80" required></label><label>Bank<input id="bn" maxlength="60" required placeholder="e.g. GTBank, Opay"></label>
      <label>Account number<input id="ac" inputmode="numeric" maxlength="10" required placeholder="10 digits"></label>
      <p class="error" id="er" role="alert" hidden></p><button class="btn primary block" id="ok" type="submit">Send request</button></form>`, { title: "Request payout" });
    const f = s.el.querySelector("#pf"), er = f.querySelector("#er");
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const accountName = f.querySelector("#an").value.trim(), bankName = f.querySelector("#bn").value.trim(), accountNumber = f.querySelector("#ac").value.trim();
      er.hidden = false;
      if (accountName.length < 3 || bankName.length < 2) { er.textContent = "Add the account name and the bank."; return; }
      if (!/^[0-9]{10}$/.test(accountNumber)) { er.textContent = "The account number must be 10 digits."; return; }
      er.hidden = true; f.querySelector("#ok").disabled = true;
      const r = await settle(addDoc(collection(db, "payouts"), { affiliateUid: state.user.uid, amount, accountName, bankName, accountNumber, status: "requested", createdAt: serverTimestamp() }), 10000);
      if (r === "denied") { f.querySelector("#ok").disabled = false; er.hidden = false; er.textContent = "We couldn't send that. Check your connection and try again."; return; }
      s.close(); toast(r === "pending" ? "Saved. It will send when you are online" : "Payout requested", "good"); if (ctx.alive()) affiliatePage(ctx);
    });
  });
}
