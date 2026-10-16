import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleAlert, Plus, Trash2 } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';
import { QuizTakingScreen } from '@/components/dashboard/lms/QuizTakingScreen';
import { Button } from '@/components/ui/Button';
import {
  createQuiz,
  createQuizQuestion,
  deleteQuiz,
  deleteQuizQuestion,
  fetchQuiz,
  fetchQuizAttempts,
  fetchQuizzes,
  submitQuiz,
} from '@/services/lmsRepository';
import type { Quiz, QuizAttempt } from '@/types/lms';

type QuizPanelProps = {
  lessonIds: string[];
  activeLessonId: string | null;
  activeLessonTitle: string | null;
  canManage: boolean;
  canAttempt: boolean;
};

type QuestionDraft = {
  questionText: string;
  questionType: 'single_choice' | 'multiple_select' | 'text';
  options: string;
  correctAnswer: string;
  explanation: string;
  points: string;
};

const emptyQuestionDraft = (): QuestionDraft => ({
  questionText: '',
  questionType: 'single_choice',
  options: '',
  correctAnswer: '',
  explanation: '',
  points: '1',
});

function formatElapsed(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function QuizPanel({ lessonIds, activeLessonId, activeLessonTitle, canManage, canAttempt }: QuizPanelProps) {
  const { t, formatDate, formatNumber } = useI18n();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [selectedQuizId, setSelectedQuizId] = useState('');
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [latestAttempt, setLatestAttempt] = useState<QuizAttempt | null>(null);
  const [attemptDurationMs, setAttemptDurationMs] = useState<number | null>(null);
  const [isTakingQuiz, setIsTakingQuiz] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [quizTitle, setQuizTitle] = useState('');
  const [timeLimit, setTimeLimit] = useState('0');
  const [passingScore, setPassingScore] = useState('0');
  const [questionDraft, setQuestionDraft] = useState<QuestionDraft>(emptyQuestionDraft);
  const [isQuestionFormOpen, setIsQuestionFormOpen] = useState(false);
  const lessonKey = useMemo(() => lessonIds.join('|'), [lessonIds]);
  const allowedLessonIds = useMemo(() => new Set(lessonKey ? lessonKey.split('|') : []), [lessonKey]);
  const visibleQuizzes = quizzes.filter((item) => item.lesson_id && allowedLessonIds.has(item.lesson_id));

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError('');
    fetchQuizzes()
      .then((items) => {
        if (!mounted) return;
        const scoped = items.filter((item) => item.lesson_id && allowedLessonIds.has(item.lesson_id));
        setQuizzes(scoped);
        setSelectedQuizId((current) => scoped.some((item) => item.id === current) ? current : scoped[0]?.id ?? '');
      })
      .catch(() => {
        if (mounted) setError(t('lmsQuiz.loadError'));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, [allowedLessonIds, t]);

  useEffect(() => {
    if (!selectedQuizId) {
      setQuiz(null);
      setAttempts([]);
      setLatestAttempt(null);
      setAttemptDurationMs(null);
      setIsTakingQuiz(false);
      return;
    }

    let mounted = true;
    setLoading(true);
    setError('');
    setLatestAttempt(null);
    setAttemptDurationMs(null);
    setIsTakingQuiz(false);
    const requests: [Promise<Quiz>, Promise<QuizAttempt[]> | null] = [
      fetchQuiz(selectedQuizId),
      canAttempt ? fetchQuizAttempts(selectedQuizId) : null,
    ];
    Promise.all([requests[0], requests[1] ?? Promise.resolve([])])
      .then(([nextQuiz, history]) => {
        if (!mounted) return;
        setQuiz(nextQuiz);
        setAttempts(history);
      })
      .catch(() => {
        if (mounted) setError(t('lmsQuiz.loadError'));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, [selectedQuizId, canAttempt, t]);

  async function refreshQuizzes(nextSelectedId?: string) {
    const items = await fetchQuizzes();
    const scoped = items.filter((item) => item.lesson_id && allowedLessonIds.has(item.lesson_id));
    setQuizzes(scoped);
    setSelectedQuizId(nextSelectedId ?? scoped[0]?.id ?? '');
  }

  async function handleCreateQuiz(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeLessonId || !quizTitle.trim()) return;
    setSaving(true);
    setError('');
    try {
      const created = await createQuiz({
        lesson_id: activeLessonId,
        title: quizTitle.trim(),
        time_limit_minutes: Number(timeLimit) || 0,
        passing_score: Number(passingScore) || 0,
      });
      setQuizTitle('');
      await refreshQuizzes(created.id);
    } catch {
      setError(t('lmsQuiz.saveError'));
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateQuestion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quiz || !questionDraft.questionText.trim() || !questionDraft.correctAnswer.trim()) return;
    const options = questionDraft.options.split('\n').map((option) => option.trim()).filter(Boolean);
    const correctAnswer = questionDraft.questionType === 'multiple_select'
      ? questionDraft.correctAnswer.split('\n').map((answer) => answer.trim()).filter(Boolean)
      : questionDraft.correctAnswer.trim();
    if (questionDraft.questionType !== 'text' && (!options.length || (Array.isArray(correctAnswer)
      ? correctAnswer.some((answer) => !options.includes(answer))
      : !options.includes(correctAnswer)))) {
      setError(t('lmsQuiz.correctAnswer'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      await createQuizQuestion(quiz.id, {
        question_text: questionDraft.questionText.trim(),
        question_type: questionDraft.questionType,
        options,
        correct_answer: correctAnswer,
        explanation: questionDraft.explanation.trim() || null,
        points: Number(questionDraft.points) || 1,
      });
      const nextQuiz = await fetchQuiz(quiz.id);
      setQuiz(nextQuiz);
      setQuestionDraft(emptyQuestionDraft());
      setIsQuestionFormOpen(false);
    } catch {
      setError(t('lmsQuiz.saveError'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteQuiz() {
    if (!quiz || !window.confirm(t('lmsQuiz.deleteConfirm'))) return;
    setSaving(true);
    try {
      await deleteQuiz(quiz.id);
      setQuiz(null);
      setAttempts([]);
      await refreshQuizzes();
    } catch {
      setError(t('lmsQuiz.saveError'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteQuestion(questionId: string) {
    if (!quiz || !window.confirm(t('common.deleteConfirm'))) return;
    setSaving(true);
    try {
      await deleteQuizQuestion(questionId);
      setQuiz(await fetchQuiz(quiz.id));
    } catch {
      setError(t('lmsQuiz.saveError'));
    } finally {
      setSaving(false);
    }
  }

  const submitAnswers = useCallback(async (answers: Record<string, unknown>) => {
    if (!quiz || !canAttempt) throw new Error('Quiz is not available for attempts.');
    const result = await submitQuiz(quiz.id, answers);
    setLatestAttempt(result);
    void fetchQuizAttempts(quiz.id).then(setAttempts).catch(() => undefined);
    return result;
  }, [canAttempt, quiz]);

  const handleAttemptComplete = useCallback((attempt: QuizAttempt, timeTakenMs: number) => {
    setLatestAttempt(attempt);
    setAttemptDurationMs(timeTakenMs);
    setIsTakingQuiz(false);
  }, []);

  if (loading && !quiz && visibleQuizzes.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400" role="status">{t('common.loading')}</p>;
  }

  return (
    <div className="space-y-5">
      {error && <div className="flex items-start gap-2 rounded-lg border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700 dark:border-error-900/50 dark:bg-error-950/20 dark:text-error-300"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

      {canManage && (
        <form onSubmit={handleCreateQuiz} className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/60">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t('lmsQuiz.createQuiz')}</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr),8rem,8rem]">
            <label className="min-w-0 text-xs font-medium text-gray-600 dark:text-gray-300">
              {t('lmsQuiz.quizTitle')}
              <input className="input-field mt-1" value={quizTitle} onChange={(event) => setQuizTitle(event.target.value)} maxLength={255} required />
            </label>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
              {t('lmsQuiz.timeLimit')}
              <input className="input-field mt-1" type="number" min="0" value={timeLimit} onChange={(event) => setTimeLimit(event.target.value)} />
            </label>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
              {t('lmsQuiz.passingScore')}
              <input className="input-field mt-1" type="number" min="0" max="100" value={passingScore} onChange={(event) => setPassingScore(event.target.value)} />
            </label>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="truncate text-xs text-gray-500 dark:text-gray-400">{activeLessonTitle}</span>
            <button className="btn-primary" type="submit" disabled={saving || !activeLessonId}><Plus className="h-4 w-4" />{t('lmsQuiz.createQuiz')}</button>
          </div>
        </form>
      )}

      {visibleQuizzes.length > 0 && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label={t('lmsQuiz.quizzes')}>
          {visibleQuizzes.map((item) => (
            <button key={item.id} type="button" role="tab" aria-selected={selectedQuizId === item.id} onClick={() => setSelectedQuizId(item.id)}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${selectedQuizId === item.id ? 'border-primary-300 bg-primary-50 text-primary-700 dark:border-primary-800 dark:bg-primary-950/30 dark:text-primary-300' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800'}`}>
              {item.title}
            </button>
          ))}
        </div>
      )}

      {!visibleQuizzes.length && !canManage && <p className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">{t('lmsQuiz.noQuizzes')}</p>}
      {!activeLessonId && canManage && <p className="text-sm text-gray-500 dark:text-gray-400">{t('lmsQuiz.noQuizzes')}</p>}

      {quiz && (
        <section className="space-y-4" aria-labelledby="selected-quiz-title">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 pb-3 dark:border-gray-800">
            <div>
              <h3 id="selected-quiz-title" className="text-lg font-semibold text-gray-900 dark:text-white">{quiz.title}</h3>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{quiz.questions?.length ?? quiz.question_count ?? 0} {t('lmsQuiz.questions')} · {formatNumber(Number(quiz.passing_score))}%</p>
            </div>
            {canManage && <button type="button" className="btn-secondary text-error-600 dark:text-error-300" onClick={() => void handleDeleteQuiz()} disabled={saving}><Trash2 className="h-4 w-4" />{t('lmsQuiz.deleteQuiz')}</button>}
          </div>

          {canManage && (
            <div className="space-y-3">
              {(quiz.questions ?? []).map((question, index) => (
                <div key={question.id} className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{t('lmsQuiz.question', { number: index + 1 })}: {question.question_text}</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('lmsQuiz.correctAnswer')}: {Array.isArray(question.correct_answer) ? question.correct_answer.join(', ') : String(question.correct_answer ?? '')}</p>
                  </div>
                  <button type="button" className="rounded-lg p-2 text-gray-500 hover:bg-error-50 hover:text-error-600 dark:hover:bg-error-950/30 dark:hover:text-error-300" onClick={() => void handleDeleteQuestion(question.id)} aria-label={t('lmsQuiz.deleteQuiz')} disabled={saving}><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}

              {!isQuestionFormOpen ? (
                <button type="button" className="btn-secondary" onClick={() => setIsQuestionFormOpen(true)}><Plus className="h-4 w-4" />{t('lmsQuiz.questions')}</button>
              ) : (
                <form onSubmit={handleCreateQuestion} className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/60">
                  <label className="label-text">{t('lmsQuiz.questionText')}<textarea className="input-field mt-1" rows={2} value={questionDraft.questionText} onChange={(event) => setQuestionDraft((current) => ({ ...current, questionText: event.target.value }))} required /></label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="label-text">{t('lmsQuiz.questionType')}<select className="input-field mt-1" value={questionDraft.questionType} onChange={(event) => setQuestionDraft((current) => ({ ...current, questionType: event.target.value as QuestionDraft['questionType'] }))}><option value="single_choice">{t('lmsQuiz.singleChoice')}</option><option value="multiple_select">{t('lmsQuiz.multipleSelect')}</option><option value="text">{t('lmsQuiz.shortAnswer')}</option></select></label>
                    <label className="label-text">{t('lmsQuiz.pointsPerQuestion')}<input className="input-field mt-1" type="number" min="0.01" step="0.01" value={questionDraft.points} onChange={(event) => setQuestionDraft((current) => ({ ...current, points: event.target.value }))} required /></label>
                  </div>
                  {questionDraft.questionType !== 'text' && <label className="label-text">{t('lmsQuiz.option', { number: 1 })}<textarea className="input-field mt-1" rows={3} placeholder={t('lmsQuiz.option', { number: 1 })} value={questionDraft.options} onChange={(event) => setQuestionDraft((current) => ({ ...current, options: event.target.value }))} required /></label>}
                  <label className="label-text">{t('lmsQuiz.correctAnswer')}<textarea className="input-field mt-1" rows={questionDraft.questionType === 'multiple_select' ? 2 : 1} placeholder={questionDraft.questionType === 'multiple_select' ? t('lmsQuiz.multipleSelect') : t('lmsQuiz.typeAnswer')} value={questionDraft.correctAnswer} onChange={(event) => setQuestionDraft((current) => ({ ...current, correctAnswer: event.target.value }))} required /></label>
                  <label className="label-text">{t('lmsQuiz.explanation')}<textarea className="input-field mt-1" rows={2} value={questionDraft.explanation} onChange={(event) => setQuestionDraft((current) => ({ ...current, explanation: event.target.value }))} /></label>
                  <div className="flex justify-end gap-2"><button type="button" className="btn-secondary" onClick={() => setIsQuestionFormOpen(false)}>{t('common.cancel')}</button><button type="submit" className="btn-primary" disabled={saving}>{t('lmsQuiz.saveQuiz')}</button></div>
                </form>
              )}
            </div>
          )}

          {!canManage && (quiz.questions?.length ?? 0) === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">{t('lmsQuiz.noQuestions')}</p>}

          {canAttempt && (quiz.questions?.length ?? 0) > 0 && !latestAttempt && !isTakingQuiz && (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface-card p-5">
              <div>
                <h4 className="font-semibold text-content-main">{t('lmsQuiz.readyToPractice')}</h4>
                <p className="mt-1 text-sm text-content-muted">{Number(quiz.time_limit_minutes) > 0 ? t('lmsQuiz.practiceTimeLimit', { minutes: quiz.time_limit_minutes }) : t('lmsQuiz.untimedPractice')}</p>
              </div>
              <Button onClick={() => { setAttemptDurationMs(null); setIsTakingQuiz(true); }}>
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />{t('lmsQuiz.startQuiz')}
              </Button>
            </div>
          )}

          {canAttempt && isTakingQuiz && (
            <QuizTakingScreen
              quiz={quiz}
              onSubmit={submitAnswers}
              onComplete={handleAttemptComplete}
              onExit={() => setIsTakingQuiz(false)}
            />
          )}

          {latestAttempt && (
            <div className={`flex items-start gap-3 rounded-xl border p-4 ${latestAttempt.passed ? 'border-success-200 bg-success-50 text-success-800 dark:border-success-900/50 dark:bg-success-950/20 dark:text-success-200' : 'border-warning-200 bg-warning-50 text-warning-800 dark:border-warning-900/50 dark:bg-warning-950/20 dark:text-warning-200'}`} role="status">
              {latestAttempt.passed ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> : <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />}
              <div><p className="font-semibold">{latestAttempt.passed ? t('lmsQuiz.passed') : t('lmsQuiz.notPassed')}</p><p className="mt-1 text-sm">{t('lmsQuiz.score')}: {formatNumber(Number(latestAttempt.score))} / {formatNumber(Number(latestAttempt.total_points))} · {t('lmsQuiz.pointsEarned', { points: latestAttempt.points_awarded ?? 0 })}{attemptDurationMs != null ? ` · ${t('lmsQuiz.timeTaken', { time: formatElapsed(attemptDurationMs) })}` : ''}</p></div>
            </div>
          )}

          {canAttempt && <div className="border-t border-gray-200 pt-4 dark:border-gray-800"><h4 className="text-sm font-semibold text-gray-900 dark:text-white">{t('lmsQuiz.attempts')}</h4>{attempts.length === 0 ? <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t('lmsQuiz.noAttempts')}</p> : <ul className="mt-2 divide-y divide-gray-100 dark:divide-gray-800">{attempts.map((attempt) => <li key={attempt.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><span className="text-gray-600 dark:text-gray-300">{formatDate(attempt.attempted_at, { dateStyle: 'medium', timeStyle: 'short' })}</span><span className="font-medium text-gray-900 dark:text-white">{formatNumber(Number(attempt.score))} / {formatNumber(Number(attempt.total_points))}</span><span className={attempt.passed ? 'text-success-700 dark:text-success-300' : 'text-warning-700 dark:text-warning-300'}>{attempt.passed ? t('lmsQuiz.passed') : t('lmsQuiz.notPassed')}</span></li>)}</ul>}</div>}
        </section>
      )}
    </div>
  );
}