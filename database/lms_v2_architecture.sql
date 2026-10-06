ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS current_streak INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS quizzes (
  id TEXT PRIMARY KEY,
  lesson_id TEXT REFERENCES lessons(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  time_limit_minutes INTEGER NOT NULL DEFAULT 0,
  passing_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS quiz_questions (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_answer JSONB NOT NULL,
  explanation TEXT,
  points NUMERIC(8, 2) NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  score NUMERIC(8, 2) NOT NULL DEFAULT 0,
  total_points NUMERIC(8, 2) NOT NULL DEFAULT 0,
  passed BOOLEAN NOT NULL DEFAULT FALSE,
  answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS point_transactions (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  points INTEGER NOT NULL,
  action_type TEXT NOT NULL,
  reference_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan_name TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL,
  duration_days INTEGER NOT NULL,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS course_discussions (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id TEXT REFERENCES lessons(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS discussion_replies (
  id TEXT PRIMARY KEY,
  discussion_id TEXT NOT NULL REFERENCES course_discussions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_quizzes_lesson_id
  ON quizzes(lesson_id);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz_id
  ON quiz_questions(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_student_id
  ON quiz_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_quiz_id
  ON quiz_attempts(quiz_id);
CREATE INDEX IF NOT EXISTS idx_point_transactions_student_id
  ON point_transactions(student_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_student_id
  ON subscriptions(student_id);
CREATE INDEX IF NOT EXISTS idx_course_discussions_course_id
  ON course_discussions(course_id);
CREATE INDEX IF NOT EXISTS idx_course_discussions_lesson_id
  ON course_discussions(lesson_id);
CREATE INDEX IF NOT EXISTS idx_course_discussions_user_id
  ON course_discussions(user_id);
CREATE INDEX IF NOT EXISTS idx_discussion_replies_discussion_id
  ON discussion_replies(discussion_id);
CREATE INDEX IF NOT EXISTS idx_discussion_replies_user_id
  ON discussion_replies(user_id);

