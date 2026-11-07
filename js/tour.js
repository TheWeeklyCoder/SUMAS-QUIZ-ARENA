// Guided tour: a swipeable slider that explains what the app is for and how to use it, with small pictures.
// It opens once per visit (per browser session) until the student taps "Don't show again".
// Skip or finishing only hides it for this visit. The choice is remembered on this device, per account (localStorage).
// Profile > "App tutorial" opens it again any time, even after "Don't show again".
import { state } from "./state.js";
import { ls, esc, naira } from "./lib/util.js";
import { priceOf } from "./lib/plans.js";
import { toast, icon, ring, avatar } from "./ui.js";
import { topRow, progressBar, subRow, questionBlock, optionButtons, dotsRow, navRow } from "./qview.js";

const SEEN = "sumas_tour_seen";                       // sessionStorage: already shown during this visit
const offKey = (uid) => "tour_off_" + uid;            // localStorage: "Don't show again"
const HIDE_ON = ["/login", "/signup", "/forgot", "/onboarding", "/terms"];
const FOCUS = /^\/(quiz|play|matchplay)\//;

export const tourIsOff = () => !!(state.user && ls(offKey(state.user.uid)));

/* ---------- The pictures: real screens of the app, built from the app's own components and styles, shown small inside a phone frame. ---------- */
const price = (k) => { const v = priceOf(state.plans, k); return v ? naira(v) : "Soon"; };
const bar = (pctW, cls = "") => `<div class="bar ${cls}"><i style="width:${pctW}%"></i></div>`;
const topbar = (title, back = false) => `<div class="topbar">${back ? `<span class="iconbtn">${icon("back")}</span>` : '<span class="brandmark">S</span>'}<h1>${title}</h1><span class="iconbtn">${icon("moon")}</span></div>`;
const navbar = (active) => `<nav class="nav"><div class="nav-inner">${[["Home", "home"], ["Practice", "book"], ["Progress", "chart"], ["Arena", "trophy"], ["Profile", "user"]]
  .map(([l, ic]) => `<a ${l === active ? 'aria-current="page"' : ""}><span class="pill">${icon(ic)}</span><span>${l}</span></a>`).join("")}</div></nav>`;
const row = (ic, title, meta, gold = false) => `<div class="item"><span class="tile ${gold ? "gold" : ""}">${icon(ic)}</span><div class="grow"><strong>${title}</strong><div class="meta">${meta}</div></div>${icon("chevron")}</div>`;

const ART = {
  // 1. What the app is: the Home screen
  welcome: () => `${topbar("SUMAS Quiz Arena")}
    <section class="hero stack"><div class="hero-head">${avatar("student", "#ff9a3c", 52)}<div class="hero-id"><div class="hero-top"><span class="small">Good morning,</span><span class="badge gold">${icon("fire", "sm")} 3</span></div><h1>@student</h1></div></div>
      <p class="hero-quote">“You don't have to be perfect. You just have to keep showing up.”</p>
      <div><div class="row between small"><span>This week</span><span>2 of 5 sessions</span></div><div style="margin-top:8px">${bar(40)}</div></div></section>
    <section class="stack-s" style="margin-top:20px"><div class="row between"><h2 style="margin:0">Practise</h2><span class="small" style="color:var(--link);font-weight:700">See all</span></div>
      <div class="list">${row("book", "Human Anatomy", "MBBS 200L · 4 sets")}${row("book", "Physiology", "MBBS 200L · 3 sets")}</div></section>${navbar("Home")}`,
  // 2. Pick a bank: a bank page
  bank: () => `${topbar("Question bank", true)}
    <div class="stack-l" style="margin-top:8px"><header><h1 style="margin:0 0 4px">Human Anatomy</h1><p class="muted" style="margin:0">MBBS 200L</p></header>
      <section class="stack-s"><h2>Free taster</h2><div class="item"><span class="tile gold">${icon("sparkle")}</span><div class="grow"><strong>Try the first 10 questions</strong><div class="meta">Free for everyone</div></div>${icon("chevron")}</div></section>
      <section class="stack-s"><h2>Full sets</h2><div class="list">
        <div class="item"><span class="tile">${icon("book")}</span><div class="grow"><strong>Anatomy Set 1</strong><div class="meta">100 questions · best 82%</div></div><span class="badge green">Done</span>${icon("chevron")}</div>
        <div class="item"><span class="tile">${icon("book")}</span><div class="grow"><strong>Anatomy Set 2</strong><div class="meta">100 questions</div></div>${icon("chevron")}</div></div></section></div>${navbar("Practice")}`,
  // 3. Answer and learn: the play screen
  answer: () => `<div class="qplay">${topRow({ i: 2, total: 10, timerText: "1:12" })}${progressBar(2, 10)}
    <div class="card qcard">${subRow("Skeletal", false)}${questionBlock({ text: "Which bone is the longest in the human body?" })}
      ${optionButtons({ options: ["Tibia", "Femur", "Humerus"], correct: 1 }, 0, true)}
      <div class="explain"><strong>Not this time.</strong><div style="margin-top:6px">The femur (thigh bone) is the longest and strongest bone.</div></div></div>
    ${navRow({ canBack: true, nextLabel: "Next", dots: dotsRow(10, 2, (k) => k < 2) })}</div>`,
  // 4. Progress
  progress: () => `${topbar("Progress")}
    <div class="stack-l" style="margin-top:8px"><header><h1 style="margin:0 0 4px">Your progress</h1><p class="muted" style="margin:0">Every session you finish is saved here.</p></header>
      <div class="row" style="gap:10px"><div class="card tight grow center"><div class="price">240</div><div class="muted small">Total score</div></div><div class="card tight grow center"><div class="price">86%</div><div class="muted small">Best session</div></div><div class="card tight grow center"><div class="price">${icon("fire", "sm")} 3</div><div class="muted small">Day streak</div></div></div>
      <div class="card row" style="gap:16px">${ring(60, 84, "3/5")}<div class="grow"><h3 style="margin:0">Weekly goal</h3><p class="small muted" style="margin:2px 0 0">2 more sessions to hit 5 this week.</p></div></div>
      <div class="card stack-s"><h3>Weakest topics</h3><div><div class="row between small"><span>Cardiovascular</span><span class="muted">42%</span></div>${bar(42, "red")}</div><div><div class="row between small"><span>Skeletal system</span><span class="muted">68%</span></div>${bar(68, "gold")}</div></div></div>${navbar("Progress")}`,
  // 5. Arena
  arena: () => `${topbar("Arena")}
    <div class="stack-l" style="margin-top:8px"><header><h1 style="margin:0 0 4px">Arena</h1><p class="muted" style="margin:0">See how you compare and find your classmates.</p></header>
      <div class="list">${row("trophy", "Tournaments", "Sponsor-funded contests. Free entry")}${row("trophy", "Group matches", "Scheduled evening matches. Join live")}${row("trophy", "Leaderboard", "Top 100 students by points")}</div>
      <div class="list"><div class="item"><strong style="min-width:22px">1</strong>${avatar("ada_md", "#8fd9a8", 34)}<div class="grow"><strong>@ada_md</strong><div class="meta">12 sets completed</div></div><strong>940</strong></div>
        <div class="item"><strong style="min-width:22px">2</strong>${avatar("emeka", "#9dbbff", 34)}<div class="grow"><strong>@emeka</strong><div class="meta">11 sets completed</div></div><strong>905</strong></div></div></div>${navbar("Arena")}`,
  // 6. Plans
  plans: () => `${topbar("Plans", true)}
    <div class="stack-l" style="margin-top:8px"><p class="muted" style="margin:0">Pay once for the time you need. No auto-renewal, no surprises.</p>
      <div class="stack"><div class="card plan stack-s"><div class="row between"><h2 style="margin:0">1 week</h2><span class="price">${price("1w")}</span></div><p class="muted small" style="margin:0">Full question banks, ranks, progress charts and group matches.</p><span class="btn primary block">Choose 1 week</span></div>
        <div class="card plan best stack-s"><span class="badge gold ribbon">Best value</span><div class="row between"><h2 style="margin:0">3 months</h2><span class="price">${price("3m")}</span></div><p class="muted small" style="margin:0">Full question banks, ranks, progress charts and group matches.</p><span class="btn gold block">Choose 3 months</span></div></div></div>${navbar("Profile")}`,
};
const ART_CLASS = { answer: "play" };

const SLIDES = [
  { art: "welcome", title: "Welcome to SUMAS Quiz Arena", text: "Practice questions for your university courses. Learn from your mistakes, track your progress and compete with other students." },
  { art: "bank", title: "Pick a question bank", text: "Open Practice and choose your course. Try the free taster, or open a full set if you have a plan." },
  { art: "answer", title: "Answer and learn", text: "Tap an answer to see right or wrong straight away, with an explanation. Missed questions can be retried in one tap." },
  { art: "progress", title: "Watch yourself improve", text: "Progress shows your streak, weekly goal, strongest and weakest topics, and the questions you keep missing." },
  { art: "arena", title: "Compete in the Arena", text: "Join group matches and sponsored tournaments, and see where you rank on the leaderboard." },
  { art: "plans", title: "Free taster or full access", text: "Everyone gets a free taster. Subscribe to unlock every set, ranks and matches. Pay by bank transfer, and chat with us on WhatsApp if you get stuck." },
];

/* ---------- The slider ---------- */
let open = false;

export function startTour({ force = false } = {}) {
  if (open || !state.user) return;
  open = true;
  try { sessionStorage.setItem(SEEN, "1"); } catch { /* storage blocked */ }
  const uid = state.user.uid;
  let i = 0;
  const prevFocus = document.activeElement, prevOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";

  const el = document.createElement("div");
  el.className = "tour";
  el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "App guide");
  el.innerHTML = `<div class="tour-inner">
    <div class="tour-view"><div class="tour-track">${SLIDES.map((s, k) => `<section class="tour-slide" aria-label="${k + 1} of ${SLIDES.length}">
      <div class="tour-art"><div class="tour-stage"><div class="tour-phone ${ART_CLASS[s.art] || ""}" aria-hidden="true" inert>${ART[s.art]()}</div></div></div>
      <h2>${esc(s.title)}</h2><p>${esc(s.text)}</p></section>`).join("")}</div></div>
    <div class="tour-dots" aria-hidden="true">${SLIDES.map(() => "<i></i>").join("")}</div>
    <div class="tour-nav"><button class="linkbtn tour-skip" id="tskip">Skip</button><button class="btn primary" id="tnext">Next</button></div>
    <button class="linkbtn small tour-off" id="toff"></button></div>`;
  document.body.append(el);

  const $ = (s) => el.querySelector(s);
  const slides = [...el.querySelectorAll(".tour-slide")], dots = [...el.querySelectorAll(".tour-dots i")];
  const offNow = () => !!ls(offKey(uid));

  let close = function () {
    open = false;
    document.removeEventListener("keydown", onKey);
    el.remove(); document.body.style.overflow = prevOverflow; prevFocus?.focus?.();
  };
  function draw() {
    $(".tour-track").style.transform = `translateX(${-i * 100}%)`;
    slides.forEach((s, k) => { s.setAttribute("aria-hidden", String(k !== i)); });
    dots.forEach((d, k) => d.classList.toggle("on", k === i));
    const last = i === SLIDES.length - 1;
    $("#tnext").textContent = last ? "Get started" : "Next";
    const skip = $("#tskip"); skip.textContent = last ? "Back" : "Skip"; skip.setAttribute("aria-label", last ? "Previous slide" : "Skip the guide");
    $("#toff").textContent = offNow() ? "Show this guide each visit again" : "Don't show again";
  }
  const go = (n) => { i = Math.max(0, Math.min(SLIDES.length - 1, n)); draw(); };
  const next = () => (i === SLIDES.length - 1 ? close() : go(i + 1));
  const skipOrBack = () => (i === SLIDES.length - 1 ? go(i - 1) : close());

  $("#tnext").onclick = next;
  $("#tskip").onclick = skipOrBack;
  $("#toff").onclick = () => {
    if (offNow()) { ls(offKey(uid), null); toast("Okay, the guide will show on each visit again.", "good"); }
    else { ls(offKey(uid), true); toast("Okay, we won't show this again. Find it any time in Profile.", "good"); }
    close();
  };
  const onKey = (e) => {
    if (e.key === "Escape") close();
    else if (e.key === "ArrowRight") next();
    else if (e.key === "ArrowLeft") go(i - 1);
  };
  document.addEventListener("keydown", onKey);

  // Swipe left / right
  let x0 = null;
  const view = $(".tour-view");
  view.addEventListener("pointerdown", (e) => { x0 = e.clientX; });
  view.addEventListener("pointerup", (e) => { if (x0 === null) return; const dx = e.clientX - x0; x0 = null; if (dx < -50) go(i + 1); else if (dx > 50) go(i - 1); });
  view.addEventListener("pointercancel", () => { x0 = null; });

  // The mock screens are drawn at phone width (360px) and shrunk to fit the slide
  const fit = () => el.querySelectorAll(".tour-stage").forEach((st) => { const k = st.clientWidth / 360; if (k > 0) st.firstElementChild.style.transform = `scale(${k})`; });
  window.addEventListener("resize", fit);
  const unfit = close; close = () => { window.removeEventListener("resize", fit); unfit(); };
  draw();
  fit(); requestAnimationFrame(fit);
  $("#tnext").focus();
}

/** Called after every page render. Opens the guide once per visit unless the student chose "Don't show again". */
export function maybeShowTour(path) {
  if (open || !state.user || !state.profile || !state.termsOk) return;
  if (HIDE_ON.includes(path) || FOCUS.test(path)) return;
  if (tourIsOff()) return;
  try { if (sessionStorage.getItem(SEEN)) return; } catch { return; }
  startTour();
}
