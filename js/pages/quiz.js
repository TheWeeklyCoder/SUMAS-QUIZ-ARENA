// Quiz engine: taster or full set. A start screen lets the student choose how many questions (5, 10, all or any number),
// a topic, the question style (normal / abstract) and the mode (practice or exam). Shuffled per student, auto-marked,
// resumable, with a result screen. Only a run of the WHOLE set can be the ranked "first attempt".
import { state, isPaid, waLink } from "../state.js";
import { loadBanks, loadSet, loadTaster, saveSession, loadSetStats } from "../data.js";
import { rankFor } from "../lib/analyse.js";
import { postActivity } from "../activity.js";
import { go } from "../router.js";
import { prepareQuiz, grade, band, pickQuestions, topicCounts, kindCounts } from "../lib/quiz.js";
import { esc, short, quoteLine, fmtDur, ls, pct, randomFrom, fmtDate, downloadText, toCSV, dayKey } from "../lib/util.js";
import { icon, ring, skeleton, confirmBox, lockedCard, hint, toast } from "../ui.js";
import { handleError } from "../net.js";
import { topRow, progressBar, subRow, questionBlock, optionButtons, dotsRow, navRow, bindDots, explainImage } from "../qview.js";
import { sfx, soundOn, setSound } from "../sound.js";
import { shareResult, shareApp } from "../share.js";

export default async function quiz(ctx) {
  const { bankId, setId } = ctx.params;
  const isTaster = setId === "taster";
  const attemptId = isTaster ? "taster_" + bankId : setId;
  const retry = ctx.query.retry ? ctx.query.retry.split(",").map(Number).filter(Number.isInteger) : null;
  const wantResume = !!ctx.query.resume;
  const uid = state.user.uid, nick = state.profile.nickname;
  const root = ctx.view;
  const backTo = `#/practice/${bankId}`;

  root.innerHTML = skeleton(3);

  /* ----- load ----- */
  let bank, content;
  try {
    bank = (await loadBanks()).find((b) => b.id === bankId);
    const meta = bank?.sets?.find((s) => s.id === setId);
    if (meta?.locked && !state.isAdmin) {
      if (ls("resume_" + uid)?.setId === setId) ls("resume_" + uid, null);   // the Home "Continue" card must not keep pointing at a locked set
      root.innerHTML = `<div class="card center stack"><h2>This set is locked</h2><p class="muted">It has been paused for now. Please check back later.</p><a class="btn" href="${backTo}">Back</a></div>`;
      return;
    }
    content = isTaster ? await loadTaster(bankId) : await loadSet(setId, meta?.version);
  } catch (e) {
    if (!ctx.alive()) return;
    const locked = e?.code === "permission-denied";
    root.innerHTML = locked ? lockedCard("This set is for subscribers", "Try the free taster, or subscribe to unlock every set.") + `<p class="center"><a href="${backTo}">Back</a></p>`
      : `<div class="card center stack"><h2>Couldn't open this set</h2><p class="muted">${e?.code === "not-found" ? "This set isn't available." : "Check your internet connection and try again."}</p><button class="btn primary" id="r">Try again</button> <a class="btn ghost" href="${backTo}">Back</a></div>`;
    root.querySelector("#r")?.addEventListener("click", () => quiz(ctx));
    if (!locked) handleError(e, { retry: () => quiz(ctx) });
    return;
  }
  if (!ctx.alive()) return;
  if (!content || !content.questions?.length) {
    root.innerHTML = `<div class="card center stack"><h2>Not ready yet</h2><p class="muted">${isTaster ? "The free taster for this bank is being prepared." : "This set has no questions yet."}</p><a class="btn" href="${backTo}">Back</a></div>`;
    return;
  }

  const title = isTaster ? `${bank?.title || "Bank"}: free taster` : content.title || "Set";
  const nAll = content.questions.length;
  const baseSeed = `${uid}:${attemptId}`;
  const resumeKey = `quiz_${uid}_${attemptId}`;
  const modeKey = `quizmode_${uid}`;

  /* ----- run state ----- */
  let cfg = null, items = [], total = 0, picks = [], flags = [], i = 0, base = 0, t0 = Date.now(), running = false, mode = "practice", partial = false, finished = false;
  const elapsed = () => base + (running ? (Date.now() - t0) / 1000 : 0);
  const persist = () => {
    if (retry || !cfg) return;
    ls(resumeKey, { v: content.version, picks, flags, i, elapsed: Math.round(elapsed()), cfg });
    ls("resume_" + uid, { bankId, setId, title, i, total });
  };
  const clearResume = () => { ls(resumeKey, null); if (ls("resume_" + uid)?.setId === setId) ls("resume_" + uid, null); };
  const validSaved = () => {
    const s = !retry && ls(resumeKey);
    if (!s || s.v !== content.version || !Array.isArray(s.picks) || !s.cfg?.seed) return null;
    const n = prepareQuiz(content, s.cfg.seed, s.cfg.only).length;
    return n === s.picks.length && n > 0 ? s : null;
  };

  const onVis = () => { if (!running && !document.hidden && !finished && items.length) { t0 = Date.now(); running = true; } else if (document.hidden && running) { base = elapsed(); running = false; } };
  document.addEventListener("visibilitychange", onVis);
  const tick = setInterval(() => { const t = root.querySelector("#timer"); if (t && running) t.textContent = fmtDur(elapsed()); }, 1000);
  let keyHandler = null;
  ctx.onLeave(() => { clearInterval(tick); document.removeEventListener("visibilitychange", onVis); if (keyHandler) document.removeEventListener("keydown", keyHandler); });

  const reportLink = (it) => waLink(
    `Report a question\nBank: ${bank?.title || bankId}\nSet: ${title} (${attemptId})\nQuestion no.: ${it.orig + 1}\nVersion: v${content.version}\nNickname: @${nick}\n\nWhat's wrong: `);

  function begin(c, restore = null) {
    cfg = c; mode = c.mode || "practice"; partial = !!c.only && !retry; finished = false;
    items = prepareQuiz(content, c.seed, c.only); total = items.length;
    picks = restore?.picks || Array(total).fill(null); flags = restore?.flags?.length === total ? restore.flags : Array(total).fill(false);
    i = restore ? Math.min(restore.i || 0, total - 1) : 0; base = restore?.elapsed || 0; t0 = Date.now(); running = true;
    if (!restore) persist();
    if (restore && picks.every((p) => p !== null)) return finish();
    renderQ();
  }

  /* ================= start screen ================= */
  function renderSetup() {
    running = false; items = []; cfg = null;
    const topics = topicCounts(content);
    const saved = validSaved();
    const sel = renderSetup.sel ||= { topic: "", kind: "", n: "all", mode: ls(modeKey) === "exam" ? "exam" : "practice" };
    const pool = () => { const kc = kindCounts(content, sel.topic); return sel.kind ? kc[sel.kind] : kc.normal + kc.abstract; };
    const kc = kindCounts(content, sel.topic), hasAbstract = kindCounts(content).abstract > 0;
    if (sel.kind && !kc[sel.kind]) sel.kind = "";
    const max = pool();
    if (sel.n !== "all" && sel.n >= max) sel.n = "all";
    const n = sel.n === "all" ? max : sel.n;
    const sizes = [5, 10, 20, 50].filter((x) => x < max);
    root.innerHTML = `<div class="stack-l"><div class="row" style="gap:12px"><a class="iconbtn" href="${backTo}" aria-label="Back">${icon("arrowleft")}</a>
        <div class="grow"><h1 style="margin:0;font-size:1.35rem">${esc(title)}</h1><p class="muted small" style="margin:0">${nAll} questions${topics.length > 1 ? ` · ${topics.length} topics` : ""}${retry ? " · retrying missed" : ""}</p></div></div>
      ${saved ? `<section class="card accent stack-s"><strong>Continue where you left off</strong><p class="small muted" style="margin:0">Question ${Math.min(saved.i + 1, saved.picks.length)} of ${saved.picks.length} · ${saved.cfg.mode === "exam" ? "Exam" : "Practice"} mode</p>
        <button class="btn primary block" id="cont">Continue</button><p class="small muted" style="margin:0">Starting a new run below replaces this one.</p></section>` : ""}
      <section class="card stack"><h2 style="margin:0">Start a quiz</h2>
        ${topics.length > 1 ? `<label>Topic<select id="topic"><option value="">All topics (${nAll})</option>${topics.map((t) => `<option value="${esc(t.topic)}" ${t.topic === sel.topic ? "selected" : ""}>${esc(t.topic)} (${t.n})</option>`).join("")}</select></label>` : ""}
        ${hasAbstract ? `<div><label style="margin-bottom:6px">Question style</label><div class="chips" id="kinds" role="group" aria-label="Question style">
          <button class="pick" data-k="" aria-pressed="${!sel.kind}">All (${kc.normal + kc.abstract})</button>
          <button class="pick" data-k="normal" aria-pressed="${sel.kind === "normal"}" ${kc.normal ? "" : "disabled"}>Normal (${kc.normal})</button>
          <button class="pick" data-k="abstract" aria-pressed="${sel.kind === "abstract"}" ${kc.abstract ? "" : "disabled"}>Abstract (${kc.abstract})</button></div>
          <p class="small muted" style="margin:6px 0 0"><strong>Normal</strong> = the usual exam-type questions. <strong>Abstract</strong> = harder real-world cases and scenarios.</p></div>` : ""}
        <div><label style="margin-bottom:6px">Number of questions <span class="muted">· ${max} available</span></label><div class="chips" id="sizes" role="group" aria-label="Number of questions">
          ${sizes.map((x) => `<button class="pick" data-n="${x}" aria-pressed="${sel.n === x}">${x}</button>`).join("")}
          <button class="pick" data-n="all" aria-pressed="${sel.n === "all"}">All (${max})</button>
          <input id="custom" class="pickin" type="number" inputmode="numeric" min="1" max="${max}" value="${n}" aria-label="Type a number of questions"></div></div>
        <div><label style="margin-bottom:6px">Mode</label><div class="modes" id="modes" role="group" aria-label="Mode">
          <button class="mode" data-m="practice" aria-pressed="${sel.mode === "practice"}">Practice<small>See the answer and why, straight away. Has sounds.</small></button>
          <button class="mode" data-m="exam" aria-pressed="${sel.mode === "exam"}">Exam<small>Change answers freely. Marked at the end.</small></button></div></div>
        <label class="check" style="font-weight:700"><input type="checkbox" id="snd" ${soundOn() ? "checked" : ""}><span class="small">Sound effects in practice mode</span></label>
        <div id="runhint"></div>
        <button class="btn primary block" id="start" ${max ? "" : "disabled"}>Start quiz</button></section></div>`;
    root.querySelector("#cont")?.addEventListener("click", () => { begin(saved.cfg, saved); });
    root.querySelector("#topic")?.addEventListener("change", (e) => { sel.topic = e.target.value; renderSetup(); });
    root.querySelector("#kinds")?.addEventListener("click", (e) => { const b = e.target.closest("[data-k]"); if (b && !b.disabled) { sel.kind = b.dataset.k; renderSetup(); } });
    root.querySelector("#sizes").addEventListener("click", (e) => { const b = e.target.closest("[data-n]"); if (b) { sel.n = b.dataset.n === "all" ? "all" : +b.dataset.n; renderSetup(); } });
    // The typed number never re-draws the screen (that would swallow the tap on "Start quiz"): it only updates the chips and the hint in place.
    const nowN = () => (sel.n === "all" ? max : Math.min(sel.n, max));
    const isFull = () => !sel.topic && !sel.kind && nowN() >= nAll;
    const sync = () => {
      root.querySelectorAll("#sizes [data-n]").forEach((b) => b.setAttribute("aria-pressed", String(sel.n === (b.dataset.n === "all" ? "all" : +b.dataset.n))));
      root.querySelector("#runhint").innerHTML = isTaster ? "" : isFull() ? hint("A run of the whole set counts as your ranked first attempt.", "info") : hint("A shorter or filtered run is great practice. It counts toward your streak and topic progress, but ranks use your first run of the whole set.", "info");
    };
    const custom = root.querySelector("#custom"), setN = (v) => { const k = Math.max(1, Math.min(max, Math.floor(+v) || max)); sel.n = k >= max ? "all" : k; };
    custom.addEventListener("input", () => { if (custom.value !== "") { setN(custom.value); sync(); } });
    custom.addEventListener("change", () => { setN(custom.value); custom.value = nowN(); sync(); });
    sync();
    root.querySelector("#modes").addEventListener("click", (e) => { const b = e.target.closest("[data-m]"); if (b) { sel.mode = b.dataset.m; ls(modeKey, sel.mode); renderSetup(); } });
    root.querySelector("#snd").addEventListener("change", (e) => { setSound(e.target.checked); if (e.target.checked) sfx.correct(); });
    root.querySelector("#start").addEventListener("click", () => {
      ls(modeKey, sel.mode);
      const run = Math.random().toString(36).slice(2, 8);
      const nStart = nowN(), whole = isFull();
      const c = { mode: sel.mode, topic: sel.topic, kind: sel.kind, n: nStart, only: null, seed: whole ? baseSeed : `${baseSeed}:${run}` };
      if (!whole) c.only = pickQuestions(content, { n: nStart, topic: sel.topic, kind: sel.kind }, c.seed);
      sfx.tap(); begin(c);
    });
  }

  /* ================= question view ================= */
  function renderQ() {
    const it = items[i], picked = picks[i], practice = mode === "practice", reveal = practice && picked !== null;
    const answered = picks.filter((p) => p !== null).length;
    root.innerHTML = `<div class="qplay">${topRow({ i, total, timerText: fmtDur(elapsed()) })}${progressBar(answered, total)}
      <div class="card qcard">${subRow(`${it.topic}${it.kind === "abstract" ? " · Abstract" : ""}${practice ? "" : " · Exam"}${retry ? " · retry" : ""}`, flags[i])}
        ${questionBlock(it)}${optionButtons(it, picked, reveal)}
        ${reveal ? `<div class="explain" aria-live="polite"><strong>${picked === it.correct ? "Correct." : "Not this time."}</strong>
          ${it.explanation ? `<div style="margin-top:6px">${esc(it.explanation)}</div>` : ""}${explainImage(it)}
          <div style="margin-top:8px"><a class="small" href="${esc(reportLink(it))}" target="_blank" rel="noopener">Report this question</a></div></div>` : ""}</div>
      ${navRow({ canBack: i > 0, nextLabel: i + 1 === total ? "Finish" : "Next", dots: dotsRow(total, i, (k) => picks[k] !== null, (k) => flags[k]) })}</div>`;

    root.querySelector("#exit").onclick = async () => {
      if (await confirmBox({ title: "Leave this quiz?", text: retry ? "Your retry won't be saved." : "Your progress is saved. You can continue later from the Home page.", okLabel: "Leave" })) go(`/practice/${bankId}`);
    };
    root.querySelectorAll(".opt").forEach((b) => b.addEventListener("click", () => choose(+b.dataset.j)));
    root.querySelector("#flag")?.addEventListener("click", () => { flags[i] = !flags[i]; if (flags[i]) sfx.flag(); persist(); renderQ(); });
    root.querySelector("#prev").onclick = () => move(i - 1);
    root.querySelector("#next").onclick = () => (i + 1 < total ? move(i + 1) : finish());
    bindDots(root, move);
    if (reveal) root.querySelector("#next")?.focus({ preventScroll: true });
  }

  function choose(j) {
    if (mode === "practice") {
      if (picks[i] !== null) return;
      picks[i] = j; (j === items[i].correct ? sfx.correct : sfx.wrong)();
    } else { picks[i] = j; sfx.tap(); }
    persist(); renderQ();
  }
  function move(k) {
    if (k < 0 || k >= total || k === i) return;
    i = k; if (mode === "practice") sfx.next(); persist(); renderQ(); window.scrollTo(0, 0);
  }

  keyHandler = (e) => {
    if (e.target.closest("input,textarea,select") || e.metaKey || e.ctrlKey) return;
    const k = e.key.toLowerCase();
    if (document.querySelector(".sheet-back") || !root.querySelector(".opts")) return;
    const locked = mode === "practice" && picks[i] !== null;
    if (!locked && k.length === 1) { const j = /^[1-6]$/.test(k) ? +k - 1 : "abcdef".indexOf(k); if (j >= 0 && j < items[i].options.length) return choose(j); }
    if (k === "enter" || k === "arrowright") { if (document.activeElement?.id !== "next") (i + 1 < total ? move(i + 1) : finish()); }
    else if (k === "arrowleft") move(i - 1);
  };
  document.addEventListener("keydown", keyHandler);

  /* ================= result view ================= */
  async function finish() {
    if (finished) return;
    const un = picks.filter((p) => p === null).length;
    if (un && !(await confirmBox({ title: "Finish now?", text: `${un} question${un === 1 ? " is" : "s are"} unanswered and will count as wrong.`, okLabel: "Finish" }))) return;
    if (!ctx.alive()) return;
    finished = true; const dur = elapsed(); running = false;
    const g = grade(items, picks);
    const percent = pct(g.score, g.total);
    root.innerHTML = `<div class="stack-l center"><div class="pop">${ring(percent, 140)}</div><p class="muted">Saving your result...</p></div>`;
    if (mode === "practice") sfx.finish(percent);

    const runTitle = partial ? `${title} · ${cfg.topic ? cfg.topic + " · " : ""}${cfg.kind ? cfg.kind + " · " : ""}${total} of ${nAll}` : title;
    let saveInfo = { status: "saved", first: false };
    if (!retry) { try { saveInfo = await saveSession({ bankId, attemptId, title: runTitle, score: g.score, total: g.total, wrong: g.wrong, durationSec: dur, byTopic: g.byTopic, version: content.version, partial }); } catch (e) { saveInfo = { status: "queued", first: false }; handleError(e); } }
    clearResume();
    if (!retry && saveInfo.first && !isTaster) postActivity("finished", bank?.title || title);
    if (!ctx.alive()) return;

    const quote = randomFrom(state.quotes?.[band(percent)] || ["Well done for practising."]);
    const topics = Object.entries(g.byTopic).sort((a, b) => a[1].c / a[1].t - b[1].c / b[1].t);
    const missed = g.wrong.map((o) => items.find((x) => x.orig === o));
    const sets = bank?.sets || [];
    const showRankBox = !retry && !isTaster && isPaid() && !partial;
    const nextSet = !isTaster && !partial ? sets.slice(sets.findIndex((s) => s.id === setId) + 1).find((s) => !s.locked) : null;
    const rows = () => [["result", "topic", "question", "your answer", "correct answer", "explanation"],
      ...items.map((it, k) => [picks[k] === it.correct ? "Correct" : picks[k] === null ? "Skipped" : "Incorrect", it.topic, it.text, picks[k] === null ? "" : it.options[picks[k]], it.correctText, it.explanation])];

    root.innerHTML = `<div class="stack-l">
      <div class="center stack-s"><div class="pop" style="display:inline-block">${ring(percent, 150)}</div>
        <h1>${percent >= 60 ? "🏆 " : ""}${g.score} of ${g.total} correct</h1><p class="muted" style="margin:0">${esc(runTitle)}</p></div>
      <div class="stats"><div><b>${g.score}/${g.total}</b><span>correct</span></div><div><b>${fmtDur(dur)}</b><span>time</span></div><div><b>${un}</b><span>skipped</span></div></div>
      <p class="card tight center" style="margin:0">${esc(quoteLine(quote))}</p>
      ${retry ? hint("Retries are for practice and don't change your recorded score.") : partial ? hint("This was a custom run, so it doesn't change your ranked score. It does count toward your streak and topic progress.", "info")
        : saveInfo.status === "queued" ? hint("Saved on this phone. It will sync when your connection is back.", "info") : hint("Your progress is saved.", "check")}
      ${showRankBox ? '<div id="rankbox"></div>' : ""}
      <div class="stack-s">
        ${missed.length ? `<a class="btn primary block" href="#/quiz/${esc(bankId)}/${esc(setId)}?retry=${g.wrong.join(",")}">Retry ${missed.length} missed question${missed.length === 1 ? "" : "s"}</a>` : ""}
        ${nextSet ? `<a class="btn ${missed.length ? "" : "primary"} block" href="#/quiz/${esc(bankId)}/${esc(nextSet.id)}">Next set: ${esc(nextSet.title)}</a>` : ""}
        ${retry ? "" : '<button class="btn block" id="again">New run of this set</button>'}
        <div class="row wrap" style="gap:8px"><button class="btn small grow" id="share">Share result</button><button class="btn small grow" id="csv">Download</button><button class="btn small grow" id="invite">Invite friends</button></div>
        <a class="btn ghost block" href="${backTo}">Back to ${esc(bank?.title || "the bank")}</a></div>
      ${isTaster && !isPaid() ? lockedCard("See the full set and how you rank", "Subscribers get every set, ranks and group matches.") : ""}
      ${topics.length > 1 || (topics[0] && topics[0][0] !== "General") ? `<section class="card stack-s"><h3>By topic</h3>${topics.map(([n, v]) => {
        const p = pct(v.c, v.t);
        return `<div><div class="row between small"><span>${esc(n)}</span><span class="muted">${v.c}/${v.t}</span></div><div class="bar ${p >= 80 ? "" : p >= 50 ? "gold" : "red"}"><i style="width:${p}%"></i></div></div>`;
      }).join("")}</section>` : ""}
      <section class="stack-s"><div class="row between"><h2 style="margin:0">Review</h2>${missed.length ? '<button class="chip" id="rv" aria-pressed="false">Show all answers</button>' : ""}</div><div id="review"></div></section>
    </div>`;

    const drawReview = (all) => {
      const list = items.map((it, k) => ({ it, k })).filter(({ it, k }) => all || picks[k] !== it.correct);
      root.querySelector("#review").innerHTML = list.length ? list.map(({ it, k }) => {
        const ok = picks[k] === it.correct;
        return `<details class="card tight" style="margin-bottom:8px"><summary><span class="badge ${ok ? "green" : "red"}">${ok ? "Correct" : picks[k] === null ? "Skipped" : "Wrong"}</span> <strong>Q${it.orig + 1}.</strong> ${esc(it.text.length > 80 ? it.text.slice(0, 80) + "..." : it.text)}</summary>
          <div class="stack-s" style="margin-top:12px"><p style="white-space:pre-wrap;margin:0">${esc(it.text)}</p>
          ${ok ? "" : `<p class="small" style="margin:0"><span class="badge red">Your answer</span> ${picks[k] === null ? "Skipped" : esc(it.options[picks[k]])}</p>`}
          <p class="small" style="margin:0"><span class="badge green">Correct</span> ${esc(it.correctText)}</p>
          ${it.explanation || it.eimage ? `<div class="explain small">${esc(it.explanation)}${explainImage(it)}</div>` : ""}
          <a class="small" href="${esc(reportLink(it))}" target="_blank" rel="noopener">Report this question</a></div></details>`;
      }).join("") : '<p class="card tight center">You got every question right. 🎉</p>';
    };
    drawReview(false);
    const rv = root.querySelector("#rv");
    if (rv) rv.onclick = () => { const all = rv.getAttribute("aria-pressed") !== "true"; rv.setAttribute("aria-pressed", String(all)); rv.textContent = all ? "Show missed only" : "Show all answers"; drawReview(all); };
    root.querySelector("#again")?.addEventListener("click", () => { window.scrollTo(0, 0); renderSetup(); });
    root.querySelector("#share").onclick = () => shareResult({ score: g.score, total: g.total, percent, title });
    root.querySelector("#invite").onclick = () => shareApp(percent);
    root.querySelector("#csv").onclick = () => { downloadText(`sumas-result-${dayKey()}.csv`, "﻿" + toCSV(rows()), "text/csv"); toast("Result downloaded", "good"); };
    window.scrollTo(0, 0);
    if (showRankBox) showRank(saveInfo);
  }

  /** "How did you rank?" Paid students only. Uses the first attempt at the set, compared with setStats (1 read). */
  async function showRank(saveInfo) {
    const box = root.querySelector("#rankbox"); if (!box) return;
    const mine = saveInfo.first ? { score: grade(items, picks).score, total, at: Date.now() } : (state.progress?.recent || []).find((r) => r.id === attemptId && r.first);
    if (!mine) return;                                   // first attempt was made before ranks existed
    const myPct = pct(mine.score, mine.total);
    let stats;
    try { stats = await loadSetStats(attemptId); } catch { return; }   // offline or locked: stay quiet
    if (!ctx.alive() || !root.contains(box)) return;
    const r = rankFor(stats, myPct, !!(stats && stats.updatedAtMs && mine.at <= stats.updatedAtMs));
    if (!r) { box.innerHTML = `<div class="card tight center"><strong>How did you rank?</strong><p class="muted small" style="margin:6px 0 0">Rankings for this set appear after the next update, usually within a day.</p></div>`; return; }
    const top = (stats.top || []).slice(0, 5);
    box.innerHTML = `<section class="card accent stack-s" aria-label="Your rank on this set">
      <div class="row between"><h3 style="margin:0">How did you rank?</h3><span class="badge green">Top ${r.topPct}%</span></div>
      <p style="margin:0">You're <strong>#${r.rank} of ${r.of}</strong> students on this set${r.beat !== null ? `, ahead of <strong>${r.beat}%</strong> of them` : ""}. The average score is ${r.avg}%.</p>
      ${saveInfo.first ? "" : `<p class="small muted" style="margin:0">Ranks use your first attempt at a set (${myPct}%). Repeats are for practice.</p>`}
      ${top.length ? `<div class="list">${top.map((x, k) => `<div class="item" style="padding:10px 14px"><strong style="width:22px">${k + 1}</strong><div class="grow">@${esc(short(x.nick))}</div><strong>${x.pct}%</strong></div>`).join("")}</div>` : ""}
      <p class="small muted" style="margin:0">Updated ${stats.updatedAtMs ? fmtDate(stats.updatedAtMs) : "recently"}. New scores are added at each update.</p></section>`;
  }

  /* ----- first screen ----- */
  if (retry) {
    const only = retry; const c = { mode: "practice", only, seed: baseSeed };
    if (!prepareQuiz(content, baseSeed, only).length) { root.innerHTML = `<div class="card center stack"><h2>Nothing to retry</h2><p class="muted">Those questions are no longer in this set.</p><a class="btn" href="${backTo}">Back</a></div>`; return; }
    return begin(c);
  }
  const saved = validSaved();
  if (wantResume && saved) return begin(saved.cfg, saved);
  renderSetup();
}
