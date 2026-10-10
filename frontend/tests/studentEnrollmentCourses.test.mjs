import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/studentEnrollmentCourses.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const enrollmentModule = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('keeps API-enrolled courses visible without browser-local enrollment records', () => {
  const courses = [{ id: 'course-1' }];

  const entries = enrollmentModule.attachStudentEnrollmentMetadata(courses, 'student-1', []);

  assert.deepEqual(entries, [{ course: courses[0], enrollment: undefined }]);
});

test('attaches local progress only to the matching student and course', () => {
  const course = { id: 'course-1' };
  const enrollment = { studentId: 'student-1', courseId: 'course-1', progress: 35 };

  const entries = enrollmentModule.attachStudentEnrollmentMetadata(
    [course],
    'student-1',
    [enrollment, { studentId: 'student-2', courseId: 'course-1' }],
  );

  assert.deepEqual(entries, [{ course, enrollment }]);
});