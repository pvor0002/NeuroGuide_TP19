"""
DAY IN THE LIFE ROUTE
=====================
POST /api/v1/day-in-life

Returns a personalised workday timeline for a given job title and ADHD type.

Day 1: Returns mock data so frontend can build the UI immediately.
Day 2: Replace the mock block with the real day_in_life_service call.
"""

import logging

from fastapi import APIRouter, HTTPException

from app.schemas.day_in_life import DayInLifeRequest, DayInLifeResponse, TimeBlock

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Day in Life"])


@router.post("/day-in-life", response_model=DayInLifeResponse)
async def get_day_in_life(body: DayInLifeRequest) -> DayInLifeResponse:

    logger.info(
        "[DayInLife] Request received: job_title=%r, adhd_type=%r",
        body.job_title,
        body.adhd_type,
    )

    try:

        # ── Day 2: replace this mock block with the real service call ──────
        # from app.services.day_in_life_service import generate_day_in_life
        # result = generate_day_in_life(body.job_title, body.adhd_type)
        # return result
        # ───────────────────────────────────────────────────────────────────

        mock_timeline = [
            TimeBlock(
                time="9:00 AM",
                task="Emails + Slack catch-up",
                description="Review overnight messages, flag urgent items, plan the day.",
                energy_level="low",
                adhd_tip="Use this window — your focus peaks later in the morning.",
            ),
            TimeBlock(
                time="9:30 AM",
                task="Deep focused work",
                description="Uninterrupted solo work block. Your most cognitively demanding task of the day.",
                energy_level="high",
                adhd_tip="Block notifications. Try 25-min Pomodoro sprints with a 5-min break.",
            ),
            TimeBlock(
                time="11:00 AM",
                task="Morning break",
                description="Step away from the screen. Walk, stretch, or grab a coffee.",
                energy_level="break",
                adhd_tip=None,
            ),
            TimeBlock(
                time="11:15 AM",
                task="Team check-in or meeting",
                description="Short sync with your team. Usually 30–45 minutes.",
                energy_level="medium",
                adhd_tip="Prepare 2–3 talking points beforehand so you stay on track.",
            ),
            TimeBlock(
                time="1:00 PM",
                task="Lunch — proper break",
                description="Away from your desk. This break matters more than it sounds for afternoon focus.",
                energy_level="break",
                adhd_tip=None,
            ),
            TimeBlock(
                time="2:00 PM",
                task="Collaborative or review work",
                description="Apply feedback, iterate on work, or hand off to colleagues.",
                energy_level="medium",
                adhd_tip="Use a checklist for repetitive steps so nothing gets missed.",
            ),
            TimeBlock(
                time="4:00 PM",
                task="Admin + plan tomorrow",
                description="Log completed tasks, update any trackers, write tomorrow's top 3 priorities.",
                energy_level="low",
                adhd_tip="End-of-day admin suits low energy — save your deep work for the morning.",
            ),
        ]

        logger.info(
            "[DayInLife] Returning mock timeline (%d blocks) for job_title=%r",
            len(mock_timeline),
            body.job_title,
        )

        return DayInLifeResponse(
            job_title=body.job_title,
            adhd_type=body.adhd_type,
            data_source="gemini_fallback",
            timeline=mock_timeline,
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("[DayInLife] Unexpected error: %s: %s", type(exc).__name__, exc)
        raise HTTPException(
            status_code=502,
            detail=f"Failed to generate day in life: {exc!s}",
        ) from exc