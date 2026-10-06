ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS verification_email_sent_at TIMESTAMPTZ;

ALTER TABLE users ALTER COLUMN is_verified SET DEFAULT FALSE;

UPDATE users
SET status = 'inactive',
    is_verified = FALSE,
    verification_email_sent_at = NULL
WHERE id = 'admin-1'
  AND email = 'ah.adel2188@gmail.com'
  AND role = 'admin';

UPDATE platform_settings
SET settings = settings - ARRAY['smtp_host', 'smtp_port', 'smtp_username', 'smtp_password', 'smtp_from_email', 'smtp_use_tls']::text[]
WHERE id = 1;

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_user
  ON email_verification_tokens(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  course_id TEXT REFERENCES courses(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('attachment', 'video')),
  provider TEXT NOT NULL CHECK (provider IN ('supabase', 'bunny', 'external')),
  object_key TEXT,
  remote_id TEXT,
  original_name TEXT NOT NULL,
  mime_type TEXT,
  file_size BIGINT NOT NULL DEFAULT 0 CHECK (file_size >= 0),
  uploaded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (provider = 'supabase' AND object_key IS NOT NULL AND remote_id IS NULL)
    OR (provider = 'bunny' AND remote_id IS NOT NULL AND object_key IS NULL)
    OR provider = 'external'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_media_assets_supabase_key
  ON media_assets(object_key)
  WHERE provider = 'supabase';

CREATE UNIQUE INDEX IF NOT EXISTS idx_media_assets_bunny_id
  ON media_assets(remote_id)
  WHERE provider = 'bunny';

CREATE INDEX IF NOT EXISTS idx_media_assets_course
  ON media_assets(course_id, kind);

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'course-materials',
      'course-materials',
      FALSE,
      20971520,
      ARRAY[
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain',
        'image/png',
        'image/jpeg',
        'image/gif',
        'image/webp'
      ]::text[]
    )
    ON CONFLICT (id) DO UPDATE SET
      public = FALSE,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;
  END IF;
END;
$$;