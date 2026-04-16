from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.core.config import Settings, get_settings
from app.schemas.job_description import ExtractResponse, SimplifyRequest, SimplifyResponse
from app.services.extract_text import extract_text_from_upload
from app.services.gemini_simplify import simplify_job_description_with_gemini

router = APIRouter(prefix="/job-description", tags=["job-description"])


@router.post("/extract", response_model=ExtractResponse)
async def extract_job_file(file: UploadFile = File(...)) -> ExtractResponse:
    extracted_text, warnings = await extract_text_from_upload(file)
    return ExtractResponse(extracted_text=extracted_text, warnings=warnings)


@router.post("/simplify", response_model=SimplifyResponse)
@router.post("/simplify/", response_model=SimplifyResponse)
def simplify_job_posting(
    body: SimplifyRequest,
    settings: Settings = Depends(get_settings),
) -> SimplifyResponse:
    try:
        return simplify_job_description_with_gemini(body.text, settings)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Simplification failed: {exc!s}",
        ) from exc
