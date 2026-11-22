// Admin > Pictures: add (or remove) extra SVG profile pictures that students can choose. Stored in settings/avatars.
// Only an admin can write there (Firestore rules), and every SVG is rebuilt from a safe allow-list before it is saved and again before it is shown.
import { db, doc, setDoc, serverTimestamp } from "../firebase.js";
import { AVATARS, customAvatars, setCustomAvatars, sanitizeSvg, premiumAvatars, setPremiumAvatars, isPremiumAvatar } from "../avatars.js";
import { esc, slug, ls } from "../lib/util.js";
import { confirmBox, toast } from "../ui.js";
import { handleError } from "../net.js";

const MAX = 40;
const tile = (a, size = 72, lock = false) => `<div style="text-align:center">${lock ? `<label class="check small" style="justify-content:center;margin-bottom:4px"><input type="checkbox" data-pr="${esc(a.id)}" ${isPremiumAvatar(a.id) ? "checked" : ""}> Paid only</label>` : ""}<div style="width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;background:${esc(a.bg)};border:2px solid var(--edge);margin:0 auto"><svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">${a.art}</svg></div><div class="small" style="margin-top:4px">${esc(a.name)}</div></div>`;

export default async function avatarsTab(body, ctx) {
  const fail = (e) => { if (!handleError(e)) toast("That didn't work. Please try again.", "bad"); };
  const save = async (items, prem = premiumAvatars()) => {
    const clean = items.map(({ id, name, bg, art }) => ({ id, name, bg, art }));
    const keep = prem.filter((id) => AVATARS.some((a) => a.id === id) || clean.some((a) => a.id === id));   // forget locks on pictures that no longer exist
    await setDoc(doc(db, "settings", "avatars"), { items: clean, premium: keep, updatedAt: serverTimestamp() });
    setCustomAvatars(items); setPremiumAvatars(keep); ls("avatars_custom", { items: clean, premium: keep });
  };

  function draw() {
    const mine = customAvatars();
    body.innerHTML = `<div class="stack-l">
      <section class="card stack"><h2 style="margin:0">Add a picture</h2>
        <p class="muted small" style="margin:0">Paste SVG code or choose an .svg file. It is shown as a circle, so keep the drawing in the middle. Any size works (it is scaled to fit). Scripts, links and images inside the SVG are removed automatically.</p>
        <label>Name<input id="nm" maxlength="24" placeholder="e.g. Stethoscope"></label>
        <label>Background colour<input id="bg" type="color" value="#ffd36b" style="padding:4px"></label>
        <label>SVG code<textarea id="svg" spellcheck="false" placeholder='<svg viewBox="0 0 64 64">...</svg>'></textarea></label>
        <label>...or choose a file<input id="file" type="file" accept=".svg,image/svg+xml"></label>
        <div id="pv" class="center"></div>
        <button class="btn primary block" id="add" disabled>Add picture</button>
        <p class="small muted" style="margin:0">${mine.length} of ${MAX} extra pictures used. New pictures appear for students the next time their app loads.</p></section>
      <section class="stack-s"><h2 style="margin:0">Added by you (${mine.length})</h2>
        ${mine.length ? `<div class="card"><div class="avpick" style="grid-template-columns:repeat(auto-fill,minmax(88px,1fr))">${mine.map((a) => `<div>${tile(a, 72, true)}<button class="btn small danger block" style="margin-top:6px" data-rm="${esc(a.id)}">Remove</button></div>`).join("")}</div></div>`
          : '<p class="muted small" style="margin:0">None yet. The 12 built-in pictures are always available.</p>'}</section>
      <section class="stack-s"><h2 style="margin:0">Built in (${AVATARS.length})</h2><p class="muted small" style="margin:0">Tick "Paid only" on any picture (built in or added by you) to reserve it for subscribers. Free students see it with a lock. It saves as soon as you tick it.</p><div class="card"><div class="avpick" style="grid-template-columns:repeat(auto-fill,minmax(80px,1fr))">${AVATARS.map((a) => tile(a, 64, true)).join("")}</div></div></section></div>`;

    const $ = (x) => body.querySelector(x);
    let clean = "";
    const check = () => {
      const r = sanitizeSvg($("#svg").value); clean = r.art;
      $("#pv").innerHTML = r.art ? tile({ art: r.art, bg: $("#bg").value, name: $("#nm").value.trim() || "Preview" }, 96) : ($("#svg").value.trim() ? `<p class="error" style="margin:0">${esc(r.error)}</p>` : "");
      $("#add").disabled = !r.art || !$("#nm").value.trim() || mine.length >= MAX;
    };
    ["#svg", "#nm", "#bg"].forEach((s) => $(s).addEventListener("input", check));
    $("#file").onchange = async (e) => { const f = e.target.files[0]; if (!f) return; if (f.size > 200000) return toast("That file is too big", "bad"); $("#svg").value = await f.text(); if (!$("#nm").value.trim()) $("#nm").value = f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").slice(0, 24); check(); };
    $("#add").onclick = async () => {
      const name = $("#nm").value.trim();
      let id = slug(name) || "pic"; if (id.length < 2) id += "-pic"; id = id.slice(0, 26);
      while (AVATARS.some((a) => a.id === id) || mine.some((a) => a.id === id)) id = id.slice(0, 22) + "-" + Math.random().toString(36).slice(2, 5);
      $("#add").disabled = true;
      try { await save([...mine, { id, name, bg: $("#bg").value, art: clean }]); toast("Picture added", "good"); draw(); } catch (e) { $("#add").disabled = false; fail(e); }
    };
    body.querySelectorAll("[data-pr]").forEach((c) => (c.onchange = async () => {
      const ids = [...body.querySelectorAll("[data-pr]")].filter((x) => x.checked).map((x) => x.dataset.pr);
      c.disabled = true;
      try { await save(mine, ids); toast(c.checked ? "Reserved for subscribers" : "Open to everyone", "good"); } catch (e) { c.checked = !c.checked; fail(e); }
      c.disabled = false;
    }));
    body.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = async () => {
      if (!(await confirmBox({ title: "Remove this picture?", text: "Students who chose it go back to their coloured letter until they pick another. Nothing else changes.", okLabel: "Remove", danger: true }))) return;
      try { await save(mine.filter((a) => a.id !== b.dataset.rm)); toast("Removed", "good"); draw(); } catch (e) { fail(e); }
    }));
  }
  draw();
}
