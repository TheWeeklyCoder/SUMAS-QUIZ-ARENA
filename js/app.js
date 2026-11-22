// SUMAS Quiz Arena: boot, auth state, guards, navigation, top bar.
import "./errors.js";
import { configured, auth, db, onAuthStateChanged, doc, updateDoc, setDoc, Timestamp, serverTimestamp } from "./firebase.js";
import { state, freeForAll } from "./state.js";
import { route, setGuard, setOnRendered, startRouter, dispatch, go, parseHash } from "./router.js";
import { initNet, isOnline } from "./net.js";
import { loadUserContext, loadQuotes, refreshSettings } from "./data.js";
import * as A from "./auth.js";
import { startNotifier, stopNotifier } from "./notify.js";
import { icon, skeleton, toast } from "./ui.js";
import { initTheme, getTheme, toggleTheme } from "./theme.js";
import { COMP_EXPIRY, isComp } from "./lib/plans.js";
import { settle, ls, DEEP, rememberNext, takeNext } from "./lib/util.js";
import { myLevel } from "./lib/levels.js";
import { checkUpdate } from "./update.js";
import { captureRef, claimReferral } from "./affiliate.js";
import affiliatePage from "./pages/affiliate.js";
import { maybeShowWhatsNew } from "./whatsnew.js";
import { maybeShowInstall } from "./install.js";
import { startSessionLog, stopSessionLog } from "./sessionlog.js";
import { maybeShowTour } from "./tour.js";

import authPage, { forgotPage } from "./pages/auth.js";
import onboarding, { termsAgain } from "./pages/onboarding.js";
import home from "./pages/home.js";
import practice, { bankPage } from "./pages/practice.js";
import quiz from "./pages/quiz.js";
import progress from "./pages/progress.js";
import arena from "./pages/arena.js";
import leaderboard, { students } from "./pages/leaderboard.js";
import library, { readerPage } from "./pages/library.js";
import tournaments, { tournamentPage, playPage, hallPage, sponsorPage } from "./pages/tournaments.js";
import store from "./pages/store.js";
import matches, { matchPage, matchPlay } from "./pages/matches.js";
import { startActivityFeed, stopActivityFeed } from "./activity.js";
import profile from "./pages/profile.js";
import levelPage from "./pages/level.js";
import privacy from "./pages/privacy.js";
import plansPage, { payPage, paymentsPage } from "./pages/plans.js";

const view = document.getElementById("view");
const nav = document.getElementById("nav");
const top = document.getElementById("topbar");
initTheme();

/* ---------- Routes. meta.title is the top-bar title, meta.parent is where Back goes. ---------- */
const adminPage = async (ctx) => (await import("./pages/admin.js")).default(ctx);
route("/", home, { title: "SUMAS Quiz Arena", root: true });
route("/login", authPage, { title: "Log in" });
route("/signup", authPage, { title: "Sign up", parent: "/login" });
route("/forgot", forgotPage, { title: "Reset password", parent: "/login" });
route("/onboarding", onboarding, { title: "Set up your profile" });
route("/terms", termsAgain, { title: "Terms of use" });
route("/level", levelPage, { title: "Your level" });
route("/affiliate", affiliatePage, { title: "Affiliate program", parent: "/profile" });
captureRef();   // a link with ?ref=CODE is remembered until the new student has signed up
route("/privacy", privacy, { title: "Privacy policy", parent: "/profile" });
route("/practice", practice, { title: "Practise", root: true });
route("/practice/:bankId", bankPage, { title: "Question bank", parent: "/practice" });
route("/quiz/:bankId/:setId", quiz, { title: "Quiz" });
route("/progress", progress, { title: "Progress", root: true });
route("/arena", arena, { title: "Arena", root: true });
route("/leaderboard", leaderboard, { title: "Leaderboard", parent: "/arena" });
route("/students", students, { title: "Find a student", parent: "/arena" });
route("/tournaments", tournaments, { title: "Tournaments", parent: "/arena" });
route("/tournament/:tid", tournamentPage, { title: "Tournament", parent: "/tournaments" });
route("/play/:tid", playPage, { title: "Tournament" });
route("/hall", hallPage, { title: "Hall of Fame", parent: "/tournaments" });
route("/sponsor", sponsorPage, { title: "Sponsor", parent: "/tournaments" });
route("/library", library, { title: "Study library", parent: "/practice" });
route("/read/:id", readerPage, { title: "Reading" });
route("/store", store, { title: "Notes & summaries", parent: "/practice" });
route("/matches", matches, { title: "Group matches", parent: "/arena" });
route("/match/:lid", matchPage, { title: "Match", parent: "/matches" });
route("/matchplay/:lid", matchPlay, { title: "Match" });
route("/profile", profile, { title: "Profile", root: true });
route("/plans", plansPage, { title: "Plans", parent: "/profile" });
route("/pay/:plan", payPage, { title: "Payment", parent: "/plans" });
route("/payments", paymentsPage, { title: "My payments", parent: "/plans" });
route("/admin", adminPage, { title: "Admin", parent: "/profile" });
route("/admin/:tab", adminPage, { title: "Admin", parent: "/profile" });
route("*", (ctx) => { ctx.view.innerHTML = `<div class="card stack center"><h2>Page not found</h2><p class="muted">That link doesn't go anywhere.</p><a class="btn primary" href="#/">Go home</a></div>`; }, { title: "Not found", parent: "/" });

/* ---------- Guards ---------- */
const PUBLIC = ["/login", "/signup", "/forgot"];
// A shared link to a match or tournament is remembered (lib/util.js) while the person logs in, sets up and picks a level, then opened.
setGuard((path) => {
  if (path === "/privacy") return null;
  if (!state.user) { if (DEEP.test(path)) rememberNext(path); return PUBLIC.includes(path) ? null : "/login"; }
  if (!state.profile) return path === "/onboarding" ? null : "/onboarding";
  if (!state.termsOk) return path === "/terms" ? null : "/terms";
  if (!myLevel()) return path === "/level" ? null : "/level";   // everyone picks a level once (new sign-ups and students from before levels)
  if (PUBLIC.includes(path) || path === "/onboarding" || path === "/terms" || path === "/") return takeNext() || (path === "/" ? null : "/");
  if (path.startsWith("/admin") && !state.isAdmin) return "/";
  return null;
});

/* ---------- Layout per route: top bar, bottom nav, focus mode ---------- */
const NAV = [["/", "Home", "home"], ["/practice", "Practice", "book"], ["/progress", "Progress", "chart"], ["/arena", "Arena", "trophy"], ["/profile", "Profile", "user"]];
const NO_NAV = ["/login", "/signup", "/forgot", "/onboarding", "/terms", "/level"];

const isFocus = (path) => path.startsWith("/read/") || path.startsWith("/quiz") || path.startsWith("/play/") || path.startsWith("/matchplay/");
const themeButton = () => {
  const dark = getTheme() === "dark";
  return `<button class="iconbtn" id="themebtn" aria-label="${dark ? "Switch to light mode" : "Switch to dark mode"}" title="${dark ? "Light mode" : "Dark mode"}">${icon(dark ? "sun" : "moon")}</button>`;
};

function drawTop(ctx) {
  const m = ctx.meta || {}, focus = isFocus(ctx.path);
  top.hidden = focus;
  document.body.classList.toggle("focus-mode", focus);
  if (focus) return;
  const lead = m.parent ? `<a class="iconbtn" href="#${m.parent}" aria-label="Back" id="backbtn">${icon("back")}</a>` : state.user ? `<span class="brandmark" aria-hidden="true">S</span>` : "";
  const title = !state.user && !m.parent ? "" : m.title || "";   // the login page has its own big heading
  top.innerHTML = `${lead}<h1>${title}</h1>${themeButton()}`;
  top.querySelector("#themebtn").onclick = toggleTheme;   // the "sumas:theme" event below redraws the bar
}
let lastCtx = null;
window.addEventListener("sumas:theme", () => { if (lastCtx) drawTop(lastCtx); });
window.addEventListener("scroll", () => top.classList.toggle("scrolled", window.scrollY > 4), { passive: true });

setOnRendered((ctx) => {
  lastCtx = ctx;
  const focus = isFocus(ctx.path);
  document.body.classList.toggle("wide", ctx.path.startsWith("/admin"));
  drawTop(ctx);
  const show = !focus && !NO_NAV.includes(ctx.path) && !!state.user;
  nav.hidden = !show;
  if (show) {
    const section = "/" + (ctx.path.split("/")[1] || "");
    const active = ["/admin", "/plans", "/pay", "/payments"].includes(section) ? "/profile" : ["/library", "/read"].includes(section) ? "/practice" : ["/leaderboard", "/students", "/tournaments", "/tournament", "/hall", "/sponsor", "/matches", "/match"].includes(section) ? "/arena" : section === "/store" ? "/practice" : section;
    nav.innerHTML = `<div class="nav-inner">${NAV.map(([p, label, ic]) =>
      `<a href="#${p}" ${p === active ? 'aria-current="page"' : ""}><span class="pill">${icon(ic)}</span><span>${label}</span></a>`).join("")}</div>`;
  }
  maybeShowTour(ctx.path);   // the app guide: once per visit until "Don't show again"
  sync(ctx.path);
  setTimeout(() => { maybeShowWhatsNew(parseHash().path); setTimeout(() => maybeShowInstall(parseHash().path), 400); }, 900);   // after the page has drawn; the install pop-up never sits on top of "What's new"
});

/* ---------- Keep settings fresh: free access on/off and required updates reach students who already have the app open ---------- */
let syncing = false, again = null;
async function sync(path, force = false) {
  if (!state.user || !state.profile) return;
  if (syncing) { again = { path, force: force || again?.force }; return; }   // run once more when the current check ends
  syncing = true;
  try {
    const changed = await refreshSettings({ force });
    if (changed) {
      toast(freeForAll() ? "Everything is now free for everyone" : "Free access has ended");
      if (!isFocus(parseHash().path)) dispatch();   // redraw so locks and subscribe prompts match the new setting
    }
    claimReferral();
    autoAnalyse();
    await checkUpdate(path || parseHash().path);
  } finally { syncing = false; if (again) { const n = again; again = null; sync(n.path, n.force); } }
}
/** Admin only: once a day, analyse new attempts and republish the leaderboard (checked at most every 30 minutes; the check is one read). */
let autoBusy = false;
async function autoAnalyse() {
  if (!state.isAdmin || autoBusy || !isOnline() || isFocus(parseHash().path)) return;
  if (Date.now() - (ls("auto_checked") || 0) < 30 * 60000) return;
  autoBusy = true; ls("auto_checked", Date.now());
  try {
    const r = await (await import("./pages/admin-tools.js")).autoDaily(state.settings);
    if (r) toast(r.used ? `Daily analysis done: ${r.used} attempt${r.used === 1 ? "" : "s"} counted` : "Daily analysis done: nothing new", "good");
  } catch (e) { console.warn("auto analysis", e); } finally { autoBusy = false; }
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) sync(parseHash().path); });
window.addEventListener("online", () => sync(parseHash().path, true));
setInterval(() => { if (!document.hidden) sync(parseHash().path); }, 5 * 60 * 1000);

/* ---------- Boot ---------- */
function setupScreen() {
  top.hidden = true;
  view.innerHTML = `<section class="card stack" style="max-width:520px;margin:40px auto">
    <div class="logo">S</div><h1 class="center">Almost ready</h1>
    <p>Add your Firebase web config to <code>js/firebase-config.js</code>, then reload. The README has the five-minute setup.</p>
    <ol class="small muted"><li>Create a Firebase project (free Spark plan).</li><li>Add a web app and copy its config.</li>
    <li>Enable Authentication (Email/Password and Google) and Firestore.</li><li>Publish <code>firestore.rules</code>.</li>
    <li>Add your user id to the <code>admins</code> collection.</li></ol></section>`;
}

function loadError() {
  view.innerHTML = `<section class="card stack center" style="max-width:420px;margin:40px auto"><h2>We couldn't reach the server</h2>
    <p class="muted">Check your internet connection. Your progress is safe.</p>
    <button class="btn primary" id="retry">Try again</button> <button class="btn ghost" id="out">Log out</button></section>`;
  view.querySelector("#retry").onclick = () => location.reload();
  view.querySelector("#out").onclick = () => A.logout();
}

let started = false;
function ready() {
  state.ready = true;
  if (!started) { started = true; startRouter(); } else dispatch();
}

function resetState() {
  Object.assign(state, { user: null, profile: null, userDoc: null, sub: null, isAdmin: false, termsOk: false, progress: null });
}

/**
 * Admins never pay. We give an admin a complimentary subscription (far-future expiry) the first time we see them,
 * using the same subscriptions/{uid} document the rules already trust. No rules change is needed.
 */
async function ensureAdminAccess(uid) {
  if (!state.isAdmin || isComp(state.sub)) return;
  const r = await settle(setDoc(doc(db, "subscriptions", uid), { plan: "comp", expiresAt: Timestamp.fromMillis(COMP_EXPIRY), updatedAt: serverTimestamp() }), 4000);
  if (r !== "denied") { state.sub = { plan: "comp", expiresAt: COMP_EXPIRY }; ls("sub_" + uid, state.sub); }
}

async function onUser(user) {
  state.user = user;
  if (!user) { resetState(); A.stopSessionGuard(); stopSessionLog(); stopActivityFeed(); stopNotifier(); return ready(); }
  state.ready = false;
  if (!started) view.innerHTML = skeleton(3);
  const claim = A.flags.justSignedIn; A.flags.justSignedIn = false;
  const res = await loadUserContext(user);
  if (!res.ok) return loadError();
  await ensureAdminAccess(user.uid);
  A.startSessionGuard(user.uid, { claim, onKicked: () => A.logout() });
  if (state.profile) { startSessionLog(user.uid); startActivityFeed(); startNotifier(); }
  if (state.profile && !sessionStorage.getItem("loginLogged")) {
    sessionStorage.setItem("loginLogged", "1");
    updateDoc(doc(db, "users", user.uid), { lastLogin: serverTimestamp() }).catch(() => {});
  }
  ready();
}

async function boot() {
  initNet();
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); window.__installPrompt = e; });
  if (!configured) return setupScreen();
  view.innerHTML = skeleton(3);
  await loadQuotes();
  A.redirectResult();
  onAuthStateChanged(auth, onUser);
}

boot();
