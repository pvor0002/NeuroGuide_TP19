"""Gemini helpers for Interview Prep: STAR card sorting and answer reshaping."""

from __future__ import annotations

import json
import logging
import re
import time
from typing import Any

from google import genai
from google.genai import types
from fastapi import HTTPException

from app.core.config import Settings

logger = logging.getLogger(__name__)

STAR_SORT_SYSTEM = """You sort interview brainstorm cards into STAR zones for neurodivergent job candidates.

Zones:
- situation: context, setting, constraints, what was going on (before the candidate acted).
- action: what the candidate personally did, steps taken, collaboration they led or contributed.
- result: measurable or concrete outcomes, impact, what changed for the team/org/customer.
- learning: reflections, takeaways, what they'd do differently, growth — not raw outcomes.

Rules:
- Each input card has an "id" string. Output MUST reference those ids exactly — same spelling.
- Every id must appear exactly once across the four arrays (partition).
- If a card mixes zones, pick the best fit; prefer "action" for verbs about what they did.
- Return ONLY JSON, no markdown fences: {"situation":["id",...],"action":[...],"result":[...],"learning":[...]}
"""

RESHAPE_SYSTEM = """You rewrite interview answers for neurodivergent candidates: warm, natural spoken English,
not corporate jargon. Preserve facts the candidate stated; do not invent employers, metrics, or degrees.

Return ONLY JSON: {"text":"..."} where "text" is the full rewritten answer."""

_JSON_FENCE_RE = re.compile(r"^```(?:json)?\s*", re.I)


def _parse_json_loose(text: str) -> dict[str, Any]:
    t = text.strip()
    if t.startswith("```"):
        t = _JSON_FENCE_RE.sub("", t)
        t = re.sub(r"\s*```$", "", t)
    return json.loads(t)


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
        for m in (
            "503",
            "UNAVAILABLE",
            "429",
            "RESOURCE_EXHAUSTED",
            "HIGH DEMAND",
            "OVERLOADED",
            "RATE LIMIT",
            "TRY AGAIN LATER",
        )
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


def _validate_star_partition(
    card_ids: set[str],
    zones: dict[str, list[str]],
) -> dict[str, list[str]]:
    keys = ("situation", "action", "result", "learning")
    flat: list[str] = []
    for k in keys:
        for cid in zones.get(k) or []:
            if isinstance(cid, str) and cid.strip():
                flat.append(cid.strip())
    if len(flat) != len(card_ids):
        raise ValueError("STAR partition length mismatch")
    if set(flat) != card_ids:
        raise ValueError("STAR partition id mismatch")
    return {k: [x for x in (zones.get(k) or []) if isinstance(x, str) and x.strip()] for k in keys}


def star_sort_cards_with_gemini(
    question: str,
    cards: list[dict[str, str]],
    settings: Settings,
) -> dict[str, list[str]]:
    if not settings.gemini_api_key:
        raise HTTPException(
            status_code=503,
            detail="Gemini API is not configured. Set GEMINI_API_KEY in the backend environment.",
        )

    card_ids = {c["id"] for c in cards}
    payload = json.dumps(
        {"question": question, "cards": [{"id": c["id"], "text": c["text"]} for c in cards]},
        ensure_ascii=False,
    )
    user_prompt = (
        "Assign each card id to exactly one STAR zone.\n\n"
        f"{payload}\n\nReturn only the JSON object."
    )

    client = genai.Client(api_key=settings.gemini_api_key)
    model_chain = _gemini_model_fallback_chain(settings.gemini_model)
    response = None
    last_exc: BaseException | None = None
    for idx, model_name in enumerate(model_chain):
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=user_prompt,
                config=types.GenerateContentConfig(
                    system_instruction=STAR_SORT_SYSTEM,
                    response_mime_type="application/json",
                ),
            )
            break
        except Exception as exc:
            last_exc = exc
            if _gemini_error_should_fallback_to_next_model(exc) and idx < len(model_chain) - 1:
                if _is_transient_gemini_capacity_error(exc):
                    time.sleep(min(2.0, 0.4 + idx * 0.35))
                continue
            raise HTTPException(status_code=502, detail=f"Gemini request failed: {exc!s}") from exc

    if response is None:
        raise HTTPException(
            status_code=502,
            detail=f"Gemini request failed: {last_exc!s}" if last_exc else "Gemini request failed.",
        )

    raw = _extract_text_from_gemini_response(response)
    if not raw:
        raise HTTPException(status_code=502, detail="Gemini returned no usable text.")

    try:
        data = _parse_json_loose(raw)
    except json.JSONDecodeError as exc:
        logger.warning("[InterviewPrep] STAR JSON parse failed: %s", exc)
        raise HTTPException(status_code=502, detail="Could not parse STAR sort response.") from exc

    try:
        return _validate_star_partition(
            card_ids,
            {
                "situation": list(data.get("situation") or []),
                "action": list(data.get("action") or []),
                "result": list(data.get("result") or []),
                "learning": list(data.get("learning") or []),
            },
        )
    except ValueError as exc:
        logger.warning("[InterviewPrep] STAR validation failed: %s | data=%s", exc, data)
        raise HTTPException(
            status_code=502,
            detail="The model returned an invalid STAR partition. Try again or organise manually.",
        ) from exc


def reshape_answer_with_gemini(answer: str, instruction: str, settings: Settings) -> str:
    if not settings.gemini_api_key:
        raise HTTPException(
            status_code=503,
            detail="Gemini API is not configured. Set GEMINI_API_KEY in the backend environment.",
        )

    user_prompt = (
        f"Instruction: {instruction.strip()}\n\n"
        "---\n"
        f"{answer.strip()}\n"
        "---\n\n"
        "Return only the JSON object with key \"text\"."
    )

    client = genai.Client(api_key=settings.gemini_api_key)
    model_chain = _gemini_model_fallback_chain(settings.gemini_model)
    response = None
    last_exc: BaseException | None = None
    for idx, model_name in enumerate(model_chain):
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=user_prompt,
                config=types.GenerateContentConfig(
                    system_instruction=RESHAPE_SYSTEM,
                    response_mime_type="application/json",
                ),
            )
            break
        except Exception as exc:
            last_exc = exc
            if _gemini_error_should_fallback_to_next_model(exc) and idx < len(model_chain) - 1:
                if _is_transient_gemini_capacity_error(exc):
                    time.sleep(min(2.0, 0.4 + idx * 0.35))
                continue
            raise HTTPException(status_code=502, detail=f"Gemini request failed: {exc!s}") from exc

    if response is None:
        raise HTTPException(
            status_code=502,
            detail=f"Gemini request failed: {last_exc!s}" if last_exc else "Gemini request failed.",
        )

    raw = _extract_text_from_gemini_response(response)
    if not raw:
        raise HTTPException(status_code=502, detail="Gemini returned no usable text.")

    try:
        data = _parse_json_loose(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="Could not parse reshape response.") from exc

    text = (data.get("text") or "").strip()
    if not text:
        raise HTTPException(status_code=502, detail="Model returned empty text.")
    return text
