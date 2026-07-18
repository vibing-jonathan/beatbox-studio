const DB_NAME = 'beatbox-studio';
const DB_VERSION = 2;
const PAD_STORE = 'recorded-pads';
const PROJECT_STORE = 'project-sessions';
const RECOVERY_STORE = 'project-recovery';
const SETTINGS_KEY = 'beatbox-studio-state-v1';
const ACTIVE_PROJECT_KEY = 'beatbox-studio-active-project-v1';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PAD_STORE)) {
        db.createObjectStore(PAD_STORE, { keyPath: 'slot' });
      }
      if (!db.objectStoreNames.contains(PROJECT_STORE)) {
        db.createObjectStore(PROJECT_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(RECOVERY_STORE)) {
        db.createObjectStore(RECOVERY_STORE, { keyPath: 'projectId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readDatabaseRecord(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const request = transaction.objectStore(storeName).get(key);
    let result = null;
    request.onsuccess = () => { result = request.result ?? null; };
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () => reject(transaction.error ?? request.error ?? new Error('The local database read was interrupted.'));
    transaction.onerror = () => reject(transaction.error ?? request.error ?? new Error('The local database read failed.'));
  });
}

function putDatabaseRecord(db, storeName, value) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const request = transaction.objectStore(storeName).put(value);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve(value);
    transaction.onabort = () => reject(transaction.error ?? request.error ?? new Error('The local database write was interrupted.'));
    transaction.onerror = () => reject(transaction.error ?? request.error ?? new Error('The local database write failed.'));
  });
}

function deleteDatabaseRecord(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const request = transaction.objectStore(storeName).delete(key);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? request.error ?? new Error('The local database cleanup was interrupted.'));
    transaction.onerror = () => reject(transaction.error ?? request.error ?? new Error('The local database cleanup failed.'));
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

export function getActiveProjectId() {
  try {
    return localStorage.getItem(ACTIVE_PROJECT_KEY);
  } catch {
    return null;
  }
}

export function setActiveProjectId(projectId) {
  try {
    if (projectId) localStorage.setItem(ACTIVE_PROJECT_KEY, projectId);
    else localStorage.removeItem(ACTIVE_PROJECT_KEY);
  } catch {
    // Project switching still works for the current page when storage is disabled.
  }
}

export async function listProjectSessions() {
  if (!('indexedDB' in window)) return [];
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PROJECT_STORE, 'readonly');
    const request = transaction.objectStore(PROJECT_STORE).getAll();
    request.onsuccess = () => resolve((request.result ?? []).sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt)));
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

export async function loadProjectSession(projectId) {
  if (!projectId || !('indexedDB' in window)) return null;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PROJECT_STORE, 'readonly');
    const request = transaction.objectStore(PROJECT_STORE).get(projectId);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

export async function saveProjectSession(project, { createRecovery = true } = {}) {
  if (!project?.id || !('indexedDB' in window)) return project;
  const db = await openDatabase();
  const saved = {
    ...project,
    createdAt: Number(project.createdAt) || Date.now(),
    updatedAt: Number(project.updatedAt) || Date.now(),
  };
  try {
    let previous = null;
    if (createRecovery) {
      try { previous = await readDatabaseRecord(db, PROJECT_STORE, saved.id); } catch { /* recovery is best effort */ }
    }
    // Remove the older recovery copy before writing the live project. This
    // prevents duplicated audio blobs from consuming the space needed to save.
    try { await deleteDatabaseRecord(db, RECOVERY_STORE, saved.id); } catch { /* best effort */ }
    await putDatabaseRecord(db, PROJECT_STORE, saved);
    if (previous && Number(previous.updatedAt) !== Number(saved.updatedAt)) {
      try {
        await putDatabaseRecord(db, RECOVERY_STORE, {
          projectId: saved.id,
          project: previous,
          savedAt: Date.now(),
        });
      } catch {
        // Recovery is secondary to the live project.
        try { await deleteDatabaseRecord(db, RECOVERY_STORE, saved.id); } catch { /* best effort */ }
      }
    }
    return saved;
  } finally {
    db.close();
  }
}

export async function loadProjectRecovery(projectId) {
  if (!projectId || !('indexedDB' in window)) return null;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(RECOVERY_STORE, 'readonly');
    const request = transaction.objectStore(RECOVERY_STORE).get(projectId);
    request.onsuccess = () => resolve(request.result?.project ?? null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

export async function deleteProjectSession(projectId) {
  if (!projectId || !('indexedDB' in window)) return;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([PROJECT_STORE, RECOVERY_STORE], 'readwrite');
    transaction.objectStore(PROJECT_STORE).delete(projectId);
    transaction.objectStore(RECOVERY_STORE).delete(projectId);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}
