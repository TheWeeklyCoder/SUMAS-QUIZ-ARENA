// Login, sign-up and forgot-password.
import * as A from "../auth.js";
import { go } from "../router.js";
import { hint, icon, pwField, bindPw } from "../ui.js";

const hero = (title, sub) => `<header class="center stack-s"><div class="logo">S</div><h1>${title}</h1><p class="muted" style="margin:0">${sub}</p></header>`;

export default function authPage(ctx) {
  const signup = ctx.path === "/signup";
  const kicked = sessionStorage.getItem("kicked");
  sessionStorage.removeItem("kicked");
  const inApp = A.inAppBrowser();

  ctx.view.innerHTML = `<section class="stack-l" style="max-width:420px;margin:0 auto;padding-top:8px">
    ${hero(signup ? "Create your account" : "Welcome back", signup ? "Practise smart. Pass your exams. Leave no one behind." : "Log in to continue your practice.")}
    ${kicked ? `<div class="notice warn" role="alert"><strong>Signed in on another device.</strong><br>Only one device can be active at a time. Log in again here to continue. Your progress is safe.</div>` : ""}
    ${inApp ? `<div class="notice warn">Google sign-in may not work inside this app's browser. Tap the menu (⋮) and choose <strong>Open in Chrome</strong>, or use email below.</div>` : ""}
    <form id="f" class="stack card" novalidate>
      <label>Email<input id="email" type="email" autocomplete="email" inputmode="email" required placeholder="you@example.com"></label>
      ${pwField({ id: "pw", label: "Password", autocomplete: signup ? "new-password" : "current-password", minlength: signup ? 8 : 6, hint: signup ? "At least 8 characters. Tap the eye to check what you typed." : "" })}
      <p id="err" class="error" role="alert" hidden></p>
      <button class="btn primary block" id="go" type="submit">${signup ? "Create account" : "Log in"}</button>
      ${signup ? "" : '<div class="center"><a href="#/forgot" class="small">Forgot your password?</a></div>'}
      <div class="divider">or</div>
      <button class="btn block" id="g" type="button">${googleG()} Continue with Google</button>
      ${signup ? hint("Next we'll ask for a nickname, your age group and to accept the terms. It takes about a minute.", "shield") : ""}
    </form>
    <p class="center small muted" style="margin:0"><a href="#/privacy">Privacy policy</a></p>
    <p class="center">${signup ? 'Already have an account? <a href="#/login">Log in</a>' : 'New here? <a href="#/signup">Create an account</a>'}</p>
  </section>`;
  bindPw(ctx.view);

  const $ = (s) => ctx.view.querySelector(s);
  const err = (m) => { const e = $("#err"); e.textContent = m; e.hidden = !m; };
  const busy = (b, label) => { for (const id of ["#go", "#g"]) $(id).disabled = b; if (label) $("#go").textContent = label; };
  const idle = signup ? "Create account" : "Log in";

  const googleFn = () => A.googleSignIn();
  async function run(fn) {
    err(""); busy(true, "Please wait...");
    try { await fn(); $("#go").textContent = "Signing you in..."; }
    catch (e) {
      let m = A.authMessage(e);
      if (!signup && fn !== googleFn && (e.code === "auth/invalid-credential" || e.code === "auth/wrong-password")) {
        m += " If you signed in with Google before, tap Continue with Google, then add a password in Profile > Set a password.";
      }
      err(m); busy(false, idle);
    }
  }
  $("#f").addEventListener("submit", (e) => {
    e.preventDefault();
    const email = $("#email").value.trim(), pw = $("#pw").value;
    if (!email || !pw) return err("Please enter your email and password.");
    if (signup && pw.length < 8) return err("Please use a password with at least 8 characters.");
    run(() => (signup ? A.emailSignUp(email, pw) : A.emailSignIn(email, pw)));
  });
  $("#g").addEventListener("click", () => run(googleFn));
}

/** Forgot password: we email a reset link. The message is the same whether or not the email has an account. */
export function forgotPage(ctx) {
  ctx.view.innerHTML = `<section class="stack-l" style="max-width:420px;margin:0 auto;padding-top:8px">
    ${hero("Reset your password", "Enter your email and we'll send you a link to choose a new password.")}
    <form id="f" class="stack card" novalidate>
      <label>Email<input id="email" type="email" autocomplete="email" inputmode="email" required placeholder="you@example.com"></label>
      <p id="msg" role="alert" hidden></p>
      <button class="btn primary block" id="go" type="submit">Send reset link</button>
      ${hint("Check your spam folder too. The link may take a minute to arrive. If you signed up with Google, just use Continue with Google on the login page.", "info")}
    </form>
    <p class="center"><a href="#/login">Back to log in</a></p></section>`;
  const $ = (s) => ctx.view.querySelector(s);
  const say = (m, ok) => { const e = $("#msg"); e.textContent = m; e.className = ok ? "ok-text" : "error"; e.hidden = !m; };
  $("#f").addEventListener("submit", async (e) => {
    e.preventDefault(); say("");
    const email = $("#email").value.trim();
    if (!email) return say("Please enter your email.");
    const btn = $("#go"); btn.disabled = true; btn.textContent = "Sending...";
    try { await A.resetPassword(email); say("If that email has an account, a reset link is on its way. Open it, choose a new password, then log in.", true); btn.textContent = "Send again"; }
    catch (ex) {
      if (ex.code === "auth/user-not-found") { say("If that email has an account, a reset link is on its way. Open it, choose a new password, then log in.", true); btn.textContent = "Send again"; }
      else { say(A.authMessage(ex)); btn.textContent = "Send reset link"; }
    }
    btn.disabled = false;
  });
}

const googleG = () => `<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z"/><path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 010-9.4l-7.9-6.1a24 24 0 000 21.6l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>`;
