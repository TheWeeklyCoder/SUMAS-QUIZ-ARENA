// Sponsor placements (shown on Home) and the suggested packages. Pure functions, no Firebase.
export const KINDS = { spotlight: "Spotlight (Home card)", tournament: "Tournament partner", shoutout: "Channel shoutout" };
/** Suggested starting prices in naira. My estimates for a small audience, not market data: change them to what you can actually get. */
export const PACKAGES = [
  { kind: "tournament", label: "Tournament Partner", price: 20000, note: "Prize included, named on the tournament and the Hall of Fame" },
  { kind: "spotlight", label: "Spotlight Partner (per month)", price: 8000, note: "Card on every student's Home screen for a month" },
  { kind: "shoutout", label: "Channel Shoutout (per post)", price: 3000, note: "One post on the WhatsApp channel" },
];

export const httpsUrl = (u) => { try { const x = new URL(String(u || "").trim()); return x.protocol === "https:" ? x.href : ""; } catch { return ""; } };

/** Day (yyyy-mm-dd) to the start / end of that day in the phone's time zone. */
export const dayStart = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3], 0, 0, 0, 0).getTime() : 0; };
export const dayEnd = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59, 999).getTime() : 0; };
export const toDay = (ms) => { if (!ms) return ""; const d = new Date(ms), p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

/** Clean what the admin typed. Returns { ok, item, error }. */
export function cleanSponsor(f, id) {
  const name = String(f.name || "").trim().slice(0, 60), tagline = String(f.tagline || "").trim().slice(0, 90);
  if (name.length < 2) return { ok: false, error: "Add the sponsor's name." };
  const link = f.link ? httpsUrl(f.link) : "", logoUrl = f.logoUrl ? httpsUrl(f.logoUrl) : "";
  if (f.link && !link) return { ok: false, error: "The website link must start with https://" };
  if (f.logoUrl && !logoUrl) return { ok: false, error: "The logo link must start with https://" };
  const startsAt = f.start ? dayStart(f.start) : 0, endsAt = f.end ? dayEnd(f.end) : 0;
  if (f.end && !endsAt) return { ok: false, error: "Pick a valid end date." };
  if (startsAt && endsAt && endsAt < startsAt) return { ok: false, error: "The end date is before the start date." };
  return { ok: true, item: { id, name, tagline, link, logoUrl, kind: KINDS[f.kind] ? f.kind : "spotlight", startsAt, endsAt, active: f.active !== false } };
}

/** Which sponsors are showing right now. */
export const isLive = (s, now = Date.now()) => !!s && s.active !== false && (!s.startsAt || s.startsAt <= now) && (!s.endsAt || s.endsAt >= now);
export const liveSponsors = (items, now = Date.now()) => (Array.isArray(items) ? items : []).filter((s) => isLive(s, now) && s.kind !== "shoutout").slice(0, 8);
export const sponsorState = (s, now = Date.now()) => (s.active === false ? "paused" : s.startsAt && s.startsAt > now ? "upcoming" : s.endsAt && s.endsAt < now ? "ended" : "live");
