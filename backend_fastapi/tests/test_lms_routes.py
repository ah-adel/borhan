from __future__ import annotations

import uuid

from fastapi.testclient import TestClient

from app import db
from app.main import app

client = TestClient(app)


def _signup(role: str, label: str) -> tuple[str, str]:
    response = client.post(
        "/api/auth/sign-up",
        json={
            "email": f"lms-{label}-{uuid.uuid4().hex}@example.com",
            "password": "pass1234",
            "full_name": f"LMS {label.title()}",
            "role": role,
        },
    )
    assert response.status_code == 201, response.text
    data = response.json()["data"]
    return data["user"]["id"], data["session"]["access_token"]


def test_lms_quiz_gamification_subscription_and_discussion_workflow() -> None:
    instructor_id = student_id = None
    try:
        instructor_id, instructor_token = _signup("instructor", "instructor")
        student_id, student_token = _signup("student", "student")
        instructor_headers = {"Authorization": f"Bearer {instructor_token}"}
        student_headers = {"Authorization": f"Bearer {student_token}"}

        assert client.get("/api/gamification/me").status_code == 401

        course_response = client.post(
            "/api/courses",
            headers=instructor_headers,
            json={
                "title": "LMS integration course",
                "description": "Course used to verify LMS endpoints.",
                "status": "published",
                "is_published": True,
                "modules": [{"title": "Module", "lessons": [{"title": "Lesson"}]}],
            },
        )
        assert course_response.status_code == 201, course_response.text
        course = course_response.json()["data"]
        lesson_id = course["modules"][0]["lessons"][0]["id"]

        quiz_response = client.post(
            "/api/quizzes",
            headers=instructor_headers,
            json={"lesson_id": lesson_id, "title": "Lesson quiz", "passing_score": 80},
        )
        assert quiz_response.status_code == 201, quiz_response.text
        quiz_id = quiz_response.json()["data"]["id"]
        assert client.post(
            f"/api/quizzes/{quiz_id}/questions",
            headers=student_headers,
            json={"question_text": "Denied", "question_type": "text", "correct_answer": "x"},
        ).status_code == 403

        question_response = client.post(
            f"/api/quizzes/{quiz_id}/questions",
            headers=instructor_headers,
            json={
                "question_text": "What is two plus two?",
                "question_type": "text",
                "options": [],
                "correct_answer": "4",
                "explanation": "Basic arithmetic.",
                "points": 3,
            },
        )
        assert question_response.status_code == 201, question_response.text
        question_id = question_response.json()["data"]["id"]

        updated_question = client.patch(
            f"/api/quiz-questions/{question_id}",
            headers=instructor_headers,
            json={"explanation": "Four is the answer."},
        )
        assert updated_question.status_code == 200, updated_question.text

        enrollment = client.post(f"/api/courses/{course['id']}/enroll", headers=student_headers)
        assert enrollment.status_code == 200, enrollment.text
        student_quiz = client.get(f"/api/quizzes/{quiz_id}", headers=student_headers)
        assert student_quiz.status_code == 200, student_quiz.text
        assert student_quiz.json()["data"]["questions"][0]["correct_answer"] is None
        assert student_quiz.json()["data"]["questions"][0]["explanation"] is None

        submission = client.post(
            f"/api/quizzes/{quiz_id}/submit",
            headers=student_headers,
            json={"answers": {question_id: " 4 "}},
        )
        assert submission.status_code == 200, submission.text
        attempt = submission.json()["data"]
        assert float(attempt["score"]) == 3
        assert attempt["passed"] is True
        assert attempt["points_awarded"] == 3
        assert attempt["current_streak"] == 1
        assert client.post(f"/api/quizzes/{quiz_id}/submit", headers=instructor_headers, json={"answers": {}}).status_code == 403
        repeated_attempt = client.post(
            f"/api/quizzes/{quiz_id}/submit",
            headers=student_headers,
            json={"answers": {question_id: "4"}},
        )
        assert repeated_attempt.status_code == 200, repeated_attempt.text
        assert repeated_attempt.json()["data"]["points_awarded"] == 0
        history = client.get(f"/api/quizzes/{quiz_id}/attempts/me", headers=student_headers)
        assert history.status_code == 200, history.text
        assert len(history.json()["data"]) == 2

        stats = client.get("/api/gamification/me", headers=student_headers)
        assert stats.status_code == 200, stats.text
        assert stats.json()["data"]["points"] == 3
        assert stats.json()["data"]["transactions"][0]["action_type"] == "quiz_attempt"
        leaderboard = client.get("/api/leaderboard", headers=student_headers)
        assert leaderboard.status_code == 200, leaderboard.text
        assert any(entry["student_id"] == student_id and entry["points"] == 3 for entry in leaderboard.json()["data"])

        student_plans = client.get("/api/subscription-plans", headers=student_headers)
        assert student_plans.status_code == 200, student_plans.text
        assert [plan["id"] for plan in student_plans.json()["data"]] == ["free-plan"]
        assert client.get("/api/subscriptions/me", headers=student_headers).status_code == 404
        assert client.post(
            "/api/subscription-plans",
            headers=student_headers,
            json={"name": "Blocked", "description": "", "price": 10, "duration_days": 30},
        ).status_code == 403
        assert client.post(
            "/api/subscriptions",
            headers=student_headers,
            json={"plan_name": "Blocked", "price": 10, "duration_days": 30},
        ).status_code == 404

        created_plan = client.post(
            "/api/subscription-plans",
            headers=instructor_headers,
            json={"name": "Monthly", "description": "Monthly access", "price": 9.99, "duration_days": 30},
        )
        assert created_plan.status_code == 201, created_plan.text
        plan_id = created_plan.json()["data"]["id"]
        assert len(client.get("/api/subscription-plans", headers=student_headers).json()["data"]) == 2
        deactivated = client.patch(
            f"/api/subscription-plans/{plan_id}",
            headers=instructor_headers,
            json={"is_active": False},
        )
        assert deactivated.status_code == 200, deactivated.text
        assert [plan["id"] for plan in client.get("/api/subscription-plans", headers=student_headers).json()["data"]] == ["free-plan"]
        assert client.delete(f"/api/subscription-plans/{plan_id}", headers=instructor_headers).status_code == 200

        discussion = client.post(
            f"/api/courses/{course['id']}/discussions",
            headers=student_headers,
            json={"lesson_id": lesson_id, "title": "Question", "content": "How does this work?"},
        )
        assert discussion.status_code == 201, discussion.text
        discussion_id = discussion.json()["data"]["id"]
        threads = client.get(f"/api/courses/{course['id']}/discussions?lesson_id={lesson_id}", headers=student_headers)
        assert threads.status_code == 200, threads.text
        assert any(thread["id"] == discussion_id for thread in threads.json()["data"])
        reply = client.post(
            f"/api/discussions/{discussion_id}/replies",
            headers=instructor_headers,
            json={"content": "Here is an explanation."},
        )
        assert reply.status_code == 201, reply.text
        replies = client.get(f"/api/discussions/{discussion_id}/replies", headers=student_headers)
        assert replies.status_code == 200, replies.text
        assert len(replies.json()["data"]) == 1

        renamed = client.patch(f"/api/quizzes/{quiz_id}", headers=instructor_headers, json={"title": "Updated quiz"})
        assert renamed.status_code == 200, renamed.text
        assert renamed.json()["data"]["title"] == "Updated quiz"
        assert client.delete(f"/api/quiz-questions/{question_id}", headers=instructor_headers).status_code == 200
        assert client.delete(f"/api/quizzes/{quiz_id}", headers=instructor_headers).status_code == 200
    finally:
        user_ids = [user_id for user_id in (instructor_id, student_id) if user_id]
        if user_ids:
            with db.get_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute("DELETE FROM users WHERE id = ANY(%s)", (user_ids,))
                connection.commit()