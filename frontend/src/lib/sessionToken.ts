const SESSION_TOKEN_KEY = 'learnflow_session_token';

function readStorage(storage: Storage): string | null {
  try {
    return storage.getItem(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

  function removeStorage(storage: Storage): void {
    try {
      storage.removeItem(SESSION_TOKEN_KEY);
    } catch {
      return;
    }
  }

export function getSessionToken(): string | null {
  if (typeof window === 'undefined') return null;
  const sessionToken = readStorage(window.sessionStorage);
  const persistentToken = readStorage(window.localStorage);
  if (sessionToken && persistentToken) {
      removeStorage(window.localStorage);
  }
  return sessionToken ?? persistentToken;
}

export function clearSessionToken(): void {
  if (typeof window === 'undefined') return;
    removeStorage(window.sessionStorage);
    removeStorage(window.localStorage);
}

export function setSessionToken(token: string, role: string, rememberMe = false): void {
  if (typeof window === 'undefined') return;
  clearSessionToken();
  const persist = rememberMe && role !== 'admin';
  try {
    (persist ? window.localStorage : window.sessionStorage).setItem(SESSION_TOKEN_KEY, token);
  } catch {
    if (persist) {
      try {
        window.sessionStorage.setItem(SESSION_TOKEN_KEY, token);
      } catch {
        return;
      }
    }
  }
}

  export function isSessionTokenPersistent(): boolean {
    if (typeof window === 'undefined') return false;
    const token = getSessionToken();
    return Boolean(token && readStorage(window.localStorage) === token);
  }

function redirectToSignIn(): void {
  if (typeof window !== 'undefined' && window.location.pathname !== '/auth/sign-in') {
    window.location.href = '/auth/sign-in';
  }
}

export function handleSessionUnauthorized(status: number, tokenSent: string | null): void {
  if (status !== 401 || !tokenSent || getSessionToken() !== tokenSent) return;
  clearSessionToken();
  redirectToSignIn();
}

export async function fetchWithSession(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: { useSessionToken?: boolean } = {},
): Promise<Response> {
  const storedToken = getSessionToken();
  const headers = new Headers(init.headers);
  let tokenSent = headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? null;
  if (!headers.has('Authorization') && options.useSessionToken !== false && storedToken) {
    headers.set('Authorization', `Bearer ${storedToken}`);
    tokenSent = storedToken;
  }

  const response = await fetch(input, { ...init, headers });
  handleSessionUnauthorized(response.status, tokenSent === storedToken ? tokenSent : null);
  return response;
}