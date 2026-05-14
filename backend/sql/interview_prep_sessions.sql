-- Interview prep progress (per user + simplified job fingerprint).
-- Run on the same database as session_tables.sql when using cloud session + RDS.

CREATE TABLE IF NOT EXISTS interview_prep_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    job_fingerprint TEXT NOT NULL,
    simplified_job JSONB,
    interview_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
    progress JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_interview_prep_user_job UNIQUE (user_id, job_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_interview_prep_sessions_user_id
    ON interview_prep_sessions (user_id);

CREATE INDEX IF NOT EXISTS idx_interview_prep_sessions_updated_at
    ON interview_prep_sessions (updated_at DESC);
