// Last-resort error catcher. Shows one calm banner (at most once a minute) and remembers the last error
// so Profile > Contact us on WhatsApp can include it. No network calls, no Firestore writes.
import { showBanner } from "./net.js";

// Noise we do not want to bother students with: connection problems (net.js already handles them),
// cancelled sign-in popups, and Firestore errors that the pages deal with themselves.
const IGNORE = /ResizeObserver|Script error|Failed to fetch|NetworkError|Load failed|network-request-failed|popup-closed-by-user|cancelled-popup-request|AbortError|unavailable|permission-denied|resource-exhausted|deadline-exceeded/i;
let lastShown = 0;

function report(raw) {
  const text = String((raw && (raw.message || raw.code)) || raw || "").slice(0, 200);
  const code = String((raw && raw.code) || "");
  if (!text || IGNORE.test(text) || IGNORE.test(code)) return;
  if (!navigator.onLine) return;
  window.__lastError = text;
  const now = Date.now();
  if (now - lastShown < 60000) return;
  lastShown = now;
  showBanner("error", {
    text: "Something went wrong. Reloading usually fixes it. Your progress is safe.",
    action: () => location.reload(), actionLabel: "Reload", autoHide: 15000,
  });
}

window.addEventListener("error", (e) => report(e.error || e.message));
window.addEventListener("unhandledrejection", (e) => report(e.reason));
