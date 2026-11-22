// Study library (PDF reader): pure helpers. No Firebase, no DOM.
import { slug } from "./util.js";

export const LEVEL_CHOICES = [[0, "All levels"], [100, "100 level"], [200, "200 level"], [300, "300 level"]];
export const levelName = (l) => (Number(l) > 0 ? `${Number(l)} level` : "All levels");

/**
 * The address of a PDF. Accepts an https:// link or a file inside this app's own folder (for example content/pdf/roadmap.pdf, which you
 * upload to GitHub with the app). Anything else (http, javascript:, data:, ../) is refused. Returns "" when it is not usable.
 */
export function resolvePdfUrl(input, base = "https://example.invalid/app/") {
  const u = String(input || "").trim();
  if (!u || u.length > 400) return "";
  try {
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) { const x = new URL(u); return x.protocol === "https:" ? x.href : ""; }
    if (u.startsWith("/") || u.startsWith("\\") || u.split(/[\\/]/).includes("..")) return "";
    return new URL(u, base).href;
  } catch { return ""; }
}

/** Clean what the admin typed. Returns { ok, error } or { ok, meta, url } (meta goes in library/{id}, url in libraryFiles/{id}). */
export function cleanDoc(f, id, base) {
  const title = String(f.title || "").trim().slice(0, 100), desc = String(f.desc || "").trim().slice(0, 200);
  if (title.length < 3) return { ok: false, error: "Add a title (at least 3 letters)." };
  const raw = String(f.url || "").trim(), abs = resolvePdfUrl(raw, base);
  if (!abs) return { ok: false, error: "The file link must start with https:// or be a file in your app folder like content/pdf/notes.pdf" };
  const level = [0, 100, 200, 300].includes(Number(f.level)) ? Number(f.level) : 0;
  const pages = Math.max(0, Math.min(5000, Math.floor(Number(f.pages) || 0)));
  // A file inside the app folder is stored as typed (content/pdf/x.pdf) so it still works if the app moves to another address.
  const url = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? abs : raw.replace(/\\/g, "/");
  return { ok: true, url, meta: { title, desc, level, access: f.access === "free" ? "free" : "paid", pages } };
}

export const newDocId = (title, rand = Math.random) => (slug(title) || "doc").slice(0, 40) + "-" + rand().toString(36).slice(2, 6);

/** Can this student open it? Free documents are open to every signed-in student; the rest need paid (or free-for-all) access. */
export const canRead = (item, paid) => !!item && (item.access === "free" || !!paid);

/** The list a student sees. `level` 0 = everything; a level shows that level plus the "all levels" documents. */
export function visibleDocs(items, { level = 0, q = "" } = {}) {
  const s = String(q || "").trim().toLowerCase();
  return (items || [])
    .filter((d) => (!level || !d.level || d.level === level) && (!s || `${d.title} ${d.desc || ""}`.toLowerCase().includes(s)))
    .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
}

export const posKey = (uid, id) => `pdfpos_${uid}_${id}`;
/** Friendly text for a failure while opening a PDF. */
export function openError(e, online = true) {
  const n = String(e?.name || ""), m = String(e?.message || "");
  if (!online) return "You're offline. Connect to the internet to read this document.";
  if (n === "PasswordException") return "This PDF is password protected, so it can't be shown here.";
  if (n === "InvalidPDFException") return "This file isn't a readable PDF.";
  if (n === "MissingPDFException" || /404|not found/i.test(m)) return "The file wasn't found. It may have been moved. Please tell us on WhatsApp.";
  if (/network|fetch|cors|failed to/i.test(m) || n === "UnexpectedResponseException") return "Couldn't download the file. Check your connection and try again.";
  return "Couldn't open this document right now. Please try again.";
}
