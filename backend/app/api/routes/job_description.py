import logging

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.core.config import Settings, get_settings
from app.schemas.job_description import ExtractResponse, SimplifyRequest, SimplifyResponse
from app.services.extract_text import extract_text_from_upload
from app.services.gemini_simplify import simplify_job_description_with_gemini

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/job-description", tags=["job-description"])


@router.post("/extract", response_model=ExtractResponse)
async def extract_job_file(file: UploadFile = File(...)) -> ExtractResponse:
    logger.info("[Route/extract] Received file upload: name=%s, content_type=%s", file.filename, file.content_type)
    extracted_text, warnings = await extract_text_from_upload(file)
    logger.info("[Route/extract] Extraction complete: text_length=%d, warnings=%s", len(extracted_text), warnings)
    return ExtractResponse(extracted_text=extracted_text, warnings=warnings)


@router.post("/simplify", response_model=SimplifyResponse)
@router.post("/simplify/", response_model=SimplifyResponse)
def simplify_job_posting(
    body: SimplifyRequest,
    settings: Settings = Depends(get_settings),
) -> SimplifyResponse:
    logger.info(
        "[Route/simplify] Request received: text_length=%d, gemini_key_set=%s, model=%s",
        len(body.text),
        bool(settings.gemini_api_key),
        settings.gemini_model,
    )
    try:
        result = simplify_job_description_with_gemini(body.text, settings)
        logger.info("[Route/simplify] Success — returning SimplifyResponse")
        return result
    except HTTPException as exc:
        logger.warning("[Route/simplify] HTTPException: status=%d detail=%s", exc.status_code, exc.detail)
        raise
    except Exception as exc:
        logger.error("[Route/simplify] Unexpected exception: %s: %s", type(exc).__name__, exc)
        raise HTTPException(
            status_code=502,
            detail=f"Simplification failed: {exc!s}",
        ) from exc
