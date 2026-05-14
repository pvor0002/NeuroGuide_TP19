-- Safe migration for NeuroGuide session tables.
-- Goal: align existing DB schema to backend/sql/session_tables.sql
-- without deleting user data.
--
-- Usage:
--   psql "$DATABASE_URL" -f backend/scripts/session_schema_safe_migration.sql
--
-- Notes:
-- - This script is idempotent (safe to re-run).
-- - It handles legacy column names seen in older deployments.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- users
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- -----------------------------------------------------------------------------
-- user_credentials
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_credentials (
    user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    pass_key_hash TEXT NOT NULL UNIQUE
);

ALTER TABLE user_credentials
    ADD COLUMN IF NOT EXISTS user_id UUID,
    ADD COLUMN IF NOT EXISTS pass_key_hash TEXT;

ALTER TABLE user_credentials
    ALTER COLUMN user_id SET NOT NULL,
    ALTER COLUMN pass_key_hash SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'user_credentials_pkey'
          AND conrelid = 'user_credentials'::regclass
    ) THEN
        ALTER TABLE user_credentials ADD PRIMARY KEY (user_id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = current_schema()
          AND tablename = 'user_credentials'
          AND indexname = 'user_credentials_pass_key_hash_key'
    ) THEN
        CREATE UNIQUE INDEX user_credentials_pass_key_hash_key ON user_credentials(pass_key_hash);
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- consent_records
-- Expected: user_id (PK), consent_granted, consent_json, updated_at
-- Legacy seen: status, payload, acknowledged_at
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS consent_records (
    user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    consent_granted BOOLEAN NOT NULL,
    consent_json JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE consent_records
    ADD COLUMN IF NOT EXISTS user_id UUID,
    ADD COLUMN IF NOT EXISTS consent_granted BOOLEAN,
    ADD COLUMN IF NOT EXISTS consent_json JSONB,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'consent_records'
          AND column_name = 'status'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'consent_records'
          AND column_name = 'consent_granted'
    ) THEN
        ALTER TABLE consent_records RENAME COLUMN status TO consent_granted;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'consent_records'
          AND column_name = 'payload'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'consent_records'
          AND column_name = 'consent_json'
    ) THEN
        ALTER TABLE consent_records RENAME COLUMN payload TO consent_json;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'consent_records'
          AND column_name = 'acknowledged_at'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'consent_records'
          AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE consent_records RENAME COLUMN acknowledged_at TO updated_at;
    END IF;
END $$;

-- (Renames above handle legacy text columns; avoid UPDATEs that reference old names
--  after rename — PostgreSQL validates column names at parse time.)

UPDATE consent_records
SET consent_granted = FALSE
WHERE consent_granted IS NULL;

UPDATE consent_records
SET updated_at = now()
WHERE updated_at IS NULL;

ALTER TABLE consent_records
    ALTER COLUMN user_id SET NOT NULL,
    ALTER COLUMN consent_granted SET NOT NULL,
    ALTER COLUMN updated_at SET NOT NULL,
    ALTER COLUMN updated_at SET DEFAULT now();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'consent_records_pkey'
          AND conrelid = 'consent_records'::regclass
    ) THEN
        ALTER TABLE consent_records ADD PRIMARY KEY (user_id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'consent_records_user_id_fkey'
          AND conrelid = 'consent_records'::regclass
    ) THEN
        ALTER TABLE consent_records
            ADD CONSTRAINT consent_records_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Legacy: table had BOTH "status" (NOT NULL) and new "consent_granted" after partial
-- migrations — backend INSERT only sets consent_granted, so DROP redundant "status".
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'consent_records'
          AND column_name = 'status'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'consent_records'
          AND column_name = 'consent_granted'
    ) THEN
        ALTER TABLE consent_records DROP COLUMN status;
    END IF;
END $$;

-- If only legacy "status" remains (no consent_granted), relax NOT NULL until renamed
-- by a DBA; normally the RENAME blocks above handle boolean/text "status" alone.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'consent_records'
          AND column_name = 'status'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'consent_records'
          AND column_name = 'consent_granted'
    ) THEN
        ALTER TABLE consent_records ALTER COLUMN status DROP NOT NULL;
    END IF;
END $$;

-- Legacy: "acknowledged_at" NOT NULL alongside "updated_at" — API only sets updated_at.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'consent_records'
          AND column_name = 'acknowledged_at'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'consent_records'
          AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE consent_records DROP COLUMN acknowledged_at;
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- career_profiles
-- Expected: id, user_id, profile, created_at, updated_at
-- Legacy seen: state
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS career_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    profile JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE career_profiles
    ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
    ADD COLUMN IF NOT EXISTS user_id UUID,
    ADD COLUMN IF NOT EXISTS profile JSONB,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'career_profiles'
          AND column_name = 'state'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'career_profiles'
          AND column_name = 'profile'
    ) THEN
        ALTER TABLE career_profiles RENAME COLUMN state TO profile;
    END IF;
END $$;

UPDATE career_profiles
SET id = gen_random_uuid()
WHERE id IS NULL;

UPDATE career_profiles
SET profile = '{}'::jsonb
WHERE profile IS NULL;

UPDATE career_profiles
SET created_at = now()
WHERE created_at IS NULL;

UPDATE career_profiles
SET updated_at = now()
WHERE updated_at IS NULL;

ALTER TABLE career_profiles
    ALTER COLUMN id SET DEFAULT gen_random_uuid(),
    ALTER COLUMN id SET NOT NULL,
    ALTER COLUMN user_id SET NOT NULL,
    ALTER COLUMN profile SET NOT NULL,
    ALTER COLUMN profile SET DEFAULT '{}'::jsonb,
    ALTER COLUMN created_at SET NOT NULL,
    ALTER COLUMN created_at SET DEFAULT now(),
    ALTER COLUMN updated_at SET NOT NULL,
    ALTER COLUMN updated_at SET DEFAULT now();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'career_profiles_pkey'
          AND conrelid = 'career_profiles'::regclass
    ) THEN
        ALTER TABLE career_profiles ADD PRIMARY KEY (id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'career_profiles_user_id_fkey'
          AND conrelid = 'career_profiles'::regclass
    ) THEN
        ALTER TABLE career_profiles
            ADD CONSTRAINT career_profiles_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_career_profiles_user_id ON career_profiles (user_id);

-- -----------------------------------------------------------------------------
-- job_workbench_state
-- Expected: user_id (PK), state
-- Legacy seen: extra
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_workbench_state (
    user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    state JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE job_workbench_state
    ADD COLUMN IF NOT EXISTS user_id UUID,
    ADD COLUMN IF NOT EXISTS state JSONB;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'job_workbench_state'
          AND column_name = 'extra'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'job_workbench_state'
          AND column_name = 'state'
    ) THEN
        ALTER TABLE job_workbench_state RENAME COLUMN extra TO state;
    END IF;
END $$;

UPDATE job_workbench_state
SET state = '{}'::jsonb
WHERE state IS NULL;

ALTER TABLE job_workbench_state
    ALTER COLUMN user_id SET NOT NULL,
    ALTER COLUMN state SET NOT NULL,
    ALTER COLUMN state SET DEFAULT '{}'::jsonb;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'job_workbench_state_pkey'
          AND conrelid = 'job_workbench_state'::regclass
    ) THEN
        ALTER TABLE job_workbench_state ADD PRIMARY KEY (user_id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'job_workbench_state_user_id_fkey'
          AND conrelid = 'job_workbench_state'::regclass
    ) THEN
        ALTER TABLE job_workbench_state
            ADD CONSTRAINT job_workbench_state_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
END $$;

COMMIT;
