"""
DAY IN THE LIFE ROUTE
=====================
POST /api/v1/day-in-life

Returns a personalised workday timeline for a given job title and ADHD type.

Day 1: Returns mock data so frontend can build the UI immediately.
Day 2: Replace the mock block with the real day_in_life_service call.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException

from app.core.config import Settings, get_settings
from app.schemas.day_in_life import DayInLifeRequest, DayInLifeResponse
from app.services.gemini_day_in_life import generate_day_in_life_with_gemini

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Day in Life"])

@router.post("/day-in-life", response_model=DayInLifeResponse)
async def get_day_in_life(
    body: DayInLifeRequest,
    settings: Settings = Depends(get_settings),
) -> DayInLifeResponse:

    logger.info(
        "[DayInLife] Request received: job_title=%r, adhd_type=%r",
        body.job_title,
        body.adhd_type,
    )

    try:
        return generate_day_in_life_with_gemini(body.job_title, body.adhd_type, settings)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("[DayInLife] Unexpected error: %s: %s", type(exc).__name__, exc)
        raise HTTPException(
            status_code=502,
            detail=f"Failed to generate day in life: {exc!s}",
        ) from exc