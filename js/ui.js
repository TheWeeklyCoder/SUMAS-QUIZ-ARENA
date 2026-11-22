// Shared UI pieces: icons, avatar, toasts, sheets, hints, rings, skeletons.
import { esc } from "./lib/util.js";
import { parseAvatar, avatarArt } from "./avatars.js";

const PATHS = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
  book: '<path d="M4 4h10a4 4 0 014 4v12H8a4 4 0 01-4-4V4z"/><path d="M4 16a4 4 0 014-4h10"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4z"/><path d="M17 5h3v2a3 3 0 01-3 3M7 5H4v2a3 3 0 003 3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/>',
  logout: '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M3 3l18 18M10.6 5.1A9.7 9.7 0 0112 5c6.4 0 10 7 10 7a17 17 0 01-3.2 4.2M6.6 6.6A17 17 0 002 12s3.6 7 10 7a9.6 9.6 0 004.4-1.1M9.9 9.9a3 3 0 004.2 4.2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 13.2A8.5 8.5 0 1110.8 3a6.7 6.7 0 0010.2 10.2z"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  arrowleft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>',
  bell: '<path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z"/><path d="M10 20a2.2 2.2 0 0 0 4 0"/>',
  share: '<circle cx="6" cy="12" r="2.4"/><circle cx="17" cy="6" r="2.4"/><circle cx="17" cy="18" r="2.4"/><path d="M8.2 11l6.6-3.800M8.2 13l6.6 3.800"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"/>',
  fire: '<path d="M12 22c4 0 7-3 7-7 0-3-2-5-3-7-1 2-2 3-3 3 0-4-2-7-5-9 0 4-3 6-3 11 0 5 3 9 7 9z"/>',
};
export const icon = (name, cls = "") => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${PATHS[name] || ""}</svg>`;

export const AVATAR_COLORS = ["#10B981", "#F5B942", "#60A5FA", "#F472B6", "#A78BFA", "#34D399", "#FB923C", "#22D3EE"];
export const randomAvatarColor = () => AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
export const avatar = (nick, color, size = 40) => {
  const { color: c, id } = parseAvatar(color), art = id && avatarArt(id);
  if (art) return `<span class="avatar pic" style="--c:${esc(art.bg)};--sz:${size}px" role="img" aria-label="${esc(art.name)} profile picture"><svg viewBox="0 0 64 64" aria-hidden="true">${art.art}</svg></span>`;
  return `<span class="avatar" style="--c:${esc(c || "#10B981")};--sz:${size}px" aria-hidden="true">${esc((nick || "?").replace(/^@/, "").charAt(0))}</span>`;
};

export const hint = (text, ic = "info") => `<p class="hint">${icon(ic, "sm")}<span>${esc(text)}</span></p>`;

export const skeleton = (blocks = 3) =>
  `<div class="stack" aria-busy="true" aria-label="Loading">${Array.from({ length: blocks }, () => '<div class="skel block"></div>').join("")}</div>`;

export function toast(msg, kind = "") {
  const box = document.getElementById("toasts"); if (!box) return;
  const t = document.createElement("div");
  t.className = `toast ${kind}`; t.textContent = msg;
  box.append(t);
  setTimeout(() => t.remove(), 3500);
}

/** Progress ring (SVG). */
export function ring(percent, size = 120, label = `${percent}%`) {
  const r = (size - 14) / 2, c = 2 * Math.PI * r, off = c * (1 - Math.min(100, Math.max(0, percent)) / 100);
  const col = percent >= 80 ? "var(--emerald)" : percent >= 50 ? "var(--gold)" : "var(--danger)";
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(label)}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--panel-2)" stroke-width="10"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${col}" stroke-width="10" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${off}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-size="${size / 4.2}">${esc(label)}</text></svg>`;
}

/** Modal bottom sheet. Returns { el, close }. */
const openSheets = [];   // stack: Escape closes only the top-most sheet
/** Close every open sheet (used on navigation, so a sheet never stays on top of a different page). */
export const closeAllSheets = () => { for (const c of [...openSheets].reverse()) c(); };
export function sheet(html, { title = "", onClose } = {}) {
  const back = document.createElement("div");
  back.className = "sheet-back";
  back.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">${title ? `<h2>${esc(title)}</h2>` : ""}${html}</div>`;
  const prev = document.activeElement;
  const close = () => { back.remove(); document.removeEventListener("keydown", onKey); const k = openSheets.indexOf(close); if (k >= 0) openSheets.splice(k, 1); prev?.focus?.(); onClose?.(); };
  const onKey = (e) => { if (e.key === "Escape" && openSheets[openSheets.length - 1] === close) close(); };
  back.addEventListener("click", (e) => { if (e.target === back) close(); });
  document.addEventListener("keydown", onKey); openSheets.push(close);
  document.body.append(back);
  back.querySelector("input,select,textarea,button")?.focus();
  return { el: back.firstElementChild, close };
}

export function confirmBox({ title, text, okLabel = "Confirm", cancelLabel = "Cancel", danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const s = sheet(`<p>${esc(text)}</p><div class="row wrap" style="justify-content:flex-end;margin-top:16px">
      <button class="btn ghost" data-no>${esc(cancelLabel)}</button>
      <button class="btn ${danger ? "danger" : "primary"}" data-yes>${esc(okLabel)}</button></div>`, { title, onClose: () => { if (!done) resolve(false); } });
    s.el.querySelector("[data-no]").onclick = () => { done = true; s.close(); resolve(false); };
    s.el.querySelector("[data-yes]").onclick = () => { done = true; s.close(); resolve(true); };
  });
}

/**
 * Safe delete for big, permanent removals. Shows what will be lost (with the count), an optional "Download backup CSV" button,
 * and only enables the red button once the person has typed the word (DELETE) themselves. Resolves true or false.
 * backup: { label, fn } where fn() may be async (it can fetch the data first).
 */
export function typedConfirm({ title, text, count = null, word = "DELETE", okLabel = "Delete", backup = null }) {
  return new Promise((resolve) => {
    let done = false;
    const s = sheet(`<div class="notice bad stack-s" role="alert">${count !== null ? `<strong style="font-size:1.1rem">${count} question${count === 1 ? "" : "s"} will be permanently deleted.</strong>` : ""}
        <div class="small">${esc(text)}</div><div class="small"><strong>This can't be undone.</strong></div></div>
      ${backup ? `<button class="btn ghost block" type="button" data-bk style="margin-top:12px">${esc(backup.label || "Download backup CSV")}</button>` : ""}
      <label style="margin-top:12px">Type <strong>${esc(word)}</strong> to confirm<input data-w autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="${esc(word)}"></label>
      <div class="row wrap" style="justify-content:flex-end;margin-top:16px"><button class="btn ghost" data-no>Cancel</button><button class="btn danger" data-yes disabled>${esc(okLabel)}</button></div>`,
      { title, onClose: () => { if (!done) resolve(false); } });
    const input = s.el.querySelector("[data-w]"), yes = s.el.querySelector("[data-yes]"), bk = s.el.querySelector("[data-bk]");
    input.oninput = () => { yes.disabled = input.value.trim().toUpperCase() !== word.toUpperCase(); };
    if (bk) bk.onclick = async () => {
      const label = bk.textContent; bk.disabled = true; bk.textContent = "Preparing backup...";
      try { await backup.fn(); bk.textContent = "Backup downloaded ✓"; } catch { bk.textContent = "Backup failed. Try again"; }
      bk.disabled = false; setTimeout(() => { if (bk.isConnected && bk.textContent !== label) bk.textContent = label; }, 3500);
    };
    s.el.querySelector("[data-no]").onclick = () => { done = true; s.close(); resolve(false); };
    yes.onclick = () => { if (yes.disabled) return; done = true; s.close(); resolve(true); };
    input.focus();
  });
}

export const badge = (text, kind = "") => `<span class="badge ${kind}">${esc(text)}</span>`;

/** "Subscribe to unlock" card used on locked features. */
export const lockedCard = (title, text) => `<div class="card gold stack-s center">
  ${icon("lock")}<h3>${esc(title)}</h3><p class="muted small">${esc(text)}</p>
  <a class="btn gold" href="#/plans">See plans</a></div>`;

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast("Copied", "good"); }
  catch { toast("Couldn't copy. Please copy it by hand.", "bad"); }
}

/** Password input with a show/hide eye button. Call bindPw(root) after inserting the HTML. */
export const pwField = ({ id, label, autocomplete = "current-password", hint: h = "", minlength = 6 }) =>
  `<label>${esc(label)}<span class="pw"><input id="${id}" type="password" autocomplete="${autocomplete}" minlength="${minlength}" required>
  <button type="button" class="eye" data-eye="${id}" aria-label="Show password" aria-pressed="false">${icon("eye")}</button></span>${h ? `<span class="field-hint">${esc(h)}</span>` : ""}</label>`;

export function bindPw(root) {
  root.querySelectorAll("[data-eye]").forEach((b) => {
    b.onclick = () => {
      const input = root.querySelector("#" + b.dataset.eye), show = input.type === "password";
      input.type = show ? "text" : "password";
      b.innerHTML = icon(show ? "eyeoff" : "eye"); b.setAttribute("aria-pressed", String(show)); b.setAttribute("aria-label", show ? "Hide password" : "Show password");
      input.focus();
    };
  });
}
