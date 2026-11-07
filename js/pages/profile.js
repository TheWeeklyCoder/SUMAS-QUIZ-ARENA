import { db, auth, doc, updateDoc, writeBatch, serverTimestamp } from "../firebase.js";
import { state, isPaid, hasPaidSub, freeForAll, waLink } from "../state.js";
import * as A from "../auth.js";
import { esc, short, fmtDate, daysLeft, debounce, ls } from "../lib/util.js";
import { avatar, hint, icon, sheet, confirmBox, toast, pwField, bindPw } from "../ui.js";
import { pickerHTML, bindPicker, makeAvatar, parseAvatar, isPremiumAvatar } from "../avatars.js";
import { TERMS_TEXT, TERMS_VERSION } from "../terms.js";
import { checkHandle, handleAvailable } from "./onboarding.js";
import { handleError } from "../net.js";
import { PLANS, isComp } from "../lib/plans.js";
import { dispatch } from "../router.js";
import { alertsOn, pushOn, setPush } from "../notify.js";
import { getTheme, setTheme } from "../theme.js";
import { viewPref, setViewPref } from "../activity.js";
import { startTour } from "../tour.js";

const COOLDOWN = 28 * 86400000;

export default function profile(ctx) {
  const p = state.profile, u = state.user, paid = isPaid(), own = hasPaidSub(), promo = !own && freeForAll(), comp = isComp(state.sub);
  const nextChange = p.nicknameChangedAt ? p.nicknameChangedAt + COOLDOWN : 0;
  const canChange = !nextChange || Date.now() >= nextChange;
  const passwordUser = A.hasPasswordLogin();
  const theme = getTheme();

  ctx.view.innerHTML = `<div class="stack-l">
    <section class="hero row" style="gap:16px"><button id="avbtn" aria-label="Change profile picture" style="border:0;background:none;padding:0;cursor:pointer;border-radius:50%">${avatar(p.nickname, p.avatarColor, 64)}</button>
      <div class="grow" style="min-width:0"><h1 style="margin:0">@${esc(short(p.nickname))}</h1><p class="small" style="margin:0;word-break:break-all">${esc(u.email || "")}</p></div></section>

    <div class="card ${paid ? "accent" : "gold"} stack-s">
      <div class="row between"><strong>${comp ? "Complimentary access" : promo ? "Free for everyone" : paid ? `${PLANS[state.sub.plan]?.label || "Subscription"} plan` : "Free plan"}</strong>
        <span class="badge ${paid ? "green" : "gold"}">${comp || promo ? "Full access" : paid ? `${daysLeft(state.sub.expiresAt)} days left` : "Taster only"}</span></div>
      <p class="small muted" style="margin:0">${comp ? "You have full access. No payment needed." : promo ? "Everything is open to all students for now." : paid ? `Active until ${fmtDate(state.sub.expiresAt)}.` : "Taster questions and your own score."}</p>
      ${comp ? "" : `<div class="row wrap"><a class="btn small ${paid ? "" : "gold"}" href="#/plans">${paid ? "Renew" : "See plans"}</a><a class="btn small ghost" href="#/payments">My payments</a></div>`}</div>

    <div><p class="section-title" style="margin-top:0">Appearance</p>
      <div class="seg" role="group" aria-label="Theme">
        <button data-theme-set="light" aria-pressed="${theme === "light"}">${icon("sun", "sm")} Light</button>
        <button data-theme-set="dark" aria-pressed="${theme === "dark"}">${icon("moon", "sm")} Dark</button></div></div>

    <div><p class="section-title" style="margin-top:0">Account</p>
      <div class="group">
        <button class="item" id="avrow"><span class="tile">${icon("sparkle")}</span><div class="grow"><strong>Change profile picture</strong><div class="meta">Pick a character. Other students see it next to your nickname.</div></div>${icon("chevron")}</button>
        <button class="item" id="chg" ${canChange ? "" : "disabled"}><span class="tile">${icon("user")}</span><div class="grow"><strong>Change nickname</strong>
          <div class="meta">${canChange ? "Once every 4 weeks. Your old one stays reserved." : `Available again on ${fmtDate(nextChange)}`}</div></div>${icon("chevron")}</button>
        <button class="item" id="pwbtn"><span class="tile">${icon("key")}</span><div class="grow"><strong>${passwordUser ? "Change password" : "Set a password"}</strong>
          <div class="meta">${passwordUser ? "Needs your current password" : "You sign in with Google. Add one for email login."}</div></div>${icon("chevron")}</button>
        <label class="item" style="cursor:pointer"><span class="tile">${icon("sparkle")}</span><div class="grow"><strong>Show me in activity pop-ups</strong>
          <div class="meta">Paid students may see "just finished a set"</div></div><input type="checkbox" id="act" ${p.showActivity ? "checked" : ""}></label>
        <label class="item" style="cursor:pointer"><span class="tile">${icon("info")}</span><div class="grow"><strong>Show activity pop-ups to me</strong>
          <div class="meta">On this phone only. Turning it off saves data</div></div><input type="checkbox" id="actview" ${viewPref() ? "checked" : ""}></label>
        <label class="item" style="cursor:pointer"><span class="tile">${icon("trophy")}</span><div class="grow"><strong>Tell me about new matches and tournaments</strong>
          <div class="meta">A message inside the app when something new is announced</div></div><input type="checkbox" id="alerts" ${alertsOn() ? "checked" : ""}></label>
        ${typeof Notification !== "undefined" ? `<label class="item" style="cursor:pointer"><span class="tile">${icon("bell")}</span><div class="grow"><strong>Phone notifications</strong>
          <div class="meta">Also notify me while the app is open in the background. A fully closed app can't be notified</div></div><input type="checkbox" id="push" ${pushOn() ? "checked" : ""}></label>` : ""}</div></div>

    <div><p class="section-title" style="margin-top:0">More</p>
      <div class="group">
        ${state.isAdmin ? `<a class="item" href="#/admin"><span class="tile gold">${icon("shield")}</span><div class="grow"><strong>Admin panel</strong></div>${icon("chevron")}</a>` : ""}
        ${window.__installPrompt ? `<button class="item" id="install"><span class="tile">${icon("arrow")}</span><div class="grow"><strong>Install the app</strong><div class="meta">Add SUMAS to your home screen</div></div>${icon("chevron")}</button>` : ""}
        <button class="item" id="tour"><span class="tile gold">${icon("sparkle")}</span><div class="grow"><strong>App tutorial</strong><div class="meta">Lost? See what SUMAS is for and how to use it</div></div>${icon("chevron")}</button>
        <button class="item" id="terms"><span class="tile">${icon("book")}</span><div class="grow"><strong>Terms of use</strong><div class="meta">Version ${TERMS_VERSION}</div></div>${icon("chevron")}</button>
        <a class="item" href="#/privacy"><span class="tile">${icon("shield")}</span><div class="grow"><strong>Privacy policy</strong></div>${icon("chevron")}</a>
        <a class="item" href="${esc(waLink(`Hi, I need help.\nNickname: @${p.nickname}${window.__lastError ? `\nError: ${window.__lastError}` : ""}`))}" target="_blank" rel="noopener"><span class="tile">${icon("flag")}</span><div class="grow"><strong>Contact us on WhatsApp</strong></div>${icon("chevron")}</a>
        <button class="item" id="out"><span class="tile">${icon("logout")}</span><div class="grow"><strong>Log out</strong></div></button></div></div>

    <div class="center"><button class="linkbtn small" id="del" style="color:var(--danger)">Delete my account</button></div>
    ${hint("Your progress is saved to your account, so you can log in on a new phone any time.", "check")}</div>`;

  const $ = (s) => ctx.view.querySelector(s);

  const pickAvatar = () => {
    const sh = sheet(`<div class="stack"><p class="muted small" style="margin:0">Tap a picture. It is saved straight away.</p>${pickerHTML(state.profile.avatarColor, isPaid())}<div class="row" style="justify-content:flex-end"><button class="btn ghost" data-c>Close</button></div></div>`, { title: "Profile picture" });
    sh.el.querySelector("[data-c]").onclick = sh.close;
    bindPicker(sh.el, async (id) => {
      if (isPremiumAvatar(id) && !isPaid()) return toast("That picture is for subscribers.", "bad");
      const next = makeAvatar(parseAvatar(state.profile.avatarColor).color, id);
      try {
        await updateDoc(doc(db, "profiles", u.uid), { avatarColor: next });
        state.profile.avatarColor = next; ls("profile_" + u.uid, state.profile);
        ctx.view.querySelector("#avbtn").innerHTML = avatar(p.nickname, next, 64); toast("Picture saved", "good");
      } catch (e) { if (!handleError(e)) toast("Couldn't save. Please try again.", "bad"); }
    }, () => toast("🔒 That picture is for subscribers. See Plans to unlock it.", "bad"));
  };
  ctx.view.querySelector("#avbtn").onclick = pickAvatar; ctx.view.querySelector("#avrow").onclick = pickAvatar;

  ctx.view.querySelectorAll("[data-theme-set]").forEach((b) => (b.onclick = () => {
    setTheme(b.dataset.themeSet);
    ctx.view.querySelectorAll("[data-theme-set]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  }));

  $("#act").onchange = async (e) => {
    try { await updateDoc(doc(db, "profiles", u.uid), { showActivity: e.target.checked }); state.profile.showActivity = e.target.checked; ls("profile_" + u.uid, state.profile); toast("Saved", "good"); }
    catch (ex) { e.target.checked = !e.target.checked; if (!handleError(ex)) toast("Couldn't save. Try again.", "bad"); }
  };
  $("#alerts").onchange = (e) => { ls("alerts_on", e.target.checked); toast(e.target.checked ? "You'll be told about new matches and tournaments" : "Alerts off", "good"); };
  $("#push")?.addEventListener("change", async (e) => {
    const on = await setPush(e.target.checked);
    e.target.checked = on;
    if (on) { ls("alerts_on", true); const a = $("#alerts"); if (a) a.checked = true; }
    toast(on ? "Phone notifications on" : e.target.checked ? "" : "Phone notifications off", on ? "good" : undefined);
    if (!on && typeof Notification !== "undefined" && Notification.permission === "denied") toast("Notifications are blocked for this site in your browser settings.", "bad");
  });
  $("#install")?.addEventListener("click", async () => { const ev = window.__installPrompt; window.__installPrompt = null; await ev.prompt(); profile(ctx); });
  $("#tour").onclick = () => startTour({ force: true });
  $("#terms").onclick = () => {
    const s = sheet(`<div class="terms-box">${esc(TERMS_TEXT)}</div><div style="margin-top:16px"><button class="btn block" data-close>Close</button></div>`, { title: "Terms of use" });
    s.el.querySelector("[data-close]").onclick = s.close;
  };
  $("#out").onclick = async () => { await A.logout(); };

  /* ----- change or set password ----- */
  $("#pwbtn").onclick = () => {
    if (!passwordUser) return setPasswordSheet();
    const s = sheet(`<form class="stack" id="pf" novalidate>
      ${pwField({ id: "cur", label: "Current password" })}
      ${pwField({ id: "n1", label: "New password", autocomplete: "new-password", minlength: 8, hint: "At least 8 characters." })}
      ${pwField({ id: "n2", label: "Confirm new password", autocomplete: "new-password", minlength: 8 })}
      <p id="perr" class="error" role="alert" hidden></p>
      <div class="row" style="justify-content:space-between"><button type="button" class="linkbtn small" id="fg">Forgot current password?</button>
        <span class="row"><button type="button" class="btn ghost" data-c>Cancel</button><button class="btn primary" id="psave" type="submit">Update password</button></span></div></form>`, { title: "Change password" });
    bindPw(s.el);
    const q = (x) => s.el.querySelector(x), say = (m) => { q("#perr").textContent = m; q("#perr").hidden = !m; };
    q("[data-c]").onclick = s.close;
    q("#fg").onclick = () => { s.close(); sendResetLink(); };
    q("#pf").addEventListener("submit", async (e) => {
      e.preventDefault(); say("");
      const cur = q("#cur").value, n1 = q("#n1").value, n2 = q("#n2").value;
      if (!cur) return say("Please enter your current password.");
      if (n1.length < 8) return say("Your new password needs at least 8 characters.");
      if (n1 !== n2) return say("The new passwords don't match.");
      if (n1 === cur) return say("Your new password must be different from the current one.");
      const btn = q("#psave"); btn.disabled = true; btn.textContent = "Updating...";
      try { await A.changePassword(cur, n1); s.close(); toast("Password updated", "good"); }
      catch (ex) { btn.disabled = false; btn.textContent = "Update password"; say(ex.code === "auth/invalid-credential" || ex.code === "auth/wrong-password" ? "Your current password isn't right." : A.authMessage(ex)); }
    });
  };

  function setPasswordSheet() {
    const s = sheet(`<form class="stack" id="sf" novalidate>
    <p class="muted small" style="margin:0">You sign in with Google. Add a password so you can also log in with ${esc(u.email)} and a password, for example in a preview or on a device where Google sign-in is blocked.</p>
    ${pwField({ id: "n1", label: "New password", autocomplete: "new-password", minlength: 8, hint: "At least 8 characters." })}
    ${pwField({ id: "n2", label: "Confirm new password", autocomplete: "new-password", minlength: 8 })}
    <p id="serr" class="error" role="alert" hidden></p>
    <div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost" data-c>Cancel</button><button class="btn primary" id="ssave" type="submit">Set password</button></div></form>`, { title: "Set a password" });
    bindPw(s.el);
    const q = (x) => s.el.querySelector(x), say = (m) => { q("#serr").textContent = m; q("#serr").hidden = !m; };
    q("[data-c]").onclick = s.close;
    q("#sf").addEventListener("submit", async (e) => {
      e.preventDefault(); say("");
      const n1 = q("#n1").value, n2 = q("#n2").value;
      if (n1.length < 8) return say("Your new password needs at least 8 characters.");
      if (n1 !== n2) return say("The passwords don't match.");
      const btn = q("#ssave"); btn.disabled = true; btn.textContent = "Saving...";
      try {
        await A.setPassword(n1);
        s.close();
        toast("Password set. You can now log in with email and password too.", "good");
        dispatch();   // re-render Profile so the row now says "Change password"
      } catch (ex) {
        btn.disabled = false; btn.textContent = "Set password";
        say(ex.code === "auth/popup-blocked" || ex.code === "auth/popup-closed-by-user"
          ? "Google confirmation was blocked or closed. Log out, continue with Google again, then retry."
          : A.authMessage(ex));
      }
    });
  }

  async function sendResetLink() {
    const ok = await confirmBox({ title: passwordUser ? "Email a reset link?" : "Set a password", text: `We'll send a link to ${u.email}. Open it to choose a new password. You can still sign in with Google afterwards.`, okLabel: "Send link" });
    if (!ok) return;
    try { await A.resetPassword(u.email); toast("Link sent. Check your inbox and spam.", "good"); }
    catch (ex) { if (!handleError(ex)) toast(A.authMessage(ex), "bad"); }
  }

  /* ----- change nickname ----- */
  $("#chg").addEventListener("click", () => {
    if (!canChange) return;
    const s = sheet(`<div class="stack"><label>New nickname<input id="n" maxlength="20" autocapitalize="none" autocomplete="off" spellcheck="false"></label>
      <p id="m" class="small muted" aria-live="polite">3 to 20 letters, numbers or underscores.</p>
      <div class="row" style="justify-content:flex-end"><button class="btn ghost" data-c>Cancel</button><button class="btn primary" id="save" disabled>Save</button></div></div>`, { title: "Change nickname" });
    const n = s.el.querySelector("#n"), m = s.el.querySelector("#m"), save = s.el.querySelector("#save");
    let ok = "";
    s.el.querySelector("[data-c]").onclick = s.close;
    n.addEventListener("input", debounce(async () => {
      const h = n.value.trim().toLowerCase(); ok = ""; save.disabled = true;
      if (!h) return;
      const bad = h === p.nicknameLower ? "That's already your nickname." : checkHandle(h);
      if (bad) { m.className = "error"; m.textContent = bad; return; }
      const free = await handleAvailable(h);
      if (n.value.trim().toLowerCase() !== h) return;
      if (free === false) { m.className = "error"; m.textContent = `@${h} is taken.`; return; }
      m.className = "ok-text"; m.textContent = free ? `@${h} is available` : "We'll confirm when you save."; ok = h; save.disabled = false;
    }, 350));
    save.onclick = async () => {
      save.disabled = true; save.textContent = "Saving...";
      try {
        const b = writeBatch(db);
        b.set(doc(db, "nicknames", ok), { uid: u.uid, createdAt: serverTimestamp() });
        b.update(doc(db, "profiles", u.uid), { nickname: ok, nicknameLower: ok, nicknameChangedAt: serverTimestamp() });
        await b.commit();
        state.profile = { ...p, nickname: ok, nicknameLower: ok, nicknameChangedAt: Date.now() };
        ls("profile_" + u.uid, state.profile);
        s.close(); toast("Nickname updated", "good"); profile(ctx);
      } catch (ex) {
        save.disabled = false; save.textContent = "Save";
        if (ex.code === "permission-denied") { m.className = "error"; m.textContent = "That nickname couldn't be saved. It may have just been taken. Try another."; }
        else if (!handleError(ex)) toast("Couldn't save. Try again.", "bad");
      }
    };
  });

  $("#actview").onchange = (e) => setViewPref(e.target.checked);
  $("#del").onclick = async () => {
    const last = Date.parse(auth.currentUser?.metadata?.lastSignInTime || "");
    if (!last || Date.now() - last > 5 * 60000) {
      if (await confirmBox({ title: "Please log in again first", text: "For your safety, deleting your account needs a fresh login. Log out now, log back in, then delete within 5 minutes.", okLabel: "Log out" })) await A.logout();
      return;
    }
    if (!(await confirmBox({ title: "Delete your account?", text: "This permanently deletes your login, profile and progress, and any subscription time you have left. For accounting, security and fairness we keep your payment records, your record of accepting the terms, your first-attempt scores on sets, and your nickname (reserved so nobody can pose as you). This can't be undone.", okLabel: "Delete everything", danger: true }))) return;
    try {
      const b = writeBatch(db);
      for (const c of ["profiles", "users", "progress", "sessions"]) b.delete(doc(db, c, u.uid));
      A.stopSessionGuard();
      await b.commit();
      await A.removeAuthUser();
      Object.keys(localStorage).filter((k) => k.includes(u.uid)).forEach((k) => ls(k, null));      // everything this phone cached about the account
      try { sessionStorage.clear(); } catch { /* ignore */ }
      toast("Your account was deleted.");
    } catch (ex) { if (!handleError(ex)) toast(A.authMessage(ex), "bad"); }
  };
}
