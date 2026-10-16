import { apiRequest } from '@/services/api';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
const LOGO_PATH = '/api/platform/branding/logo';
const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const SUPPORTED_LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif']);
const DATABASE_NAME = 'borhan-branding';
const DATABASE_VERSION = 1;
const LOGO_STORE = 'logos';

export const BRAND_LOGO_CHANGE_EVENT = 'borhan:brand-logo-change';

interface StoredLogo {
  id: number;
  blob: Blob;
  name: string;
  mimeType: string;
  createdAt: number;
}

export interface PlatformLogoVersion {
  id: number;
  name: string;
  mimeType: string;
  createdAt: number;
}

export function getPlatformLogoUrl(revision = 0): string {
  const path = `${API_BASE_URL}${LOGO_PATH}`;
  return revision ? `${path}?v=${revision}` : path;
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('Browser storage is unavailable.'));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(LOGO_STORE)) {
        database.createObjectStore(LOGO_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open browser storage.'));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Browser storage operation failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Browser storage operation was cancelled.'));
  });
}

function notifyLogoChanged() {
  window.dispatchEvent(new Event(BRAND_LOGO_CHANGE_EVENT));
}

async function getStoredPlatformLogo(id: number): Promise<StoredLogo | null> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(LOGO_STORE, 'readonly');
    const request = transaction.objectStore(LOGO_STORE).get(id) as IDBRequest<StoredLogo | undefined>;
    const done = transactionComplete(transaction);
    const logo = await new Promise<StoredLogo | undefined>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await done;
    return logo ?? null;
  } finally {
    database.close();
  }
}

export async function getPlatformLogoBlob(id: number): Promise<Blob | null> {
  return (await getStoredPlatformLogo(id))?.blob ?? null;
}

export async function listPlatformLogos(): Promise<PlatformLogoVersion[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(LOGO_STORE, 'readonly');
    const logosRequest = transaction.objectStore(LOGO_STORE).getAll() as IDBRequest<StoredLogo[]>;
    const done = transactionComplete(transaction);
    const logos = await new Promise<StoredLogo[]>((resolve, reject) => {
      logosRequest.onsuccess = () => resolve(logosRequest.result);
      logosRequest.onerror = () => reject(logosRequest.error);
    });
    await done;
    return logos
      .sort((left, right) => right.createdAt - left.createdAt)
      .map(({ id, name, mimeType, createdAt }) => ({
        id,
        name,
        mimeType,
        createdAt,
      }));
  } finally {
    database.close();
  }
}

async function publishPlatformLogo(file: Blob, fileName: string): Promise<void> {
  const form = new FormData();
  form.append('file', file, fileName);
  await apiRequest(`${API_BASE_URL}/api/admin/branding/logo`, { method: 'POST', body: form });
}

export async function uploadPlatformLogo(file: File): Promise<boolean> {
  if (!SUPPORTED_LOGO_TYPES.has(file.type.toLowerCase())) {
    throw new TypeError('Use a PNG, JPEG, GIF, WebP, or AVIF image.');
  }
  if (file.size > MAX_LOGO_BYTES) {
    throw new RangeError('Platform logo must be 5 MB or smaller.');
  }

  await publishPlatformLogo(file, file.name);

  let archived = true;
  try {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(LOGO_STORE, 'readwrite');
      transaction.objectStore(LOGO_STORE).add({
        blob: file,
        name: file.name,
        mimeType: file.type.toLowerCase(),
        createdAt: Date.now(),
      });
      await transactionComplete(transaction);
    } finally {
      database.close();
    }
  } catch {
    archived = false;
  }
  notifyLogoChanged();
  return archived;
}

export async function activatePlatformLogo(id: number): Promise<void> {
  const logo = await getStoredPlatformLogo(id);
  if (!logo) throw new RangeError('The selected logo version no longer exists.');
  await publishPlatformLogo(logo.blob, logo.name);
  notifyLogoChanged();
}

export async function deletePlatformLogo(id: number): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(LOGO_STORE, 'readwrite');
    transaction.objectStore(LOGO_STORE).delete(id);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
  notifyLogoChanged();
}

export async function removePlatformLogo(): Promise<boolean> {
  await apiRequest(`${API_BASE_URL}/api/admin/branding/logo`, { method: 'DELETE' });
  let archiveCleared = true;
  try {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(LOGO_STORE, 'readwrite');
      transaction.objectStore(LOGO_STORE).clear();
      await transactionComplete(transaction);
    } finally {
      database.close();
    }
  } catch {
    archiveCleared = false;
  }
  notifyLogoChanged();
  return archiveCleared;
}