// Admin panel (role-protected by the admins/{uid} document and by the Firestore rules).
// Tabs: payments queue, users, banks and sets (upload, taster), settings.
import {
  db, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, orderBy, limit,
  where, writeBatch, serverTimestamp, Timestamp,
} from "../firebase.js";
import { state, freeCount } from "../state.js";
import { PLANS, PLAN_KEYS, priceOf, extendedExpiry, paymentCode, COMP_EXPIRY } from "../lib/plans.js";
import { isHttpsUrl } from "../lib/tournament.js";
import { manualAddSheet } from "./admin-manual.js";
import { parseSet, SAMPLE_JSON, SAMPLE_CSV, BLANK_CSV, addLog, setToRows, SET_CSV_HEAD } from "../lib/parse.js";
import { fx } from "../lib/symbols.js";
import { exportSet, setLocked, questionsSheet, convertExisting, logHTML, topicSummary, fetchSet } from "./admin-sets.js";
import { ls, esc, naira, fmtDate, fmtDateTime, toMillis, dayKey, slug, debounce, downloadText, toCSV, csvEscape } from "../lib/util.js";
import { avatar, badge, confirmBox, typedConfirm, sheet, skeleton, toast, copyText } from "../ui.js";
import { handleError } from "../net.js";
import { invalidateBanks } from "../data.js";
import { cacheDel } from "../cache.js";

const TABS = [["payments", "Payments"], ["users", "Users"], ["banks", "Banks & sets"], ["images", "Images"], ["avatars", "Pictures"], ["quotes", "Quotes"], ["analyse", "Analysis"], ["activity", "Activity"], ["terms", "Terms"], ["backup", "Backup"], ["lobbies", "Matches"], ["tournaments", "Tournaments"], ["products", "Products"], ["sponsors", "Sponsors"], ["settings", "Settings"]];

export default async function admin(ctx) {
  const tab = TABS.some(([k]) => k === ctx.params.tab) ? ctx.params.tab : "payments";
  ctx.view.innerHTML = `<div class="stack-l"><section id="ffa"></section><nav class="tabs" aria-label="Admin sections">${TABS.map(([k, l]) => `<a href="#/admin/${k}" ${k === tab ? 'aria-current="page"' : ""}>${l}</a>`).join("")}</nav>
    <div id="body">${skeleton(3)}</div></div>`;
  const body = ctx.view.querySelector("#body");
  freeForAllCard(ctx.view.querySelector("#ffa"), ctx);
  try { await ({ payments: paymentsTab, users: usersTab, banks: banksTab, images: async (b, c) => (await import("./admin-images.js")).default(b, c), avatars: async (b, c) => (await import("./admin-avatars.js")).default(b, c), quotes: async (b, c) => (await import("./admin-quotes.js")).default(b, c),
    analyse: async (b, c) => (await import("./admin-tools.js")).analyseTab(b, c), activity: async (b, c) => (await import("./admin-tools.js")).activityTab(b, c),
    lobbies: async (b, c) => (await import("./admin-lobbies.js")).lobbiesTab(b, c),
    tournaments: async (b, c) => (await import("./admin-phase3.js")).tournamentsTab(b, c), products: async (b, c) => (await import("./admin-phase3.js")).productsTab(b, c), sponsors: async (b, c) => (await import("./admin-phase3.js")).sponsorsTab(b, c),
    terms: async (b, c) => (await import("./admin-tools.js")).termsTab(b, c), backup: async (b, c) => (await import("./admin-tools.js")).backupTab(b, c), settings: settingsTab }[tab])(body, ctx); }
  catch (e) {
    console.error(e);
    if (!ctx.alive()) return;
    body.innerHTML = '<div class="card center stack"><p class="muted">Couldn\'t load this section.</p><button class="btn" id="r">Try again</button></div>';
    body.querySelector("#r").onclick = () => admin(ctx);
    handleError(e, { retry: () => admin(ctx) });
  }
}

/** The "Free for everyone" switch, shown above every admin tab. Writes settings/app.freeForAll; students pick it up the next time they open the app. */
async function freeForAllCard(box, ctx) {
  const set = (on) => { state.settings = { ...state.settings, freeForAll: on }; ls("settings_app", state.settings); };
  try { const s = await getDoc(doc(db, "settings", "app")); if (s.exists()) set(s.data().freeForAll === true); } catch { /* use what we have */ }
  if (!ctx.alive()) return;
  const draw = () => {
    const on = state.settings?.freeForAll === true;
    box.innerHTML = `<div class="card ${on ? "accent" : ""} stack-s"><div class="row between wrap" style="gap:10px"><div class="grow"><strong>Free for everyone: ${on ? "ON" : "OFF"}</strong>
      <div class="small muted">${on ? "Every signed-in student currently has full access (all sets, ranks, leaderboard, group matches)." : "Only subscribers have full access. Everyone else sees the tasters."}</div></div>
      <button class="btn ${on ? "danger" : "primary"} small" id="ffbtn">${on ? "Turn off" : "Make free for all"}</button></div></div>`;
    box.querySelector("#ffbtn").onclick = async () => {
      const turningOn = !on;
      if (!(await confirmBox({ title: turningOn ? "Make the app free for everyone?" : "Turn off free access?",
        text: turningOn ? "Every signed-in student gets full access: all sets, ranks, the leaderboard and group matches. Subscriptions are not affected and stay as they are. Students see the change the next time they open or reload the app. You can switch it off at any time."
          : "Only subscribers will have full access again. Students see the change the next time they open or reload the app. Scores and ranks already earned are kept.", okLabel: turningOn ? "Make it free" : "Turn off", danger: !turningOn }))) return;
      const b = box.querySelector("#ffbtn"); b.disabled = true;
      try {
        await setDoc(doc(db, "settings", "app"), { freeForAll: turningOn, freeForAllAt: serverTimestamp() }, { merge: true });
        set(turningOn); toast(turningOn ? "The app is now free for everyone" : "Free access is off", "good");
      } catch (e) { fail(e); }
      draw();
    };
  };
  draw();
}

const fail = (e) => { if (!handleError(e)) toast("That didn't work. Please try again.", "bad"); };

/* =============================== PAYMENTS =============================== */
const nameCache = new Map();
async function nickOf(uid) {
  if (nameCache.has(uid)) return nameCache.get(uid);
  let v = { nick: uid.slice(0, 6), color: "#64748B" };
  try { const s = await getDoc(doc(db, "profiles", uid)); if (s.exists()) v = { nick: s.data().nickname, color: s.data().avatarColor }; } catch { /* keep fallback */ }
  nameCache.set(uid, v); return v;
}

async function paymentsTab(body, ctx) {
  const snap = await getDocs(query(collection(db, "payments"), orderBy("createdAt", "desc"), limit(150)));
  if (!ctx.alive()) return;
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data(), at: toMillis(d.data().createdAt) }));
  let filter = "open";
  const dupCount = () => { const m = {}; rows.forEach((r) => { const k = String(r.reference).trim().toLowerCase(); m[k] = (m[k] || 0) + 1; }); return m; };
  const FILTERS = { open: ["Needs review", (r) => r.status === "pending" || r.status === "reviewing"], approved: ["Approved", (r) => r.status === "approved"], rejected: ["Rejected", (r) => r.status === "rejected"], all: ["All", () => true] };

  async function draw() {
    const shown = rows.filter(FILTERS[filter][1]);
    await Promise.all([...new Set(shown.map((r) => r.uid))].map(nickOf));
    if (!ctx.alive()) return;
    const dups = dupCount();
    body.innerHTML = `<div class="stack">
      <div class="chips" role="group" aria-label="Filter">${Object.entries(FILTERS).map(([k, [l, fn]]) => `<button class="chip" data-f="${k}" aria-pressed="${k === filter}">${l} (${rows.filter(fn).length})</button>`).join("")}</div>
      ${shown.length ? `<div class="tablewrap"><table><thead><tr><th>Student</th><th>Plan</th><th>Amount</th><th>Reference</th><th>Paid on</th><th>Submitted</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        ${shown.map((r) => {
          const n = nameOf(r.uid), expected = priceOf(state.plans, r.plan), dup = dups[String(r.reference).trim().toLowerCase()] > 1;
          return `<tr><td><span class="row">${avatar(n.nick, n.color, 28)}<span>@${esc(n.nick)}<br><span class="muted small">${esc(paymentCode(r.uid))}</span></span></span></td>
            <td>${esc(PLANS[r.plan]?.label || r.plan)}</td>
            <td>${naira(r.amount)}${expected && expected !== r.amount ? ` <span class="badge red" title="Expected ${naira(expected)}">≠ ${naira(expected)}</span>` : ""}</td>
            <td>${esc(r.reference)}${dup ? ' <span class="badge red">Duplicate</span>' : ""}${r.receiptUrl ? (isHttpsUrl(r.receiptUrl) ? ` <a href="${esc(r.receiptUrl)}" target="_blank" rel="noopener" class="small">receipt</a>` : " <span class=\"muted small\">(invalid receipt link)</span>") : ""}</td>
            <td>${esc(r.paidOn || "")}</td><td>${fmtDateTime(r.at)}</td>
            <td>${badge(r.status === "reviewing" ? "Under review" : r.status, r.status === "approved" ? "green" : r.status === "rejected" ? "red" : "gold")}</td>
            <td><span class="row">${r.status === "pending" ? `<button class="btn small" data-a="review" data-id="${r.id}">Review</button>` : ""}
              ${r.status !== "approved" ? `<button class="btn small primary" data-a="approve" data-id="${r.id}">Approve</button>` : ""}
              ${r.status !== "rejected" && r.status !== "approved" ? `<button class="btn small danger" data-a="reject" data-id="${r.id}">Reject</button>` : ""}</span></td></tr>`;
        }).join("")}</tbody></table></div>` : '<div class="card center"><p class="muted">Nothing here.</p></div>'}
      <p class="small muted">Showing the latest 150 payments. Approving adds time on top of any remaining subscription.</p></div>`;
    body.querySelectorAll("[data-f]").forEach((b) => (b.onclick = () => { filter = b.dataset.f; draw(); }));
    body.querySelectorAll("[data-a]").forEach((b) => (b.onclick = () => act(b.dataset.a, rows.find((r) => r.id === b.dataset.id), b)));
  }
  const nameOf = (uid) => nameCache.get(uid) || { nick: uid.slice(0, 6), color: "#64748B" };

  async function act(kind, p, btn) {
    btn.disabled = true;
    try {
      if (kind === "review") { await updateDoc(doc(db, "payments", p.id), { status: "reviewing" }); p.status = "reviewing"; }
      else if (kind === "reject") {
        if (!(await confirmBox({ title: "Reject this payment?", text: `The student will see it as not approved and can contact you on WhatsApp.`, okLabel: "Reject", danger: true }))) { btn.disabled = false; return; }
        await updateDoc(doc(db, "payments", p.id), { status: "rejected", reviewedAt: serverTimestamp() }); p.status = "rejected";
      } else {
        const subRef = doc(db, "subscriptions", p.uid), cur = await getDoc(subRef);
        const isCompNow = cur.exists() && cur.data().plan === "comp";   // a complimentary plan runs to 2099: never stack on top of it
        const exp = extendedExpiry(cur.exists() && !isCompNow ? toMillis(cur.data().expiresAt) : 0, Date.now(), p.plan);
        const n = nameOf(p.uid);
        if (!(await confirmBox({ title: `Approve ${naira(p.amount)} for @${n.nick}?`, text: `${PLANS[p.plan]?.label || p.plan} plan. Access will run until ${fmtDate(exp)}${cur.exists() && !isCompNow ? " (added to their remaining time)" : isCompNow ? " (replaces their complimentary access)" : ""}.`, okLabel: "Approve" }))) { btn.disabled = false; return; }
        const b = writeBatch(db);
        b.update(doc(db, "payments", p.id), { status: "approved", reviewedAt: serverTimestamp() });
        b.set(subRef, { plan: p.plan, expiresAt: Timestamp.fromMillis(exp), updatedAt: serverTimestamp() });
        await b.commit(); p.status = "approved"; toast(`Approved. Access until ${fmtDate(exp)}`, "good");
      }
    } catch (e) { fail(e); }
    draw();
  }
  await draw();
}

/* ================================ USERS ================================= */
async function usersTab(body, ctx) {
  const [pS, uS, sS] = await Promise.all(["profiles", "users", "subscriptions"].map((c) => getDocs(query(collection(db, c), limit(500)))));
  if (!ctx.alive()) return;
  const users = new Map(uS.docs.map((d) => [d.id, d.data()])), subs = new Map(sS.docs.map((d) => [d.id, d.data()]));
  const rows = pS.docs.map((d) => {
    const p = d.data(), u = users.get(d.id) || {}, s = subs.get(d.id), exp = s ? toMillis(s.expiresAt) : null;
    return { uid: d.id, nick: p.nickname, color: p.avatarColor, email: u.email || "", age: u.ageGroup || "", plan: s?.plan || "", exp, active: !!exp && exp > Date.now(), last: toMillis(u.lastLogin), created: toMillis(p.createdAt) };
  }).sort((a, b) => (b.last || 0) - (a.last || 0));
  let q = "";

  function draw() {
    const shown = rows.filter((r) => !q || `${r.nick} ${r.email}`.toLowerCase().includes(q));
    const active = rows.filter((r) => r.active).length;
    body.innerHTML = `<div class="stack"><div class="row wrap between"><p class="muted" style="margin:0">${rows.length} students · ${active} subscribed</p>
      <button class="btn small" id="csv">Export CSV</button></div>
      <input id="q" type="search" placeholder="Search nickname or email" value="${esc(q)}" aria-label="Search students">
      <div class="tablewrap"><table><thead><tr><th>Student</th><th>Email</th><th>Subscription</th><th>Expires</th><th>Last login</th><th></th></tr></thead><tbody>
      ${shown.map((r) => `<tr><td><span class="row">${avatar(r.nick, r.color, 28)}@${esc(r.nick)}${r.age === "minor" ? ' <span class="badge">under 18</span>' : ""}</span></td>
        <td>${esc(r.email)}</td><td>${r.plan === "comp" ? badge("Complimentary", "gold") : r.active ? badge(PLANS[r.plan]?.label || r.plan, "green") : r.plan ? badge("Expired", "red") : badge("Free")}</td>
        <td>${r.plan === "comp" ? "Never" : r.exp ? fmtDate(r.exp) : "—"}</td><td>${fmtDateTime(r.last)}</td><td><button class="btn small" data-u="${r.uid}">Subscription</button></td></tr>`).join("")}
      </tbody></table></div></div>`;
    const input = body.querySelector("#q");
    input.oninput = debounce(() => { q = input.value.trim().toLowerCase(); const pos = input.selectionStart; draw(); const n = body.querySelector("#q"); n.focus(); n.setSelectionRange(pos, pos); }, 200);
    body.querySelector("#csv").onclick = () => downloadText(`sumas-students-${dayKey()}.csv`, toCSV([["nickname", "email", "age_group", "plan", "status", "expires", "last_login", "joined"],
      ...rows.map((r) => [r.nick, r.email, r.age, r.plan, r.active ? "active" : r.plan ? "expired" : "free", r.exp ? dayKey(new Date(r.exp)) : "", r.last ? new Date(r.last).toISOString() : "", r.created ? new Date(r.created).toISOString() : ""])]), "text/csv");
    body.querySelectorAll("[data-u]").forEach((b) => (b.onclick = () => editSub(rows.find((r) => r.uid === b.dataset.u))));
  }

  function editSub(r) {
    const s = sheet(`<div class="stack"><p class="muted small" style="margin:0">Use this to fix a mistake or give free access. Approving a payment does this for you.</p>
      <button class="btn gold block" id="comp">${r.plan === "comp" ? "Complimentary access is on" : "Give complimentary access (no payment)"}</button>
      <p class="small muted" style="margin:0">Full access that never expires. Use it for people you're exempting. It doesn't make them an admin.</p>
      <div class="divider">or set a paid plan by hand</div>
      <label>Plan<select id="plan">${PLAN_KEYS.map((k) => `<option value="${k}" ${k === (r.plan || "1m") ? "selected" : ""}>${PLANS[k].label}</option>`).join("")}</select></label>
      <label>Access until<input id="exp" type="date" value="${dayKey(new Date(r.plan !== "comp" && r.exp && r.exp > Date.now() ? r.exp : extendedExpiry(0, Date.now(), r.plan && r.plan !== "comp" ? r.plan : "1m")))}"></label>
      <div class="row wrap" style="justify-content:space-between"><button class="btn danger" id="rm" ${r.plan ? "" : "disabled"}>Remove subscription</button>
      <span class="row"><button class="btn ghost" data-c>Cancel</button><button class="btn primary" id="save">Save</button></span></div></div>`, { title: `@${r.nick}` });
    const $ = (x) => s.el.querySelector(x);
    s.el.querySelector("[data-c]").onclick = s.close;
    $("#plan").onchange = () => { $("#exp").value = dayKey(new Date(extendedExpiry(r.plan === "comp" ? 0 : r.exp, Date.now(), $("#plan").value))); };
    $("#comp").onclick = async () => {
      if (r.plan === "comp") return;
      try { await setDoc(doc(db, "subscriptions", r.uid), { plan: "comp", expiresAt: Timestamp.fromMillis(COMP_EXPIRY), updatedAt: serverTimestamp() }); Object.assign(r, { plan: "comp", exp: COMP_EXPIRY, active: true }); s.close(); toast(`@${r.nick} now has complimentary access`, "good"); draw(); }
      catch (e) { fail(e); }
    };
    $("#save").onclick = async () => {
      const when = new Date($("#exp").value + "T23:59:59");
      if (Number.isNaN(when.getTime())) return toast("Pick a valid date", "bad");
      try { await setDoc(doc(db, "subscriptions", r.uid), { plan: $("#plan").value, expiresAt: Timestamp.fromDate(when), updatedAt: serverTimestamp() }); Object.assign(r, { plan: $("#plan").value, exp: when.getTime(), active: when.getTime() > Date.now() }); s.close(); toast("Subscription saved", "good"); draw(); }
      catch (e) { fail(e); }
    };
    $("#rm").onclick = async () => {
      if (!(await confirmBox({ title: "Remove subscription?", text: `@${r.nick} will go back to the free plan immediately.`, okLabel: "Remove", danger: true }))) return;
      try { await deleteDoc(doc(db, "subscriptions", r.uid)); Object.assign(r, { plan: "", exp: null, active: false }); s.close(); draw(); } catch (e) { fail(e); }
    };
  }
  draw();
}

/* ============================ BANKS AND SETS ============================ */
async function banksTab(body, ctx) {
  const snap = await getDocs(collection(db, "banks"));
  if (!ctx.alive()) return;
  const banks = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.title).localeCompare(String(b.title)));
  const refresh = () => { invalidateBanks(); banksTab(body, ctx); };

  const shortDate = (ms) => (ms ? fmtDate(ms) : "");
  body.innerHTML = `<div class="stack-l">
    <section class="card stack-s"><h2 style="margin:0">CSV template</h2>
      <p class="muted small" style="margin:0">Fill it in with Excel, Google Sheets or any text editor, then use "Upload set" on a bank. Columns: question, A to F (options), answer (a letter), topic, explanation, image (question image link), explanation_image (explanation image link), kind (normal or abstract). Every row needs question, at least options A and B, and answer.</p>
      <div class="row wrap"><button class="btn small primary" id="tplcsv">Download template with examples</button><button class="btn small ghost" id="tplblank">Download blank template</button></div></section>
    <div class="row between wrap"><p class="muted" style="margin:0">${banks.length} bank${banks.length === 1 ? "" : "s"}</p><span class="row wrap"><button class="btn small ghost" id="conv">Convert symbols in existing questions</button><button class="btn primary small" id="new">New bank</button></span></div>
    ${banks.length ? banks.map((b) => `<section class="card stack-s" data-b="${esc(b.id)}">
      <div class="row between wrap"><div><h2 style="margin:0">${esc(b.title)}</h2><p class="muted small" style="margin:0">${esc(b.topic || "No topic")} · v${b.version || 1} · taster: ${b.tasterCount ? `${b.tasterCount} questions` : "not built"}</p></div>
        <span class="row wrap"><button class="btn small" data-act="edit">Edit</button><button class="btn small" data-act="taster">Rebuild taster</button><button class="btn small" data-act="manual">Add questions by hand</button><button class="btn small primary" data-act="upload">Upload set</button></span></div>
      ${(b.sets || []).length ? `<div class="list">${b.sets.map((s) => `<div class="item" style="flex-wrap:wrap"><div class="grow"><strong>${esc(s.title)}</strong> ${s.locked ? badge("Locked", "red") : ""}
          <div class="meta">${s.count} questions${s.abstract ? ` (${s.abstract} abstract)` : ""} · v${s.version}${s.addedAt ? ` · added ${shortDate(s.addedAt)}` : ""}${s.updatedAt && s.updatedAt !== s.addedAt ? ` · updated ${shortDate(s.updatedAt)}` : ""}</div></div>
        <span class="row wrap" style="gap:6px"><button class="btn small ghost" data-act="qs" data-s="${esc(s.id)}">Questions</button><button class="btn small ghost" data-act="export" data-s="${esc(s.id)}">Export</button>
        <button class="btn small ${s.locked ? "gold" : "ghost"}" data-act="lock" data-s="${esc(s.id)}">${s.locked ? "Unlock" : "Lock"}</button>
        <button class="btn small ghost" data-act="replace" data-s="${esc(s.id)}">Replace</button><button class="btn small danger" data-act="delset" data-s="${esc(s.id)}">Delete</button></span></div>`).join("")}</div>`
        : '<p class="muted small" style="margin:0">No sets yet. Upload your first set.</p>'}
      <details class="log"><summary class="small" style="font-weight:800">Update log (${(b.log || []).length})</summary><div style="margin-top:10px" data-log>${logHTML(b)}</div></details>
      ${(b.sets || []).length ? '<button class="linkbtn small danger" data-act="delall" style="color:var(--danger);align-self:flex-start">Delete all questions in this bank</button>' : '<button class="linkbtn small danger" data-act="delbank" style="color:var(--danger);align-self:flex-start">Delete this bank</button>'}</section>`).join("")
      : '<div class="card center stack"><p class="muted">Create your first question bank, then upload sets into it.</p></div>'}</div>`;

  body.querySelector("#new").onclick = () => bankForm(null);
  body.querySelector("#tplcsv").onclick = () => downloadText("sumas-question-bank-template.csv", "\uFEFF" + SAMPLE_CSV, "text/csv");
  body.querySelector("#tplblank").onclick = () => downloadText("sumas-question-bank-blank.csv", "\uFEFF" + BLANK_CSV, "text/csv");
  body.querySelector("#conv").onclick = async () => {
    if (!(await confirmBox({ title: "Convert symbols in existing questions?", text: "Rewrites questions that contain things like m^-2, H_2O or <= into m⁻², H₂O and ≤. Image links are never touched. Sets that don't change are left alone. It is safe to run again.", okLabel: "Convert" }))) return;
    const btn = body.querySelector("#conv"); btn.disabled = true;
    try { const r = await convertExisting(banks, buildTaster, (n) => { btn.textContent = `Checking set ${n}...`; }); toast(r.sets ? `Converted ${r.fields} fields in ${r.sets} set${r.sets === 1 ? "" : "s"}` : "Nothing needed converting", "good"); refresh(); }
    catch (e) { btn.disabled = false; btn.textContent = "Convert symbols in existing questions"; fail(e); }
  };
  body.querySelectorAll("[data-b]").forEach((sec) => {
    const bank = banks.find((b) => b.id === sec.dataset.b);
    sec.querySelectorAll("[data-act]").forEach((btn) => (btn.onclick = () => {
      const a = btn.dataset.act, sid = btn.dataset.s;
      if (a === "edit") bankForm(bank);
      else if (a === "upload") uploadSheet(bank, null);
      else if (a === "manual") manualAddSheet({ bank, rebuildTaster: buildTaster, onDone: refresh });
      else if (a === "replace") uploadSheet(bank, sid);
      else if (a === "taster") tasterSheet(bank);
      else if (a === "delset") deleteSet(bank, sid);
      else if (a === "delall") deleteAllQuestions(bank);
      else if (a === "qs") { let dirty = false; questionsSheet({ bank, meta: bank.sets.find((x) => x.id === sid), rebuildTaster: buildTaster, onChanged: () => { dirty = true; }, onClose: () => { if (dirty) refresh(); } }); }
      else if (a === "export") exportSet(bank.sets.find((x) => x.id === sid)).then(() => toast("Exported", "good")).catch(fail);
      else if (a === "lock") toggleLock(bank, sid);
      else if (a === "delbank") deleteBank(bank);
    }));
  });

  body.querySelectorAll("[data-logexp]").forEach((b) => (b.onclick = () => { const m = banks.flatMap((x) => x.sets || []).find((x) => x.id === b.dataset.logexp); if (m) exportSet(m).then(() => toast("Exported", "good")).catch(fail); }));

  async function toggleLock(bank, sid) {
    const meta = bank.sets.find((x) => x.id === sid), locking = !meta.locked;
    if (!(await confirmBox({ title: locking ? "Lock this set?" : "Unlock this set?", text: locking ? `"${meta.title}" will be hidden from students' lists and can't be opened by them. Scores and ranks already earned stay. You can unlock it any time.` : `"${meta.title}" will be visible and playable again.`, okLabel: locking ? "Lock" : "Unlock" }))) return;
    try { await setLocked({ bank, meta, locked: locking }); invalidateBanks(); toast(locking ? "Set locked" : "Set unlocked", "good"); refresh(); } catch (e) { fail(e); }
  }

  function bankForm(bank) {
    const s = sheet(`<div class="stack"><label>Title<input id="t" maxlength="60" value="${esc(bank?.title || "")}" placeholder="e.g. Human Anatomy"></label>
      <label>Topic or course<input id="tp" maxlength="60" value="${esc(bank?.topic || "")}" placeholder="e.g. MBBS 200 level"></label>
      <label>Free taster size<input id="fc" type="number" min="1" max="50" value="${bank?.freeCount || ""}" placeholder="Default ${freeCount()}"><span class="field-hint">How many questions free students can try. Leave blank for the default.</span></label>
      <div class="row" style="justify-content:flex-end"><button class="btn ghost" data-c>Cancel</button><button class="btn primary" id="save">Save</button></div></div>`, { title: bank ? "Edit bank" : "New bank" });
    const $ = (x) => s.el.querySelector(x); s.el.querySelector("[data-c]").onclick = s.close;
    $("#save").onclick = async () => {
      const title = fx($("#t").value.trim()); if (!title) return toast("Please enter a title", "bad");
      const fc = Number($("#fc").value) || null;
      try {
        if (bank) await updateDoc(doc(db, "banks", bank.id), { title, topic: fx($("#tp").value.trim()), freeCount: fc, updatedAt: serverTimestamp() });
        else {
          let id = slug(title) || "bank"; if (banks.some((b) => b.id === id)) id += "-" + Math.random().toString(36).slice(2, 5);
          await setDoc(doc(db, "banks", id), { title, topic: fx($("#tp").value.trim()), log: [], freeCount: fc, setCount: 0, version: 1, sets: [], updatedAt: serverTimestamp() });
        }
        s.close(); toast("Saved", "good"); refresh();
      } catch (e) { fail(e); }
    };
  }

  async function buildTaster(bank, content, sourceSetId) {
    const n = bank.freeCount || freeCount();
    const questions = content.questions.slice(0, n), answers = content.answers.slice(0, n);
    const version = (bank.tasterVersion || 0) + 1;
    const b = writeBatch(db);
    b.set(doc(db, "tasters", bank.id), { bankId: bank.id, version, sourceSetId, questions, answers, updatedAt: serverTimestamp() });
    b.update(doc(db, "banks", bank.id), { tasterCount: questions.length, tasterVersion: version, tasterBuiltAt: serverTimestamp() });
    await b.commit(); await cacheDel("taster:" + bank.id);
    bank.tasterCount = questions.length; bank.tasterVersion = version;
  }

  function tasterSheet(bank) {
    if (!(bank.sets || []).length) return toast("Upload a set first, then build the taster from it.", "bad");
    const n = bank.freeCount || freeCount();
    const s = sheet(`<div class="stack"><p class="muted small" style="margin:0">The free taster is the first ${n} questions of the set you choose. Free students can only see these.</p>
      <label>Build from<select id="src">${bank.sets.map((x) => `<option value="${esc(x.id)}">${esc(x.title)}</option>`).join("")}</select></label>
      <div class="row" style="justify-content:flex-end"><button class="btn ghost" data-c>Cancel</button><button class="btn primary" id="go">Rebuild taster</button></div></div>`, { title: "Rebuild taster" });
    s.el.querySelector("[data-c]").onclick = s.close;
    s.el.querySelector("#go").onclick = async () => {
      try { const snap = await getDoc(doc(db, "sets", s.el.querySelector("#src").value)); if (!snap.exists()) throw new Error("missing"); await buildTaster(bank, snap.data(), snap.id); s.close(); toast("Taster rebuilt", "good"); refresh(); }
      catch (e) { fail(e); }
    };
  }

  function uploadSheet(bank, replaceId) {
    const existing = replaceId ? bank.sets.find((x) => x.id === replaceId) : null;
    let parsed = null;
    const s = sheet(`<div class="stack"><label>Set title<input id="title" maxlength="80" value="${esc(existing?.title || "")}" placeholder="e.g. Anatomy Set 1"></label>
      <label>File (CSV or JSON)<input id="file" type="file" accept=".csv,.json,text/csv,application/json"></label>
      <label>...or paste it here<textarea id="paste" spellcheck="false" placeholder='question,A,B,C,D,answer,topic,explanation'></textarea></label>
      <p class="small muted" style="margin:0">Answers are letters (A to F). Tag every question with a topic. Templates: <button class="linkbtn" id="tj">JSON</button> · <button class="linkbtn" id="tc">CSV</button></p>
      <div id="prev"></div>
      ${existing ? '<label class="check"><input type="checkbox" id="rs"><span class="small">Start ranks and question stats for this set afresh (tick this if the questions changed, not for a typo fix)</span></label>' : ""}
      <label class="check"><input type="checkbox" id="rb" ${!bank.tasterCount || existing ? "checked" : ""}><span class="small">Also rebuild the free taster from this set</span></label>
      <div class="row" style="justify-content:flex-end"><button class="btn ghost" data-c>Cancel</button><button class="btn primary" id="pub" disabled>${existing ? "Replace set" : "Publish set"}</button></div></div>`,
      { title: existing ? `Replace: ${existing.title}` : `Upload to ${bank.title}` });
    const $ = (x) => s.el.querySelector(x);
    s.el.querySelector("[data-c]").onclick = s.close;
    $("#tj").onclick = () => downloadText("sumas-set-template.json", SAMPLE_JSON, "application/json");
    $("#tc").onclick = () => downloadText("sumas-set-template.csv", SAMPLE_CSV, "text/csv");
    const check = () => {
      const text = $("#paste").value.trim();
      if (!text) { $("#prev").innerHTML = ""; $("#pub").disabled = true; parsed = null; return; }
      parsed = parseSet(text);
      if (!$("#title").value.trim() && parsed.title) $("#title").value = parsed.title;
      if (existing && $("#rs") && !$("#rs").dataset.touched) $("#rs").checked = parsed.questions.length !== existing.count;
      const topics = Object.entries(parsed.topics).map(([t, n]) => `${esc(t)} (${n})`).join(", ");
      $("#prev").innerHTML = `<div class="notice ${parsed.errors.length ? "bad" : "warn"} stack-s">
        <strong>${parsed.questions.length} questions</strong>${parsed.bytes ? ` · ${(parsed.bytes / 1024).toFixed(0)} KB` : ""}${parsed.abstractCount ? ` · ${parsed.abstractCount} abstract, ${parsed.questions.length - parsed.abstractCount} normal` : ""}${parsed.converted ? `<div class="small">Symbols converted in ${parsed.converted} place${parsed.converted === 1 ? "" : "s"} (m^-2 → m⁻², H_2O → H₂O ...).</div>` : ""}${topics ? `<div class="small">Topics: ${topics}</div>` : ""}
        ${parsed.errors.length ? `<div class="small" style="color:var(--danger)"><strong>Fix these first:</strong><ul style="margin:4px 0 0;padding-left:18px">${parsed.errors.slice(0, 8).map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>` : ""}
        ${parsed.warnings.length ? `<div class="small"><strong>Heads up:</strong><ul style="margin:4px 0 0;padding-left:18px">${parsed.warnings.slice(0, 4).map((e) => `<li>${esc(e)}</li>`).join("")}</ul>${parsed.warnings.length > 4 ? `<span class="muted">and ${parsed.warnings.length - 4} more</span>` : ""}</div>` : ""}</div>`;
      $("#pub").disabled = !!parsed.errors.length || !parsed.questions.length;
    };
    $("#paste").addEventListener("input", debounce(check, 300));
    $("#paste").addEventListener("blur", () => { $("#paste").value = fx($("#paste").value); setTimeout(() => { if (s.el.isConnected) check(); }, 0); });   // never change the page from inside a blur event   // web addresses (image links) are skipped by fx
    $("#title").addEventListener("blur", () => { $("#title").value = fx($("#title").value); });
    if ($("#rs")) $("#rs").onchange = () => { $("#rs").dataset.touched = "1"; };
    $("#file").onchange = async (e) => { const f = e.target.files[0]; if (!f) return; $("#paste").value = await f.text(); if (!$("#title").value.trim()) $("#title").value = f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "); check(); };
    $("#pub").onclick = async () => {
      const title = $("#title").value.trim(); if (!title) return toast("Please give the set a title", "bad");
      $("#pub").disabled = true; $("#pub").textContent = "Publishing...";
      try {
        let setId = existing?.id;
        if (!setId) { setId = slug(`${bank.id}-${title}`) || "set"; while (bank.sets.some((x) => x.id === setId)) setId += "-" + Math.random().toString(36).slice(2, 4); }
        const version = (existing?.version || 0) + 1;
        const now = Date.now();
        const meta = { id: setId, title: fx(title), count: parsed.questions.length, version, addedAt: existing?.addedAt || now, updatedAt: now, ...(parsed.abstractCount ? { abstract: parsed.abstractCount } : {}), ...(existing?.locked ? { locked: true, lockedAt: existing.lockedAt } : {}) };
        const sets = existing ? bank.sets.map((x) => (x.id === setId ? meta : x)) : [...(bank.sets || []), meta];
        const log = addLog(bank.log, { type: existing ? "replaced" : "added", setId, title: meta.title, text: `${existing ? "Replaced" : "Added"} "${meta.title}": ${parsed.questions.length} questions${topicSummary(parsed, 3) ? ` (${topicSummary(parsed, 3)})` : ""}` });
        const b = writeBatch(db);
        b.set(doc(db, "sets", setId), { bankId: bank.id, version, title, questions: parsed.questions, answers: parsed.answers, updatedAt: serverTimestamp() });
        b.update(doc(db, "banks", bank.id), { sets, setCount: sets.length, version: (bank.version || 1) + 1, log, updatedAt: serverTimestamp() });
        if (existing && $("#rs")?.checked) { b.delete(doc(db, "qStats", setId)); b.delete(doc(db, "setStats", setId)); }
        await b.commit(); await cacheDel("set:" + setId);
        bank.sets = sets; bank.log = log;
        let tasterFailed = false;
        if ($("#rb").checked) { try { await buildTaster(bank, parsed, setId); } catch { tasterFailed = true; } }   // the set is already saved: never let a taster hiccup invite a second publish
        s.close(); toast(tasterFailed ? `Published "${title}", but the taster failed. Tap Rebuild taster.` : `${existing ? "Replaced" : "Published"} "${title}"`, tasterFailed ? "bad" : "good"); refresh();
      } catch (e) { $("#pub").disabled = false; $("#pub").textContent = existing ? "Replace set" : "Publish set"; fail(e); }
    };
  }

  async function deleteSet(bank, setId) {
    const meta = bank.sets.find((x) => x.id === setId);
    // Whole set = big, permanent: show the count, offer a backup CSV, and make the admin type DELETE.
    if (!(await typedConfirm({ title: "Delete this set?", text: `"${meta.title}" will be removed for everyone. Students' past scores stay.`, count: meta.count, okLabel: "Delete set", backup: { label: "Download backup CSV", fn: () => exportSet(meta) } }))) return;
    try {
      const sets = bank.sets.filter((x) => x.id !== setId), b = writeBatch(db);
      const log = addLog(bank.log, { type: "deleted-set", title: meta.title, text: `Deleted "${meta.title}" (${meta.count} questions)` });
      b.delete(doc(db, "sets", setId));
      b.update(doc(db, "banks", bank.id), { sets, setCount: sets.length, version: (bank.version || 1) + 1, log, updatedAt: serverTimestamp() });
      await b.commit(); await cacheDel("set:" + setId); toast("Set deleted"); refresh();
    } catch (e) { fail(e); }
  }

  /** Every set in a bank (and its taster) at once. */
  async function deleteAllQuestions(bank) {
    const count = bank.sets.reduce((n, x) => n + (x.count || 0), 0);
    const backup = async () => {
      const rows = [];
      for (const m of bank.sets) { const d = await fetchSet(m.id); setToRows(d).forEach((r) => rows.push([...r, m.title])); }
      downloadText(`${slug(bank.title) || bank.id}-all-questions.csv`, "\uFEFF" + toCSV([[...SET_CSV_HEAD, "set"], ...rows]), "text/csv");
    };
    if (!(await typedConfirm({ title: "Delete all questions?", text: `Every set in "${bank.title}" (${bank.sets.length}) and the free taster will be removed. The bank itself stays, empty. Students' past scores stay.`, count, okLabel: "Delete everything", backup: { label: "Download backup CSV", fn: backup } }))) return;
    try {
      const b = writeBatch(db);
      for (const m of bank.sets) b.delete(doc(db, "sets", m.id));
      b.delete(doc(db, "tasters", bank.id));
      b.update(doc(db, "banks", bank.id), { sets: [], setCount: 0, tasterCount: 0, version: (bank.version || 1) + 1, log: addLog(bank.log, { type: "deleted-all", text: `Deleted all ${count} questions (${bank.sets.length} sets)` }), updatedAt: serverTimestamp() });
      await b.commit(); await Promise.all([...bank.sets.map((m) => cacheDel("set:" + m.id)), cacheDel("taster:" + bank.id)]);
      toast("All questions deleted"); refresh();
    } catch (e) { fail(e); }
  }

  async function deleteBank(bank) {
    if (!(await confirmBox({ title: "Delete this bank?", text: `"${bank.title}" and its taster will be removed.`, okLabel: "Delete", danger: true }))) return;
    try { const b = writeBatch(db); b.delete(doc(db, "banks", bank.id)); b.delete(doc(db, "tasters", bank.id)); await b.commit(); await cacheDel("taster:" + bank.id); toast("Bank deleted"); refresh(); }
    catch (e) { fail(e); }
  }
}

/* ================================ SETTINGS ============================== */
async function settingsTab(body, ctx) {
  const [a, p] = await Promise.all([getDoc(doc(db, "settings", "app")), getDoc(doc(db, "settings", "plans"))]);
  if (!ctx.alive()) return;
  const app = a.exists() ? a.data() : {}, plans = p.exists() ? p.data() : {};
  body.innerHTML = `<form id="f" class="stack-l" novalidate>
    <section class="card stack"><h2>Plan prices (₦)</h2><p class="muted small" style="margin:0">Make the 3-month plan clearly cheaper per week.</p>
      ${PLAN_KEYS.map((k) => `<label>${PLANS[k].label}<input name="p_${k}" type="number" min="0" inputmode="numeric" value="${priceOf(plans, k) || ""}"></label>`).join("")}</section>
    <section class="card stack"><h2>Bank details shown to students</h2>
      <label>Bank name<input name="bankName" value="${esc(app.bankName || "")}"></label>
      <label>Account name<input name="accountName" value="${esc(app.accountName || "")}"></label>
      <label>Account number<input name="accountNumber" inputmode="numeric" value="${esc(app.accountNumber || "")}"></label></section>
    <section class="card stack"><h2>General</h2>
      <label>WhatsApp number (no + sign)<input name="whatsappNumber" inputmode="numeric" value="${esc(app.whatsappNumber || "2349155852375")}"></label>
      <label>Free taster size (questions per bank)<input name="freeCount" type="number" min="1" max="50" value="${app.freeCount || 10}"></label>
      <label>Minimum players per group match<input name="minPlayers" type="number" min="2" max="60" value="${app.minPlayers || 10}"></label>
      <label>Maximum players per group match<input name="maxPlayers" type="number" min="2" max="60" value="${app.maxPlayers || 40}"></label>
      <label>Extend a short match by (minutes)<input name="extendMinutes" type="number" min="1" max="30" value="${app.extendMinutes || 5}"></label>
      <label>Default time to answer a match (minutes)<input name="matchMinutes" type="number" min="5" max="90" value="${app.matchMinutes || 20}"></label>
      <label>Activity pop-ups: check every (minutes, at least 5)<input name="activityEveryMin" type="number" min="5" max="60" value="${app.activityEveryMin || 5}"><span class="field-hint">A bigger number saves reads. Each check reads 3 documents per student who has the app open.</span></label>
      <label>Support hours<input name="supportHours" value="${esc(app.supportHours || "")}" placeholder="e.g. Mon to Sat, 9am to 6pm"></label>
      <label class="check"><input type="checkbox" name="activityFeedEnabled" ${app.activityFeedEnabled ? "checked" : ""}><span class="small">Live activity pop-ups for paid students (kill switch: untick to stop them and their reads)</span></label>
      <label class="check"><input type="checkbox" name="sessionLogsEnabled" ${app.sessionLogsEnabled === false ? "" : "checked"}><span class="small">Record session logs (about 2 small writes per visit; see the Activity tab)</span></label></section>
    <button class="btn primary block" id="save" type="submit">Save settings</button></form>`;
  body.querySelector("#f").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target, v = (n) => f.elements[n].value.trim();
    const newPlans = { v: 2 }; for (const k of PLAN_KEYS) { const n = Number(v("p_" + k)); if (n > 0) newPlans[k] = n; }
    const newApp = { bankName: v("bankName"), accountName: v("accountName"), accountNumber: v("accountNumber"), whatsappNumber: v("whatsappNumber").replace(/\D/g, "") || "2349155852375",
      freeCount: Math.max(1, Math.min(50, Number(v("freeCount")) || 10)), supportHours: v("supportHours"), activityFeedEnabled: f.elements.activityFeedEnabled.checked,
      maxPlayers: Math.max(2, Math.min(60, Number(v("maxPlayers")) || 40)), minPlayers: Math.max(2, Math.min(Math.max(2, Math.min(60, Number(v("maxPlayers")) || 40)), Number(v("minPlayers")) || 10)),   // never above the maximum, or no match could start
      extendMinutes: Math.max(1, Math.min(30, Number(v("extendMinutes")) || 5)),
      matchMinutes: Math.max(5, Math.min(90, Number(v("matchMinutes")) || 20)), activityEveryMin: Math.max(5, Math.min(60, Number(v("activityEveryMin")) || 5)), sessionLogsEnabled: f.elements.sessionLogsEnabled.checked };
    const btn = f.querySelector("#save"); btn.disabled = true;
    try {
      await Promise.all([setDoc(doc(db, "settings", "plans"), newPlans), setDoc(doc(db, "settings", "app"), newApp, { merge: true })]);
      state.plans = newPlans; state.settings = { ...state.settings, ...newApp };
      toast("Settings saved", "good");
    } catch (ex) { fail(ex); }
    btn.disabled = false;
  });
}
