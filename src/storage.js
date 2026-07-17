const DB_NAME = 'beatbox-studio';
const DB_VERSION = 1;
const PAD_STORE = 'recorded-pads';
const SETTINGS_KEY = 'beatbox-studio-state-v1';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PAD_STORE)) {
        db.createObjectStore(PAD_STORE, { keyPath: 'slot' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadRecordedPads() {
  if (!('indexedDB' in window)) return [];
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PAD_STORE, 'readonly');
    const request = transaction.objectStore(PAD_STORE).getAll();
    request.onsuccess = () => resolve(request.result ?? []);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

export async function saveRecordedPad(record) {
  if (!('indexedDB' in window)) return;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PAD_STORE, 'readwrite');
    transaction.objectStore(PAD_STORE).put(record);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function removeRecordedPad(slot) {
  if (!('indexedDB' in window)) return;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PAD_STORE, 'readwrite');
    transaction.objectStore(PAD_STORE).delete(slot);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // The studio still works when storage is disabled.
  }
}
