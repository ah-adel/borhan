from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import Field

from app.schemas.common import BaseSchema


class QuizCreate(BaseSchema):
    lesson_id: str | None = Field(default=None, min_length=1)
    title: str = Field(..., min_length=1, max_length=255)
    time_limit_minutes: int = Field(default=0, ge=0)
    passing_score: Decimal = Field(default=Decimal("0"), ge=0, le=100, description="Passing threshold as a percentage of total points.")


class QuizUpdate(BaseSchema):
    lesson_id: str | None = Field(default=None, min_length=1)
    title: str | None = Field(default=None, min_length=1, max_length=255)
    time_limit_minutes: int | None = Field(default=None, ge=0)
    passing_score: Decimal | None = Field(default=None, ge=0, le=100)


class QuizQuestionCreate(BaseSchema):
    question_text: str = Field(..., min_length=1, max_length=5000)
    question_type: str = Field(..., min_length=1, max_length=50)
    options: list[Any] = Field(default_factory=list)
    correct_answer: Any
    explanation: str | None = Field(default=None, max_length=5000)
    points: Decimal = Field(default=Decimal("1"), gt=0, le=999999.99)


class QuizQuestionUpdate(BaseSchema):
    question_text: str | None = Field(default=None, min_length=1, max_length=5000)
    question_type: str | None = Field(default=None, min_length=1, max_length=50)
    options: list[Any] | None = None
    correct_answer: Any | None = None
    explanation: str | None = Field(default=None, max_length=5000)
    points: Decimal | None = Field(default=None, gt=0, le=999999.99)


class QuizQuestionRead(BaseSchema):
    id: str
    quiz_id: str
    question_text: str
    question_type: str
    options: list[Any]
    correct_answer: Any | None = None
    explanation: str | None = None
    points: Decimal


class QuizRead(BaseSchema):
    id: str
    lesson_id: str | None
    title: str
    time_limit_minutes: int
    passing_score: Decimal
    created_at: datetime
    question_count: int = 0
    questions: list[QuizQuestionRead] = Field(default_factory=list)


class QuizSubmit(BaseSchema):
    answers: dict[str, Any] = Field(default_factory=dict)


class QuizAttemptRead(BaseSchema):
    id: str
    student_id: str
    quiz_id: str
    score: Decimal
    total_points: Decimal
    passed: bool
    answers: dict[str, Any]
    attempted_at: datetime
    points_awarded: int
    current_streak: int


class QuizAttemptHistoryRead(BaseSchema):
    id: str
    student_id: str
    quiz_id: str
    score: Decimal
    total_points: Decimal
    passed: bool
    answers: dict[str, Any]
    attempted_at: datetime


class PointTransactionRead(BaseSchema):
    id: str
    points: int
    action_type: str
    reference_id: str | None
    created_at: datetime


class StudentStatsRead(BaseSchema):
    student_id: str
    points: int
    current_streak: int
    transactions: list[PointTransactionRead]


class LeaderboardEntryRead(BaseSchema):
    rank: int
    student_id: str
    full_name: str
    points: int
    current_streak: int


class SubscriptionCreate(BaseSchema):
    plan_name: str = Field(..., min_length=1, max_length=120)
    price: Decimal = Field(..., ge=0, le=99999999.99)
    duration_days: int = Field(..., ge=1, le=36500)


class SubscriptionRead(BaseSchema):
    id: str
    student_id: str
    plan_name: str
    price: Decimal
    duration_days: int
    start_date: datetime
    end_date: datetime
    status: str
    created_at: datetime


class CourseDiscussionCreate(BaseSchema):
    lesson_id: str | None = Field(default=None, min_length=1)
    title: str = Field(..., min_length=1, max_length=255)
    content: str = Field(..., min_length=1, max_length=10000)


class DiscussionReplyCreate(BaseSchema):
    content: str = Field(..., min_length=1, max_length=10000)


class DiscussionReplyRead(BaseSchema):
    id: str
    discussion_id: str
    user_id: str
    user_name: str
    content: str
    created_at: datetime


class CourseDiscussionRead(BaseSchema):
    id: str
    course_id: str
    lesson_id: str | None
    user_id: str
    user_name: str
    title: str
    content: str
    created_at: datetime