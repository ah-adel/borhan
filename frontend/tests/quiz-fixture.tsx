import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QuizTakingScreen } from '../src/components/dashboard/lms/QuizTakingScreen';
import { QuizResultsScreen } from '../src/components/dashboard/lms/QuizResultsScreen';
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

export function Fixture() {
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [timeTakenMs, setTimeTakenMs] = useState<number | null>(null);
  const [flaggedIds, setFlaggedIds] = useState<string[]>([]);
  const [returnedToCourse, setReturnedToCourse] = useState(false);
  const [key, setKey] = useState(0);
  const hasReviewData = params.get('review') === '1';

  function restart() {
    setAttempt(null);
    setTimeTakenMs(null);
    setFlaggedIds([]);
    setReturnedToCourse(false);
    setKey((value) => value + 1);
  }

  if (attempt) {
    return <QuizResultsScreen quiz={quiz} attempt={attempt} timeTakenMs={timeTakenMs} flaggedQuestionIds={flaggedIds} onRetry={restart} onBack={() => { setAttempt(null); setReturnedToCourse(true); }} />;
  }

  if (returnedToCourse) {
    return <main className="mx-auto max-w-5xl p-5"><div className="card p-5"><h1 className="text-lg font-semibold">Course fixture</h1><button className="btn-primary mt-4" onClick={restart}>Start fixture again</button></div></main>;
  }

  return (
    <QuizTakingScreen
      key={key}
      quiz={quiz}
      onSubmit={async (answers) => ({
        id: 'fixture-attempt', student_id: 'fixture-student', quiz_id: quiz.id,
        score: 2, total_points: 4, passed: false, answers, attempted_at: new Date().toISOString(),
        points_awarded: 0, current_streak: 0,
        ...(hasReviewData ? {
          questions: quiz.questions?.map((question, index) => ({
            ...question,
            correct_answer: index === 0 ? '4' : index === 1
              ? ['فرق بين مربعين', 'يساوي (a-b)(a+b)', 'يمكن تحليله']
              : '25',
            explanation: index === 0
              ? 'نطرح ٣ ثم نقسم على ٢: $x=4$.'
              : 'نستخدم التحليل المناسب لهذه العبارة.',
          })),
        } : {}),
      })}
      onComplete={(nextAttempt, elapsed, session) => {
        setAttempt(nextAttempt);
        setTimeTakenMs(elapsed);
        setFlaggedIds(session.flaggedIds);
      }}
      onExit={restart}
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