import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function loadTypeScriptModule(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

const sessionModule = await loadTypeScriptModule('../src/lib/quizSession.ts');
const mathModule = await loadTypeScriptModule('../src/lib/mathSegments.ts');

class MemoryStorage {
  values = new Map();
  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

test('reducer tracks answers, visits, flags, review, and submit transitions', () => {
  const initial = sessionModule.createQuizSession('quiz-1', ['q1', 'q2'], 0, 1000);
  const answered = sessionModule.quizSessionReducer(initial, { type: 'set_answer', questionId: 'q1', answer: 'A' });
  const flagged = sessionModule.quizSessionReducer(answered, { type: 'toggle_flag', questionId: 'q1' });
  const next = sessionModule.quizSessionReducer(flagged, { type: 'move', offset: 1 });
  assert.deepEqual(sessionModule.getQuestionStatus(next, 'q1', 0), { current: false, answered: true, flagged: true, visited: true });
  assert.equal(next.currentIndex, 1);
  assert.deepEqual(sessionModule.getQuizProgress(next), { total: 2, answered: 1, unanswered: 1, flagged: 1, visited: 2 });
  const review = sessionModule.quizSessionReducer(next, { type: 'open_review' });
  const submitting = sessionModule.quizSessionReducer(review, { type: 'begin_submit' });
  const failed = sessionModule.quizSessionReducer(submitting, { type: 'submit_failed' });
  const retry = sessionModule.quizSessionReducer(failed, { type: 'retry_submit' });
  const submitted = sessionModule.quizSessionReducer(retry, { type: 'submit_succeeded' });
  assert.equal(submitted.phase, 'submitted');
  assert.deepEqual(submitted.answers, { q1: 'A' });
});

test('deadline uses absolute time and clamps negative remaining duration', () => {
  const timed = sessionModule.createQuizSession('timed', ['q1'], 2, 10_000);
  assert.equal(timed.deadlineAt, 130_000);
  assert.equal(sessionModule.remainingMilliseconds(timed.deadlineAt, 129_500), 500);
  assert.equal(sessionModule.remainingMilliseconds(timed.deadlineAt, 130_500), 0);
  assert.equal(sessionModule.remainingMilliseconds(null, 130_500), null);
  const expired = sessionModule.quizSessionReducer(timed, { type: 'check_deadline', now: 130_001 });
  assert.equal(expired.phase, 'submitting');
  assert.equal(expired.submitReason, 'expired');
  assert.equal(sessionModule.quizSessionReducer(expired, { type: 'check_deadline', now: 140_000 }), expired);
});

test('draft persistence restores by quiz and attempt start, and clears after submit', () => {
  const storage = new MemoryStorage();
  const initial = sessionModule.createQuizSession('quiz/id', ['q1'], 5, 1234);
  const draft = sessionModule.quizSessionReducer(initial, { type: 'set_answer', questionId: 'q1', answer: ['x'] });
  assert.equal(sessionModule.saveQuizDraft(storage, draft), true);
  assert.deepEqual(sessionModule.restoreQuizDraft(storage, 'quiz/id'), draft);
  assert.equal(sessionModule.restoreQuizDraft(storage, 'other'), null);
  assert.equal(sessionModule.clearQuizDraft(storage, 'quiz/id', 1234), true);
  assert.equal(sessionModule.restoreQuizDraft(storage, 'quiz/id'), null);
  const unavailableStorage = {
    get length() { throw new Error('storage denied'); },
    setItem() { throw new Error('storage denied'); },
    removeItem() { throw new Error('storage denied'); },
  };
  assert.equal(sessionModule.saveQuizDraft(unavailableStorage, draft), false);
  assert.equal(sessionModule.restoreQuizDraft(unavailableStorage, 'quiz/id'), null);
  assert.equal(sessionModule.clearQuizDraft(unavailableStorage, 'quiz/id', 1234), false);
});

test('math segments support inline, block, escaped dollars, and malformed delimiters', () => {
  assert.deepEqual(mathModule.parseMathSegments('احسب $x+1$ ثم $$x^2$$'), [
    { type: 'text', value: 'احسب ' },
    { type: 'math', value: 'x+1', displayMode: false },
    { type: 'text', value: ' ثم ' },
    { type: 'math', value: 'x^2', displayMode: true },
  ]);
  assert.deepEqual(mathModule.parseMathSegments('السعر \\$5'), [{ type: 'text', value: 'السعر $5' }]);
  assert.deepEqual(mathModule.parseMathSegments('value $x+1'), [
    { type: 'text', value: 'value ' },
    { type: 'malformed', value: '$x+1' },
  ]);
  assert.deepEqual(mathModule.parseMathSegments('$$\\badcommand{}$$'), [
    { type: 'math', value: '\\badcommand{}', displayMode: true },
  ]);
});