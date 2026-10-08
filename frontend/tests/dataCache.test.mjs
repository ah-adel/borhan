import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/dataCache.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const cacheModule = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('coalesces concurrent requests and reuses the short-lived cached result', async () => {
  let calls = 0;
  let resolveLoad;
  const loader = () => {
    calls += 1;
    return new Promise((resolve) => { resolveLoad = resolve; });
  };

  const first = cacheModule.loadCachedData('admin-list:test-concurrent', loader);
  const second = cacheModule.loadCachedData('admin-list:test-concurrent', loader);
  assert.equal(calls, 1);
  resolveLoad(['rows']);
  assert.deepEqual(await Promise.all([first, second]), [['rows'], ['rows']]);
  assert.deepEqual(await cacheModule.loadCachedData('admin-list:test-concurrent', loader), ['rows']);
  assert.equal(calls, 1);
});

test('does not cache a pending result invalidated while it is in flight', async () => {
  let resolveOldLoad;
  const stale = cacheModule.loadCachedData(
    'admin-list:test-invalidation',
    () => new Promise((resolve) => { resolveOldLoad = resolve; }),
  );
  cacheModule.invalidateCache('admin-list:test-invalidation');
  const fresh = await cacheModule.loadCachedData('admin-list:test-invalidation', () => ['fresh']);
  resolveOldLoad(['stale']);
  await stale;

  const cached = await cacheModule.loadCachedData('admin-list:test-invalidation', () => ['unexpected']);
  assert.deepEqual(fresh, ['fresh']);
  assert.deepEqual(cached, ['fresh']);
});