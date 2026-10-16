import { apiRequest } from '@/services/api';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
const LOGO_PATH = '/api/platform/branding/logo';
const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const SUPPORTED_LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif']);

export const BRAND_LOGO_CHANGE_EVENT = 'borhan:brand-logo-change';

export function getPlatformLogoUrl(revision = 0): string {
  const path = `${API_BASE_URL}${LOGO_PATH}`;
  return revision ? `${path}?v=${revision}` : path;
}

export async function uploadPlatformLogo(file: File): Promise<void> {
  if (!SUPPORTED_LOGO_TYPES.has(file.type.toLowerCase())) {
    throw new TypeError('Use a PNG, JPEG, GIF, WebP, or AVIF image.');
  }
  if (file.size > MAX_LOGO_BYTES) {
    throw new RangeError('Platform logo must be 5 MB or smaller.');
  }

  const form = new FormData();
  form.append('file', file);
  await apiRequest(`${API_BASE_URL}/api/admin/branding/logo`, { method: 'POST', body: form });
  window.dispatchEvent(new Event(BRAND_LOGO_CHANGE_EVENT));
}

export async function removePlatformLogo(): Promise<void> {
  await apiRequest(`${API_BASE_URL}/api/admin/branding/logo`, { method: 'DELETE' });
  window.dispatchEvent(new Event(BRAND_LOGO_CHANGE_EVENT));
}