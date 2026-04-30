"""
JOB SCORE SERVICE
=================
Handles database connection, occupation lookup, model scoring, and saving results.
"""

import json
import logging
from typing import Dict, Optional
import psycopg2
import psycopg2.extras
from app.services.job_score_model_v2 import JobScoreModelV2

logger = logging.getLogger(__name__)

# ============================================================================
# RDS CONNECTION
# ============================================================================
import os

def get_db_connection():
    """Create and return a PostgreSQL connection.
    Uses DATABASE_URL if set (Lambda), otherwise falls back to individual vars (local).
    """
    database_url = os.environ.get("DATABASE_URL")
    if database_url:
        return psycopg2.connect(database_url)

    return psycopg2.connect(
        host=os.environ["RDS_HOST"],
        port=int(os.environ.get("RDS_PORT", 5432)),
        database=os.environ["RDS_DATABASE"],
        user=os.environ["RDS_USER"],
        password=os.environ["RDS_PASSWORD"],
    )


# ============================================================================
# OCCUPATION LOOKUP
# ============================================================================
def fetch_occupation(occupation_id: int) -> Optional[Dict]:
    """
    Fetch occupation data from RDS by occupation_id.
    Returns None if not found.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cursor.execute("""
            SELECT
                occupation_id,
                anzsco_code,
                occupation_name,
                work_complexity,
                adhd_friendliness_score,
                implied_skills,
                typical_hours_per_week,
                median_weekly_earnings,
                employed_count
            FROM occupations
            WHERE occupation_id = %s
        """, (occupation_id,))
        row = cursor.fetchone()
        cursor.close()
        conn.close()

        if not row:
            return None

        # Convert RealDictRow to plain dict
        occupation = dict(row)

        # Parse implied_skills from JSON string to list
        if isinstance(occupation.get('implied_skills'), str):
            occupation['implied_skills'] = json.loads(occupation['implied_skills'])

        return occupation

    except Exception as e:
        logger.error(f"[JobScore] DB error fetching occupation {occupation_id}: {e}")
        raise


def find_occupation_by_name(occupation_name: str) -> Optional[Dict]:
    """
    Find the best matching occupation by name using keyword search.
    Splits the job title into keywords and searches for each one.
    Returns the highest ADHD-friendliness scored match.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # Split job title into keywords and search for each
        # e.g. "Software Developer" → ["Software", "Developer"]
        keywords = occupation_name.strip().split()

        # Build OR conditions for WHERE clause
        conditions = " OR ".join([
            f"occupation_name ILIKE %s" for _ in keywords
        ])

        # Count how many keywords appear in the occupation name
        # More hits = more relevant match (tiebreaker 1)
        # Shorter name = more specific match (tiebreaker 2)
        match_count_expr = " + ".join([
            f"(CASE WHEN occupation_name ILIKE %s THEN 1 ELSE 0 END)"
            for _ in keywords
        ])

        param_values = [f"%{k}%" for k in keywords]

        query = f"""
            SELECT
                occupation_id,
                anzsco_code,
                occupation_name,
                work_complexity,
                adhd_friendliness_score,
                implied_skills,
                typical_hours_per_week,
                ({match_count_expr}) AS match_count
            FROM occupations
            WHERE anzsco_code LIKE '26%%'
              AND ({conditions})
            ORDER BY match_count DESC, adhd_friendliness_score DESC, LENGTH(occupation_name) ASC
            LIMIT 1
        """

        # param_values passed twice: once for match_count in SELECT, once for WHERE
        cursor.execute(query, param_values + param_values)
        row = cursor.fetchone()
        cursor.close()
        conn.close()

        if not row:
            return None

        occupation = dict(row)
        if isinstance(occupation.get('implied_skills'), str):
            occupation['implied_skills'] = json.loads(occupation['implied_skills'])

        return occupation

    except Exception as e:
        logger.error(f"[JobScore] DB error finding occupation by name: {e}")
        raise


# ============================================================================
# SAVE RECOMMENDATION
# ============================================================================
def save_recommendation(session_id: str, occupation_id: int, result: Dict) -> None:
    """Save job score result to job_recommendations table."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO job_recommendations (
                session_id, occupation_id, match_score, match_confidence,
                factors, match_reasoning, recommendation_text,
                key_strengths, key_challenges, suggested_accommodations,
                model_version
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            session_id,
            occupation_id,
            result['score'],
            result['match_confidence'],
            json.dumps(result['factor_breakdown']),
            result['reasoning'],
            result['recommendation'],
            result['key_strengths'],
            result['key_challenges'],
            result['suggested_accommodations'],
            'v2'
        ))
        conn.commit()
        cursor.close()
        conn.close()
        logger.info(f"[JobScore] Saved recommendation for session {session_id}")
    except Exception as e:
        logger.error(f"[JobScore] Failed to save recommendation: {e}")
        # Don't raise — saving is optional, don't fail the whole request


# ============================================================================
# MAIN SCORING FUNCTION
# ============================================================================
def calculate_job_score(
    user_questionnaire: Dict,
    occupation_id: int,
    session_id: Optional[str] = None,
    job_skills_from_gemini: Optional[list] = None
) -> Dict:
    """
    Main function: fetch occupation, run model, save result, return response.

    If job_skills_from_gemini is provided, it overrides the implied_skills
    from the database — giving the model real skills from the actual job posting
    instead of generic pre-populated ones.
    """
    # 1. Fetch occupation from RDS
    occupation = fetch_occupation(occupation_id)
    if not occupation:
        raise ValueError(f"Occupation with id {occupation_id} not found")

    # 2. Override implied_skills with Gemini-extracted skills if provided
    if job_skills_from_gemini:
        logger.info(f"[JobScore] Using Gemini-extracted skills: {job_skills_from_gemini}")
        occupation['implied_skills'] = job_skills_from_gemini

    # 3. Run the scoring model
    model = JobScoreModelV2()
    result = model.score_job_match(user_questionnaire, occupation)

    # 4. Save to RDS (optional — don't fail if this errors)
    if session_id:
        save_recommendation(session_id, occupation_id, result)

    return result
