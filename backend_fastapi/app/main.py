import logging
import os
from typing import Any

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import db
from app.api.routes.admin import router as admin_router
from app.api.routes.auth import router as auth_router
from app.api.routes.courses import router as courses_router
from app.api.routes.items import router as items_router
from app.api.routes.lms import router as lms_router
from app.api.routes.media import router as media_router
from app.api.v1.ai import router as ai_router
from app.core.config import settings
from app.schemas.common import ApiSuccessResponse

logger = logging.getLogger("app.main")
logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="Borhan application API.",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://172.29.160.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        *[
            origin.strip().rstrip("/")
            for origin in os.getenv("CORS_ALLOWED_ORIGINS", "").split(",")
            if origin.strip()
        ],
    ],
    allow_origin_regex=r"(?:https?://172\.29\.\d{1,3}\.\d{1,3}(?::\d+)?|https://frontend-[a-z0-9-]+\.vercel\.app)$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    detail = exc.detail
    payload: dict[str, Any] = {"success": False, "error": "Request failed."}

    if isinstance(detail, dict):
        payload["error"] = detail.get("error") or payload["error"]
        payload["details"] = detail.get("details")
        if isinstance(detail.get("code"), str):
            payload["code"] = detail["code"]
    elif isinstance(detail, str):
        payload["error"] = detail
    else:
        payload["details"] = detail

    logger.warning(
        "HTTP exception for %s %s -> status=%s detail=%s",
        request.method,
        request.url.path,
        exc.status_code,
        detail,
    )
    return JSONResponse(status_code=exc.status_code, content=payload, headers=exc.headers)


@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    details = []
    for item in exc.errors():
        location = ".".join(str(part) for part in item.get("loc", ()) if part not in {"body", "query", "path"})
        details.append({"field": location or "request", "message": str(item.get("msg", "Invalid value."))})
    message = "; ".join(
        f"{item['field']}: {item['message']}" for item in details
    ) or "Request validation failed."
    logger.warning("Request validation failed for %s %s: %s", request.method, request.url.path, message)
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"success": False, "error": message, "details": details},
    )


@app.get("/", tags=["meta"])
async def root() -> dict[str, str]:
    return {"service": settings.app_name, "status": "ok"}


@app.get("/health", response_model=ApiSuccessResponse[dict[str, str]], tags=["meta"])
def health_check() -> ApiSuccessResponse[dict[str, str]] | JSONResponse:
    connection = None
    try:
        connection = db.get_connection()
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
        finally:
            connection.close()
    except Exception:
        logger.exception("Database health check failed.")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"success": False, "message": "Database unreachable."},
        )

    return ApiSuccessResponse[dict[str, str]](
        data={
            "status": "ok",
            "environment": settings.environment,
            "mediaStorage": "cloud",
        },
        message="Backend is healthy.",
    )


app.include_router(admin_router, prefix="/api", tags=["admin"])
app.include_router(auth_router, prefix="/api", tags=["auth"])
app.include_router(courses_router, prefix="/api", tags=["courses"])
app.include_router(lms_router, prefix="/api", tags=["lms"])
app.include_router(items_router, prefix="/api/v1", tags=["items"])
app.include_router(ai_router, prefix="/api/v1", tags=["ai"])
app.include_router(media_router, prefix="/api", tags=["media"])
