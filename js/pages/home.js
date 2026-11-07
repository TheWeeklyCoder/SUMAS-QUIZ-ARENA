import { state, isPaid, hasPaidSub, freeForAll } from "../state.js";
import { loadBanks } from "../data.js";
import { esc, short, daysLeft, fmtDate, randomFrom, ls, weekKey, pct } from "../lib/util.js";
import { isComp, PLANS } from "../lib/plans.js";
import { avatar, hint, icon, skeleton } from "../ui.js";
import { handleError } from "../net.js";

const greet = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };

export default async function home(ctx) {
  const p = state.profile, uid = state.user.uid;
  const paid = isPaid(), own = hasPaidSub(), comp = isComp(state.sub);
  const quote = randomFrom(state.quotes?.home || ["Keep going."]);
  const resume = ls("resume_" + uid);
  const prog = state.progress;
  const last = prog?.recent?.[0];
  const wp = prog?.weekProgress?.week === weekKey() ? prog.weekProgress.n : 0;
  const goal = prog?.weeklyGoal || 5;

  let subCard;
  if (comp) {
    subCard = `<div class="card accent row" style="gap:14px;align-items:flex-start"><span class="tile">${icon("sparkle")}</span><div class="grow stack-s"><div class="row wrap" style="gap:8px"><strong>Complimentary access</strong><span class="badge green">Full access</span></div>
      <p class="small muted" style="margin:0">You have full access. No payment needed.</p></div></div>`;
  } else if (!own && freeForAll()) {
    subCard = `<div class="card accent row" style="gap:14px;align-items:flex-start"><span class="tile">${icon("sparkle")}</span><div class="grow stack-s"><div class="row wrap" style="gap:8px"><strong>Free for everyone right now</strong><span class="badge green">Full access</span></div>
      <p class="small muted" style="margin:0">Every set, ranks, the leaderboard and group matches are open to all students for a limited time. Enjoy!</p></div></div>`;
  } else if (own) {
    const d = daysLeft(state.sub.expiresAt);
    const total = PLANS[state.sub.plan]?.days || 30;
    subCard = `<div class="card accent stack-s"><div class="row between"><div class="row" style="gap:12px"><span class="tile">${icon("shield")}</span><strong>Subscription active</strong></div>
      <span class="badge green">${d} day${d === 1 ? "" : "s"} left</span></div>
      <div class="bar" aria-hidden="true"><i style="width:${Math.min(100, Math.round((d / Math.max(total, d)) * 100))}%"></i></div>
      <p class="small muted" style="margin:0">Full access until ${fmtDate(state.sub.expiresAt)}.${d <= 3 ? " Renew now and the new time is added on top of what's left." : ""}</p>
      ${d <= 3 ? '<a class="btn gold small" href="#/plans" style="align-self:flex-start">Renew</a>' : ""}</div>`;
  } else {
    subCard = `<div class="card gold stack-s"><div class="row" style="gap:12px"><span class="tile gold">${icon("lock")}</span><strong>You're on the free plan</strong></div>
      <p class="small muted" style="margin:0">Try the first ${state.settings?.freeCount || 10} questions of every bank. Subscribe for full banks, ranks and group matches.</p>
      <a class="btn gold small" href="#/plans" style="align-self:flex-start">See plans</a>
      ${state.sub ? `<p class="small muted" style="margin:0">Your last subscription ended on ${fmtDate(state.sub.expiresAt)}.</p>` : ""}</div>`;
  }

  ctx.view.innerHTML = `<div class="stack-l">
    <section class="hero stack">
      <div class="hero-head">${avatar(p.nickname, p.avatarColor, 56)}
        <div class="hero-id"><div class="hero-top"><span class="small">${greet()},</span>${prog?.streak ? `<span class="badge gold" title="Day streak">${icon("fire", "sm")} ${prog.streak}</span>` : ""}</div>
          <h1>@${esc(short(p.nickname))}</h1></div></div>
      <p class="hero-quote">“${esc(quote && typeof quote === "object" ? quote.t : quote)}”${quote && quote.by ? `<span class="small" style="display:block;opacity:.8;font-weight:600;margin-top:4px">${esc(quote.by)}</span>` : ""}</p>
      <div><div class="row between small"><span>This week</span><span>${wp} of ${goal} sessions</span></div>
        <div class="bar" style="margin-top:8px"><i style="width:${Math.min(100, pct(wp, goal))}%"></i></div></div>
    </section>
    ${resume ? `<a class="item" href="#/quiz/${esc(resume.bankId)}/${esc(resume.setId)}?resume=1"><span class="tile">${icon("arrow")}</span><div class="grow"><strong>Continue where you left off</strong>
      <div class="meta">${esc(resume.title)} · question ${resume.i + 1} of ${resume.total}</div></div>${icon("chevron")}</a>` : ""}
    ${subCard}
    <section class="stack-s"><div class="row between"><h2 style="margin:0">Practise</h2><a href="#/practice" class="small">See all</a></div>
      <div id="banks">${skeleton(2)}</div>
      ${last ? `<p class="small muted" style="margin:0">Last session: ${esc(last.title)}, ${last.score}/${last.total}</p>` : ""}</section>
    ${hint("Your progress is saved automatically, even if your connection drops.", "check")}
  </div>`;

  const box = ctx.view.querySelector("#banks");
  try {
    const banks = await loadBanks();
    if (!ctx.alive()) return;
    box.innerHTML = banks.length
      ? `<div class="list">${banks.slice(0, 4).map((b) => `<a class="item" href="#/practice/${esc(b.id)}"><span class="tile">${icon("book")}</span><div class="grow"><strong>${esc(b.title)}</strong>
          <div class="meta">${esc(b.topic || "")}${b.setCount ? ` · ${b.setCount} set${b.setCount === 1 ? "" : "s"}` : ""}</div></div>${icon("chevron")}</a>`).join("")}</div>`
      : '<div class="card center"><p class="muted" style="margin:0">Question banks are on their way. Check back soon.</p></div>';
  } catch (e) {
    if (!ctx.alive()) return;
    box.innerHTML = '<div class="card center"><p class="muted" style="margin:0">Couldn\'t load question banks.</p></div>';
    handleError(e, { retry: () => home(ctx) });
  }
}
