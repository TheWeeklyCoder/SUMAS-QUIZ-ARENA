// Timed, no-feedback play screen used by group matches. Questions are shuffled per student (same maths as practice),
// answers can be changed until submit, progress survives a reload on this phone, and the screen submits itself just before the deadline.
import { go } from "../router.js";
import { prepareQuiz } from "../lib/quiz.js";
import { toEntryAnswers } from "../lib/tournament.js";
import { esc, fmtDur, ls, optimizeImg } from "../lib/util.js";
import { confirmBox, hint, icon } from "../ui.js";
import { topRow, progressBar, subRow, questionBlock, optionButtons, dotsRow, navRow, bindDots } from "../qview.js";

const LETTERS = "ABCDEF";

/**
 * opts: { questions, seed, endsAtMs, label, resumeKey, backHref, startedAtMs,
 *         submit(answers, durationSec) -> Promise<"ok"|"pending"|"denied">, onDone(result) }
 */
export function runPlay(ctx, opts) {
  const root = ctx.view, { questions, endsAtMs, label, resumeKey } = opts;
  const items = prepareQuiz({ questions, answers: Array(questions.length).fill(0) }, opts.seed), total = items.length;
  let picks = Array(total).fill(null), i = 0, submitted = false;
  const saved = ls(resumeKey);
  if (saved && saved.n === total) { picks = saved.picks; i = Math.min(saved.i, total); }
  const t0 = saved?.t0 || Math.max(Date.now(), opts.startedAtMs || 0);
  const persist = () => ls(resumeKey, { n: total, picks, i, t0 });
  persist();

  const left = () => Math.max(0, endsAtMs - Date.now());
  const clock = () => (left() > 0 ? fmtDur(left() / 1000) + " left" : "Time's up");
  const tick = setInterval(() => {
    const c = root.querySelector("#left"); if (c) c.textContent = clock();
    if (!submitted && left() <= 2500) doSubmit(true);
  }, 500);
  ctx.onLeave(() => clearInterval(tick));

  function renderQ() {
    if (i >= total) return renderReview();
    const it = items[i], picked = picks[i];
    root.innerHTML = `<div class="qplay">${topRow({ i, total, timerId: "left", timerText: clock(), exitLabel: "Leave" })}${progressBar(picks.filter((p) => p !== null).length, total)}
      <div class="card qcard">${subRow(label)}${questionBlock(it)}${optionButtons(it, picked, false)}</div>
      ${navRow({ canBack: i > 0, nextLabel: i + 1 === total ? "Review answers" : picked === null ? "Skip" : "Next", dots: dotsRow(total, i, (k) => picks[k] !== null) })}</div>`;
    root.querySelector("#exit").onclick = async () => { if (await confirmBox({ title: "Leave for now?", text: "Your answers on this phone are kept, and the clock keeps running. Come back before time is up to finish.", okLabel: "Leave" })) go(opts.backHref.replace(/^#/, "")); };
    root.querySelectorAll(".opt").forEach((b) => (b.onclick = () => { picks[i] = picks[i] === +b.dataset.j ? null : +b.dataset.j; persist(); renderQ(); }));
    root.querySelector("#next").onclick = () => { i++; persist(); renderQ(); window.scrollTo(0, 0); };
    root.querySelector("#prev").onclick = () => { if (i > 0) { i--; persist(); renderQ(); window.scrollTo(0, 0); } };
    bindDots(root, (k) => { i = k; persist(); renderQ(); window.scrollTo(0, 0); });
  }

  function renderReview() {
    const answered = picks.filter((p) => p !== null).length;
    root.innerHTML = `<div class="stack-l"><header><h1>Ready to submit?</h1><p class="muted" style="margin:0">${answered} of ${total} answered. <span id="left">${clock()}</span>.</p></header>
      <div class="chips" aria-label="Jump to a question">${items.map((_, k) => `<button class="chip" data-k="${k}" aria-pressed="${picks[k] !== null}" aria-label="Question ${k + 1}${picks[k] === null ? ", blank" : ""}">${k + 1}</button>`).join("")}</div>
      <div class="stack-s"><button class="btn primary block" id="submit">Submit my answers</button><button class="btn ghost block" id="again">Back to questions</button></div>
      ${hint("If time runs out, your answers so far are sent automatically. Stay online.", "info")}</div>`;
    root.querySelectorAll("[data-k]").forEach((b) => (b.onclick = () => { i = +b.dataset.k; persist(); renderQ(); }));
    root.querySelector("#again").onclick = () => { i = total - 1; persist(); renderQ(); };
    root.querySelector("#submit").onclick = () => doSubmit(false);
  }

  async function doSubmit(auto) {
    if (submitted) return;
    if (auto) document.querySelectorAll(".sheet-back").forEach((e) => e.remove());   // time ran out while the confirm box was open
    if (!auto && !(await confirmBox({ title: "Submit your answers?", text: "This is final. You can't change them afterwards.", okLabel: "Submit" }))) return;
    if (submitted) return;                                                           // the clock may have submitted while the box was open
    submitted = true; clearInterval(tick);
    root.innerHTML = '<div class="card center stack"><h2 style="margin:0">Sending your answers...</h2><p class="muted" style="margin:0">Please keep this screen open.</p></div>';
    const sec = Math.max(0, Math.round((Math.min(Date.now(), endsAtMs) - t0) / 1000));
    const r = await opts.submit(toEntryAnswers(items, picks, total), sec);
    if (r !== "denied") ls(resumeKey, null);
    opts.onDone(r);
  }
  renderQ();
}
