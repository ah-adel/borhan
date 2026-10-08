import { apiRequest } from '@/services/api';
import type {
  CourseDiscussion,
  CourseDiscussionInput,
  DiscussionReply,
  LeaderboardEntry,
  Quiz,
  QuizAttempt,
  QuizQuestion,
  QuizQuestionInput,
  StudentGamificationStats,
  SubscriptionPlan,
} from '@/types/lms';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

function authHeaders(): HeadersInit {
  const token = typeof window === 'undefined'
    ? ''
    : window.sessionStorage.getItem('learnflow_session_token') ?? '';
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  return apiRequest<T>(`${API_BASE_URL}${path}`, {
    ...init,
    cache: 'no-store',
    headers: { ...authHeaders(), ...init.headers },
  });
}

function jsonRequest(method: 'POST' | 'PATCH', payload: unknown): RequestInit {
  return { method, body: JSON.stringify(payload) };
}

export function fetchQuizzes(): Promise<Quiz[]> {
  return request('/api/quizzes');
}

export function fetchQuiz(quizId: string): Promise<Quiz> {
  return request(`/api/quizzes/${encodeURIComponent(quizId)}`);
}

export function createQuiz(payload: Omit<Quiz, 'id' | 'created_at' | 'questions' | 'question_count'>): Promise<Quiz> {
  return request('/api/quizzes', jsonRequest('POST', payload));
}

export function updateQuiz(quizId: string, payload: Partial<Pick<Quiz, 'title' | 'lesson_id' | 'time_limit_minutes' | 'passing_score'>>): Promise<Quiz> {
  return request(`/api/quizzes/${encodeURIComponent(quizId)}`, jsonRequest('PATCH', payload));
}

export function deleteQuiz(quizId: string): Promise<{ deleted: boolean }> {
  return request(`/api/quizzes/${encodeURIComponent(quizId)}`, { method: 'DELETE' });
}

export function createQuizQuestion(quizId: string, payload: QuizQuestionInput): Promise<QuizQuestion> {
  return request(`/api/quizzes/${encodeURIComponent(quizId)}/questions`, jsonRequest('POST', payload));
}

export function updateQuizQuestion(questionId: string, payload: Partial<QuizQuestionInput>): Promise<QuizQuestion> {
  return request(`/api/quiz-questions/${encodeURIComponent(questionId)}`, jsonRequest('PATCH', payload));
}

export function deleteQuizQuestion(questionId: string): Promise<{ deleted: boolean }> {
  return request(`/api/quiz-questions/${encodeURIComponent(questionId)}`, { method: 'DELETE' });
}

export function submitQuiz(quizId: string, answers: Record<string, unknown>): Promise<QuizAttempt> {
  return request(`/api/quizzes/${encodeURIComponent(quizId)}/submit`, jsonRequest('POST', { answers }));
}

export function fetchQuizAttempts(quizId: string): Promise<QuizAttempt[]> {
  return request(`/api/quizzes/${encodeURIComponent(quizId)}/attempts/me`);
}

export function fetchGamificationStats(limit = 50): Promise<StudentGamificationStats> {
  return request(`/api/gamification/me?limit=${limit}`);
}

export function fetchLeaderboard(limit = 100): Promise<LeaderboardEntry[]> {
  return request(`/api/leaderboard?limit=${limit}`);
}

export function fetchSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  return request('/api/subscription-plans');
}

export function createSubscriptionPlan(payload: Pick<SubscriptionPlan, 'name' | 'description' | 'price' | 'duration_days' | 'is_active'>): Promise<SubscriptionPlan> {
  return request('/api/subscription-plans', jsonRequest('POST', payload));
}

export function updateSubscriptionPlan(planId: string, payload: Partial<Pick<SubscriptionPlan, 'name' | 'description' | 'price' | 'duration_days' | 'is_active'>>): Promise<SubscriptionPlan> {
  return request(`/api/subscription-plans/${encodeURIComponent(planId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteSubscriptionPlan(planId: string): Promise<{ deleted: boolean }> {
  return request(`/api/subscription-plans/${encodeURIComponent(planId)}`, { method: 'DELETE' });
}

export function fetchCourseDiscussions(courseId: string, lessonId?: string | null): Promise<CourseDiscussion[]> {
  const query = lessonId ? `?lesson_id=${encodeURIComponent(lessonId)}` : '';
  return request(`/api/courses/${encodeURIComponent(courseId)}/discussions${query}`);
}

export function createCourseDiscussion(courseId: string, payload: CourseDiscussionInput): Promise<CourseDiscussion> {
  return request(`/api/courses/${encodeURIComponent(courseId)}/discussions`, jsonRequest('POST', payload));
}

export function fetchDiscussionReplies(discussionId: string): Promise<DiscussionReply[]> {
  return request(`/api/discussions/${encodeURIComponent(discussionId)}/replies`);
}

export function createDiscussionReply(discussionId: string, content: string): Promise<DiscussionReply> {
  return request(`/api/discussions/${encodeURIComponent(discussionId)}/replies`, jsonRequest('POST', { content }));
}