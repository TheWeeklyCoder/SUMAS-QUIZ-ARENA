// Single place that pins the Firebase SDK version and initialises the app.
// Every other module imports Firebase functions from here.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

export const configured = Boolean(firebaseConfig.apiKey) && !String(firebaseConfig.apiKey).startsWith("PASTE");

export let app = null;
export let auth = null;
export let db = null;

if (configured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  try {
    // Offline cache: reads that were already fetched keep working without a connection.
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch {
    db = initializeFirestore(app, { localCache: memoryLocalCache() });
  }
}

export * from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
export * from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
