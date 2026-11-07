// Admin > Quotes: add short motivational quotes shown on the student home screen and on result screens.
// Each quote has a length limit and an optional reference (who said it, or where it is from). Stored in settings/quotes (admin write, public read).
import { db, doc, getDoc, setDoc, serverTimestamp } from "../firebase.js";
import { esc, plain, ls } from "../lib/util.js";
import { confirmBox, toast } from "../ui.js";
import { handleError } from "../net.js";

export const QUOTE_MAX = 140;     // characters in the quote itself
export const REF_MAX = 40;        // characters in the optional reference
const MAX_ALL = 60;               // quotes per place, keeps the settings doc tiny
const WHERE = { home: "Home screen", high: "Result: 80% and above", medium: "Result: 50 to 79%", low: "Result: under 50%" };
const BANDS = Object.keys(WHERE);

/** Clean one quote (pure, exported for tests). Returns null when there is nothing usable. */
export function cleanQuote(text, by = "") {
  const t = String(text || "").replace(/\s+/g, " ").trim().slice(0, QUOTE_MAX);
  if (t.length < 3) return null;
  const b = String(by || "").replace(/\s+/g, " ").trim().slice(0, REF_MAX);
  return b ? { t, by: b } : { t };
}

export default async function quotesTab(body, ctx) {
  const fail = (e) => { if (!handleError(e)) toast("That didn't work. Please try again.", "bad"); };
  let data = {};
  try { const s = await getDoc(doc(db, "settings", "quotes")); data = s.exists() ? plain(s.data()) : {}; } catch (e) { fail(e); }
  if (!ctx.alive()) return;
  for (const b of BANDS) if (!Array.isArray(data[b])) data[b] = [];
  const persist = async () => {
    const out = {}; for (const b of BANDS) out[b] = data[b];
    await setDoc(doc(db, "settings", "quotes"), { ...out, updatedAt: serverTimestamp() });
    ls("quotes_admin", out);
  };

  function draw() {
    body.innerHTML = `<div class="stack-l">
      <section class="card stack"><h2 style="margin:0">Add a quote</h2>
        <p class="muted small" style="margin:0">Quotes you add are mixed in with the built-in ones. Keep them short: they are cut off at ${QUOTE_MAX} characters.</p>
        <label>Quote<textarea id="qt" maxlength="${QUOTE_MAX}" rows="3" placeholder="Small steps every day beat one big push."></textarea></label>
        <div class="small muted" id="qc" style="text-align:right">0 / ${QUOTE_MAX}</div>
        <label class="check"><input type="checkbox" id="useref"> Add a reference (who said it, or where it is from)</label>
        <label id="refwrap" hidden>Reference<input id="ref" maxlength="${REF_MAX}" placeholder="e.g. Aristotle"></label>
        <label>Show it on<select id="where">${BANDS.map((b) => `<option value="${b}">${WHERE[b]}</option>`).join("")}</select></label>
        <button class="btn primary block" id="add" disabled>Add quote</button></section>
      ${BANDS.map((b) => `<section class="stack-s"><h3 style="margin:0">${WHERE[b]} (${data[b].length})</h3>
        ${data[b].length ? `<div class="list">${data[b].map((q, i) => `<div class="item"><div class="grow"><div>“${esc(q.t)}”</div>${q.by ? `<div class="meta">${esc(q.by)}</div>` : ""}</div><button class="btn small danger" data-rm="${b}:${i}" aria-label="Remove quote">Remove</button></div>`).join("")}</div>`
          : '<p class="muted small" style="margin:0">None added yet. The built-in quotes are used.</p>'}</section>`).join("")}</div>`;

    const $ = (x) => body.querySelector(x);
    const check = () => { const n = $("#qt").value.trim().length; $("#qc").textContent = `${$("#qt").value.length} / ${QUOTE_MAX}`; $("#add").disabled = n < 3; };
    $("#qt").addEventListener("input", check);
    $("#useref").addEventListener("change", () => { $("#refwrap").hidden = !$("#useref").checked; if ($("#useref").checked) $("#ref").focus(); });
    $("#add").onclick = async () => {
      const q = cleanQuote($("#qt").value, $("#useref").checked ? $("#ref").value : "");
      const band = $("#where").value;
      if (!q) return;
      if (data[band].length >= MAX_ALL) return toast(`You can keep up to ${MAX_ALL} quotes in each place. Remove one first.`, "bad");
      if (data[band].some((x) => x.t.toLowerCase() === q.t.toLowerCase())) return toast("That quote is already there.", "bad");
      $("#add").disabled = true;
      data[band] = [q, ...data[band]];
      try { await persist(); toast("Quote added", "good"); draw(); } catch (e) { data[band] = data[band].slice(1); fail(e); draw(); }
    };
    body.querySelectorAll("[data-rm]").forEach((b) => b.onclick = async () => {
      const [band, i] = b.dataset.rm.split(":"), q = data[band][Number(i)];
      if (!q || !(await confirmBox({ title: "Remove this quote?", text: `“${q.t}”`, okLabel: "Remove", danger: true }))) return;
      const before = data[band];
      data[band] = before.filter((_, k) => k !== Number(i));
      try { await persist(); toast("Removed", "good"); } catch (e) { data[band] = before; fail(e); }
      draw();
    });
  }
  draw();
}
