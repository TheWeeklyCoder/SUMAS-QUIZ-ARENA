// Parse and validate an uploaded question set (JSON or CSV). Pure, so it can be tested in Node.
import { fx } from "./symbols.js";
import { toCSV } from "./util.js";
const LETTERS = "ABCDEF";
const MAX_BYTES = 900_000; // Firestore documents are capped at 1 MiB; leave headroom.

/** RFC 4180-ish CSV parser: quotes, escaped quotes, commas and newlines inside quotes. */
export function parseCSV(text) {
  const rows = []; let row = []; let cur = ""; let q = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((v) => v.trim() !== "")) rows.push(row);
  return rows;
}

function csvToRawQuestions(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error("The CSV needs a header row and at least one question.");
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name) => head.indexOf(name);
  const qi = col("question");
  if (qi < 0) throw new Error('The CSV needs a "question" column.');
  const optCols = LETTERS.split("").map((L) => col(L.toLowerCase())).filter((i) => i >= 0);
  if (optCols.length < 2) throw new Error('The CSV needs option columns named A, B, C, D (E and F are optional).');
  const get = (r, name) => { const i = col(name); return i >= 0 ? (r[i] ?? "").trim() : ""; };
  return rows.slice(1).map((r) => ({
    question: (r[qi] ?? "").trim(),
    options: (() => { const o = optCols.map((i) => (r[i] ?? "").trim()); while (o.length && o[o.length - 1] === "") o.pop(); return o; })(),   // keep blanks in the middle so parseSet can flag them
    answer: get(r, "answer"),
    topic: get(r, "topic"),
    explanation: get(r, "explanation"),
    image: get(r, "image"),
    eimage: get(r, "explanation_image") || get(r, "explanation image") || get(r, "eimage"),
    kind: get(r, "kind") || get(r, "type"),
  }));
}

/** Question style: "normal" (the usual exam-type question) or "abstract" (complex, real-world application or scenario). Blank means normal. */
export function kindOf(v) {
  const s = String(v ?? "").trim().toLowerCase();
  return /^(abs|scen|appl|case|complex)/.test(s) ? "abstract" : "normal";
}

function answerIndex(a, nOpts) {
  if (typeof a === "number" && Number.isInteger(a)) return a;           // 0-based index
  const s = String(a ?? "").trim().toUpperCase();
  if (/^[A-F]$/.test(s)) return LETTERS.indexOf(s);                     // letter
  return -1;
}

/**
 * Accepts: a JSON string / object ({title, questions:[...]} or a bare array) or CSV text.
 * Each question: question|text|q, options[], answer (letter A-F or 0-based number), topic, explanation, image.
 * Returns { title, questions, answers, errors, warnings, topics }.
 */
export function parseSet(input) {
  const errors = []; const warnings = [];
  let title = ""; let raw;
  const text = typeof input === "string" ? input.trim() : null;
  try {
    if (text !== null && !/^[\[{]/.test(text)) raw = csvToRawQuestions(text);
    else {
      const j = text !== null ? JSON.parse(text) : input;
      raw = Array.isArray(j) ? j : j.questions;
      title = (!Array.isArray(j) && j.title) || "";
      if (!Array.isArray(raw)) throw new Error('JSON needs a "questions" array.');
    }
  } catch (e) {
    return { title, questions: [], answers: [], errors: [e.message], warnings, topics: {}, converted: 0 };
  }

  // Math and symbol auto-conversion (m^-2 to m⁻², H_2O to H₂O, <= to ≤ ...). Text fields only: the image link is never touched.
  let converted = 0;
  const cv = (v) => { const out = fx(v); if (out !== v) converted++; return out; };
  title = cv(String(title || "").trim());

  const questions = []; const answers = []; const topics = {}; const seenText = new Map();
  raw.forEach((r, i) => {
    const n = i + 1;
    const qText = cv(String(r.question ?? r.text ?? r.q ?? "").trim());
    const rawOpts = (Array.isArray(r.options) ? r.options : []).map((o) => cv(String(o ?? "").trim()));
    const options = rawOpts.filter((o) => o !== "");
    if (rawOpts.findIndex((o) => o === "") >= 0 && rawOpts.findIndex((o) => o === "") < rawOpts.map((o) => o !== "").lastIndexOf(true))
      errors.push(`Question ${n}: an option is blank in the middle (A, B, C... must be filled in order), so the answer letter would point at the wrong option.`);
    const ans = answerIndex(r.answer, options.length);
    if (!qText) errors.push(`Question ${n}: the question text is empty.`);
    if (options.length < 2 || options.length > 6) errors.push(`Question ${n}: needs 2 to 6 options (found ${options.length}).`);
    else if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) warnings.push(`Question ${n}: two options look identical.`);
    if (ans < 0 || ans >= options.length) errors.push(`Question ${n}: the answer is missing or doesn't match an option (use A-F).`);
    let topic = cv(String(r.topic ?? "").trim());
    if (!topic) { topic = "General"; warnings.push(`Question ${n}: no topic, filed under "General". Tagging topics powers weak-topic analysis.`); }
    topics[topic] = (topics[topic] || 0) + 1;
    const dupKey = qText.toLowerCase().replace(/\s+/g, " ");
    if (dupKey) { if (seenText.has(dupKey)) warnings.push(`Question ${n} has the same text as question ${seenText.get(dupKey)}.`); else seenText.set(dupKey, n); }
    questions.push({ text: qText, options, image: String(r.image ?? "").trim(), ...(String(r.eimage ?? r.explanation_image ?? "").trim() ? { eimage: String(r.eimage ?? r.explanation_image).trim() } : {}), explanation: cv(String(r.explanation ?? "").trim()), topic, ...(kindOf(r.kind ?? r.type) === "abstract" ? { kind: "abstract" } : {}) });
    answers.push(ans);
  });

  if (questions.length < 50 || questions.length > 200) warnings.push(`This set has ${questions.length} questions. The plan is 50 to 200 per set.`);
  const bytes = new TextEncoder().encode(JSON.stringify({ questions, answers })).length;
  if (bytes > MAX_BYTES) errors.push(`This set is about ${(bytes / 1e6).toFixed(2)} MB. Keep each set under 0.9 MB (split it in two).`);
  const abstractCount = questions.filter((q) => q.kind === "abstract").length;
  return { title, questions, answers, abstractCount, errors: errors.slice(0, 30), warnings: warnings.slice(0, 30), topics, bytes, converted };
}

export const SAMPLE_JSON = JSON.stringify({
  title: "Anatomy Set 1",
  questions: [
    { question: "Which bone is the longest in the human body?", options: ["Tibia", "Femur", "Humerus", "Fibula"], answer: "B", topic: "Skeletal system", explanation: "The femur (thigh bone) is the longest and strongest bone." },
    { question: "Normal resting heart rate for an adult is about?", options: ["20 to 40", "60 to 100", "120 to 160", "180 to 200"], answer: "B", topic: "Cardiovascular", explanation: "60 to 100 beats per minute.", kind: "normal" },
    { question: "A 25-year-old athlete has a resting pulse of 48 bpm and feels well. What is the best explanation?", options: ["Heart block", "Increased vagal tone from training", "Hypothyroidism", "Dehydration"], answer: "B", topic: "Cardiovascular", explanation: "Training raises vagal tone and stroke volume, so a lower resting rate is normal.", kind: "abstract" },
  ],
}, null, 2);

export const SAMPLE_CSV =
  'question,A,B,C,D,E,answer,topic,explanation,image,explanation_image,kind\r\n' +
  '"Which bone is the longest in the human body?",Tibia,Femur,Humerus,Fibula,,B,Skeletal system,"The femur (thigh bone) is the longest and strongest bone.",,,normal\r\n' +
  '"Normal resting heart rate for an adult is about?","20 to 40","60 to 100","120 to 160","180 to 200",,B,Cardiovascular,"60 to 100 beats per minute.",,,normal\r\n' +
  '"A 25-year-old athlete has a resting pulse of 48 bpm and feels well. What is the best explanation?","Heart block","Increased vagal tone from training","Hypothyroidism","Dehydration",,B,Cardiovascular,"Training raises vagal tone and stroke volume, so a lower resting rate is normal.",,,abstract\r\n';

/** The same columns with no example rows, for filling in from scratch. */
export const BLANK_CSV = "question,A,B,C,D,E,F,answer,topic,explanation,image,explanation_image,kind\r\n";

/** A stored set ({questions, answers}) back to CSV in the same format the upload accepts, so an export can be uploaded again. */
export const SET_CSV_HEAD = ["question", "A", "B", "C", "D", "E", "F", "answer", "topic", "explanation", "image", "explanation_image", "kind"];
export const setToRows = (set) => (set.questions || []).map((q, i) => [q.text, ...LETTERS.split("").map((_, k) => q.options?.[k] ?? ""), LETTERS[set.answers?.[i]] ?? "", q.topic || "", q.explanation || "", q.image || "", q.eimage || "", q.kind === "abstract" ? "abstract" : "normal"]);
export function setToCSV(set) { return "\uFEFF" + toCSV([SET_CSV_HEAD, ...setToRows(set)]); }

/** Add an entry to a bank's update log (newest first, capped). */
export function addLog(log, entry, max = 40) {
  return [{ at: Date.now(), ...entry, text: String(entry.text || "").slice(0, 200) }, ...(Array.isArray(log) ? log : [])].slice(0, max);
}
