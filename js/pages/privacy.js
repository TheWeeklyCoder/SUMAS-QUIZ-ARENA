// Privacy policy. DRAFT: have a lawyer review this before launch (Nigeria Data Protection Act 2023).
// Edit PRIVACY_TEXT any time. It is a plain page, not an accepted-by-checkbox document, so no version bump is needed.
import { esc } from "../lib/util.js";
import { waLink } from "../state.js";

export const PRIVACY_VERSION = "1 (draft)";

export const PRIVACY_TEXT = `SUMAS QUIZ ARENA: PRIVACY POLICY (DRAFT)

1. Who we are
SUMAS Quiz Arena is a practice service for university students. You can reach us on WhatsApp from the Profile page or the link below.

2. What we collect
- Account: your email address, and your sign-in method (email and password, or Google). We never see your Google password.
- Profile: your nickname, profile picture choice and age group (adult or under 18).
- Your practice: scores, progress, streaks, questions you missed, and which sets you have tried.
- Visits: a small record of each visit (when it started and ended, how many sets you did) to help us keep the service running well.
- Payments: the reference, amount, date and plan you submit, and an optional receipt picture.
- Terms: a record that you accepted the terms, with the version and the time.
- This device: a random device code, used so only one phone is signed in to your account at a time.

3. Why we use it
To run your account, mark and show your progress, work out ranks and leaderboards, check and approve payments, run tournaments and group matches, keep the service secure and fair, and help you when you contact us.

4. Who can see it
- Other students can see your nickname, profile picture and scores on leaderboards, ranks and tournament results. They cannot see your email or payment details. If you turn off "Show me in activity pop-ups" in Profile, you will not appear in those pop-ups.
- The admin can see your account, payment and visit records so that we can run the service.
- We do not sell your data and we do not show adverts.

5. Services we use
We store data with Google Firebase (sign-in and database). Receipt pictures and question images are stored with Cloudinary. Buttons that open WhatsApp take you to WhatsApp, which has its own privacy rules.

6. Children
If you are under 18 you can use the practice features. Under-18s cannot enter the prize mode of sponsored tournaments.

7. How long we keep it
We keep your data while your account is open. If you delete your account (Profile > Delete my account), your login, profile, progress and remaining subscription are deleted. For accounting, security and fairness we keep payment records, your record of accepting the terms, your first-attempt scores on sets, and your nickname (reserved so nobody can pose as you).

8. Your choices
You can change your nickname and picture in Profile, switch off activity pop-ups, and delete your account. You can also ask us on WhatsApp to see or correct the data we hold about you.

9. Changes
We may update this policy. The newest version is always on this page.`;

export default function privacy(ctx) {
  const ask = waLink("Hi, I have a question about my data on SUMAS Quiz Arena.");
  ctx.view.innerHTML = `<section class="stack-l" style="max-width:480px;margin:0 auto;padding-top:8px">
    <header><h1 style="margin:0">Privacy policy</h1><p class="muted small" style="margin:0">Version ${esc(PRIVACY_VERSION)}</p></header>
    <div class="card"><div style="white-space:pre-wrap;line-height:1.55">${esc(PRIVACY_TEXT)}</div></div>
    <a class="btn block" href="${esc(ask)}" target="_blank" rel="noopener">Ask about my data on WhatsApp</a>
  </section>`;
}
