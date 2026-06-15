// audioCache.ts
// Keeps story narration on the device (IndexedDB) so replays are instant and
// work offline — the same approach Loomiverse uses for its TTS audio.
// Text lives in Supabase; the heavy audio blob lives here, on the phone.

const DB_NAME = "roadlore_audio";
const STORE = "audio";

function openDB(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, 1);
    } catch {
      return resolve(null);
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

// Returns the cached audio for this key, or null if we've never stored it here.
export async function getCachedAudio(key: string): Promise<Blob | null> {
  if (!key) return null;
  const db = await openDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () =>
        resolve(req.result instanceof Blob ? req.result : null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

// Stores the audio blob under this key for instant, offline replay later.
export async function putCachedAudio(key: string, blob: Blob): Promise<void> {
  if (!key) return;
  const db = await openDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(blob, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

// Removes cached audio when its story is deleted, so we don't leak space.
export async function deleteCachedAudio(key: string): Promise<void> {
  if (!key) return;
  const db = await openDB();
  if (!db) return;
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
  } catch {
    /* nothing to clean up */
  }
}

// A stable key from the story text, for when we don't yet have a row id.
export function hashKey(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  }
  return "t" + (h >>> 0).toString(36);
}
