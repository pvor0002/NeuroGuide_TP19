"""Gemini: verify content is a job description, then produce ADHD/autism-friendly structured output."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from google import genai
from google.genai import types
from fastapi import HTTPException

from app.core.config import Settings
from app.schemas.job_description import (
    CombinedProfile,
    HyperactiveProfile,
    InattentiveProfile,
    SimplifyResponse,
)

logger = logging.getLogger(__name__)

SYSTEM_INSTRUCTION = """You are assisting neurodivergent job seekers (including ADHD and autism).
You receive text that may be a job posting or may be unrelated content.

You must respond with a single JSON object only (no markdown fences), using this exact schema:
{
  "is_job_description": boolean,
  "rejection_reason": string or null,
  "summary": string or null,
  "basic_info": string or null,
  "responsibilities": string or null,
  "skills_qualifications": string or null,
  "quick_snapshot": array of exactly 3 strings or null,
  "profile_inattentive": object or null,
  "profile_hyperactive": object or null,
  "profile_combined": object or null
}

Profile object shapes (required when is_job_description is true):

profile_inattentive: {
  "job_summary": [string, string],
  "what_you_do": [string, string, ...],
  "skills_you_learn": [string, string, ...],
  "requirements": [string, string, ...],
  "important_notes": [string, string, ...]
}

profile_hyperactive: {
  "headline": string,
  "why_exciting": [string, string, ...],
  "what_you_do": [string, string, ...],
  "programme_flow": [string, string, ...],
  "must_know": [string, string, ...],
  "is_this_for_you": [string, string, ...]
}

profile_combined: {
  "quick_overview": [string, string],
  "what_makes_it_good": [string, string, string],
  "what_you_learn": [string, string, ...],
  "simple_steps": [string, string, ...],
  "requirements": [string, string, string],
  "important": [string, string]
}

Rules:
1. Set is_job_description to true only if the text is clearly a job posting, vacancy, role description,
   or similar hiring content. Set it to false for stories, emails, random text, homework, etc.
2. If is_job_description is false, set rejection_reason to a short, kind explanation. All other fields must be null.
3. If is_job_description is true, fill ALL content fields including all three profiles:

   summary: A gentle, plain-language overview (short paragraphs, bullets OK). Optimize for clarity and
     reduced cognitive load (concrete language, avoid jargon where possible).
   basic_info: Title, employer if stated, location/work arrangement, employment type, pay if stated, schedule.
   responsibilities: The 3-4 most important day-to-day duties. Each line short (under 12 words),
     action-first, easy to scan. Use "- " bullet prefix.
   skills_qualifications: The 3-4 most important required skills. Each line short (under 10 words),
     concrete, easy to scan. Use "- " bullet prefix.

   quick_snapshot: Exactly 3 strings. Each must START with a single relevant emoji, then a space, then the
     requirement text (under 9 words, no bullet prefix). Choose emojis that match the content:
     📍 location/city, 🌏 citizenship/work rights, ⏰ time commitment/full-time, 🎓 education/degree,
     💼 experience/skills, 🚗 licence/transport, 🔒 background check, 📅 availability/start date, ✅ eligibility.
     Example: ["🌏 Full working rights in Australia", "📍 Based in Sydney or Melbourne", "⏰ Full-time commitment required"]

   profile_inattentive (calm & structured, minimal overload):
     job_summary: exactly 2 strings — first line is role + employer, second is the main hook/incentive.
     what_you_do: 3-5 strings, action-first, under 10 words each, no bullet prefix.
     skills_you_learn: 3-5 strings, concrete skill names, under 8 words each.
     requirements: 3-5 strings, checklist tone ("Must live in AUS", "Full working rights needed"), under 10 words.
     important_notes: 2-3 strings, key constraints ("No visa sponsorship", "Full-time Mon–Fri").

   profile_hyperactive (energetic, action-oriented, fast-paced):
     headline: 1 energetic string — the biggest exciting hook for this role.
     why_exciting: 3-4 strings, motivating bullet reasons starting with a strong word.
     what_you_do: 3-4 strings, punchy action verbs, maximum energy.
     programme_flow: 3-5 ordered strings describing the candidate journey (e.g. "Apply now", "Train 8 weeks", "Start paid placement").
     must_know: 2-3 strings, hard constraints the candidate must accept.
     is_this_for_you: 3-4 strings, fit-check statements starting with "Like", "Want", "Ready", or "Okay with".

   profile_combined (balanced structure + engagement):
     quick_overview: exactly 2 strings summarising the opportunity.
     what_makes_it_good: exactly 3 strings, value propositions.
     what_you_learn: 3-4 strings, skill areas.
     simple_steps: 3-5 ordered strings (numbered journey steps, plain language).
     requirements: exactly 3 strings, top must-haves.
     important: exactly 2 strings, key watch-outs.

4. Do not invent employer names, salary, or requirements not present in the source; you may say "not stated" where missing.
5. For responsibilities and skills_qualifications, use "- " bullet prefix. Profile array items must NOT have bullet prefixes.
"""


def _parse_json_loose(text: str) -> dict[str, Any]:
    # Parse model output even if it wrapped JSON in markdown code fences.
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


def _extract_text_from_gemini_response(response: Any) -> str:
    # Safely read model output. `response.text` raises ValueError when blocked or malformed.
    logger.info("[Gemini] Extracting text from response (type=%s)", type(response).__name__)
    try:
        t = response.text
        result = (t or "").strip()
        logger.info("[Gemini] response.text succeeded, length=%d", len(result))
        return result
    except ValueError as e:
        logger.warning("[Gemini] response.text raised ValueError: %s — falling back to candidates", e)
    candidates = getattr(response, "candidates", None) or []
    logger.info("[Gemini] Falling back to candidates, count=%d", len(candidates))
    if not candidates:
        logger.error("[Gemini] No candidates in response — likely blocked or empty")
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
    result = "\n".join(parts_out).strip()
    logger.info("[Gemini] Extracted from candidates, length=%d", len(result))
    return result


def _to_str_list(value: Any, *, min_len: int = 1, fill: str = "-") -> list[str]:
    """Coerce a JSON value to a list of non-empty strings with a floor length."""
    if isinstance(value, list):
        cleaned = [str(v).strip() for v in value if str(v).strip()]
    elif isinstance(value, str) and value.strip():
        cleaned = [value.strip()]
    else:
        cleaned = []
    while len(cleaned) < min_len:
        cleaned.append(fill)
    return cleaned


def _parse_inattentive(raw: Any) -> InattentiveProfile:
    d = raw if isinstance(raw, dict) else {}
    return InattentiveProfile(
        job_summary=_to_str_list(d.get("job_summary"), min_len=2),
        what_you_do=_to_str_list(d.get("what_you_do"), min_len=1),
        skills_you_learn=_to_str_list(d.get("skills_you_learn"), min_len=1),
        requirements=_to_str_list(d.get("requirements"), min_len=1),
        important_notes=_to_str_list(d.get("important_notes"), min_len=1),
    )


def _parse_hyperactive(raw: Any) -> HyperactiveProfile:
    d = raw if isinstance(raw, dict) else {}
    return HyperactiveProfile(
        headline=str(d.get("headline") or "Exciting opportunity — read on!").strip(),
        why_exciting=_to_str_list(d.get("why_exciting"), min_len=1),
        what_you_do=_to_str_list(d.get("what_you_do"), min_len=1),
        programme_flow=_to_str_list(d.get("programme_flow"), min_len=1),
        must_know=_to_str_list(d.get("must_know"), min_len=1),
        is_this_for_you=_to_str_list(d.get("is_this_for_you"), min_len=1),
    )


def _parse_combined(raw: Any) -> CombinedProfile:
    d = raw if isinstance(raw, dict) else {}
    return CombinedProfile(
        quick_overview=_to_str_list(d.get("quick_overview"), min_len=2),
        what_makes_it_good=_to_str_list(d.get("what_makes_it_good"), min_len=3),
        what_you_learn=_to_str_list(d.get("what_you_learn"), min_len=1),
        simple_steps=_to_str_list(d.get("simple_steps"), min_len=1),
        requirements=_to_str_list(d.get("requirements"), min_len=3),
        important=_to_str_list(d.get("important"), min_len=2),
    )


def simplify_job_description_with_gemini(text: str, settings: Settings) -> SimplifyResponse:
    # Call Gemini with our system prompt; return structured fields or raise HTTPException.
    logger.info("[Gemini] simplify_job_description_with_gemini called, text length=%d", len(text))

    if not settings.gemini_api_key:
        logger.error("[Gemini] GEMINI_API_KEY is not set — returning 503")
        raise HTTPException(
            status_code=503,
            detail="Gemini API is not configured. Set GEMINI_API_KEY in the backend environment.",
        )

    logger.info("[Gemini] Using model=%s", settings.gemini_model)

    user_prompt = (
        "Analyze the following text.\n\n---\n"
        + text.strip()
        + "\n---\n\nReturn only the JSON object as specified."
    )

    try:
        logger.info("[Gemini] Creating genai.Client")
        client = genai.Client(api_key=settings.gemini_api_key)
        logger.info("[Gemini] Client created — calling generate_content with JSON response mode")
        try:
            response = client.models.generate_content(
                model=settings.gemini_model,
                contents=user_prompt,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_INSTRUCTION,
                    response_mime_type="application/json",
                ),
            )
            logger.info("[Gemini] generate_content (JSON mode) completed successfully")
        except Exception as first_exc:
            logger.warning(
                "[Gemini] generate_content with JSON mode failed (%s: %s) — retrying without JSON mode",
                type(first_exc).__name__, first_exc,
            )
            # JSON response mode is not supported for this model — retry without it.
            try:
                response = client.models.generate_content(
                    model=settings.gemini_model,
                    contents=f"{SYSTEM_INSTRUCTION}\n\n{user_prompt}",
                )
                logger.info("[Gemini] generate_content (plain mode) completed successfully")
            except Exception as second_exc:
                logger.error("[Gemini] generate_content plain mode also failed: %s", second_exc)
                raise HTTPException(
                    status_code=502,
                    detail=f"Gemini request failed: {second_exc!s}",
                ) from second_exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("[Gemini] Unexpected error during Gemini call: %s: %s", type(exc).__name__, exc)
        raise HTTPException(
            status_code=502,
            detail=f"Gemini request failed: {exc!s}",
        ) from exc

    raw = _extract_text_from_gemini_response(response)
    if not raw:
        logger.error("[Gemini] No usable text extracted from response")
        raise HTTPException(
            status_code=502,
            detail=(
                "Gemini returned no usable text (it may have been blocked or the model name may be wrong). "
                "Check GEMINI_MODEL in backend/.env (e.g. gemini-2.5-flash), billing/quota, or shorten the input."
            ),
        )

    logger.info("[Gemini] Raw response length=%d — parsing JSON", len(raw))
    try:
        data = _parse_json_loose(raw)
        logger.info("[Gemini] JSON parsed OK, keys=%s", list(data.keys()))
    except json.JSONDecodeError as exc:
        logger.error("[Gemini] JSON parse failed: %s | raw preview: %.200s", exc, raw)
        raise HTTPException(
            status_code=502,
            detail="Could not parse model response as JSON.",
        ) from exc

    if not data.get("is_job_description"):
        reason = data.get("rejection_reason") or "This does not look like a job posting."
        logger.info("[Gemini] is_job_description=false, reason=%s", reason)
        raise HTTPException(status_code=422, detail=str(reason))

    logger.info("[Gemini] is_job_description=true — extracting content fields")

    summary = (data.get("summary") or "").strip()
    basic_info = (data.get("basic_info") or "").strip()
    responsibilities = (data.get("responsibilities") or "").strip()
    skills = (data.get("skills_qualifications") or "").strip()

    logger.info(
        "[Gemini] Field lengths — summary=%d, basic_info=%d, responsibilities=%d, skills=%d",
        len(summary), len(basic_info), len(responsibilities), len(skills),
    )

    if not any((summary, basic_info, responsibilities, skills)):
        logger.error("[Gemini] All content fields are empty")
        raise HTTPException(
            status_code=502,
            detail="The model did not return usable content for this job description.",
        )

    # quick_snapshot: ensure exactly 3 items
    raw_snapshot = data.get("quick_snapshot")
    snapshot = _to_str_list(raw_snapshot, min_len=3)[:3]
    logger.info("[Gemini] quick_snapshot=%s", snapshot)

    has_inattentive = data.get("profile_inattentive") is not None
    has_hyperactive = data.get("profile_hyperactive") is not None
    has_combined = data.get("profile_combined") is not None
    logger.info(
        "[Gemini] Profiles present — inattentive=%s, hyperactive=%s, combined=%s",
        has_inattentive, has_hyperactive, has_combined,
    )

    result = SimplifyResponse(
        summary=summary or "-",
        basic_info=basic_info or "-",
        responsibilities=responsibilities or "-",
        skills_qualifications=skills or "-",
        quick_snapshot=snapshot,
        profile_inattentive=_parse_inattentive(data.get("profile_inattentive")),
        profile_hyperactive=_parse_hyperactive(data.get("profile_hyperactive")),
        profile_combined=_parse_combined(data.get("profile_combined")),
    )
    logger.info("[Gemini] SimplifyResponse built successfully — returning")
    return result
