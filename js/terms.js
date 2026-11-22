// Terms of use. DRAFT: have a lawyer review this before launch (see README).
// IMPORTANT: when you edit TERMS_TEXT, increase TERMS_VERSION. Every student is then asked to accept again,
// and each acceptance stores the version and a SHA-256 fingerprint of the exact text they saw.
export const TERMS_VERSION = 1;

export const TERMS_TEXT = `SUMAS QUIZ ARENA: TERMS OF USE (DRAFT v1)

1. What this is
SUMAS Quiz Arena is a paid academic practice service for university students. It gives you question banks, progress tracking, group matches and sponsor-funded tournaments.

2. Your account
You must give accurate information. Your nickname must not impersonate anyone or be offensive. You may change it once every 4 weeks. Old nicknames stay reserved. One account is for one person and one active device at a time. Sharing your login may lead to suspension.

3. Age
If you are under 18 you may use the practice features. Prize mode in sponsored tournaments is for adults only.

4. Free and paid access
Free accounts can use a small taster of each question bank and see their own score. A paid subscription (1 week, 1 month or 3 months) unlocks full banks, comparison, ranks, group matches and more. Renewals add to your remaining time.

5. Payments
Payments are made by bank transfer. After transferring, you submit your payment details in the app. Access starts when we approve your payment, usually within 24 hours.

6. Refunds
If your payment was approved but you could not get access, you can ask for a refund within 7 days of approval. Once access has been used, payments are not refundable.

7. Fair use
Do not copy, resell or publish our questions. Do not use bots, scripts or other tools to cheat, harvest content or disrupt others. We may remove scores or suspend accounts for abuse.

8. Tournaments and prizes
Prizes are provided by sponsors, not by entry fees. We grade tournaments and decide winners, and our decision is final. Winners may be asked for their real name and phone number so a prize can be delivered. Sponsors may publish winners with consent.

9. Content
Questions are written or adapted for practice and may contain mistakes. Please report them using the Report button. Marks in practice are a study aid, not a prediction of your exam results.

10. Your data
We collect only what the service needs: your email, nickname, age group and your practice results. We do not sell your data. You can delete your account in your profile.

11. Changes
We may update these terms. If they change, we will ask you to accept the new version before you continue.

12. Contact
Use the WhatsApp link in the app for help.`;

/** SHA-256 hex of the exact terms text shown to the student. */
export async function termsHash(text = TERMS_TEXT) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
