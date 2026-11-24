export const APP_BUILD = '20261124-hrga-workspace-20';
const DB_NAME = 'hrga-workspace-cache-db';
const STORE_NAME = 'kv';

let dbPromise = null;

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(resolve => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

export async function cacheGet(key, { maxAgeMs = 15 * 60 * 1000 } = {}) {
  const db = await openDb();
  if (!db) return null;
  return new Promise(resolve => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => {
        const entry = req.result;
        if (!entry || entry.build !== APP_BUILD) {
          resolve(null);
          return;
        }
        if (maxAgeMs && (Date.now() - entry.savedAt) > maxAgeMs) {
          resolve({ value: entry.value, stale: true, savedAt: entry.savedAt });
          return;
        }
        resolve({ value: entry.value, stale: false, savedAt: entry.savedAt });
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function cacheSet(key, value) {
  const db = await openDb();
  if (!db) return false;
  return new Promise(resolve => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ build: APP_BUILD, savedAt: Date.now(), value }, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

export async function cacheDelete(key) {
  const db = await openDb();
  if (!db) return;
  return new Promise(resolve => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function clearAllWorkspaceCache() {
  const db = await openDb();
  if (db) {
    await new Promise(resolve => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
}
