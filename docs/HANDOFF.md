# SUMAS Quiz Arena: Handoff for a new chat

Paste or attach this file in the new chat, together with `sumas-quiz-arena.zip` (the code) and the original design files (`docs/SUMMARY.md`, `docs/DATA_MODEL.md`, `firestore.rules`, all inside the zip). Then say: "Read HANDOFF.md, then continue with Phase 2."

## 0. Status
**Update (session 5, after Phase 4): the app was debugged, restyled with the StudyForge Blueprint, and given a bundled font and an app tutorial. See section 10 at the bottom of this file, which is the newest information. 34 unit tests and 150 browser checks pass.**

**Phases 1 to 4 are built and tested (34 unit tests, 136 browser checks). Only Paystack (optional, later) remains. `firestore.rules` did NOT change in Phase 4 (Phase 3 changes are in RULES_CHANGES.md).**

## 1. What the project is
A subscription-based academic practice PWA for Nigerian university students. Free users get a taster of each question bank; paid users get full banks, progress tools, and (later) ranks, group matches and sponsor-funded tournaments. Money comes only from subscriptions (manual bank transfer, approved by the admin). Prizes come only from sponsors.

**Hard constraints (from the owner):** vanilla HTML/CSS/JS only, no frameworks, no build step. Firebase **Spark (free) plan only**, no Blaze, no server code. Anything that must be trustworthy is enforced by `firestore.rules` or done by the admin by hand. The owner works mostly from an **Android phone** (edits in SPCK Editor, uses Firebase console in Chrome), so instructions must be phone-friendly and step by step. The owner is in Nigeria (Africa/Lagos), plain-language explanations are preferred.

## 2. Current state (all of Phase 1 plus extras is built and tested)
Firebase project id: `sumas-quiz-arena` (already created). Done by the owner: config pasted into `js/firebase-config.js`, Firestore created in **production mode**, `firestore.rules` published, Email/Password and Google sign-in enabled, own account made admin (document `admins/<UID>`), Cloudinary configured in `js/config.js`. **Hosting is not decided yet** (owner uses a phone; options discussed: Netlify Drop, Cloudflare Pages, GitHub Pages, or Firebase Hosting from a computer). Whatever host is used, its domain must be added under Authentication > Settings > Authorised domains.

### Built features
- **Auth:** email/password and Google, in-app-browser warning, one-active-device rule (newest login wins, message when kicked), show/hide password eye, Forgot password page (`#/forgot`), Change password in Profile (re-authenticates), new passwords need 8+ chars. Google-only accounts can add a password in Profile (in-app, `linkWithCredential`); sign-up sends a verification email; a failed email login hints at Google; Google sign-in has no redirect fallback.
- **Onboarding:** unique @nickname (reserved words and a small offensive-word list, live availability check), age group (adult/minor), terms acceptance saved as proof (version + SHA-256 of the exact text + server time). Written in one atomic batch. Re-asks when `TERMS_VERSION` changes.
- **Content:** banks, free tasters, full sets (paid). Per-student shuffle (seeded by uid+set), auto-marking, instant feedback, resume mid-quiz, retry-missed, result screen with topic breakdown, cached in IndexedDB (sets expire after 7 days, versions checked against the bank catalogue), "Report this question" opens WhatsApp (2349155852375) prefilled.
- **Records:** one `attempts` doc per first attempt (carries the `wrong[]` fail log), one `progress` doc (recent sessions, per-topic totals, streak, weekly goal, best score, total score). Repeat attempts do not add to total score.
- **Plans and payments:** plans 2 weeks / 1 month / 3 months (14/30/90 days), prices set by admin. Student sees bank details and a code `SUM-XXXXXX` (first 6 chars of uid), submits reference/amount/date (+ optional receipt, compressed then uploaded to Cloudinary), must tick the refund rule. Status tracker (Submitted, Under review, Approved/Rejected). Approval stacks on remaining time.
- **Access rules in the app:** admins get a complimentary subscription automatically (plan `comp`, expires 2099-12-31) the first time they log in; the admin can also give any non-admin "complimentary access" from Admin > Users > Subscription. Comp users are NOT admins.
- **Admin panel** (`#/admin`, tabs): **Payments** (queue, filters, duplicate-reference and amount-mismatch flags, Review/Approve/Reject), **Users** (search, subscription editor, complimentary access, CSV export), **Banks & sets** (create bank, upload set from CSV or JSON with validation preview, replace/delete set, rebuild taster), **Images** (compress on the phone to ~1200 px WebP, upload to Cloudinary `sumas/`, shows size saved and a running total, copy link for the `image` column), **Settings** (plan prices, bank details, WhatsApp number, free taster size, activity kill switch).
- **UI/UX:** light mode is the default with a sun/moon toggle (also Profile > Appearance), saved per device. Redesigned (Plus Jakarta Sans from Google Fonts with system fallback, gradient hero card, tiles, grouped lists, bottom nav with pill). Top bar on every page with a **Back button** to the parent route (route meta `parent`). Quiz hides top and bottom bars (focus mode). Connectivity banners (offline, back online, slow, load failed, no subscription, busy). Skeleton loading, reduced-motion support.
- **PWA:** manifest, icons, service worker (`sw.js`, cache `VERSION` currently `sumas-v6`; bump on every deploy).
### Phase 2 (built)
- **Progress page:** weekly goal ring with editing (everyone), average time per question, "improving / steady / dipped" note, 5-week streak calendar, accuracy rings per bank, "Questions you keep missing" with Retry (paid; free users see the blurred preview).
- **Ranks:** after a full set, paid students get "How did you rank?" (rank, top %, ahead of X%, average, top 5) from `setStats`. Uses first attempts only.
- **Arena hub:** Leaderboard (`#/leaderboard`, top 100) and Find a student (`#/students`, nickname prefix search, 15 reads max). Both paid-only (locked card for free users).
- **Session logs:** `js/sessionlog.js`, one doc per visit, kill switch in Admin > Settings.
- **Admin:** new tabs **Analysis** (Analyse button, flagged questions, per-question and per-topic breakdown, Rebuild leaderboard), **Activity** (visits), **Terms** (printable acceptance records, search by nickname), **Backup** (JSON download of chosen collections). Replacing a set can reset its stats.
### Phase 3 (built)
- **Tournaments** (`#/tournaments`, `#/tournament/:id`, `#/play/:id`): list (open / coming up / finished), detail with the two modes, focus-mode play screen (no instant feedback, change answers until submit, review screen with question jumper, resume on this phone, countdown to closing, offline warning), one create-only entry. Prize mode: any adult (free or paid). Fun mode: anyone. Minors are turned away from prize mode in the UI and by the rules.
- **Results:** free students see their own score and a Winner banner with a "Claim on WhatsApp" button; paid students also see rank, top-20 standings (prize and fun separately) and a per-question answer review.
- **Hall of Fame** (`#/hall`), **sponsor enquiry form** (`#/sponsor`, 1 per hour per device), **Notes & summaries store** (`#/store`, Selar links, cached 30 min; reached from Practice).
- **Admin tabs:** Tournaments (create/edit, upload questions with preview, publish/unpublish, Grade now / Re-grade, publish or remove Hall of Fame), Products (Selar links, https only), Sponsors (read, copy contact, mark handled).
- **Not built yet:** group match lobbies; live activity pop-ups; online payment gateway; restore-from-backup tool.

## 3. Code map (`sumas-quiz-arena/`)
```
index.html            shell: banner slot, topbar, #view, nav, early theme script
css/styles.css        design system (CSS variables, light + dark)
content/quotes.json   encouragement lines (editable, zero reads)
sw.js, manifest.webmanifest, icons/
firestore.rules       the owner's rules, UNCHANGED
firebase.json, firestore.indexes.json   hosting + rules config
js/firebase-config.js owner's Firebase config (export const firebaseConfig = {...})
js/config.js          cloudinary {cloudName, uploadPreset, folder}, cache settings
js/firebase.js        ONE place that pins Firebase SDK 10.14.1 and re-exports it
js/app.js             boot, routes (with meta title/parent), guards, topbar, nav
js/router.js          hash router (#/path?query)
js/state.js           shared state, isPaid(), waLink()
js/data.js            user context, banks/tasters/sets loading + cache, progress, saveSession
js/auth.js            sign-in helpers, change password, one-device session guard
js/net.js             connectivity banners + Firebase error mapping
js/cache.js           IndexedDB key-value store
js/theme.js           light/dark
js/terms.js           TERMS_VERSION + draft terms text + hash
js/ui.js              icons, avatar, sheet, confirmBox, toast, pwField, ring, hint...
js/imagetools.js      image compression + Cloudinary upload
js/lib/               pure, unit-tested: util, quiz (shuffle/grade), parse (CSV/JSON sets), plans, analyse (Analyse maths, ranks, leaderboard), stats (calendar, rings, keep-missing), tournament (states, grading, hall rows)
js/pages/             auth, onboarding, home, practice, quiz, progress, arena, leaderboard (+students), plans (plans/pay/payments), profile, admin, admin-images, admin-tools (analysis, activity, terms, backup), admin-phase3 (tournaments, products, sponsors), tournaments (list/detail/play/hall/sponsor), store
js/sessionlog.js     session log writer (fire-and-forget)
tests/logic.test.js   `npm test` (27 unit tests)
tests/e2e/            Playwright run against an in-memory fake Firebase (116 checks). Needs Playwright; does NOT test the real rules
docs/                 SUMMARY.md, DATA_MODEL.md (original design), HANDOFF.md (this file)
```

## 4. Data-model additions (rules did not change; Phase 2 details are in DATA_MODEL.md section 7)
- `banks/{id}`: also `sets[] = {id,title,count,version}`, `tasterCount`, `tasterVersion`, `tasterBuiltAt`, optional `freeCount`.
- `payments.status` may also be `reviewing` ("Under review"); admin also writes `reviewedAt`.
- `settings/app`: also `bankName`, `accountName`, `accountNumber`.
- `settings/imageLog`: `{count,totalBytes,originalBytes,items[]}` for the Images tab total (publicly readable by the rules, contains only public image links).
- `subscriptions/{uid}.plan` may be `comp`.
- Progress topics are stored as `topics[slug] = {name,c,t}`; `weekProgress = {week:'YYYY-MM-DD'(Monday), n}`.
- Set upload format: CSV columns `question,A,B,C,D,E,answer,topic,explanation,image` (answer is a letter A-F), or JSON `{title, questions:[{question, options[], answer, topic, explanation, image}]}`. 50-200 questions, under 0.9 MB.

## 5. Decisions and behaviours worth remembering
- Pinch-zoom is left enabled (owner originally asked for `maximum-scale=1`; I advised against it for accessibility; not revisited).
- Free-user locks on the Progress page are UI-only (the data is their own). Real protection is in the rules (sets, comparison data).
- Missing `termsAcceptances` doc reads as permission-denied under the rules, which the app treats as "not accepted yet".
- Practice scores come from the browser and can be faked; prizes rely on tournaments, where the admin grades.
- `isPaid()` in the rules reads `subscriptions/{uid}`, so admins/comp users pass every paid rule without a rules change. If an admin is removed from `admins`, remove their subscription too.
- Free plan quotas: about 50k reads and 20k writes per day. Admin Users tab reads up to 500 docs from each of three collections, so use it sparingly.
- Terms text is a DRAFT. Needs lawyer review; bump `TERMS_VERSION` after any edit.
- Tournament routine: create (draft) > add questions > publish > students play > after closing tap **Grade now** > tell winners to use "Claim on WhatsApp" > tap **Hall of Fame** only when the sponsor agrees. Never ask winners for details in the app.
- Run **Admin > Analysis > Analyse now** (then Rebuild leaderboard) about once a day. Until the first run, students see "rankings appear after the next update" and an empty leaderboard. Points only change when Analyse runs.
- Test harness gotchas: Playwright `text=` is a case-insensitive substring match, so wait for specific result text, not a word that is already on the page. Also: after clicking a link, wait for the new page's selector before typing (the hashchange render is asynchronous).

## 6. Still open (the owner's calls)
1. Naira prices: `js/lib/plans.js` has default prices (1 week 500, 1 month 2000, 3 months 6000) that apply until the admin saves prices in Admin > Settings. Confirm the prices there before launch.
2. DECIDED: prize mode is free for all adults; analytics are paid-only. Still worth a lawyer's look at the tournament wording and the Terms (section 8; bump TERMS_VERSION after any edit).
3. Group-match schedule (days/time) and minimum players per lobby.
4. Final refund wording and privacy policy.
5. Where to host (see section 2).

## 7. Roadmap (from the original build order)
- **Phase 2: DONE** (see section 2).
- **Phase 3: DONE** (see section 2).
- **Phase 4: DONE** (group matches, activity pop-ups, restore tool, honest account deletion, GitHub Pages deploy: see DATA_MODEL section 9 and DEPLOY_GITHUB.md). Remaining: Paystack (needs a server or Blaze, so deliberately left out).
- **Later:** Paystack via a free Cloudflare Worker.

## 8. Before going live checklist
Publish and test rules in the Rules Playground; 2-step verification on the admin Google account; restrict the API key to the real domain (and consider App Check); finalise terms/privacy/refund wording; seed several banks with topic tags; test the full payment flow with a friend; add the host domain to Authorised domains; bump `sw.js` `VERSION` on every deploy.

## 9. How to work with the owner
Give short numbered steps, name exactly what to tap, and say what they should see. Ask before building big new features if scope is unclear; otherwise just build, test (`npm test`, then `NODE_PATH=$(npm root -g) node tests/e2e/e2e.mjs`) and send the updated zip. Keep the stack vanilla and the Firebase usage within the free plan.


## 10. Session 5: debugging, StudyForge restyle, bundled font, app guide (newest section, read this first)

### 10.1 What was done
1. **Deep debug (about 15 real bugs fixed, all verified by reading the code):**
   - Admin payments: receipt link now only renders for `https:` URLs (it was a stored XSS through `javascript:`). `admin.js` imports `isHttpsUrl` from `lib/tournament.js`.
   - Admin payments: approving for a complimentary (`plan: "comp"`) user no longer stacks days on top of the 2099 expiry.
   - Admin "Clear old logs": deletes in chunks of 400 (a batch holds 500 writes max).
   - Admin set publish: a failed taster build after the set is saved no longer lets a second tap publish a duplicate set.
   - Admin matches list now redraws every 15 s so "Live" / "Grade match" follow the clock.
   - Admin images: stale-run guard so changing quality mid-compression cannot mix batches.
   - Settings: minimum players capped at 60, same as maximum.
   - `data.js`: `invalidateBanks()` now also forces the next `loadBanks()` past the IndexedDB cache (flag `banksStale`).
   - `matches.js`: cleanup registered after `timer`/`onVis` exist (it threw in the temporal dead zone), `ctx.alive()` checks after awaits, graded standings no longer flash "You didn't submit" (`standingsLoading`, `failed` state).
   - `playengine.js` / `tournaments.js`: submit race fixed (re-check `submitted` after the confirm box; auto-submit closes an open confirm sheet).
   - `auth.js` `logout()` calls `stopSessionLog()` before `signOut` so the final log write is not denied.
   - `plans.js`: `/pay/comp` is refused (`PLAN_KEYS.includes`).
   - `activity.js`: generation counter stops a duplicate poll loop after quick logout/login.
   - `lib/parse.js`: a blank option in the middle of a question (A, blank, C...) is now an error (it silently mis-keyed the answer letter). CSV parsing keeps middle blanks and trims trailing ones.
   - `quiz.js`: retry with no matching questions shows "Nothing to retry" instead of crashing.
2. **Restyle with the StudyForge Blueprint (CSS only, behaviour unchanged):** tokens and 3D buttons, floating bottom nav with a blue 3D active tile, blue hero banner, 560px column (admin stays wide), purple play screen while a question is showing (`body:has(.quiz-top)`), answer circle on the right, chosen answer in a tournament shown purple (`.opt.right[aria-pressed=true]`), subject-card colours cycling on list tiles, WhatsApp-green `a.btn[href^="https://wa.me"]`. Old variable names (`--emerald`, `--gold`, `--panel-2`, `--brand`...) are kept as aliases because `ui.js` and page templates use them.
3. **Feedback round (latest):** hero spacing and streak badge repositioned (badge sits on the greeting line, name below, quote with more space), gradients made flat/subtle (hero, accent and gold cards, purple play screen), the header SUMAS mark is now a flat yellow disc with no border or 3D edge so it no longer looks like a button.
4. **Bundled font:** `fonts/` holds Poppins (Regular, Medium, Bold, Latin subset, OFL) plus a tiny Inter subset for the Naira sign. `--font` starts with `"StudyForge Sans"` and deliberately has no `system-ui`, so a custom phone/browser font cannot take over. Google Fonts link removed. A browser cannot be forced to ignore its own font setting, but a bundled web font wins over it.
5. **App guide (tutorial slider)** in `js/tour.js`: 6 slides (what it is, pick a bank, answer and learn, progress, Arena, plans and help). Each slide shows a REAL screen of the app (built from the app's own classes and components, scaled into a phone frame; non-interactive). Skip / Next, dots, swipe, arrow keys, Escape. Opens once per visit (sessionStorage `sumas_tour_seen`) until the student taps "Don't show again" (localStorage `tour_off_<uid>`, per device and account). Profile > More > "App tutorial" reopens it any time, and its button then offers to turn the guide back on. Hooked in `app.js` `setOnRendered` via `maybeShowTour(path)`; hidden on login, onboarding, terms and focus routes (quiz/play/matchplay). The mock quiz uses `.mq-top`, NOT `.quiz-top`, on purpose: `body:has(.quiz-top)` would turn the whole page purple behind the overlay.
6. `sw.js` `VERSION` is `sumas-v9` and its shell list includes `js/tour.js` and the font files. Bump it on every deploy.

### 10.2 Things left as they were (owner's calls, or out of scope)
- Theme: app keeps its own light/dark toggle (blueprint says follow the device setting; changing it is behaviour, not style).
- Service worker is stale-while-revalidate (blueprint prefers network-first).
- The tournament "Opens in..." countdown does not refresh by itself.
- Nickname filter blocks words anywhere inside a name ("sex", "rape" also hit harmless names).
- The guide's "Don't show again" is stored on the device, not in Firestore (the rules do not allow extra profile fields and were not changed).
- Hosting still to be decided (see section 6 above); Paystack still deliberately left out.

### 10.3 Testing
`npm test` (34 unit tests) and `NODE_PATH=$(npm root -g) node tests/e2e/e2e.mjs` (150 checks, N1 to N14 cover the guide). The e2e init script sets `sessionStorage sumas_tour_seen=1` so the guide does not block other checks, unless `localStorage e2e_tour` is set. Screenshots are written to `tests/e2e/shots/` (delete before zipping).

### 10.4 Notes for the next chat
- Give the owner short, phone-friendly steps. They test on an Android phone with large text and sometimes a custom system font, so check layouts at big font sizes (long nicknames, wrapped cards).
- The owner dislikes: buttons-that-look-like-icons, tight spacing, strong gradients, SVG drawings in the guide (wants real app UI).
- A second app by the same owner (QuizForge, "weeklycoder.github.io") has a results screen with near-white text on white cards; not part of this project, not fixed.
- Start a new chat by attaching this zip and saying: "Read docs/HANDOFF.md section 10, then continue."


## 11. Session 6: QuizForge quiz look, question count, symbols, Normal/Abstract, sounds, locking, update log (newest section)

**Tests:** `npm test` = 39 unit tests, e2e = 184 checks (sections A to P). `sw.js` VERSION is `sumas-v10`. `firestore.rules` did NOT change.

### 11.1 Student side
- **Play screen now copies QuizForge** (`js/qview.js` is shared by practice, tournaments and group matches): purple page (#3b0f9e to #7a35f5), top row (back, "01 of 10", timer pill), progress bar, ONE white card with topic, flag, question, options with a circle on the right, then Back / Next and a dot per question (white = answered, amber = flagged, green = current). Chosen answer in exam/tournament = purple (`.opt.sel`); marked answers use `.opt.ok` / `.opt.no`. Page background is keyed on `#view .qplay` so the app guide's mock screen can't turn the page purple.
- **Start screen** (`js/pages/quiz.js`, before every non-retry quiz): Topic, Question style (All / Normal / Abstract, only shown if the set has abstract questions), number of questions (5, 10, 20, 50 below the total, All, or a typed number), Mode (Practice / Exam), sound switch. Home's "Continue" link uses `?resume=1` and skips this screen; the start screen also shows a Continue card.
- **Ranking rule:** only a run of the WHOLE set (all topics, all styles, all questions) is the ranked first attempt. Anything shorter is a "custom run": `saveSession({partial:true})` writes NO attempts doc, no points, no bestScore change, and stores `part:true` on the `progress.recent` entry (ignored for "best", for first-attempt detection). It still counts for streak, weekly goal, topic totals and "questions you keep missing".
- **Exam mode:** no marking until the end, answers can be changed. **Practice mode:** instant marking and explanation, sound effects (`js/sound.js`, synthesised with Web Audio, switch saved as `sound_on` in localStorage, on by default).
- **Result screen:** stats row, review with "Show all answers", Share result, Download (CSV), Invite friends (`js/share.js`), "New run of this set".
- **Locked sets:** shown as "Locked for now" on the bank page and refused if opened by link. Admins can still open them.

### 11.2 Normal and Abstract (replaces difficulty levels)
CSV column `kind` (also accepts `type`; JSON field `kind`). Values starting with abstract/scenario/application/case/complex mean abstract; blank means normal. Only abstract is stored (`kind:"abstract"`). Normal = usual exam-type questions, Abstract = complex real-world cases. There are no difficulty levels anywhere.

### 11.3 Symbols (`js/lib/symbols.js`, `fx()`)
m^-2 to m⁻², s^(-1), x^{2}, x^n, H_2O, a_{12}, 3 x 10^8, 30^o, <= >= != +- ~= sqrt(. Web addresses inside text are skipped and image fields are never passed through. Applied: in `parseSet` (all uploads, including tournament questions), when leaving the paste box and title fields in the admin upload, in the single-question editor, and at display time in `prepareQuiz` (so old sets look right at once). Admin > Banks & sets > "Convert symbols in existing questions" rewrites stored sets once (only sets that change; version goes up).

### 11.4 Admin: Banks & sets
- Each set shows added/updated dates, abstract count, and buttons **Questions, Export, Lock/Unlock, Replace, Delete**. Locking is stored in `banks/{id}.sets[].locked` and is a visibility switch in the app (the rules still only check paid status; a determined student could read a locked set document directly).
- **Update log** per bank (`banks/{id}.log`, newest first, 40 entries): added, replaced, edited question, deleted question, locked, unlocked, deleted set, deleted all, converted. Entries for sets that still exist have an Export button, so two uploads on the same topic on different days can be locked and exported separately.
- **Export** one set = CSV in the upload format (+ kind column), can be uploaded again. Bank-wide backup (in the delete-all box) adds a `set` column.
- **Safe delete:** deleting a set or "Delete all questions in this bank" opens a warning with the question count, a "Download backup CSV" button, and needs DELETE typed (`typedConfirm` in `ui.js`). Deleting ONE question (Questions editor) is a simple yes/no. Deleting a question moves later numbers up, so that set's `qStats` is cleared; students' stored fail-log numbers for that set can then point at the wrong questions (same trade-off as Replace).
- Editing a question keeps numbering, bumps the set version, and rebuilds the free taster if it was built from that set.

### 11.5 Still open
Paystack; hosting choice; the owner's earlier open items in section 6. Per-question timing from QuizForge was not ported.

### 11.6 Profile pictures (added later in session 6)
12 original SVG characters in `js/avatars.js` (fox, cat, owl, panda, bear, rabbit, lion, penguin, robot, astronaut, scholar, doctor). The pick is stored in the existing `profiles.avatarColor` field as `"<colour>|<id>"` (e.g. `#ff9a3c|fox`), so `firestore.rules` did not change and old plain-colour profiles still show their letter. `avatar()` in `ui.js` draws the picture everywhere (leaderboard, admin lists, etc.). Chosen in onboarding step 1 (optional) and in Profile (tap the picture or "Change profile picture"). `sw.js` VERSION is `sumas-v11`. Tests: 40 unit, 188 e2e.

### 11.7 Admin > Pictures (add more profile pictures)
New admin tab "Pictures" (`js/pages/admin-avatars.js`): paste SVG code or choose an .svg file, name it, pick a background colour, see a live preview, Add. Remove with a simple confirmation. Stored in `settings/avatars` as `{items:[{id,name,bg,art}]}` (up to 40). `sanitizeSvg()` in `js/avatars.js` rebuilds every SVG from an allow-list (shapes and plain attributes only; scripts, event handlers, links, images, foreignObject, style and external references are dropped; other viewBox sizes are scaled to 64) when saving AND again when loading, so even a tampered document can't inject code. Loaded with the other settings at login and cached in localStorage (`avatars_custom`). A removed picture makes students fall back to their coloured letter. `firestore.rules` unchanged (settings are already admin-write, public-read). `sw.js` VERSION `sumas-v12`. Tests: 41 unit, 193 e2e.


### 11.8 Paid-only pictures, prices, quotes, manual questions (Nov 2026)
- **Paid-only pictures:** `settings/avatars.premium` (ids). Defaults doctor/scholar/astronaut until the admin saves a list. UI-level only: rules can't check it, so a free user who writes `avatarColor` by hand could still set one. Pictures already chosen keep showing.
- **Prices:** plans are `1w` (7 days, N500), `1m` (N2,000), `3m` (N6,000). `2w` is retired but kept in `PLANS` so old subscriptions still display. `priceOf(plans,k)` ignores stored prices without `v: 2` (so the new defaults apply at once); Admin > Settings saves with `v: 2`. Rules accept `1w`.
- **Nicknames:** `short(nick)` (14 chars then "...") everywhere a nickname is listed; hero and profile headers align the text block with the picture.
- **Past sessions:** Progress > Recent sessions rows open a sheet (score, date, missed list, review the missed with answers, retry, practise again). Missed list is hidden when the set version changed.
- **Quotes:** Admin > Quotes writes `settings/quotes` `{home,low,medium,high:[{t,by?}]}`; 140 char limit, 40 char reference. Merged with `content/quotes.json` in `loadQuotes`.
- **CSV template:** card at top of Admin > Banks & sets (with examples, or blank). New CSV column `explanation_image`.
- **Manual questions:** "Add questions by hand" per bank (`js/pages/admin-manual.js`), into an existing set (appended, qStats kept) or a new set; separate Question image and Explanation image sections (link or Cloudinary upload). Stored as `image` and `eimage`.


### 11.9 Privacy page, error handler, countdown (Nov 2026)
Privacy policy page at `#/privacy` (text in `js/pages/privacy.js`, draft, needs a lawyer). Global error handler in `js/errors.js` stores the last error in `window.__lastError` and adds it to the Profile WhatsApp link. Tournament countdowns tick every second locally.

### 11.10 Debug review fixes (Nov 2026, `sumas-v15`)
- `js/ui.js`: Escape now closes only the top-most sheet (a `confirmBox` over the Questions sheet no longer closes both).
- Catalogue sets have an optional `stableFrom` (first version whose question numbers are still valid). `saveSetContent({ append: true })` (used by manual add) keeps it, so "questions you keep missing" and past-session review survive an appended question. A re-upload, replace or conversion resets it. `logStillValid()` in `js/lib/stats.js` does the check. An in-progress quiz resume is still dropped after any change to the set (its saved question count no longer matches).
- Deleted sets no longer show "Practise this set again" or a retry link (Progress sheet and keep-missing list).
- (`sumas-v16`) Navigating away now closes any open sheet (`closeAllSheets` in `js/ui.js`, called by `js/router.js`). Group-match minimum players can no longer exceed the maximum (`lobbyConfig` and the Admin > Settings save).

### 11.11 Rules hardening and review (Nov 2026, `sumas-v17`) - REPUBLISH `firestore.rules`
- `profiles` update: the shown `nickname` must equal `nicknameLower` (before, a student could change only `nickname` and skip the 4-week limit and the reservation); `avatarColor` must be a string of at most 60 characters; `showActivity` a bool.
- `lobbies/{lid}/players`: creating a player doc must raise the lobby's `joinedCount` by 1 in the same batch, and an owner deleting their player doc must lower it by 1 (before, a paid user could delete and re-join to inflate the count and block others). The app already does both in one batch.
- `loadQuotes` reads `settings/quotes` at most every 6 hours.
- e2e "unconfigured" test now serves a placeholder config, because the real `js/firebase-config.js` is filled in. Rules are not covered by the e2e suite (it uses a fake Firestore): test them in the Rules Playground after publishing.

### 11.12 Free for everyone switch (Nov 2026, `sumas-v18`) - REPUBLISH `firestore.rules`
- Admin dashboard: a card above the tabs, "Free for everyone: ON/OFF", with a confirm. Writes `settings/app.freeForAll` (merge, so Settings saves don't clobber it).
- `state.js`: `hasPaidSub()` (real subscription), `freeForAll()`, `isPaid()` = either. Home, Profile and Plans use `hasPaidSub()` for subscription details and show a "Free for everyone" card when the switch is on.
- Rules: `isPaid()` also accepts `settings/app.freeForAll == true` (checked only when the user has no valid subscription), so sets, leaderboard, matches, attempts etc. open to every signed-in user. Switching off restores the old behaviour at once for reads.
- Students pick the change up the next time they open or reload the app (settings load at start).

### 11.13 Match-creation hardening, notifications, share links (Nov 2026, `sumas-v19`) - no rules change
- **Admin "Schedule match"** (`admin-lobbies.js`): messages now show inside the form (`#ferr`) instead of only a toast; the "not an evening time" warning is inline and the second tap of Create goes ahead (no stacked confirm sheet); button shows "Creating..."; the write has a 15 s timeout; the sheet stays open on failure with a plain reason; on success a "Match scheduled" sheet shows the share link(s) with Share / Copy buttons.
- **Share links** (`share.js`: `linkTo`, `shareLink`, `copyLink`): `https://host/path#/match/ID` and `#/tournament/ID`. Buttons: student match page, student tournament page, admin match list, admin tournament list. A signed-out visitor is sent to login and then returned to the link (`next_route` in sessionStorage, validated by the `DEEP` regex in `app.js`).
- **Notifications** (`notify.js`): in-app "new match / tournament" banner (checked at most every 3 h, at most ~2 small queries), optional phone notification via the service worker only while the app is open or in a background tab. Profile has two switches. There is NO push to a closed app: that needs FCM plus a sender, not possible on Spark without server code.
- `sw.js` VERSION `sumas-v19`, `notificationclick` handler, `js/notify.js` added to SHELL. e2e section W covers create flow, share sheet, deep link (230 checks).
