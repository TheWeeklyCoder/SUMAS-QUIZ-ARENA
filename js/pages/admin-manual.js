// Admin: add questions by hand, one at a time, into an existing set or a brand-new set.
// The form has two clearly separate picture sections: the QUESTION image (shown above the question) and the EXPLANATION image
// (shown only after the student answers). Each takes a pasted link or an upload (compressed on the phone, then sent to Cloudinary).
import { db, doc, writeBatch, serverTimestamp } from "../firebase.js";
import { addLog } from "../lib/parse.js";
import { fx } from "../lib/symbols.js";
import { esc, slug } from "../lib/util.js";
import { compressImage, uploadToCloudinary, cloudinaryReady, fmtBytes } from "../imagetools.js";
import { sheet, toast } from "../ui.js";
import { cacheDel } from "../cache.js";
import { fetchSet, saveSetContent } from "./admin-sets.js";

const LETTERS = "ABCDEF";
const isHttps = (u) => { try { return new URL(u).protocol === "https:"; } catch { return false; } };

/** Validate and build one stored question from the form values (pure, exported for tests). Returns { q, answer } or { error }. */
export function buildQuestion(v) {
  const text = fx(String(v.text || "").trim());
  const raw = (v.options || []).map((o) => fx(String(o || "").trim()));
  const last = raw.map((o) => o !== "").lastIndexOf(true), options = raw.slice(0, last + 1);
  const answer = Number(v.answer);
  if (!text) return { error: "Please type the question." };
  if (options.length < 2) return { error: "Add at least two options." };
  if (options.some((o) => o === "")) return { error: "Fill the options in order (A, B, C...) with no gaps." };
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return { error: "Two options are identical." };
  if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) return { error: "Choose the correct answer from the options you filled in." };
  const image = String(v.image || "").trim(), eimage = String(v.eimage || "").trim();
  if (image && !isHttps(image)) return { error: "The question image link must start with https://" };
  if (eimage && !isHttps(eimage)) return { error: "The explanation image link must start with https://" };
  return { q: { text, options, image, ...(eimage ? { eimage } : {}), explanation: fx(String(v.explanation || "").trim()), topic: fx(String(v.topic || "").trim()) || "General", ...(v.kind === "abstract" ? { kind: "abstract" } : {}) }, answer };
}

/** One picture section: a link box, an upload button and a preview. `name` is "q" or "e". */
const pictureCard = (name, title, hint, accent) => `<fieldset class="card stack-s" style="border:2px solid ${accent};margin:0;padding:14px">
  <legend style="font-weight:800;padding:0 8px">${title}</legend>
  <p class="small muted" style="margin:0">${hint}</p>
  <label>Image link<input id="${name}-url" inputmode="url" placeholder="https://..." autocomplete="off"></label>
  ${cloudinaryReady() ? `<label>...or upload a picture<input id="${name}-file" type="file" accept="image/*"></label>` : '<p class="small muted" style="margin:0">Uploading needs Cloudinary to be connected (js/config.js). You can still paste a link.</p>'}
  <div id="${name}-st" class="small muted" aria-live="polite"></div>
  <div id="${name}-pv"></div></fieldset>`;

export function manualAddSheet({ bank, rebuildTaster, onDone }) {
  const sets = bank.sets || [];
  let added = 0, busy = false;
  const s = sheet(`<div class="stack">
    <label>Add to<select id="m-set">${sets.map((x) => `<option value="${esc(x.id)}">${esc(x.title)} (${x.count} questions)</option>`).join("")}<option value="__new">+ A new set</option></select></label>
    <label id="m-newwrap" hidden>New set title<input id="m-new" maxlength="80" placeholder="e.g. Anatomy Set 2"></label>
    <div id="m-count" class="small muted" aria-live="polite"></div>

    <fieldset class="card stack-s" style="margin:0;padding:14px"><legend style="font-weight:800;padding:0 8px">1. The question</legend>
      <label>Question<textarea id="m-q" rows="3" style="min-height:80px;font-family:var(--font);font-size:1rem"></textarea></label>
      ${LETTERS.split("").map((L, k) => `<label>Option ${L}${k < 2 ? "" : " (optional)"}<input id="m-o${k}" autocomplete="off"></label>`).join("")}
      <div class="row wrap" style="gap:12px"><label class="grow">Correct answer<select id="m-a">${LETTERS.split("").map((L, k) => `<option value="${k}">${L}</option>`).join("")}</select></label>
        <label class="grow">Style<select id="m-k"><option value="normal">Normal (exam type)</option><option value="abstract">Abstract (real-world scenario)</option></select></label></div>
      <label>Topic<input id="m-t" maxlength="60" placeholder="e.g. Skeletal system"></label></fieldset>

    ${pictureCard("q", "2. Question image (optional)", "Shown above the question while the student is answering. Good for scans, diagrams and specimens.", "var(--blue)")}

    <fieldset class="card stack-s" style="margin:0;padding:14px"><legend style="font-weight:800;padding:0 8px">3. Explanation (optional)</legend>
      <label>Explanation text<textarea id="m-e" rows="3" style="min-height:80px;font-family:var(--font);font-size:1rem" placeholder="Shown after the student answers"></textarea></label></fieldset>

    ${pictureCard("e", "4. Explanation image (optional)", "Shown only after the student answers, under the explanation text. Different from the question image above.", "var(--gold, #e0a400)")}

    <p class="small muted" style="margin:0">Symbols are converted for you (m^-2 → m⁻², H_2O → H₂O, &lt;= → ≤). Image links are never changed.</p>
    <div class="row wrap" style="justify-content:flex-end"><button class="btn ghost" data-c>Close</button><button class="btn" id="m-next">Save and add another</button><button class="btn primary" id="m-done">Save and finish</button></div></div>`, { title: `Add questions: ${bank.title}`, onClose: () => { if (added) onDone?.(); } });
  const $ = (x) => s.el.querySelector(x);
  const picked = { q: "", e: "" };
  $("[data-c]").onclick = s.close;
  const setSel = $("#m-set");
  if (!sets.length) { setSel.value = "__new"; }
  const syncTarget = () => {
    const isNew = setSel.value === "__new";
    $("#m-newwrap").hidden = !isNew;
    $("#m-count").textContent = isNew ? "A new set is created with your first question." : `${(sets.find((x) => x.id === setSel.value) || {}).count || 0} questions in this set${added ? ` · ${added} added just now` : ""}`;
  };
  setSel.onchange = syncTarget; syncTarget();
  s.el.querySelectorAll("#m-q,#m-e,#m-t,[id^=m-o]").forEach((el) => el.addEventListener("blur", () => { el.value = fx(el.value); }));

  for (const n of ["q", "e"]) {
    const url = $(`#${n}-url`), pv = $(`#${n}-pv`), st = $(`#${n}-st`);
    const show = () => { picked[n] = url.value.trim(); pv.innerHTML = picked[n] && isHttps(picked[n]) ? `<img src="${esc(picked[n])}" alt="Preview" style="max-width:100%;max-height:200px;border-radius:10px;border:2px solid var(--br)">` : ""; };
    url.addEventListener("input", show);
    $(`#${n}-file`)?.addEventListener("change", async (e) => {
      const f = e.target.files[0]; if (!f) return;
      st.textContent = "Compressing...";
      try {
        const c = await compressImage(f); st.textContent = `Uploading ${fmtBytes(c.size)}...`;
        const r = await uploadToCloudinary(c.blob, c.name); url.value = r.url; show(); st.textContent = `Uploaded (${fmtBytes(c.size)}${c.savedPct ? `, ${c.savedPct}% smaller` : ""}).`;
      } catch { st.textContent = "Upload failed. Check your connection, or paste a link instead."; }
      e.target.value = "";
    });
  }

  const clearForm = () => {
    for (const id of ["#m-q", "#m-e", "#q-url", "#e-url", ...[...Array(6).keys()].map((k) => "#m-o" + k)]) $(id).value = "";
    $("#m-a").value = "0"; $("#q-pv").innerHTML = ""; $("#e-pv").innerHTML = ""; $("#q-st").textContent = ""; $("#e-st").textContent = "";
    picked.q = picked.e = ""; $("#m-q").focus();
  };

  async function save(finish) {
    if (busy) return;
    const built = buildQuestion({ text: $("#m-q").value, options: LETTERS.split("").map((_, k) => $("#m-o" + k).value), answer: $("#m-a").value, kind: $("#m-k").value, topic: $("#m-t").value, explanation: $("#m-e").value, image: $("#q-url").value, eimage: $("#e-url").value });
    if (built.error) return toast(built.error, "bad");
    const isNew = setSel.value === "__new";
    const title = fx($("#m-new").value.trim());
    if (isNew && !title) return toast("Please give the new set a title.", "bad");
    busy = true; $("#m-next").disabled = $("#m-done").disabled = true;
    try {
      if (isNew) {
        let id = slug(`${bank.id}-${title}`) || "set"; while (sets.some((x) => x.id === id)) id += "-" + Math.random().toString(36).slice(2, 4);
        const now = Date.now(), meta = { id, title, count: 1, version: 1, addedAt: now, updatedAt: now, ...(built.q.kind === "abstract" ? { abstract: 1 } : {}) };
        const newSets = [...sets, meta];
        const log = addLog(bank.log, { type: "added", setId: id, title, text: `Created "${title}" by hand with its first question` });
        const b = writeBatch(db);
        b.set(doc(db, "sets", id), { bankId: bank.id, version: 1, title, questions: [built.q], answers: [built.answer], updatedAt: serverTimestamp() });
        b.update(doc(db, "banks", bank.id), { sets: newSets, setCount: newSets.length, version: (bank.version || 1) + 1, log, updatedAt: serverTimestamp() });
        await b.commit(); await cacheDel("set:" + id);
        bank.sets = newSets; bank.log = log; bank.version = (bank.version || 1) + 1;
        sets.push(meta);
        const opt = document.createElement("option"); opt.value = id; opt.textContent = `${title} (1 question)`; setSel.insertBefore(opt, setSel.querySelector('[value="__new"]'));
        setSel.value = id; $("#m-new").value = "";
      } else {
        const meta = sets.find((x) => x.id === setSel.value);
        const set = await fetchSet(meta.id);
        const content = { questions: [...(set.questions || []), built.q], answers: [...(set.answers || []), built.answer] };
        // Appending leaves every earlier question number unchanged, so ranks and per-question stats stay valid.
        await saveSetContent({ bank, meta, set: content, type: "question-added", text: `Added a question to "${meta.title}" (now ${content.questions.length})`, resetQStats: false, rebuildTaster, append: true });
      }
      added++; toast("Question saved", "good");
      if (finish) s.close(); else { clearForm(); syncTarget(); const o = setSel.selectedOptions[0]; const m = sets.find((x) => x.id === setSel.value); if (o && m) o.textContent = `${m.title} (${m.count} questions)`; }
    } catch { toast("That didn't work. Check your connection and try again.", "bad"); }
    finally { busy = false; $("#m-next").disabled = $("#m-done").disabled = false; }
  }
  $("#m-next").onclick = () => save(false);
  $("#m-done").onclick = () => save(true);
  return s;
}
