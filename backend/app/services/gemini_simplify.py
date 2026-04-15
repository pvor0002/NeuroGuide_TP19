"""Gemini: verify content is a job description, then produce ADHD/autism-friendly structured output."""

from __future__ import annotations

import json
import re
from typing import Any

import google.generativeai as genai
from fastapi import HTTPException

from app.core.config import Settings
from app.schemas.job_description import SimplifyResponse

SYSTEM_INSTRUCTION = """You are assisting neurodivergent job seekers (including ADHD and autism).
You receive text that may be a job posting or may be unrelated content.

You must respond with a single JSON object only (no markdown fences), using this exact schema:
{
  "is_job_description": boolean,
  "rejection_reason": string or null,
  "summary": string or null,
  "basic_info": string or null,
  "responsibilities": string or null,
  "skills_qualifications": string or null
}

Rules:
1. Set is_job_description to true only if the text is clearly a job posting, vacancy, role description,
   or similar hiring content. Set it to false for stories, emails, random text, homework, etc.
2. If is_job_description is false, set rejection_reason to a short, kind explanation. Other fields must be null.
3. If is_job_description is true, fill all four content fields:
   - summary: A gentle, plain-language overview (short paragraphs, bullets OK). Optimize for clarity and
     reduced cognitive load (concrete language, avoid jargon where possible, note structure explicitly).
   - basic_info: Title, employer if stated, location/work arrangement, employment type, pay if stated, schedule.
   - responsibilities: What the person will do day-to-day, in scannable form.
   - skills_qualifications: Required and preferred skills, education, certifications, experience.
4. Do not invent employer names, salary, or requirements not present in the source; you may say "not stated" where missing.
"""


def _parse_json_loose(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


def _extract_text_from_gemini_response(response: Any) -> str:
    """Safely read model output. `response.text` raises ValueError when blocked or malformed."""
    try:
        t = response.text
        return (t or "").strip()
    except ValueError:
        pass
    candidates = getattr(response, "candidates", None) or []
    if not candidates:
        return ""
    parts_out: list[str] = []
    for cand in candidates:
        content = getattr(cand, "content", None)
        if not content:
            continue
        for part in getattr(content, "parts", []) or []:
            t = getattr(part, "text", None)
            if t:
                parts_out.append(t)
    return "\n".join(parts_out).strip()


def simplify_job_description_with_gemini(text: str, settings: Settings) -> SimplifyResponse:
    if not settings.gemini_api_key:
        raise HTTPException(
            status_code=503,
            detail="Gemini API is not configured. Set GEMINI_API_KEY in the backend environment.",
        )

    genai.configure(api_key=settings.gemini_api_key)

    user_prompt = (
        "Analyze the following text.\n\n---\n"
        + text.strip()
        + "\n---\n\nReturn only the JSON object as specified."
    )

    try:
        try:
            model = genai.GenerativeModel(
                model_name=settings.gemini_model,
                system_instruction=SYSTEM_INSTRUCTION,
            )
            prompt = user_prompt
        except TypeError:
            model = genai.GenerativeModel(model_name=settings.gemini_model)
            prompt = f"{SYSTEM_INSTRUCTION}\n\n{user_prompt}"

        try:
            response = model.generate_content(
                prompt,
                generation_config=genai.GenerationConfig(
                    response_mime_type="application/json",
                ),
            )
        except Exception as first_exc:
            # JSON response mode is not supported for all model/SDK combos — retry without it.
            try:
                response = model.generate_content(prompt)
            except Exception as second_exc:
                raise HTTPException(
                    status_code=502,
                    detail=f"Gemini request failed: {second_exc!s}",
                ) from second_exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Gemini request failed: {exc!s}",
        ) from exc

    raw = _extract_text_from_gemini_response(response)
    if not raw:
        raise HTTPException(
            status_code=502,
            detail=(
                "Gemini returned no usable text (it may have been blocked or the model name may be wrong). "
                "Check GEMINI_MODEL in backend/.env (e.g. gemini-2.5-flash), billing/quota, or shorten the input."
            ),
        )

    try:
        data = _parse_json_loose(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=502,
            detail="Could not parse model response as JSON.",
        ) from exc

    if not data.get("is_job_description"):
        reason = data.get("rejection_reason") or "This does not look like a job posting."
        raise HTTPException(status_code=422, detail=str(reason))

    summary = (data.get("summary") or "").strip()
    basic_info = (data.get("basic_info") or "").strip()
    responsibilities = (data.get("responsibilities") or "").strip()
    skills = (data.get("skills_qualifications") or "").strip()

    if not any((summary, basic_info, responsibilities, skills)):
        raise HTTPException(
            status_code=502,
            detail="The model did not return usable content for this job description.",
        )

    return SimplifyResponse(
        summary=summary or "—",
        basic_info=basic_info or "—",
        responsibilities=responsibilities or "—",
        skills_qualifications=skills or "—",
    )
