// Tiny IndexedDB key-value store for question sets, tasters and the bank catalogue.
const DB_NAME = "sumas-cache";
const STORE = "kv";
let dbp = null;

function open() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) return reject(new Error("no indexedDB"));
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  return dbp;
}

const run = async (mode, fn) => {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req && "result" in req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
    });
  } catch { return undefined; }
};

/** Returns { value, savedAt } or null. */
export async function cacheGet(key) { return (await run("readonly", (s) => s.get(key))) || null; }
export async function cacheSet(key, value) { await run("readwrite", (s) => s.put({ value, savedAt: Date.now() }, key)); }
export async function cacheDel(key) { await run("readwrite", (s) => s.delete(key)); }
export async function cacheClear() { await run("readwrite", (s) => s.clear()); }
