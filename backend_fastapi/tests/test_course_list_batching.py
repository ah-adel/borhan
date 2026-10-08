from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from app import db


class FakeCursor:
    def __init__(self, connection: FakeConnection) -> None:
        self.connection = connection
        self.rows: list[dict[str, Any]] = []

    def __enter__(self) -> FakeCursor:
        return self

    def __exit__(self, exc_type, exc_value, traceback) -> bool:
        return False

    def execute(self, query: str, parameters: tuple[Any, ...] | None = None) -> None:
        self.connection.queries.append(query)
        if "FROM courses" in query:
            self.rows = self.connection.course_rows
        elif "FROM course_reviews cr" in query:
            self.rows = self.connection.review_rows
        elif "FROM course_modules cm" in query:
            self.rows = self.connection.module_rows
        elif "FROM enrollments" in query:
            self.rows = self.connection.enrollment_rows
        else:
            raise AssertionError(f"Unexpected course list query: {query}")

    def fetchall(self) -> list[dict[str, Any]]:
        return self.rows


class FakeConnection:
    def __init__(self) -> None:
        created_at = datetime(2026, 1, 2, tzinfo=timezone.utc)
        self.queries: list[str] = []
        self.course_rows = [
            {
                "id": "course-1",
                "instructor_id": "instructor-1",
                "title": "Published course",
                "description": "Course details",
                "thumbnail_url": None,
                "price": Decimal("9.99"),
                "category": "Science",
                "difficulty": "Intermediate",
                "ai_model": "Coach Pro",
                "is_featured": False,
                "is_published": True,
                "created_at": created_at,
                "updated_at": created_at,
                "status": "published",
            },
            {
                "id": "course-2",
                "instructor_id": "instructor-2",
                "title": "Course without details",
                "description": "",
                "thumbnail_url": None,
                "price": Decimal("0"),
                "category": "General",
                "difficulty": "Beginner",
                "ai_model": "Coach Pro",
                "is_featured": False,
                "is_published": True,
                "created_at": created_at,
                "updated_at": created_at,
                "status": "published",
            },
        ]
        self.review_rows = [{
            "id": "review-1",
            "course_id": "course-1",
            "student_id": "student-1",
            "rating": 5,
            "comment": "Excellent",
            "created_at": created_at,
            "user_name": None,
            "review_count": 2,
            "average_rating": Decimal("4.5"),
        }]
        self.module_rows = [
            {
                "module_id": "module-1",
                "module_course_id": "course-1",
                "module_title": "Module 1",
                "module_position": 0,
                "module_created_at": created_at,
                "lesson_id": "lesson-1",
                "lesson_module_id": "module-1",
                "lesson_title": "Lesson 1",
                "lesson_content": "Lesson content",
                "lesson_video_url": None,
                "lesson_video_name": None,
                "lesson_attachment_url": None,
                "lesson_attachment_name": None,
                "lesson_position": 0,
                "lesson_duration_minutes": 1,
                "lesson_duration_seconds": 13,
                "lesson_created_at": created_at,
            },
            {
                "module_id": "module-2",
                "module_course_id": "course-2",
                "module_title": "Empty module",
                "module_position": 0,
                "module_created_at": created_at,
                "lesson_id": None,
                "lesson_module_id": None,
                "lesson_title": None,
                "lesson_content": None,
                "lesson_video_url": None,
                "lesson_video_name": None,
                "lesson_attachment_url": None,
                "lesson_attachment_name": None,
                "lesson_position": None,
                "lesson_duration_minutes": None,
                "lesson_duration_seconds": None,
                "lesson_created_at": None,
            },
        ]
        self.enrollment_rows = [{"course_id": "course-1", "enrollment_count": 2}]

    def __enter__(self) -> FakeConnection:
        return self

    def __exit__(self, exc_type, exc_value, traceback) -> bool:
        return False

    def cursor(self, cursor_factory=None) -> FakeCursor:
        return FakeCursor(self)


def test_public_course_list_batches_enrichment_without_changing_payload(monkeypatch) -> None:
    connection = FakeConnection()
    monkeypatch.setattr(db, "get_connection", lambda: connection)

    courses = db.get_public_courses()

    assert len(connection.queries) == 4
    assert [course["id"] for course in courses] == ["course-1", "course-2"]
    first = courses[0]
    assert first["review_count"] == 2
    assert first["average_rating"] == 4.5
    assert first["reviews"] == [{
        "id": "review-1",
        "course_id": "course-1",
        "student_id": "student-1",
        "user_id": "student-1",
        "user_name": "Student",
        "userName": "Student",
        "rating": 5,
        "comment": "Excellent",
        "created_at": connection.course_rows[0]["created_at"],
        "createdAt": connection.course_rows[0]["created_at"],
    }]
    assert first["modules"][0]["lessons"][0]["duration_seconds"] == 13
    assert first["enrollment_count"] == 2
    assert courses[1]["review_count"] == 0
    assert courses[1]["average_rating"] == 0.0
    assert courses[1]["reviews"] == []
    assert courses[1]["modules"][0]["lessons"] == []
    assert courses[1]["enrollment_count"] == 0