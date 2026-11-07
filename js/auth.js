// Sign-in helpers and the one-active-device rule.
import {
  auth, db, doc, setDoc, onSnapshot, serverTimestamp,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, signInWithRedirect,
  GoogleAuthProvider, sendPasswordResetEmail, signOut, deleteUser, getRedirectResult,
  EmailAuthProvider, reauthenticateWithCredential, updatePassword,
  linkWithCredential, sendEmailVerification, reauthenticateWithPopup,
} from "./firebase.js";
import { ls, sleep } from "./lib/util.js";
import { cacheClear } from "./cache.js";
import { stopSessionLog } from "./sessionlog.js";

/** Set just before an explicit sign-in so the new device "wins" the one-device rule. */
export const flags = { justSignedIn: false };

export const emailSignUp = async (email, pw) => {
  flags.justSignedIn = true;
  const cred = await createUserWithEmailAndPassword(auth, email, pw);
  sendEmailVerification(cred.user).catch(() => {});   // don't block sign-up
  return cred;
};
export const emailSignIn = (email, pw) => { flags.justSignedIn = true; return signInWithEmailAndPassword(auth, email, pw); };
export const resetPassword = (email) => sendPasswordResetEmail(auth, email);

export async function googleSignIn() {
  flags.justSignedIn = true;
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return signInWithPopup(auth, provider);   // no redirect fallback: it often fails on hosted domains
}
export const redirectResult = () => getRedirectResult(auth).catch(() => null);

export async function logout() {
  stopSessionGuard();
  stopSessionLog();             // write the final counts while we are still signed in
  await cacheClear();           // don't leave full question sets on a shared device
  await signOut(auth);
}
/** Does this account have an email/password sign-in (as opposed to Google only)? */
export const hasPasswordLogin = () => !!auth.currentUser?.providerData?.some((p) => p.providerId === "password");

/** Change password: prove the current one first (Firebase requires a recent sign-in), then set the new one. */
export async function changePassword(current, next) {
  const u = auth.currentUser;
  await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, current));
  await updatePassword(u, next);
}
/** Attach an email/password login to a Google-only account (same UID, so admin and progress are kept). */
export async function setPassword(next) {
  const u = auth.currentUser;
  const cred = EmailAuthProvider.credential(u.email, next);
  try {
    await linkWithCredential(u, cred);
  } catch (e) {
    if (e.code !== "auth/requires-recent-login") throw e;
    // Prove it's really them with Google, then try once more.
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await reauthenticateWithPopup(u, provider);
    await linkWithCredential(u, cred);
  }
}

/** Best-effort verification email. Never blocks sign-up or login. */
export const sendVerification = () => {
  const u = auth.currentUser;
  return u && !u.emailVerified ? sendEmailVerification(u).catch(() => {}) : Promise.resolve();
};
export const removeAuthUser = () => deleteUser(auth.currentUser);

/** Facebook, Instagram, WhatsApp and similar in-app browsers often block Google sign-in. */
export const inAppBrowser = () => /FBAN|FBAV|Instagram|WhatsApp|Line\/|MicroMessenger|Twitter|TikTok/i.test(navigator.userAgent);

export function authMessage(e) {
  const m = {
    "auth/provider-already-linked": "This account already has a password. Use Change password instead.",
    "auth/credential-already-in-use": "That email already has a password login on another account.",
    "auth/popup-blocked": "Your browser blocked the Google sign-in window. Allow pop-ups for this site, or open the app in Chrome, or log in with email.",
    "auth/operation-not-supported-in-this-environment": "Google sign-in doesn't work in this browser. Open the app in Chrome, or log in with email and password.",
    "auth/invalid-email": "That email doesn't look right. Please check it.",
    "auth/missing-password": "Please enter your password.",
    "auth/weak-password": "Please use a password with at least 6 characters.",
    "auth/email-already-in-use": "An account with this email already exists. Try logging in instead.",
    "auth/invalid-credential": "Email or password is incorrect. Please try again.",
    "auth/wrong-password": "Email or password is incorrect. Please try again.",
    "auth/user-not-found": "Email or password is incorrect. Please try again.",
    "auth/too-many-requests": "Too many attempts. Please wait a few minutes and try again.",
    "auth/network-request-failed": "No internet connection. Please check your network and try again.",
    "auth/popup-closed-by-user": "Sign-in was cancelled.",
    "auth/cancelled-popup-request": "Sign-in was cancelled.",
    "auth/unauthorized-domain": "This web address isn't authorised in Firebase yet (Authentication > Settings > Authorised domains).",
    "auth/user-disabled": "This account has been disabled. Please contact us on WhatsApp.",
    "auth/requires-recent-login": "For your safety, please log in again and then repeat this.",
  };
  return m[e?.code] || "Something went wrong. Please try again.";
}

/* ---------- One active device per account ---------- */
const deviceId = (() => {
  let id = ls("deviceId");
  if (!id) { id = (crypto.randomUUID?.() || String(Math.random()).slice(2) + Date.now()); ls("deviceId", id); }
  return id;
})();
let unsub = null;

export function stopSessionGuard() { unsub?.(); unsub = null; }

/**
 * claim=true on an explicit sign-in: write our device id (newest login wins).
 * Then listen: if another device claims the session, this one signs out with a clear message.
 */
export async function startSessionGuard(uid, { claim = false, onKicked } = {}) {
  stopSessionGuard();
  const ref = doc(db, "sessions", uid);
  const write = () => setDoc(ref, { sessionId: deviceId, updatedAt: serverTimestamp() }).catch(() => {});
  if (claim) await Promise.race([write(), sleep(6000)]);   // offline: Firestore queues it, don't block the UI
  unsub = onSnapshot(ref, (snap) => {
    if (snap.metadata.hasPendingWrites) return;
    if (!snap.exists()) { if (navigator.onLine) write(); return; }
    if (snap.data().sessionId !== deviceId) {
      stopSessionGuard();
      sessionStorage.setItem("kicked", "1");
      onKicked?.();
    }
  }, () => { /* offline or rules hiccup: ignore */ });
}
