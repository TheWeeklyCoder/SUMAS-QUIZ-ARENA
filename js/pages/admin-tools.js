// Admin tools added in Phase 2: Analysis (Analyse button, flagged questions, leaderboard), Activity (session logs),
// Terms records (printable proof) and Backup (JSON export). Loaded on demand from admin.js.
import {
  db, doc, getDoc, getDocs, setDoc, collection, query, orderBy, limit, where, startAfter, documentId, writeBatch, serverTimestamp, Timestamp,
} from "../firebase.js";
import { esc, fmtDateTime, fmtDur, toMillis, dayKey, downloadText, jsonSafe } from "../lib/util.js";
import { planRun, mergeQStats, mergeSetStats, flaggedQuestions, questionRates, topicRates, buildLeaderboard } from "../lib/analyse.js";
import { avatar, confirmBox, sheet, toast } from "../ui.js";
import { handleError } from "../net.js";
import { loadBanks, invalidateBanks } from "../data.js";
import { cacheDel } from "../cache.js";
import { RESTORABLE, readBackup, reviveTimestamps } from "../lib/lobby.js";
import { TERMS_VERSION, TERMS_TEXT, termsHash } from "../terms.js";

const fail = (e) => { if (!handleError(e)) toast("That didn't work. Please try again.", "bad"); };
const names = new Map();
async function nickOf(uid) {
  if (names.has(uid)) return names.get(uid);
  let v = { nick: String(uid).slice(0, 6), color: "#64748B" };
  try { const s = await getDoc(doc(db, "profiles", uid)); if (s.exists()) v = { nick: s.data().nickname, color: s.data().avatarColor }; } catch { /* keep the fallback */ }
  names.set(uid, v); return v;
}

/* ============================== ANALYSIS ============================== */
export async function analyseTab(body, ctx) {
  const [metaS, qSnap, lbS, banks] = await Promise.all([
    getDoc(doc(db, "qStats", "_meta")), getDocs(collection(db, "qStats")), getDoc(doc(db, "leaderboard", "top100")), loadBanks({ force: true }).catch(() => []),
  ]);
  if (!ctx.alive()) return;
  const meta = metaS.exists() ? metaS.data() : {};
  const titles = {};
  for (const b of banks) { titles["taster_" + b.id] = `${b.title}: free taster`; for (const s of b.sets || []) titles[s.id] = `${b.title}: ${s.title}`; }
  const stats = qSnap.docs.filter((d) => d.id !== "_meta").map((d) => ({ id: d.id, ...d.data() }));
  const flagged = stats.map((q) => ({ q, flags: flaggedQuestions(q) })).filter((x) => x.flags.length);
  const lbAt = lbS.exists() ? toMillis(lbS.data().updatedAt) : null;
  let result = "";

  function draw() {
    body.innerHTML = `<div class="stack-l">
      <section class="card stack"><h2>Analyse new attempts</h2>
        <p class="muted small" style="margin:0">Reads the attempts made since the last run and updates the per-question stats, each set's ranking data and every student's points.
          Each attempt costs one read, so run it once a day or less. Nothing is counted twice.</p>
        <dl class="kv"><dt>Last run</dt><dd>${meta.lastRunAt ? fmtDateTime(toMillis(meta.lastRunAt)) : "Never"}</dd><dt>Attempts analysed</dt><dd>${meta.attemptsTotal || 0}</dd></dl>
        <button class="btn primary" id="run">Analyse now</button>
        ${result ? `<div class="notice warn" role="status">${result}</div>` : ""}</section>
      <section class="card stack"><h2>Leaderboard</h2>
        <p class="muted small" style="margin:0">Publishes the top 100 by points for subscribers. Run Analyse first so points are up to date. Costs about 100 reads.</p>
        <dl class="kv"><dt>Last published</dt><dd>${lbAt ? fmtDateTime(lbAt) : "Never"}</dd></dl>
        <button class="btn" id="lb">Rebuild leaderboard</button></section>
      <section class="stack-s"><h2>Questions to check</h2>
        <p class="muted small" style="margin:0">A question that nearly everyone misses (${Math.round(0.85 * 100)}% or more, with at least 10 students) often has a wrong answer key. Check these first.</p>
        ${flagged.length ? flagged.map(({ q, flags }) => `<div class="card stack-s"><div class="row between wrap"><strong>${esc(titles[q.id] || q.id)}</strong><span class="badge red">${flags.length} flagged</span></div>
          ${flags.slice(0, 6).map((f) => `<div class="qrow"><strong>Q${f.idx + 1}</strong><div class="bar red"><i style="width:${Math.round(f.rate * 100)}%"></i></div><span class="muted">${Math.round(f.rate * 100)}%</span></div>`).join("")}
          <button class="btn small" data-set="${esc(q.id)}">See all questions</button></div>`).join("")
          : '<div class="card center"><p class="muted" style="margin:0">No flagged questions yet.</p></div>'}</section>
      <section class="stack-s"><h2>All analysed sets</h2>
        ${stats.length ? `<div class="list">${stats.map((q) => `<button class="item" data-set="${esc(q.id)}"><div class="grow"><strong>${esc(titles[q.id] || q.id)}</strong><div class="meta">${q.n} first attempt${q.n === 1 ? "" : "s"} · ${q.total} questions</div></div></button>`).join("")}</div>`
          : '<div class="card center"><p class="muted" style="margin:0">Nothing analysed yet. Tap "Analyse now" once students have finished some sets.</p></div>'}</section></div>`;
    body.querySelector("#run").onclick = run;
    body.querySelector("#lb").onclick = rebuild;
    body.querySelectorAll("[data-set]").forEach((b) => (b.onclick = () => detail(b.dataset.set)));
  }

  async function run() {
    const btn = body.querySelector("#run"); btn.disabled = true; btn.textContent = "Analysing...";
    try {
      const cons = [orderBy("createdAt"), orderBy(documentId())];
      if (meta.throughTs) cons.push(startAfter(meta.throughTs, meta.throughId));
      cons.push(limit(500));
      const snap = await getDocs(query(collection(db, "attempts"), ...cons));
      const attempts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (!attempts.length) { result = "Nothing new to analyse."; return draw(); }
      const plan = planRun(attempts), used = attempts.slice(0, plan.used), last = used[used.length - 1];

      const setIds = [...plan.bySet.keys()], uids = [...plan.byUser.keys()];
      const [qOld, sOld, pOld] = await Promise.all([
        Promise.all(setIds.map((id) => getDoc(doc(db, "qStats", id)))),
        Promise.all(setIds.map((id) => (plan.bySet.get(id).taster ? null : getDoc(doc(db, "setStats", id))))),
        Promise.all(uids.map((u) => getDoc(doc(db, "profiles", u)))),
      ]);
      const profiles = new Map(uids.map((u, i) => [u, pOld[i]]));
      const nicks = {}; for (const [u, s] of profiles) if (s.exists()) nicks[u] = s.data().nickname;

      const b = writeBatch(db); let newFlags = 0;
      setIds.forEach((id, i) => {
        const inc = plan.bySet.get(id);
        const q = mergeQStats(qOld[i].exists() ? qOld[i].data() : null, inc);
        newFlags += flaggedQuestions(q).length;
        b.set(doc(db, "qStats", id), { ...q, title: titles[id] || id, updatedAt: serverTimestamp() });
        if (!inc.taster) {
          const s = mergeSetStats(sOld[i].exists() ? sOld[i].data() : null, inc, nicks);
          b.set(doc(db, "setStats", id), { ...s, title: titles[id] || id, updatedAt: serverTimestamp() });
        }
      });
      let pointed = 0;
      for (const [u, inc] of plan.byUser) {
        const s = profiles.get(u); if (!s.exists()) continue;       // deleted account: nothing to credit
        b.update(doc(db, "profiles", u), { points: (s.data().points || 0) + inc.points, solved: (s.data().solved || 0) + inc.solved }); pointed++;
      }
      b.set(doc(db, "qStats", "_meta"), { throughTs: last.createdAt, throughId: last.id, lastRunAt: serverTimestamp(), attemptsTotal: (meta.attemptsTotal || 0) + plan.used, runs: (meta.runs || 0) + 1 });
      await b.commit();
      Object.assign(meta, { throughTs: last.createdAt, throughId: last.id, lastRunAt: Date.now(), attemptsTotal: (meta.attemptsTotal || 0) + plan.used });
      result = `Analysed ${plan.used} attempt${plan.used === 1 ? "" : "s"} across ${setIds.length} set${setIds.length === 1 ? "" : "s"}; ${pointed} student${pointed === 1 ? "" : "s"} credited with points.${plan.truncated ? ` <strong>${attempts.length - plan.used} more are waiting. Tap Analyse again.</strong>` : ""}${snap.size === 500 && !plan.truncated ? " There may be more. Tap Analyse again." : ""}`;
      toast("Analysis done", "good");
      // refresh the lists
      const q2 = await getDocs(collection(db, "qStats"));
      stats.splice(0, stats.length, ...q2.docs.filter((d) => d.id !== "_meta").map((d) => ({ id: d.id, ...d.data() })));
      flagged.splice(0, flagged.length, ...stats.map((q) => ({ q, flags: flaggedQuestions(q) })).filter((x) => x.flags.length));
      draw();
    } catch (e) { fail(e); btn.disabled = false; btn.textContent = "Analyse now"; }
  }

  async function rebuild() {
    const btn = body.querySelector("#lb"); btn.disabled = true;
    try {
      const snap = await getDocs(query(collection(db, "profiles"), orderBy("points", "desc"), limit(100)));
      const entries = buildLeaderboard(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
      await setDoc(doc(db, "leaderboard", "top100"), { entries, updatedAt: serverTimestamp() });
      toast(`Leaderboard published (${entries.length} students)`, "good"); result = ""; analyseTab(body, ctx);
    } catch (e) { fail(e); btn.disabled = false; }
  }

  async function detail(id) {
    const q = stats.find((x) => x.id === id); if (!q) return;
    let questions = [];
    try {
      const s = await getDoc(doc(db, id.startsWith("taster_") ? "tasters" : "sets", id.startsWith("taster_") ? id.slice(7) : id));
      if (s.exists()) questions = s.data().questions || [];
    } catch { /* show the numbers without the question text */ }
    const rates = questionRates(q), topics = questions.length ? topicRates(q, questions) : [];
    const sh = sheet(`<div class="stack"><p class="muted small" style="margin:0">${q.n} first attempts. Hardest questions first. "Missed" includes skipped.</p>
      ${topics.length ? `<div class="stack-s"><h3 style="margin:0">By topic</h3>${topics.map((t) => `<div class="qrow" style="grid-template-columns:1fr 90px 44px"><span>${esc(t.name)}</span><div class="bar ${t.rate >= .6 ? "red" : t.rate >= .35 ? "gold" : ""}"><i style="width:${Math.round(t.rate * 100)}%"></i></div><span class="muted">${Math.round(t.rate * 100)}%</span></div>`).join("")}</div>` : ""}
      <h3 style="margin:0">Questions</h3>
      <div class="stack-s">${rates.slice(0, 40).map((r) => `<div><div class="qrow"><strong>Q${r.idx + 1}</strong><div class="bar ${r.rate >= .85 ? "red" : r.rate >= .5 ? "gold" : ""}"><i style="width:${Math.round(r.rate * 100)}%"></i></div><span class="muted">${Math.round(r.rate * 100)}%</span></div>
        ${questions[r.idx] ? `<div class="small muted" style="margin:2px 0 6px">${esc(String(questions[r.idx].text).slice(0, 110))}</div>` : ""}</div>`).join("")}</div>
      <button class="btn block" data-c>Close</button></div>`, { title: titles[id] || id });
    sh.el.querySelector("[data-c]").onclick = sh.close;
  }
  draw();
}

/* =============================== ACTIVITY =============================== */
export async function activityTab(body, ctx) {
  const snap = await getDocs(query(collection(db, "sessionLogs"), orderBy("startedAt", "desc"), limit(60)));
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data(), start: toMillis(d.data().startedAt), end: toMillis(d.data().endedAt) }));
  await Promise.all([...new Set(rows.map((r) => r.uid))].map(nickOf));
  if (!ctx.alive()) return;
  const day = rows.filter((r) => Date.now() - r.start < 86400000);
  body.innerHTML = `<div class="stack-l"><div class="row" style="gap:12px">
      <div class="card tight grow center"><div class="price">${day.length}</div><div class="muted small">Visits, last 24h</div></div>
      <div class="card tight grow center"><div class="price">${new Set(day.map((r) => r.uid)).size}</div><div class="muted small">Students, last 24h</div></div>
      <div class="card tight grow center"><div class="price">${day.reduce((a, r) => a + (r.setReads || 0), 0)}</div><div class="muted small">Sets opened</div></div></div>
    ${rows.length ? `<div class="tablewrap"><table><thead><tr><th>Student</th><th>Started</th><th>Last active</th><th>Length</th><th>Finished</th><th>Sets opened</th></tr></thead><tbody>
      ${rows.map((r) => { const n = names.get(r.uid); return `<tr><td><span class="row">${avatar(n.nick, n.color, 28)}@${esc(n.nick)}</span></td><td>${fmtDateTime(r.start)}</td><td>${fmtDateTime(r.end)}</td>
        <td>${r.start && r.end ? fmtDur(Math.max(0, (r.end - r.start) / 1000)) : "—"}</td><td>${r.attempts || 0}</td><td>${r.setReads || 0}</td></tr>`; }).join("")}</tbody></table></div>`
      : '<div class="card center"><p class="muted">No visits logged yet.</p></div>'}
    <p class="small muted">Latest 60 visits. "Last active" is updated at most once every 45 seconds. Turn logging off in Settings if you need to save writes.</p>
    <div class="card stack-s"><h3 style="margin:0">Tidy up</h3><p class="small muted" style="margin:0">Deletes pop-up events older than 7 days and visit logs older than 30 days (up to 400 of each per tap). Do this now and then to keep the database small.</p>
      <button class="btn small" id="clean">Clear old logs and events</button></div></div>`;
  body.querySelector("#clean").onclick = async () => {
    const btn = body.querySelector("#clean"); btn.disabled = true;
    try {
      const [a, l] = await Promise.all([
        getDocs(query(collection(db, "activity"), where("createdAt", "<", Timestamp.fromMillis(Date.now() - 7 * 86400000)), limit(400))),
        getDocs(query(collection(db, "sessionLogs"), where("startedAt", "<", Timestamp.fromMillis(Date.now() - 30 * 86400000)), limit(400))),
      ]);
      const refs = [...a.docs.map((d) => d.ref || doc(db, "activity", d.id)), ...l.docs.map((d) => d.ref || doc(db, "sessionLogs", d.id))];
      for (let k = 0; k < refs.length; k += 400) { const b = writeBatch(db); refs.slice(k, k + 400).forEach((r) => b.delete(r)); await b.commit(); }   // a batch holds at most 500 writes
      toast(`Removed ${a.size} events and ${l.size} logs`, "good");
    } catch (e) { fail(e); }
    btn.disabled = false;
  };
}

/* ============================ TERMS RECORDS ============================= */
export async function termsTab(body, ctx) {
  let rows = [], label = "Latest 40 acceptances";
  async function load(snap) {
    rows = snap.docs.map((d) => ({ id: d.id, ...d.data(), at: toMillis(d.data().acceptedAt) }));
    await Promise.all([...new Set(rows.map((r) => r.uid))].map(nickOf));
  }
  await load(await getDocs(query(collection(db, "termsAcceptances"), orderBy("acceptedAt", "desc"), limit(40))));
  if (!ctx.alive()) return;

  function draw() {
    body.innerHTML = `<div class="stack-l"><div class="stack-s"><label>Find a student<input id="q" type="search" placeholder="Exact nickname, e.g. emeka_md"></label>
      <p class="small muted" style="margin:0">${esc(label)}. Tap Print, then choose "Save as PDF" in the print window.</p></div>
      ${rows.length ? `<div class="tablewrap"><table><thead><tr><th>Student</th><th>Version</th><th>Accepted</th><th>Fingerprint</th><th></th></tr></thead><tbody>
        ${rows.map((r) => { const n = names.get(r.uid) || { nick: r.uid.slice(0, 6), color: "" }; return `<tr><td><span class="row">${avatar(n.nick, n.color, 28)}@${esc(n.nick)}</span></td><td>v${esc(r.version)}</td><td>${fmtDateTime(r.at)}</td>
          <td><code>${esc(String(r.textHash).slice(0, 12))}</code></td><td><button class="btn small" data-p="${esc(r.id)}">Print</button></td></tr>`; }).join("")}</tbody></table></div>`
        : '<div class="card center"><p class="muted">No records found.</p></div>'}</div>`;
    body.querySelectorAll("[data-p]").forEach((b) => (b.onclick = () => print(rows.find((r) => r.id === b.dataset.p))));
    const input = body.querySelector("#q");
    input.onkeydown = async (e) => {
      if (e.key !== "Enter") return;
      const h = input.value.trim().toLowerCase().replace(/^@/, ""); if (!h) return;
      try {
        const n = await getDoc(doc(db, "nicknames", h));
        if (!n.exists()) { toast("No student with that nickname", "bad"); return; }
        await load(await getDocs(query(collection(db, "termsAcceptances"), where("uid", "==", n.data().uid))));
        label = `Records for @${h}`; draw();
      } catch (er) { fail(er); }
    };
  }

  async function print(r) {
    let u = {};
    try { const s = await getDoc(doc(db, "users", r.uid)); if (s.exists()) u = s.data(); } catch { /* print without the email */ }
    const n = names.get(r.uid) || { nick: r.uid };
    const sameVersion = Number(r.version) === TERMS_VERSION, match = sameVersion ? (await termsHash()) === r.textHash : null;
    const el = document.createElement("div"); el.className = "printarea";
    el.innerHTML = `<h1>SUMAS Quiz Arena: record of acceptance of terms</h1>
      <dl><dt>Nickname</dt><dd>@${esc(n.nick)}</dd><dt>Email</dt><dd>${esc(u.email || "not available")}</dd><dt>Age group</dt><dd>${esc(u.ageGroup || "not available")}</dd>
      <dt>User ID</dt><dd>${esc(r.uid)}</dd><dt>Terms version</dt><dd>${esc(r.version)}</dd><dt>Accepted at (server time)</dt><dd>${esc(new Date(r.at).toString())}</dd>
      <dt>SHA-256 of the text accepted</dt><dd>${esc(r.textHash)}</dd><dt>Record ID</dt><dd>${esc(r.id)}</dd>
      <dt>Check against this app's text</dt><dd>${match === null ? `This record is for version ${esc(r.version)}; this app build holds version ${TERMS_VERSION}. Keep a copy of the old terms file to verify it.` : match ? "The fingerprint matches the terms text below exactly." : "The fingerprint does NOT match the terms text below."}</dd></dl>
      ${sameVersion ? `<h2>Terms text (version ${TERMS_VERSION})</h2><pre>${esc(TERMS_TEXT)}</pre>` : ""}<p>Printed ${esc(new Date().toString())}</p>`;
    document.body.append(el);
    const cleanup = () => { el.remove(); window.removeEventListener("afterprint", cleanup); };
    window.addEventListener("afterprint", cleanup);
    window.print();
    setTimeout(() => { if (document.body.contains(el) && !matchMedia("print").matches) cleanup(); }, 60000);
  }
  draw();
}

/* ================================ BACKUP ================================ */
const GROUPS = [
  ["content", "Question content", "Banks, free tasters and every full set. The most important thing to back up.", ["banks", "tasters", "sets"], true],
  ["settings", "Settings", "Prices, bank details, general settings.", ["settings", "products"], true],
  ["students", "Students", "Profiles, private user records, subscriptions, nickname list.", ["profiles", "users", "subscriptions", "nicknames"], true],
  ["payments", "Payments", "The full payment history.", ["payments"], true],
  ["terms", "Terms records", "Proof of acceptance.", ["termsAcceptances"], true],
  ["events", "Tournaments and Hall of Fame", "Tournament details, questions, answer keys and winners.", ["tournaments", "tournamentQuestions", "tournamentKeys", "hallOfFame"], true],
  ["results", "Results and analysis", "Attempts (large), progress, set stats and question stats.", ["attempts", "progress", "setStats", "qStats", "leaderboard"], false],
];
const CAP = 3000;

export async function backupTab(body) {
  body.innerHTML = `<div class="stack-l"><section class="card stack"><h2>Download a backup</h2>
    <p class="muted small" style="margin:0">The free plan has no automatic backups. Download one weekly and keep it somewhere safe (Google Drive, your email). Each document costs one read of your daily 50,000, so tick only what you need.</p>
    ${GROUPS.map(([k, t, d, , on]) => `<label class="check"><input type="checkbox" data-g="${k}" ${on ? "checked" : ""}><span><strong>${t}</strong><span class="field-hint">${d}</span></span></label>`).join("")}
    <button class="btn primary" id="go">Download backup (JSON)</button><div id="out" role="status"></div></section>
    <section class="card stack"><h2>Restore from a backup</h2>
      <p class="muted small" style="margin:0">Puts content back after a mistake: question banks, sets, tasters, settings, products, subscriptions, analysis, tournaments and the Hall of Fame. Students' own records (profiles, payments, scores, nicknames, terms) can't be written by the admin under your security rules, so they are never restored. Students keep their own accounts.</p>
      <label>Backup file<input id="rf" type="file" accept=".json,application/json"></label><div id="rinfo" class="stack-s"></div></section>
    <p class="small muted">Backups include private data, so don't share the file.</p></div>`;
  body.querySelector("#rf").onchange = async (e) => {
    const f = e.target.files[0], info = body.querySelector("#rinfo"); if (!f) return;
    const r = readBackup(await f.text());
    if (!r.ok) { info.innerHTML = `<div class="notice bad small">${esc(r.error)}</div>`; return; }
    const have = RESTORABLE.filter((c) => r.counts[c]), skipped = Object.keys(r.counts).filter((c) => !RESTORABLE.includes(c) && r.counts[c]);
    if (!have.length) { info.innerHTML = '<div class="notice warn small">This backup has nothing the app can restore.</div>'; return; }
    info.innerHTML = `<p class="small" style="margin:0">Backup from <strong>${esc(r.exportedAt ? new Date(r.exportedAt).toLocaleString("en-NG") : "unknown date")}</strong>. Tick what to restore:</p>
      ${have.map((c) => `<label class="check"><input type="checkbox" data-rc="${c}" checked><span>${c} <span class="muted">(${r.counts[c]})</span></span></label>`).join("")}
      <label class="check"><input type="radio" name="rm" value="missing" checked><span><strong>Only add what is missing</strong><span class="field-hint">Safe. Reads each collection first (one read per document) and leaves everything that exists alone.</span></span></label>
      <label class="check"><input type="radio" name="rm" value="overwrite"><span><strong>Overwrite with the backup</strong><span class="field-hint">Replaces today's version with the backup's. Newer changes are lost.</span></span></label>
      ${skipped.length ? `<p class="small muted" style="margin:0">Not restorable here: ${esc(skipped.join(", "))}.</p>` : ""}
      <button class="btn primary" id="rgo">Restore</button><div id="rout" role="status"></div>`;
    info.querySelector("#rgo").onclick = async () => {
      const picked = have.filter((c) => info.querySelector(`[data-rc=${c}]`).checked), overwrite = info.querySelector("[name=rm]:checked").value === "overwrite";
      if (!picked.length) return toast("Tick something to restore", "bad");
      if (!(await confirmBox({ title: overwrite ? "Overwrite from backup?" : "Add missing items?", text: overwrite ? "This replaces current documents in the ticked collections with the backup's version." : "Only documents that don't exist today will be added.", okLabel: "Restore", danger: overwrite }))) return;
      const out = info.querySelector("#rout"), btn = info.querySelector("#rgo"); btn.disabled = true; let written = 0, skippedN = 0;
      try {
        for (const c of picked) {
          out.textContent = `Restoring ${c}...`;
          const keep = overwrite ? new Set() : new Set((await getDocs(query(collection(db, c), limit(CAP)))).docs.map((d) => d.id));
          const todo = Object.entries(r.data[c]).filter(([id]) => !keep.has(id)); skippedN += Object.keys(r.data[c]).length - todo.length;
          for (let i = 0; i < todo.length; i += 400) {
            const b = writeBatch(db);
            for (const [id, data] of todo.slice(i, i + 400)) b.set(doc(db, c, id), reviveTimestamps(data, Timestamp.fromMillis));
            await b.commit(); written += Math.min(400, todo.length - i);
          }
        }
        invalidateBanks(); await Promise.all(["banks", "products"].map((k) => cacheDel(k)));
        out.innerHTML = `<div class="notice warn">Restored ${written} document${written === 1 ? "" : "s"}${skippedN ? `; left ${skippedN} existing ones alone` : ""}. Reload the app to see everything.</div>`;
      } catch (er) { out.textContent = ""; fail(er); }
      btn.disabled = false;
    };
  };
  body.querySelector("#go").onclick = async () => {
    const picked = GROUPS.filter(([k]) => body.querySelector(`[data-g=${k}]`).checked);
    if (!picked.length) return toast("Tick something to back up", "bad");
    if (picked.some(([k]) => k === "results") && !(await confirmBox({ title: "Include results?", text: "Attempts can be thousands of documents and use a lot of your daily reads. Continue?", okLabel: "Continue" }))) return;
    const btn = body.querySelector("#go"), out = body.querySelector("#out"); btn.disabled = true;
    try {
      const data = {}; let count = 0, capped = [];
      for (const [, , , cols] of picked) for (const c of cols) {
        out.textContent = `Reading ${c}...`;
        const snap = await getDocs(query(collection(db, c), limit(CAP)));
        data[c] = Object.fromEntries(snap.docs.map((d) => [d.id, jsonSafe(d.data())]));
        count += snap.size; if (snap.size >= CAP) capped.push(c);
      }
      downloadText(`sumas-backup-${dayKey()}.json`, JSON.stringify({ app: "sumas-quiz-arena", exportedAt: new Date().toISOString(), counts: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, Object.keys(v).length])), data }, null, 1), "application/json");
      out.innerHTML = `<div class="notice warn">Saved ${count} documents (${count} reads).${capped.length ? ` <strong>${capped.join(", ")} hit the ${CAP} limit and may be incomplete.</strong>` : ""}</div>`;
    } catch (e) { out.textContent = ""; fail(e); }
    btn.disabled = false;
  };
}
