import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QuizTakingScreen } from '../src/components/dashboard/lms/QuizTakingScreen';
import { I18nProvider, type Language } from '../src/context/I18nContext';
import { ToastProvider } from '../src/components/ui/Toast';
import type { Quiz, QuizAttempt } from '../src/types/lms';
import '../src/index.css';

const params = new URLSearchParams(window.location.search);
const language: Language = params.get('lang') === 'ar' ? 'ar' : 'en';
const minutes = Number(params.get('minutes') ?? 10);
document.documentElement.classList.toggle('dark', params.get('dark') === '1');

const quiz: Quiz = {
  id: 'fixture-quiz',
  lesson_id: 'fixture-lesson',
  title: language === 'ar' ? 'تدريب الجبر والمعادلات' : 'Algebra and equations practice',
  time_limit_minutes: Number.isFinite(minutes) ? minutes : 10,
  passing_score: 60,
  created_at: new Date().toISOString(),
  questions: [
    {
      id: 'fixture-q1', quiz_id: 'fixture-quiz', question_type: 'single_choice', points: 1,
      question_text: 'احسب قيمة $x$ إذا كان $2x+3=11$',
      options: [{ label: '٤', value: '4' }, { label: '٥', value: '5' }, { label: '٦', value: '6' }, { label: '٧', value: '7' }],
    },
    {
      id: 'fixture-q2', quiz_id: 'fixture-quiz', question_type: 'multiple_select', points: 2,
      question_text: 'اختر العبارات الصحيحة عن $$a^2-b^2$$',
      options: ['فرق بين مربعين', 'يساوي (a-b)(a+b)', 'يساوي a-b', 'يمكن تحليله'],
    },
    {
      id: 'fixture-q3', quiz_id: 'fixture-quiz', question_type: 'text', points: 1,
      question_text: 'اكتب ناتج $3^2+4^2$ في أبسط صورة.',
      options: [],
    },
  ],
};

function Fixture() {
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [key, setKey] = useState(0);

  if (attempt) {
    return (
      <main className="mx-auto max-w-5xl p-5">
        <div className="rounded-lg border border-border bg-surface-card p-5">
          <h1 className="text-xl font-semibold">Fixture submitted</h1>
          <pre className="mt-3 overflow-auto text-sm">{JSON.stringify(attempt, null, 2)}</pre>
          <button className="btn-primary mt-4" onClick={() => { setAttempt(null); setKey((value) => value + 1); }}>Restart fixture</button>
        </div>
      </main>
    );
  }

  return (
    <QuizTakingScreen
      key={key}
      quiz={quiz}
      onSubmit={async (answers) => ({
        id: 'fixture-attempt', student_id: 'fixture-student', quiz_id: quiz.id,
        score: 2, total_points: 4, passed: false, answers, attempted_at: new Date().toISOString(),
        points_awarded: 0, current_streak: 0,
      })}
      onComplete={(nextAttempt) => setAttempt(nextAttempt)}
      onExit={() => { setAttempt(null); setKey((value) => value + 1); }}
    />
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider initialLanguage={language}>
      <ToastProvider><Fixture /></ToastProvider>
    </I18nProvider>
  </StrictMode>,
);