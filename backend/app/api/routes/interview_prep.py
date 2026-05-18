import logging

from fastapi import APIRouter, Depends, HTTPException

from app.core.config import Settings, get_settings
from app.schemas.interview_prep import (
    FormulateSpeechRequest,
    FormulateSpeechResponse,
    GenerateQuestionsRequest,
    GenerateQuestionsResponse,
    ReshapeRequest,
    ReshapeResponse,
    SpeechCoachRequest,
    SpeechCoachResponse,
    SplitBrainDumpRequest,
    SplitBrainDumpResponse,
    StarCoverage,
    StarSortRequest,
    StarSortResponse,
)
from app.services.gemini_interview_prep import (
    coach_spoken_answer_with_gemini,
    formulate_speech_from_star_with_gemini,
    generate_interview_questions_with_gemini,
    reshape_answer_with_gemini,
    split_card_text_with_gemini,
    star_sort_cards_with_gemini,
    heuristic_split_card_text,
    should_split_card_text,
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
        zones, expanded_cards = star_sort_cards_with_gemini(
            body.question.strip(), cards_payload, settings
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("[interview-prep/star-sort] unexpected: %s", exc)
        raise HTTPException(status_code=502, detail=f"STAR sort failed: {exc!s}") from exc

    return StarSortResponse(
        situation=zones["situation"],
        task=zones["task"],
        action=zones["action"],
        result=zones["result"],
        cards=[{"id": c["id"], "text": c["text"]} for c in expanded_cards],
    )


@router.post("/split-brain-dump", response_model=SplitBrainDumpResponse)
@router.post("/split-brain-dump/", response_model=SplitBrainDumpResponse)
def split_brain_dump_endpoint(
    body: SplitBrainDumpRequest,
    settings: Settings = Depends(get_settings),
) -> SplitBrainDumpResponse:
    text = body.text.strip()
    if not should_split_card_text(text):
        return SplitBrainDumpResponse(points=[text])
    try:
        points = split_card_text_with_gemini(text, body.question.strip(), settings)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("[interview-prep/split-brain-dump] unexpected: %s", exc)
        points = heuristic_split_card_text(text)
    return SplitBrainDumpResponse(points=points or [text])


@router.post("/formulate-speech", response_model=FormulateSpeechResponse)
@router.post("/formulate-speech/", response_model=FormulateSpeechResponse)
def formulate_speech_endpoint(
    body: FormulateSpeechRequest,
    settings: Settings = Depends(get_settings),
) -> FormulateSpeechResponse:
    try:
        text = formulate_speech_from_star_with_gemini(
            body.question.strip(),
            situation=[s.strip() for s in body.situation if s.strip()],
            task=[s.strip() for s in body.task if s.strip()],
            action=[s.strip() for s in body.action if s.strip()],
            result=[s.strip() for s in body.result if s.strip()],
            settings=settings,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("[interview-prep/formulate-speech] unexpected: %s", exc)
        raise HTTPException(status_code=502, detail=f"Formulate speech failed: {exc!s}") from exc

    return FormulateSpeechResponse(text=text)


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


@router.post("/generate-questions", response_model=GenerateQuestionsResponse)
@router.post("/generate-questions/", response_model=GenerateQuestionsResponse)
def generate_questions_endpoint(
    body: GenerateQuestionsRequest,
    settings: Settings = Depends(get_settings),
) -> GenerateQuestionsResponse:
    try:
        questions = generate_interview_questions_with_gemini(
            known_skills=body.known_skills,
            missing_skills=body.missing_skills,
            role=body.role,
            settings=settings,
            company=body.company,
            summary=body.summary,
            responsibilities=body.responsibilities,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("[interview-prep/generate-questions] unexpected: %s", exc)
        raise HTTPException(status_code=502, detail=f"Question generation failed: {exc!s}") from exc
    return GenerateQuestionsResponse(questions=questions)
