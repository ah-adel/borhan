from __future__ import annotations

import hashlib
import json
import threading
import time
from collections.abc import Callable
from typing import Any

from fastapi.encoders import jsonable_encoder

CACHE_TTL_SECONDS = 30
_cache_lock = threading.Lock()
_cache: tuple[float, list[dict[str, Any]], str] | None = None


def get_public_courses_cached(loader: Callable[[], list[dict[str, Any]]]) -> tuple[list[dict[str, Any]], str]:
    global _cache
    with _cache_lock:
        now = time.monotonic()
        if _cache is not None and now < _cache[0]:
            return _cache[1], _cache[2]

        courses = loader()
        encoded = json.dumps(jsonable_encoder(courses), ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        etag = f'W/"{hashlib.sha256(encoded.encode("utf-8")).hexdigest()}"'
        _cache = (now + CACHE_TTL_SECONDS, courses, etag)
        return courses, etag


def invalidate_public_course_cache() -> None:
    global _cache
    with _cache_lock:
        _cache = None