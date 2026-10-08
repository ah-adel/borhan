from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Header, HTTPException, Query, status

from app.core.security import get_current_user
from app.schemas.common import ApiErrorResponse, ApiSuccessResponse, sanitize_text
from app.schemas.lms import (
    CourseDiscussionCreate,
    CourseDiscussionRead,
    DiscussionReplyCreate,
    DiscussionReplyRead,
    LeaderboardEntryRead,
    PointTransactionRead,
    QuizAttemptRead,
    QuizAttemptHistoryRead,
    QuizCreate,
    QuizQuestionCreate,
    QuizQuestionRead,
    QuizQuestionUpdate,
    QuizRead,
    QuizSubmit,
    QuizUpdate,
    StudentStatsRead,
    SubscriptionPlanCreate,
    SubscriptionPlanRead,
    SubscriptionPlanUpdate,
)
from app.services import lms_service

router = APIRouter()
MANAGER_ROLES = {"admin", "instructor"}
AUTHENTICATED_ROLES = {"student", "instructor", "admin"}


def _current_user(authorization: str | None) -> dict[str, Any]:
    user = get_current_user(authorization)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"error": "Authentication required."})
    return user


def _require_role(user: dict[str, Any], roles: set[str], message: str) -> None:
    if user.get("role") not in roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"error": message})


def _require_course_access(user: dict[str, Any], course_id: str) -> None:
    if not lms_service.course_is_accessible(user, course_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"error": "You do not have access to this course."})


def _require_quiz_access(user: dict[str, Any], quiz_id: str, *, management: bool = False) -> dict[str, Any]:
    quiz = lms_service.get_quiz(quiz_id)
    if quiz is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "Quiz not found."})
    if management:
        _require_role(user, MANAGER_ROLES, "Instructor or administrator access required.")
        course_id = lms_service.quiz_course_id(quiz_id)
        if user["role"] == "admin":
            return quiz
        if course_id is None or not lms_service.course_is_accessible(user, course_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"error": "You can only manage quizzes in your own courses."})
    elif user["role"] == "student":
        course_id = lms_service.quiz_course_id(quiz_id)
        if course_id is not None:
            _require_course_access(user, course_id)
    elif user["role"] == "instructor":
        course_id = lms_service.quiz_course_id(quiz_id)
        if course_id is None or not lms_service.course_is_accessible(user, course_id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"error": "You do not have access to this quiz."})
    elif user["role"] != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"error": "Authenticated access required."})
    return quiz


def _public_quiz(quiz: dict[str, Any], *, include_answers: bool) -> dict[str, Any]:
    if not include_answers:
        for question in quiz.get("questions", []):
            question["correct_answer"] = None
            question["explanation"] = None
    return quiz


def _require_question_manager(user: dict[str, Any], question_id: str) -> str:
    _require_role(user, MANAGER_ROLES, "Instructor or administrator access required.")
    quiz_id = lms_service.question_quiz_id(question_id)
    if quiz_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "Quiz question not found."})
    _require_quiz_access(user, quiz_id, management=True)
    return quiz_id


@router.get("/quizzes", response_model=ApiSuccessResponse[list[QuizRead]])
async def list_quizzes(authorization: str | None = Header(default=None, alias="Authorization")) -> ApiSuccessResponse[list[QuizRead]]:
    user = _current_user(authorization)
    _require_role(user, AUTHENTICATED_ROLES, "Authenticated access required.")
    quizzes = lms_service.list_quizzes(user)
    return ApiSuccessResponse(data=quizzes, message="Quizzes retrieved successfully.")


@router.post(
    "/quizzes",
    response_model=ApiSuccessResponse[QuizRead],
    status_code=status.HTTP_201_CREATED,
    responses={401: {"model": ApiErrorResponse}, 403: {"model": ApiErrorResponse}, 404: {"model": ApiErrorResponse}},
)
async def create_quiz(payload: QuizCreate, authorization: str | None = Header(default=None, alias="Authorization")) -> ApiSuccessResponse[QuizRead]:
    user = _current_user(authorization)
    _require_role(user, MANAGER_ROLES, "Instructor or administrator access required.")
    lesson_id = payload.lesson_id
    if lesson_id is not None:
        course_id = lms_service.lesson_course_id(lesson_id)
        if course_id is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "Lesson not found."})
        if user["role"] == "instructor":
            _require_course_access(user, course_id)
    elif user["role"] != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"error": "Instructor-created quizzes must be attached to a lesson in your course."})
    quiz = lms_service.create_quiz({**payload.model_dump(), "title": sanitize_text(payload.title, 255)})
    if quiz is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "Lesson not found."})
    return ApiSuccessResponse(data=quiz, message="Quiz created successfully.")


@router.get("/quizzes/{quiz_id}", response_model=ApiSuccessResponse[QuizRead])
async def get_quiz(quiz_id: str, authorization: str | None = Header(default=None, alias="Authorization")) -> ApiSuccessResponse[QuizRead]:
    user = _current_user(authorization)
    quiz = _require_quiz_access(user, quiz_id)
    return ApiSuccessResponse(data=_public_quiz(quiz, include_answers=user["role"] in MANAGER_ROLES), message="Quiz retrieved successfully.")


@router.patch("/quizzes/{quiz_id}", response_model=ApiSuccessResponse[QuizRead])
async def update_quiz(quiz_id: str, payload: QuizUpdate, authorization: str | None = Header(default=None, alias="Authorization")) -> ApiSuccessResponse[QuizRead]:
    user = _current_user(authorization)
    existing = _require_quiz_access(user, quiz_id, management=True)
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"error": "At least one field must be provided."})
    if any(value is None for key, value in updates.items() if key != "lesson_id"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail={"error": "Required quiz fields cannot be null."})
    if "title" in updates:
        updates["title"] = sanitize_text(updates["title"], 255)
    if "lesson_id" in updates:
        if updates["lesson_id"] is None and user["role"] != "admin":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"error": "Only administrators may detach a quiz from its lesson."})
        if updates["lesson_id"] is not None:
            course_id = lms_service.lesson_course_id(updates["lesson_id"])
            if course_id is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "Lesson not found."})
            if user["role"] == "instructor":
                _require_course_access(user, course_id)
    quiz = lms_service.update_quiz(quiz_id, updates)
    if quiz is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "Quiz or lesson not found."})
    return ApiSuccessResponse(data=quiz, message="Quiz updated successfully.")


@router.delete("/quizzes/{quiz_id}", response_model=ApiSuccessResponse[dict[str, bool]])
async def delete_quiz(quiz_id: str, authorization: str | None = Header(default=None, alias="Authorization")) -> ApiSuccessResponse[dict[str, bool]]:
    user = _current_user(authorization)
    _require_quiz_access(user, quiz_id, management=True)
    if not lms_service.delete_quiz(quiz_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "Quiz not found."})
    return ApiSuccessResponse(data={"deleted": True}, message="Quiz deleted successfully.")


@router.get("/quizzes/{quiz_id}/questions", response_model=ApiSuccessResponse[list[QuizQuestionRead]])
async def list_quiz_questions(quiz_id: str, authorization: str | None = Header(default=None, alias="Authorization")) -> ApiSuccessResponse[list[QuizQuestionRead]]:
    user = _current_user(authorization)
    quiz = _require_quiz_access(user, quiz_id)
    questions = quiz["questions"]
    if user["role"] not in MANAGER_ROLES:
        for question in questions:
            question["correct_answer"] = None
            question["explanation"] = None
    return ApiSuccessResponse(data=questions, message="Quiz questions retrieved successfully.")


@router.post("/quizzes/{quiz_id}/questions", response_model=ApiSuccessResponse[QuizQuestionRead], status_code=status.HTTP_201_CREATED)
async def create_quiz_question(quiz_id: str, payload: QuizQuestionCreate, authorization: str | None = Header(default=None, alias="Authorization")) -> ApiSuccessResponse[QuizQuestionRead]:
    user = _current_user(authorization)
    _require_quiz_access(user, quiz_id, management=True)
    values = payload.model_dump()
    values["question_text"] = sanitize_text(payload.question_text, 5000)
    if values["explanation"] is not None:
        values["explanation"] = sanitize_text(values["explanation"], 5000)
    question = lms_service.create_question(quiz_id, values)
    return ApiSuccessResponse(data=question, message="Quiz question created successfully.")


@router.patch("/quiz-questions/{question_id}", response_model=ApiSuccessResponse[QuizQuestionRead])
async def update_quiz_question(question_id: str, payload: QuizQuestionUpdate, authorization: str | None = Header(default=None, alias="Authorization")) -> ApiSuccessResponse[QuizQuestionRead]:
    user = _current_user(authorization)
    _require_question_manager(user, question_id)
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"error": "At least one field must be provided."})
    if any(value is None for key, value in updates.items() if key != "explanation"):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail={"error": "Required question fields cannot be null."})
    if "question_text" in updates:
        updates["question_text"] = sanitize_text(updates["question_text"], 5000)
    if "explanation" in updates and updates["explanation"] is not None:
        updates["explanation"] = sanitize_text(updates["explanation"], 5000)
    question = lms_service.update_question(question_id, updates)
    if question is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "Quiz question not found."})
    return ApiSuccessResponse(data=question, message="Quiz question updated successfully.")


@router.delete("/quiz-questions/{question_id}", response_model=ApiSuccessResponse[dict[str, bool]])
async def delete_quiz_question(question_id: str, authorization: str | None = Header(default=None, alias="Authorization")) -> ApiSuccessResponse[dict[str, bool]]:
    user = _current_user(authorization)
    _require_question_manager(user, question_id)
    if not lms_service.delete_question(question_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "Quiz question not found."})
    return ApiSuccessResponse(data={"deleted": True}, message="Quiz question deleted successfully.")


@router.post("/quizzes/{quiz_id}/submit", response_model=ApiSuccessResponse[QuizAttemptRead])
async def submit_quiz(quiz_id: str, payload: QuizSubmit, authorization: str | None = Header(default=None, alias="Authorization")) -> ApiSuccessResponse[QuizAttemptRead]:
    user = _current_user(authorization)
    _require_role(user, {"student"}, "Student access required.")
    quiz = _require_quiz_access(user, quiz_id)
    course_id = lms_service.quiz_course_id(quiz_id)
    if course_id is not None:
        _require_course_access(user, course_id)
    try:
        attempt = lms_service.submit_quiz(user["id"], quiz_id, payload.answers)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"error": str(exc)}) from exc
    if attempt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "Quiz not found."})
    return ApiSuccessResponse(data=attempt, message="Quiz submitted and evaluated successfully.")


@router.get("/quizzes/{quiz_id}/attempts/me", response_model=ApiSuccessResponse[list[QuizAttemptHistoryRead]])
async def get_my_quiz_attempts(
    quiz_id: str,
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> ApiSuccessResponse[list[QuizAttemptHistoryRead]]:
    user = _current_user(authorization)
    _require_role(user, {"student"}, "Student access required.")
    _require_quiz_access(user, quiz_id)
    attempts = lms_service.get_quiz_attempts(user["id"], quiz_id)
    return ApiSuccessResponse(data=attempts, message="Quiz attempt history retrieved successfully.")


@router.get("/gamification/me", response_model=ApiSuccessResponse[StudentStatsRead])
async def get_my_gamification_stats(
    limit: int = Query(default=50, ge=1, le=100),
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> ApiSuccessResponse[StudentStatsRead]:
    user = _current_user(authorization)
    _require_role(user, {"student"}, "Student access required.")
    stats = lms_service.get_student_stats(user["id"], limit)
    if stats is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "Student profile not found."})
    return ApiSuccessResponse(data=stats, message="Student gamification stats retrieved successfully.")


@router.get("/leaderboard", response_model=ApiSuccessResponse[list[LeaderboardEntryRead]])
async def leaderboard(
    limit: int = Query(default=20, ge=1, le=100),
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> ApiSuccessResponse[list[LeaderboardEntryRead]]:
    user = _current_user(authorization)
    _require_role(user, AUTHENTICATED_ROLES, "Authenticated access required.")
    return ApiSuccessResponse(data=lms_service.get_leaderboard(limit), message="Leaderboard retrieved successfully.")


@router.get("/subscription-plans", response_model=ApiSuccessResponse[list[SubscriptionPlanRead]])
async def get_subscription_plans(authorization: str | None = Header(default=None, alias="Authorization")) -> ApiSuccessResponse[list[SubscriptionPlanRead]]:
    user = _current_user(authorization)
    _require_role(user, AUTHENTICATED_ROLES, "Authenticated access required.")
    return ApiSuccessResponse(
        data=lms_service.list_subscription_plans(
            include_inactive=user["role"] in MANAGER_ROLES,
            creator_id=user["id"] if user["role"] == "instructor" else None,
        ),
        message="Subscription plans retrieved successfully.",
    )


@router.post("/subscription-plans", response_model=ApiSuccessResponse[SubscriptionPlanRead], status_code=status.HTTP_201_CREATED)
async def create_subscription_plan(payload: SubscriptionPlanCreate, authorization: str | None = Header(default=None, alias="Authorization")) -> ApiSuccessResponse[SubscriptionPlanRead]:
    user = _current_user(authorization)
    _require_role(user, MANAGER_ROLES, "Instructor or administrator access required.")
    values = payload.model_dump()
    values["name"] = sanitize_text(payload.name, 120)
    values["description"] = sanitize_text(payload.description, 1000)
    plan = lms_service.create_subscription_plan(user["id"], values)
    return ApiSuccessResponse(data=plan, message="Subscription plan created successfully.")


@router.patch("/subscription-plans/{plan_id}", response_model=ApiSuccessResponse[SubscriptionPlanRead])
async def update_subscription_plan(plan_id: str, payload: SubscriptionPlanUpdate, authorization: str | None = Header(default=None, alias="Authorization")) -> ApiSuccessResponse[SubscriptionPlanRead]:
    user = _current_user(authorization)
    _require_role(user, MANAGER_ROLES, "Instructor or administrator access required.")
    values = payload.model_dump(exclude_unset=True)
    if "name" in values:
        values["name"] = sanitize_text(values["name"], 120)
    if "description" in values:
        values["description"] = sanitize_text(values["description"], 1000)
    plan = lms_service.update_subscription_plan(plan_id, user["id"], user["role"] == "admin", values)
    if plan is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "Subscription plan not found or not manageable."})
    return ApiSuccessResponse(data=plan, message="Subscription plan updated successfully.")


@router.delete("/subscription-plans/{plan_id}", response_model=ApiSuccessResponse[dict[str, bool]])
async def delete_subscription_plan(plan_id: str, authorization: str | None = Header(default=None, alias="Authorization")) -> ApiSuccessResponse[dict[str, bool]]:
    user = _current_user(authorization)
    _require_role(user, MANAGER_ROLES, "Instructor or administrator access required.")
    deleted = lms_service.delete_subscription_plan(plan_id, user["id"], user["role"] == "admin")
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "Subscription plan not found or not manageable."})
    return ApiSuccessResponse(data={"deleted": True}, message="Subscription plan deleted successfully.")


@router.get("/courses/{course_id}/discussions", response_model=ApiSuccessResponse[list[CourseDiscussionRead]])
async def get_course_discussions(
    course_id: str,
    lesson_id: str | None = Query(default=None, min_length=1),
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> ApiSuccessResponse[list[CourseDiscussionRead]]:
    user = _current_user(authorization)
    _require_course_access(user, course_id)
    discussions = lms_service.list_course_discussions(course_id, lesson_id)
    return ApiSuccessResponse(data=discussions, message="Course discussions retrieved successfully.")


@router.post("/courses/{course_id}/discussions", response_model=ApiSuccessResponse[CourseDiscussionRead], status_code=status.HTTP_201_CREATED)
async def create_course_discussion(
    course_id: str,
    payload: CourseDiscussionCreate,
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> ApiSuccessResponse[CourseDiscussionRead]:
    user = _current_user(authorization)
    _require_course_access(user, course_id)
    values = payload.model_dump()
    values["title"] = sanitize_text(payload.title, 255)
    values["content"] = sanitize_text(payload.content, 10000)
    discussion = lms_service.create_course_discussion(course_id, user["id"], values)
    if discussion is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "Lesson not found in this course."})
    return ApiSuccessResponse(data=discussion, message="Discussion created successfully.")


@router.get("/discussions/{discussion_id}/replies", response_model=ApiSuccessResponse[list[DiscussionReplyRead]])
async def get_discussion_replies(discussion_id: str, authorization: str | None = Header(default=None, alias="Authorization")) -> ApiSuccessResponse[list[DiscussionReplyRead]]:
    user = _current_user(authorization)
    course_id = lms_service.discussion_course_id(discussion_id)
    if course_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "Discussion not found."})
    _require_course_access(user, course_id)
    return ApiSuccessResponse(data=lms_service.list_discussion_replies(discussion_id), message="Discussion replies retrieved successfully.")


@router.post("/discussions/{discussion_id}/replies", response_model=ApiSuccessResponse[DiscussionReplyRead], status_code=status.HTTP_201_CREATED)
async def create_discussion_reply(
    discussion_id: str,
    payload: DiscussionReplyCreate,
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> ApiSuccessResponse[DiscussionReplyRead]:
    user = _current_user(authorization)
    course_id = lms_service.discussion_course_id(discussion_id)
    if course_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "Discussion not found."})
    _require_course_access(user, course_id)
    reply = lms_service.create_discussion_reply(discussion_id, user["id"], sanitize_text(payload.content, 10000))
    return ApiSuccessResponse(data=reply, message="Discussion reply created successfully.")