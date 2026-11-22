// First-time setup: nickname -> age group -> terms. One atomic batch writes everything or nothing.
import { db, doc, getDoc, writeBatch, serverTimestamp } from "../firebase.js";
import { state, isPaid } from "../state.js";
import { go } from "../router.js";
import { esc, debounce, ls, toMillis } from "../lib/util.js";
import { avatar, randomAvatarColor, hint, toast } from "../ui.js";
import { pickerHTML, bindPicker, makeAvatar, parseAvatar } from "../avatars.js";
import { TERMS_TEXT, TERMS_VERSION, termsHash } from "../terms.js";
import { handleError } from "../net.js";

export const RESERVED = ["admin", "administrator", "sumas", "support", "moderator", "staff", "official", "quizarena", "root", "system"];
// Small starter list. The rules block reserved words; remove bad handles from admin if one slips through.
const BLOCKED = ["fuck", "shit", "bitch", "asshole", "dick", "pussy", "nigga", "nigger", "whore", "slut", "rape", "porn", "sex", "cunt"];

export function checkHandle(h) {
  if (!/^[a-z0-9_]{3,20}$/.test(h)) return "Use 3 to 20 letters, numbers or underscores.";
  if (RESERVED.includes(h)) return "That name is reserved. Please choose another.";
  if (BLOCKED.some((w) => h.includes(w))) return "Please choose a respectful nickname.";
  return "";
}

/** Is this nickname free? true / false, or null when we can't tell (offline). */
export async function handleAvailable(h) {
  try { return !(await getDoc(doc(db, "nicknames", h))).exists(); } catch { return null; }
}

export default function onboarding(ctx) {
  const d = { step: 1, nick: "", age: "", color: randomAvatarColor(), accepted: false, showActivity: true };
  const root = ctx.view;
  const draw = () => ({ 1: stepNick, 2: stepAge, 3: stepTerms }[d.step])();

  function frame(title, sub, body) {
    root.innerHTML = `<section class="stack-l" style="max-width:480px;margin:0 auto;padding-top:16px">
      <div><div class="bar" aria-hidden="true"><i style="width:${(d.step / 3) * 100}%"></i></div>
        <p class="muted small" style="margin-top:8px">Step ${d.step} of 3</p></div>
      <header><h1>${title}</h1><p class="muted">${sub}</p></header>${body}</section>`;
  }

  function stepNick() {
    frame("Choose your nickname", "This is how other students will see you. You can change it once every 4 weeks.", `
      <div class="card stack">
        <div class="row" style="gap:16px">${avatar(d.nick || "?", d.color, 56)}
          <div class="grow"><label>Nickname
            <input id="nick" value="${esc(d.nick)}" maxlength="20" autocapitalize="none" autocomplete="off" spellcheck="false" placeholder="e.g. emeka_md"></label></div></div>
        <p id="msg" class="small muted" aria-live="polite">Letters, numbers and underscores. 3 to 20 characters.</p>
        <div><label style="margin-bottom:8px">Pick a profile picture <span class="muted">(optional)</span></label><div id="avslot">${pickerHTML(d.color, isPaid())}</div></div>
        ${hint("Old nicknames stay reserved so nobody can pretend to be a top student.", "shield")}
        <button class="btn primary block" id="next" disabled>Continue</button></div>`);
    const input = root.querySelector("#nick"), msg = root.querySelector("#msg"), next = root.querySelector("#next");
    bindPicker(root, (id) => { d.color = makeAvatar(parseAvatar(d.color).color, id); root.querySelector(".avatar").outerHTML = avatar(d.nick || "?", d.color, 56); }, () => toast("🔒 That picture is for subscribers. You can change it later.", "bad"));
    const check = debounce(async () => {
      const h = input.value.trim().toLowerCase();
      d.nick = h; d.available = false; next.disabled = true;
      const av = root.querySelector(".avatar:not(.pic)"); if (av) av.textContent = (h[0] || "?").toUpperCase();
      if (!h) { msg.className = "small muted"; return; }
      const bad = checkHandle(h);
      if (bad) { msg.className = "error"; msg.textContent = bad; return; }
      msg.className = "small muted"; msg.textContent = "Checking...";
      const free = await handleAvailable(h);
      if (input.value.trim().toLowerCase() !== h) return;
      if (free === null) { msg.className = "small muted"; msg.textContent = "Can't check right now. We'll confirm when you finish."; d.available = true; next.disabled = false; }
      else if (free) { msg.className = "ok-text"; msg.textContent = `@${h} is available`; d.available = true; next.disabled = false; }
      else { msg.className = "error"; msg.textContent = `@${h} is taken. Try another.`; }
    }, 350);
    input.addEventListener("input", check);
    if (d.nick) check();
    next.onclick = () => { d.step = 2; draw(); };
    input.focus();
  }

  function stepAge() {
    frame("Your age group", "Some features, like sponsor prizes, are for adults only.", `
      <div class="card stack">
        <label class="check item"><input type="radio" name="age" value="adult" ${d.age === "adult" ? "checked" : ""}><span><strong>I'm 18 or older</strong></span></label>
        <label class="check item"><input type="radio" name="age" value="minor" ${d.age === "minor" ? "checked" : ""}><span><strong>I'm under 18</strong><br><span class="muted small">You can use all practice features. Prize mode needs an adult account.</span></span></label>
        ${hint("Why we ask: it keeps prizes and legal terms fair. We only store adult or under 18, not your birth date.", "shield")}
        <div class="row"><button class="btn ghost" id="back">Back</button><button class="btn primary grow" id="next" ${d.age ? "" : "disabled"}>Continue</button></div></div>`);
    root.querySelectorAll("[name=age]").forEach((r) => r.addEventListener("change", () => { d.age = r.value; root.querySelector("#next").disabled = false; }));
    root.querySelector("#back").onclick = () => { d.step = 1; draw(); };
    root.querySelector("#next").onclick = () => { d.step = 3; draw(); };
  }

  function stepTerms() {
    frame("Terms of use", "Please read and accept to finish. We keep a record of your acceptance.", `
      <div class="card stack">
        <div class="terms-box" tabindex="0" aria-label="Terms of use">${esc(TERMS_TEXT)}</div>
        <label class="check"><input type="checkbox" id="ok" ${d.accepted ? "checked" : ""}><span>I have read and accept the terms, including the refund rule (7 days if approved but access failed; none once access has been used).</span></label>
        <label class="check"><input type="checkbox" id="act" ${d.showActivity ? "checked" : ""}><span class="small muted">Let paid students see my nickname in "just finished a test" pop-ups. You can change this later.</span></label>
        <p id="err" class="error" role="alert" hidden></p>
        <div class="row"><button class="btn ghost" id="back">Back</button><button class="btn primary grow" id="finish" ${d.accepted ? "" : "disabled"}>Finish setup</button></div></div>`);
    const ok = root.querySelector("#ok"), fin = root.querySelector("#finish"), err = root.querySelector("#err");
    ok.onchange = () => { d.accepted = ok.checked; fin.disabled = !ok.checked; };
    root.querySelector("#act").onchange = (e) => { d.showActivity = e.target.checked; };
    root.querySelector("#back").onclick = () => { d.step = 2; draw(); };
    fin.onclick = async () => {
      fin.disabled = true; fin.textContent = "Saving..."; err.hidden = true;
      try { await commit(); toast("Welcome to SUMAS Quiz Arena!", "good"); go("/", { replace: true }); }
      catch (e) {
        fin.disabled = false; fin.textContent = "Finish setup";
        if (e?.code === "permission-denied") { err.textContent = "That nickname was just taken (or couldn't be saved). Please go back and pick another."; err.hidden = false; }
        else if (!handleError(e)) { err.textContent = "Couldn't save. Check your internet and try again."; err.hidden = false; }
      }
    };
  }

  async function commit() {
    const u = state.user, uid = u.uid, h = d.nick;
    const hash = await termsHash();
    const b = writeBatch(db);
    b.set(doc(db, "nicknames", h), { uid, createdAt: serverTimestamp() });
    b.set(doc(db, "profiles", uid), {
      nickname: h, nicknameLower: h, avatarColor: d.color, points: 0, solved: 0,
      showActivity: d.showActivity, nicknameChangedAt: null, createdAt: serverTimestamp(),
    });
    b.set(doc(db, "users", uid), { email: u.email, ageGroup: d.age, createdAt: serverTimestamp(), lastLogin: serverTimestamp() });
    b.set(doc(db, "termsAcceptances", `${uid}_${TERMS_VERSION}`), { uid, version: TERMS_VERSION, textHash: hash, acceptedAt: serverTimestamp() });
    await b.commit();
    state.profile = { nickname: h, nicknameLower: h, avatarColor: d.color, points: 0, solved: 0, showActivity: d.showActivity, nicknameChangedAt: null, createdAt: Date.now() };
    state.userDoc = { email: u.email, ageGroup: d.age };
    state.termsOk = true;
    ls("profile_" + uid, state.profile); ls("terms_" + uid, TERMS_VERSION);
  }

  draw();
}

/** Shown when the terms version changed and the student must accept again. */
export function termsAgain(ctx) {
  ctx.view.innerHTML = `<section class="stack-l" style="max-width:480px;margin:0 auto;padding-top:16px">
    <header><h1>Our terms have changed</h1><p class="muted">Please read and accept the new version to continue. Your progress is safe.</p></header>
    <div class="card stack"><div class="terms-box" tabindex="0">${esc(TERMS_TEXT)}</div>
      <label class="check"><input type="checkbox" id="ok"><span>I have read and accept the updated terms.</span></label>
      <p id="err" class="error" role="alert" hidden></p>
      <button class="btn primary block" id="go" disabled>Accept and continue</button></div></section>`;
  const ok = ctx.view.querySelector("#ok"), go_ = ctx.view.querySelector("#go"), err = ctx.view.querySelector("#err");
  ok.onchange = () => { go_.disabled = !ok.checked; };
  go_.onclick = async () => {
    go_.disabled = true; err.hidden = true;
    try {
      const uid = state.user.uid, b = writeBatch(db);
      b.set(doc(db, "termsAcceptances", `${uid}_${TERMS_VERSION}`), { uid, version: TERMS_VERSION, textHash: await termsHash(), acceptedAt: serverTimestamp() });
      await b.commit();
      state.termsOk = true; ls("terms_" + uid, TERMS_VERSION); go("/", { replace: true });
    } catch (e) { go_.disabled = false; if (!handleError(e)) { err.textContent = "Couldn't save. Please try again."; err.hidden = false; } }
  };
}
