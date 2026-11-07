// Leaderboard (1 read) and student search (up to 15 reads per search). Both are paid features; the rules enforce it.
import { state, isPaid } from "../state.js";
import { loadLeaderboard, searchStudents } from "../data.js";
import { esc, short, fmtDate, debounce } from "../lib/util.js";
import { avatar, icon, lockedCard, sheet, skeleton, hint } from "../ui.js";
import { handleError } from "../net.js";

export default async function leaderboard(ctx) {
  if (!isPaid()) { ctx.view.innerHTML = `<div class="stack-l"><header><h1>Leaderboard</h1></header>${lockedCard("The leaderboard is for subscribers", "See the top 100 students and where you stand.")}</div>`; return; }
  ctx.view.innerHTML = `<div class="stack-l"><header><h1>Leaderboard</h1><p class="muted" style="margin:0">Top students by points. A point is one correct answer on your first try at a set.</p></header><div id="b">${skeleton(3)}</div></div>`;
  const box = ctx.view.querySelector("#b");
  try {
    const { entries, updatedAtMs } = await loadLeaderboard();
    if (!ctx.alive()) return;
    const me = state.user.uid, idx = entries.findIndex((e) => e.uid === me), mine = state.profile?.points || 0;
    box.innerHTML = `<div class="stack">
      <div class="card ${idx >= 0 ? "accent" : ""} row" style="gap:14px"><span class="tile">${icon("trophy")}</span><div class="grow">
        <strong>${idx >= 0 ? `You're #${idx + 1}` : "You're not in the top 100 yet"}</strong>
        <div class="small muted">${mine} point${mine === 1 ? "" : "s"}${updatedAtMs ? ` as of ${fmtDate(updatedAtMs)}` : ""}</div></div></div>
      ${entries.length ? `<div class="list">${entries.map((e, i) => `<div class="item" ${e.uid === me ? 'style="border-color:var(--brand)"' : ""}>
        <strong style="min-width:28px">${i + 1}</strong>${avatar(e.nick, e.color, 36)}<div class="grow"><strong>@${esc(short(e.nick))}</strong><div class="meta">${e.solved} set${e.solved === 1 ? "" : "s"} completed</div></div><strong>${e.points}</strong></div>`).join("")}</div>`
        : '<div class="card center"><p class="muted" style="margin:0">The leaderboard hasn\'t been published yet. Finish a set and check back soon.</p></div>'}
      ${hint("Points update when the board is refreshed, usually once a day.", "info")}</div>`;
  } catch (e) {
    if (!ctx.alive()) return;
    box.innerHTML = '<div class="card center stack"><p class="muted">Couldn\'t load the leaderboard.</p><button class="btn" id="r">Try again</button></div>';
    box.querySelector("#r").onclick = () => leaderboard(ctx);
    handleError(e, { retry: () => leaderboard(ctx) });
  }
}

export async function students(ctx) {
  if (!isPaid()) { ctx.view.innerHTML = `<div class="stack-l"><header><h1>Find a student</h1></header>${lockedCard("Student search is for subscribers", "Look up classmates by nickname and see how they're doing.")}</div>`; return; }
  ctx.view.innerHTML = `<div class="stack-l"><header><h1>Find a student</h1><p class="muted" style="margin:0">Type the start of a nickname. Only nicknames, points and sets completed are shown.</p></header>
    <label>Nickname<input id="q" type="search" placeholder="e.g. emeka" autocomplete="off" aria-label="Search nickname"></label><div id="res" class="stack-s"></div></div>`;
  const res = ctx.view.querySelector("#res"), input = ctx.view.querySelector("#q");
  let seq = 0, board = null;
  loadLeaderboard().then((b) => { board = b; }).catch(() => {});

  const run = debounce(async () => {
    const q = input.value.trim();
    const mine = ++seq;
    if (q.replace(/^@/, "").length < 2) { res.innerHTML = '<p class="muted small">Type at least 2 letters.</p>'; return; }
    res.innerHTML = skeleton(2);
    try {
      const rows = await searchStudents(q);
      if (mine !== seq || !ctx.alive()) return;
      res.innerHTML = rows.length ? `<div class="list">${rows.map((r) => `<button class="item" data-u="${esc(r.uid)}">${avatar(r.nick, r.color, 40)}<div class="grow"><strong>@${esc(short(r.nick))}</strong>
        <div class="meta">${r.points} point${r.points === 1 ? "" : "s"} · ${r.solved} set${r.solved === 1 ? "" : "s"}</div></div>${icon("chevron")}</button>`).join("")}</div>` : '<div class="card center"><p class="muted" style="margin:0">No student found with that nickname.</p></div>';
      res.querySelectorAll("[data-u]").forEach((b) => (b.onclick = () => card(rows.find((r) => r.uid === b.dataset.u))));
    } catch (e) {
      if (mine !== seq || !ctx.alive()) return;
      res.innerHTML = '<div class="card center"><p class="muted" style="margin:0">Couldn\'t search right now.</p></div>';
      handleError(e);
    }
  }, 400);
  input.addEventListener("input", run);
  input.focus();

  function card(r) {
    const pos = board ? board.entries.findIndex((e) => e.uid === r.uid) : -1;
    const s = sheet(`<div class="stack center">${avatar(r.nick, r.color, 72)}<h2 style="margin:0">@${esc(short(r.nick))}</h2>
      <div class="row" style="gap:12px"><div class="card tight grow"><div class="price">${r.points}</div><div class="muted small">Points</div></div>
      <div class="card tight grow"><div class="price">${r.solved}</div><div class="muted small">Sets completed</div></div>
      <div class="card tight grow"><div class="price">${pos >= 0 ? "#" + (pos + 1) : "—"}</div><div class="muted small">Leaderboard</div></div></div>
      ${r.since ? `<p class="small muted" style="margin:0">Member since ${fmtDate(r.since)}</p>` : ""}
      <button class="btn block" data-c>Close</button></div>`, { title: "Student" });
    s.el.querySelector("[data-c]").onclick = s.close;
  }
}
