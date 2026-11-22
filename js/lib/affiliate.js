// Affiliate program rules and sums. Pure functions (no Firebase) so they can be tested.
export const MIN_FOLLOWERS = 50;      // also enforced in firestore.rules
export const PAYOUT_DAYS = 7;
// Build 22: affiliates are rewarded in free days of access (not money). Money commission is off unless settings/app.affiliateMoney is true.
export const DAYS_PER_SIGNUP = 1;     // 1 free day for every new student who joins with the affiliate's link
export const DAYS_PER_PAID = 3;       // plus 3 more days when that student subscribes (the admin can change both in Admin > Affiliates)
export const PLATFORMS = ["Instagram", "TikTok", "X (Twitter)", "WhatsApp channel or status", "Facebook", "YouTube", "Telegram", "Other"];

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // no 0/O/1/I
export const makeCode = (rand = Math.random) => Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(rand() * CODE_CHARS.length)]).join("");
export const normCode = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
/** The code in a link like ...#/signup?ref=ABC123 (or ?ref=ABC123 before the #). */
export const refFromUrl = (hash = "", search = "") => { const m = /[?&]ref=([A-Za-z0-9]{4,10})/.exec(hash + "&" + search.replace(/^\?/, "?")); return m ? normCode(m[1]) : ""; };

export const affPct = (settings) => { const n = Number(settings?.affiliatePct); return n >= 1 && n <= 50 ? n : 10; };
export const affMin = (settings) => { const n = Number(settings?.affiliateMin); return n >= 1000 ? Math.round(n) : 5000; };
export const commissionOf = (amount, pct) => Math.max(0, Math.round((Number(amount) || 0) * pct / 100));

export const moneyOn = (settings) => settings?.affiliateMoney === true;
const dayCount = (v, dflt) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 30 ? Math.round(n) : dflt; };
/** Free days per referred sign-up and per referred student who subscribes. */
export const affDays = (settings) => ({ signup: dayCount(settings?.affiliateDaysSignup, DAYS_PER_SIGNUP), paid: dayCount(settings?.affiliateDaysPaid, DAYS_PER_PAID) });
export const daysEarned = (signups, subscribed, settings) => { const d = affDays(settings); return Math.max(0, signups) * d.signup + Math.max(0, subscribed) * d.paid; };
/** Days already given: new `daysGranted` plus the old week (7) and month (30) rewards from before build 22, so nothing is paid twice. */
export const daysGrantedOf = (aff = {}) => (Number(aff.daysGranted) || 0) + (aff.rewardWeekAt ? 7 : 0) + (aff.rewardMonthAt ? 30 : 0);
export const dayWord = (n) => `${n} day${n === 1 ? "" : "s"}`;

/**
 * Everything the dashboard shows. referrals: [{ createdAt(ms), subscribed }], commissions: [{ amount, status }],
 * payouts: [{ status }], aff: affiliates doc ({ daysGranted, rewardWeekAt, rewardMonthAt }).
 */
export function affStats({ referrals = [], commissions = [], payouts = [], aff = {} }, settings = {}) {
  const signups = referrals.length, subscribed = referrals.filter((r) => r.subscribed).length;
  const earned = daysEarned(signups, subscribed, settings), granted = daysGrantedOf(aff);
  const last = referrals.reduce((m, r) => Math.max(m, r.createdAt || 0), 0);
  const unpaid = commissions.filter((c) => c.status === "unpaid").reduce((t, c) => t + (Number(c.amount) || 0), 0);
  const paid = commissions.filter((c) => c.status === "paid").reduce((t, c) => t + (Number(c.amount) || 0), 0);
  const open = payouts.some((p) => p.status === "requested");
  const min = affMin(settings);
  return {
    signups, subscribed, conversion: signups ? Math.round((subscribed / signups) * 100) : 0, lastAt: last,
    daysEarned: earned, daysGranted: granted, daysPending: Math.max(0, earned - granted),
    unpaid, paid, open, min, canRequest: !open && unpaid >= min,
  };
}

/** CSV rows for the admin's affiliate report. */
export function affiliateRows(affs, referrals, settings = {}) {
  return affs.filter((a) => a.status === "approved").map((a) => {
    const st = affStats({ referrals: referrals.filter((r) => r.affiliateUid === a.id), aff: a }, settings);
    return { nickname: a.nickname, code: a.code || "", platform: a.platform || "", handle: a.handle || "", followers: Number(a.followers) || 0, signups: st.signups, subscribed: st.subscribed, conversion: st.conversion + "%", daysEarned: st.daysEarned, daysGranted: st.daysGranted, daysPending: st.daysPending };
  }).sort((x, y) => y.signups - x.signups || y.subscribed - x.subscribed);
}
