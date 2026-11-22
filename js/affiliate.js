// Referral capture: remember ?ref=CODE from a shared link, then link the new student to their affiliate once (best effort).
import { db, doc, getDoc, setDoc, serverTimestamp } from "./firebase.js";
import { state } from "./state.js";
import { ls } from "./lib/util.js";
import { refFromUrl } from "./lib/affiliate.js";
import { isOnline } from "./net.js";

/** Call once at start-up, before sign-in. */
export function captureRef() {
  const code = refFromUrl(location.hash, location.search);
  if (code) ls("ref_code", code);
}

/** Link this (new) student to the affiliate whose link they used. Never blocks anything; rules allow it only in the first 3 days. */
export async function claimReferral() {
  const uid = state.user?.uid, code = ls("ref_code");
  if (!uid || !code || !state.profile || ls("ref_done_" + uid) || !isOnline()) return;
  const done = () => { ls("ref_done_" + uid, 1); ls("ref_code", null); };
  const created = Number(state.profile.createdAt) || 0;
  if (created && Date.now() - created > 2.5 * 86400000) return done();   // not new any more
  try {
    const c = await getDoc(doc(db, "affiliateCodes", code));
    if (!c.exists() || c.data().uid === uid) return done();
    await setDoc(doc(db, "referrals", uid), { affiliateUid: c.data().uid, code, nickname: state.profile.nickname, subscribed: false, createdAt: serverTimestamp() });
    done();
  } catch (e) { if (e?.code === "permission-denied" || e?.code === "not-found") done(); /* offline or other: try again next time */ }
}
