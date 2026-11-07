// Plan definitions and subscription maths (pure).
export const PLANS = {
  "1w": { label: "1 week", days: 7 },
  // "2w" is retired (no longer sold) but kept so subscriptions bought earlier still display and extend correctly.
  "2w": { label: "2 weeks", days: 14 },
  "1m": { label: "1 month", days: 30 },
  "3m": { label: "3 months", days: 90 },
  // Complimentary access (admins and people you exempt). Never sold, never shown as a plan to buy.
  comp: { label: "Complimentary", days: 36500 },
};
export const PLAN_KEYS = ["1w", "1m", "3m"];            // the plans students can buy
/** Default prices in naira, used until the admin saves their own in Settings. */
export const DEFAULT_PRICES = { "1w": 500, "1m": 2000, "3m": 6000 };
/** Prices saved before the Nov 2026 price change have no `v: 2` stamp and are ignored, so the new defaults apply at once. */
export const priceOf = (plans, k) => { const v = plans && plans.v === 2 ? Number(plans[k]) : 0; return v > 0 ? v : (DEFAULT_PRICES[k] || null); };
export const COMP_EXPIRY = Date.UTC(2099, 11, 31, 23, 59, 59);
export const isComp = (sub) => !!(sub && sub.plan === "comp");
const DAY = 86400000;

/** A renewal stacks on remaining time: start from the later of "now" and the current expiry. */
export function extendedExpiry(existingMs, nowMs, plan) {
  const base = existingMs && existingMs > nowMs ? existingMs : nowMs;
  return base + PLANS[plan].days * DAY;
}

export const perWeek = (price, plan) => price / (PLANS[plan].days / 7);

/** Unique transfer-narration code derived from the user id, so no storage is needed. */
export const paymentCode = (uid) => "SUM-" + String(uid).slice(0, 6).toUpperCase();

export const isActive = (sub, now = Date.now()) => !!(sub && sub.expiresAt && sub.expiresAt > now);
