// Admin tools for Phase 3: tournaments (create, questions, publish, grade, Hall of Fame), Selar products, sponsor enquiries.
import {
  db, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, orderBy, limit, writeBatch, serverTimestamp, Timestamp,
} from "../firebase.js";
import { esc, fmtDateTime, toMillis, slug, naira, debounce, downloadText } from "../lib/util.js";
import { parseSet, SAMPLE_JSON, SAMPLE_CSV } from "../lib/parse.js";
import { tState, gradeEntries, hallRows, toLocalInput, fromLocalInput, isHttpsUrl } from "../lib/tournament.js";
import { avatar, badge, confirmBox, sheet, toast, copyText } from "../ui.js";
import { handleError } from "../net.js";
import { shareLink } from "../share.js";

const fail = (e) => { if (!handleError(e)) toast("That didn't work. Please try again.", "bad"); };
const names = new Map();
async function nickOf(uid) {
  if (names.has(uid)) return names.get(uid);
  let v = { nick: String(uid).slice(0, 6), color: "#64748B", known: false };
  try { const s = await getDoc(doc(db, "profiles", uid)); if (s.exists()) v = { nick: s.data().nickname, color: s.data().avatarColor, known: true }; } catch { /* fallback */ }
  names.set(uid, v); return v;
}
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/* ============================== TOURNAMENTS ============================== */
export async function tournamentsTab(body, ctx) {
  const snap = await getDocs(query(collection(db, "tournaments"), orderBy("startsAt", "desc"), limit(50)));
  if (!ctx.alive()) return;
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data(), startsAtMs: toMillis(d.data().startsAt), endsAtMs: toMillis(d.data().endsAt) }));
  const refresh = () => tournamentsTab(body, ctx);
  const label = (t) => { const s = tState(t); return s === "draft" ? badge("Draft") : s === "upcoming" ? badge("Published, not started", "gold") : s === "open" ? badge("Open", "green") : s === "closed" ? badge("Closed: needs grading", "red") : badge("Graded", "green"); };

  body.innerHTML = `<div class="stack-l"><div class="row between"><p class="muted" style="margin:0">${list.length} tournament${list.length === 1 ? "" : "s"}</p><button class="btn primary small" id="new">New tournament</button></div>
    ${list.length ? list.map((t) => { const s = tState(t); return `<section class="card stack-s" data-t="${esc(t.id)}">
      <div class="row between wrap"><div><h2 style="margin:0">${esc(t.title)}</h2><p class="muted small" style="margin:0">${esc(t.sponsorName || "No sponsor")} · ${t.count || 0} questions · top ${t.winnerCount || 3} win</p>
        <p class="muted small" style="margin:0">${fmtDateTime(t.startsAtMs)} to ${fmtDateTime(t.endsAtMs)}</p></div>${label(t)}</div>
      <div class="row wrap" style="gap:8px"><button class="btn small" data-a="edit">Edit</button><button class="btn small" data-a="questions">${t.count ? "Replace questions" : "Add questions"}</button>
        ${s === "draft" ? '<button class="btn small primary" data-a="publish">Publish</button>' : s === "upcoming" ? '<button class="btn small" data-a="unpublish">Unpublish</button>' : ""}
        ${["closed", "graded"].includes(s) ? `<button class="btn small ${s === "closed" ? "primary" : ""}" data-a="grade">${s === "graded" ? "Re-grade" : "Grade now"}</button>` : ""}
        ${s === "graded" ? '<button class="btn small gold" data-a="hall">Hall of Fame</button>' : ""}
        ${s !== "draft" ? '<button class="btn small" data-a="share">Share link</button>' : ""}
        ${s === "draft" ? '<button class="btn small danger" data-a="delete">Delete</button>' : ""}</div></section>`; }).join("")
      : '<div class="card center"><p class="muted">No tournaments yet. Create one, add questions, then publish.</p></div>'}
    <p class="small muted">Students see a tournament once it is published. Questions open to them at the start time. After it closes, tap "Grade now" to score everyone and publish results.</p></div>`;
  body.querySelector("#new").onclick = () => form(null);
  body.querySelectorAll("[data-t]").forEach((sec) => {
    const t = list.find((x) => x.id === sec.dataset.t);
    sec.querySelectorAll("[data-a]").forEach((b) => (b.onclick = () => ({ edit: () => form(t), questions: () => questions(t), publish: () => setStatus(t, "published"), unpublish: () => setStatus(t, "draft"), grade: () => grade(t), hall: () => hall(t), delete: () => remove(t), share: () => shareLink({ title: t.title, text: `🏆 "${t.title}" is on SUMAS Quiz Arena${t.prizeText && t.prizeText.toLowerCase() !== "none" ? ` with a prize: ${t.prizeText}` : ""}. Opens ${fmtDateTime(t.startsAtMs)}. Tap the link, log in and play:`, path: `/tournament/${t.id}` }) }[b.dataset.a]())));
  });

  function form(t) {
    const now = Date.now();
    const s = sheet(`<div class="stack"><label>Title<input id="ti" maxlength="80" value="${esc(t?.title || "")}" placeholder="e.g. December Pharmacology Cup"></label>
      <label>Sponsor name<input id="sp" maxlength="80" value="${esc(t?.sponsorName || "")}" placeholder="e.g. Acme Pharmacy"></label>
      <label>Prize<input id="pr" maxlength="120" value="${esc(t?.prizeText || "")}" placeholder="e.g. N20,000 cash for 1st place"></label>
      <label>About<textarea id="de" maxlength="600" style="min-height:90px;font-family:var(--font);font-size:1rem">${esc(t?.description || "")}</textarea></label>
      <label>Opens<input id="st" type="datetime-local" value="${toLocalInput(t?.startsAtMs || now)}"><span class="field-hint">New tournaments open right now by default. Change this to schedule a later start.</span></label>
      <button type="button" class="btn small ghost" id="nowbtn" style="align-self:flex-start">Open right now</button>
      <label>Closes<input id="en" type="datetime-local" value="${toLocalInput(t?.endsAtMs || now + 3 * 86400000)}"></label>
      <label>Number of winners<input id="wc" type="number" min="1" max="10" value="${t?.winnerCount || 3}"><span class="field-hint">How many top prize-mode players count as winners.</span></label>
      <div class="row" style="justify-content:flex-end"><button class="btn ghost" data-c>Cancel</button><button class="btn primary" id="save">Save</button></div></div>`, { title: t ? "Edit tournament" : "New tournament" });
    const $ = (x) => s.el.querySelector(x); $("[data-c]").onclick = s.close;
    $("#nowbtn").onclick = () => { $("#st").value = toLocalInput(Date.now()); toast("Opens right now", "good"); };
    $("#save").onclick = async () => {
      const title = $("#ti").value.trim(), st = fromLocalInput($("#st").value), en = fromLocalInput($("#en").value);
      if (!title) return toast("Please enter a title", "bad");
      if (!st || !en || en <= st) return toast("The closing time must be after the opening time", "bad");
      const data = { title, sponsorName: $("#sp").value.trim(), prizeText: $("#pr").value.trim(), description: $("#de").value.trim(), startsAt: Timestamp.fromMillis(st), endsAt: Timestamp.fromMillis(en),
        winnerCount: Math.max(1, Math.min(10, Number($("#wc").value) || 3)), updatedAt: serverTimestamp() };
      try {
        if (t) await updateDoc(doc(db, "tournaments", t.id), data);
        else { let id = slug(title) || "tournament"; if (list.some((x) => x.id === id)) id += "-" + Math.random().toString(36).slice(2, 5); await setDoc(doc(db, "tournaments", id), { ...data, status: "draft", count: 0, createdAt: serverTimestamp() }); }
        s.close(); toast("Saved", "good"); refresh();
      } catch (e) { fail(e); }
    };
  }

  async function setStatus(t, status) {
    if (status === "published" && !t.count) return toast("Add the questions first", "bad");
    if (status === "published" && !(await confirmBox({ title: "Publish this tournament?", text: "Students will see it straight away. Questions open to them at the start time.", okLabel: "Publish" }))) return;
    try { await updateDoc(doc(db, "tournaments", t.id), { status, updatedAt: serverTimestamp() }); toast(status === "published" ? "Published" : "Moved back to draft", "good"); refresh(); } catch (e) { fail(e); }
  }

  async function remove(t) {
    if (!(await confirmBox({ title: "Delete this draft?", text: `"${t.title}" and its questions will be removed.`, okLabel: "Delete", danger: true }))) return;
    try { const b = writeBatch(db); b.delete(doc(db, "tournaments", t.id)); b.delete(doc(db, "tournamentQuestions", t.id)); b.delete(doc(db, "tournamentKeys", t.id)); await b.commit(); toast("Deleted"); refresh(); } catch (e) { fail(e); }
  }

  function questions(t) {
    let parsed = null;
    const s = sheet(`<div class="stack">
      ${tState(t) === "open" || tState(t) === "closed" ? '<div class="notice bad small">This tournament has already started. Changing the questions now is unfair to people who have entered.</div>' : ""}
      <label>File (CSV or JSON)<input id="file" type="file" accept=".csv,.json,text/csv,application/json"></label>
      <label>...or paste it here<textarea id="paste" spellcheck="false" placeholder="question,A,B,C,D,answer,topic,explanation"></textarea></label>
      <p class="small muted" style="margin:0">Same format as question sets. Templates: <button class="linkbtn" id="tj">JSON</button> · <button class="linkbtn" id="tc">CSV</button></p>
      <div id="prev"></div><div class="row" style="justify-content:flex-end"><button class="btn ghost" data-c>Cancel</button><button class="btn primary" id="pub" disabled>Save questions</button></div></div>`, { title: `Questions: ${t.title}` });
    const $ = (x) => s.el.querySelector(x); $("[data-c]").onclick = s.close;
    $("#tj").onclick = () => downloadText("sumas-tournament-template.json", SAMPLE_JSON, "application/json");
    $("#tc").onclick = () => downloadText("sumas-tournament-template.csv", SAMPLE_CSV, "text/csv");
    const check = () => {
      const text = $("#paste").value.trim();
      if (!text) { $("#prev").innerHTML = ""; $("#pub").disabled = true; return; }
      parsed = parseSet(text);
      const warnings = parsed.warnings.filter((w) => !/The plan is 50 to 200/.test(w));
      $("#prev").innerHTML = `<div class="notice ${parsed.errors.length ? "bad" : "warn"} stack-s"><strong>${parsed.questions.length} questions</strong>${parsed.bytes ? ` · ${(parsed.bytes / 1024).toFixed(0)} KB` : ""}
        ${parsed.errors.length ? `<div class="small" style="color:var(--danger)"><strong>Fix these first:</strong><ul style="margin:4px 0 0;padding-left:18px">${parsed.errors.slice(0, 8).map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>` : ""}
        ${warnings.length ? `<div class="small"><strong>Heads up:</strong> ${esc(warnings[0])}${warnings.length > 1 ? ` (and ${warnings.length - 1} more)` : ""}</div>` : ""}</div>`;
      $("#pub").disabled = !!parsed.errors.length || !parsed.questions.length;
    };
    $("#paste").addEventListener("input", debounce(check, 300));
    $("#file").onchange = async (e) => { const f = e.target.files[0]; if (f) { $("#paste").value = await f.text(); check(); } };
    $("#pub").onclick = async () => {
      if ((tState(t) === "open" || tState(t) === "closed") && !(await confirmBox({ title: "Change questions mid-tournament?", text: "People may already have entered. Only do this to fix an error.", okLabel: "Change anyway", danger: true }))) return;
      $("#pub").disabled = true;
      try {
        const b = writeBatch(db);
        b.set(doc(db, "tournamentQuestions", t.id), { questions: parsed.questions, updatedAt: serverTimestamp() });
        b.set(doc(db, "tournamentKeys", t.id), { answers: parsed.answers, updatedAt: serverTimestamp() });
        b.update(doc(db, "tournaments", t.id), { count: parsed.questions.length, updatedAt: serverTimestamp() });
        await b.commit(); s.close(); toast("Questions saved", "good"); refresh();
      } catch (e) { $("#pub").disabled = false; fail(e); }
    };
  }

  async function grade(t) {
    if (Date.now() < t.endsAtMs) return toast("You can grade after the tournament closes", "bad");
    if (!(await confirmBox({ title: t.status === "graded" ? "Grade again?" : "Grade this tournament?", text: "This scores every entry, publishes each student's result and the standings. It reads one document per entry.", okLabel: "Grade" }))) return;
    toast("Grading...");
    try {
      const keyS = await getDoc(doc(db, "tournamentKeys", t.id));
      if (!keyS.exists()) throw new Error("no key");
      const eSnap = await getDocs(query(collection(db, "tournaments", t.id, "entries"), limit(2000)));
      const entries = eSnap.docs.map((d) => ({ uid: d.id, ...d.data(), submittedAt: toMillis(d.data().submittedAt) }));
      const g = gradeEntries(entries, keyS.data().answers);
      const topOf = async (rows) => Promise.all(rows.slice(0, 20).map(async (r) => { const n = await nickOf(r.uid); return { uid: r.uid, nick: n.nick, color: n.color, score: r.score, total: r.total, rank: r.rank }; }));
      const [topPrize, topFun] = await Promise.all([topOf(g.byMode.prize), topOf(g.byMode.fun)]);
      for (const part of chunk(g.results, 400)) {
        const b = writeBatch(db);
        for (const r of part) b.set(doc(db, "tournaments", t.id, "results", r.uid), { mode: r.mode, score: r.score, total: r.total, rank: r.rank, of: r.of, winner: r.mode === "prize" && r.rank <= (t.winnerCount || 3), gradedAt: serverTimestamp() });
        await b.commit();
      }
      const b = writeBatch(db);
      b.set(doc(db, "tournaments", t.id, "results", "top"), { prize: topPrize, fun: topFun, gradedAt: serverTimestamp() });
      b.update(doc(db, "tournaments", t.id), { status: "graded", gradedAt: serverTimestamp(), entryCount: entries.length, prizeEntries: g.byMode.prize.length });
      await b.commit();
      const winners = topPrize.slice(0, t.winnerCount || 3);
      const sh = sheet(`<div class="stack"><p style="margin:0"><strong>${entries.length}</strong> entries graded (${g.byMode.prize.length} prize mode, ${g.byMode.fun.length} fun mode).${eSnap.size >= 2000 ? " <strong>The 2000-entry limit was reached.</strong>" : ""}</p>
        <h3 style="margin:0">Prize winners</h3>${winners.length ? `<div class="list">${winners.map((w) => `<div class="item"><strong>${w.rank}</strong>${avatar(w.nick, w.color, 32)}<div class="grow">@${esc(w.nick)}</div><strong>${w.score}/${w.total}</strong></div>`).join("")}</div>` : '<p class="muted small" style="margin:0">No prize-mode entries.</p>'}
        <p class="small muted" style="margin:0">Winners message you on WhatsApp to claim. Ask for their full name and phone number only then. Use "Hall of Fame" to publish the winners once the sponsor agrees.</p>
        <button class="btn block" data-c>Close</button></div>`, { title: "Graded" });
      sh.el.querySelector("[data-c]").onclick = sh.close; refresh();
    } catch (e) { fail(e); }
  }

  async function hall(t) {
    try {
      const top = await getDoc(doc(db, "tournaments", t.id, "results", "top"));
      const prize = top.exists() ? top.data().prize : [];
      const nicks = Object.fromEntries(prize.map((r) => [r.uid, r.nick]));
      const rows = hallRows({ ...t, id: t.id }, prize, nicks, t.winnerCount || 3);
      if (!rows.length) return toast("No prize-mode winners to publish", "bad");
      const s = sheet(`<div class="stack"><p class="small muted" style="margin:0">Publishing shows these nicknames and scores to everyone in the Hall of Fame. Only do this if the sponsor and the winners are happy for it.</p>
        <div class="list">${rows.map((r) => `<div class="item"><strong>${r.place}</strong><div class="grow">@${esc(r.nick)}</div><strong>${r.score}/${r.total}</strong></div>`).join("")}</div>
        <div class="row wrap" style="justify-content:space-between"><button class="btn danger" id="un">Remove from Hall</button><span class="row"><button class="btn ghost" data-c>Cancel</button><button class="btn gold" id="go">Publish</button></span></div></div>`, { title: "Hall of Fame" });
      s.el.querySelector("[data-c]").onclick = s.close;
      s.el.querySelector("#go").onclick = async () => {
        try { const b = writeBatch(db); rows.forEach((r) => b.set(doc(db, "hallOfFame", `${t.id}_${r.place}`), { ...r, at: serverTimestamp() })); await b.commit(); s.close(); toast("Published to the Hall of Fame", "good"); } catch (e) { fail(e); }
      };
      s.el.querySelector("#un").onclick = async () => {
        try { const b = writeBatch(db); for (let p = 1; p <= 10; p++) b.delete(doc(db, "hallOfFame", `${t.id}_${p}`)); await b.commit(); s.close(); toast("Removed"); } catch (e) { fail(e); }
      };
    } catch (e) { fail(e); }
  }
}

/* ================================ PRODUCTS ================================ */
export async function productsTab(body, ctx) {
  const snap = await getDocs(collection(db, "products"));
  if (!ctx.alive()) return;
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || String(a.title).localeCompare(String(b.title)));
  const refresh = async () => { const { cacheDel } = await import("../cache.js"); await cacheDel("products"); productsTab(body, ctx); };
  body.innerHTML = `<div class="stack-l"><div class="row between"><p class="muted" style="margin:0">${rows.length} product${rows.length === 1 ? "" : "s"}</p><button class="btn primary small" id="new">Add product</button></div>
    ${rows.length ? `<div class="list">${rows.map((p) => `<button class="item" data-p="${esc(p.id)}"><div class="grow"><strong>${esc(p.title)}</strong><div class="meta">${esc(p.type || "other")} · ${p.price > 0 ? naira(p.price) : "Free"}${p.active === false ? " · hidden" : ""}</div></div>${p.active === false ? badge("Hidden") : badge("Live", "green")}</button>`).join("")}</div>`
      : '<div class="card center"><p class="muted">No products yet. Create the product on Selar first, then paste its link here.</p></div>'}</div>`;
  body.querySelector("#new").onclick = () => form(null);
  body.querySelectorAll("[data-p]").forEach((b) => (b.onclick = () => form(rows.find((r) => r.id === b.dataset.p))));
  function form(p) {
    const s = sheet(`<div class="stack"><label>Title<input id="t" maxlength="80" value="${esc(p?.title || "")}"></label>
      <label>Type<select id="ty">${[["notes", "Notes"], ["summary", "Summary"], ["other", "Other"]].map(([v, l]) => `<option value="${v}" ${p?.type === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label>Price in naira (0 = free)<input id="pr" type="number" min="0" inputmode="numeric" value="${p?.price ?? 0}"></label>
      <label>Selar link<input id="u" type="url" inputmode="url" value="${esc(p?.selarUrl || "")}" placeholder="https://selar.co/..."></label>
      <label>Description<textarea id="d" maxlength="400" style="min-height:90px;font-family:var(--font);font-size:1rem">${esc(p?.description || "")}</textarea></label>
      <label>Order (small numbers first)<input id="o" type="number" value="${p?.order ?? 10}"></label>
      <label class="check"><input type="checkbox" id="a" ${p?.active === false ? "" : "checked"}><span class="small">Show to students</span></label>
      <div class="row wrap" style="justify-content:space-between"><button class="btn danger" id="del" ${p ? "" : "disabled"}>Delete</button><span class="row"><button class="btn ghost" data-c>Cancel</button><button class="btn primary" id="save">Save</button></span></div></div>`, { title: p ? "Edit product" : "Add product" });
    const $ = (x) => s.el.querySelector(x); $("[data-c]").onclick = s.close;
    $("#save").onclick = async () => {
      const title = $("#t").value.trim(), url = $("#u").value.trim();
      if (!title) return toast("Please enter a title", "bad");
      if (!isHttpsUrl(url)) return toast("The Selar link must start with https://", "bad");
      const data = { title, type: $("#ty").value, price: Math.max(0, Number($("#pr").value) || 0), selarUrl: url, description: $("#d").value.trim(), order: Number($("#o").value) || 0, active: $("#a").checked, updatedAt: serverTimestamp() };
      try { await setDoc(doc(db, "products", p?.id || (slug(title) || "item") + "-" + Math.random().toString(36).slice(2, 5)), data, { merge: true }); s.close(); toast("Saved", "good"); refresh(); } catch (e) { fail(e); }
    };
    $("#del").onclick = async () => {
      if (!(await confirmBox({ title: "Delete this product?", text: "It disappears from the app. Your Selar listing is not touched.", okLabel: "Delete", danger: true }))) return;
      try { await deleteDoc(doc(db, "products", p.id)); s.close(); refresh(); } catch (e) { fail(e); }
    };
  }
}

/* ================================ SPONSORS ================================ */
export async function sponsorsTab(body, ctx) {
  const snap = await getDocs(query(collection(db, "sponsorRequests"), orderBy("createdAt", "desc"), limit(50)));
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data(), at: toMillis(d.data().createdAt) }));
  await Promise.all([...new Set(rows.map((r) => r.uid))].map(nickOf));
  if (!ctx.alive()) return;
  let showDone = false;
  function draw() {
    const shown = rows.filter((r) => showDone || !r.done);
    body.innerHTML = `<div class="stack-l"><div class="row between"><p class="muted" style="margin:0">${rows.filter((r) => !r.done).length} open</p>
      <label class="check" style="font-size:.85rem"><input type="checkbox" id="sd" ${showDone ? "checked" : ""}><span>Show handled</span></label></div>
      ${shown.length ? shown.map((r) => { const n = names.get(r.uid) || { nick: r.uid.slice(0, 6), color: "" }; return `<article class="card stack-s">
        <div class="row between wrap"><div><strong>${esc(r.orgName)}</strong><div class="small muted">from @${esc(n.nick)} · ${fmtDateTime(r.at)}</div></div>${r.done ? badge("Handled", "green") : badge("New", "gold")}</div>
        <div class="row" style="gap:8px"><span class="small"><strong>Contact:</strong> ${esc(r.contact)}</span><button class="linkbtn small" data-copy="${esc(r.contact)}">Copy</button></div>
        ${r.message ? `<p class="small" style="margin:0;white-space:pre-wrap">${esc(r.message)}</p>` : ""}
        <p class="small muted" style="margin:0">${r.wantsRecognition ? "Happy to be named publicly." : "Prefers not to be named."}</p>
        <div class="row wrap"><button class="btn small ${r.done ? "" : "primary"}" data-done="${esc(r.id)}">${r.done ? "Mark as new" : "Mark handled"}</button><button class="btn small danger" data-del="${esc(r.id)}">Delete</button></div></article>`; }).join("")
        : '<div class="card center"><p class="muted">No enquiries.</p></div>'}</div>`;
    body.querySelector("#sd").onchange = (e) => { showDone = e.target.checked; draw(); };
    body.querySelectorAll("[data-copy]").forEach((b) => (b.onclick = () => copyText(b.dataset.copy)));
    body.querySelectorAll("[data-done]").forEach((b) => (b.onclick = async () => { const r = rows.find((x) => x.id === b.dataset.done); try { await updateDoc(doc(db, "sponsorRequests", r.id), { done: !r.done }); r.done = !r.done; draw(); } catch (e) { fail(e); } }));
    body.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
      if (!(await confirmBox({ title: "Delete this enquiry?", text: "This can't be undone.", okLabel: "Delete", danger: true }))) return;
      try { await deleteDoc(doc(db, "sponsorRequests", b.dataset.del)); rows.splice(rows.findIndex((x) => x.id === b.dataset.del), 1); draw(); } catch (e) { fail(e); }
    }));
  }
  draw();
}
