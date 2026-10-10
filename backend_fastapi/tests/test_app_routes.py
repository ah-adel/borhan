import time
import uuid
from unittest.mock import MagicMock

import jwt
from fastapi.testclient import TestClient

from app import db
from app.api.routes import courses as courses_routes
from app.core.config import settings
from app.core.security import create_access_token
from app.main import app
from app.services.public_course_cache import invalidate_public_course_cache

client = TestClient(app)


def test_app_does_not_register_local_upload_routes() -> None:
    assert not any(route.path.startswith('/uploads/') for route in app.routes)


def test_course_creation_preserves_explicit_difficulty_and_reviews() -> None:
    instructor_email = f"difficulty_{uuid.uuid4().hex[:8]}@example.com"
    instructor = client.post(
        '/api/auth/sign-up',
        json={
            'email': instructor_email,
            'password': 'Secret123',
            'full_name': 'Difficulty Instructor',
            'role': 'instructor',
        },
    )
    assert instructor.status_code == 201, instructor.text
    instructor_id = instructor.json()['data']['user']['id']
    instructor_token = instructor.json()['data']['session']['access_token']

    student_email = f"difficulty_student_{uuid.uuid4().hex[:8]}@example.com"
    student = client.post(
        '/api/auth/sign-up',
        json={
            'email': student_email,
            'password': 'Secret123',
            'full_name': 'Difficulty Student',
            'role': 'student',
        },
    )
    assert student.status_code == 201, student.text
    student_id = student.json()['data']['user']['id']
    student_token = student.json()['data']['session']['access_token']

    payload = {
        'instructor_id': instructor_id,
        'title': 'Advanced Difficulty Course',
        'description': 'This course should persist as Advanced difficulty and collect reviews.',
        'difficulty': 'Advanced',
        'status': 'published',
        'is_published': True,
        'modules': [
            {'title': 'Module 1', 'lessons': [{'title': 'Lesson 1', 'content': 'Intro', 'video_url': 'https://example.com/video.mp4'}]}
        ],
    }

    created = client.post('/api/courses', json=payload, headers={'Authorization': f'Bearer {instructor_token}'})
    assert created.status_code == 201, created.text
    created_course = created.json()['data']
    assert created_course['difficulty'] == 'Advanced', created_course

    enrollment = client.post(f"/api/courses/{created_course['id']}/enroll", headers={'Authorization': f'Bearer {student_token}'})
    assert enrollment.status_code == 200, enrollment.text

    student_courses = client.get('/api/student/courses', headers={'Authorization': f'Bearer {student_token}'})
    assert student_courses.status_code == 200, student_courses.text
    assert any(course['id'] == created_course['id'] for course in student_courses.json()['data'])

    review = client.post(
        f"/api/courses/{created_course['id']}/reviews",
        json={'rating': 5, 'comment': 'Excellent course.'},
        headers={'Authorization': f'Bearer {student_token}'},
    )
    assert review.status_code == 200, review.text

    fetched = client.get(f"/api/courses/{created_course['id']}", headers={'Authorization': f'Bearer {instructor_token}'})
    assert fetched.status_code == 200, fetched.text
    fetched_course = fetched.json()['data']
    assert fetched_course['difficulty'] == 'Advanced', fetched_course
    assert fetched_course['review_count'] >= 1, fetched_course
    assert any(review_item['comment'] == 'Excellent course.' for review_item in fetched_course['reviews']), fetched_course


def test_health_endpoint_returns_ok(monkeypatch) -> None:
    connection = MagicMock()
    cursor = connection.cursor.return_value.__enter__.return_value
    monkeypatch.setattr('app.db.get_connection', lambda: connection)

    response = client.get('/health')

    assert response.status_code == 200
    payload = response.json()
    assert payload['success'] is True
    assert payload['data'] == {
        'status': 'ok',
        'environment': settings.environment,
        'mediaStorage': 'cloud',
    }
    assert payload['message'] == 'Backend is healthy.'
    cursor.execute.assert_called_once_with('SELECT 1')
    connection.close.assert_called_once()


def test_health_endpoint_returns_sanitized_503_when_database_fails(monkeypatch, caplog) -> None:
    connection = MagicMock()
    cursor = connection.cursor.return_value.__enter__.return_value
    cursor.execute.side_effect = RuntimeError('db host and secret')
    monkeypatch.setattr('app.db.get_connection', lambda: connection)

    response = client.get('/health')

    assert response.status_code == 503
    assert response.json() == {'success': False, 'message': 'Database unreachable.'}
    assert 'db host and secret' in caplog.text
    assert 'db host and secret' not in response.text
    connection.close.assert_called_once()


def test_database_pool_exhaustion_returns_sanitized_503(monkeypatch) -> None:
    def exhaust_pool():
        raise db.DatabasePoolExhausted("pool details must not be returned")

    monkeypatch.setattr('app.api.routes.courses.get_public_courses', exhaust_pool)

    response = client.get('/api/courses/public')

    assert response.status_code == 503
    assert response.json() == {'success': False, 'message': 'Database temporarily unavailable.'}
    assert 'pool details' not in response.text


def test_public_course_cache_etag_and_invalidation(monkeypatch) -> None:
    invalidate_public_course_cache()
    loads = []

    def load_courses():
        loads.append(True)
        return [{'id': 'public-course', 'description': 'A public course'}]

    monkeypatch.setattr(courses_routes, 'get_public_courses', load_courses)
    first = client.get('/api/courses/public')
    etag = first.headers['etag']
    unchanged = client.get('/api/courses/public', headers={'If-None-Match': etag})

    assert first.status_code == 200
    assert first.headers['cache-control'] == 'public, max-age=30, stale-while-revalidate=120'
    assert unchanged.status_code == 304
    assert len(loads) == 1

    invalidate_public_course_cache()
    refreshed = client.get('/api/courses/public')
    assert refreshed.status_code == 200
    assert len(loads) == 2
    invalidate_public_course_cache()


def test_public_course_response_is_gzipped_and_cors_preflight_cached(monkeypatch) -> None:
    invalidate_public_course_cache()
    monkeypatch.setattr(
        courses_routes,
        'get_public_courses',
        lambda: [{'id': 'public-course', 'description': 'x' * 1000}],
    )
    compressed = client.get('/api/courses/public', headers={'Accept-Encoding': 'gzip'})
    preflight = client.options(
        '/api/courses/public',
        headers={
            'Origin': 'https://frontend-programers2.vercel.app',
            'Access-Control-Request-Method': 'GET',
        },
    )

    assert compressed.status_code == 200
    assert compressed.headers['content-encoding'] == 'gzip'
    assert compressed.json()['data'][0]['id'] == 'public-course'
    assert preflight.status_code == 200
    assert preflight.headers['access-control-max-age'] == '600'
    invalidate_public_course_cache()


def test_public_platform_stats_returns_aggregate_values() -> None:
    response = client.get('/api/platform/stats')

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload['success'] is True
    stats = payload['data']
    assert isinstance(stats['active_learners'], int)
    assert stats['course_completion_rate'] is None or isinstance(stats['course_completion_rate'], (int, float))
    assert stats['average_satisfaction'] is None or isinstance(stats['average_satisfaction'], (int, float))


def test_legacy_local_media_upload_route_is_disabled() -> None:
    response = client.post(
        '/api/media/upload',
        files={'file': ('demo.txt', b'hello world', 'text/plain')},
        data={'type': 'attachment'},
    )
    assert response.status_code == 404, response.text


def test_legacy_local_video_stream_is_disabled() -> None:
    response = client.get('/uploads/videos/sample.mp4', headers={'Range': 'bytes=100-199'})
    assert response.status_code == 404


def test_auth_sign_up_and_sign_in_persist_in_sqlite() -> None:
    email = f'persisted.user.{uuid.uuid4().hex}@example.com'
    sign_up = client.post(
        '/api/auth/sign-up',
        json={
            'email': email,
            'password': 'Secret123',
            'full_name': 'Persisted User',
            'role': 'student',
        },
    )
    assert sign_up.status_code == 201, sign_up.text
    body = sign_up.json()
    assert body['success'] is True
    assert body['data']['user']['email'] == email.lower()

    sign_in = client.post(
        '/api/auth/sign-in',
        json={'email': email, 'password': 'Secret123'},
    )
    assert sign_in.status_code == 200, sign_in.text
    payload = sign_in.json()
    assert payload['success'] is True
    assert payload['data']['user']['email'] == email.lower()
    access_token = payload['data']['session']['access_token']

    me = client.get('/api/auth/me', headers={'Authorization': f'Bearer {access_token}'})
    assert me.status_code == 200, me.text
    profile_payload = me.json()
    assert profile_payload['success'] is True
    assert profile_payload['data']['profile']['full_name'] == 'Persisted User'


def test_signed_jwt_authentication_rejects_raw_tampered_expired_and_wrong_role_tokens() -> None:
    email = f'jwt.user.{uuid.uuid4().hex}@example.com'
    signup = client.post(
        '/api/auth/sign-up',
        json={'email': email, 'password': 'Secret123', 'full_name': 'JWT User', 'role': 'student'},
    )
    assert signup.status_code == 201, signup.text
    user_id = signup.json()['data']['user']['id']
    access_token = signup.json()['data']['session']['access_token']
    claims = jwt.decode(access_token, settings.jwt_secret_key, algorithms=['HS256'])
    assert claims['sub'] == user_id
    assert claims['role'] == 'student'
    assert claims['exp'] > int(time.time())

    authenticated = {'Authorization': f'Bearer {access_token}'}
    assert client.get('/api/auth/me', headers=authenticated).status_code == 200
    assert client.get(f'/api/auth/me?user_id={user_id}').status_code == 401
    assert client.get('/api/auth/me', headers={'Authorization': f'Bearer {user_id}'}).status_code == 401
    assert client.get('/api/admin/settings', headers={'Authorization': 'Bearer admin-1'}).status_code == 401

    forged = jwt.encode(
        {'sub': user_id, 'role': 'student', 'exp': int(time.time()) + 60},
        'wrong-signing-key-that-is-not-valid',
        algorithm='HS256',
    )
    expired = jwt.encode(
        {'sub': user_id, 'role': 'student', 'exp': int(time.time()) - 1},
        settings.jwt_secret_key,
        algorithm='HS256',
    )
    wrong_role = jwt.encode(
        {'sub': user_id, 'role': 'admin', 'exp': int(time.time()) + 60},
        settings.jwt_secret_key,
        algorithm='HS256',
    )
    for invalid_token in (forged, expired, wrong_role):
        response = client.get('/api/auth/me', headers={'Authorization': f'Bearer {invalid_token}'})
        assert response.status_code == 401, response.text

    signed_admin = create_access_token('admin-1', 'admin')
    assert client.get('/api/admin/settings', headers={'Authorization': f'Bearer {signed_admin}'}).status_code == 200


def test_sign_in_normalizes_email_and_password() -> None:
    unique_email = f'trimmed.case.user+{uuid.uuid4().hex}@example.com'
    response = client.post(
        '/api/auth/sign-up',
        json={
            'email': unique_email,
            'password': 'Secret123',
            'full_name': 'Trimmed User',
            'role': 'student',
        },
    )
    assert response.status_code == 201, response.text

    sign_in = client.post(
        '/api/auth/sign-in',
        json={'email': f'  {unique_email.upper()}  ', 'password': ' Secret123 '},
    )
    assert sign_in.status_code == 200, sign_in.text
    payload = sign_in.json()
    assert payload['success'] is True
    assert payload['data']['user']['email'] == unique_email.lower()
