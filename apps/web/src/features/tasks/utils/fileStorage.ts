export interface StoredFileRecord {
  id: string;
  name: string;
  url: string;
  fileType: 'image' | 'pdf' | 'document' | 'archive' | 'other';
  uploadedAt: string;
  size?: string;
}

const DB_NAME = 'madaar_file_storage';
const DB_VERSION = 1;
const STORE_NAME = 'project_files';

interface ProjectFilesRecord {
  projectId: string;
  files: StoredFileRecord[];
  updatedAt: string;
}

/**
 * Opens or upgrades the IndexedDB database instance for project files storage.
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      return reject(new Error('IndexedDB is not supported in this environment'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'projectId' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error('Failed to open IndexedDB database'));
    };
  });
}

/**
 * Retrieves all stored direct files for a given project.
 * Queries IndexedDB first, falls back to localStorage, and migrates existing localStorage files if found.
 */
export async function getProjectFilesFromStorage(projectId: string | null): Promise<StoredFileRecord[]> {
  if (!projectId) return [];

  // 1. Try IndexedDB
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(projectId);

    const record = await new Promise<ProjectFilesRecord | undefined>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as ProjectFilesRecord | undefined);
      request.onerror = () => reject(request.error);
    });

    if (record && Array.isArray(record.files)) {
      return record.files;
    }
  } catch (error) {
    console.warn('[fileStorage] Failed to fetch from IndexedDB, trying localStorage fallback:', error);
  }

  // 2. Safe fallback to localStorage
  try {
    const raw = localStorage.getItem(`project_files_${projectId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Asynchronously migrate to IndexedDB
        saveProjectFilesToStorage(projectId, parsed).catch((migErr) => {
          console.warn('[fileStorage] Background migration to IndexedDB failed:', migErr);
        });
        return parsed;
      }
    }
  } catch (error) {
    console.error('[fileStorage] Failed reading localStorage fallback:', error);
  }

  return [];
}

/**
 * Saves direct files for a given project.
 * Writes to IndexedDB with safe fallback to localStorage.
 */
export async function saveProjectFilesToStorage(
  projectId: string | null,
  files: StoredFileRecord[]
): Promise<void> {
  if (!projectId) return;

  let idbSuccess = false;
  try {
    const db = await openDB();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const record: ProjectFilesRecord = {
      projectId,
      files,
      updatedAt: new Date().toISOString(),
    };
    store.put(record);

    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    idbSuccess = true;
  } catch (error) {
    console.warn('[fileStorage] Failed saving to IndexedDB, falling back to localStorage:', error);
  }

  if (!idbSuccess) {
    try {
      localStorage.setItem(`project_files_${projectId}`, JSON.stringify(files));
    } catch (fallbackError) {
      console.error('[fileStorage] Failed to save in localStorage fallback:', fallbackError);
      throw fallbackError;
    }
  }
}

/**
 * Appends a newly uploaded file to the project's file list in storage.
 */
export async function appendProjectFileToStorage(
  projectId: string | null,
  file: StoredFileRecord
): Promise<StoredFileRecord[]> {
  const currentFiles = await getProjectFilesFromStorage(projectId);
  const updatedFiles = [file, ...currentFiles];
  await saveProjectFilesToStorage(projectId, updatedFiles);
  return updatedFiles;
}
