import logging

from fastapi import APIRouter, Depends, HTTPException

from app.core.config import Settings, get_settings
from app.schemas.interview_prep import (
    ReshapeRequest,
    ReshapeResponse,
    SpeechCoachRequest,
    SpeechCoachResponse,
    StarCoverage,
    StarSortRequest,
    StarSortResponse,
)
from app.services.gemini_interview_prep import (
    coach_spoken_answer_with_gemini,
    reshape_answer_with_gemini,
    star_sort_cards_with_gemini,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/interview-prep", tags=["interview-prep"])


@router.post("/star-sort", response_model=StarSortResponse)
@router.post("/star-sort/", response_model=StarSortResponse)
def star_sort_endpoint(
    body: StarSortRequest,
    settings: Settings = Depends(get_settings),
) -> StarSortResponse:
    cards_payload = [{"id": c.id.strip(), "text": c.text.strip()} for c in body.cards]
    try:
        zones = star_sort_cards_with_gemini(body.question.strip(), cards_payload, settings)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("[interview-prep/star-sort] unexpected: %s", exc)
        raise HTTPException(status_code=502, detail=f"STAR sort failed: {exc!s}") from exc

    return StarSortResponse(
        situation=zones["situation"],
        action=zones["action"],
        result=zones["result"],
        learning=zones["learning"],
    )


@router.post("/reshape-answer", response_model=ReshapeResponse)
@router.post("/reshape-answer/", response_model=ReshapeResponse)
def reshape_endpoint(
    body: ReshapeRequest,
    settings: Settings = Depends(get_settings),
) -> ReshapeResponse:
    try:
        text = reshape_answer_with_gemini(body.answer, body.instruction, settings)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("[interview-prep/reshape] unexpected: %s", exc)
        raise HTTPException(status_code=502, detail=f"Reshape failed: {exc!s}") from exc

    return ReshapeResponse(text=text)


@router.post("/speech-coach", response_model=SpeechCoachResponse)
@router.post("/speech-coach/", response_model=SpeechCoachResponse)
def speech_coach_endpoint(
    body: SpeechCoachRequest,
    settings: Settings = Depends(get_settings),
) -> SpeechCoachResponse:
    try:
        result = coach_spoken_answer_with_gemini(
            question=body.question.strip(),
            spoken_transcript=body.spoken_transcript.strip(),
            written_answer=body.written_answer.strip(),
            settings=settings,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("[interview-prep/speech-coach] unexpected: %s", exc)
        raise HTTPException(status_code=502, detail=f"Speech coach failed: {exc!s}") from exc

    return SpeechCoachResponse(
        star_coverage=StarCoverage(**result["star_coverage"]),
        strengths=result["strengths"],
        improvements=result["improvements"],
        filler_words=result["filler_words"],
        readiness_bump=result["readiness_bump"],
        summary=result["summary"],
    )
