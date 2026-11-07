import { state, isPaid, freeCount } from "../state.js";
import { loadBanks } from "../data.js";
import { esc, fmtDate } from "../lib/util.js";
import { icon, skeleton, badge, hint } from "../ui.js";
import { handleError } from "../net.js";

const bestFor = (id) => {
  const rs = (state.progress?.recent || []).filter((r) => r.id === id && !r.part);   // custom runs (5 questions, one topic...) don't set the "best"
  return rs.length ? Math.max(...rs.map((r) => Math.round((r.score / r.total) * 100))) : null;
};

export default async function practice(ctx) {
  ctx.view.innerHTML = `<div class="stack-l"><header><p class="muted" style="margin:0">Pick a question bank. ${isPaid() ? "You have full access." : "The free taster is open to everyone."}</p></header>
    <a class="item" href="#/store"><span class="tile gold">${icon("book")}</span><div class="grow"><strong>Notes &amp; summaries</strong><div class="meta">Study material on Selar</div></div>${icon("chevron")}</a>
    <div id="list">${skeleton(3)}</div></div>`;
  const box = ctx.view.querySelector("#list");
  try {
    const banks = await loadBanks();
    if (!ctx.alive()) return;
    box.innerHTML = banks.length
      ? `<div class="list">${banks.map((b) => `<a class="item" href="#/practice/${esc(b.id)}"><span class="tile">${icon("book")}</span><div class="grow"><strong>${esc(b.title)}</strong>
          <div class="meta">${esc(b.topic || "")}${b.setCount ? ` · ${b.setCount} set${b.setCount === 1 ? "" : "s"}` : ""}</div></div>${icon("chevron")}</a>`).join("")}</div>`
      : '<div class="card center"><p class="muted">No question banks yet. Check back soon.</p></div>';
  } catch (e) {
    if (!ctx.alive()) return;
    box.innerHTML = '<div class="card center"><p class="muted">Couldn\'t load the banks.</p></div>';
    handleError(e, { retry: () => practice(ctx) });
  }
}

export async function bankPage(ctx) {
  const { bankId } = ctx.params;
  ctx.view.innerHTML = `<div class="stack-l">${skeleton(3)}</div>`;
  let banks;
  try { banks = await loadBanks(); }
  catch (e) { if (ctx.alive()) { ctx.view.innerHTML = '<div class="card center stack"><p class="muted">Couldn\'t load this bank.</p><a class="btn" href="#/practice">Back</a></div>'; handleError(e, { retry: () => bankPage(ctx) }); } return; }
  if (!ctx.alive()) return;
  const bank = banks.find((b) => b.id === bankId);
  if (!bank) { ctx.view.innerHTML = '<div class="card center stack"><h2>Bank not found</h2><a class="btn" href="#/practice">Back to practise</a></div>'; return; }

  const paid = isPaid();
  const n = bank.freeCount || freeCount();
  const tBest = bestFor("taster_" + bank.id);
  const sets = bank.sets || [];
  ctx.view.innerHTML = `<div class="stack-l">
    <header><h1>${esc(bank.title)}</h1><p class="muted" style="margin:0">${esc(bank.topic || "")}</p></header>
    <section class="stack-s"><h2>Free taster</h2>
      <a class="item" href="#/quiz/${esc(bank.id)}/taster"><span class="tile gold">${icon("sparkle")}</span><div class="grow"><strong>Try the first ${n} questions</strong>
        <div class="meta">Free for everyone${tBest !== null ? ` · best ${tBest}%` : ""}</div></div>${tBest !== null ? badge("Done", "green") : ""}${icon("chevron")}</a></section>
    <section class="stack-s"><h2>Full sets</h2>
      ${sets.length ? `<div class="list">${sets.map((s) => {
        const best = bestFor(s.id), added = s.addedAt ? ` · added ${fmtDate(s.addedAt)}` : "";
        if (s.locked && !state.isAdmin) return `<div class="item lock" aria-disabled="true"><span class="tile gold">${icon("lock")}</span><div class="grow"><strong>${esc(s.title)}</strong><div class="meta">Locked for now${added}</div></div></div>`;
        return paid
          ? `<a class="item" href="#/quiz/${esc(bank.id)}/${esc(s.id)}"><span class="tile">${icon("book")}</span><div class="grow"><strong>${esc(s.title)}</strong><div class="meta">${s.count} questions${best !== null ? ` · best ${best}%` : ""}${added}${s.locked ? " · locked (admin)" : ""}</div></div>${best !== null ? badge("Done", "green") : ""}${icon("chevron")}</a>`
          : `<a class="item lock" href="#/plans"><span class="tile gold">${icon("lock")}</span><div class="grow"><strong>${esc(s.title)}</strong><div class="meta">${s.count} questions · subscribers only</div></div>${icon("chevron")}</a>`;
      }).join("")}</div>` : '<p class="muted">Sets for this bank are coming soon.</p>'}
      ${paid ? "" : `<div class="card gold stack-s"><strong>Unlock every set</strong><p class="small muted">Full banks, ranks and group matches with a subscription.</p><a class="btn gold small" href="#/plans">See plans</a></div>`}</section>
    ${hint("Questions are saved on your phone once opened, so they still work offline.", "check")}
  </div>`;
}
