import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleAlert, Plus, Trash2 } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';
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
import type { Quiz, QuizAttempt, QuizQuestion } from '@/types/lms';

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

function optionLabel(option: unknown): string {
  if (typeof option === 'string' || typeof option === 'number') return String(option);
  if (typeof option === 'object' && option !== null) {
    const record = option as Record<string, unknown>;
    return String(record.label ?? record.text ?? record.value ?? '');
  }
  return '';
}

function optionValue(option: unknown): unknown {
  if (typeof option === 'object' && option !== null && 'value' in option) {
    return (option as Record<string, unknown>).value;
  }
  return option;
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isMultiSelect(question: QuizQuestion): boolean {
  return ['multiple_select', 'multi_select', 'checkbox'].includes(question.question_type.toLowerCase().replace(/-/g, '_'));
}

function isChoice(question: QuizQuestion): boolean {
  return question.options.length > 0 || question.question_type.toLowerCase().includes('choice');
}

export function QuizPanel({ lessonIds, activeLessonId, activeLessonTitle, canManage, canAttempt }: QuizPanelProps) {
  const { t, formatDate, formatNumber } = useI18n();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [selectedQuizId, setSelectedQuizId] = useState('');
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [latestAttempt, setLatestAttempt] = useState<QuizAttempt | null>(null);
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
      setAnswers({});
      setLatestAttempt(null);
      return;
    }

    let mounted = true;
    setLoading(true);
    setError('');
    setAnswers({});
    setLatestAttempt(null);
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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!quiz || !canAttempt) return;
    setSaving(true);
    setError('');
    try {
      const result = await submitQuiz(quiz.id, answers);
      setLatestAttempt(result);
      setAttempts(await fetchQuizAttempts(quiz.id));
    } catch {
      setError(t('lmsQuiz.submitError'));
    } finally {
      setSaving(false);
    }
  }

  function setAnswer(question: QuizQuestion, value: unknown, checked: boolean) {
    setAnswers((current) => {
      if (!isMultiSelect(question)) return { ...current, [question.id]: value };
      const existing = Array.isArray(current[question.id]) ? current[question.id] as unknown[] : [];
      const next = checked
        ? [...existing.filter((entry) => !sameValue(entry, value)), value]
        : existing.filter((entry) => !sameValue(entry, value));
      return { ...current, [question.id]: next };
    });
  }

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

          {canAttempt && (quiz.questions?.length ?? 0) > 0 && (
            <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
              {(quiz.questions ?? []).map((question, index) => (
                <fieldset key={question.id} className="space-y-3 rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                  <legend className="px-1 text-sm font-semibold text-gray-900 dark:text-white">{t('lmsQuiz.question', { number: index + 1 })}: {question.question_text} <span className="font-normal text-gray-500">({formatNumber(Number(question.points))})</span></legend>
                  {isChoice(question) ? (
                    <div className="space-y-2">
                      {question.options.map((option, optionIndex) => {
                        const value = optionValue(option);
                        const selectedValue = answers[question.id];
                        const checked = isMultiSelect(question)
                          ? Array.isArray(selectedValue) && selectedValue.some((entry) => sameValue(entry, value))
                          : sameValue(selectedValue, value);
                        return <label key={`${question.id}-${optionIndex}`} className="flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800/60"><input type={isMultiSelect(question) ? 'checkbox' : 'radio'} name={question.id} checked={checked} onChange={(event) => setAnswer(question, value, event.target.checked)} className="mt-0.5 accent-primary-600" /><span>{optionLabel(option)}</span></label>;
                      })}
                    </div>
                  ) : (
                    <input className="input-field" value={typeof answers[question.id] === 'string' ? answers[question.id] as string : ''} onChange={(event) => setAnswer(question, event.target.value, true)} placeholder={t('lmsQuiz.typeAnswer')} />
                  )}
                </fieldset>
              ))}
              <div className="flex justify-end"><button type="submit" className="btn-primary" disabled={saving}>{t('lmsQuiz.submitQuiz')}</button></div>
            </form>
          )}

          {latestAttempt && (
            <div className={`flex items-start gap-3 rounded-xl border p-4 ${latestAttempt.passed ? 'border-success-200 bg-success-50 text-success-800 dark:border-success-900/50 dark:bg-success-950/20 dark:text-success-200' : 'border-warning-200 bg-warning-50 text-warning-800 dark:border-warning-900/50 dark:bg-warning-950/20 dark:text-warning-200'}`} role="status">
              {latestAttempt.passed ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /> : <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />}
              <div><p className="font-semibold">{latestAttempt.passed ? t('lmsQuiz.passed') : t('lmsQuiz.notPassed')}</p><p className="mt-1 text-sm">{t('lmsQuiz.score')}: {formatNumber(Number(latestAttempt.score))} / {formatNumber(Number(latestAttempt.total_points))} · {t('lmsQuiz.pointsEarned', { points: latestAttempt.points_awarded ?? 0 })}</p></div>
            </div>
          )}

          {canAttempt && <div className="border-t border-gray-200 pt-4 dark:border-gray-800"><h4 className="text-sm font-semibold text-gray-900 dark:text-white">{t('lmsQuiz.attempts')}</h4>{attempts.length === 0 ? <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t('lmsQuiz.noAttempts')}</p> : <ul className="mt-2 divide-y divide-gray-100 dark:divide-gray-800">{attempts.map((attempt) => <li key={attempt.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><span className="text-gray-600 dark:text-gray-300">{formatDate(attempt.attempted_at, { dateStyle: 'medium', timeStyle: 'short' })}</span><span className="font-medium text-gray-900 dark:text-white">{formatNumber(Number(attempt.score))} / {formatNumber(Number(attempt.total_points))}</span><span className={attempt.passed ? 'text-success-700 dark:text-success-300' : 'text-warning-700 dark:text-warning-300'}>{attempt.passed ? t('lmsQuiz.passed') : t('lmsQuiz.notPassed')}</span></li>)}</ul>}</div>}
        </section>
      )}
    </div>
  );
}