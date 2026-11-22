// Shared in-memory app state.
export const state = {
  ready: false,        // auth + user context finished loading
  user: null,          // Firebase auth user
  profile: null,       // profiles/{uid}
  userDoc: null,       // users/{uid}
  sub: null,           // { plan, expiresAt(ms) } or null
  isAdmin: false,
  termsOk: false,
  settings: {},        // settings/app
  plans: {},           // settings/plans  { "2w": 1500, ... }
  progress: null,      // progress/{uid}
  quotes: null,        // content/quotes.json
};

/** The admin has switched "Free for everyone" on (Admin dashboard): every signed-in student gets full access. */
export const freeForAll = () => state.settings?.freeForAll === true;
/** A real, unexpired subscription (or complimentary access) on this account. */
export const hasPaidSub = () => !!(state.sub && state.sub.expiresAt && state.sub.expiresAt > Date.now());
/** Full access: a subscription, or Free for everyone is on. */
export const isPaid = () => hasPaidSub() || freeForAll();
export const whatsappNumber = () => state.settings?.whatsappNumber || "2349155852375";
export const freeCount = () => Number(state.settings?.freeCount) || 10;

/** The WhatsApp channel students can follow. The admin can override it with settings/app.whatsappChannel. */
export const channelLink = () => { const u = state.settings?.whatsappChannel; return typeof u === "string" && /^https:\/\/(whatsapp\.com|www\.whatsapp\.com)\//.test(u) ? u : "https://whatsapp.com/channel/0029Vb8uggM11ulWjo1JpC1v"; };
export const waLink = (text) => `https://wa.me/${whatsappNumber()}?text=${encodeURIComponent(text)}`;
