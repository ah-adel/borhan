export type DecimalValue = number | string;

export type QuizQuestion = {
  id: string;
  quiz_id: string;
  question_text: string;
  question_type: 'single_choice' | 'multiple_select' | 'text' | string;
  options: unknown[];
  correct_answer?: unknown | null;
  explanation?: string | null;
  points: DecimalValue;
};

export type Quiz = {
  id: string;
  lesson_id: string | null;
  title: string;
  time_limit_minutes: number;
  passing_score: DecimalValue;
  created_at: string;
  question_count?: number;
  questions?: QuizQuestion[];
};

export type QuizAttempt = {
  id: string;
  student_id: string;
  quiz_id: string;
  score: DecimalValue;
  total_points: DecimalValue;
  passed: boolean;
  answers: Record<string, unknown>;
  attempted_at: string;
  points_awarded?: number;
  current_streak?: number;
};

export type PointTransaction = {
  id: string;
  points: number;
  action_type: string;
  reference_id: string | null;
  created_at: string;
};

export type StudentGamificationStats = {
  student_id: string;
  points: number;
  current_streak: number;
  transactions: PointTransaction[];
};

export type LeaderboardEntry = {
  rank: number;
  student_id: string;
  full_name: string;
  points: number;
  current_streak: number;
};

export type SubscriptionPlan = {
  id: string;
  name: string;
  description: string;
  price: DecimalValue;
  duration_days: number | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CourseDiscussion = {
  id: string;
  course_id: string;
  lesson_id: string | null;
  user_id: string;
  user_name: string;
  title: string;
  content: string;
  created_at: string;
};

export type DiscussionReply = {
  id: string;
  discussion_id: string;
  user_id: string;
  user_name: string;
  content: string;
  created_at: string;
};

export type QuizQuestionInput = {
  question_text: string;
  question_type: QuizQuestion['question_type'];
  options: unknown[];
  correct_answer: unknown;
  explanation?: string | null;
  points: number;
};

export type QuizInput = {
  lesson_id: string | null;
  title: string;
  time_limit_minutes: number;
  passing_score: number;
};

export type CourseDiscussionInput = {
  lesson_id: string | null;
  title: string;
  content: string;
};