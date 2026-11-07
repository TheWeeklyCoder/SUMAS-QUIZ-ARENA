// Small pure helpers. No Firebase and no DOM needed except where noted.
/** Shorten a nickname for display so it can never wrap or overflow: anything over `max` characters ends in "...". */
export const NICK_MAX = 14;
export const short = (s, max = NICK_MAX) => { const a = Array.from(String(s ?? "")); return a.length > max ? a.slice(0, max).join("") + "..." : a.join(""); };
/** A quote is a plain string (built in) or { t, by } (added in Admin). Returns the text to show, with the optional reference. */
export const quoteLine = (q) => (q && typeof q === "object" ? (q.by ? `${q.t} (${q.by})` : q.t) : String(q ?? ""));
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Safe localStorage. ls(key) reads, ls(key, value) writes, ls(key, null) removes. Never throws. */
export function ls(key, val) {
  try {
    if (val === undefined) {
      const v = localStorage.getItem(key);
      return v === null ? null : JSON.parse(v);
    }
    if (val === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(val));
  } catch { /* private mode or storage blocked */ }
  return null;
}

/** Firestore Timestamp | number | Date | {seconds} -> milliseconds (or null). */
export function toMillis(t) {
  if (t == null) return null;
  if (typeof t === "number") return t;
  if (typeof t.toMillis === "function") return t.toMillis();
  if (typeof t.seconds === "number") return t.seconds * 1000 + Math.floor((t.nanoseconds || 0) / 1e6);
  const d = new Date(t).getTime();
  return Number.isNaN(d) ? null : d;
}

export const fmtDate = (ms) => (ms ? new Date(ms).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : "—");
export const fmtDateTime = (ms) => (ms ? new Date(ms).toLocaleString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—");
export const fmtDur = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
export const naira = (n) => (n == null || Number.isNaN(Number(n)) ? "—" : "₦" + Math.round(Number(n)).toLocaleString("en-NG"));
export const daysLeft = (ms, now = Date.now()) => Math.max(0, Math.ceil((ms - now) / 86400000));
export const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

export const slug = (s) =>
  String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

/** Local calendar day as YYYY-MM-DD. */
export function dayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
/** Monday of the week containing d, as YYYY-MM-DD. */
export function weekKey(d = new Date()) {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return dayKey(m);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function debounce(fn, ms = 300) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
export const timeout = (promise, ms) =>
  Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error("timeout"), { code: "timeout" })), ms))]);

/** Resolve a write promise into 'ok' | 'pending' (still queued / offline) | 'denied'. */
export async function settle(promise, ms = 5000) {
  try {
    await timeout(promise, ms);
    return "ok";
  } catch (e) {
    return e && e.code === "permission-denied" ? "denied" : "pending";
  }
}

export const plain = (o) => JSON.parse(JSON.stringify(o));

export function downloadText(filename, text, mime = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function csvEscape(v) {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const toCSV = (rows) => rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");

/** Insert Cloudinary auto format/quality into a delivery URL. Other URLs are returned unchanged. */
export function optimizeImg(url) {
  if (!url) return "";
  return /res\.cloudinary\.com\/.+\/image\/upload\//.test(url) && !/\/upload\/(f_auto|q_auto)/.test(url)
    ? url.replace("/image/upload/", "/image/upload/f_auto,q_auto/")
    : url;
}

export const randomFrom = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Deep copy that turns Firestore timestamps into ISO strings, so a backup is plain readable JSON. */
export function jsonSafe(v) {
  if (v == null || typeof v !== "object") return v;
  if (typeof v.toMillis === "function") return new Date(v.toMillis()).toISOString();
  if (Array.isArray(v)) return v.map(jsonSafe);
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, jsonSafe(x)]));
}
