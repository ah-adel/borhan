const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const SUPPORTED_LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif']);
const DATABASE_NAME = 'borhan-branding';
const DATABASE_VERSION = 1;
const LOGO_STORE = 'logos';
const SETTINGS_STORE = 'settings';
const ACTIVE_LOGO_KEY = 'active-logo-id';

export const BRAND_LOGO_CHANGE_EVENT = 'borhan:brand-logo-change';

interface StoredLogo {
  id: number;
  blob: Blob;
  name: string;
  mimeType: string;
  createdAt: number;
}

interface LogoSetting {
  key: string;
  value: number;
}

export interface PlatformLogoVersion {
  id: number;
  name: string;
  mimeType: string;
  createdAt: number;
  isActive: boolean;
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
      if (!database.objectStoreNames.contains(SETTINGS_STORE)) {
        database.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
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

export async function getActivePlatformLogo(): Promise<Blob | null> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction([LOGO_STORE, SETTINGS_STORE], 'readonly');
    const logosRequest = transaction.objectStore(LOGO_STORE).getAll() as IDBRequest<StoredLogo[]>;
    const settingRequest = transaction.objectStore(SETTINGS_STORE).get(ACTIVE_LOGO_KEY) as IDBRequest<LogoSetting | undefined>;
    const done = transactionComplete(transaction);
    const [logos, setting] = await Promise.all([
      new Promise<StoredLogo[]>((resolve, reject) => {
        logosRequest.onsuccess = () => resolve(logosRequest.result);
        logosRequest.onerror = () => reject(logosRequest.error);
      }),
      new Promise<LogoSetting | undefined>((resolve, reject) => {
        settingRequest.onsuccess = () => resolve(settingRequest.result);
        settingRequest.onerror = () => reject(settingRequest.error);
      }),
    ]);
    await done;
    return logos.find((logo) => logo.id === setting?.value)?.blob ?? null;
  } finally {
    database.close();
  }
}

export async function getPlatformLogoBlob(id: number): Promise<Blob | null> {
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
    return logo?.blob ?? null;
  } finally {
    database.close();
  }
}

export async function listPlatformLogos(): Promise<PlatformLogoVersion[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction([LOGO_STORE, SETTINGS_STORE], 'readonly');
    const logosRequest = transaction.objectStore(LOGO_STORE).getAll() as IDBRequest<StoredLogo[]>;
    const settingRequest = transaction.objectStore(SETTINGS_STORE).get(ACTIVE_LOGO_KEY) as IDBRequest<LogoSetting | undefined>;
    const done = transactionComplete(transaction);
    const [logos, setting] = await Promise.all([
      new Promise<StoredLogo[]>((resolve, reject) => {
        logosRequest.onsuccess = () => resolve(logosRequest.result);
        logosRequest.onerror = () => reject(logosRequest.error);
      }),
      new Promise<LogoSetting | undefined>((resolve, reject) => {
        settingRequest.onsuccess = () => resolve(settingRequest.result);
        settingRequest.onerror = () => reject(settingRequest.error);
      }),
    ]);
    await done;
    return logos
      .sort((left, right) => right.createdAt - left.createdAt)
      .map(({ id, name, mimeType, createdAt }) => ({
        id,
        name,
        mimeType,
        createdAt,
        isActive: id === setting?.value,
      }));
  } finally {
    database.close();
  }
}

export async function uploadPlatformLogo(file: File): Promise<void> {
  if (!SUPPORTED_LOGO_TYPES.has(file.type.toLowerCase())) {
    throw new TypeError('Use a PNG, JPEG, GIF, WebP, or AVIF image.');
  }
  if (file.size > MAX_LOGO_BYTES) {
    throw new RangeError('Platform logo must be 5 MB or smaller.');
  }

  const database = await openDatabase();
  try {
    const transaction = database.transaction([LOGO_STORE, SETTINGS_STORE], 'readwrite');
    const done = transactionComplete(transaction);
    const addRequest = transaction.objectStore(LOGO_STORE).add({
      blob: file,
      name: file.name,
      mimeType: file.type.toLowerCase(),
      createdAt: Date.now(),
    });
    addRequest.onsuccess = () => {
      transaction.objectStore(SETTINGS_STORE).put({ key: ACTIVE_LOGO_KEY, value: Number(addRequest.result) });
    };
    await done;
  } finally {
    database.close();
  }
  notifyLogoChanged();
}

export async function activatePlatformLogo(id: number): Promise<void> {
  const logo = await getPlatformLogoBlob(id);
  if (!logo) throw new RangeError('The selected logo version no longer exists.');

  const database = await openDatabase();
  try {
    const transaction = database.transaction(SETTINGS_STORE, 'readwrite');
    transaction.objectStore(SETTINGS_STORE).put({ key: ACTIVE_LOGO_KEY, value: id } satisfies LogoSetting);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
  notifyLogoChanged();
}

export async function deletePlatformLogo(id: number): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction([LOGO_STORE, SETTINGS_STORE], 'readwrite');
    const logoStore = transaction.objectStore(LOGO_STORE);
    const settingsStore = transaction.objectStore(SETTINGS_STORE);
    const logosRequest = logoStore.getAll() as IDBRequest<StoredLogo[]>;
    const settingRequest = settingsStore.get(ACTIVE_LOGO_KEY) as IDBRequest<LogoSetting | undefined>;
    let logos: StoredLogo[] | undefined;
    let setting: LogoSetting | undefined;
    let updated = false;

    const updateWhenReady = () => {
      if (updated || !logos || setting === undefined && settingRequest.readyState !== 'done') return;
      updated = true;
      logoStore.delete(id);
      if (setting?.value === id) {
        const replacement = logos
          .filter((logo) => logo.id !== id)
          .sort((left, right) => right.createdAt - left.createdAt)[0];
        if (replacement) settingsStore.put({ key: ACTIVE_LOGO_KEY, value: replacement.id } satisfies LogoSetting);
        else settingsStore.delete(ACTIVE_LOGO_KEY);
      }
    };

    logosRequest.onsuccess = () => {
      logos = logosRequest.result;
      updateWhenReady();
    };
    settingRequest.onsuccess = () => {
      setting = settingRequest.result;
      updateWhenReady();
    };
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
  notifyLogoChanged();
}

export async function removePlatformLogo(): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction([LOGO_STORE, SETTINGS_STORE], 'readwrite');
    transaction.objectStore(LOGO_STORE).clear();
    transaction.objectStore(SETTINGS_STORE).delete(ACTIVE_LOGO_KEY);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }
  notifyLogoChanged();
}