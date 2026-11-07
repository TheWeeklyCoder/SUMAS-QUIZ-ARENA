# SUMAS Quiz Arena: Summary of Everything We've Discussed

Last updated: 31 Oct 2026. Use this as your review checklist. Companion files: `DATA_MODEL.md` (what is stored and who can touch it) and `firestore.rules` (the security rules).

## 1. What the app is now

A subscription-based academic practice platform for Nigerian university students. The mission is unchanged: help every student pass their exams and leave no one behind. It blends question banks, progress tracking, group matches and sponsor-funded tournaments.

**The big pivot:** the original plan had students paying entry fees into a prize pool. That is removed. Money now comes only from subscriptions, and prizes come only from sponsors.

## 2. Free vs paid

| | Free | Paid |
|---|---|---|
| Question banks | Taster: first 10 questions per bank (editable in admin) | Full banks |
| Own score | Yes | Yes |
| Compare, ranks, leaderboard, user search | Locked | Yes |
| Progress page | Last few sessions + total score; charts blurred | Full charts, weak topics, streaks, goals |
| Group matches | Locked | Yes |
| Live activity pop-ups | No | Yes |
| Sponsored tournaments | Fun mode, and prize mode if 18+ (free). Own score only after grading | Same, plus rank, standings and answer review |
| Notes and summaries (Selar) | Anyone can view and buy on Selar | Same |

**Plans:** 2 weeks, 1 month, 3 months. Prices editable in admin. A renewal stacks on remaining time. Price the 3-month plan clearly cheaper per week.

## 3. Features

1. **Login and identity:** email/password and Google. Unique @nickname, chosen at onboarding, changeable once every 4 weeks (28 days). Old handles stay reserved so nobody can impersonate a top student. Coloured initial avatars, no uploads. Age confirmation (adult or minor) at sign-up. One active device per account (newest login wins) with a clear "signed in on another device" message.
2. **Terms acceptance proof:** each acceptance saves user ID, terms version, a fingerprint of the exact text, and a server timestamp. It is never editable. Admin can print any record to PDF. Re-ask when terms change.
3. **Question banks:** one set = one document (50 to 200 questions), cached on the device, with a version number so you can fix leaks or errors. Math is plain readable text (Unicode like x², √, ½), no KaTeX. Images through Cloudinary (separate `sumas/` folder, restricted unsigned upload preset, automatic compression with `f_auto,q_auto`). You upload answers, and the app auto-marks.
4. **Strength and weakness logging:** each first attempt logs the list of missed questions. Your admin "Analyse" button turns this into per-question and per-topic miss rates. A question nearly everyone misses probably has a wrong key. Tag every question with a topic when you upload.
5. **Progress page:** score trend, strong and weak topics, accuracy rings, streak calendar, "questions you keep missing" with Retry, weekly goal, average time per question, "improved since last time" badge.
6. **Encouragement:** a short line on Home and after each session, chosen by result. We write the lines ourselves and keep them in a file you can edit. We say "missed", never "failed".
7. **Live activity pop-ups (bottom left):** only real events, for paid users, at most one every 30 seconds, never during a quiz, with a user opt-out and an admin kill switch.
8. **Group matches:** scheduled windows (for example 8pm daily). A student taps Join and sees "X joined, Y more needed". Lobbies are capped at about 30 to 50 players. Questions open at start, the answer key unlocks after the match ends, and you click "Grade match" to publish official standings. Students can also play solo and compare afterwards.
9. **Sponsored tournaments:** free entry with two modes, "play for fun" and "compete for prize". Sponsor-funded prizes only. Public hall of fame if the sponsor agrees. Collect a winner's real name and phone only when they win.
10. **Selar products:** notes and summaries, free or paid, listed in the app and bought through your Selar account. We can't verify purchases automatically without a server.
11. **Complaints:** the "Report this question" button opens WhatsApp to **2349155852375** with the set, question number, version and nickname prefilled. Nothing is stored in Firebase.
12. **Admin panel:** role-protected. Users table (avatar, nickname, email, subscription status, last login), payments queue with duplicate-reference flags, subscription editor, question bank and taster tools, "Analyse", lobby and tournament grading, activity kill switch, CSV/JSON export, and printable terms records.

## 4. Payments and refunds

- **Manual transfer only at launch.** The student picks a plan, sees your account details and a unique reference code, transfers, then submits the reference, amount and date (receipt optional).
- Status tracker: Submitted, Under review, Approved, with "usually within 24 hours" and a WhatsApp link for help.
- You approve in admin, which sets or extends the subscription. Access is enforced by Firestore rules on the server, and the lock icon in the app is only cosmetic.
- **Refunds:** within 7 days if payment was approved but access failed. None once access has been used. State this in the terms and tick-box before payment.
- Online gateway (Paystack): later. Needs a secret key on a server, and a free Cloudflare Worker could do it without a card.

## 5. Look and feel

Deep navy (#0F172A) with slate text and emerald or gold only for actions and success. Calm and spacious (8px grid, one main action per screen). Bottom navigation: Home, Practice, Progress, Arena, Profile. Every screen has its own link (`#/progress`) and leads naturally to the next step. Focus mode during quizzes, skeleton loading, short transitions, reduced-motion support.

**Connectivity pop-ups** for offline, slow connection, back online, failed loads, locked content, busy server, and offline during a match, each in plain language with a reassurance line (full table in `DATA_MODEL.md`).

**Reassurance hints** appear wherever a student might worry: payment status, expiry countdown, "your progress is saved", why we ask for age, and so on.

## 6. Technical decisions

- Vanilla HTML, CSS and JS, no frameworks. Firebase free plan only, **no Blaze**, no server code.
- Because there is no server, anything that must be trustworthy is either locked by security rules (access, payments, answer keys, entries) or done by you in admin (points, standings).
- Files kept separate for readability (HTML, CSS, JS modules, manifest, service worker). PWA installable.
- The free plan allows about 50k reads and 20k writes per day. Our design costs roughly 60 reads per active student per day, so 50 students is comfortable. The activity feed and lobbies grow fastest, so watch usage weekly.

## 7. Risks and honest limits

- **Legal:** with entry fees removed the lottery risk mostly goes away. Still have a lawyer check the tournament wording, since prize mode is a paid-user feature. Safer alternative: open prize mode to all adult users for free. This is **your decision**.
- **Practice scores** come from the browser, so they could be faked by a determined cheater. Prizes rely on tournaments, where the answer key is locked and you grade.
- **Cached sets** stay readable offline after a subscription ends. Expire caches after 7 days.
- **Blocking inspect** isn't really possible. The real protection is never sending secrets to the browser. Paid sets stay behind rules, and shuffling questions and options per user makes leaks less useful.
- **Progress locks** for free users are UI-only, because that data is their own private data. The comparison data is the part protected by rules.
- **Account sharing:** one-device rule is a deterrent, not a perfect lock.
- **Data protection:** you believe NDPC registration isn't needed, and that may be right at your size. Still keep a matching privacy policy, collect minimal data, and offer account deletion. Recheck as you grow.
- **Content rights:** past-paper questions may be copyrighted, so write or reword them yourself.
- **Backups:** the free plan has none automatic. Export CSV/JSON weekly and secure your admin Google account with 2-step verification.
- **Google sign-in** often fails inside WhatsApp or Facebook in-app browsers, so we add an "open in Chrome" prompt and keep email login as a fallback.
- **Cold start:** group matches need users. Scheduled windows plus a WhatsApp group announcement help.
- **Your admin workload:** approving payments, grading matches and tournaments, and running Analyse. All are one-click tasks.

## 7b. Still open (your call)

1. Naira prices: 2 weeks N2,500 and 1 month N5,000 decided; 3 months still to be set in Admin > Settings.
2. ~~Prize mode~~ DECIDED: free for all adults. Analytics (rank, standings, answer review) stay paid-only.
3. The viewport snippet you required blocks pinch-zoom (`maximum-scale=1`). I'd still drop it for accessibility.
4. Match schedule (days and time) and minimum players per lobby.
5. Your bank account details and refund wording for the terms.

## 8. Build order (phases)

1. **Phase 1:** auth, onboarding (nickname, age, terms), avatars, tasters and full sets with auto-marking, manual payments and subscriptions, connectivity banner, WhatsApp report, admin basics.
2. **Phase 2:** progress page, encouragement, fail logging and Analyse, ranks and comparison, user search, admin logs and export.
3. **Phase 3:** Selar products, sponsored tournaments, hall of fame.
4. **Phase 4 (done):** group match lobbies (min 10, max 40, evenings) and live activity pop-ups (heaviest on the free tier, so last).
5. **Later:** online payment gateway.

## 9. Before going live checklist

- Publish and test the rules in the Rules Playground.
- Add your admin UID in the console, plus 2-step verification on that Google account.
- Restrict the Firebase API key to your domain, and consider App Check.
- Write the terms, privacy policy and refund wording, and have them reviewed.
- Seed at least a few banks with topic tags and test the full payment flow with a friend.
