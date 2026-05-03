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
from app.db.postgres import get_db_connection
from app.services.corrected_job_score_model_v2 import JobScoreModelV2
from app.services.occupation_match import build_ilike_terms, normalize_job_title

logger = logging.getLogger(__name__)


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


def _select_best_occupation_match(
    conn,
    job_title: str,
    *,
    ict_only: bool,
) -> Optional[Dict]:
    """
    Rank occupations by how many ILIKE terms hit, then ADHD friendliness, then name length.
    """
    raw = (job_title or "").strip()
    if not raw:
        return None

    normalized = normalize_job_title(raw)
    terms = build_ilike_terms(normalized or raw)
    if not terms:
        return None

    cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    conditions = " OR ".join(["occupation_name ILIKE %s" for _ in terms])
    match_count_expr = " + ".join(
        ["(CASE WHEN occupation_name ILIKE %s THEN 1 ELSE 0 END)" for _ in terms]
    )

    # NOTE: psycopg2 treats '%' as placeholder syntax unless escaped.
    # Use LEFT(...)= '26' for ICT major group filter to avoid format parsing issues.
    anzsco_sql = "LEFT(CAST(anzsco_code AS TEXT), 2) = '26'" if ict_only else "TRUE"

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
        WHERE ({anzsco_sql})
          AND ({conditions})
        ORDER BY match_count DESC, adhd_friendliness_score DESC, LENGTH(occupation_name) ASC
        LIMIT 1
    """

    params: tuple = tuple(terms + terms)
    cursor.execute(query, params)
    row = cursor.fetchone()
    cursor.close()
    return dict(row) if row else None


def _row_to_occupation(row: Dict) -> Dict:
    occ = dict(row)
    occ.pop("match_count", None)
    raw = occ.get("implied_skills")
    if isinstance(raw, str) and raw.strip():
        try:
            occ["implied_skills"] = json.loads(raw)
        except json.JSONDecodeError:
            logger.warning("[JobScore] Could not parse implied_skills JSON; using empty list")
            occ["implied_skills"] = []
    elif raw is None:
        occ["implied_skills"] = []
    return occ


def find_occupation_by_name(occupation_name: str) -> Optional[Dict]:
    """
    Resolve a free-text job title (from a job ad or Gemini extraction) to an
    occupation row. Uses normalization, stopword filtering, software-role
    alias expansion, ICT-prefixed ANZSCO first, then broader DB fallback.
    """
    try:
        conn = get_db_connection()
        try:
            # Pass 1 — ICT professionals only (ANZSCO Major Group 26****)
            row = _select_best_occupation_match(conn, occupation_name, ict_only=True)
            if row:
                return _row_to_occupation(row)

            # Pass 2 — same terms, all occupations (marketing / support roles, etc.)
            row = _select_best_occupation_match(conn, occupation_name, ict_only=False)
            if row:
                logger.info(
                    "[JobScore] Occupation matched outside ICT filter: %s",
                    row.get("occupation_name"),
                )
                return _row_to_occupation(row)
        finally:
            conn.close()

        return None

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
            'v3-hybrid'
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
    job_skills_from_gemini: Optional[list] = None,
    job_fit_features_from_gemini: Optional[Dict] = None,
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

    if job_fit_features_from_gemini:
        logger.info(f"[JobScore] Using Gemini job fit features: {job_fit_features_from_gemini}")
        occupation['gemini_job_fit'] = job_fit_features_from_gemini

    # 3. Run the scoring model
    model = JobScoreModelV2()
    result = model.score_job_match(user_questionnaire, occupation, job_fit_features=job_fit_features_from_gemini)

    # 4. Save to RDS (optional — don't fail if this errors)
    if session_id:
        save_recommendation(session_id, occupation_id, result)

    return result
