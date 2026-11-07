# SUMAS Quiz Arena: Data Model (v2, subscription model)

Firebase free plan (Spark). No server code. Every "who may do what" decision lives in `firestore.rules`.
Static content (free taster fallback, quotes, UI text) lives on Firebase Hosting as files, which cost zero Firestore reads.

## 1. Free vs paid

| Feature | Free | Paid (active subscription) |
|---|---|---|
| Answer question banks | Taster only: first N questions per bank (default 10, editable) | Full banks |
| See own score | Yes | Yes |
| Compare with others, ranks, leaderboard | Locked (teaser) | Yes |
| Search other students | Locked | Yes |
| Progress page | Last few sessions + total score; charts shown as a locked preview | Everything (charts, weak topics, streaks, goals) |
| Group matches (lobbies) | Locked | Yes |
| Live activity pop-ups | Not shown | Shown |
| Sponsored tournaments | "Play for fun" mode only | Fun mode and prize mode (prize mode also needs an adult account) |
| Notes and summaries (Selar links) | Visible to everyone, buying is on Selar | Same |
| Report a question | WhatsApp link | WhatsApp link |

Plans: **2 weeks, 1 month, 3 months.** Prices are editable in `settings/plans`. Approved renewals stack on remaining time.

## 2. Collections

### People and access
| Path | Who writes | Purpose / fields |
|---|---|---|
| `profiles/{uid}` | user (limited), admin (points) | Public card: `nickname`, `nicknameLower`, `avatarColor`, `points`, `solved`, `showActivity` (bool), `nicknameChangedAt` (null until first change), `createdAt`. Read by owner, admin and PAID users only. Users cannot write `points` or `solved`. |
| `users/{uid}` | user (limited) | Private: `email`, `ageGroup` ("adult" or "minor"), `createdAt`, `lastLogin`. Owner and admin read only. |
| `nicknames/{handleLower}` | user (create only) | Reserves a handle: `uid`, `createdAt`. Doc ID uniqueness guarantees no duplicates. Old handles stay reserved after a change (admin purges later). |
| `admins/{uid}` | nobody (console only) | Existence = admin. You add your own UID in the console. |
| `sessions/{uid}` | owner | One-device rule: `sessionId`, `updatedAt`. Newest login wins; older devices sign out. |
| `termsAcceptances/{uid_version}` | user (create only) | Proof: `uid`, `version`, `textHash`, `acceptedAt`. Admin panel prints to PDF. |
| `subscriptions/{uid}` | admin only | ONE record per user: `plan` ("2w", "1m", "3m"), `expiresAt`, `updatedAt`. Paid = this doc exists and `expiresAt` is later than server time. |
| `payments/{id}` | user (create, must be "pending"), admin (update) | `uid`, `plan`, `amount`, `reference`, `paidOn`, `receiptUrl`, `status` (pending, approved, rejected), `createdAt`. Full payment history. Admin flags duplicate `reference` values. |

### Content
| Path | Who writes | Purpose / fields |
|---|---|---|
| `banks/{bankId}` | admin | Public catalogue: `title`, `topic`, `setCount`, `version`, `freeCount`. Each `sets[]` entry may carry `stableFrom` (first set version whose question numbers are still valid; kept when questions are only appended). |
| `tasters/{bankId}` | admin | Free sample: `version`, `questions[]`, `answers[]` (first N or ticked questions). Admin's "rebuild taster" button regenerates it. Readable by any signed-in user. |
| `sets/{setId}` | admin | Full set (50 to 200 questions): `bankId`, `version`, `title`, `questions[]` (text, options, image URL, explanation, `topic`), `answers[]`. Keep under 1 MB. Paid users only. |
| `settings/app` | admin | `freeCount` (default 10), `activityFeedEnabled`, `whatsappNumber` (2349155852375), `supportHours`. Public read. |
| `settings/plans` | admin | Prices for 2w, 1m, 3m. Public read. |
| `products/{id}` | admin | Notes and summaries: `title`, `type`, `price` (0 = free), `selarUrl`, `description`. Public read. Purchase happens on Selar. |

### Activity, progress, and analysis
| Path | Who writes | Purpose |
|---|---|---|
| `attempts/{uid_setId}` | user (create only) | First attempt only: `uid`, `setId`, `bankId`, `score`, `total`, `wrong[]` (indices of missed questions), `durationSec`, `createdAt`. Tasters use `setId = "taster_<bankId>"`. This one document carries the fail log, so there is no per-question write. |
| `progress/{uid}` | owner | Rolling summary so the Progress page costs 1 read: `recent[]` (last 50 sessions), `topics` (per-topic correct and total), `streak`, `lastActiveDay`, `weeklyGoal`, `weekProgress`, `bestScore`, `totalScore`, `updatedAt`. |
| `setStats/{setId}` | admin | Comparison data: score distribution and top scores. Paid read. 1 read for "how did I rank?". |
| `qStats/{setId}` | admin | Per-question miss rates and per-topic totals, built by the admin "Analyse" button from attempts. Admin only. This is how you see where students are weak or strong. |
| `leaderboard/top100` | admin | One doc, rebuilt from admin. Paid read. |
| `activity/{id}` | paid user (limited), admin | Live pop-up feed: `uid`, `nick`, `type` ("finished" or "joined" from users; "record" from admin only), `bank`, `createdAt`. Users can only write about themselves, and only if `showActivity` is true. |
| `sessionLogs/{id}` | user | One doc per session: `uid`, `startedAt`, `endedAt`, `attempts`, `setReads`. |

### Group matches (scheduled windows)
| Path | Who writes | Purpose |
|---|---|---|
| `lobbies/{lid}` | admin; players may only change `joinedCount` by exactly +1 or -1 | `title`, `setId`, `opensAt`, `startsAt`, `endsAt`, `minPlayers`, `maxPlayers`, `joinedCount`, `status`. Everyone in the lobby listens to this one document to see "12 joined, 8 more needed". |
| `lobbies/{lid}/players/{uid}` | user (create and delete before start) | `uid`, `nick`, `joinedAt`. Created together with the +1 on `joinedCount` in one batch. |
| `lobbyQuestions/{lid}` | admin | Questions only. Readable when the match has started and the user has joined. |
| `lobbyKeys/{lid}` | admin | Answer key. Readable only after `endsAt`. |
| `lobbies/{lid}/entries/{uid}` | user (create only) | `uid`, `answers`, `durationSec`, `submittedAt` (must equal server time, inside the window). |
| `lobbies/{lid}/standings/final` | admin | Official standings, published after you click "Grade match". Paid read. |

Solo play uses the same sets and comparison data, so lobby results line up with solo results.

### Sponsors and tournaments
| Path | Who writes | Purpose |
|---|---|---|
| `sponsorRequests/{id}` | signed-in user (create) | Sponsor enquiry for admin. |
| `hallOfFame/{id}` | admin | Public winners board (only if the sponsor agrees). |
| `tournaments/{tid}` | admin | `title`, `sponsorName`, `prizeText`, `startsAt`, `endsAt`, `status`. |
| `tournamentQuestions/{tid}` | admin | Readable after start (signed-in). |
| `tournamentKeys/{tid}` | admin | Readable only after `endsAt`. |
| `tournaments/{tid}/entries/{uid}` | user (create only) | `mode` ("fun" or "prize"), `answers`, `submittedAt`. Prize mode requires a paid, adult account. |
| `tournaments/{tid}/results/{uid}` | admin | Scores published after you inspect. Paid read. |

Removed from v1: `entitlements`, per-bank prices, `questionReports` (complaints now go to WhatsApp).

## 3. Key flows

**Onboarding (one batch):** `nicknames` + `profiles` + `users` + `termsAcceptances`. If one fails, nothing is saved.

**Login:** read profile, write `lastLogin` once per session, write `sessions/{uid}` with a new `sessionId`, listen for changes (one-device rule), read `subscriptions/{uid}` to decide what to unlock.

**Payment:** student picks a plan, sees your account details and a reference code, transfers, submits reference, amount and date. Tracker shows Submitted, Under review, Approved. You approve in admin, which updates `subscriptions/{uid}` (extend from remaining time if still active). Refund rule: within 7 days if approved but access failed; none once access has been used.

**Finishing a session:** one `attempts` write (first attempt only), one `progress` update, optional one `activity` write. After that the score screen shows a quote. Paid users get a "how did I rank?" panel from `setStats`.

**Reporting a bad question:** opens `https://wa.me/2349155852375` with a prefilled message (set, question number, version, nickname). No database write.

**Group match:** lobby opens, student taps Join, `players/{uid}` is created and `joinedCount` goes +1 in one batch. Everyone sees "X joined, Y more needed". At `startsAt` the questions open for joined players if `minPlayers` is reached. If not reached, you extend or cancel from admin and the banner says so. After `endsAt` the key unlocks, the player sees their own score immediately, and official standings appear when you grade.

**Analysis (admin):** "Analyse" reads only attempts newer than the last run, writes `qStats` and `setStats`. A question that almost everyone misses probably has a wrong key, so it is flagged for review.

## 4. UX specification

**Calm, spacious layout**
- 8px spacing grid, generous padding, one main action per screen, details revealed on tap.
- Bottom navigation: Home, Practice, Progress, Arena, Profile. Active tab highlighted.
- Skeleton placeholders instead of spinners, short fade and slide transitions, a small checkmark or confetti moment at session end, and a reduced-motion mode.
- Body text at least 16px, strong contrast on navy, emerald or gold only for actions and success.
- Quiz focus mode: hide navigation and show only the question, a progress bar and the timer.

**Seamless links**
- Hash routes for every screen (`#/practice/anatomy`, `#/progress`) so the back button works and pages can be shared.
- Every screen points to the next sensible step: weak topic leads to "Practice this", finished session leads to "Retry missed questions", locked feature leads to the plans page.

**Encouragement**
- A short line on Home and after every session, chosen by result (low, medium, high). Say "missed", never "failed".
- Lines are written by us and stored in `content/quotes.json` on Hosting (zero reads), editable by you.

**Progress page (plain SVG, no library)**
- Score trend line, strong and weak topics as bars, accuracy ring per bank, streak calendar, "questions you keep missing" with Retry.
- Extras: weekly goal with progress ring, average time per question, "improved since last time" badge.
- Free users see the last few sessions and total score, with the charts blurred and a "Subscribe to unlock" button. This lock is a UI lock because the data is the user's own and private. The comparison data is the part protected by rules.

**Live activity pop-ups (bottom left)**
- Only real events from the `activity` feed: "Emeka just finished a test run", "New overall highest score!". Nothing invented when it is quiet.
- Shown to paid users only, at most one every 30 seconds, never during a quiz, and respecting `showActivity` and the admin kill switch (`activityFeedEnabled`).

**Reassurance hints everywhere**
- Payment tracker with expected approval time, expiry countdown, 3-day renewal reminder, "Your progress is saved", "Works offline once opened", short "why we ask" notes on the sign-up form.

**Connectivity alerts (one non-blocking banner at a time, plain language, `aria-live`)**

| Situation | Detection | Message |
|---|---|---|
| Offline | `offline` event, `navigator.onLine` | "You're offline. Sets you've opened still work and progress will sync when you're back." |
| Back online | `online` event | Green: "Back online. Syncing your progress..." (3 s) |
| Slow | `effectiveType` 2g or slow-2g, or a request over 8 s | "Your connection is slow. Loading may take a bit. Nothing is lost." |
| Load failed | Firestore `unavailable` | "Couldn't load this. Check your internet and tap Retry." |
| Not unlocked | `permission-denied` | "This needs an active subscription. See plans." |
| Daily limit | `resource-exhausted` | "We're very busy today. Please try again later. Your progress is safe." |
| Match or tournament while offline | Offline during an open window | "You're offline. Reconnect before HH:MM or your answers can't be submitted." |

Entries that reach the server after `endsAt` are rejected by the rules, and offline queuing cannot change that.

## 5. Rough quota check (Spark: about 50k reads and 20k writes per day)

Estimate per active paid student per day: Home about 5 reads, 3 set opens at about 3 reads each, progress 1, activity feed about 20, lobby updates about 20. That is roughly 60 reads per student per day, so about 3,000 reads at 50 students. Writes: about 2 to 3 per session. This leaves lots of headroom, but the activity feed and lobby listeners are the two items that grow fastest, hence the kill switch and the cap of about 30 to 50 players per lobby. Check the usage page in the Firebase console weekly.

## 6. Known limits

- Practice scores come from the player's browser, so a determined cheater could fake one. Prize decisions rely on tournaments, where the key is locked and you grade.
- Cached full sets stay readable offline after expiry. Re-check the subscription whenever a set is opened online, and expire caches after 7 days.
- Rules that look up other documents add to your read quota (about 2 reads per paid action).
- The nickname offensive-word filter runs in the browser. The rules block reserved words, and you can remove bad handles from admin.
- Lobby grading and tournament grading are one admin click each, but they are manual steps.

## 7. Phase 2 additions (no rules change)

| Path | Written by | Shape |
|---|---|---|
| `progress/{uid}.recent[]` | student | each session now also has `w` (original numbers of missed questions, max 100) and `v` (set version). "Questions you keep missing" is built from these; logs from an older version of a set are ignored. |
| `qStats/{setId}` | admin Analyse | `bankId, setId, title, n` (first attempts), `total` (questions), `miss{ "<index>": count }`, `updatedAt`. Taster attempts are stored under `taster_<bankId>`. |
| `qStats/_meta` | admin Analyse | run marker: `throughTs`, `throughId` (cursor after the last attempt processed), `lastRunAt`, `attemptsTotal`, `runs`. |
| `setStats/{setId}` | admin Analyse | `bankId, setId, title, n, hist[101]` (how many students got 0..100%), `sumPct`, `top[]` (best 10: `u, nick, score, total, sec, pct`), `updatedAt`. Not built for tasters. Paid read. |
| `profiles/{uid}.points / .solved` | admin Analyse | `points` = sum of correct answers on first attempts at full sets; `solved` = number of full sets completed. Taster attempts earn no points. |
| `leaderboard/top100` | admin "Rebuild leaderboard" | `entries[]` (`uid, nick, color, points, solved`), `updatedAt`. Rebuilt by reading the top 100 profiles by `points`. |
| `sessionLogs/{id}` | student | `uid, startedAt, endedAt, attempts, setReads`. Created once per visit, updated at most every 45 s. `settings/app.sessionLogsEnabled === false` turns it off. |

**Analyse is atomic.** One run reads at most 500 attempts after the saved cursor, groups them, and commits every stat, every student's points and the new cursor in ONE batch (cap 480 writes). If a run is cut short, the screen says how many attempts remain; press Analyse again. A failed batch changes nothing, so nothing is counted twice.

**Ranks** use first attempts only. The student's rank is worked out in the browser from `setStats.hist` (1 read). If the student's attempt is newer than `setStats.updatedAt` it is counted as an extra student.

**Known limits:** nicknames in `setStats.top` and the leaderboard are as of the last run (nickname changes appear at the next Analyse or rebuild). Replacing a set keeps its old stats unless the admin ticks "Start ranks and question stats afresh". The streak calendar covers the last 5 weeks but can only see the last 50 saved sessions.

## 8. Phase 3 additions

| Path | Written by | Shape |
|---|---|---|
| `tournaments/{tid}` | admin | `title, sponsorName, prizeText, description, startsAt, endsAt, winnerCount (default 3), status` (`draft`, `published`, `graded`), `count` (questions), `entryCount`, `prizeEntries`, `gradedAt`. Public read. Students see everything except drafts. "Open", "upcoming" and "closed" come from the clock. |
| `tournamentQuestions/{tid}` | admin | `questions[]` in the same shape as sets. Readable by any signed-in user from `startsAt`. |
| `tournamentKeys/{tid}` | admin | `answers[]` (original option numbers). Readable by paid users and admin after `endsAt`. |
| `tournaments/{tid}/entries/{uid}` | student, create-only | `uid, mode` (`prize` or `fun`), `answers[]` (index = original question number, value = original option number, -1 = skipped), `submittedAt` (server time, must be inside the window). Prize mode needs an adult account. |
| `tournaments/{tid}/results/{uid}` | admin Grade | `mode, score, total, rank, of, winner, gradedAt`. Rank and "of" are within the student's own mode. The student reads their own; paid students can read all. |
| `tournaments/{tid}/results/top` | admin Grade | `prize[]` and `fun[]` (top 20: `uid, nick, color, score, total, rank`), `gradedAt`. One read for the standings page. |
| `hallOfFame/{tid_place}` | admin | `tournamentId, title, sponsorName, prizeText, nick, place, score, total, at`. Published only on the admin's "Hall of Fame" button, after the sponsor agrees. No contact details are ever stored. |
| `sponsorRequests/{id}` | student create; admin reads | `uid, orgName, contact, message, wantsRecognition, createdAt`; admin adds `done`. |
| `products/{id}` | admin | `title, type` (`notes`, `summary`, `other`), `price` (0 = free), `selarUrl` (https only), `description, order, active`. Public read. Students see only active items with a valid https link. |

**Grading:** prize winners are the top `winnerCount` **prize-mode** players. Score decides; a tie goes to the earlier `submittedAt`. Fun-mode players are ranked among themselves and can never win the prize. Grading reads at most 2000 entries and writes results in batches of 400, then writes `top` and `status = graded` last, so students never see "graded" before their results exist. Re-grading overwrites.

**Limits:** the tournament window is enforced by the rules (server time). There is no per-attempt timer, because the server can't enforce one without a server; the countdown shown is to the closing time. Questions are readable by everyone from the start, so a student can share them while it is open.


## 9. Phase 4 additions (no rules change)
**`lobbies/{id}`**: title, setId, bankId, opensAt, startsAt, endsAt, minPlayers (10), maxPlayers (40), joinedCount, status (`scheduled`/`cancelled`/`graded`), extensions, joinedAtExtend, count, cancelReason, entryCount, createdAt. Subcollections: `players/{uid}` (join/leave in a batch with `joinedCount` +/-1, only while opensAt <= now < startsAt), `entries/{uid}` (create-only: uid, answers, durationSec, submittedAt, only between startsAt and endsAt), `standings/final` (written by admin when grading). **`lobbyQuestions/{id}`** opens at startsAt to joined paid players. **`lobbyKeys/{id}`** opens after endsAt to paid players.

**Host rule** (`decide` in `js/lib/lobby.js`): at the start time, if joinedCount < minPlayers: first time extend by 5 minutes (start and end both move); after an extension, cancel if nobody new joined since, otherwise extend again; cancel after 6 extensions. A server can't run this on the free plan, so Admin > Matches applies it every 15 seconds while open (switchable), with manual Extend/Cancel buttons.

**Settings keys** (`settings/app`): minPlayers, maxPlayers, extendMinutes, matchMinutes, activityEveryMin (never below 5), activityFeedEnabled (kill switch).

**Activity pop-ups**: `activity/{id}` (uid, nick, type finished|joined, bank, createdAt). Paid students only. No live listener: a 3-document read at most every 5 minutes, first after 45 s, daily per-device budget 400 reads, one pop-up per poll for 6 seconds, silent in quiz/play/match routes, hidden tab, offline, or when the student opts out (Profile). Posting: one event per 10 minutes per device, only if `profiles.showActivity`. Admin > Activity has "Clear old logs and events" (events > 7 days, session logs > 30 days).

**Restore** (Admin > Backup): reads a backup JSON and writes back only collections the admin can write under the rules (banks, tasters, sets, settings, products, subscriptions, setStats, qStats, leaderboard, hallOfFame, tournaments and their questions/keys). Default mode only adds missing documents; ISO date strings become Timestamps again.
