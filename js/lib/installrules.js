// Install pop-up rules: pure helpers (no DOM), so they can be tested.
export const DAY = 86400000;
export const isIosSafari = (ua = navigator.userAgent || "", vendor = navigator.vendor || "") =>
  /iphone|ipad|ipod/i.test(ua) && /safari/i.test(ua) && !/crios|fxios|edgios|opios|chrome|android/i.test(ua) && /apple/i.test(vendor);
/** Pure rule for when to ask again: "Not now" waits 3 days; after the third "Not now" it waits 30 days. */
export function installDue(rec, now = Date.now()) {
  const r = rec || {};
  if (!r.until) return true;
  return now >= r.until;
}
export function snooze(rec, now = Date.now()) {
  const n = (rec?.n || 0) + 1;
  return { n, until: now + (n >= 3 ? 30 : 3) * DAY };
}

