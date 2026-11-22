// Admin > Sponsors: sponsor cards shown on every student's Home screen (with a tap count), plus the enquiries sponsors send in.
import { db, doc, getDoc, setDoc, getDocs, collection, limit, query, serverTimestamp } from "../firebase.js";
import { KINDS, PACKAGES, cleanSponsor, sponsorState, toDay } from "../lib/sponsors.js";
import { resetSponsors } from "../data.js";
import { esc, fmtDate, naira, plain } from "../lib/util.js";
import { badge, confirmBox, sheet, toast } from "../ui.js";
import { handleError } from "../net.js";

const fail = (e) => { if (!handleError(e)) toast("That didn't work. Please try again.", "bad"); };
const newId = () => "sp" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

export async function sponsorsTab(body, ctx) {
  body.innerHTML = '<div class="stack-l"><section id="pl"></section><section id="enq" class="stack-s"></section></div>';
  const enq = body.querySelector("#enq");
  placements(body.querySelector("#pl"), ctx);
  enq.innerHTML = '<h2>Enquiries from sponsors</h2><div id="eq"></div>';
  (await import("./admin-phase3.js")).sponsorsTab(enq.querySelector("#eq"), ctx);
}

async function placements(box, ctx) {
  let items = [], clicks = {};
  try {
    const [s, c] = await Promise.all([getDoc(doc(db, "settings", "sponsors")), getDocs(query(collection(db, "sponsorStats"), limit(200))).catch(() => null)]);
    items = s.exists() ? plain(s.data().items || []) : [];
    if (c) c.docs.forEach((d) => { clicks[d.id] = d.data().clicks || 0; });
  } catch (e) { if (ctx.alive()) { box.innerHTML = '<div class="card center"><p class="muted">Couldn\'t load sponsors.</p></div>'; handleError(e); } return; }
  if (!ctx.alive()) return;

  const save = async (next) => { await setDoc(doc(db, "settings", "sponsors"), { items: next, updatedAt: serverTimestamp() }); items = next; resetSponsors(); };
  const when = (x) => `${x.startsAt ? fmtDate(x.startsAt) : "now"} to ${x.endsAt ? fmtDate(x.endsAt) : "no end date"}`;

  function draw() {
    box.innerHTML = `<div class="stack"><div class="row between wrap" style="gap:10px"><div class="grow"><h2 style="margin:0">Sponsor cards</h2><div class="small muted">Shown on every student's Home screen while they are live.</div></div><button class="btn primary small" id="add">Add sponsor</button></div>
      ${items.length ? items.map((x) => { const st = sponsorState(x); return `<article class="card stack-s"><div class="row between wrap" style="gap:8px"><div class="grow" style="min-width:0"><strong>${esc(x.name)}</strong><div class="small muted">${esc(KINDS[x.kind] || "")} · ${when(x)}</div>${x.tagline ? `<div class="small">${esc(x.tagline)}</div>` : ""}</div>
          ${badge(st === "live" ? "Live" : st === "upcoming" ? "Upcoming" : st === "ended" ? "Ended" : "Paused", st === "live" ? "green" : st === "ended" ? "red" : "gold")}</div>
          <div class="small muted">${clicks[x.id] || 0} tap${(clicks[x.id] || 0) === 1 ? "" : "s"} on the link${x.link ? "" : " (no link set)"}</div>
          <div class="row wrap"><button class="btn small" data-ed="${esc(x.id)}">Edit</button><button class="btn small ghost" data-pa="${esc(x.id)}">${x.active === false ? "Resume" : "Pause"}</button><button class="btn small danger" data-dl="${esc(x.id)}">Delete</button></div></article>`; }).join("")
        : '<div class="card center"><p class="muted" style="margin:0">No sponsors yet. Add one when a sponsor pays, then log the money in Revenue.</p></div>'}
      <details><summary class="small"><strong>Suggested packages</strong></summary><div class="stack-s small" style="margin-top:8px">${PACKAGES.map((p) => `<div><strong>${esc(p.label)}: ${naira(p.price)}</strong><div class="muted">${esc(p.note)}</div></div>`).join("")}
        <div class="muted">These prices are my estimates for a small audience, not market data. Charge what you can really get.</div></div></details></div>`;
    box.querySelector("#add").onclick = () => form(null);
    box.querySelectorAll("[data-ed]").forEach((b) => (b.onclick = () => form(items.find((x) => x.id === b.dataset.ed))));
    box.querySelectorAll("[data-pa]").forEach((b) => (b.onclick = async () => { try { await save(items.map((x) => (x.id === b.dataset.pa ? { ...x, active: x.active === false } : x))); draw(); } catch (e) { fail(e); } }));
    box.querySelectorAll("[data-dl]").forEach((b) => (b.onclick = async () => {
      if (!(await confirmBox({ title: "Delete this sponsor card?", text: "It disappears from Home straight away.", okLabel: "Delete", danger: true }))) return;
      try { await save(items.filter((x) => x.id !== b.dataset.dl)); draw(); } catch (e) { fail(e); }
    }));
  }

  function form(x) {
    const s = sheet(`<div class="stack"><label>Sponsor name<input id="nm" maxlength="60" value="${esc(x?.name || "")}" placeholder="e.g. Acme Pharmacy"></label>
      <label>One line about them<input id="tg" maxlength="90" value="${esc(x?.tagline || "")}" placeholder="e.g. Your campus pharmacy. Show your student ID for 10% off"></label>
      <label>Logo link (optional)<input id="lg" maxlength="300" value="${esc(x?.logoUrl || "")}" placeholder="https://..."><span class="field-hint">A square picture link, for example from Admin > Images.</span></label>
      <label>Website or WhatsApp link (optional)<input id="lk" maxlength="300" value="${esc(x?.link || "")}" placeholder="https://..."></label>
      <label>Type<select id="kd">${Object.entries(KINDS).map(([k, l]) => `<option value="${k}" ${k === (x?.kind || "spotlight") ? "selected" : ""}>${esc(l)}</option>`).join("")}</select><span class="field-hint">Channel shoutouts are only for your records. They are not shown on Home.</span></label>
      <div class="row wrap" style="gap:10px"><label class="grow">Starts<input id="sd" type="date" value="${toDay(x?.startsAt)}"></label><label class="grow">Ends<input id="ed" type="date" value="${toDay(x?.endsAt)}"></label></div>
      <label class="check"><input type="checkbox" id="ac" ${x?.active === false ? "" : "checked"}><span class="small">Show it</span></label>
      <div class="row" style="justify-content:flex-end"><button class="btn ghost" data-c>Cancel</button><button class="btn primary" id="sv">Save</button></div></div>`, { title: x ? "Edit sponsor" : "Add sponsor" });
    const $ = (q) => s.el.querySelector(q); $("[data-c]").onclick = s.close;
    $("#sv").onclick = async () => {
      const r = cleanSponsor({ name: $("#nm").value, tagline: $("#tg").value, logoUrl: $("#lg").value, link: $("#lk").value, kind: $("#kd").value, start: $("#sd").value, end: $("#ed").value, active: $("#ac").checked }, x?.id || newId());
      if (!r.ok) return toast(r.error, "bad");
      try { await save(x ? items.map((i) => (i.id === x.id ? r.item : i)) : [...items, r.item]); s.close(); toast("Saved", "good"); draw(); } catch (e) { fail(e); }
    };
  }
  draw();
}
