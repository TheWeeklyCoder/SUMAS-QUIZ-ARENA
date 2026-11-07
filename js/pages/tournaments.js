// Sponsored tournaments: list, detail (enter / wait / result), play screen, hall of fame, sponsor enquiry.
// Rules recap (firestore.rules): questions open at startsAt, one create-only entry per student inside the window,
// prize mode needs an ADULT account (free or paid), the answer key opens after endsAt for PAID students only,
// everyone can read their own result, standings are for PAID students.
import { topRow, progressBar, subRow, questionBlock, optionButtons, dotsRow, navRow, bindDots } from "../qview.js";
import { db, doc, getDoc, getDocs, setDoc, collection, query, orderBy, limit, serverTimestamp } from "../firebase.js";
import { state, isPaid, waLink } from "../state.js";
import { go } from "../router.js";
import { prepareQuiz } from "../lib/quiz.js";
import { tState, toEntryAnswers, countdown } from "../lib/tournament.js";
import { esc, short, fmtDateTime, fmtDur, ls, toMillis, settle, optimizeImg } from "../lib/util.js";
import { avatar, badge, confirmBox, hint, icon, lockedCard, skeleton, toast } from "../ui.js";
import { handleError, isOnline } from "../net.js";
import { shareLink } from "../share.js";

const LETTERS = "ABCDEF";
const norm = (id, d) => ({ id, ...d, startsAtMs: toMillis(d.startsAt), endsAtMs: toMillis(d.endsAt), winnerCount: d.winnerCount || 3 });

async function getTournament(tid) {
  const s = await getDoc(doc(db, "tournaments", tid));
  return s.exists() ? norm(s.id, s.data()) : null;
}

const ageMem = new Map();      // per user id, so switching accounts on one device never reuses another person's age group
async function ageGroup() {
  const uid = state.user.uid;
  if (ageMem.has(uid)) return ageMem.get(uid);
  const c = ls("age_" + uid); if (c) { ageMem.set(uid, c); return c; }
  try { const s = await getDoc(doc(db, "users", uid)); const a = s.exists() ? s.data().ageGroup : null; if (a) { ls("age_" + uid, a); ageMem.set(uid, a); } return a; }
  catch { return null; }
}

const stateBadge = (t) => {
  const s = tState(t);
  return s === "open" ? badge("Open now", "green") : s === "upcoming" ? badge("Upcoming", "gold") : s === "graded" ? badge("Results out", "") : badge("Closed", "");
};

/* ================================ LIST ================================ */
export default async function tournaments(ctx) {
  ctx.view.innerHTML = `<div class="stack-l"><header><h1>Tournaments</h1><p class="muted" style="margin:0">Sponsor-funded contests. Entry is free. Adults can play for the prize; anyone can play for fun.</p></header><div id="l">${skeleton(3)}</div></div>`;
  const box = ctx.view.querySelector("#l");
  try {
    const snap = await getDocs(query(collection(db, "tournaments"), orderBy("startsAt", "desc"), limit(30)));
    if (!ctx.alive()) return;
    const list = snap.docs.map((d) => norm(d.id, d.data())).filter((t) => t.status !== "draft");
    const row = (t) => `<a class="item" href="#/tournament/${esc(t.id)}"><span class="tile ${tState(t) === "open" ? "" : "gold"}">${icon("trophy")}</span><div class="grow"><strong>${esc(t.title)}</strong>
      <div class="meta">${esc(t.sponsorName ? "By " + t.sponsorName + " · " : "")}${tState(t) === "upcoming" ? "Opens " + fmtDateTime(t.startsAtMs) : tState(t) === "open" ? "Closes " + fmtDateTime(t.endsAtMs) : "Ended " + fmtDateTime(t.endsAtMs)}</div></div>${stateBadge(t)}</a>`;
    const group = (title, items) => items.length ? `<section class="stack-s"><h2>${title}</h2><div class="list">${items.map(row).join("")}</div></section>` : "";
    const open = list.filter((t) => tState(t) === "open"), up = list.filter((t) => tState(t) === "upcoming").reverse(), past = list.filter((t) => ["closed", "graded"].includes(tState(t)));
    box.innerHTML = `<div class="stack-l">${list.length ? group("Open now", open) + group("Coming up", up) + group("Finished", past)
      : '<div class="card center stack-s"><div style="color:var(--gold)">' + icon("trophy") + '</div><h2>No tournaments yet</h2><p class="muted" style="margin:0">The first sponsored tournament will appear here. Check back soon.</p></div>'}
      <div class="list"><a class="item" href="#/hall"><span class="tile gold">${icon("sparkle")}</span><div class="grow"><strong>Hall of Fame</strong><div class="meta">Past winners</div></div>${icon("chevron")}</a>
        <a class="item" href="#/sponsor"><span class="tile">${icon("shield")}</span><div class="grow"><strong>Sponsor a tournament</strong><div class="meta">Businesses and organisations can fund a prize</div></div>${icon("chevron")}</a></div></div>`;
  } catch (e) {
    if (!ctx.alive()) return;
    box.innerHTML = '<div class="card center stack"><p class="muted">Couldn\'t load tournaments.</p><button class="btn" id="r">Try again</button></div>';
    box.querySelector("#r").onclick = () => tournaments(ctx);
    handleError(e, { retry: () => tournaments(ctx) });
  }
}

/* =============================== DETAIL =============================== */
export async function tournamentPage(ctx) {
  const { tid } = ctx.params, uid = state.user.uid;
  ctx.view.innerHTML = skeleton(3);
  let t, entry = null, result = null, age = null;
  try {
    t = await getTournament(tid);
    if (!t || t.status === "draft") { ctx.view.innerHTML = '<div class="card center stack"><h2>Tournament not found</h2><a class="btn" href="#/tournaments">Back</a></div>'; return; }
    const [e, r, a] = await Promise.all([
      getDoc(doc(db, "tournaments", tid, "entries", uid)).catch(() => null),
      tState(t) === "graded" ? getDoc(doc(db, "tournaments", tid, "results", uid)).catch(() => null) : null,
      ageGroup(),
    ]);
    entry = e && e.exists() ? { ...e.data(), at: toMillis(e.data().submittedAt) } : null;
    result = r && r.exists() ? r.data() : null; age = a;
  } catch (e) {
    if (!ctx.alive()) return;
    ctx.view.innerHTML = '<div class="card center stack"><p class="muted">Couldn\'t load this tournament.</p><button class="btn" id="r">Try again</button></div>';
    ctx.view.querySelector("#r").onclick = () => tournamentPage(ctx);
    handleError(e, { retry: () => tournamentPage(ctx) });
    return;
  }
  if (!ctx.alive()) return;

  const st = tState(t), paid = isPaid(), adult = age === "adult";
  const head = `<section class="hero stack-s"><div class="row between"><span class="eyebrow" style="color:#fff;opacity:.85">${esc(t.sponsorName ? "Sponsored by " + t.sponsorName : "Tournament")}</span>${stateBadge(t)}</div>
    <h1 style="margin:0">${esc(t.title)}</h1>${t.prizeText ? `<p style="margin:0;font-weight:700">Prize: ${esc(t.prizeText)}</p>` : ""}
    <p class="small" style="margin:0">${fmtDateTime(t.startsAtMs)} to ${fmtDateTime(t.endsAtMs)}${t.count ? ` · ${t.count} questions` : ""}</p></section>`;
  const about = t.description ? `<div class="card"><p style="margin:0;white-space:pre-wrap">${esc(t.description)}</p></div>` : "";

  let main = "";
  if (st === "upcoming") {
    main = `<div class="card stack-s center"><h2 style="margin:0">Opens in <span data-cd="${t.startsAtMs}">${countdown(t.startsAtMs - Date.now())}</span></h2><p class="muted" style="margin:0">The questions appear the moment it opens. You'll have until ${fmtDateTime(t.endsAtMs)}.</p></div>`;
  } else if (st === "open" && !entry) {
    main = `<div class="card stack"><h2 style="margin:0">Choose how to play</h2>
      <p class="small muted" style="margin:0">You get <strong>one attempt</strong> and can't change answers after you submit. Submit before ${fmtDateTime(t.endsAtMs)} (<span data-cd="${t.endsAtMs}">${countdown(t.endsAtMs - Date.now())}</span> left). Stay online when you submit.</p>
      <a class="btn primary block ${adult ? "" : "disabled"}" ${adult ? `href="#/play/${esc(tid)}?mode=prize"` : 'aria-disabled="true"'}>${icon("trophy", "sm")} Play for the prize</a>
      ${adult ? '<p class="small muted" style="margin:0">Free for adults. Winners are chosen by score; a tie goes to whoever submitted first.</p>'
        : `<p class="small muted" style="margin:0">${age === "minor" ? "Prize mode is for adults (18 and over)." : "We couldn't confirm your age group. Check your connection and refresh to play for the prize."}</p>`}
      <a class="btn block" href="#/play/${esc(tid)}?mode=fun">Play for fun</a>
      <p class="small muted" style="margin:0">Fun mode is open to everyone and isn't eligible for the prize.</p></div>`;
  } else if (entry && st !== "graded") {
    main = `<div class="card accent stack-s"><div class="row" style="gap:12px"><span class="tile">${icon("check")}</span><div class="grow"><strong>You're in</strong>
      <div class="small muted">Submitted ${fmtDateTime(entry.at)} · ${entry.mode === "prize" ? "prize mode" : "fun mode"}</div></div></div>
      <p class="small muted" style="margin:0">${st === "open" ? "Entries are still open for others." : "Entries are closed."} Results are published after we grade the answers. Check back here.</p></div>`;
  } else if (st === "closed") {
    main = `<div class="card center stack-s"><h2 style="margin:0">Entries are closed</h2><p class="muted" style="margin:0">Results will be published soon.</p></div>`;
  } else if (st === "graded") {
    main = resultHtml(t, entry, result, paid);
  }

  ctx.view.innerHTML = `<div class="stack-l">${head}${about}<div id="main">${main}</div><div id="extra"></div>
    <button class="btn ghost block" id="shr">${icon("share", "sm")} Share this tournament</button>
    ${hint("Questions are the same for everyone but shuffled per student. Your answers are saved only when you submit.", "info")}</div>`;

  ctx.view.querySelector("#shr")?.addEventListener("click", () => shareLink({ title: t.title, text: `🏆 "${t.title}" is on SUMAS Quiz Arena${t.prizeText && t.prizeText.toLowerCase() !== "none" ? ` with a prize: ${t.prizeText}` : ""}. Opens ${fmtDateTime(t.startsAtMs)}. Tap the link, log in and play:`, path: `/tournament/${tid}` }));
  if (st === "upcoming" || (st === "open" && !entry)) {
    const timer = setInterval(() => {
      if (!ctx.alive()) return clearInterval(timer);
      if (tState(t) !== st) { clearInterval(timer); tournamentPage(ctx); return; }   // opened or closed: redraw once
      ctx.view.querySelectorAll("[data-cd]").forEach((el) => { el.textContent = countdown(Number(el.dataset.cd) - Date.now()); });
    }, 1000);
    ctx.onLeave(() => clearInterval(timer));
  }

  if (st === "graded") {
    const extra = ctx.view.querySelector("#extra");
    if (paid) await paidExtras(ctx, extra, t, entry, result);
    else extra.innerHTML = lockedCard("See standings, your rank and the answers", "Subscribers can view the full results, the answer key and how they placed.");
  }
}

function resultHtml(t, entry, result, paid) {
  if (!entry) return '<div class="card center stack-s"><h2 style="margin:0">Results are out</h2><p class="muted" style="margin:0">You didn\'t enter this one. The next tournament is yours to win.</p></div>';
  if (!result) return '<div class="card center stack-s"><h2 style="margin:0">Your result isn\'t ready</h2><p class="muted" style="margin:0">We graded this tournament but couldn\'t find your result yet. Please check again shortly or message us.</p></div>';
  const winner = !!result.winner;
  const claim = waLink(`Prize claim\nTournament: ${t.title}\nNickname: @${state.profile.nickname}\nPlace: ${result.rank}\n\nMy full name:\nMy phone number:`);
  return `<div class="card ${winner ? "gold" : "accent"} stack-s center">${winner ? `<div style="color:var(--gold)">${icon("trophy", "lg")}</div><h2 style="margin:0">Congratulations, you won!</h2>` : '<h2 style="margin:0">Your result</h2>'}
    <div class="price">${result.score} / ${result.total}</div>
    ${paid ? `<p style="margin:0">You placed <strong>#${result.rank} of ${result.of}</strong> ${result.mode === "prize" ? "prize-mode" : "fun-mode"} players.</p>` : `<p class="muted small" style="margin:0">${result.mode === "prize" ? "Prize mode" : "Fun mode"}</p>`}
    ${winner ? `<p class="small" style="margin:0">To claim <strong>${esc(t.prizeText || "your prize")}</strong>, message us on WhatsApp with your full name and phone number. We only ask winners for these.</p>
      <a class="btn gold" href="${esc(claim)}" target="_blank" rel="noopener">Claim on WhatsApp</a>` : ""}</div>`;
}

async function paidExtras(ctx, box, t, entry, result) {
  box.innerHTML = skeleton(2);
  try {
    const top = await getDoc(doc(db, "tournaments", t.id, "results", "top"));
    if (!ctx.alive()) return;
    const d = top.exists() ? top.data() : { prize: [], fun: [] };
    const me = state.user.uid;
    const list = (title, rows) => rows?.length ? `<section class="stack-s"><h2>${title}</h2><div class="list">${rows.map((r) => `<div class="item" ${r.uid === me ? 'style="border-color:var(--brand)"' : ""}>
      <strong style="min-width:26px">${r.rank}</strong>${avatar(r.nick, r.color, 34)}<div class="grow"><strong>@${esc(short(r.nick))}</strong></div><strong>${r.score}/${r.total}</strong></div>`).join("")}</div></section>` : "";
    box.innerHTML = `<div class="stack-l">${list("Prize standings", d.prize)}${list("Fun standings", d.fun)}
      ${entry ? '<button class="btn block" id="rev">Review my answers</button><div id="revbox"></div>' : ""}</div>`;
    const rev = box.querySelector("#rev");
    if (rev) rev.onclick = async () => {
      rev.disabled = true; const rb = box.querySelector("#revbox"); rb.innerHTML = skeleton(2);
      try {
        const [qs, ks] = await Promise.all([getDoc(doc(db, "tournamentQuestions", t.id)), getDoc(doc(db, "tournamentKeys", t.id))]);
        const questions = qs.data().questions, key = ks.data().answers;
        rb.innerHTML = `<div class="stack-s" style="margin-top:12px">${questions.map((q, i) => {
          const mine = entry.answers[i], ok = mine === key[i];
          return `<details class="card tight"><summary><span class="badge ${ok ? "green" : "red"}">${ok ? "Right" : mine === -1 ? "Skipped" : "Missed"}</span> <strong>Q${i + 1}.</strong> ${esc(String(q.text).slice(0, 80))}</summary>
            <div class="stack-s" style="margin-top:10px"><p style="margin:0;white-space:pre-wrap">${esc(q.text)}</p>
            <p class="small" style="margin:0"><span class="badge ${ok ? "green" : "red"}">You</span> ${mine === -1 ? "Skipped" : esc(q.options[mine] ?? "")}</p>
            <p class="small" style="margin:0"><span class="badge green">Correct</span> ${esc(q.options[key[i]] ?? "")}</p>
            ${q.explanation ? `<div class="explain small">${esc(q.explanation)}</div>` : ""}</div></details>`;
        }).join("")}</div>`;
      } catch (e) { rb.innerHTML = '<p class="muted small">Couldn\'t load the answers right now.</p>'; rev.disabled = false; handleError(e); }
    };
  } catch (e) { if (ctx.alive()) { box.innerHTML = ""; handleError(e); } }
}

/* ================================= PLAY ================================= */
export async function playPage(ctx) {
  const { tid } = ctx.params, uid = state.user.uid, root = ctx.view;
  let mode = ctx.query.mode === "prize" ? "prize" : "fun";
  root.innerHTML = skeleton(3);
  let t, items, total;
  const back = `#/tournament/${tid}`;
  try {
    t = await getTournament(tid);
    if (!t || t.status === "draft") return go(`/tournaments`, { replace: true });
    if (tState(t) !== "open") { toast("This tournament isn't open right now."); return go(`/tournament/${tid}`, { replace: true }); }
    const ex = await getDoc(doc(db, "tournaments", tid, "entries", uid)).catch(() => null);
    if (ex && ex.exists()) { toast("You've already entered this one."); return go(`/tournament/${tid}`, { replace: true }); }
    if (mode === "prize" && (await ageGroup()) !== "adult") { toast("Prize mode is for adults. You can play for fun.", "bad"); return go(`/tournament/${tid}`, { replace: true }); }
    const qs = await getDoc(doc(db, "tournamentQuestions", tid));
    if (!qs.exists() || !qs.data().questions?.length) { root.innerHTML = `<div class="card center stack"><h2>Questions not ready</h2><p class="muted">The questions for this tournament haven't been added yet. Please check back shortly.</p><a class="btn" href="${back}">Back</a></div>`; return; }
    const questions = qs.data().questions;
    items = prepareQuiz({ questions, answers: Array(questions.length).fill(0) }, `${uid}:t:${tid}`);
    total = questions.length;
  } catch (e) {
    if (!ctx.alive()) return;
    root.innerHTML = `<div class="card center stack"><h2>Couldn't open the tournament</h2><p class="muted">${e?.code === "permission-denied" ? "The questions aren't open yet." : "Check your internet connection and try again."}</p><button class="btn primary" id="r">Try again</button> <a class="btn ghost" href="${back}">Back</a></div>`;
    root.querySelector("#r").onclick = () => playPage(ctx);
    if (e?.code !== "permission-denied") handleError(e, { retry: () => playPage(ctx) });
    return;
  }
  if (!ctx.alive()) return;

  const key = `tplay_${uid}_${tid}`;
  let picks = Array(total).fill(null), i = 0, submitted = false;
  const saved = ls(key);
  if (saved && saved.n === total && saved.mode === mode) { picks = saved.picks; i = Math.min(saved.i, total); }
  const persist = () => ls(key, { n: total, mode, picks, i });
  const tick = setInterval(() => {
    const c = root.querySelector("#left"); if (!c) return;
    const ms = t.endsAtMs - Date.now();
    c.textContent = ms > 0 ? countdown(ms) + " left" : "Closed";
    if (ms <= 0) { const b = root.querySelector("#submit"); if (b) b.disabled = true; }
  }, 1000);
  ctx.onLeave(() => clearInterval(tick));

  function renderQ() {
    if (i >= total) return renderReview();
    const it = items[i], picked = picks[i];
    root.innerHTML = `<div class="qplay">${topRow({ i, total, timerId: "left", timerText: countdown(t.endsAtMs - Date.now()) + " left", exitLabel: "Leave" })}${progressBar(picks.filter((p) => p !== null).length, total)}
      <div class="card qcard">${subRow(mode === "prize" ? "Prize mode" : "Fun mode")}${questionBlock(it)}${optionButtons(it, picked, false)}
        <p class="small muted" style="margin:.9rem 0 0">Answers aren't revealed until the tournament is graded.</p></div>
      ${navRow({ canBack: i > 0, nextLabel: i + 1 === total ? "Review answers" : picked === null ? "Skip" : "Next", dots: dotsRow(total, i, (k) => picks[k] !== null) })}</div>`;
    root.querySelector("#exit").onclick = async () => { if (await confirmBox({ title: "Leave for now?", text: "Your answers on this phone are kept. Come back before the tournament closes to finish and submit.", okLabel: "Leave" })) go(`/tournament/${tid}`); };
    root.querySelectorAll(".opt").forEach((b) => (b.onclick = () => { picks[i] = picks[i] === +b.dataset.j ? null : +b.dataset.j; persist(); renderQ(); }));
    root.querySelector("#next").onclick = () => { i++; persist(); renderQ(); window.scrollTo(0, 0); };
    root.querySelector("#prev").onclick = () => { if (i > 0) { i--; persist(); renderQ(); window.scrollTo(0, 0); } };
    bindDots(root, (k) => { i = k; persist(); renderQ(); window.scrollTo(0, 0); });
  }

  function renderReview() {
    const answered = picks.filter((p) => p !== null).length, blank = total - answered;
    root.innerHTML = `<div class="stack-l"><header><h1>Ready to submit?</h1><p class="muted" style="margin:0">${answered} of ${total} answered${blank ? `, ${blank} left blank` : ""}. <span id="left">${countdown(t.endsAtMs - Date.now())} left</span>.</p></header>
      <div class="chips" aria-label="Jump to a question">${items.map((_, k) => `<button class="chip" data-k="${k}" aria-pressed="${picks[k] !== null}" aria-label="Question ${k + 1}${picks[k] === null ? ", blank" : ""}">${k + 1}</button>`).join("")}</div>
      <p class="small muted" style="margin:0">Highlighted numbers are answered. Tap a number to go back to that question.</p>
      <div class="stack-s"><button class="btn primary block" id="submit">Submit my answers</button><button class="btn ghost block" id="again">Back to questions</button></div>
      ${hint("Once you submit you can't change anything. Stay online until you see the confirmation.", "info")}</div>`;
    root.querySelectorAll("[data-k]").forEach((b) => (b.onclick = () => { i = +b.dataset.k; persist(); renderQ(); }));
    root.querySelector("#again").onclick = () => { i = total - 1; persist(); renderQ(); };
    root.querySelector("#submit").onclick = submit;
  }

  async function submit() {
    if (submitted) return;
    const online = isOnline();
    if (!(await confirmBox({ title: "Submit your answers?", text: online ? "This is final. You can't change them afterwards." : `You're offline. Your answers will be sent when you reconnect, but they only count if they arrive before ${fmtDateTime(t.endsAtMs)}.`, okLabel: "Submit" }))) return;
    if (submitted) return;
    submitted = true;
    const btn = root.querySelector("#submit"); if (btn) { btn.disabled = true; btn.textContent = "Submitting..."; }
    const answers = toEntryAnswers(items, picks, total);
    const r = await settle(setDoc(doc(db, "tournaments", tid, "entries", uid), { uid, mode, answers, submittedAt: serverTimestamp() }), 12000);
    if (r === "denied") {
      submitted = false;
      root.innerHTML = `<div class="card center stack"><h2>We couldn't accept your answers</h2><p class="muted">Either the tournament has just closed or you've already entered. Nothing was changed.</p><a class="btn primary" href="${back}">Back to the tournament</a></div>`;
      return;
    }
    ls(key, null);
    toast(r === "pending" ? "Saved on this phone. It will send when you're back online." : "Submitted. Good luck!", "good");
    go(`/tournament/${tid}`);
  }

  renderQ();
}

/* ============================= HALL OF FAME ============================= */
export async function hallPage(ctx) {
  ctx.view.innerHTML = `<div class="stack-l"><header><h1>Hall of Fame</h1><p class="muted" style="margin:0">Winners of sponsored tournaments, shown with their sponsors' permission.</p></header><div id="h">${skeleton(3)}</div></div>`;
  const box = ctx.view.querySelector("#h");
  try {
    const snap = await getDocs(query(collection(db, "hallOfFame"), orderBy("at", "desc"), limit(60)));
    if (!ctx.alive()) return;
    const rows = snap.docs.map((d) => d.data());
    const by = new Map(); for (const r of rows) (by.get(r.tournamentId) || by.set(r.tournamentId, []).get(r.tournamentId)).push(r);
    box.innerHTML = by.size ? [...by.values()].map((g) => `<section class="card stack-s"><div><strong>${esc(g[0].title)}</strong><div class="small muted">${esc(g[0].sponsorName ? "Sponsored by " + g[0].sponsorName : "")}${g[0].prizeText ? " · " + esc(g[0].prizeText) : ""}</div></div>
      <div class="list">${g.sort((a, b) => a.place - b.place).map((r) => `<div class="item"><strong style="min-width:26px">${["🥇", "🥈", "🥉"][r.place - 1] || r.place}</strong><div class="grow"><strong>@${esc(short(r.nick))}</strong></div><strong>${r.score}/${r.total}</strong></div>`).join("")}</div></section>`).join("")
      : '<div class="card center stack-s"><div style="color:var(--gold)">' + icon("sparkle") + '</div><h2>No winners yet</h2><p class="muted" style="margin:0">Win a tournament and you\'ll be here.</p></div>';
  } catch (e) { if (ctx.alive()) { box.innerHTML = '<div class="card center"><p class="muted">Couldn\'t load the Hall of Fame.</p></div>'; handleError(e); } }
}

/* ============================= SPONSOR FORM ============================= */
export function sponsorPage(ctx) {
  ctx.view.innerHTML = `<div class="stack-l"><header><h1>Sponsor a tournament</h1><p class="muted" style="margin:0">Fund a prize and put your name in front of motivated students. We run the tournament, grade it and announce the winner. Tell us a little about you and we'll get in touch.</p></header>
    <form id="f" class="card stack" novalidate>
      <label>Organisation or your name<input id="org" maxlength="80" required></label>
      <label>How should we contact you?<input id="contact" maxlength="80" placeholder="Phone, WhatsApp or email" required></label>
      <label>What would you like to do?<textarea id="msg" maxlength="500" style="min-height:110px;font-family:var(--font);font-size:1rem" placeholder="e.g. Fund a N20,000 prize for a pharmacology tournament in December"></textarea></label>
      <label class="check"><input type="checkbox" id="rec" checked><span class="small">We're happy to be named publicly as the sponsor</span></label>
      <p class="error" id="err" role="alert" hidden></p>
      <button class="btn primary block" id="send" type="submit">Send enquiry</button></form></div>`;
  const f = ctx.view.querySelector("#f"), err = ctx.view.querySelector("#err");
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const org = f.querySelector("#org").value.trim(), contact = f.querySelector("#contact").value.trim();
    err.hidden = false;
    if (org.length < 2 || contact.length < 5) { err.textContent = "Please add your name and a way to reach you."; return; }
    if (Date.now() - (ls("sponsor_sent") || 0) < 3600000) { err.textContent = "You've just sent one. We'll be in touch soon."; return; }
    err.hidden = true;
    const btn = f.querySelector("#send"); btn.disabled = true;
    const r = await settle(setDoc(doc(collection(db, "sponsorRequests")), {
      uid: state.user.uid, orgName: org, contact, message: f.querySelector("#msg").value.trim(), wantsRecognition: f.querySelector("#rec").checked, createdAt: serverTimestamp(),
    }), 8000);
    if (r === "denied") { btn.disabled = false; err.hidden = false; err.textContent = "We couldn't send that. Please try again."; return; }
    ls("sponsor_sent", Date.now());
    ctx.view.innerHTML = `<div class="card center stack"><span class="tile" style="margin:0 auto">${icon("check")}</span><h2>Thank you</h2><p class="muted">${r === "pending" ? "Your enquiry is saved and will send when you're back online." : "We've got your enquiry and will contact you soon."}</p><a class="btn primary" href="#/tournaments">Back to tournaments</a></div>`;
  });
}
