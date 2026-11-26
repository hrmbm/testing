export const APP_BUILD = '20261124-hrga-workspace-22';
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
    try {
      db.close();
    } catch {}
    dbPromise = null;
  }
}

export function buildFreshReloadUrl(currentHref = '', { preserveDemo = false, nowMs = Date.now() } = {}) {
  try {
    const url = new URL(String(currentHref || 'http://localhost/'));
    const hadDemo = preserveDemo && url.searchParams.get('demo') === '1';
    const hadNonRoot = preserveDemo && url.searchParams.get('nonroot') === '1';
    url.search = '';
    url.hash = '';
    if (hadDemo) url.searchParams.set('demo', '1');
    if (hadNonRoot) url.searchParams.set('nonroot', '1');
    url.searchParams.set('_fresh', String(nowMs));
    return url.toString();
  } catch {
    return `?_fresh=${nowMs}`;
  }
}

export async function resetAllBrowserCachesAndStorage({
  cachesApi = typeof caches !== 'undefined' ? caches : null,
  serviceWorkerApi = typeof navigator !== 'undefined' ? navigator.serviceWorker : null,
  idbFactory = typeof indexedDB !== 'undefined' ? indexedDB : null,
  localStore = typeof localStorage !== 'undefined' ? localStorage : null,
  sessionStore = typeof sessionStorage !== 'undefined' ? sessionStorage : null,
  onBeforeClear = null,
  onSignOut = null,
  timeoutMs = 2500
} = {}) {
  const summary = {
    cachesDeleted: 0,
    workersUnregistered: 0,
    idbDeleted: false,
    localStorageCleared: false,
    sessionStorageCleared: false,
    signedOut: false
  };

  const withTimeout = (promise, ms = timeoutMs) =>
    Promise.race([
      Promise.resolve(promise).catch(() => null),
      new Promise(resolve => setTimeout(resolve, ms))
    ]);

  if (typeof onBeforeClear === 'function') {
    try { onBeforeClear(); } catch {}
  }

  await clearAllWorkspaceCache().catch(() => {});

  if (typeof onSignOut === 'function') {
    await withTimeout((async () => {
      await onSignOut();
      summary.signedOut = true;
    })());
  }

  if (cachesApi && typeof cachesApi.keys === 'function') {
    await withTimeout((async () => {
      const names = await cachesApi.keys();
      if (Array.isArray(names) && names.length) {
        const deleted = await Promise.all(names.map(name => cachesApi.delete(name).catch(() => false)));
        summary.cachesDeleted = deleted.filter(Boolean).length;
      }
    })());
  }

  if (serviceWorkerApi && typeof serviceWorkerApi.getRegistrations === 'function') {
    await withTimeout((async () => {
      const regs = await serviceWorkerApi.getRegistrations();
      if (Array.isArray(regs) && regs.length) {
        const res = await Promise.all(regs.map(reg => reg.unregister().catch(() => false)));
        summary.workersUnregistered = res.filter(Boolean).length;
      }
    })());
  }

  if (idbFactory && typeof idbFactory.deleteDatabase === 'function') {
    await withTimeout(new Promise(resolve => {
      try {
        const req = idbFactory.deleteDatabase(DB_NAME);
        req.onsuccess = () => { summary.idbDeleted = true; resolve(); };
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      } catch {
        resolve();
      }
    }));
  }

  if (localStore && typeof localStore.clear === 'function') {
    try {
      localStore.clear();
      summary.localStorageCleared = true;
    } catch {}
  }

  if (sessionStore && typeof sessionStore.clear === 'function') {
    try {
      sessionStore.clear();
      summary.sessionStorageCleared = true;
    } catch {}
  }

  return summary;
}

