import type { DatasetState, SessionSnapshot } from '../types.ts';

const DB_NAME = 'datarefine_workspace_db';
const DB_VERSION = 1;
const STORE_NAME = 'sessions';
const ACTIVE_SESSION_KEY = 'active_workspace_session_v1';
const PREF_TAB_KEY = 'datarefine_active_tab_v1';

export interface PersistedWorkspaceSession {
  datasetState: DatasetState;
  undoStack: SessionSnapshot[];
  redoStack: SessionSnapshot[];
  savedAt: string;
}

function openSessionDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable in this environment.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB.'));
  });
}

export async function saveWorkspaceSession(session: PersistedWorkspaceSession): Promise<void> {
  try {
    const db = await openSessionDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(session, ACTIVE_SESSION_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Non-fatal: ignore IndexedDB quota or private browsing errors
  }
}

export async function loadWorkspaceSession(): Promise<PersistedWorkspaceSession | null> {
  try {
    const db = await openSessionDB();
    const result = await new Promise<PersistedWorkspaceSession | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(ACTIVE_SESSION_KEY);
      req.onsuccess = () => resolve((req.result as PersistedWorkspaceSession) || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  } catch {
    return null;
  }
}

export async function clearWorkspaceSession(): Promise<void> {
  try {
    localStorage.removeItem(PREF_TAB_KEY);
  } catch {
    // Ignore storage error
  }
  try {
    const db = await openSessionDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(ACTIVE_SESSION_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore
  }
}

export function savePreferredTab(tab: string): void {
  try {
    localStorage.setItem(PREF_TAB_KEY, tab);
  } catch {
    // Ignore
  }
}

export function loadPreferredTab(): string | null {
  try {
    return localStorage.getItem(PREF_TAB_KEY);
  } catch {
    return null;
  }
}
