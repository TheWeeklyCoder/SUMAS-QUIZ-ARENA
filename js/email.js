// Automatic thank-you email after the admin approves a payment.
// The app has no server, so the email is sent from the admin's phone through EmailJS (emailjs.com, free plan: 200 emails a month)
// at the moment the payment is approved. Pure helpers plus one network call; nothing here touches Firebase.

export const EMAILJS_URL = "https://api.emailjs.com/api/v1.0/email/send";

export const EMAIL_DEFAULTS = {
  subject: "Payment received: your {plan} plan is active",
  body: `Hi {name},

Thank you for subscribing to SUMAS Quiz Arena. Your payment of {amount} was successful and your {plan} plan is now active until {until}.

You now have full question banks, ranks, the leaderboard and group matches. Open the app here:
{link}

Follow our WhatsApp channel for new banks, live matches and tournaments:
{channel}

If anything does not look right, just reply to this email.

Thank you for supporting a student-built project.

Vincent Akachukwu Daniel
Founder, SUMAS Quiz Arena`,
};

export const PLACEHOLDERS = ["{name}", "{plan}", "{amount}", "{until}", "{link}", "{channel}"];

/** Replace {name}, {plan} ... with real values. Unknown placeholders are left as they are. */
export const fillTemplate = (text, vars) => String(text || "").replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

/** Email settings are usable only when switched on and all three EmailJS values are present. */
export const emailReady = (cfg) => !!(cfg && cfg.enabled === true && cfg.serviceId && cfg.templateId && cfg.publicKey);
export const validEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || "").trim());

export function buildEmail(cfg, vars) {
  const v = { name: "there", ...vars };
  return { subject: fillTemplate(cfg.subject || EMAIL_DEFAULTS.subject, v), message: fillTemplate(cfg.body || EMAIL_DEFAULTS.body, v) };
}

/**
 * Send one email through EmailJS. Your EmailJS template should use {{to_email}} as "To Email", {{subject}} as Subject
 * and {{message}} in the content (wrap it in <div style="white-space:pre-line">{{message}}</div> to keep the line breaks).
 * Throws an Error with a plain-words message on failure.
 */
export async function sendEmail(cfg, { to, name, subject, message }, fetchFn = fetch) {
  if (!validEmail(to)) throw new Error("This student has no valid email address on file.");
  let res;
  try {
    res = await fetchFn(EMAILJS_URL, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service_id: cfg.serviceId, template_id: cfg.templateId, user_id: cfg.publicKey, template_params: { to_email: to, to_name: name || "", subject, message, reply_to: cfg.replyTo || "" } }),
    });
  } catch { throw new Error("Couldn't reach the email service. Check your connection."); }
  if (res.ok) return true;
  let detail = ""; try { detail = (await res.text()).slice(0, 160); } catch { /* ignore */ }
  throw new Error(res.status === 429 ? "Too many emails at once. Wait a minute and try again." : `The email service refused it (${res.status}). ${detail}`.trim());
}
