// Arena hub: leaderboard and student search now; group matches (Phase 4) and tournaments (Phase 3) arrive later.
import { isPaid } from "../state.js";
import { icon, lockedCard } from "../ui.js";

export default function arena(ctx) {
  const paid = isPaid();
  const tile = (href, ic, title, text, locked) => `<a class="item ${locked ? "lock" : ""}" href="${href}"><span class="tile ${locked ? "gold" : ""}">${icon(locked ? "lock" : ic)}</span>
    <div class="grow"><strong>${title}</strong><div class="meta">${text}</div></div>${icon("chevron")}</a>`;
  ctx.view.innerHTML = `<div class="stack-l"><header><h1>Arena</h1><p class="muted">See how you compare and find your classmates.</p></header>
    <div class="list">
      <a class="item" href="#/tournaments"><span class="tile">${icon("trophy")}</span><div class="grow"><strong>Tournaments</strong><div class="meta">Sponsor-funded contests. Free entry, prizes for adults</div></div>${icon("chevron")}</a>
      <a class="item" href="#/hall"><span class="tile gold">${icon("sparkle")}</span><div class="grow"><strong>Hall of Fame</strong><div class="meta">Past winners</div></div>${icon("chevron")}</a>
      ${tile("#/matches", "trophy", "Group matches", paid ? "Scheduled evening matches. Join and compete live" : "Subscribers only", !paid)}
      ${tile("#/leaderboard", "trophy", "Leaderboard", paid ? "Top 100 students by points" : "Subscribers only", !paid)}
      ${tile("#/students", "user", "Find a student", paid ? "Search by nickname" : "Subscribers only", !paid)}</div>
    ${paid ? "" : lockedCard("Unlock ranks and the leaderboard", "Subscribers see how they rank, join group matches and can search other students.")}</div>`;
}
