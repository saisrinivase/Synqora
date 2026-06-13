CREATE TABLE IF NOT EXISTS synqora_core.user_auth_identity (
  auth_identity_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES synqora_core.user_account (user_id),
  provider text NOT NULL,
  provider_subject text NOT NULL,
  password_hash text,
  password_salt text,
  password_algorithm text,
  password_iterations integer,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_subject)
);

CREATE INDEX IF NOT EXISTS idx_synqora_user_auth_identity_user
  ON synqora_core.user_auth_identity (user_id, status);
