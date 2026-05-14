-- Day in the Life — saved timelines per user (RDS). Run alongside interview_prep_sessions.sql.

CREATE TABLE IF NOT EXISTS day_in_life_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    job_title TEXT NOT NULL,
    job_title_norm TEXT NOT NULL,
    adhd_type TEXT NOT NULL,
    adhd_type_norm TEXT NOT NULL,
    timeline JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_day_in_life_user_job_adhd UNIQUE (user_id, job_title_norm, adhd_type_norm)
);

CREATE INDEX IF NOT EXISTS idx_day_in_life_sessions_user_updated
    ON day_in_life_sessions (user_id, updated_at DESC);
