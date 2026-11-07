// Shared pieces of the play screen (practice quiz, tournaments and group matches), so every quiz looks the same:
// purple page, top row (back, "01 of 10", timer pill), progress bar, one white card with the question and its options,
// then a Back / Next row with a dot for every question. Markup only: each screen wires its own events.
import { esc, optimizeImg } from "./lib/util.js";
import { icon } from "./ui.js";

const two = (n) => String(n).padStart(2, "0");

/** Top row: back/leave button, "03 of 10" and a timer pill. `timerId` is the element whose text the screen updates every second. */
export const topRow = ({ i, total, timerId = "timer", timerText = "0:00", exitLabel = "Leave quiz" }) =>
  `<div class="quiz-top"><button class="sq" id="exit" aria-label="${esc(exitLabel)}">${icon("arrowleft")}</button>
    <span class="cnt">${two(i + 1)} of ${total}</span>
    <span class="tm"><i aria-hidden="true"></i><span id="${timerId}">${esc(timerText)}</span></span></div>`;

/** Slim progress bar: how many questions have an answer so far. */
export const progressBar = (answered, total) =>
  `<div class="qbar bar" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${answered}"><i style="width:${total ? (answered / total) * 100 : 0}%"></i></div>`;

/** Small line above the question: where it comes from, and (optionally) the flag button. */
export const subRow = (label, flag = null) =>
  `<div class="sub"><span class="sub-l">${esc(label)}</span>${flag === null ? "" : `<button class="fb ${flag ? "on" : ""}" id="flag" aria-pressed="${flag}" aria-label="${flag ? "Remove flag" : "Flag this question to come back to it"}">${icon("flag")}</button>`}</div>`;

export const questionBlock = (it) =>
  `${it.image ? `<img class="qimg" src="${esc(optimizeImg(it.image))}" alt="Question image" loading="lazy">` : ""}<h2 class="qt">${esc(it.text)}</h2>`;

/**
 * Option buttons. `reveal` = marking is shown (practice mode after answering): the right one turns green, a wrong pick turns red, all lock.
 * Otherwise the chosen option is simply highlighted purple (`sel`), and can be changed.
 */
/** The picture that goes with an explanation (separate from the question picture). Empty string when there isn't one. */
export const explainImage = (it) => (it && it.eimage ? `<img class="qimg" src="${esc(optimizeImg(it.eimage))}" alt="Explanation picture" loading="lazy" style="margin:8px 0 0">` : "");

export function optionButtons(it, picked, reveal) {
  return `<div class="opts" role="group" aria-label="Answer options">${it.options.map((o, j) => {
    let cls = "", mark = "";
    if (reveal) {
      if (j === it.correct) { cls = "ok right"; mark = icon("check"); }
      else if (j === picked) { cls = "no wrong"; mark = icon("x"); }
    } else if (picked === j) cls = "sel";
    return `<button class="opt ${cls}" data-j="${j}" aria-pressed="${picked === j}" ${reveal ? "disabled" : ""}><span class="otx">${esc(o)}</span><b aria-hidden="true">${mark}</b></button>`;
  }).join("")}</div>`;
}

/** One dot per question: answered (white), flagged (amber), current (green). */
export const dotsRow = (n, cur, isAnswered, isFlagged = () => false) =>
  `<div class="dots" role="group" aria-label="Jump to a question">${Array.from({ length: n }, (_, k) =>
    `<button class="${k === cur ? "cur" : isFlagged(k) ? "fl" : isAnswered(k) ? "ans" : ""}" data-i="${k}" aria-label="Question ${k + 1}${isFlagged(k) ? ", flagged" : isAnswered(k) ? ", answered" : ""}" ${k === cur ? 'aria-current="true"' : ""}></button>`).join("")}</div>`;

/** Back and Next buttons with the dots underneath. */
export const navRow = ({ canBack, nextLabel, dots }) =>
  `<div class="nav2"><button class="btn ghost" id="prev" ${canBack ? "" : "disabled"}>Back</button><button class="btn primary" id="next">${esc(nextLabel)}</button>${dots}</div>`;

/** Wire the dots row: tapping a dot calls go(index). */
export const bindDots = (root, go) => root.querySelector(".dots")?.addEventListener("click", (e) => { const b = e.target.closest("[data-i]"); if (b) go(+b.dataset.i); });
