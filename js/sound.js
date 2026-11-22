// Small synthesised sound effects for practice mode (Web Audio: no files to download, works offline).
// Plays only after a tap, respects a Sound on/off switch saved on this device, and never throws.
import { ls } from "./lib/util.js";

const KEY = "sound_on";
let ctx = null;
export const soundOn = () => ls(KEY) !== false;
export const setSound = (on) => ls(KEY, !!on);

function ac() {
  try { ctx ||= new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === "suspended") ctx.resume(); return ctx; } catch { return null; }
}
// notes: [frequency Hz, start s, length s]
function play(notes, { type = "sine", gain = 0.16 } = {}) {
  if (!soundOn()) return;
  const a = ac(); if (!a) return;
  const t0 = a.currentTime + 0.01;
  for (const [f, at, len] of notes) {
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0 + at);
    g.gain.setValueAtTime(0.0001, t0 + at);
    g.gain.exponentialRampToValueAtTime(gain, t0 + at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
    o.connect(g).connect(a.destination); o.start(t0 + at); o.stop(t0 + at + len + 0.05);
  }
}
export const sfx = {
  correct: () => play([[660, 0, 0.12], [880, 0.1, 0.2]]),
  wrong: () => play([[220, 0, 0.18], [165, 0.14, 0.28]], { type: "triangle", gain: 0.2 }),
  tap: () => play([[520, 0, 0.05]], { gain: 0.08 }),
  next: () => play([[440, 0, 0.06]], { gain: 0.07 }),
  flag: () => play([[740, 0, 0.07], [988, 0.06, 0.07]], { gain: 0.09 }),
  finish: (percent) => play(percent >= 60 ? [[523, 0, 0.14], [659, 0.13, 0.14], [784, 0.26, 0.14], [1047, 0.4, 0.4]] : [[392, 0, 0.2], [330, 0.2, 0.2], [262, 0.4, 0.35]], { gain: 0.15 }),
};
