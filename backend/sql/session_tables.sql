-- Session API (/api/v1/pg/session/*) — run once on your RDS database.
-- Pass keys are stored only as HMAC-SHA256 hashes in user_credentials.pass_key_hash (never plaintext).

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_credentials (
    user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    pass_key_hash TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS consent_records (
    user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    consent_granted BOOLEAN NOT NULL,
    consent_json JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS career_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    profile JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_career_profiles_user_id ON career_profiles (user_id);

CREATE TABLE IF NOT EXISTS job_workbench_state (
    user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    state JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Optional: interview prep persistence — run backend/sql/interview_prep_sessions.sql when using RDS backup for prep.
-- Optional: saved Day in the Life timelines — run backend/sql/day_in_life_sessions.sql for /pg/day-in-life/sessions.
