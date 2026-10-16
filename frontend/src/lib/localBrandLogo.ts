const DATABASE_NAME = 'borhan-local-branding';
const STORE_NAME = 'assets';
const LOGO_KEY = 'brand-logo';
const STORAGE_SIGNAL_KEY = 'borhan-local-brand-logo-updated';

export const BRAND_LOGO_CHANGE_EVENT = 'borhan:brand-logo-change';

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('Browser image storage is unavailable.'));
  }

  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error('Browser image storage could not be opened.'));
    };
  });

  return databasePromise;
}

function notifyLogoChanged() {
  window.dispatchEvent(new Event(BRAND_LOGO_CHANGE_EVENT));
  try {
    window.localStorage.setItem(STORAGE_SIGNAL_KEY, String(Date.now()));
  } catch {
    // The IndexedDB value remains saved if local storage is unavailable.
  }
}

export async function getLocalBrandLogo(): Promise<Blob | null> {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(LOGO_KEY);
    request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null);
    request.onerror = () => reject(request.error ?? new Error('The saved logo could not be read.'));
  });
}

export async function saveLocalBrandLogo(file: File): Promise<void> {
  if (!file.type.startsWith('image/')) {
    throw new TypeError('Choose an image file.');
  }

  const database = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(file, LOGO_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('The logo could not be saved.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('The logo could not be saved.'));
  });

  notifyLogoChanged();
}

export async function removeLocalBrandLogo(): Promise<void> {
  const database = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(LOGO_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('The logo could not be removed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('The logo could not be removed.'));
  });

  notifyLogoChanged();
}
