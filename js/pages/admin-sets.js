// Admin: working on ONE set at a time. Export, lock/unlock, the question editor (edit or delete a single question),
// the update log, and the one-time symbol conversion of existing sets. Used by the "Banks & sets" tab.
import { db, doc, getDoc, writeBatch, serverTimestamp } from "../firebase.js";
import { setToCSV, addLog, kindOf } from "../lib/parse.js";
import { fx, fxQuestion } from "../lib/symbols.js";
import { esc, slug, downloadText, fmtDateTime } from "../lib/util.js";
import { sheet, confirmBox, toast } from "../ui.js";
import { cacheDel } from "../cache.js";

const LETTERS = "ABCDEF";

export async function fetchSet(setId) {
  const snap = await getDoc(doc(db, "sets", setId));
  if (!snap.exists()) throw new Error("missing");
  return { id: snap.id, ...snap.data() };
}

/** Download one set as a CSV that can be uploaded again. */
export async function exportSet(meta) {
  const set = await fetchSet(meta.id);
  downloadText(`${slug(meta.title) || meta.id}-v${meta.version}.csv`, setToCSV(set), "text/csv");
}

export const topicSummary = (set, max = 3) => {
  const t = {}; (set.questions || []).forEach((q) => { t[q.topic || "General"] = (t[q.topic || "General"] || 0) + 1; });
  return Object.entries(t).sort((a, b) => b[1] - a[1]).slice(0, max).map(([k, n]) => `${k} ${n}`).join(", ");
};
export const countAbstract = (set) => (set.questions || []).filter((q) => q.kind === "abstract").length;

/**
 * Write new content for a set: set doc, catalogue entry (count, version, date), bank log, and (optionally) reset per-question stats.
 * Rebuilds the free taster when this set is the one it was built from. Updates `bank` and `meta` in memory.
 */
export async function saveSetContent({ bank, meta, set, type, text, resetQStats = false, rebuildTaster, append = false }) {
  const version = (meta.version || 1) + 1;
  // stableFrom = first version whose question numbers are still valid. Appending keeps it, so students keep their "keep missing" lists.
  const newMeta = { ...meta, count: set.questions.length, version, stableFrom: append ? (meta.stableFrom ?? meta.version ?? 1) : version, updatedAt: Date.now(), abstract: countAbstract(set) };
  const sets = bank.sets.map((x) => (x.id === meta.id ? newMeta : x));
  const log = addLog(bank.log, { type, setId: meta.id, title: meta.title, text });
  const b = writeBatch(db);
  b.set(doc(db, "sets", meta.id), { bankId: bank.id, version, title: meta.title, questions: set.questions, answers: set.answers, updatedAt: serverTimestamp() });
  b.update(doc(db, "banks", bank.id), { sets, setCount: sets.length, version: (bank.version || 1) + 1, log, updatedAt: serverTimestamp() });
  if (resetQStats) b.delete(doc(db, "qStats", meta.id));
  await b.commit(); await cacheDel("set:" + meta.id);
  bank.sets = sets; bank.log = log; bank.version = (bank.version || 1) + 1; Object.assign(meta, newMeta);
  if (rebuildTaster) {
    try { const t = await getDoc(doc(db, "tasters", bank.id)); if (t.exists() && t.data().sourceSetId === meta.id) await rebuildTaster(bank, set, meta.id); } catch { /* the set is saved; the taster can be rebuilt by hand */ }
  }
}

/** Lock or unlock one set. A locked set disappears from students' lists (admins can still open it). */
export async function setLocked({ bank, meta, locked }) {
  const sets = bank.sets.map((x) => (x.id === meta.id ? { ...x, locked, lockedAt: Date.now() } : x));
  const log = addLog(bank.log, { type: locked ? "locked" : "unlocked", setId: meta.id, title: meta.title, text: `${locked ? "Locked" : "Unlocked"} "${meta.title}"` });
  const b = writeBatch(db);
  b.update(doc(db, "banks", bank.id), { sets, version: (bank.version || 1) + 1, log, updatedAt: serverTimestamp() });
  await b.commit();
  bank.sets = sets; bank.log = log; bank.version = (bank.version || 1) + 1;
  Object.assign(meta, { locked, lockedAt: Date.now() });
}

export const logHTML = (bank) => {
  const log = bank.log || [];
  if (!log.length) return '<p class="muted small" style="margin:0">Nothing logged yet. Uploads, edits, locks and deletes will appear here.</p>';
  const live = new Set((bank.sets || []).map((s) => s.id));
  return `<div class="list">${log.map((e) => `<div class="item" style="padding:10px 14px"><div class="grow"><div class="small"><strong>${esc(e.text)}</strong></div><div class="meta">${fmtDateTime(e.at)}</div></div>
    ${e.setId && live.has(e.setId) ? `<button class="btn small ghost" data-logexp="${esc(e.setId)}">Export</button>` : ""}</div>`).join("")}</div>`;
};

/* ---------------- Question editor: edit or delete a single question ---------------- */
export function questionsSheet({ bank, meta, rebuildTaster, onChanged, onClose }) {
  let set = null, q = "", shown = 25, editing = null;
  const s = sheet('<div id="qe"><p class="muted">Loading...</p></div>', { title: `Questions: ${meta.title}`, onClose });
  const box = s.el.querySelector("#qe");
  const fail = () => toast("That didn't work. Please try again.", "bad");

  async function commit(type, text, resetQStats) {
    try { await saveSetContent({ bank, meta, set, type, text, resetQStats, rebuildTaster }); onChanged?.(); return true; }
    catch { fail(); return false; }
  }

  function list() {
    editing = null;
    const needle = q.trim().toLowerCase();
    const rows = set.questions.map((x, i) => ({ x, i })).filter(({ x }) => !needle || `${x.text} ${x.topic} ${x.options.join(" ")}`.toLowerCase().includes(needle));
    box.innerHTML = `<div class="stack-s"><input id="qs" type="search" placeholder="Search questions or topics" value="${esc(q)}" aria-label="Search questions">
      <p class="small muted" style="margin:0">${set.questions.length} questions${countAbstract(set) ? ` · ${countAbstract(set)} abstract` : ""} · version ${meta.version}</p>
      <div class="list">${rows.slice(0, shown).map(({ x, i }) => `<div class="item" style="padding:10px 14px"><div class="grow"><div><strong>Q${i + 1}</strong> <span class="badge">${esc(x.topic || "General")}</span>${x.kind === "abstract" ? ' <span class="badge gold">Abstract</span>' : ""}</div>
        <div class="meta" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(x.text)}</div></div>
        <button class="btn small" data-e="${i}">Edit</button><button class="btn small danger" data-d="${i}">Delete</button></div>`).join("") || '<p class="muted small">No questions match.</p>'}</div>
      ${rows.length > shown ? `<button class="btn ghost block" id="more">Show more (${rows.length - shown} left)</button>` : ""}
      <div class="row" style="justify-content:flex-end"><button class="btn ghost" data-c>Close</button></div></div>`;
    const qs = box.querySelector("#qs");
    qs.oninput = () => { q = qs.value; const pos = qs.selectionStart; shown = 25; list(); const n = box.querySelector("#qs"); n.focus(); n.setSelectionRange(pos, pos); };
    box.querySelector("#more")?.addEventListener("click", () => { shown += 25; list(); });
    box.querySelector("[data-c]").onclick = s.close;
    box.querySelectorAll("[data-e]").forEach((b) => (b.onclick = () => edit(+b.dataset.e)));
    box.querySelectorAll("[data-d]").forEach((b) => (b.onclick = () => del(+b.dataset.d)));
  }

  async function del(i) {
    if (set.questions.length <= 1) return toast("A set needs at least one question. Delete the whole set instead.", "bad");
    // Single question: a simple confirmation (the typed DELETE box is for whole sets).
    if (!(await confirmBox({ title: `Delete question ${i + 1}?`, text: `"${set.questions[i].text.slice(0, 90)}${set.questions[i].text.length > 90 ? "..." : ""}" will be removed. Later questions move up by one number, so this set's per-question stats start afresh.`, okLabel: "Delete", danger: true }))) return;
    const keepQ = set.questions.slice(), keepA = set.answers.slice();
    set.questions.splice(i, 1); set.answers.splice(i, 1);
    if (await commit("question-deleted", `Deleted question ${i + 1} from "${meta.title}" (now ${set.questions.length} questions)`, true)) { toast("Question deleted", "good"); list(); }
    else { set.questions = keepQ; set.answers = keepA; }
  }

  function edit(i) {
    editing = i;
    const x = set.questions[i];
    box.innerHTML = `<div class="stack-s"><label>Question<textarea id="f-q" rows="3" style="min-height:80px;font-family:var(--font);font-size:1rem">${esc(x.text)}</textarea></label>
      ${LETTERS.split("").map((L, k) => `<label>Option ${L}${k < 2 ? "" : " (optional)"}<input id="f-o${k}" value="${esc(x.options[k] || "")}"></label>`).join("")}
      <div class="row wrap" style="gap:12px"><label class="grow">Correct answer<select id="f-a">${LETTERS.split("").map((L, k) => `<option value="${k}" ${set.answers[i] === k ? "selected" : ""}>${L}</option>`).join("")}</select></label>
        <label class="grow">Style<select id="f-k"><option value="normal" ${x.kind === "abstract" ? "" : "selected"}>Normal (exam type)</option><option value="abstract" ${x.kind === "abstract" ? "selected" : ""}>Abstract (real-world scenario)</option></select></label></div>
      <label>Topic<input id="f-t" value="${esc(x.topic || "")}"></label>
      <label>Explanation<textarea id="f-e" rows="3" style="min-height:80px;font-family:var(--font);font-size:1rem">${esc(x.explanation || "")}</textarea></label>
      <label>Question image link (optional)<input id="f-i" value="${esc(x.image || "")}" inputmode="url"></label>
      <label>Explanation image link (optional)<input id="f-ei" value="${esc(x.eimage || "")}" inputmode="url"></label>
      <p class="small muted" style="margin:0">Symbols are converted when you leave a field and when you save (m^-2 → m⁻², H_2O → H₂O, &lt;= → ≤). The image link is never changed.</p>
      <div class="row" style="justify-content:flex-end"><button class="btn ghost" data-b>Back to list</button><button class="btn primary" id="f-save">Save question</button></div></div>`;
    box.querySelectorAll("#f-q,#f-e,#f-t,[id^=f-o]").forEach((el) => el.addEventListener("blur", () => { el.value = fx(el.value); }));
    box.querySelector("[data-b]").onclick = list;
    box.querySelector("#f-save").onclick = async () => {
      const v = (id) => box.querySelector(id).value.trim();
      const rawOpts = LETTERS.split("").map((_, k) => fx(v("#f-o" + k)));
      const last = rawOpts.map((o) => o !== "").lastIndexOf(true), opts = rawOpts.slice(0, last + 1);
      const ans = +v("#f-a");
      if (!v("#f-q")) return toast("The question can't be empty", "bad");
      if (opts.length < 2) return toast("Add at least two options", "bad");
      if (opts.some((o) => o === "")) return toast("Fill the options in order (A, B, C...) with no gaps", "bad");
      if (ans >= opts.length) return toast("The correct answer points at an empty option", "bad");
      const old = { question: x, answer: set.answers[i] };
      set.questions[i] = { text: fx(v("#f-q")), options: opts, image: v("#f-i"), ...(v("#f-ei") ? { eimage: v("#f-ei") } : {}), explanation: fx(v("#f-e")), topic: fx(v("#f-t")) || "General", ...(kindOf(v("#f-k")) === "abstract" ? { kind: "abstract" } : {}) };
      set.answers[i] = ans;
      const btn = box.querySelector("#f-save"); btn.disabled = true;
      if (await commit("question-edited", `Edited question ${i + 1} of "${meta.title}"`, false)) { toast("Question saved", "good"); list(); }
      else { set.questions[i] = old.question; set.answers[i] = old.answer; btn.disabled = false; }
    };
  }

  fetchSet(meta.id).then((d) => { set = { questions: d.questions || [], answers: d.answers || [] }; list(); })
    .catch(() => { box.innerHTML = '<p class="muted">Couldn\'t load this set. Close and try again.</p>'; });
  return s;
}

/* ---------------- One-time conversion of existing questions ---------------- */
/** Run the symbol conversion over every stored set (and taster). Only sets that actually change are rewritten. Returns { sets, fields }. */
export async function convertExisting(banks, rebuildTaster, progress = () => {}) {
  let sets = 0, fields = 0, seen = 0;
  for (const bank of banks) {
    for (const meta of bank.sets || []) {
      progress(++seen);
      const set = await fetchSet(meta.id);
      const n = (set.questions || []).reduce((a, q) => a + fxQuestion(q), 0);
      if (!n) continue;
      await saveSetContent({ bank, meta, set, type: "converted", text: `Converted symbols in "${meta.title}" (${n} fields)`, rebuildTaster });
      sets++; fields += n;
    }
  }
  return { sets, fields };
}
