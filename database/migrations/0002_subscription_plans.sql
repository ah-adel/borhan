CREATE TABLE IF NOT EXISTS subscription_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  duration_days INTEGER CHECK (duration_days IS NULL OR duration_days > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_active_name
  ON subscription_plans(is_active, name);

INSERT INTO subscription_plans (id, name, description, price, duration_days, is_active)
VALUES ('free-plan', 'Free', 'Free plan', 0, NULL, TRUE)
ON CONFLICT (id) DO NOTHING;