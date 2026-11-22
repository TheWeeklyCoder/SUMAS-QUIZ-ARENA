// Progress page. Everything comes from progress/{uid} (1 read, already loaded at login) plus the cached bank list.
import { state, isPaid } from "../state.js";
import { esc, pct, fmtDate, fmtDur, weekKey } from "../lib/util.js";
import { calendarDays, bankAccuracy, avgSecPerQuestion, improvement, keepMissing, routeSetId, logStillValid } from "../lib/stats.js";
import { icon, lockedCard, ring, sheet, skeleton, toast } from "../ui.js";
import { loadBanks, setWeeklyGoal, loadSet, loadTaster } from "../data.js";
import { explainImage } from "../qview.js";
import { prepareQuiz } from "../lib/quiz.js";
import { handleError } from "../net.js";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

export default async function progress(ctx) {
  ctx.view.innerHTML = skeleton(3);
  let banks = [];
  try { banks = await loadBanks(); } catch { /* offline with nothing cached: bank names fall back to ids */ }
  if (!ctx.alive()) return;
  draw(ctx, banks);
}

function draw(ctx, banks) {
  const p = state.progress || { recent: [], topics: {}, streak: 0, totalScore: 0, bestScore: 0, weeklyGoal: 5, weekProgress: { week: "", n: 0 } };
  const paid = isPaid();
  const recent = p.recent.slice(0, paid ? 20 : 5);
  const topics = Object.values(p.topics).filter((t) => t.t >= 3).map((t) => ({ ...t, p: pct(t.c, t.t) })).sort((a, b) => a.p - b.p);
  const bankName = (id) => banks.find((b) => b.id === id)?.title || String(id).replace(/[-_]+/g, " ");
  const goal = p.weeklyGoal || 5, done = p.weekProgress?.week === weekKey() ? p.weekProgress.n : 0;

  /* ----- score trend (oldest to newest, last 12 sessions) ----- */
  const pts = p.recent.slice(0, 12).reverse().map((r) => pct(r.score, r.total));
  const W = 300, H = 90;
  const trend = pts.length < 2 ? '<p class="muted small center">Complete two sessions to see your trend.</p>' : (() => {
    const xs = (i) => 10 + (i * (W - 20)) / (pts.length - 1), ys = (v) => H - 10 - (v / 100) * (H - 20);
    const d = pts.map((v, i) => `${i ? "L" : "M"}${xs(i).toFixed(1)},${ys(v).toFixed(1)}`).join(" ");
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Score trend over your last ${pts.length} sessions">
      <path d="${d}" fill="none" stroke="var(--emerald)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      ${pts.map((v, i) => `<circle cx="${xs(i).toFixed(1)}" cy="${ys(v).toFixed(1)}" r="3.5" fill="var(--emerald)"/>`).join("")}</svg>`;
  })();

  /* ----- topics ----- */
  const weak = topics.slice(0, 4), strong = [...topics].reverse().slice(0, 4);
  const topicBars = (list) => list.map((t) => `<div><div class="row between small"><span>${esc(t.name)}</span><span class="muted">${t.p}%</span></div>
    <div class="bar ${t.p >= 80 ? "" : t.p >= 50 ? "gold" : "red"}"><i style="width:${t.p}%"></i></div></div>`).join("") || '<p class="muted small">Not enough data yet. Answer more questions.</p>';

  /* ----- extras: average time, improvement ----- */
  const avg = avgSecPerQuestion(p.recent), imp = improvement(p.recent);
  const impText = !imp ? "Finish two sessions to see how you're improving."
    : imp.delta >= 3 ? `Up ${imp.delta} points on your last ${imp.sessions} session${imp.sessions === 1 ? "" : "s"} (${imp.prevAvg}% to ${imp.last}%). Well done.`
    : imp.delta <= -3 ? `Down ${-imp.delta} points on your recent average (${imp.prevAvg}% to ${imp.last}%). Review the missed questions and go again.`
    : `Holding steady around ${imp.last}%. Try a harder set to stretch yourself.`;
  const extras = `<div class="row" style="gap:12px;align-items:stretch">
      <div class="card tight grow center"><div class="price">${avg === null ? "—" : fmtDur(avg).replace(/^0:/, "") + (avg < 60 ? "s" : "")}</div><div class="muted small">per question</div></div>
      <div class="card tight grow stack-s" style="flex:2"><div class="row" style="gap:8px"><span class="badge ${imp && imp.delta >= 3 ? "green" : imp && imp.delta <= -3 ? "red" : ""}">${imp ? (imp.delta >= 3 ? "Improving" : imp.delta <= -3 ? "Dipped" : "Steady") : "Not yet"}</span></div>
        <div class="small muted">${esc(impText)}</div></div></div>`;

  /* ----- streak calendar (last 5 weeks) ----- */
  const days = calendarDays(p.recent, 5), activeDays = days.filter((d) => d.n > 0).length;
  const calendar = `<div class="card stack-s"><div class="row between"><h3 style="margin:0">Streak calendar</h3><span class="badge gold">${icon("fire", "sm")} ${p.streak || 0} day${p.streak === 1 ? "" : "s"}</span></div>
    <div class="cal" role="img" aria-label="${activeDays} active day${activeDays === 1 ? "" : "s"} in the last 5 weeks">
      ${WEEKDAYS.map((w) => `<span class="cal-h">${w}</span>`).join("")}
      ${days.map((d) => `<span class="cal-d ${d.n >= 2 ? "hi" : d.n === 1 ? "on" : ""} ${d.today ? "today" : ""} ${d.future ? "future" : ""}" title="${d.day}: ${d.n} session${d.n === 1 ? "" : "s"}"></span>`).join("")}</div>
    <p class="small muted" style="margin:0">${activeDays} active day${activeDays === 1 ? "" : "s"} in the last 5 weeks. Practise a little every day to keep your streak alive.</p></div>`;

  /* ----- accuracy rings per bank ----- */
  const acc = bankAccuracy(p.recent).slice(0, 6);
  const rings = acc.length ? `<div class="card stack-s"><h3 style="margin:0">Accuracy by bank</h3>
    <div class="rings">${acc.map((a) => `<div class="center">${ring(a.pct, 84)}<div class="small" style="font-weight:700;margin-top:4px">${esc(bankName(a.bank))}</div><div class="small muted">${a.c} of ${a.t}</div></div>`).join("")}</div></div>` : "";

  /* ----- questions you keep missing ----- */
  const versionOf = (id) => {
    if (!banks.length) return undefined;
    const taster = String(id).startsWith("taster_");
    const b = taster ? banks.find((x) => x.id === String(id).slice(7)) : banks.find((x) => (x.sets || []).some((s) => s.id === id));
    if (!b) return -1;
    return taster ? b.tasterVersion : b.sets.find((s) => s.id === id).version;
  };
  const stableOf = (id) => (String(id).startsWith("taster_") ? undefined : banks.flatMap((x) => x.sets || []).find((s) => s.id === id)?.stableFrom);
  const km = keepMissing(p.recent, versionOf, stableOf).slice(0, 5);
  const missing = `<div class="card stack-s"><h3 style="margin:0">Questions you keep missing</h3>
    ${km.length ? km.map((m) => {
      const list = m.repeat.length ? m.repeat : m.current;
      return `<div class="row between wrap" style="gap:10px"><div class="grow"><strong>${esc(m.title)}</strong>
        <div class="small muted">${m.repeat.length ? `${m.repeat.length} missed more than once` : `${m.current.length} missed last time`}${m.repeat.length && m.current.length > m.repeat.length ? ` · ${m.current.length} in total` : ""}</div></div>
        <a class="btn small primary" href="#/quiz/${esc(m.bank)}/${esc(routeSetId(m.id))}?retry=${list.join(",")}">Retry ${list.length}</a></div>`;
    }).join("") : '<p class="muted small" style="margin:0">Nothing to chase right now. Questions you miss will be collected here so you can retry them.</p>'}</div>`;

  const charts = `${extras}${calendar}${rings}
    <div class="card stack"><h3>Score trend</h3>${trend}</div>
    <div class="card stack-s"><h3>Weakest topics</h3>${topicBars(weak)}</div>
    <div class="card stack-s"><h3>Strongest topics</h3>${topicBars(strong)}</div>${missing}`;

  ctx.view.innerHTML = `<div class="stack-l"><header><h1>Your progress</h1><p class="muted">Every session you finish is saved here.</p></header>
    <div class="row" style="gap:12px">
      <div class="card tight grow center"><div class="price">${p.totalScore}</div><div class="muted small">Total score</div></div>
      <div class="card tight grow center"><div class="price">${p.bestScore}%</div><div class="muted small">Best session</div></div>
      <div class="card tight grow center"><div class="price">${icon("fire", "sm")} ${p.streak}</div><div class="muted small">Day streak</div></div></div>
    <div class="card row" style="gap:16px">${ring(pct(done, goal), 84, `${done}/${goal}`)}
      <div class="grow"><h3 style="margin:0">Weekly goal</h3><p class="small muted" style="margin:2px 0 8px">${done >= goal ? "Goal reached this week. Brilliant." : `${goal - done} more session${goal - done === 1 ? "" : "s"} to hit ${goal} this week.`}</p>
        <button class="btn small" id="goal">Change goal</button></div></div>
    ${paid ? charts : `<div class="locked-wrap"><div class="stack blurred" aria-hidden="true" inert>${charts}</div>
        <div class="locked-cta">${lockedCard("Unlock your full progress", "Charts, weak topics and streaks come with a subscription.")}</div></div>`}
    <section class="stack-s"><h2>Recent sessions</h2>
      ${recent.length ? `<div class="list" id="past">${recent.map((r, k) => `<button class="item" data-k="${k}" aria-label="Open session: ${esc(r.title)}, ${r.score} of ${r.total}"><div class="grow"><strong>${esc(r.title)}</strong>
        <div class="meta">${fmtDate(r.at)} · ${fmtDur(r.sec || 0)}${r.part ? " · custom run" : ""}</div></div><strong>${r.score}/${r.total}</strong>${icon("chevron")}</button>`).join("")}</div>`
        : '<div class="card center stack-s"><p class="muted">No sessions yet.</p><a class="btn primary" href="#/practice">Start practising</a></div>'}
      ${!paid && p.recent.length > 5 ? '<p class="muted small center">Showing your last 5 sessions. Subscribe to see more.</p>' : ""}</section></div>`;
  ctx.view.querySelector("#past")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-k]"); if (b) openSession(ctx, recent[Number(b.dataset.k)], versionOf, stableOf);
  });

  ctx.view.querySelector("#goal").onclick = () => {
    const s = sheet(`<div class="stack"><p class="muted small" style="margin:0">How many sessions do you want to finish each week? Pick something you can really do. Small, steady goals work best.</p>
      <div class="chips" role="group" aria-label="Sessions per week">${[2, 3, 4, 5, 7, 10, 14].map((n) => `<button class="chip" data-n="${n}" aria-pressed="${n === goal}">${n}</button>`).join("")}</div>
      <div class="row" style="justify-content:flex-end"><button class="btn ghost" data-c>Cancel</button><button class="btn primary" id="gsave">Save goal</button></div></div>`, { title: "Weekly goal" });
    let pick = goal;
    s.el.querySelectorAll("[data-n]").forEach((b) => (b.onclick = () => { pick = +b.dataset.n; s.el.querySelectorAll("[data-n]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); }));
    s.el.querySelector("[data-c]").onclick = s.close;
    s.el.querySelector("#gsave").onclick = async () => {
      s.el.querySelector("#gsave").disabled = true;
      try { const r = await setWeeklyGoal(pick); s.close(); toast(r === "queued" ? "Goal saved on this phone. It will sync when you're online." : "Weekly goal saved", "good"); if (ctx.alive()) draw(ctx, banks); }
      catch (e) { s.close(); if (!handleError(e)) toast("Couldn't save your goal. Please try again.", "bad"); }
    };
  };
}


/** A past session: score, date, what was missed, and one-tap ways to go again. Question text is only loaded when asked for. */
function openSession(ctx, r, versionOf, stableOf = () => undefined) {
  if (!r) return;
  const taster = String(r.id).startsWith("taster_"), route = routeSetId(r.id);
  const missed = [...new Set(Array.isArray(r.w) ? r.w : [])].sort((a, b) => a - b);
  const live = versionOf(r.id), gone = live === -1;                        // -1 = the set was deleted
  const same = live !== undefined && !gone && (r.v === undefined || logStillValid(r.v, live, stableOf(r.id)));   // question numbers have not moved since
  const sh = sheet(`<div class="stack">
    <div class="row between"><div class="grow"><strong>${esc(r.title)}</strong><div class="meta small muted">${fmtDate(r.at)} · ${fmtDur(r.sec || 0)}${r.part ? " · custom run" : ""}</div></div><strong class="price">${r.score}/${r.total}</strong></div>
    <div class="bar"><i style="width:${Math.min(100, pct(r.score, r.total))}%"></i></div>
    <p class="small muted" style="margin:0">${missed.length ? `You missed ${missed.length} question${missed.length === 1 ? "" : "s"} in this session${same ? "" : ". This set has been updated since, so the missed list can't be matched to the new questions"}.` : r.score === r.total ? "A perfect session. Nothing missed." : "No missed-question list was kept for this session."}</p>
    <div id="rev" class="stack-s"></div>
    <div class="stack-s">
      ${missed.length && same ? `<button class="btn primary block" id="seeMissed">${icon("check", "sm")} Review the ${missed.length} missed</button>
      <a class="btn block" href="#/quiz/${esc(r.bank)}/${esc(route)}?retry=${missed.join(",")}" data-c>Retry the ${missed.length} missed</a>` : ""}
      ${(live !== undefined && !gone) || taster ? `<a class="btn ${missed.length && same ? "ghost" : "primary"} block" href="#/quiz/${esc(r.bank)}/${esc(route)}" data-c>Practise this set again</a>` : '<p class="small muted" style="margin:0">This set is no longer available.</p>'}
    </div></div>`, { title: "Past session" });
  sh.el.querySelectorAll("a[data-c]").forEach((a) => a.addEventListener("click", () => sh.close()));
  const btn = sh.el.querySelector("#seeMissed");
  if (!btn) return;
  btn.onclick = async () => {
    btn.disabled = true; btn.textContent = "Loading...";
    try {
      const bank = (await loadBanks()).find((b) => b.id === r.bank);
      const content = taster ? await loadTaster(r.bank) : await loadSet(r.id, bank?.sets?.find((x) => x.id === r.id)?.version);
      const items = prepareQuiz(content, "review", missed);
      const box = sh.el.querySelector("#rev"); if (!box) return;
      box.innerHTML = items.map((q) => `<div class="card tight stack-s"><div class="small muted">Question ${q.orig + 1} · ${esc(q.topic)}</div>
        <div>${esc(q.text)}</div><div class="small"><strong>Answer:</strong> ${esc(q.correctText)}</div>${q.explanation ? `<div class="small muted">${esc(q.explanation)}</div>` : ""}${explainImage(q)}</div>`).join("") || '<p class="muted small">Those questions are no longer in this set.</p>';
      btn.remove();
    } catch { btn.disabled = false; btn.textContent = "Couldn't load. Try again"; }
  };
}
