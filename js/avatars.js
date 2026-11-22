// Profile pictures: 12 original SVG characters a student can pick. No image files, so they work offline and never cost a download.
// The choice is stored inside the existing profile field `avatarColor` as "<colour>|<id>" (for example "#ff9a3c|fox"), so the Firestore rules
// did not need to change and every old plain-colour profile keeps working (it simply shows its letter, as before).
import { esc } from "./lib/util.js";

const K = "#0f172a";                                   // outline / features
const eye = (x, y, r = 2.6) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${K}"/>`;
const eyes = (y = 34, dx = 8, r = 2.6) => eye(32 - dx, y, r) + eye(32 + dx, y, r);
const g = (inner) => `<g stroke="${K}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">${inner}</g>`;

export const AVATARS = [
  { id: "fox", name: "Fox", bg: "#ffd36b", art: g(`<polygon points="13,28 18,6 32,19" fill="#f97316"/><polygon points="51,28 46,6 32,19" fill="#f97316"/><ellipse cx="32" cy="38" rx="20" ry="18" fill="#f97316"/><path d="M12 40 Q32 62 52 40 Q44 47 32 47 Q20 47 12 40Z" fill="#fff7ed"/>`) + eyes(35) + `<circle cx="32" cy="47" r="3" fill="${K}"/>` },
  { id: "cat", name: "Cat", bg: "#f7b6e8", art: g(`<polygon points="14,30 14,8 29,19" fill="#94a3b8"/><polygon points="50,30 50,8 35,19" fill="#94a3b8"/><ellipse cx="32" cy="38" rx="19" ry="17" fill="#94a3b8"/><path d="M6 38h12M6 44l11-2M58 38H46M58 44l-11-2" fill="none"/><path d="M29 46q3 3 6 0" fill="none"/>`) + eyes(35) + `<polygon points="29.5,41 34.5,41 32,44" fill="#fb7185" stroke="${K}" stroke-width="1.5"/>` },
  { id: "owl", name: "Owl", bg: "#9dbbff", art: g(`<polygon points="14,24 16,6 28,16" fill="#a16207"/><polygon points="50,24 48,6 36,16" fill="#a16207"/><ellipse cx="32" cy="40" rx="21" ry="20" fill="#a16207"/><circle cx="23" cy="34" r="9" fill="#fff"/><circle cx="41" cy="34" r="9" fill="#fff"/><polygon points="28,42 36,42 32,50" fill="#fbbf24"/>`) + eye(24, 34, 3.5) + eye(40, 34, 3.5) },
  { id: "panda", name: "Panda", bg: "#8fd9a8", art: g(`<circle cx="15" cy="17" r="8" fill="${K}"/><circle cx="49" cy="17" r="8" fill="${K}"/><ellipse cx="32" cy="37" rx="21" ry="19" fill="#fff"/><ellipse cx="22" cy="34" rx="6" ry="8" fill="${K}" transform="rotate(20 22 34)"/><ellipse cx="42" cy="34" rx="6" ry="8" fill="${K}" transform="rotate(-20 42 34)"/>`) + `<circle cx="23" cy="34" r="2" fill="#fff"/><circle cx="41" cy="34" r="2" fill="#fff"/><ellipse cx="32" cy="45" rx="3.5" ry="2.6" fill="${K}"/>` },
  { id: "bear", name: "Bear", bg: "#ffb08a", art: g(`<circle cx="15" cy="18" r="8" fill="#92400e"/><circle cx="49" cy="18" r="8" fill="#92400e"/><ellipse cx="32" cy="37" rx="20" ry="19" fill="#92400e"/><ellipse cx="32" cy="45" rx="10" ry="8" fill="#fcd9b6"/>`) + eyes(33, 9) + `<ellipse cx="32" cy="43" rx="3.5" ry="2.6" fill="${K}"/>` },
  { id: "rabbit", name: "Rabbit", bg: "#c4b5fd", art: g(`<ellipse cx="22" cy="14" rx="6" ry="14" fill="#fff"/><ellipse cx="42" cy="14" rx="6" ry="14" fill="#fff"/><ellipse cx="22" cy="15" rx="2.5" ry="9" fill="#fda4af" stroke="none"/><ellipse cx="42" cy="15" rx="2.5" ry="9" fill="#fda4af" stroke="none"/><ellipse cx="32" cy="42" rx="19" ry="17" fill="#fff"/><path d="M29 49q3 3 6 0" fill="none"/>`) + eyes(40, 8) + `<ellipse cx="32" cy="45" rx="2.6" ry="2" fill="#fb7185"/>` },
  { id: "lion", name: "Lion", bg: "#fde68a", art: g(`<circle cx="32" cy="36" r="26" fill="#b45309"/><circle cx="32" cy="38" r="17" fill="#fbbf24"/><ellipse cx="32" cy="45" rx="8" ry="6" fill="#fef3c7" stroke="none"/><path d="M29 48q3 3 6 0" fill="none"/>`) + eyes(36, 7) + `<polygon points="29.5,41 34.5,41 32,44.5" fill="${K}"/>` },
  { id: "penguin", name: "Penguin", bg: "#bae6fd", art: g(`<ellipse cx="32" cy="40" rx="21" ry="22" fill="${K}"/><ellipse cx="32" cy="45" rx="14" ry="16" fill="#fff"/><polygon points="27,38 37,38 32,45" fill="#fb923c"/>`) + `<circle cx="25" cy="31" r="2.6" fill="${K}"/><circle cx="39" cy="31" r="2.6" fill="${K}"/><circle cx="25.8" cy="30.2" r=".9" fill="#fff"/><circle cx="39.8" cy="30.2" r=".9" fill="#fff"/>` },
  { id: "robot", name: "Robot", bg: "#a7f3d0", art: g(`<line x1="32" y1="6" x2="32" y2="15" fill="none"/><circle cx="32" cy="6" r="3.5" fill="#fb7185"/><rect x="11" y="15" width="42" height="38" rx="11" fill="#cbd5e1"/><rect x="6" y="28" width="5" height="12" rx="2" fill="#94a3b8"/><rect x="53" y="28" width="5" height="12" rx="2" fill="#94a3b8"/><rect x="18" y="26" width="28" height="12" rx="6" fill="${K}"/><path d="M24 46h16" fill="none"/>`) + `<circle cx="25" cy="32" r="3" fill="#34d399"/><circle cx="39" cy="32" r="3" fill="#34d399"/>` },
  { id: "astronaut", name: "Astronaut", bg: "#c7d2fe", art: g(`<circle cx="32" cy="34" r="24" fill="#fff"/><rect x="14" y="22" width="36" height="24" rx="12" fill="#1e3a8a"/><path d="M22 28q4-3 8-1" fill="none" stroke="#93c5fd"/><rect x="26" y="52" width="12" height="8" rx="3" fill="#fb923c"/>`) },
  { id: "scholar", name: "Scholar", bg: "#ffc62b", art: g(`<path d="M10 64q2-14 22-14t22 14z" fill="#fff"/><circle cx="32" cy="41" r="15" fill="#a0643b"/><path d="M18 25v7q14 7 28 0v-7" fill="#1e293b"/><polygon points="32,6 58,17 32,28 6,17" fill="${K}"/><path d="M54 18v15" fill="none" stroke="#fbbf24"/><circle cx="54" cy="35" r="2.5" fill="#fbbf24"/><path d="M27 48q5 4 10 0" fill="none"/>`) + eyes(42, 6, 2.2) },
  { id: "doctor", name: "Doctor", bg: "#fecaca", art: g(`<path d="M8 64q2-15 24-15t24 15z" fill="#fff"/><path d="M24 50q-2 8 4 10M40 50q2 8-4 10" fill="none" stroke="#2563eb"/><circle cx="28" cy="61" r="2.5" fill="#2563eb"/><circle cx="32" cy="34" r="15" fill="#8d5524"/><path d="M16 32q0-16 16-16t16 16q-8-8-16-8t-16 8z" fill="${K}"/><path d="M27 41q5 4 10 0" fill="none"/>`) + eyes(35, 6, 2.2) },
];

/* ---------- Extra pictures added by the admin (settings/avatars) ---------- */
const OK_TAGS = new Set(["g", "path", "circle", "ellipse", "rect", "polygon", "polyline", "line", "defs", "lineargradient", "radialgradient", "stop", "clippath"]);
const OK_ATTRS = new Set(["d", "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "y1", "x2", "y2", "width", "height", "points", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-dasharray", "opacity", "fill-opacity", "stroke-opacity", "fill-rule", "clip-rule", "transform", "offset", "stop-color", "stop-opacity", "id", "gradientunits", "gradienttransform", "clip-path", "fx", "fy"]);
const CASE = { lineargradient: "linearGradient", radialgradient: "radialGradient", clippath: "clipPath", gradientunits: "gradientUnits", gradienttransform: "gradientTransform" };
export const MAX_SVG_CHARS = 12000;

/**
 * Make an SVG safe to put on every student's screen. Accepts a whole <svg>…</svg> file or just the shapes, and rebuilds it from an
 * allow-list: only simple drawing shapes and plain presentation attributes survive. Scripts, event handlers (onclick…), links, images,
 * foreignObject, <style>, external references and anything unknown are dropped. Returns { art, error }.
 */
export function sanitizeSvg(input) {
  let src = String(input || "").replace(/<\?xml[^>]*\?>|<!DOCTYPE[^>]*>|<!--[\s\S]*?-->/gi, "").trim();
  if (!src) return { art: "", error: "Paste the SVG code or choose an .svg file." };
  if (src.length > MAX_SVG_CHARS) return { art: "", error: `That SVG is too big (${src.length} characters, limit ${MAX_SVG_CHARS}). Simplify it.` };
  src = src.replace(/<(script|style|foreignObject|image|use|a|animate|set|text|title|desc|metadata)\b[\s\S]*?<\/\1\s*>/gi, "");
  let wrap = "";
  const root = src.match(/<svg\b([^>]*)>/i);
  if (root) {
    const vb = (root[1].match(/viewBox\s*=\s*["']([^"']+)["']/i) || [])[1];
    if (vb) {
      const [x, y, w, h] = vb.trim().split(/[\s,]+/).map(Number);
      if ([x, y, w, h].every(Number.isFinite) && w > 0 && h > 0 && !(x === 0 && y === 0 && w === 64 && h === 64)) {
        const k = +(64 / Math.max(w, h)).toFixed(4);
        wrap = `scale(${k}) translate(${-x} ${-y})`;
      }
    }
  }
  const out = [], stack = [];
  const tag = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>/g;
  let m;
  while ((m = tag.exec(src))) {
    const [, close, rawName, attrs, self] = m, name = rawName.toLowerCase();
    if (!OK_TAGS.has(name)) continue;
    const el = CASE[name] || name;
    if (close) { const i = stack.lastIndexOf(el); if (i >= 0) { while (stack.length > i) out.push(`</${stack.pop()}>`); } continue; }
    const kept = [];
    for (const a of attrs.matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      const key = a[1].toLowerCase(), val = (a[2] ?? a[3] ?? "").trim();
      if (!OK_ATTRS.has(key)) continue;
      if (/[<>&]|javascript:|data:|expression\(/i.test(val)) continue;
      if (/url\(/i.test(val) && !/^url\(#[\w-]+\)$/.test(val)) continue;
      kept.push(`${CASE[key] || key}="${val.replace(/"/g, "")}"`);
    }
    out.push(`<${el}${kept.length ? " " + kept.join(" ") : ""}${self ? "/" : ""}>`);
    if (!self) stack.push(el);
  }
  while (stack.length) out.push(`</${stack.pop()}>`);
  let art = out.join("");
  if (!/<(path|circle|ellipse|rect|polygon|polyline|line)\b/.test(art)) return { art: "", error: "No drawable shapes were found. Use paths, circles, rectangles or polygons." };
  if (wrap) art = `<g transform="${wrap}">${art}</g>`;
  return { art, error: "" };
}

let custom = [];
const cleanItem = (it) => {
  if (!it || !/^[a-z0-9-]{2,30}$/.test(it.id || "") || AVATARS.some((a) => a.id === it.id)) return null;
  const { art } = sanitizeSvg(it.art);                       // sanitised again on the way in, whatever is stored
  return art && /^#[0-9a-f]{6}$/i.test(it.bg || "") ? { id: it.id, name: String(it.name || it.id).slice(0, 24), bg: it.bg, art, custom: true } : null;
};
/** Load the admin-added pictures (from settings/avatars). Bad entries are ignored. */
export const setCustomAvatars = (items) => { custom = (Array.isArray(items) ? items : []).map(cleanItem).filter(Boolean).slice(0, 60); };
export const customAvatars = () => custom;

/* Paid-only pictures. Until the admin saves a list, the doctor, scholar and astronaut are reserved for subscribers. */
export const DEFAULT_PREMIUM = ["doctor", "scholar", "astronaut"];
let premium = null;                                            // null = use the default list
export const setPremiumAvatars = (ids) => { premium = Array.isArray(ids) ? ids.filter((x) => typeof x === "string").slice(0, 100) : null; };
export const premiumAvatars = () => premium ?? DEFAULT_PREMIUM;
export const isPremiumAvatar = (id) => premiumAvatars().includes(id);
export const allAvatars = () => [...AVATARS, ...custom];
const byId = (id) => allAvatars().find((a) => a.id === id);

/** "#ff9a3c|fox" -> { color:"#ff9a3c", id:"fox" }. A plain colour has no id. */
export function parseAvatar(v) {
  const s = String(v || ""), i = s.indexOf("|");
  const color = i < 0 ? s : s.slice(0, i), id = i < 0 ? "" : s.slice(i + 1);
  return { color, id: byId(id) ? id : "" };
}
export const makeAvatar = (color, id) => (byId(id) ? `${color || "#10B981"}|${id}` : color || "#10B981");
export const avatarArt = (id) => byId(id) || null;

/** The grid of pictures to choose from. `selected` is the current stored value. */
export const pickerHTML = (selected, paid = true) => {
  const cur = parseAvatar(selected).id;
  return `<div class="avpick" role="radiogroup" aria-label="Profile picture">${allAvatars().map((a) => {
    const lock = !paid && isPremiumAvatar(a.id);
    return `<button type="button" class="avopt ${lock ? "locked" : ""}" role="radio" aria-checked="${a.id === cur}" aria-label="${esc(a.name)}${lock ? " (subscribers only)" : ""}" data-av="${a.id}" ${lock ? 'data-locked="1"' : ""} style="--c:${a.bg}"><svg viewBox="0 0 64 64" aria-hidden="true">${a.art}</svg>${lock ? '<span class="avlock" aria-hidden="true">🔒</span>' : ""}</button>`;
  }).join("")}</div>`;
};

/** Wire the grid: onPick(id) is called on tap, and the ticked state follows. */
export function bindPicker(root, onPick, onLocked = () => {}) {
  root.querySelectorAll("[data-av]").forEach((b) => (b.onclick = () => {
    if (b.dataset.locked) return onLocked(b.dataset.av);
    root.querySelectorAll("[data-av]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
    onPick(b.dataset.av);
  }));
}
