from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from psycopg2.extras import Json, RealDictCursor

from app.db import get_connection


def _all(cursor: Any) -> list[dict[str, Any]]:
    return [dict(row) for row in cursor.fetchall()]


def course_is_accessible(user: dict[str, Any], course_id: str) -> bool:
    role = user.get("role")
    user_id = user.get("id")
    with get_connection() as connection:
        with connection.cursor() as cursor:
            if role == "admin":
                cursor.execute("SELECT 1 FROM courses WHERE id = %s", (course_id,))
            elif role == "instructor":
                cursor.execute("SELECT 1 FROM courses WHERE id = %s AND instructor_id = %s", (course_id, user_id))
            elif role == "student":
                cursor.execute(
                    "SELECT 1 FROM enrollments WHERE course_id = %s AND student_id = %s",
                    (course_id, user_id),
                )
            else:
                return False
            return cursor.fetchone() is not None


def lesson_course_id(lesson_id: str) -> str | None:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT course_id FROM course_modules JOIN lessons ON lessons.module_id = course_modules.id WHERE lessons.id = %s",
                (lesson_id,),
            )
            row = cursor.fetchone()
    return str(row[0]) if row else None


def quiz_course_id(quiz_id: str) -> str | None:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT course_modules.course_id FROM quizzes JOIN lessons ON lessons.id = quizzes.lesson_id JOIN course_modules ON course_modules.id = lessons.module_id WHERE quizzes.id = %s",
                (quiz_id,),
            )
            row = cursor.fetchone()
    return str(row[0]) if row else None


def question_quiz_id(question_id: str) -> str | None:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT quiz_id FROM quiz_questions WHERE id = %s", (question_id,))
            row = cursor.fetchone()
    return str(row[0]) if row else None


def discussion_course_id(discussion_id: str) -> str | None:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT course_id FROM course_discussions WHERE id = %s", (discussion_id,))
            row = cursor.fetchone()
    return str(row[0]) if row else None


def list_quizzes(user: dict[str, Any]) -> list[dict[str, Any]]:
    query = "SELECT q.*, (SELECT COUNT(*) FROM quiz_questions qq WHERE qq.quiz_id = q.id) AS question_count FROM quizzes q"
    parameters: tuple[Any, ...] = ()
    if user["role"] == "instructor":
        query += " JOIN lessons l ON l.id = q.lesson_id JOIN course_modules cm ON cm.id = l.module_id WHERE cm.course_id IN (SELECT id FROM courses WHERE instructor_id = %s)"
        parameters = (user["id"],)
    elif user["role"] == "student":
        query += " WHERE EXISTS (SELECT 1 FROM lessons l JOIN course_modules cm ON cm.id = l.module_id JOIN enrollments e ON e.course_id = cm.course_id WHERE l.id = q.lesson_id AND e.student_id = %s)"
        parameters = (user["id"],)
    query += " ORDER BY q.created_at DESC, q.id"
    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(query, parameters)
            return _all(cursor)


def get_quiz(quiz_id: str) -> dict[str, Any] | None:
    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("SELECT * FROM quizzes WHERE id = %s", (quiz_id,))
            quiz = cursor.fetchone()
            if quiz is None:
                return None
            cursor.execute("SELECT * FROM quiz_questions WHERE quiz_id = %s ORDER BY id", (quiz_id,))
            result = dict(quiz)
            result["questions"] = _all(cursor)
            return result


def create_quiz(payload: dict[str, Any]) -> dict[str, Any] | None:
    quiz_id = str(uuid.uuid4())
    with get_connection() as connection:
        with connection.cursor() as cursor:
            if payload["lesson_id"] is not None:
                cursor.execute("SELECT 1 FROM lessons WHERE id = %s", (payload["lesson_id"],))
                if cursor.fetchone() is None:
                    return None
            cursor.execute(
                "INSERT INTO quizzes (id, lesson_id, title, time_limit_minutes, passing_score) VALUES (%s, %s, %s, %s, %s)",
                (quiz_id, payload["lesson_id"], payload["title"], payload["time_limit_minutes"], payload["passing_score"]),
            )
        connection.commit()
    return get_quiz(quiz_id)


def update_quiz(quiz_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
    if not updates:
        return get_quiz(quiz_id)
    columns = ", ".join(f"{column} = %s" for column in updates)
    values = tuple(updates.values()) + (quiz_id,)
    with get_connection() as connection:
        with connection.cursor() as cursor:
            if "lesson_id" in updates and updates["lesson_id"] is not None:
                cursor.execute("SELECT 1 FROM lessons WHERE id = %s", (updates["lesson_id"],))
                if cursor.fetchone() is None:
                    return None
            cursor.execute(f"UPDATE quizzes SET {columns} WHERE id = %s", values)
            if cursor.rowcount == 0:
                return None
        connection.commit()
    return get_quiz(quiz_id)


def delete_quiz(quiz_id: str) -> bool:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM quizzes WHERE id = %s", (quiz_id,))
            deleted = cursor.rowcount > 0
        connection.commit()
    return deleted


def create_question(quiz_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    question_id = str(uuid.uuid4())
    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                "INSERT INTO quiz_questions (id, quiz_id, question_text, question_type, options, correct_answer, explanation, points) VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING *",
                (question_id, quiz_id, payload["question_text"], payload["question_type"], Json(payload["options"]), Json(payload["correct_answer"]), payload["explanation"], payload["points"]),
            )
            question = dict(cursor.fetchone())
        connection.commit()
    return question


def update_question(question_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
    if not updates:
        with get_connection() as connection:
            with connection.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute("SELECT * FROM quiz_questions WHERE id = %s", (question_id,))
                row = cursor.fetchone()
                return dict(row) if row else None

    json_columns = {"options", "correct_answer"}
    columns = ", ".join(f"{column} = %s" for column in updates)
    values = tuple(Json(value) if column in json_columns else value for column, value in updates.items()) + (question_id,)
    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(f"UPDATE quiz_questions SET {columns} WHERE id = %s RETURNING *", values)
            row = cursor.fetchone()
            question = dict(row) if row else None
        connection.commit()
    return question


def delete_question(question_id: str) -> bool:
    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM quiz_questions WHERE id = %s", (question_id,))
            deleted = cursor.rowcount > 0
        connection.commit()
    return deleted


def _answer_matches(question_type: str, expected: Any, submitted: Any) -> bool:
    normalized_type = question_type.strip().lower().replace("-", "_")
    if normalized_type in {"text", "short_answer", "free_text"} and isinstance(expected, str) and isinstance(submitted, str):
        return expected.strip().casefold() == submitted.strip().casefold()
    if normalized_type in {"multiple_select", "multi_select", "checkbox"} and isinstance(expected, list) and isinstance(submitted, list):
        return sorted(json.dumps(item, sort_keys=True) for item in expected) == sorted(json.dumps(item, sort_keys=True) for item in submitted)
    return expected == submitted


def submit_quiz(student_id: str, quiz_id: str, answers: dict[str, Any]) -> dict[str, Any] | None:
    attempt_id = str(uuid.uuid4())
    today = datetime.now(timezone.utc).date()
    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("SELECT passing_score FROM quizzes WHERE id = %s", (quiz_id,))
            quiz = cursor.fetchone()
            if quiz is None:
                return None
            cursor.execute("SELECT id, question_type, correct_answer, points FROM quiz_questions WHERE quiz_id = %s", (quiz_id,))
            questions = _all(cursor)
            if not questions:
                raise ValueError("This quiz has no questions yet.")
            question_ids = {question["id"] for question in questions}
            unknown_answers = set(answers) - question_ids
            if unknown_answers:
                raise ValueError("Answers contain question IDs that do not belong to this quiz.")

            score = sum(
                (Decimal(str(question["points"])) for question in questions if _answer_matches(
                    question["question_type"], question["correct_answer"], answers.get(question["id"])
                )),
                Decimal("0"),
            )
            total_points = sum((Decimal(str(question["points"])) for question in questions), Decimal("0"))
            passing_score = Decimal(str(quiz["passing_score"]))
            passed = total_points > 0 and (score * Decimal("100") / total_points) >= passing_score

            cursor.execute("SELECT points, current_streak FROM profiles WHERE id = %s FOR UPDATE", (student_id,))
            profile = cursor.fetchone()
            if profile is None:
                return None
            cursor.execute("SELECT 1 FROM quiz_attempts WHERE student_id = %s AND quiz_id = %s LIMIT 1", (student_id, quiz_id))
            first_attempt = cursor.fetchone() is None
            points_awarded = int(score.to_integral_value(rounding=ROUND_HALF_UP)) if first_attempt else 0
            cursor.execute("SELECT MAX(created_at)::date AS last_activity FROM point_transactions WHERE student_id = %s", (student_id,))
            last_activity = cursor.fetchone()["last_activity"]
            current_streak = int(profile["current_streak"] or 0)
            if last_activity == today:
                new_streak = max(current_streak, 1)
            elif last_activity == today - timedelta(days=1):
                new_streak = current_streak + 1
            else:
                new_streak = 1

            cursor.execute(
                "INSERT INTO quiz_attempts (id, student_id, quiz_id, score, total_points, passed, answers) VALUES (%s, %s, %s, %s, %s, %s, %s)",
                (attempt_id, student_id, quiz_id, score, total_points, passed, Json(answers)),
            )
            cursor.execute(
                "INSERT INTO point_transactions (id, student_id, points, action_type, reference_id) VALUES (%s, %s, %s, %s, %s)",
                (str(uuid.uuid4()), student_id, points_awarded, "quiz_attempt", quiz_id),
            )
            cursor.execute(
                "UPDATE profiles SET points = points + %s, current_streak = %s WHERE id = %s",
                (points_awarded, new_streak, student_id),
            )
            cursor.execute("SELECT * FROM quiz_attempts WHERE id = %s", (attempt_id,))
            attempt = dict(cursor.fetchone())
            attempt["points_awarded"] = points_awarded
            attempt["current_streak"] = new_streak
        connection.commit()
    return attempt


def get_student_stats(student_id: str, limit: int) -> dict[str, Any] | None:
    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("SELECT points, current_streak FROM profiles WHERE id = %s", (student_id,))
            profile = cursor.fetchone()
            if profile is None:
                return None
            cursor.execute(
                "SELECT id, points, action_type, reference_id, created_at FROM point_transactions WHERE student_id = %s ORDER BY created_at DESC, id DESC LIMIT %s",
                (student_id, limit),
            )
            return {
                "student_id": student_id,
                "points": profile["points"],
                "current_streak": profile["current_streak"],
                "transactions": _all(cursor),
            }


def get_quiz_attempts(student_id: str, quiz_id: str) -> list[dict[str, Any]]:
    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                "SELECT id, student_id, quiz_id, score, total_points, passed, answers, attempted_at FROM quiz_attempts WHERE student_id = %s AND quiz_id = %s ORDER BY attempted_at DESC, id DESC",
                (student_id, quiz_id),
            )
            return _all(cursor)


def get_leaderboard(limit: int) -> list[dict[str, Any]]:
    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                "WITH ranked AS (SELECT ROW_NUMBER() OVER (ORDER BY p.points DESC, p.full_name ASC, p.id ASC) AS rank, p.id AS student_id, p.full_name, p.points, p.current_streak FROM profiles p WHERE p.role = 'student') SELECT * FROM ranked ORDER BY rank LIMIT %s",
                (limit,),
            )
            return _all(cursor)


def get_active_subscriptions(student_id: str) -> list[dict[str, Any]]:
    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                "SELECT * FROM subscriptions WHERE student_id = %s AND status = 'active' AND start_date <= CURRENT_TIMESTAMP AND end_date >= CURRENT_TIMESTAMP ORDER BY end_date, created_at DESC",
                (student_id,),
            )
            return _all(cursor)


def create_subscription(student_id: str, plan_name: str, price: Decimal, duration_days: int) -> dict[str, Any]:
    subscription_id = str(uuid.uuid4())
    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute("UPDATE subscriptions SET status = 'renewed' WHERE student_id = %s AND status = 'active'", (student_id,))
            cursor.execute(
                "INSERT INTO subscriptions (id, student_id, plan_name, price, duration_days, start_date, end_date, status) VALUES (%s, %s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + (%s * INTERVAL '1 day'), 'active') RETURNING *",
                (subscription_id, student_id, plan_name, price, duration_days, duration_days),
            )
            result = dict(cursor.fetchone())
        connection.commit()
    return result


def list_course_discussions(course_id: str, lesson_id: str | None) -> list[dict[str, Any]]:
    query = "SELECT d.*, p.full_name AS user_name FROM course_discussions d JOIN profiles p ON p.id = d.user_id WHERE d.course_id = %s"
    parameters: tuple[Any, ...] = (course_id,)
    if lesson_id is not None:
        query += " AND d.lesson_id = %s"
        parameters += (lesson_id,)
    query += " ORDER BY d.created_at DESC, d.id"
    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(query, parameters)
            return _all(cursor)


def create_course_discussion(course_id: str, user_id: str, payload: dict[str, Any]) -> dict[str, Any] | None:
    discussion_id = str(uuid.uuid4())
    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            if payload["lesson_id"] is not None:
                cursor.execute("SELECT 1 FROM lessons l JOIN course_modules cm ON cm.id = l.module_id WHERE l.id = %s AND cm.course_id = %s", (payload["lesson_id"], course_id))
                if cursor.fetchone() is None:
                    return None
            cursor.execute(
                "INSERT INTO course_discussions (id, course_id, lesson_id, user_id, title, content) VALUES (%s, %s, %s, %s, %s, %s) RETURNING *",
                (discussion_id, course_id, payload["lesson_id"], user_id, payload["title"], payload["content"]),
            )
            result = dict(cursor.fetchone())
            cursor.execute("SELECT full_name FROM profiles WHERE id = %s", (user_id,))
            result["user_name"] = cursor.fetchone()["full_name"]
        connection.commit()
    return result


def list_discussion_replies(discussion_id: str) -> list[dict[str, Any]]:
    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                "SELECT r.*, p.full_name AS user_name FROM discussion_replies r JOIN profiles p ON p.id = r.user_id WHERE r.discussion_id = %s ORDER BY r.created_at, r.id",
                (discussion_id,),
            )
            return _all(cursor)


def create_discussion_reply(discussion_id: str, user_id: str, content: str) -> dict[str, Any]:
    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(
                "INSERT INTO discussion_replies (id, discussion_id, user_id, content) VALUES (%s, %s, %s, %s) RETURNING *",
                (str(uuid.uuid4()), discussion_id, user_id, content),
            )
            result = dict(cursor.fetchone())
            cursor.execute("SELECT full_name FROM profiles WHERE id = %s", (user_id,))
            result["user_name"] = cursor.fetchone()["full_name"]
        connection.commit()
    return result