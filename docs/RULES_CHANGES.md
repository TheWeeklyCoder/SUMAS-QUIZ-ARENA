# Rules changes in Phase 3 (you must republish `firestore.rules`)

Three small edits, all in the tournament section. Everything else in the file is unchanged.

| # | Where | Before | After | Why |
|---|---|---|---|---|
| 1 | `tournaments/{tid}/entries` create | prize mode needed a **paid** and adult account | prize mode needs an **adult** account (free or paid). Also: `answers` must be a list of at most 200 items | Your decision: prize mode is free for all adults |
| 2 | `tournaments/{tid}/results/{uid}` read | admin or paid | **the student themselves**, admin, or paid | Free students can see their own score; only paid students can read other results and the standings |
| 3 | `tournamentKeys/{tid}` read | any signed-in user after the tournament closed | **paid** users after it closed (and admin) | Analytics (answer review) is for subscribers |

Unchanged on purpose: fun mode is open to every signed-in user; questions open to every signed-in user at the start time (everyone must be able to play); `hallOfFame`, `tournaments` and `products` stay publicly readable.

## How to publish (Android, about 5 minutes)
1. Open the new `firestore.rules` from the zip in SPCK Editor and select all, then copy.
2. In Chrome open console.firebase.google.com > your project `sumas-quiz-arena` > Firestore Database > **Rules** tab.
3. Select everything in the editor, paste, tap **Publish**. You should see "Rules published".
4. Quick test in the **Rules Playground** (same tab): pick *get*, path `/tournaments/test/results/someone`, tick Authenticated with a UID that is **not** `someone`, run. It should say **Denied**. Change the UID to `someone`: still depends on the tournament existing, but the results rule itself allows the owner.
5. The real test: with a free account, enter a tournament in prize mode. It should work. With a minor account, prize mode should be refused and fun mode should work.

## What the app does with this
- Free student, after grading: sees their own score and a "Winner" banner if they won. No rank, standings or answer review (locked card).
- Paid student: score, rank ("#2 of 14"), top-20 standings for prize and fun modes, and an answer-by-answer review.
- Winners are never asked for personal details in the app. The "Claim on WhatsApp" button opens a prefilled message and the winner sends a name and phone number there.
