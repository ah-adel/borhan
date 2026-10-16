import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AlertTriangle, Check, Circle, CircleCheck, Clock3, Flag, Grid3X3, Keyboard, Trash2, X } from 'lucide-react';
import { MathContent } from '@/components/common/MathContent';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { useI18n } from '@/context/I18nContext';
import { useScrollLock } from '@/hooks/useScrollLock';
import {
  clearQuizDraft,
  createQuizSession,
  getQuestionStatus,
  getQuizProgress,
  hasAnswer,
  quizSessionReducer,
  remainingMilliseconds,
  restoreQuizDraft,
  saveQuizDraft,
  type QuizSessionState,
} from '@/lib/quizSession';
import { useToast } from '@/components/ui/Toast';
import type { Quiz, QuizAttempt, QuizQuestion } from '@/types/lms';

interface QuizTakingScreenProps {
  quiz: Quiz;
  onSubmit: (answers: Record<string, unknown>) => Promise<QuizAttempt>;
  onComplete: (attempt: QuizAttempt, timeTakenMs: number) => void;
  onExit: () => void;
}

function optionLabel(option: unknown): string {
  if (typeof option === 'string' || typeof option === 'number') return String(option);
  if (typeof option === 'object' && option !== null) {
    const record = option as Record<string, unknown>;
    return String(record.label ?? record.text ?? record.value ?? '');
  }
  return '';
}

function optionValue(option: unknown): unknown {
  return typeof option === 'object' && option !== null && 'value' in option
    ? (option as Record<string, unknown>).value
    : option;
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

function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function getSessionStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function sameQuestionIds(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function QuestionNavigator({
  state,
  questions,
  onNavigate,
}: {
  state: QuizSessionState;
  questions: QuizQuestion[];
  onNavigate: (index: number) => void;
}) {
  const { t } = useI18n();
  const progress = getQuizProgress(state);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 text-content-muted"><CircleCheck className="h-4 w-4 text-success-700 dark:text-success-300" />{t('lmsQuiz.answered')}</span>
        <span className="inline-flex items-center gap-1.5 text-content-muted"><Circle className="h-4 w-4" />{t('lmsQuiz.unanswered')}</span>
        <span className="inline-flex items-center gap-1.5 text-content-muted"><Flag className="h-4 w-4 text-accent-700 dark:text-accent-300" />{t('lmsQuiz.flagged')}</span>
        <span className="inline-flex items-center gap-1.5 text-content-muted"><span className="h-4 w-4 rounded-md border-2 border-primary-600" />{t('lmsQuiz.current')}</span>
      </div>
      <nav aria-label={t('lmsQuiz.questionNavigator')} className="grid grid-cols-5 gap-2 sm:grid-cols-6 lg:grid-cols-4">
        {questions.map((question, index) => {
          const status = getQuestionStatus(state, question.id, index);
          const statusText = status.answered ? t('lmsQuiz.answered') : t('lmsQuiz.unanswered');
          const label = t('lmsQuiz.questionNavLabel', {
            number: index + 1,
            status: statusText,
            flagged: status.flagged ? t('lmsQuiz.flaggedSuffix') : '',
          });
          const Marker = status.flagged ? Flag : status.answered ? Check : Circle;
          const style = status.answered
            ? 'rounded-full border-success-600 bg-badge-success text-badge-success-text'
            : status.flagged
              ? 'rounded-md border-accent-600 bg-badge-accent text-badge-accent-text'
              : 'rounded-lg border-dashed border-border bg-surface-card text-content-muted';
          return (
            <button
              key={question.id}
              type="button"
              aria-label={label}
              aria-current={status.current ? 'step' : undefined}
              onClick={() => onNavigate(index)}
              className={`relative flex aspect-square min-h-11 min-w-11 items-center justify-center border text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 dark:focus:ring-offset-gray-950 ${style} ${status.current ? 'ring-2 ring-primary-600 ring-offset-2 dark:ring-offset-gray-950' : ''}`}
            >
              {index + 1}
              <Marker className="absolute -end-1 -top-1 h-4 w-4 rounded-full bg-surface-card p-0.5" aria-hidden="true" />
            </button>
          );
        })}
      </nav>
      <p className="text-xs text-content-muted">{t('lmsQuiz.navigatorCounts', { answered: progress.answered, total: progress.total, flagged: progress.flagged })}</p>
    </div>
  );
}

export function QuizTakingScreen({ quiz, onSubmit, onComplete, onExit }: QuizTakingScreenProps) {
  const { t, formatNumber, direction } = useI18n();
  const { showToast } = useToast();
  const questions = useMemo(() => quiz.questions ?? [], [quiz.questions]);
  const questionIds = useMemo(() => questions.map((question) => question.id), [questions]);
  const [state, dispatch] = useReducer(quizSessionReducer, undefined, () => {
    const storage = getSessionStorage();
    const restored = storage ? restoreQuizDraft(storage, quiz.id) : null;
    return restored && sameQuestionIds(restored.questionIds, questionIds)
      ? restored
      : createQuizSession(quiz.id, questionIds, Number(quiz.time_limit_minutes));
  });
  const [now, setNow] = useState(() => Date.now());
  const [exitOpen, setExitOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [submissionError, setSubmissionError] = useState(false);
  const submissionInFlight = useRef(false);
  const expirationNotified = useRef(false);
  const firstSubmitAt = useRef<number | null>(null);
  const previousRemaining = useRef(remainingMilliseconds(state.deadlineAt, Date.now()));
  const navigatorTriggerRef = useRef<HTMLButtonElement>(null);
  const currentQuestion = questions[state.currentIndex];
  const progress = getQuizProgress(state);
  const remainingMs = remainingMilliseconds(state.deadlineAt, now);
  const elapsedMs = Math.max(0, now - state.startedAt);
  const timerValue = remainingMs == null ? formatDuration(elapsedMs) : formatDuration(remainingMs);
  const timerLabel = remainingMs == null
    ? t('lmsQuiz.elapsedTime', { time: timerValue })
    : t('lmsQuiz.remainingTime', { time: timerValue });
  const warningLevel = remainingMs != null && remainingMs <= 60_000 ? 'critical' : remainingMs != null && remainingMs <= 300_000 ? 'warning' : null;

  useScrollLock(true);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const storage = getSessionStorage();
    if (storage) saveQuizDraft(storage, state);
  }, [state]);

  useEffect(() => {
    if (remainingMs == null || state.phase !== 'in_progress') return;
    const previous = previousRemaining.current;
    const milestones = [600_000, 300_000, 60_000, 30_000];
    const reached = milestones.find((milestone) => previous != null && previous > milestone && remainingMs <= milestone);
    if (reached != null) {
      const labels: Record<number, string> = {
        600_000: t('lmsQuiz.tenMinutesLeft'),
        300_000: t('lmsQuiz.fiveMinutesLeft'),
        60_000: t('lmsQuiz.oneMinuteLeft'),
        30_000: t('lmsQuiz.thirtySecondsLeft'),
      };
      setAnnouncement(labels[reached]);
    }
    previousRemaining.current = remainingMs;
  }, [remainingMs, state.phase, t]);

  useEffect(() => {
    if (remainingMs == null || remainingMs > 0 || expirationNotified.current) return;
    expirationNotified.current = true;
    setReviewOpen(false);
    showToast(t('lmsQuiz.timeExpired'), 'info');
    dispatch({ type: 'check_deadline', now: Date.now() });
  }, [remainingMs, showToast, t]);

  useEffect(() => {
    if (!['in_progress', 'review', 'submitting', 'submit_error'].includes(state.phase)) return undefined;
    const warning = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warning);
    return () => window.removeEventListener('beforeunload', warning);
  }, [state.phase]);

  useEffect(() => {
    if (state.phase !== 'submitting' || submissionInFlight.current) return;
    submissionInFlight.current = true;
    setSubmissionError(false);
    firstSubmitAt.current ??= Date.now();
    void onSubmit(state.answers)
      .then((attempt) => {
        const storage = getSessionStorage();
        if (storage) clearQuizDraft(storage, quiz.id, state.startedAt);
        dispatch({ type: 'submit_succeeded' });
        onComplete(attempt, Math.max(0, (firstSubmitAt.current ?? Date.now()) - state.startedAt));
      })
      .catch(() => {
        submissionInFlight.current = false;
        setSubmissionError(true);
        dispatch({ type: 'submit_failed' });
        showToast(t('lmsQuiz.submitError'), 'error');
      });
  }, [onComplete, onSubmit, quiz.id, showToast, state.answers, state.phase, state.startedAt, t]);

  const navigateTo = useCallback((index: number) => {
    dispatch({ type: 'close_review' });
    dispatch({ type: 'go_to', index });
    setNavigatorOpen(false);
    setReviewOpen(false);
  }, []);

  const openReview = useCallback(() => {
    dispatch({ type: 'open_review' });
    setReviewOpen(true);
  }, []);

  const requestExit = useCallback(() => {
    setReviewOpen(false);
    dispatch({ type: 'close_review' });
    setExitOpen(true);
  }, []);

  const setAnswer = useCallback((question: QuizQuestion, value: unknown, checked: boolean) => {
    if (!isMultiSelect(question)) {
      dispatch({ type: 'set_answer', questionId: question.id, answer: value });
      return;
    }
    const existing = Array.isArray(state.answers[question.id]) ? state.answers[question.id] as unknown[] : [];
    const next = checked
      ? [...existing.filter((entry) => !sameValue(entry, value)), value]
      : existing.filter((entry) => !sameValue(entry, value));
    dispatch({ type: 'set_answer', questionId: question.id, answer: next });
  }, [state.answers]);

  const chooseOption = useCallback((optionIndex: number) => {
    if (!currentQuestion || !isChoice(currentQuestion) || optionIndex < 0 || optionIndex >= currentQuestion.options.length) return;
    const value = optionValue(currentQuestion.options[optionIndex]);
    if (isMultiSelect(currentQuestion)) {
      const current = Array.isArray(state.answers[currentQuestion.id]) ? state.answers[currentQuestion.id] as unknown[] : [];
      setAnswer(currentQuestion, value, !current.some((entry) => sameValue(entry, value)));
    } else {
      setAnswer(currentQuestion, value, true);
    }
  }, [currentQuestion, setAnswer, state.answers]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || state.phase !== 'in_progress' || reviewOpen || exitOpen) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.matches('input, textarea, select'))) return;
      const key = event.key.toLowerCase();
      if (key === 'arrowleft' || key === 'arrowright' || key === 'arrowup' || key === 'arrowdown') {
        event.preventDefault();
        const offset = key === 'arrowup'
          ? -1
          : key === 'arrowdown'
            ? 1
            : key === 'arrowleft'
              ? (direction === 'rtl' ? 1 : -1)
              : (direction === 'rtl' ? -1 : 1);
        dispatch({ type: 'move', offset });
        return;
      }
      if (key === 'f') {
        event.preventDefault();
        if (currentQuestion) dispatch({ type: 'toggle_flag', questionId: currentQuestion.id });
        return;
      }
      if (/^[1-5]$/.test(key)) chooseOption(Number(key) - 1);
      if (/^[a-e]$/.test(key)) chooseOption(key.charCodeAt(0) - 97);
    }
    document.addEventListener('keydown', handleShortcut);
    return () => document.removeEventListener('keydown', handleShortcut);
  }, [chooseOption, currentQuestion, direction, exitOpen, reviewOpen, state.phase]);

  if (!currentQuestion) return null;

  const flagged = state.flaggedIds.includes(currentQuestion.id);
  const questionStem = (
    <MathContent content={currentQuestion.question_text} className="break-words text-base leading-8 text-content-main" />
  );

  return (
    <div className="fixed inset-0 z-[90] flex min-h-0 flex-col overflow-hidden bg-surface-canvas text-content-main">
      <header className="shrink-0 border-b border-border bg-surface-card px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Button variant="ghost" iconOnly aria-label={t('lmsQuiz.exitQuiz')} onClick={requestExit}>
              <X className="h-5 w-5" aria-hidden="true" />
            </Button>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold sm:text-lg">{quiz.title}</h1>
              <p className="text-xs text-content-muted">{t('lmsQuiz.questionProgress', { current: state.currentIndex + 1, total: questions.length })}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              role="timer"
              aria-label={timerLabel}
              aria-live="off"
              className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 font-mono text-sm font-semibold tabular-nums ${warningLevel === 'critical' ? 'border-error-300 bg-badge-danger text-badge-danger-text' : warningLevel === 'warning' ? 'border-warning-300 bg-badge-warning text-badge-warning-text' : 'border-border bg-surface-card text-content-main'}`}
            >
              {warningLevel ? <AlertTriangle className="h-4 w-4" aria-hidden="true" /> : <Clock3 className="h-4 w-4" aria-hidden="true" />}
              {timerValue}
            </span>
            <Button size="sm" variant="secondary" className="hidden sm:inline-flex" onClick={() => setAnnouncement(timerLabel)}>
              <Clock3 className="h-4 w-4" aria-hidden="true" />{t('lmsQuiz.hearTime')}
            </Button>
            <Button variant="secondary" iconOnly aria-label={t('lmsQuiz.hearTime')} className="sm:hidden" onClick={() => setAnnouncement(timerLabel)}>
              <Clock3 className="h-5 w-5" aria-hidden="true" />
            </Button>
            <details className="relative hidden lg:block">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-600">
                <Keyboard className="h-4 w-4" aria-hidden="true" />{t('lmsQuiz.keyboardHelp')}
              </summary>
              <ul className="absolute end-0 top-full z-30 mt-1 min-w-60 space-y-1 rounded-lg border border-border bg-surface-card px-3 py-2 text-xs text-content-muted shadow-lg">
                <li>{t('lmsQuiz.shortcutNavigation')}</li>
                <li>{t('lmsQuiz.shortcutOptions')}</li>
                <li>{t('lmsQuiz.shortcutFlag')}</li>
              </ul>
            </details>
          </div>
          {warningLevel && <p className={`w-full text-end text-xs font-medium ${warningLevel === 'critical' ? 'text-error-700 dark:text-error-300' : 'text-warning-700 dark:text-warning-300'}`}>{warningLevel === 'critical' ? t('lmsQuiz.oneMinuteWarning') : t('lmsQuiz.fiveMinuteWarning')}</p>}
          <span className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</span>
        </div>
        <div className="mx-auto mt-3 max-w-7xl">
          <ProgressBar value={questions.length ? (progress.answered / questions.length) * 100 : 0} label={t('lmsQuiz.answeredProgress', { answered: progress.answered, total: progress.total })} />
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-36 pt-5 sm:px-6 sm:pt-8 lg:pb-8">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <section aria-labelledby="active-question-title" className="min-w-0">
            <div className="rounded-xl border border-border bg-surface-card p-4 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Badge variant="primary">{t('lmsQuiz.question', { number: state.currentIndex + 1 })}</Badge>
                <span className="text-sm text-content-muted">{t('lmsQuiz.pointsPerQuestion')}: {formatNumber(Number(currentQuestion.points))}</span>
              </div>
              <h2 id="active-question-title" className="sr-only">{t('lmsQuiz.question', { number: state.currentIndex + 1 })}</h2>
              <div className="mt-5 min-w-0">{questionStem}</div>

              {isChoice(currentQuestion) ? (
                <fieldset className="mt-6 space-y-3" aria-label={t('lmsQuiz.selectAnswer')}>
                  {currentQuestion.options.map((option, optionIndex) => {
                    const value = optionValue(option);
                    const selected = state.answers[currentQuestion.id];
                    const checked = isMultiSelect(currentQuestion)
                      ? Array.isArray(selected) && selected.some((entry) => sameValue(entry, value))
                      : sameValue(selected, value);
                    const inputId = `${currentQuestion.id}-option-${optionIndex}`;
                    return (
                      <label key={inputId} htmlFor={inputId} className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 text-sm focus-within:ring-2 focus-within:ring-primary-600 ${checked ? 'border-primary-700 bg-badge-primary text-badge-primary-text' : 'border-border bg-surface-card text-content-main hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                        <input
                          id={inputId}
                          type={isMultiSelect(currentQuestion) ? 'checkbox' : 'radio'}
                          name={currentQuestion.id}
                          checked={checked}
                          onChange={(event) => setAnswer(currentQuestion, value, event.target.checked)}
                          className="mt-0.5 h-5 w-5 shrink-0 accent-primary-700"
                        />
                        <span className="min-w-0 flex-1"><MathContent content={optionLabel(option)} className="break-words leading-6" /></span>
                        {checked && <Check className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />}
                      </label>
                    );
                  })}
                </fieldset>
              ) : (
                <label className="mt-6 block text-sm font-medium text-content-main">
                  {t('lmsQuiz.answerForQuestion', { number: state.currentIndex + 1 })}
                  <input
                    className="input-field mt-2 min-h-12"
                    value={typeof state.answers[currentQuestion.id] === 'string' ? state.answers[currentQuestion.id] as string : ''}
                    onChange={(event) => dispatch({ type: 'set_answer', questionId: currentQuestion.id, answer: event.target.value })}
                    placeholder={t('lmsQuiz.typeAnswer')}
                  />
                </label>
              )}

              <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-border pt-4">
                <Button variant={flagged ? 'accent' : 'secondary'} onClick={() => dispatch({ type: 'toggle_flag', questionId: currentQuestion.id })}>
                  <Flag className="h-4 w-4" aria-hidden="true" />{flagged ? t('lmsQuiz.unflagQuestion') : t('lmsQuiz.markForReview')}
                </Button>
                {hasAnswer(state, currentQuestion.id) && (
                  <Button variant="ghost" onClick={() => dispatch({ type: 'clear_answer', questionId: currentQuestion.id })}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />{t('lmsQuiz.clearAnswer')}
                  </Button>
                )}
              </div>
            </div>
            <details className="mt-4 rounded-lg border border-border bg-surface-card px-3 lg:hidden">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-600">
                <Keyboard className="h-4 w-4" aria-hidden="true" />{t('lmsQuiz.keyboardHelp')}
              </summary>
              <ul className="space-y-1 border-t border-border py-2 text-xs text-content-muted">
                <li>{t('lmsQuiz.shortcutNavigation')}</li>
                <li>{t('lmsQuiz.shortcutOptions')}</li>
                <li>{t('lmsQuiz.shortcutFlag')}</li>
              </ul>
            </details>
            <div className="mt-4 hidden items-center justify-between gap-3 lg:flex">
              <Button variant="secondary" disabled={state.currentIndex === 0} onClick={() => dispatch({ type: 'move', offset: -1 })}>{t('lmsQuiz.previousQuestion')}</Button>
              <Button variant="primary" onClick={() => state.currentIndex === questions.length - 1 ? openReview() : dispatch({ type: 'move', offset: 1 })}>
                {state.currentIndex === questions.length - 1 ? t('lmsQuiz.reviewSubmit') : t('lmsQuiz.nextQuestion')}
              </Button>
            </div>
          </section>

          <aside className="sticky top-4 hidden h-fit rounded-xl border border-border bg-surface-card p-4 lg:block">
            <h2 className="mb-4 text-sm font-semibold">{t('lmsQuiz.questionNavigator')}</h2>
            <QuestionNavigator state={state} questions={questions} onNavigate={navigateTo} />
            <Button className="mt-5 w-full" onClick={openReview}>
              {t('lmsQuiz.reviewSubmit')}
            </Button>
          </aside>
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface-card/95 px-3 pt-3 shadow-lg backdrop-blur pb-[calc(env(safe-area-inset-bottom)+0.75rem)] lg:hidden">
        <div className="mx-auto grid max-w-xl grid-cols-3 gap-2">
          <Button variant="secondary" size="sm" className="min-h-11 !px-1" disabled={state.currentIndex === 0} onClick={() => dispatch({ type: 'move', offset: -1 })}>
            {t('lmsQuiz.previousQuestion')}
          </Button>
          <button ref={navigatorTriggerRef} type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-surface-card px-2 text-xs font-semibold text-content-main focus:outline-none focus:ring-2 focus:ring-primary-600" onClick={() => setNavigatorOpen(true)}>
            <Grid3X3 className="h-4 w-4" aria-hidden="true" />{t('lmsQuiz.questions')}
          </button>
          <Button size="sm" className="min-h-11 !px-1" onClick={() => state.currentIndex === questions.length - 1 ? openReview() : dispatch({ type: 'move', offset: 1 })}>
            {state.currentIndex === questions.length - 1 ? t('lmsQuiz.reviewSubmitShort') : t('lmsQuiz.nextQuestion')}
          </Button>
        </div>
      </div>

      <Dialog
        open={navigatorOpen}
        placement="bottom"
        title={t('lmsQuiz.questionNavigator')}
        onClose={() => setNavigatorOpen(false)}
        returnFocusRef={navigatorTriggerRef}
      >
        <QuestionNavigator state={state} questions={questions} onNavigate={navigateTo} />
      </Dialog>

      <Dialog
        open={exitOpen}
        title={t('lmsQuiz.exitQuiz')}
        description={t('lmsQuiz.exitWarning')}
        onClose={() => setExitOpen(false)}
        footer={<>
          <Button variant="secondary" onClick={() => setExitOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="danger" onClick={onExit}>{t('lmsQuiz.leaveQuiz')}</Button>
        </>}
      />

      <Dialog
        open={reviewOpen}
        title={t('lmsQuiz.reviewTitle')}
        description={t('lmsQuiz.reviewDescription')}
        onClose={() => { setReviewOpen(false); dispatch({ type: 'close_review' }); }}
        footer={<>
          <Button variant="secondary" onClick={() => { setReviewOpen(false); dispatch({ type: 'close_review' }); }}>{t('lmsQuiz.continueQuiz')}</Button>
          <Button onClick={() => { setReviewOpen(false); dispatch({ type: 'begin_submit', reason: 'manual' }); }} loading={state.phase === 'submitting'}>
            {t('lmsQuiz.confirmSubmit')}
          </Button>
        </>}
      >
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border border-border p-3"><p className="text-2xl font-semibold tabular-nums">{progress.answered}</p><p className="mt-1 text-xs text-content-muted">{t('lmsQuiz.answered')}</p></div>
          <div className="rounded-lg border border-border p-3"><p className="text-2xl font-semibold tabular-nums">{progress.unanswered}</p><p className="mt-1 text-xs text-content-muted">{t('lmsQuiz.unanswered')}</p></div>
          <div className="rounded-lg border border-border p-3"><p className="text-2xl font-semibold tabular-nums">{progress.flagged}</p><p className="mt-1 text-xs text-content-muted">{t('lmsQuiz.flagged')}</p></div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {questions.map((question, index) => {
            const status = getQuestionStatus(state, question.id, index);
            if (status.answered && !status.flagged) return null;
            return <Button key={question.id} size="sm" variant="secondary" onClick={() => navigateTo(index)}>
              {t('lmsQuiz.question', { number: index + 1 })}{status.flagged ? ` · ${t('lmsQuiz.flagged')}` : ` · ${t('lmsQuiz.unanswered')}`}
            </Button>;
          })}
        </div>
      </Dialog>

      <Dialog
        open={submissionError && state.phase === 'submit_error'}
        title={t('lmsQuiz.submitError')}
        description={t('lmsQuiz.retryPreservesAnswers')}
        onClose={() => {}}
        closeOnEscape={false}
        closeOnBackdrop={false}
        showCloseButton={false}
        footer={<Button onClick={() => dispatch({ type: 'retry_submit' })}><Clock3 className="h-4 w-4" aria-hidden="true" />{t('lmsQuiz.retrySubmission')}</Button>}
      />

    </div>
  );
}