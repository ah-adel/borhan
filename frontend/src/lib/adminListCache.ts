import { invalidateCache, loadCachedData } from '@/lib/dataCache';

const ADMIN_LIST_CACHE_TTL_MS = 30_000;

export function loadAdminList<T>(name: 'courses' | 'instructors', loader: () => Promise<T>): Promise<T> {
  const token = typeof window === 'undefined'
    ? ''
    : window.sessionStorage.getItem('learnflow_session_token') ?? '';
  return loadCachedData(`admin-list:${name}:${token || 'anonymous'}`, loader, ADMIN_LIST_CACHE_TTL_MS);
}

export function invalidateAdminListCaches() {
  invalidateCache('admin-list:');
}