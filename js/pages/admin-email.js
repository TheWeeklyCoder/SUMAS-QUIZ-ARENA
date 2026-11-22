// Admin > Settings: automatic thank-you email after a payment is approved (EmailJS, sent from the admin's phone).
// Settings live in adminConfig/email, readable only by admins (the EmailJS keys are not shown to students).
import { db, doc, getDoc, setDoc, updateDoc, serverTimestamp } from "../firebase.js";
import { state, channelLink } from "../state.js";
import { PLANS } from "../lib/plans.js";
import { EMAIL_DEFAULTS, PLACEHOLDERS, buildEmail, emailReady, sendEmail, validEmail } from "../email.js";
import { naira, fmtDate, esc } from "../lib/util.js";
import { linkTo } from "../share.js";
import { toast } from "../ui.js";
import { handleError } from "../net.js";

let cached = null;
export async function loadEmailConfig(force = false) {
  if (cached && !force) return cached;
  const s = await getDoc(doc(db, "adminConfig", "email"));
  return (cached = s.exists() ? s.data() : {});
}

const appLink = () => linkTo("/") || "https://theweeklycoder.github.io/SUMAS-QUIZ-ARENA/";

/**
 * Send the thank-you email for an approved payment. Never throws: returns { sent } | { skipped } | { error }.
 * p = the payment, expMs = when the access now ends, nick = the student's nickname.
 */
export async function thankPayment(p, expMs, nick = "") {
  try {
    const cfg = await loadEmailConfig();
    if (!emailReady(cfg)) return { skipped: true };
    const u = await getDoc(doc(db, "users", p.uid)), to = u.exists() ? u.data().email : "";
    if (!validEmail(to)) return { error: "no email on file" };
    const m = buildEmail(cfg, { name: nick || "there", plan: PLANS[p.plan]?.label || p.plan, amount: naira(p.amount), until: fmtDate(expMs), link: appLink(), channel: channelLink() });
    await sendEmail(cfg, { to, name: nick, ...m });
    await updateDoc(doc(db, "payments", p.id), { thankedAt: serverTimestamp() }).catch(() => {});
    return { sent: to };
  } catch (e) { return { error: e?.message || "failed" }; }
}

export async function emailCard(box, ctx) {
  let cfg = {};
  try { cfg = await loadEmailConfig(true); }
  catch (e) { if (ctx.alive()) { box.innerHTML = '<div class="card center"><p class="small muted" style="margin:0">Couldn\'t load the email settings. Republish firestore.rules (adminConfig) and try again.</p></div>'; handleError(e); } return; }
  if (!ctx.alive()) return;
  const draw = () => {
    box.innerHTML = `<div class="card stack"><div class="row between wrap" style="gap:10px"><div class="grow"><h2 style="margin:0">Thank-you email</h2>
      <div class="small muted">Sent automatically when you approve a payment. ${emailReady(cfg) ? "<strong>It is ON.</strong>" : "It is OFF until you fill in the three EmailJS values and switch it on."}</div></div></div>
      <details><summary class="small"><strong>Set up (once, about 5 minutes)</strong></summary><ol class="small stack-s" style="margin:8px 0 0 18px">
        <li>Create a free account at <strong>emailjs.com</strong> and, under Email Services, connect your Gmail. Copy the <strong>Service ID</strong>.</li>
        <li>Under Email Templates, create a template. Set <strong>To Email</strong> to <code>{{to_email}}</code>, <strong>Subject</strong> to <code>{{subject}}</code>, and the content to <code>&lt;div style="white-space:pre-line"&gt;{{message}}&lt;/div&gt;</code>. Save and copy the <strong>Template ID</strong>.</li>
        <li>Under Account, copy your <strong>Public Key</strong>. Under Security, add your app's web address as an allowed origin if you see that option.</li>
        <li>Paste the three values below, switch it on, and tap <strong>Send me a test</strong>.</li></ol>
        <p class="small muted" style="margin:8px 0 0">The free plan sends 200 emails a month. If it runs out or fails, the payment is still approved and you will see a message.</p></details>
      <label class="check"><input type="checkbox" id="en" ${cfg.enabled ? "checked" : ""}><span class="small">Send the thank-you email when I approve a payment</span></label>
      <div class="row wrap" style="gap:10px"><label class="grow">Service ID<input id="sv" value="${esc(cfg.serviceId || "")}" autocomplete="off"></label><label class="grow">Template ID<input id="tp" value="${esc(cfg.templateId || "")}" autocomplete="off"></label></div>
      <label>Public key<input id="pk" value="${esc(cfg.publicKey || "")}" autocomplete="off"></label>
      <label>Subject<input id="su" maxlength="150" value="${esc(cfg.subject || EMAIL_DEFAULTS.subject)}"></label>
      <label>Message<textarea id="bd" rows="12" maxlength="3000">${esc(cfg.body || EMAIL_DEFAULTS.body)}</textarea><span class="field-hint">You can use ${PLACEHOLDERS.map((p) => `<code>${p}</code>`).join(" ")}</span></label>
      <div class="row wrap"><button class="btn primary small" id="sv-btn">Save email settings</button><button class="btn small" id="ts">Send me a test</button><button class="btn small ghost" id="rs">Reset wording</button></div></div>`;
    const val = () => ({ enabled: box.querySelector("#en").checked, serviceId: box.querySelector("#sv").value.trim(), templateId: box.querySelector("#tp").value.trim(), publicKey: box.querySelector("#pk").value.trim(), subject: box.querySelector("#su").value.trim() || EMAIL_DEFAULTS.subject, body: box.querySelector("#bd").value.trim() || EMAIL_DEFAULTS.body });
    const save = async () => { const v = val(); if (v.enabled && !(v.serviceId && v.templateId && v.publicKey)) { toast("Fill in the Service ID, Template ID and Public key first", "bad"); return false; } await setDoc(doc(db, "adminConfig", "email"), { ...v, updatedAt: serverTimestamp() }); cfg = { ...v }; cached = cfg; return true; };
    box.querySelector("#sv-btn").onclick = async () => { try { if (await save()) { toast("Saved", "good"); draw(); } } catch (e) { if (!handleError(e)) toast("Couldn't save. Republish firestore.rules (adminConfig) and try again.", "bad"); } };
    box.querySelector("#rs").onclick = () => { box.querySelector("#su").value = EMAIL_DEFAULTS.subject; box.querySelector("#bd").value = EMAIL_DEFAULTS.body; };
    box.querySelector("#ts").onclick = async (ev) => {
      const b = ev.currentTarget, v = val(), to = state.user?.email || "";
      if (!(v.serviceId && v.templateId && v.publicKey)) return toast("Fill in the three EmailJS values first", "bad");
      if (!validEmail(to)) return toast("Your account has no email address", "bad");
      b.disabled = true;
      try { const m = buildEmail(v, { name: state.profile?.nickname || "there", plan: "1 month", amount: naira(2000), until: fmtDate(Date.now() + 30 * 86400000), link: appLink(), channel: channelLink() }); await sendEmail(v, { to, name: state.profile?.nickname || "", ...m }); toast(`Test sent to ${to}`, "good"); }
      catch (e) { toast(e.message || "Couldn't send", "bad"); }
      b.disabled = false;
    };
  };
  draw();
}
