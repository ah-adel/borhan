import { useState } from 'react';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { MathContent } from '@/components/common/MathContent';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { useI18n } from '@/context/I18nContext';
import type { Quiz, QuizAttempt, QuizQuestion } from '@/types/lms';

type ResultsFilter = 'all' | 'incorrect' | 'flagged' | 'unanswered';

interface QuizResultsScreenProps {
  quiz: Quiz;
  attempt: QuizAttempt | null;
  timeTakenMs: number | null;
  flaggedQuestionIds: string[];
  isLoading?: boolean;
  error?: string | null;
  onRetry: () => void;
  onBack: () => void;
}

function hasStudentAnswer(answers: Record<string, unknown>, questionId: string): boolean {
  if (!Object.prototype.hasOwnProperty.call(answers, questionId)) return false;
  const value = answers[questionId];
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${stableValue(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? String(value);
}

function isMultiSelect(question: QuizQuestion): boolean {
  return ['multiple_select', 'multi_select', 'checkbox'].includes(question.question_type.toLowerCase().replace(/-/g, '_'));
}

function matchesAnswer(question: QuizQuestion, expected: unknown, submitted: unknown): boolean {
  const normalizedType = question.question_type.trim().toLowerCase().replace(/-/g, '_');
  if (['text', 'short_answer', 'free_text'].includes(normalizedType) && typeof expected === 'string' && typeof submitted === 'string') {
    return expected.trim().toLocaleLowerCase() === submitted.trim().toLocaleLowerCase();
  }
  if (isMultiSelect(question) && Array.isArray(expected) && Array.isArray(submitted)) {
    return expected.map(stableValue).sort().join('|') === submitted.map(stableValue).sort().join('|');
  }
  return stableValue(expected) === stableValue(submitted);
}

function optionValue(option: unknown): unknown {
  return typeof option === 'object' && option !== null && 'value' in option
    ? (option as Record<string, unknown>).value
    : option;
}

function optionLabel(option: unknown): string {
  if (typeof option === 'string' || typeof option === 'number') return String(option);
  if (typeof option === 'object' && option !== null) {
    const record = option as Record<string, unknown>;
    return String(record.label ?? record.text ?? record.value ?? '');
  }
  return '';
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

export function QuizResultsScreen({
  quiz,
  attempt,
  timeTakenMs,
  flaggedQuestionIds,
  isLoading = false,
  error = null,
  onRetry,
  onBack,
}: QuizResultsScreenProps) {
  const { t, formatNumber, direction } = useI18n();
  const [filter, setFilter] = useState<ResultsFilter>('all');
  const attemptQuestions = (attempt?.questions ?? []).filter((question): question is QuizQuestion => typeof question?.id === 'string');
  const quizQuestions = quiz.questions ?? [];
  const returnedQuestions = new Map(attemptQuestions.map((question) => [question.id, question]));
  const questions = [
    ...quizQuestions.map((question) => ({ ...question, ...returnedQuestions.get(question.id) })),
    ...attemptQuestions.filter((question) => !quizQuestions.some((quizQuestion) => quizQuestion.id === question.id)),
  ];
  const answers = attempt?.answers ?? {};
  const totalPoints = Number(attempt?.total_points ?? 0);
  const score = Number(attempt?.score ?? 0);
  const percentage = Number.isFinite(totalPoints) && totalPoints > 0 && Number.isFinite(score)
    ? Math.min(100, Math.max(0, (score / totalPoints) * 100))
    : 0;
  const unansweredCount = questions.filter((question) => !hasStudentAnswer(answers, question.id)).length;
  const reviewableQuestions = questions.filter((question) => question.correct_answer != null);
  const correctCount = reviewableQuestions.filter((question) => hasStudentAnswer(answers, question.id)
    && matchesAnswer(question, question.correct_answer, answers[question.id])).length;
  const incorrectCount = reviewableQuestions.filter((question) => hasStudentAnswer(answers, question.id)
    && !matchesAnswer(question, question.correct_answer, answers[question.id])).length;
  const passingThreshold = Number(quiz.passing_score);
  const passStatusAvailable = typeof attempt?.passed === 'boolean' && Number.isFinite(passingThreshold);
  const reviewDetailsAvailable = questions.some((question) => question.correct_answer != null || Boolean(question.explanation));
  const reviewDetailsCount = questions.filter((question) => question.correct_answer != null || Boolean(question.explanation)).length;
  const correctnessAvailable = reviewableQuestions.length > 0;

  if (isLoading) return <LoadingState label={t('lmsQuiz.resultsLoading')} />;
  if (error) return (
    <ErrorState
      title={t('lmsQuiz.resultsError')}
      description={error}
      retryLabel={t('lmsQuiz.retryResults')}
      onRetry={onRetry}
    />
  );
  if (!attempt) return (
    <EmptyState
      title={t('lmsQuiz.resultsEmpty')}
      description={t('lmsQuiz.resultsEmptyDescription')}
      action={<Button variant="secondary" onClick={onBack}>{t('lmsQuiz.backToCourse')}</Button>}
    />
  );

  function displayAnswer(question: QuizQuestion, value: unknown): string {
    if (Array.isArray(value)) return value.map((entry) => displayAnswer(question, entry)).join(', ');
    const option = question.options.find((item) => stableValue(optionValue(item)) === stableValue(value));
    if (option !== undefined) return optionLabel(option);
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    return value == null ? t('lmsQuiz.unanswered') : JSON.stringify(value);
  }

  const filteredQuestions = questions.filter((question) => {
    if (filter === 'flagged') return flaggedQuestionIds.includes(question.id);
    if (filter === 'unanswered') return !hasStudentAnswer(answers, question.id);
    if (filter === 'incorrect') return question.correct_answer != null
      && hasStudentAnswer(answers, question.id)
      && !matchesAnswer(question, question.correct_answer, answers[question.id]);
    return true;
  });
  const filters: { id: ResultsFilter; label: string; disabled?: boolean }[] = [
    { id: 'all', label: t('lmsQuiz.allQuestions') },
    { id: 'incorrect', label: t('lmsQuiz.incorrect'), disabled: !correctnessAvailable },
    { id: 'flagged', label: t('lmsQuiz.flagged'), disabled: flaggedQuestionIds.length === 0 },
    { id: 'unanswered', label: t('lmsQuiz.unanswered') },
  ];

  return (
    <section className="mx-auto min-h-[70vh] max-w-6xl space-y-6 pb-8" aria-labelledby="quiz-results-title">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-content-muted">{quiz.title}</p>
          <h1 id="quiz-results-title" className="mt-1 text-2xl font-semibold text-content-main">{t('lmsQuiz.resultTitle')}</h1>
          <p className="mt-2 text-sm text-content-muted">{t('lmsQuiz.resultIntro')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onBack}>
            <ArrowLeft className={`h-4 w-4 ${direction === 'rtl' ? 'rotate-180' : ''}`} aria-hidden="true" />{t('lmsQuiz.backToCourse')}
          </Button>
          <Button onClick={onRetry}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />{t('lmsQuiz.retryQuiz')}
          </Button>
        </div>
      </header>

      <Card className="border-border">
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(15rem,0.8fr)] md:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-3xl font-semibold tabular-nums text-content-main">{formatNumber(score)} <span className="text-lg font-normal text-content-muted">/ {formatNumber(totalPoints)}</span></p>
              {passStatusAvailable && <Badge variant={attempt.passed ? 'success' : 'warning'}>{attempt.passed ? t('lmsQuiz.passed') : t('lmsQuiz.notPassed')}</Badge>}
            </div>
            {passStatusAvailable && <p className="mt-2 text-sm text-content-muted">{t('lmsQuiz.passingThreshold', { threshold: formatNumber(passingThreshold) })}</p>}
            <div className="mt-5">
              <ProgressBar value={percentage} label={t('lmsQuiz.scorePercentage', { percentage: formatNumber(Number(percentage.toFixed(1))) })} showValue />
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-5 border-t border-border pt-5 md:border-t-0 md:border-s md:ps-6 md:pt-0">
            <div><dt className="text-xs text-content-muted">{t('lmsQuiz.correct')}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{correctnessAvailable ? formatNumber(correctCount) : <span aria-label={t('lmsQuiz.notAvailable')}>—</span>}</dd></div>
            <div><dt className="text-xs text-content-muted">{t('lmsQuiz.incorrect')}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{correctnessAvailable ? formatNumber(incorrectCount) : <span aria-label={t('lmsQuiz.notAvailable')}>—</span>}</dd></div>
            <div><dt className="text-xs text-content-muted">{t('lmsQuiz.unanswered')}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{formatNumber(unansweredCount)}</dd></div>
            <div><dt className="text-xs text-content-muted">{t('lmsQuiz.timeTakenLabel')}</dt><dd className="mt-1 text-xl font-semibold font-mono tabular-nums">{timeTakenMs == null ? <span aria-label={t('lmsQuiz.notAvailable')}>—</span> : formatDuration(timeTakenMs)}</dd></div>
          </dl>
        </div>
        {!correctnessAvailable && <p className="mt-5 rounded-lg border border-border bg-surface-canvas px-4 py-3 text-sm text-content-muted" role="status">{t('lmsQuiz.reviewUnavailable')}</p>}
        {correctnessAvailable && reviewableQuestions.length < questions.length && <p className="mt-5 rounded-lg border border-border bg-surface-canvas px-4 py-3 text-sm text-content-muted" role="status">{t('lmsQuiz.partialReviewAvailable', { count: formatNumber(reviewableQuestions.length), total: formatNumber(questions.length) })}</p>}
      </Card>

      <section aria-labelledby="question-review-title" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="question-review-title" className="text-lg font-semibold text-content-main">{t('lmsQuiz.questionReview')}</h2>
            <p className="mt-1 text-sm text-content-muted">
              {reviewDetailsAvailable
                ? t('lmsQuiz.reviewAvailableCount', { count: formatNumber(reviewDetailsCount), total: formatNumber(questions.length) })
                : t('lmsQuiz.studentAnswersOnly')}
            </p>
          </div>
          <nav className="flex max-w-full flex-wrap gap-2" role="tablist" aria-label={t('lmsQuiz.reviewFilters')}>
            {filters.map((item) => (
              <button
                key={item.id}
                id={`quiz-filter-${item.id}`}
                type="button"
                role="tab"
                aria-selected={filter === item.id}
                disabled={item.disabled}
                onClick={() => setFilter(item.id)}
                className={`min-h-11 rounded-lg border px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary-600 disabled:cursor-not-allowed disabled:opacity-45 ${filter === item.id ? 'border-primary-700 bg-badge-primary text-badge-primary-text' : 'border-border bg-surface-card text-content-main hover:bg-gray-50 dark:hover:bg-gray-800'}`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        {filteredQuestions.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-content-muted" role="status">{t('lmsQuiz.noMatchingQuestions')}</p>
        ) : (
          <div role="tabpanel" aria-labelledby={`quiz-filter-${filter}`} className="space-y-3">
            {filteredQuestions.map((question) => {
              const index = questions.findIndex((item) => item.id === question.id);
              const answered = hasStudentAnswer(answers, question.id);
              const canCheck = question.correct_answer != null && answered;
              const correct = canCheck && matchesAnswer(question, question.correct_answer, answers[question.id]);
              const flagged = flaggedQuestionIds.includes(question.id);
              return (
                <article id={`quiz-review-${question.id}`} key={question.id} className="scroll-mt-6 rounded-lg border border-border bg-surface-card p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-content-main">{t('lmsQuiz.question', { number: index + 1 })}</h3>
                    <div className="flex flex-wrap gap-2">
                      {canCheck && <Badge variant={correct ? 'success' : 'danger'}>{correct ? t('lmsQuiz.correct') : t('lmsQuiz.incorrect')}</Badge>}
                      {!answered && <Badge variant="neutral">{t('lmsQuiz.unanswered')}</Badge>}
                      {flagged && <Badge variant="accent">{t('lmsQuiz.flagged')}</Badge>}
                    </div>
                  </div>
                  <MathContent content={question.question_text} className="mt-3 break-words text-sm leading-7 text-content-main" />
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-content-muted">{t('lmsQuiz.studentAnswer')}</p>
                      {answered
                        ? <MathContent content={displayAnswer(question, answers[question.id])} className="mt-1 break-words text-sm text-content-main" />
                        : <p className="mt-1 text-sm text-content-muted">{t('lmsQuiz.unanswered')}</p>}
                    </div>
                    {question.correct_answer != null && (
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-content-muted">{t('lmsQuiz.correctAnswer')}</p>
                        <MathContent content={displayAnswer(question, question.correct_answer)} className="mt-1 break-words text-sm text-content-main" />
                      </div>
                    )}
                  </div>
                  {question.explanation && (
                    <div className="mt-4 border-t border-border pt-3">
                      <p className="text-xs font-semibold text-content-muted">{t('lmsQuiz.explanation')}</p>
                      <MathContent content={question.explanation} className="mt-1 break-words text-sm leading-7 text-content-main" />
                    </div>
                  )}
                  {question.correct_answer == null && !question.explanation && (
                    <p className="mt-3 text-xs text-content-muted">{t('lmsQuiz.questionDetailsUnavailable')}</p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <nav aria-label={t('lmsQuiz.jumpToQuestion')} className="flex flex-wrap gap-2">
        {questions.map((question, index) => (
          <a
            key={question.id}
            href={`#quiz-review-${encodeURIComponent(question.id)}`}
            onClick={() => setFilter('all')}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border bg-surface-card px-3 text-sm font-medium text-content-main focus:outline-none focus:ring-2 focus:ring-primary-600"
            aria-label={t('lmsQuiz.jumpToQuestionNumber', { number: index + 1 })}
          >
            {index + 1}
          </a>
        ))}
      </nav>
    </section>
  );
}