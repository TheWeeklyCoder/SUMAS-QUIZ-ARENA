// Group matches (paid students). A match is a scheduled window: join before the start, play together, answers are graded by the host.
// Rules recap (firestore.rules): joining = create players/{uid} AND joinedCount +1 in one batch, only between opensAt and startsAt;
// questions open at startsAt to joined players; one create-only entry per player before endsAt; the key opens after endsAt.
import { db, doc, getDoc, getDocs, setDoc, collection, query, orderBy, limit, onSnapshot, writeBatch, increment, serverTimestamp } from "../firebase.js";
import { state, isPaid } from "../state.js";
import { go } from "../router.js";
import { lState, lobbyConfig } from "../lib/lobby.js";
import { countdown } from "../lib/tournament.js";
import { esc, short, fmtDateTime, fmtDur, toMillis, settle, timeout } from "../lib/util.js";
import { avatar, badge, confirmBox, hint, icon, lockedCard, skeleton, toast } from "../ui.js";
import { handleError, isOnline } from "../net.js";
import { runPlay } from "./playengine.js";
import { postActivity } from "../activity.js";
import { shareLink } from "../share.js";

const norm = (id, d) => ({ id, ...d, opensAtMs: toMillis(d.opensAt), startsAtMs: toMillis(d.startsAt), endsAtMs: toMillis(d.endsAt), minPlayers: d.minPlayers || lobbyConfig(state.settings).minPlayers, maxPlayers: d.maxPlayers || lobbyConfig(state.settings).maxPlayers });
const LABEL = {
  upcoming: ["Joining soon", "gold"], joining: ["Join now", "green"], waiting: ["Waiting for players", "gold"], live: ["Live", "green"],
  ended: ["Ended", ""], cancelled: ["Cancelled", "red"], graded: ["Results out", ""],
};
const stBadge = (st) => badge(LABEL[st][0], LABEL[st][1]);
const lockedPage = (title) => `<div class="stack-l"><header><h1>${title}</h1></header>${lockedCard("Group matches are for subscribers", "Join scheduled matches, compete live and see where you place.")}</div>`;

/* ================================ LIST ================================ */
export default async function matches(ctx) {
  if (!isPaid()) { ctx.view.innerHTML = lockedPage("Group matches"); return; }
  ctx.view.innerHTML = `<div class="stack-l"><header><h1>Group matches</h1><p class="muted" style="margin:0">Scheduled evening matches. Join before the start. A match needs enough players to go ahead.</p></header><div id="l">${skeleton(3)}</div></div>`;
  const box = ctx.view.querySelector("#l");
  try {
    const snap = await getDocs(query(collection(db, "lobbies"), orderBy("startsAt", "desc"), limit(15)));
    if (!ctx.alive()) return;
    const rows = snap.docs.map((d) => norm(d.id, d.data())).map((l) => ({ l, st: lState(l) }));
    const active = rows.filter((r) => ["upcoming", "joining", "waiting", "live"].includes(r.st)).sort((a, b) => a.l.startsAtMs - b.l.startsAtMs);
    const past = rows.filter((r) => !active.includes(r)).slice(0, 5);
    const row = ({ l, st }) => `<a class="item" href="#/match/${esc(l.id)}"><span class="tile ${st === "live" || st === "joining" ? "" : "gold"}">${icon("trophy")}</span><div class="grow"><strong>${esc(l.title)}</strong>
      <div class="meta">${fmtDateTime(l.startsAtMs)}${["upcoming", "joining", "waiting"].includes(st) ? ` · ${l.joinedCount || 0} of ${l.minPlayers} needed` : ""}</div></div>${stBadge(st)}</a>`;
    box.innerHTML = `<div class="stack-l">${active.length ? `<section class="stack-s"><h2>Coming up</h2><div class="list">${active.map(row).join("")}</div></section>`
      : '<div class="card center stack-s"><div style="color:var(--gold)">' + icon("trophy") + '</div><h2>No match scheduled yet</h2><p class="muted" style="margin:0">Matches are announced here and on the WhatsApp group. Check back soon.</p></div>'}
      ${past.length ? `<section class="stack-s"><h2>Recent</h2><div class="list">${past.map(row).join("")}</div></section>` : ""}</div>`;
  } catch (e) {
    if (!ctx.alive()) return;
    box.innerHTML = '<div class="card center stack"><p class="muted">Couldn\'t load matches.</p><button class="btn" id="r">Try again</button></div>';
    box.querySelector("#r").onclick = () => matches(ctx);
    handleError(e, { retry: () => matches(ctx) });
  }
}

/* ============================== LOBBY PAGE ============================== */
export async function matchPage(ctx) {
  if (!isPaid()) { ctx.view.innerHTML = lockedPage("Group match"); return; }
  const { lid } = ctx.params, uid = state.user.uid, root = ctx.view;
  root.innerHTML = skeleton(3);
  let l = null, joined = false, entry = null, standings = null, last = "", busy = false, standingsLoading = false;
  const unsubs = [];
  const stop = () => { unsubs.forEach((u) => { try { u(); } catch { /* ignore */ } }); unsubs.length = 0; };
  try {
    const e = await getDoc(doc(db, "lobbies", lid, "entries", uid)).catch(() => null);
    entry = e && e.exists() ? { ...e.data(), at: toMillis(e.data().submittedAt) } : null;
  } catch { /* shown as not entered */ }
  if (!ctx.alive()) return;

  const listen = () => {
    if (unsubs.length) return;
    unsubs.push(onSnapshot(doc(db, "lobbies", lid), (s) => { l = s.exists() ? norm(s.id, s.data()) : null; render(true); }, (e) => handleError(e)));
    unsubs.push(onSnapshot(doc(db, "lobbies", lid, "players", uid), (s) => { joined = s.exists(); render(true); }, () => {}));
  };
  // Save reads: stop listening while the app is in the background.
  const onVis = () => { if (document.hidden) stop(); else listen(); };
  document.addEventListener("visibilitychange", onVis);
  listen();
  const timer = setInterval(() => { if (!l) return; if (stateOf() !== last) render(); else tickText(); }, 1000);
  ctx.onLeave(() => { stop(); clearInterval(timer); document.removeEventListener("visibilitychange", onVis); });

  function stateOf() { return lState(l, Date.now()); }
  function tickText() {
    root.querySelectorAll("[data-cd]").forEach((el) => { const t = l[el.dataset.cd + "Ms"]; el.textContent = countdown(t - Date.now()); });
    const lt = root.querySelector("#livecd"); if (lt) lt.textContent = fmtDur(Math.max(0, (l.endsAtMs - Date.now()) / 1000));
  }

  async function render(fromData = false) {
    if (!ctx.alive() || busy && !fromData) return;
    if (!l) { root.innerHTML = '<div class="card center stack"><h2>Match not found</h2><a class="btn" href="#/matches">Back</a></div>'; return; }
    const st = stateOf(); last = st;
    if (st === "graded" && !standings && !standingsLoading) { loadStandings(); }
    const need = l.minPlayers, n = l.joinedCount || 0, full = n >= l.maxPlayers;
    const head = `<section class="hero stack-s"><div class="row between"><span class="eyebrow" style="color:#fff;opacity:.85">Group match</span>${stBadge(st)}</div>
      <h1 style="margin:0">${esc(l.title)}</h1><p class="small" style="margin:0">${fmtDateTime(l.startsAtMs)} · ${l.count || "?"} questions · ${fmtDur(Math.max(0, (l.endsAtMs - l.startsAtMs) / 1000))} to answer</p>
      ${["upcoming", "joining", "waiting"].includes(st) ? `<div><div class="row between small"><span>${n} joined</span><span>${n >= need ? "Enough players" : `${need - n} more needed`}</span></div>
        <div class="bar" style="margin-top:8px"><i style="width:${Math.min(100, Math.round((n / need) * 100))}%"></i></div></div>` : ""}</section>`;
    let main = "";
    if (st === "cancelled") main = `<div class="card center stack-s"><h2 style="margin:0">This match was cancelled</h2><p class="muted" style="margin:0">Not enough players joined in time. Nothing is lost. Join the next one.</p><a class="btn primary" href="#/matches">See other matches</a></div>`;
    else if (st === "upcoming") main = `<div class="card center stack-s"><h2 style="margin:0">Joining opens in <span data-cd="opensAt">${countdown(l.opensAtMs - Date.now())}</span></h2><p class="muted" style="margin:0">Come back then to take your seat.</p></div>`;
    else if (st === "joining") main = `<div class="card stack-s ${joined ? "accent" : ""}">${joined
      ? `<div class="row" style="gap:12px"><span class="tile">${icon("check")}</span><div class="grow"><strong>You're in</strong><div class="small muted">Starts in <span data-cd="startsAt">${countdown(l.startsAtMs - Date.now())}</span>. Open this page at the start time.</div></div></div><button class="btn ghost" id="leave">Leave this match</button>`
      : `<h2 style="margin:0">Starts in <span data-cd="startsAt">${countdown(l.startsAtMs - Date.now())}</span></h2><button class="btn primary block" id="join" ${full ? "disabled" : ""}>${full ? "This match is full" : "Join the match"}</button>`}
      <p class="small muted" style="margin:0">We need ${need} players. If we're short at the start, we wait a few more minutes, then cancel if nobody new joins.</p></div>`;
    else if (st === "waiting") main = `<div class="card stack-s center"><h2 style="margin:0">Waiting for more players</h2><p style="margin:0"><strong>${n} of ${need}</strong> have joined.</p>
      <p class="small muted" style="margin:0">${joined ? "You're in. " : ""}The host will give a few more minutes, or cancel if nobody new joins. This page updates by itself. Tell a friend to join.</p></div>`;
    else if (st === "live") main = entry ? `<div class="card accent stack-s"><div class="row" style="gap:12px"><span class="tile">${icon("check")}</span><div class="grow"><strong>Your answers are in</strong><div class="small muted">Submitted ${fmtDateTime(entry.at)}. Results come after the match is graded.</div></div></div></div>`
      : joined ? `<div class="card stack-s center"><h2 style="margin:0">The match is live!</h2><p style="margin:0">Time left: <strong id="livecd">${fmtDur(Math.max(0, (l.endsAtMs - Date.now()) / 1000))}</strong></p><a class="btn primary block" href="#/matchplay/${esc(lid)}">Start the match</a></div>`
      : '<div class="card center stack-s"><h2 style="margin:0">This match has started</h2><p class="muted" style="margin:0">Joining closed at the start time. Join the next one.</p><a class="btn" href="#/matches">See other matches</a></div>';
    else if (st === "ended") main = `<div class="card center stack-s"><h2 style="margin:0">${entry ? "Your answers are in" : "This match has ended"}</h2><p class="muted" style="margin:0">${entry ? "Results are published after the host grades the match." : "You didn't submit answers for this one."}</p></div>`;
    else if (st === "graded") main = resultHtml();
    const shareBtn = st === "cancelled" ? "" : `<button class="btn ghost block" id="shr">${icon("share", "sm")} Share this match</button>`;
    root.innerHTML = `<div class="stack-l">${head}<div id="main">${main}</div>${shareBtn}${hint("Everyone gets the same questions, shuffled differently. Scores decide, a faster time breaks ties.", "info")}</div>`;
    root.querySelector("#shr")?.addEventListener("click", () => shareLink({ title: l.title, text: `🏆 Join "${l.title}" on SUMAS Quiz Arena, a group match starting ${fmtDateTime(l.startsAtMs)}. Tap the link, log in and take your seat:`, path: `/match/${lid}` }));
    root.querySelector("#join")?.addEventListener("click", join);
    root.querySelector("#leave")?.addEventListener("click", leave);
    root.querySelector("#rev")?.addEventListener("click", review);
  }

  function resultHtml() {
    if (!standings) return skeleton(2);
    if (standings.failed) return '<div class="card center"><p class="muted" style="margin:0">Couldn\'t load the results. Check your connection and reopen this page.</p></div>';
    const rows = standings.rows || [], mine = rows.find((r) => r.uid === uid);
    return `<div class="stack">${mine ? `<div class="card accent stack-s center"><h2 style="margin:0">You placed #${mine.rank} of ${rows.length}</h2><div class="price">${mine.score} / ${mine.total}</div><div class="small muted">Time ${fmtDur(mine.sec)}</div></div>`
      : '<div class="card center"><p class="muted" style="margin:0">You didn\'t submit answers for this match.</p></div>'}
      <div class="list">${rows.slice(0, 10).map((r) => `<div class="item" ${r.uid === uid ? 'style="border-color:var(--brand)"' : ""}><strong style="min-width:26px">${r.rank}</strong>${avatar(r.nick, r.color, 34)}<div class="grow"><strong>@${esc(short(r.nick))}</strong><div class="meta">${fmtDur(r.sec)}</div></div><strong>${r.score}/${r.total}</strong></div>`).join("")}</div>
      ${entry ? '<button class="btn block" id="rev">Review my answers</button><div id="revbox"></div>' : ""}</div>`;
  }
  async function loadStandings() {
    standingsLoading = true;
    let got = { rows: [] };
    try { const s = await getDoc(doc(db, "lobbies", lid, "standings", "final")); got = s.exists() ? s.data() : { rows: [] }; } catch (e) { got = { rows: [], failed: true }; handleError(e); }
    standingsLoading = false; standings = got;
    if (ctx.alive()) render(true);
  }
  async function review() {
    const b = root.querySelector("#rev"); b.disabled = true; const rb = root.querySelector("#revbox"); rb.innerHTML = skeleton(2);
    try {
      const [qs, ks] = await Promise.all([getDoc(doc(db, "lobbyQuestions", lid)), getDoc(doc(db, "lobbyKeys", lid))]);
      const questions = qs.data().questions, key = ks.data().answers;
      rb.innerHTML = `<div class="stack-s" style="margin-top:12px">${questions.map((q, i) => {
        const mine = entry.answers[i], ok = mine === key[i];
        return `<details class="card tight"><summary><span class="badge ${ok ? "green" : "red"}">${ok ? "Right" : mine === -1 ? "Skipped" : "Missed"}</span> <strong>Q${i + 1}.</strong> ${esc(String(q.text).slice(0, 80))}</summary>
          <div class="stack-s" style="margin-top:10px"><p style="margin:0;white-space:pre-wrap">${esc(q.text)}</p><p class="small" style="margin:0"><span class="badge ${ok ? "green" : "red"}">You</span> ${mine === -1 ? "Skipped" : esc(q.options[mine] ?? "")}</p>
          <p class="small" style="margin:0"><span class="badge green">Correct</span> ${esc(q.options[key[i]] ?? "")}</p>${q.explanation ? `<div class="explain small">${esc(q.explanation)}</div>` : ""}</div></details>`;
      }).join("")}</div>`;
    } catch (e) { rb.innerHTML = '<p class="muted small">Couldn\'t load the answers right now.</p>'; b.disabled = false; handleError(e); }
  }

  async function join() {
    if (!isOnline()) return toast("You need to be online to join.", "bad");
    busy = true; const b = root.querySelector("#join"); if (b) { b.disabled = true; b.textContent = "Joining..."; }
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, "lobbies", lid, "players", uid), { uid, nick: state.profile.nickname, joinedAt: serverTimestamp() });
      batch.update(doc(db, "lobbies", lid), { joinedCount: increment(1) });
      await timeout(batch.commit(), 12000);
      toast("You're in. See you at the start!", "good"); postActivity("joined", l.title);
    } catch (e) {
      if (e?.code === "permission-denied") toast("Couldn't join. The match may be full or have just started.", "bad");
      else if (e?.code === "timeout") toast("Slow connection. Check back in a moment to see if you're in.");
      else if (!handleError(e)) toast("That didn't work. Please try again.", "bad");
    }
    busy = false; render(true);
  }
  async function leave() {
    if (!(await confirmBox({ title: "Leave this match?", text: "Your seat is given up. You can join again before the start if there's space.", okLabel: "Leave" }))) return;
    busy = true;
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, "lobbies", lid, "players", uid));
      batch.update(doc(db, "lobbies", lid), { joinedCount: increment(-1) });
      await timeout(batch.commit(), 12000);
    } catch (e) { if (e?.code === "permission-denied") toast("You can't leave now.", "bad"); else if (!handleError(e)) toast("That didn't work. Please try again.", "bad"); }
    busy = false; render(true);
  }
}

/* ================================== PLAY ================================== */
export async function matchPlay(ctx) {
  if (!isPaid()) { go("/matches", { replace: true }); return; }
  const { lid } = ctx.params, uid = state.user.uid, root = ctx.view, back = `#/match/${lid}`;
  root.innerHTML = skeleton(3);
  try {
    const ls_ = await getDoc(doc(db, "lobbies", lid));
    if (!ctx.alive()) return;
    const l = ls_.exists() ? norm(ls_.id, ls_.data()) : null;
    if (!l || lState(l) !== "live") { toast("This match isn't live right now."); return go(`/match/${lid}`, { replace: true }); }
    const [pl, en] = await Promise.all([getDoc(doc(db, "lobbies", lid, "players", uid)), getDoc(doc(db, "lobbies", lid, "entries", uid)).catch(() => null)]);
    if (!ctx.alive()) return;
    if (!pl.exists()) { toast("You didn't join this match."); return go(`/match/${lid}`, { replace: true }); }
    if (en && en.exists()) { toast("You've already submitted."); return go(`/match/${lid}`, { replace: true }); }
    const qs = await getDoc(doc(db, "lobbyQuestions", lid));
    if (!ctx.alive()) return;
    if (!qs.exists() || !qs.data().questions?.length) { root.innerHTML = `<div class="card center stack"><h2>Questions not ready</h2><p class="muted">The host hasn't added the questions yet. Please wait a moment and try again.</p><a class="btn" href="${back}">Back</a></div>`; return; }
    if (!ctx.alive()) return;
    runPlay(ctx, {
      questions: qs.data().questions, seed: `${uid}:m:${lid}`, endsAtMs: l.endsAtMs, startedAtMs: l.startsAtMs, label: l.title, resumeKey: `mplay_${uid}_${lid}`, backHref: back,
      submit: (answers, sec) => settle(setDoc(doc(db, "lobbies", lid, "entries", uid), { uid, answers, durationSec: sec, submittedAt: serverTimestamp() }), 12000),
      onDone: (r) => {
        if (r === "denied") { root.innerHTML = `<div class="card center stack"><h2>We couldn't accept your answers</h2><p class="muted">The match may have just closed, or you already submitted. Nothing was changed.</p><a class="btn primary" href="${back}">Back to the match</a></div>`; return; }
        toast(r === "pending" ? "Saved on this phone. It will send when you're back online." : "Submitted. Good luck!", "good"); go(`/match/${lid}`);
      },
    });
  } catch (e) {
    if (!ctx.alive()) return;
    root.innerHTML = `<div class="card center stack"><h2>Couldn't open the match</h2><p class="muted">${e?.code === "permission-denied" ? "The questions aren't open to you yet." : "Check your internet connection and try again."}</p><button class="btn primary" id="r">Try again</button> <a class="btn ghost" href="${back}">Back</a></div>`;
    root.querySelector("#r").onclick = () => matchPlay(ctx);
    if (e?.code !== "permission-denied") handleError(e, { retry: () => matchPlay(ctx) });
  }
}
