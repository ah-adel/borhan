# FastAPI Async Service

This project is a clean, dependency-isolated FastAPI application built for asynchronous request handling and strict request validation.

## Features

- Async-first API endpoints using FastAPI
- Strict Pydantic v2 validation with `BaseModel`
- Uvicorn ASGI server for production-style local development
- No imports from the existing workspace application code

## Local development

```bash
cd backend_fastapi
python -m pip install -r requirements.txt
python -m scripts.migrate
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## API authentication

New accounts remain unverified until the user opens a single-use email link sent by Brevo. Verification tokens are stored as hashes and expire after 30 minutes. `JWT_SECRET` (or the compatibility alias `JWT_SECRET_KEY`) must contain at least 32 bytes in production. Only local development may generate a signing key on disk. The platform's `jwt_expiration_minutes` setting controls access-token lifetime.

When `allowStudentSignup` is disabled, public student registration returns 403. Enabling `enforce_mfa` requires TOTP setup or verification after email activation. Access-token authentication rechecks the account's verified status on each request.

## API docs

- Swagger UI: http://localhost:8000/docs
- OpenAPI JSON: http://localhost:8000/openapi.json

## Initial Vercel deployment

Deploy the frontend and API as separate Vercel projects from this repository:

- Frontend project root: `frontend`
- API project root: `backend_fastapi`

Set these frontend variables in the Vercel frontend project:

- `VITE_API_BASE_URL`: the FastAPI project's public URL.
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`: public Supabase client credentials used only for signed uploads.
- `VITE_SUPABASE_PRIVATE_MEDIA_BUCKET=course-materials`.

Configure these variables in the Vercel API project. Never put service keys in `VITE_*` variables:

- `ENVIRONMENT=production` and `DATABASE_AUTO_INIT=false`.
- `DATABASE_URL`: Supabase Transaction Pooler URL on port `6543` with `sslmode=require`.
- `JWT_SECRET`: a private random value of at least 32 bytes.
- `CORS_ALLOWED_ORIGINS`: comma-separated exact frontend origins, without paths.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_PRIVATE_MEDIA_BUCKET=course-materials`.
- `BREVO_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`, and `APP_PUBLIC_URL`.
- `BUNNY_STREAM_LIBRARY_ID`, `BUNNY_STREAM_API_KEY`, and `BUNNY_STREAM_TOKEN_KEY`.
- `AI_SERVICE_ENABLED=false` until an external AI endpoint is configured.

Apply schema migrations and provision the first administrator before deploying the API. Bootstrap requires `INITIAL_ADMIN_EMAIL`, a strong `INITIAL_ADMIN_PASSWORD`, and the Brevo variables; the administrator must verify the email link before signing in:

```bash
cd backend_fastapi
python -m scripts.migrate
python -m scripts.bootstrap_admin
```

For an existing deployment, run `python -m scripts.migrate_media` from the repository with the old upload directories available. Verify migrated lessons before passing `--delete-local`; local source files are retained by default.

Course attachments use private Supabase Storage and five-minute signed downloads after enrollment/ownership checks. Browser uploads go directly to Supabase or Bunny TUS; playback uses five-minute Bunny embed tokens. FastAPI does not mount or write `/uploads`. Vercel Hobby is restricted to non-commercial use; select a plan consistent with the platform's business model.
