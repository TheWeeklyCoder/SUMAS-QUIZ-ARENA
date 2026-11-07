// Admin: schedule group matches, watch joins live, extend or cancel when short of players, grade and publish standings.
import {
  db, doc, getDoc, getDocs, updateDoc, deleteDoc, collection, query, orderBy, limit, onSnapshot, writeBatch, serverTimestamp, Timestamp,
} from "../firebase.js";
import { state } from "../state.js";
import { esc, fmtDateTime, fmtDur, toMillis, slug, ls, timeout } from "../lib/util.js";
import { lState, decide, extensionPatch, lobbyConfig, gradeMatch, sampleQuestions, dailyStarts, isEveningStart } from "../lib/lobby.js";
import { toLocalInput, fromLocalInput, countdown } from "../lib/tournament.js";
import { avatar, badge, confirmBox, sheet, toast } from "../ui.js";
import { handleError } from "../net.js";
import { shareLink, copyLink, linkTo } from "../share.js";
import { loadBanks } from "../data.js";

const fail = (e) => { if (!handleError(e)) toast("That didn't work. Please try again.", "bad"); };
const norm = (id, d) => ({ id, ...d, opensAtMs: toMillis(d.opensAt), startsAtMs: toMillis(d.startsAt), endsAtMs: toMillis(d.endsAt) });

export async function lobbiesTab(body, ctx) {
  const cfg = lobbyConfig(state.settings);
  const banks = await loadBanks({ force: true }).catch(() => []);
  if (!ctx.alive()) return;
  let rows = [], auto = ls("auto_manage") !== false, unsub = null;
  const acted = new Set();
  ctx.onLeave(() => { unsub?.(); clearInterval(timer); });

  body.innerHTML = '<div id="top"></div><div id="list" class="stack"></div>';
  const top = body.querySelector("#top"), listEl = body.querySelector("#list");

  unsub = onSnapshot(query(collection(db, "lobbies"), orderBy("startsAt", "desc"), limit(15)), (snap) => { rows = snap.docs.map((d) => norm(d.id, d.data())); draw(); manage(); }, (e) => handleError(e));
  const timer = setInterval(() => { draw(); manage(); }, 15000);   // redraw so "Live" / "Grade match" follow the clock

  function tickText() { listEl.querySelectorAll("[data-cd]").forEach((el) => { const t = Number(el.dataset.at); el.textContent = countdown(t - Date.now()); }); }

  /** The host's rule, applied automatically while this page is open (or by hand with the buttons). */
  async function manage() {
    if (!auto) return;
    for (const l of rows) {
      const d = decide(l, Date.now(), cfg), k = `${l.id}:${l.startsAtMs}:${d.action}`;
      if (d.action === "none" || acted.has(k)) continue;
      acted.add(k);
      try {
        if (d.action === "extend") { await extend(l, true); toast(`"${l.title}" extended by ${cfg.extendMinutes} minutes`); }
        else { await cancel(l, d.reason); toast(`"${l.title}" cancelled: ${d.reason}`); }
      } catch (e) { acted.delete(k); fail(e); }
    }
  }
  async function extend(l) {
    const p = extensionPatch(l, cfg);
    await updateDoc(doc(db, "lobbies", l.id), { startsAt: Timestamp.fromMillis(p.startsAtMs), endsAt: Timestamp.fromMillis(p.endsAtMs), extensions: p.extensions, joinedAtExtend: p.joinedAtExtend });
  }
  async function cancel(l, reason) { await updateDoc(doc(db, "lobbies", l.id), { status: "cancelled", cancelReason: reason || "cancelled by the host" }); }

  function draw() {
    const needs = rows.filter((l) => !auto && decide(l, Date.now(), cfg).action !== "none");
    top.innerHTML = `<div class="stack-l"><div class="row between wrap"><p class="muted" style="margin:0">Minimum ${cfg.minPlayers} players, up to ${cfg.maxPlayers}. Short at the start: extend ${cfg.extendMinutes} min, cancel if nobody new joins.</p><button class="btn primary small" id="new">Schedule match</button></div>
      <label class="check"><input type="checkbox" id="auto" ${auto ? "checked" : ""}><span class="small"><strong>Auto-manage while this page is open</strong><br><span class="muted">Applies the rule at each start time by itself. If you close the app, tap Extend or Cancel yourself.</span></span></label>
      ${needs.length ? `<div class="notice bad small" role="alert">${needs.length} match${needs.length === 1 ? "" : "es"} short of players need a decision below.</div>` : ""}</div>`;
    top.querySelector("#new").onclick = form;
    top.querySelector("#auto").onchange = (e) => { auto = e.target.checked; ls("auto_manage", auto); draw(); manage(); };
    listEl.innerHTML = rows.length ? rows.map((l) => {
      const st = lState(l), d = decide(l, Date.now(), cfg), live = ["upcoming", "joining", "waiting", "live"].includes(st);
      return `<section class="card stack-s" data-l="${esc(l.id)}"><div class="row between wrap"><div><h2 style="margin:0">${esc(l.title)}</h2>
        <p class="muted small" style="margin:0">${fmtDateTime(l.startsAtMs)} to ${fmtDateTime(l.endsAtMs).replace(/^.*?, /, "")} · ${l.count || 0} questions${l.extensions ? ` · extended ${l.extensions}×` : ""}</p></div>
        ${badge(st === "waiting" ? "Short of players" : st === "joining" ? "Joining open" : st === "upcoming" ? "Scheduled" : st === "live" ? "Live" : st === "ended" ? "Needs grading" : st === "cancelled" ? "Cancelled" : "Graded", st === "live" || st === "joining" ? "green" : st === "cancelled" || st === "ended" || st === "waiting" ? "red" : "gold")}</div>
        <div><div class="row between small"><span><strong>${l.joinedCount || 0}</strong> joined</span><span class="muted">need ${l.minPlayers} · max ${l.maxPlayers}</span></div>
          <div class="bar ${(l.joinedCount || 0) >= l.minPlayers ? "" : "gold"}" style="margin-top:6px"><i style="width:${Math.min(100, Math.round(((l.joinedCount || 0) / l.minPlayers) * 100))}%"></i></div></div>
        ${l.status === "cancelled" ? `<p class="small muted" style="margin:0">${esc(l.cancelReason || "")}</p>` : ""}
        ${st === "joining" || st === "upcoming" ? `<p class="small muted" style="margin:0">${st === "upcoming" ? "Joining opens" : "Starts"} in <span data-cd data-at="${st === "upcoming" ? l.opensAtMs : l.startsAtMs}">${countdown((st === "upcoming" ? l.opensAtMs : l.startsAtMs) - Date.now())}</span></p>` : ""}
        ${d.action !== "none" ? `<div class="notice warn small">Short of players: ${esc(d.reason)}. Suggested: <strong>${d.action === "extend" ? "extend " + cfg.extendMinutes + " minutes" : "cancel"}</strong>.</div>` : ""}
        <div class="row wrap" style="gap:8px">
          ${live && st !== "live" ? `<button class="btn small" data-a="extend">Extend +${cfg.extendMinutes} min</button>` : ""}
          ${live ? '<button class="btn small danger" data-a="cancel">Cancel match</button>' : ""}
          ${st === "ended" || (st === "live" && Date.now() >= l.endsAtMs) ? '<button class="btn small primary" data-a="grade">Grade match</button>' : ""}
          ${st === "graded" ? '<button class="btn small" data-a="grade">Re-grade</button>' : ""}
          ${l.status !== "cancelled" ? '<button class="btn small" data-a="share">Share link</button>' : ""}
          ${(l.joinedCount || 0) === 0 && l.status !== "graded" ? '<button class="btn small danger" data-a="delete">Delete</button>' : ""}</div></section>`;
    }).join("") : '<div class="card center"><p class="muted">No matches yet. Tap "Schedule match".</p></div>';
    listEl.querySelectorAll("[data-l]").forEach((sec) => {
      const l = rows.find((x) => x.id === sec.dataset.l);
      sec.querySelectorAll("[data-a]").forEach((b) => (b.onclick = async () => {
        const a = b.dataset.a;
        try {
          if (a === "share") return shareMatch(l);
          if (a === "extend") { await extend(l); toast("Extended", "good"); }
          else if (a === "cancel") { if (await confirmBox({ title: "Cancel this match?", text: `${l.joinedCount || 0} joined player${l.joinedCount === 1 ? "" : "s"} will see that it was cancelled.`, okLabel: "Cancel match", cancelLabel: "Keep", danger: true })) { await cancel(l, "cancelled by the host"); toast("Cancelled"); } }
          else if (a === "grade") await grade(l);
          else if (a === "delete") { if (await confirmBox({ title: "Delete this match?", text: "It is removed for everyone.", okLabel: "Delete", danger: true })) { const bt = writeBatch(db); bt.delete(doc(db, "lobbies", l.id)); bt.delete(doc(db, "lobbyQuestions", l.id)); bt.delete(doc(db, "lobbyKeys", l.id)); await bt.commit(); toast("Deleted"); } }
        } catch (e) { fail(e); }
      }));
    });
  }

  async function grade(l) {
    if (Date.now() < l.endsAtMs) return toast("Grade after the match has ended", "bad");
    if (!(await confirmBox({ title: l.status === "graded" ? "Grade again?" : "Grade this match?", text: "Scores everyone who submitted and publishes the standings.", okLabel: "Grade" }))) return;
    const keyS = await getDoc(doc(db, "lobbyKeys", l.id));
    if (!keyS.exists()) throw new Error("no key");
    const eSnap = await getDocs(query(collection(db, "lobbies", l.id, "entries"), limit(100)));
    const ranked = gradeMatch(eSnap.docs.map((d) => ({ uid: d.id, ...d.data(), submittedAt: toMillis(d.data().submittedAt) })), keyS.data().answers);
    const rowsOut = await Promise.all(ranked.map(async (r) => {
      let nick = r.uid.slice(0, 6), color = "";
      try { const p = await getDoc(doc(db, "profiles", r.uid)); if (p.exists()) { nick = p.data().nickname; color = p.data().avatarColor || ""; } } catch { /* keep fallback */ }
      return { uid: r.uid, nick, color, score: r.score, total: r.total, sec: r.sec, rank: r.rank };
    }));
    const bt = writeBatch(db);
    bt.set(doc(db, "lobbies", l.id, "standings", "final"), { rows: rowsOut, gradedAt: serverTimestamp() });
    bt.update(doc(db, "lobbies", l.id), { status: "graded", gradedAt: serverTimestamp(), entryCount: rowsOut.length });
    await bt.commit();
    const sh = sheet(`<div class="stack"><p style="margin:0"><strong>${rowsOut.length}</strong> of ${l.joinedCount || 0} joined players submitted.</p>
      ${rowsOut.length ? `<div class="list">${rowsOut.slice(0, 5).map((r) => `<div class="item"><strong>${r.rank}</strong>${avatar(r.nick, r.color, 32)}<div class="grow">@${esc(r.nick)}<div class="meta">${fmtDur(r.sec)}</div></div><strong>${r.score}/${r.total}</strong></div>`).join("")}</div>` : ""}
      <button class="btn block" data-c>Close</button></div>`, { title: "Match graded" });
    sh.el.querySelector("[data-c]").onclick = sh.close;
  }

  const shareText = (title, ms) => `🏆 Group match: "${title}" on SUMAS Quiz Arena, ${fmtDateTime(ms)}. Tap the link, log in and take your seat:`;
  function shareMatch(l) { return shareLink({ title: l.title, text: shareText(l.title, l.startsAtMs), path: `/match/${l.id}` }); }
  /** After creating: show each new match with a share button so it can go straight to the WhatsApp group. */
  function shareCreated(list) {
    const s = sheet(`<div class="stack"><p class="muted small" style="margin:0">Share the link so students can join. It opens the match after they log in.</p>
      ${list.map((m) => `<div class="card tight stack-s"><strong>${esc(m.title)}</strong><div class="small muted">${fmtDateTime(m.ms)}</div>
        <div class="small" style="word-break:break-all">${esc(linkTo("/match/" + m.id) || "Open the app from its web address to get a link.")}</div>
        <div class="row wrap" style="gap:8px"><button class="btn small primary" data-sh="${esc(m.id)}">Share</button><button class="btn small" data-cp="${esc(m.id)}">Copy link</button></div></div>`).join("")}
      <button class="btn block" data-c>Done</button></div>`, { title: list.length === 1 ? "Match scheduled" : `${list.length} matches scheduled` });
    s.el.querySelector("[data-c]").onclick = s.close;
    s.el.querySelectorAll("[data-sh]").forEach((b) => (b.onclick = () => { const m = list.find((x) => x.id === b.dataset.sh); shareLink({ title: m.title, text: shareText(m.title, m.ms), path: `/match/${m.id}` }); }));
    s.el.querySelectorAll("[data-cp]").forEach((b) => (b.onclick = () => copyLink(`/match/${b.dataset.cp}`)));
  }

  function form() {
    const sets = banks.flatMap((b) => (b.sets || []).map((s) => ({ ...s, bankId: b.id, bankTitle: b.title })));
    if (!sets.length) return toast("Upload a question set first", "bad");
    const d = new Date(); d.setHours(19, 0, 0, 0); if (d.getTime() < Date.now() + 3600000) d.setDate(d.getDate() + 1);
    const s = sheet(`<div class="stack"><label>Match title<input id="ti" maxlength="60" value="Evening Showdown"></label>
      <label>Questions come from<select id="src">${sets.map((x) => `<option value="${esc(x.id)}">${esc(x.bankTitle)}: ${esc(x.title)} (${x.count})</option>`).join("")}</select></label>
      <label>Number of questions<input id="n" type="number" min="5" max="60" value="20"><span class="field-hint">A random selection from that set. Each day gets a different mix.</span></label>
      <label>Starts<input id="st" type="datetime-local" value="${toLocalInput(d.getTime())}"><span class="field-hint">Evenings, 5pm to midnight, work best.</span></label>
      <label>Joining opens (hours before the start)<input id="ho" type="number" min="1" max="72" value="24"></label>
      <label>Time to answer (minutes)<input id="len" type="number" min="5" max="90" value="${cfg.matchMinutes}"></label>
      <label>Repeat daily for<input id="days" type="number" min="1" max="14" value="1"><span class="field-hint">Same time every day. 1 = just this match.</span></label>
      <p id="ferr" class="notice bad small" role="alert" hidden></p>
      <div class="row" style="justify-content:flex-end"><button class="btn ghost" data-c>Cancel</button><button class="btn primary" id="go">Create</button></div></div>`, { title: "Schedule a match" });
    const $ = (x) => s.el.querySelector(x); $("[data-c]").onclick = s.close;
    // Messages show inside the form (always visible), not only as a toast.
    const say = (m, kind = "bad") => { const e = $("#ferr"); e.textContent = m; e.className = `notice ${kind} small`; e.hidden = !m; if (m) e.scrollIntoView({ block: "nearest" }); };
    let okEarly = false;                          // the "not an evening time" warning is shown once, then a second tap goes ahead
    ["#st", "#ti", "#n"].forEach((x) => $(x).addEventListener("input", () => { okEarly = false; say(""); }));
    $("#go").onclick = async () => {
      const title = $("#ti").value.trim(), start = fromLocalInput($("#st").value), len = Math.max(5, Number($("#len").value) || cfg.matchMinutes), n = Math.max(5, Number($("#n").value) || 20);
      say("");
      if (!title) return say("Please enter a title.");
      if (!start || start < Date.now()) return say("Pick a start time in the future.");
      if (!isEveningStart(start) && !okEarly) { okEarly = true; return say("That is not an evening time. Matches work best between 5pm and midnight. Tap Create again to go ahead anyway.", "warn"); }
      $("#go").disabled = true; $("#go").textContent = "Creating...";
      try {
        const src = sets.find((x) => x.id === $("#src").value), snap = await getDoc(doc(db, "sets", src.id));
        if (!snap.exists()) throw new Error("set missing");
        const starts = dailyStarts(start, Number($("#days").value) || 1), made = [];
        const bt = writeBatch(db);
        starts.forEach((ms, i) => {
          const id = `${slug(title) || "match"}-${new Date(ms).toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 5)}`;
          const pick = sampleQuestions(snap.data(), n, Date.now() + i * 7919);
          bt.set(doc(db, "lobbies", id), { title: starts.length > 1 ? `${title} · ${new Date(ms).toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short" })}` : title, setId: src.id, bankId: src.bankId,
            opensAt: Timestamp.fromMillis(ms - Math.max(1, Number($("#ho").value) || 24) * 3600000), startsAt: Timestamp.fromMillis(ms), endsAt: Timestamp.fromMillis(ms + len * 60000),
            minPlayers: cfg.minPlayers, maxPlayers: cfg.maxPlayers, joinedCount: 0, status: "scheduled", extensions: 0, joinedAtExtend: 0, count: pick.questions.length, createdAt: serverTimestamp() });
          bt.set(doc(db, "lobbyQuestions", id), { questions: pick.questions, updatedAt: serverTimestamp() });
          bt.set(doc(db, "lobbyKeys", id), { answers: pick.answers, updatedAt: serverTimestamp() });
          made.push(id);
        });
        await timeout(bt.commit(), 15000);
        s.close(); toast(`${made.length} match${made.length === 1 ? "" : "es"} scheduled`, "good");
        shareCreated(made.map((id, i) => ({ id, ms: starts[i], title: starts.length > 1 ? `${title} · ${new Date(starts[i]).toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short" })}` : title })));
      } catch (e) {
        $("#go").disabled = false; $("#go").textContent = "Create";
        say(e?.code === "timeout" ? "This is taking too long. Check your connection, then look at the list before trying again." : e?.code === "permission-denied" ? "The database refused this. Make sure you are signed in as the admin and the latest rules are published." : "Couldn't create the match. Check your connection and try again.");
        handleError(e);
      }
    };
  }
}
