"""Gemini: generate a personalised day-in-the-life timeline for a job title and ADHD type."""

from __future__ import annotations

import json
import logging
import re
import time
from typing import Any

from fastapi import HTTPException
from google import genai
from google.genai import types

from app.core.config import Settings
from app.schemas.day_in_life import DayInLifeResponse, TimeBlock

logger = logging.getLogger(__name__)

SYSTEM_INSTRUCTION = """You generate realistic day-in-the-life workday timelines for neurodivergent job seekers with ADHD.

Given a job title and ADHD type, return a structured JSON object describing a typical workday for that role.

You must respond with a single JSON object only (no markdown fences), using this exact schema:
{
  "timeline": [
    {
      "time": "9:00 AM",
      "task": "Short task name (under 6 words)",
      "description": "One to two sentences describing what this task involves in plain language.",
      "energy_level": "low" | "medium" | "high" | "break",
      "adhd_tip": "A short, practical ADHD tip for this time block, or null for break blocks."
    }
  ]
}

Rules:
1. Generate 6 to 8 time blocks covering a standard 8-hour workday (roughly 9 AM to 5 PM).
2. energy_level must be exactly one of: "low", "medium", "high", "break". Never null.
3. adhd_tip should be null for "break" energy blocks, and a short (under 15 words) practical tip for all other blocks.
4. Tasks must reflect real responsibilities for the given job title — not generic filler.
5. ADHD type affects the tips:
   - inattentive: tips focus on staying on task, reducing distractions, starting tasks.
   - hyperactive: tips focus on channelling energy, physical movement, short bursts.
   - combined: tips blend both approaches.
6. Include at least one break block (lunch) and vary energy levels across the day.
7. Keep descriptions plain and concrete — no jargon, under 30 words each.
8. Return only the JSON object. No explanation, no markdown.
"""


def _parse_json_loose(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


def _extract_text_from_gemini_response(response: Any) -> str:
    try:
        t = response.text
        return (t or "").strip()
    except ValueError:
        pass
    candidates = getattr(response, "candidates", None) or []
    parts_out: list[str] = []
    for cand in candidates:
        content = getattr(cand, "content", None)
        if not content:
            continue
        for part in getattr(content, "parts", []) or []:
            ptxt = getattr(part, "text", None)
            if ptxt:
                parts_out.append(ptxt)
    return "\n".join(parts_out).strip()


def _is_transient_gemini_capacity_error(exc: BaseException) -> bool:
    s = str(exc).upper()
    return any(
        m in s
        for m in ("503", "UNAVAILABLE", "429", "RESOURCE_EXHAUSTED", "HIGH DEMAND",
                  "OVERLOADED", "RATE LIMIT", "TRY AGAIN LATER")
    )


def _gemini_error_should_fallback_to_next_model(exc: BaseException) -> bool:
    if _is_transient_gemini_capacity_error(exc):
        return True
    s = str(exc).upper()
    return ("404" in s and ("NOT_FOUND" in s or "NOT FOUND" in s)) or "NO LONGER AVAILABLE" in s


def _gemini_model_fallback_chain(primary: str) -> list[str]:
    ordered = (
        primary.strip() or "gemini-2.5-flash",
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
        "gemini-2.5-pro",
    )
    seen: set[str] = set()
    out: list[str] = []
    for m in ordered:
        if m and m not in seen:
            seen.add(m)
            out.append(m)
    return out


def generate_day_in_life_with_gemini(
    job_title: str,
    adhd_type: str,
    settings: Settings,
) -> DayInLifeResponse:
    logger.info(
        "[DayInLife] generate_day_in_life_with_gemini called: job_title=%r, adhd_type=%r",
        job_title,
        adhd_type,
    )

    if not settings.gemini_api_key:
        raise HTTPException(
            status_code=503,
            detail="Gemini API is not configured. Set GEMINI_API_KEY in the backend environment.",
        )

    user_prompt = (
        f"Job title: {job_title.strip()}\n"
        f"ADHD type: {adhd_type.strip()}\n\n"
        "Generate a realistic day-in-the-life workday timeline for this role and ADHD type. "
        "Return only the JSON object."
    )

    try:
        client = genai.Client(api_key=settings.gemini_api_key)
        model_chain = _gemini_model_fallback_chain(settings.gemini_model)
        logger.info("[DayInLife] Model fallback chain: %s", model_chain)

        response = None
        last_exc: BaseException | None = None
        for idx, model_name in enumerate(model_chain):
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=user_prompt,
                    config=types.GenerateContentConfig(
                        system_instruction=SYSTEM_INSTRUCTION,
                        response_mime_type="application/json",
                    ),
                )
                logger.info("[DayInLife] generate_content succeeded with model=%s", model_name)
                break
            except Exception as exc:
                last_exc = exc
                if _gemini_error_should_fallback_to_next_model(exc) and idx < len(model_chain) - 1:
                    logger.warning("[DayInLife] Retryable error on model=%s — trying next", model_name)
                    if _is_transient_gemini_capacity_error(exc):
                        time.sleep(min(2.0, 0.4 + idx * 0.35))
                    continue
                raise HTTPException(
                    status_code=502,
                    detail=f"Gemini request failed: {exc!s}",
                ) from exc

        if response is None:
            raise HTTPException(
                status_code=502,
                detail=f"Gemini request failed: {last_exc!s}" if last_exc else "Gemini request failed.",
            )

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("[DayInLife] Unexpected error: %s: %s", type(exc).__name__, exc)
        raise HTTPException(status_code=502, detail=f"Gemini request failed: {exc!s}") from exc

    raw = _extract_text_from_gemini_response(response)
    if not raw:
        raise HTTPException(
            status_code=502,
            detail="Gemini returned no usable text.",
        )

    logger.info("[DayInLife] Raw response length=%d — parsing JSON", len(raw))
    try:
        data = _parse_json_loose(raw)
    except json.JSONDecodeError as exc:
        logger.error("[DayInLife] JSON parse failed: %s | preview: %.2000s", exc, raw)
        raise HTTPException(
            status_code=502,
            detail="Could not parse Gemini response as JSON.",
        ) from exc

    raw_timeline = data.get("timeline")
    if not isinstance(raw_timeline, list) or not raw_timeline:
        logger.error("[DayInLife] timeline missing or empty in response: %s", data)
        raise HTTPException(
            status_code=502,
            detail="Gemini response did not include a timeline.",
        )

    timeline: list[TimeBlock] = []
    for block in raw_timeline:
        if not isinstance(block, dict):
            continue
        timeline.append(
            TimeBlock(
                time=str(block.get("time") or "").strip(),
                task=str(block.get("task") or "").strip(),
                description=str(block.get("description") or "").strip(),
                energy_level=str(block.get("energy_level") or "medium").strip(),
                adhd_tip=block.get("adhd_tip") or None,
            )
        )

    if not timeline:
        raise HTTPException(
            status_code=502,
            detail="Gemini returned an empty timeline.",
        )

    logger.info("[DayInLife] Timeline built with %d blocks", len(timeline))
    return DayInLifeResponse(
        job_title=job_title,
        adhd_type=adhd_type,
        data_source="gemini",
        timeline=timeline,
    )