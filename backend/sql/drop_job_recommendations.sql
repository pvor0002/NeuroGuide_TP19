-- Remove legacy job_recommendations table (scores are not read from RDS; app uses API + localStorage).
-- Run once on RDS when DATABASE_URL points at your NeuroGuide database.

DROP TABLE IF EXISTS job_recommendations CASCADE;
