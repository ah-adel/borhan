from __future__ import annotations

import asyncio

from app import db
from app.services import cloud_media_service


def test_course_cleanup_preserves_shared_assets_and_deletes_unshared(monkeypatch) -> None:
    assets = [
        {"id": "shared", "provider": "bunny", "remote_id": "bunny-shared"},
        {"id": "unshared", "provider": "supabase", "object_key": "drafts/file.pdf"},
    ]
    deleted_remote: list[str] = []
    deleted_records: list[str] = []

    monkeypatch.setattr(
        db,
        "is_media_asset_referenced_outside_course",
        lambda asset_id, _course_id: asset_id == "shared",
    )
    monkeypatch.setattr(
        db,
        "delete_media_asset_record",
        lambda asset_id: deleted_records.append(asset_id) or True,
    )

    async def delete_cloud_asset(asset: dict[str, str]) -> None:
        deleted_remote.append(str(asset["id"]))

    monkeypatch.setattr(cloud_media_service, "delete_cloud_media_asset", delete_cloud_asset)
    errors = asyncio.run(cloud_media_service.cleanup_course_media_assets(assets, "course-1"))

    assert errors == []
    assert deleted_remote == ["unshared"]
    assert deleted_records == ["unshared"]