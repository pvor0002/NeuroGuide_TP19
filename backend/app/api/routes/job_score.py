"""
JOB SCORE ROUTE
===============
POST /api/v1/predict-job-score  — calculate job match score
POST /api/v1/find-occupation    — find occupation_id from job title
"""

import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.schemas.job_score import JobScoreRequest, JobScoreResponse
from app.services.job_score_service import calculate_job_score, find_occupation_by_name
from app.services.occupation_match import normalize_job_title

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Job Score"])


# ============================================================================
# FIND OCCUPATION ENDPOINT
# ============================================================================
class FindOccupationRequest(BaseModel):
    job_title: str  # Extracted by Gemini from job description


class FindOccupationResponse(BaseModel):
    occupation_id: int
    occupation_name: str
    adhd_friendliness_score: float
    work_complexity: str
    found: bool


@router.post("/find-occupation", response_model=FindOccupationResponse)
async def find_occupation(request: FindOccupationRequest):
    """
    Find the best matching occupation from the database using a job title.

    Called by frontend after Gemini extracts the job title from a job description.
    Returns occupation_id + ADHD data needed for scoring.

    Example:
        Input:  { "job_title": "Software Developer" }
        Output: { "occupation_id": 683, "adhd_friendliness_score": 96, ... }
    """
    try:
        normalized = normalize_job_title(request.job_title)
        logger.info(
            "[FindOccupation] Searching for: %r (normalized: %r)",
            request.job_title,
            normalized or request.job_title,
        )
        occupation = find_occupation_by_name(request.job_title)

        if not occupation:
            raise HTTPException(
                status_code=404,
                detail=f"No matching occupation found for: {request.job_title}"
            )

        logger.info(f"[FindOccupation] Found: {occupation['occupation_name']} (id={occupation['occupation_id']})")

        return FindOccupationResponse(
            occupation_id=occupation['occupation_id'],
            occupation_name=occupation['occupation_name'],
            adhd_friendliness_score=occupation['adhd_friendliness_score'],
            work_complexity=occupation['work_complexity'],
            found=True
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[FindOccupation] Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to find occupation.")


# ============================================================================
# PREDICT JOB SCORE ENDPOINT
# ============================================================================
router2 = APIRouter(prefix="/predict-job-score", tags=["Job Score"])


@router2.post("", response_model=JobScoreResponse)
async def predict_job_score(request: JobScoreRequest):
    """
    Calculate job match score for a user's ADHD profile against an occupation.

    Flow:
    1. Validate incoming user questionnaire + occupation_id
    2. Fetch occupation data from RDS
    3. Run JobScoreModelV2 (hybrid RandomForest on ADHD dataset + 7 rule factors)
    4. Return score, recommendation, factor breakdown
    """

    # Validate ADHD profile type
    valid_types = ['inattentive', 'hyperactive-impulsive', 'combined']
    if request.user_questionnaire.adhd_profile_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid ADHD profile type. Must be one of: {valid_types}"
        )

    try:
        logger.info(
            f"[JobScore] Scoring occupation_id={request.occupation_id} "
            f"for adhd_type={request.user_questionnaire.adhd_profile_type}"
        )

        # Convert questionnaire to dict for model
        user_questionnaire = request.user_questionnaire.model_dump()

        fit_payload = None
        if request.job_fit_features_from_gemini is not None:
            fit_payload = request.job_fit_features_from_gemini.model_dump(exclude_none=True)

        # Calculate score
        result = calculate_job_score(
            user_questionnaire=user_questionnaire,
            occupation_id=request.occupation_id,
            job_skills_from_gemini=request.job_skills_from_gemini,
            job_fit_features_from_gemini=fit_payload,
            user_soft_skills_overrides=request.user_soft_skills_overrides,
        )

        logger.info(f"[JobScore] Score calculated: {result['score']}/100")
        return result

    except ValueError as e:
        # Occupation not found
        raise HTTPException(status_code=404, detail=str(e))

    except Exception as e:
        logger.error(f"[JobScore] Unexpected error: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to calculate job score. Please try again."
        )
