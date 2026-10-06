from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from pathlib import PurePath
from typing import Any

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel, Field

from app.core.security import get_current_user
from app.db import (
    can_access_media_asset,
    can_manage_course_media,
    create_media_asset,
    delete_media_asset_record,
    get_media_asset,
    is_media_asset_referenced,
)
from app.schemas.common import ApiSuccessResponse, DeleteCleanupResult
from app.services.cloud_media_service import (
    MediaProviderError,
    create_bunny_playback_url,
    create_bunny_upload_signature,
    create_bunny_video,
    create_supabase_download_url,
    create_supabase_upload_ticket,
    delete_bunny_video,
    delete_cloud_media_asset,
    delete_supabase_object,
)

router = APIRouter()
ASSET_URL_PREFIX = "cloud-asset:"
MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
MAX_VIDEO_BYTES = 500 * 1024 * 1024
ALLOWED_ATTACHMENT_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
}


class UploadTicketRequest(BaseModel):
    filename: str = Field(..., min_length=1, max_length=255)
    content_type: str = Field(..., min_length=1, max_length=128)
    size: int = Field(..., gt=0)
    course_id: str | None = None


class DeleteAssetsRequest(BaseModel):
    entity: dict[str, Any]


def _authenticated_user(authorization: str | None) -> dict[str, Any]:
    user = get_current_user(authorization)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"error": "Authentication required."})
    return user


def _require_media_manager(user: dict[str, Any]) -> None:
    if user.get("role") not in {"instructor", "admin"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"error": "Instructor or administrator access required."})


def _safe_filename(value: str) -> str:
    basename = PurePath(value.replace("\\", "/")).name
    normalized = re.sub(r"[^A-Za-z0-9._-]+", "_", basename).strip("._")
    return normalized[:180] or "upload.bin"


def _check_course_management(course_id: str | None, user: dict[str, Any]) -> None:
    if course_id and not can_manage_course_media(course_id, user["id"], user["role"]):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"error": "You cannot upload media for this course."})


def _provider_error(exc: MediaProviderError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail={"error": str(exc)})


@router.post("/media/attachments/upload-ticket", response_model=ApiSuccessResponse[dict[str, str]], status_code=status.HTTP_201_CREATED)
async def create_attachment_upload_ticket(
    payload: UploadTicketRequest,
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> ApiSuccessResponse[dict[str, str]]:
    user = _authenticated_user(authorization)
    _require_media_manager(user)
    _check_course_management(payload.course_id, user)
    if payload.size > MAX_ATTACHMENT_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail={"error": "Attachment exceeds the 20 MB limit."})
    content_type = payload.content_type.lower()
    if content_type not in ALLOWED_ATTACHMENT_TYPES:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail={"error": "Unsupported attachment type."})

    asset_id = str(uuid.uuid4())
    filename = _safe_filename(payload.filename)
    object_key = f"drafts/{user['id']}/{asset_id}/{filename}"
    create_media_asset(
        asset_id,
        kind="attachment",
        provider="supabase",
        object_key=object_key,
        original_name=filename,
        mime_type=content_type,
        file_size=payload.size,
        uploaded_by=user["id"],
        course_id=payload.course_id,
    )
    try:
        ticket = await create_supabase_upload_ticket(object_key, content_type)
    except MediaProviderError as exc:
        delete_media_asset_record(asset_id)
        raise _provider_error(exc) from exc
    return ApiSuccessResponse(
        data={
            "asset_id": asset_id,
            "asset_url": f"{ASSET_URL_PREFIX}{asset_id}",
            "path": ticket["path"],
            "token": ticket["token"],
        },
        message="Signed upload ticket created.",
    )


@router.post("/media/videos/upload-ticket", response_model=ApiSuccessResponse[dict[str, Any]], status_code=status.HTTP_201_CREATED)
async def create_video_upload_ticket(
    payload: UploadTicketRequest,
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> ApiSuccessResponse[dict[str, Any]]:
    user = _authenticated_user(authorization)
    _require_media_manager(user)
    _check_course_management(payload.course_id, user)
    if payload.size > MAX_VIDEO_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail={"error": "Video exceeds the 500 MB limit."})
    if not payload.content_type.lower().startswith("video/"):
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail={"error": "A video file is required."})

    filename = _safe_filename(payload.filename)
    video_id: str | None = None
    asset_id = str(uuid.uuid4())
    asset_created = False
    try:
        video_id = await create_bunny_video(filename)
        create_media_asset(
            asset_id,
            kind="video",
            provider="bunny",
            remote_id=video_id,
            original_name=filename,
            mime_type=payload.content_type.lower(),
            file_size=payload.size,
            uploaded_by=user["id"],
            course_id=payload.course_id,
        )
        asset_created = True
        expires_at = int(datetime.now(timezone.utc).timestamp()) + 3600
        library_id, signature = create_bunny_upload_signature(video_id, expires_at)
    except MediaProviderError as exc:
        if video_id:
            try:
                await delete_bunny_video(video_id)
            except MediaProviderError:
                pass
        if asset_created:
            delete_media_asset_record(asset_id)
        raise _provider_error(exc) from exc
    except Exception:
        if video_id:
            try:
                await delete_bunny_video(video_id)
            except MediaProviderError:
                pass
        if asset_created:
            delete_media_asset_record(asset_id)
        raise

    return ApiSuccessResponse(
        data={
            "asset_id": asset_id,
            "asset_url": f"{ASSET_URL_PREFIX}{asset_id}",
            "video_id": video_id,
            "library_id": library_id,
            "expires_at": expires_at,
            "signature": signature,
            "endpoint": "https://video.bunnycdn.com/tusupload",
        },
        message="Bunny Stream upload ticket created.",
    )


@router.get("/media/assets/{asset_id}/signed-url", response_model=ApiSuccessResponse[dict[str, str]])
async def get_signed_media_url(
    asset_id: str,
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> ApiSuccessResponse[dict[str, str]]:
    user = _authenticated_user(authorization)
    asset = get_media_asset(asset_id)
    if asset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "Media asset not found."})
    if not can_access_media_asset(asset_id, user["id"], user["role"]):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"error": "You do not have access to this course media."})

    try:
        if asset["provider"] == "supabase" and asset.get("object_key"):
            signed_url = await create_supabase_download_url(str(asset["object_key"]), expires_in=300)
        elif asset["provider"] == "bunny" and asset.get("remote_id"):
            signed_url = create_bunny_playback_url(str(asset["remote_id"]), expires_in=300)
        else:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"error": "This media asset is not stored in cloud storage."})
    except MediaProviderError as exc:
        raise _provider_error(exc) from exc
    return ApiSuccessResponse(data={"url": signed_url}, message="Signed media URL created.")


@router.delete("/media/assets/{asset_id}", response_model=ApiSuccessResponse[dict[str, bool]])
async def delete_media_asset(
    asset_id: str,
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> ApiSuccessResponse[dict[str, bool]]:
    user = _authenticated_user(authorization)
    if user.get("role") not in {"instructor", "admin"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"error": "Instructor or administrator access required."})
    asset = get_media_asset(asset_id)
    if asset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "Media asset not found."})
    if not can_access_media_asset(asset_id, user["id"], user["role"]):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"error": "You cannot delete this media asset."})
    if is_media_asset_referenced(asset_id):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"error": "Remove this asset from its lessons before deleting it."})
    try:
        await delete_cloud_media_asset(asset)
    except MediaProviderError as exc:
        raise _provider_error(exc) from exc
    delete_media_asset_record(asset_id)
    return ApiSuccessResponse(data={"deleted": True}, message="Cloud media asset deleted.")


@router.post("/media/delete", response_model=ApiSuccessResponse[DeleteCleanupResult])
async def delete_media_entity(
    payload: DeleteAssetsRequest,
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> ApiSuccessResponse[DeleteCleanupResult]:
    user = _authenticated_user(authorization)
    if user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"error": "Administrator access required."})
    candidate_assets: set[str] = set()

    def collect(value: Any) -> None:
        if isinstance(value, str) and value.startswith(ASSET_URL_PREFIX):
            candidate_assets.add(value.removeprefix(ASSET_URL_PREFIX))
        elif isinstance(value, dict):
            for child in value.values():
                collect(child)
        elif isinstance(value, list):
            for child in value:
                collect(child)

    collect(payload.entity)
    deleted: list[str] = []
    errors: list[dict[str, str]] = []
    for asset_id in candidate_assets:
        asset = get_media_asset(asset_id)
        if asset is None:
            continue
        if is_media_asset_referenced(asset_id):
            errors.append({"message": "Asset is still referenced by a lesson.", "path": asset_id})
            continue
        try:
            await delete_cloud_media_asset(asset)
            delete_media_asset_record(asset_id)
            deleted.append(asset_id)
        except MediaProviderError as exc:
            errors.append({"message": str(exc), "path": asset_id})

    return ApiSuccessResponse(
        data=DeleteCleanupResult(
            entity_id=str(payload.entity.get("id") or payload.entity.get("courseId") or "") or None,
            deleted_files=deleted,
            purged_collections=[],
            errors=errors,
        ),
        message="Cloud media cleanup completed.",
    )
