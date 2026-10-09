import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/sessionToken.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const tokenModule = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const tokenKey = 'learnflow_session_token';

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

function setupBrowser(t) {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const browser = {
    sessionStorage: createStorage(),
    localStorage: createStorage(),
    location: { pathname: '/dashboard', href: '/dashboard' },
  };
  globalThis.window = browser;
  t.after(() => {
    globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
  });
  return browser;
}

test('stores remembered student tokens only in local storage', (t) => {
  const browser = setupBrowser(t);
  tokenModule.setSessionToken('student-token', 'student', true);
  assert.equal(browser.localStorage.getItem(tokenKey), 'student-token');
  assert.equal(browser.sessionStorage.getItem(tokenKey), null);
});

test('always keeps admin tokens in session storage', (t) => {
  const browser = setupBrowser(t);
  tokenModule.setSessionToken('admin-token', 'admin', true);
  assert.equal(browser.sessionStorage.getItem(tokenKey), 'admin-token');
  assert.equal(browser.localStorage.getItem(tokenKey), null);
});

test('replaces and clears tokens across both stores', (t) => {
  const browser = setupBrowser(t);
  browser.localStorage.setItem(tokenKey, 'old-token');
  tokenModule.setSessionToken('new-token', 'instructor');
  assert.equal(browser.sessionStorage.getItem(tokenKey), 'new-token');
  assert.equal(browser.localStorage.getItem(tokenKey), null);
  tokenModule.clearSessionToken();
  assert.equal(browser.sessionStorage.getItem(tokenKey), null);
  assert.equal(browser.localStorage.getItem(tokenKey), null);
});

test('reads both stores and removes a duplicate token', (t) => {
  const browser = setupBrowser(t);
  browser.sessionStorage.setItem(tokenKey, 'session-token');
  browser.localStorage.setItem(tokenKey, 'persistent-token');
  assert.equal(tokenModule.getSessionToken(), 'session-token');
  assert.equal(browser.localStorage.getItem(tokenKey), null);
});

test('clears and redirects when the stored session token receives 401', async (t) => {
  const browser = setupBrowser(t);
  tokenModule.setSessionToken('expired-token', 'student');
  let authorization;
  globalThis.fetch = async (_input, init) => {
    authorization = new Headers(init.headers).get('Authorization');
    return new Response(null, { status: 401 });
  };

  await tokenModule.fetchWithSession('/api/auth/me');

  assert.equal(authorization, 'Bearer expired-token');
  assert.equal(tokenModule.getSessionToken(), null);
  assert.equal(browser.location.href, '/auth/sign-in');
});

test('does not clear the session for an MFA challenge 401', async (t) => {
  const browser = setupBrowser(t);
  tokenModule.setSessionToken('session-token', 'student');
  globalThis.fetch = async () => new Response(null, { status: 401 });

  await tokenModule.fetchWithSession('/api/auth/mfa/verify', {
    headers: { Authorization: 'Bearer challenge-token' },
  });

  assert.equal(tokenModule.getSessionToken(), 'session-token');
  assert.equal(browser.location.href, '/dashboard');
});