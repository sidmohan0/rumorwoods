/** Shared IndexedDB handle: sessions + custom character roster. */

// Named per major variant: IndexedDB is shared across the whole
// origin, and the v1 build (deployed at the site root) opens
// "rumorwoods" at schema version 1 — if this build upgraded that same
// database, v1 would throw VersionError on its next open.
const DB_NAME = "rumorwoods-v2";
const DB_VERSION = 2;

export const SESSIONS_STORE = "sessions";
export const ROSTER_STORE = "roster";

export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
        db.createObjectStore(SESSIONS_STORE, { keyPath: "name" });
      }
      if (!db.objectStoreNames.contains(ROSTER_STORE)) {
        db.createObjectStore(ROSTER_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
