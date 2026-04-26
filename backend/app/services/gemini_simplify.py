"""Gemini: verify content is a job description, then produce ADHD/autism-friendly structured output."""

from __future__ import annotations

import json
import re
from typing import Any

import google.generativeai as genai
from fastapi import HTTPException

from app.core.config import Settings
from app.schemas.job_description import (
    CombinedProfile,
    HyperactiveProfile,
    InattentiveProfile,
    SimplifyResponse,
)

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

   quick_snapshot: Exactly 3 strings. Each is a top must-have requirement, under 10 words, no bullet prefix.
     Choose the 3 eligibility gates that matter most (e.g. location, rights to work, commitment).

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
        except Exception:
            # JSON response mode is not supported for all model/SDK combos - retry without it.
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

    # quick_snapshot: ensure exactly 3 items
    raw_snapshot = data.get("quick_snapshot")
    snapshot = _to_str_list(raw_snapshot, min_len=3)[:3]

    return SimplifyResponse(
        summary=summary or "-",
        basic_info=basic_info or "-",
        responsibilities=responsibilities or "-",
        skills_qualifications=skills or "-",
        quick_snapshot=snapshot,
        profile_inattentive=_parse_inattentive(data.get("profile_inattentive")),
        profile_hyperactive=_parse_hyperactive(data.get("profile_hyperactive")),
        profile_combined=_parse_combined(data.get("profile_combined")),
    )
