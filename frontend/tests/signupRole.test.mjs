import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const signupPage = await readFile(new URL('../src/pages/auth/SignUpPage.tsx', import.meta.url), 'utf8');
const authContext = await readFile(new URL('../src/context/AuthContext.tsx', import.meta.url), 'utf8');

test('public signup has no instructor role selector or role state', () => {
  assert.doesNotMatch(signupPage, /PublicSignupRole|selectedRole|ROLE_OPTIONS|auth\.instructor|auth\.joinAs/);
});

test('public signup request does not send a client-selected role', () => {
  assert.match(authContext, /body:\s*JSON\.stringify\(\{\s*email,\s*password,\s*full_name:\s*fullName\s*\}\)/);
});

for (const localeName of ['en', 'ar']) {
  test(`${localeName} signup copy describes student registration only`, async () => {
    const locale = JSON.parse(await readFile(new URL(`../src/locales/${localeName}.json`, import.meta.url), 'utf8'));
    assert.doesNotMatch(locale.auth.signUpSubtitle, /instructor|teacher|محاضر/i);
    assert.equal(locale.instructors.createdSuccess.length > 0, true);
    assert.equal(locale.instructors.validEmail.length > 0, true);
    assert.equal(locale.instructors.passwordInvalid.length > 0, true);
  });
}