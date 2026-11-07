// Math and symbol auto-conversion (pure, no DOM). Ported from QuizForge and made safe for links.
//   m^-2 → m⁻²   s^(-1) → s⁻¹   x^{2} → x²   x^n → xⁿ   H_2O → H₂O   a_{12} → a₁₂
//   3 x 10^8 → 3 × 10⁸   30^o → 30°   <= ≤   >= ≥   != ≠   +- ±   ~= ≈   sqrt( → √(
// Only digits, + − = ( ) and the letters n and i have superscript forms, so x^y stays as typed.
// It is NEVER applied to links or image URLs: web addresses inside a text are left alone, and image fields are not passed through here at all.

const SP = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹", "+": "⁺", "-": "⁻", "−": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ" };
const SB = { 0: "₀", 1: "₁", 2: "₂", 3: "₃", 4: "₄", 5: "₅", 6: "₆", 7: "₇", 8: "₈", 9: "₉", "+": "₊", "-": "₋", "−": "₋", "=": "₌", "(": "₍", ")": "₎" };

/** Map every character through `m`; returns null if any character has no form (so the original text is kept). */
const mp = (t, m) => { let r = ""; for (const c of t) { if (!m[c]) return null; r += m[c]; } return r; };
const sw = (orig, inner, m) => { const r = mp(inner, m); return r === null ? orig : r; };

const URL_RE = /((?:https?:\/\/|www\.)[^\s"'<>]+)/gi;

function convert(t) {
  return t
    .replace(/\^o(?![A-Za-z])/g, "°")
    .replace(/\^\{([^}]*)\}/g, (a, b) => sw(a, b, SP))
    .replace(/\^\(([^)]*)\)/g, (a, b) => sw(a, b, SP))
    .replace(/\^([+\-−]?\d+)/g, (a, b) => sw(a, b, SP))
    .replace(/\^([ni])(?![A-Za-z])/g, (a, b) => SP[b])
    .replace(/_\{([^}]*)\}/g, (a, b) => sw(a, b, SB))
    .replace(/([A-Za-z)\]])_(\d+)/g, (a, p, b) => p + mp(b, SB))
    .replace(/(\d)\s*[xX*]\s*(10[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+)/g, "$1 × $2")
    .replace(/<=/g, "≤").replace(/>=/g, "≥").replace(/!=/g, "≠")
    .replace(/\+\/-|\+-/g, "±").replace(/~=/g, "≈").replace(/sqrt\(/g, "√(");
}

/** Convert one piece of text. Non-strings are returned untouched. Web addresses inside the text are skipped. */
export function fx(t) {
  if (typeof t !== "string" || !t) return t;
  if (!/[\^_<>!+~]|sqrt\(/.test(t)) return t;                 // fast path: nothing that could change
  return t.split(URL_RE).map((part, i) => (i % 2 ? part : convert(part))).join("");
}

/** Convert every text field of a question ({text|question, options[], explanation, topic}); `image` is never touched. Returns how many fields changed. */
export function fxQuestion(q) {
  let changed = 0;
  const f = (v) => { const r = fx(v); if (r !== v) changed++; return r; };
  if (typeof q.text === "string") q.text = f(q.text);
  if (typeof q.question === "string") q.question = f(q.question);
  if (Array.isArray(q.options)) q.options = q.options.map(f);
  if (typeof q.explanation === "string") q.explanation = f(q.explanation);
  if (typeof q.topic === "string") q.topic = f(q.topic);
  return changed;
}

/** Convert a whole set ({questions:[...]}) in place. Returns the number of fields changed. */
export function fxSet(set) { let n = 0; for (const q of set?.questions || []) n += fxQuestion(q); return n; }
