// IndexedDB-backed drop-in replacement for the Claude.ai artifact's window.storage.
// App calls window.storage.get/set/delete/list with these exact return shapes.
// IndexedDB (not localStorage) because base64 photos exceed localStorage's ~5MB cap.
const DB_NAME = "dialledin";
const STORE = "kv";
let _db = null;

function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

const storage = {
  async get(key) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const r = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result == null ? null : { key, value: r.result });
      r.onerror = () => reject(r.error);
    });
  },
  async set(key, value) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve({ key, value });
      tx.onerror = () => reject(tx.error);
    });
  },
  async delete(key) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve({ key, deleted: true });
      tx.onerror = () => reject(tx.error);
    });
  },
  async list(prefix = "") {
    const db = await open();
    return new Promise((resolve, reject) => {
      const keys = [];
      const r = db.transaction(STORE, "readonly").objectStore(STORE).openKeyCursor();
      r.onsuccess = () => {
        const c = r.result;
        if (c) { if (!prefix || String(c.key).startsWith(prefix)) keys.push(c.key); c.continue(); }
        else resolve({ keys, prefix });
      };
      r.onerror = () => reject(r.error);
    });
  },
};

if (typeof window !== "undefined") window.storage = storage;
export default storage;
