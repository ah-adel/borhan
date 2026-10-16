export type QuizSessionPhase = 'in_progress' | 'review' | 'submitting' | 'submit_error' | 'submitted';
export type QuizSubmitReason = 'manual' | 'expired' | null;

export interface QuizSessionState {
  quizId: string;
  questionIds: string[];
  answers: Record<string, unknown>;
  currentIndex: number;
  flaggedIds: string[];
  visitedIds: string[];
  startedAt: number;
  deadlineAt: number | null;
  phase: QuizSessionPhase;
  submitReason: QuizSubmitReason;
}

export type QuizSessionAction =
  | { type: 'set_answer'; questionId: string; answer: unknown }
  | { type: 'clear_answer'; questionId: string }
  | { type: 'go_to'; index: number }
  | { type: 'move'; offset: number }
  | { type: 'toggle_flag'; questionId: string }
  | { type: 'open_review' }
  | { type: 'close_review' }
  | { type: 'begin_submit'; reason?: Exclude<QuizSubmitReason, null> }
  | { type: 'check_deadline'; now: number }
  | { type: 'submit_succeeded' }
  | { type: 'submit_failed' }
  | { type: 'retry_submit' };

const DRAFT_PREFIX = 'borhan:quiz-draft:v1:';

export function createQuizSession(quizId: string, questionIds: string[], timeLimitMinutes: number, startedAt = Date.now()): QuizSessionState {
  const safeQuestionIds = [...questionIds];
  // Practice timing is client-side; server-side time enforcement remains a backend follow-up.
  const timeLimitMs = Number.isFinite(timeLimitMinutes) && timeLimitMinutes > 0 ? timeLimitMinutes * 60_000 : 0;
  return {
    quizId,
    questionIds: safeQuestionIds,
    answers: {},
    currentIndex: 0,
    flaggedIds: [],
    visitedIds: safeQuestionIds.slice(0, 1),
    startedAt,
    deadlineAt: timeLimitMs ? startedAt + timeLimitMs : null,
    phase: 'in_progress',
    submitReason: null,
  };
}

export function hasAnswer(state: QuizSessionState, questionId: string): boolean {
  if (!Object.prototype.hasOwnProperty.call(state.answers, questionId)) return false;
  const answer = state.answers[questionId];
  if (answer == null) return false;
  if (typeof answer === 'string') return answer.trim().length > 0;
  if (Array.isArray(answer)) return answer.length > 0;
  return true;
}

export function getQuestionStatus(state: QuizSessionState, questionId: string, index: number) {
  return {
    current: state.currentIndex === index,
    answered: hasAnswer(state, questionId),
    flagged: state.flaggedIds.includes(questionId),
    visited: state.visitedIds.includes(questionId),
  };
}

export function getQuizProgress(state: QuizSessionState) {
  const answered = state.questionIds.filter((questionId) => hasAnswer(state, questionId)).length;
  const flagged = state.flaggedIds.length;
  return { total: state.questionIds.length, answered, unanswered: state.questionIds.length - answered, flagged, visited: state.visitedIds.length };
}

export function remainingMilliseconds(deadlineAt: number | null, now = Date.now()): number | null {
  return deadlineAt == null ? null : Math.max(0, deadlineAt - now);
}

function visitQuestion(state: QuizSessionState, index: number): QuizSessionState {
  if (index < 0 || index >= state.questionIds.length) return state;
  const questionId = state.questionIds[index];
  return {
    ...state,
    currentIndex: index,
    visitedIds: state.visitedIds.includes(questionId) ? state.visitedIds : [...state.visitedIds, questionId],
  };
}

export function quizSessionReducer(state: QuizSessionState, action: QuizSessionAction): QuizSessionState {
  switch (action.type) {
    case 'set_answer':
      if (state.phase !== 'in_progress' || !state.questionIds.includes(action.questionId)) return state;
      return { ...state, answers: { ...state.answers, [action.questionId]: action.answer } };
    case 'clear_answer': {
      if (state.phase !== 'in_progress' || !state.questionIds.includes(action.questionId)) return state;
      const answers = { ...state.answers };
      delete answers[action.questionId];
      return { ...state, answers };
    }
    case 'go_to':
      return state.phase === 'in_progress' || state.phase === 'review' ? visitQuestion(state, action.index) : state;
    case 'move':
      return state.phase === 'in_progress' || state.phase === 'review' ? visitQuestion(state, state.currentIndex + action.offset) : state;
    case 'toggle_flag': {
      if (state.phase !== 'in_progress' || !state.questionIds.includes(action.questionId)) return state;
      const flaggedIds = state.flaggedIds.includes(action.questionId)
        ? state.flaggedIds.filter((questionId) => questionId !== action.questionId)
        : [...state.flaggedIds, action.questionId];
      return { ...state, flaggedIds };
    }
    case 'open_review':
      return state.phase === 'in_progress' ? { ...state, phase: 'review' } : state;
    case 'close_review':
      return state.phase === 'review' ? { ...state, phase: 'in_progress' } : state;
    case 'begin_submit':
      return state.phase === 'in_progress' || state.phase === 'review'
        ? { ...state, phase: 'submitting', submitReason: action.reason ?? 'manual' }
        : state;
    case 'check_deadline':
      return state.deadlineAt != null && action.now >= state.deadlineAt && (state.phase === 'in_progress' || state.phase === 'review')
        ? { ...state, phase: 'submitting', submitReason: 'expired' }
        : state;
    case 'submit_succeeded':
      return state.phase === 'submitting' ? { ...state, phase: 'submitted' } : state;
    case 'submit_failed':
      return state.phase === 'submitting' ? { ...state, phase: 'submit_error' } : state;
    case 'retry_submit':
      return state.phase === 'submit_error' ? { ...state, phase: 'submitting' } : state;
    default:
      return state;
  }
}

function draftKey(quizId: string, startedAt: number): string {
  return `${DRAFT_PREFIX}${encodeURIComponent(quizId)}:${startedAt}`;
}

function isQuizSessionState(value: unknown, quizId: string): value is QuizSessionState {
  if (typeof value !== 'object' || value === null) return false;
  const draft = value as Partial<QuizSessionState>;
  return draft.quizId === quizId
    && Array.isArray(draft.questionIds)
    && typeof draft.answers === 'object'
    && draft.answers !== null
    && typeof draft.startedAt === 'number'
    && (draft.deadlineAt === null || typeof draft.deadlineAt === 'number')
    && ['in_progress', 'review', 'submitting', 'submit_error'].includes(String(draft.phase))
    && Array.isArray(draft.flaggedIds)
    && Array.isArray(draft.visitedIds)
    && typeof draft.currentIndex === 'number';
}

export function saveQuizDraft(storage: Storage, state: QuizSessionState): boolean {
  if (state.phase === 'submitted') return false;
  try {
    storage.setItem(draftKey(state.quizId, state.startedAt), JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function restoreQuizDraft(storage: Storage, quizId: string): QuizSessionState | null {
  try {
    const prefix = `${DRAFT_PREFIX}${encodeURIComponent(quizId)}:`;
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
      .filter((key): key is string => key?.startsWith(prefix) ?? false);
    const drafts = keys.flatMap((key) => {
      try {
        const raw = storage.getItem(key);
        if (!raw) return [];
        const value: unknown = JSON.parse(raw);
        return isQuizSessionState(value, quizId) ? [value] : [];
      } catch {
        return [];
      }
    });
    const draft = drafts.sort((left, right) => right.startedAt - left.startedAt)[0];
    if (!draft) return null;
    return draft.phase === 'review' ? { ...draft, phase: 'in_progress' } : draft;
  } catch {
    return null;
  }
}

export function clearQuizDraft(storage: Storage, quizId: string, startedAt: number): boolean {
  try {
    storage.removeItem(draftKey(quizId, startedAt));
    return true;
  } catch {
    return false;
  }
}