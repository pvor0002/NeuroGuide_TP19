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

SPLIT_CARD_SYSTEM = """You split one long interview brainstorm note into 2-5 separate point cards.

Each point is ONE distinct idea (setting, task/goal, action taken, result/impact, or learning).
Break text apart even when there is no punctuation — this is often spoken brain-dump text.
Look for topic shifts, cause/effect chains ("so I had to...", "because...", "which meant..."),
and "I did X / the outcome was Y" patterns.
Keep the candidate's facts and wording close to the original; do not invent employers, metrics, or events.
If the text is already a single idea, return exactly one point (trimmed, same meaning).
Each point should be at most 2 short sentences and under 320 characters.
Do not use em dashes (—) in any point. Use commas instead.

Return ONLY JSON, no markdown fences: {"points": ["...", "..."]}
Maximum 5 points."""

STAR_SORT_SYSTEM = """You sort interview brainstorm cards into STAR zones for neurodivergent job candidates.

Zones (classic STAR):
- situation: context, setting, constraints, what was going on (before the candidate acted).
- task: the candidate's specific goal, responsibility, or what they were asked to achieve.
- action: what the candidate personally did, steps taken, collaboration they led or contributed.
- result: measurable or concrete outcomes, impact, what changed; reflections may go here if no separate outcome.

Rules:
- Each input card has an "id" string. Output MUST reference those ids exactly — same spelling.
- Every id must appear exactly once across the four arrays (partition).
- If a card mixes zones, pick the best fit; prefer "action" for verbs about what they did.
- Return ONLY JSON, no markdown fences: {"situation":["id",...],"task":[...],"action":[...],"result":[...]}
"""

RESHAPE_SYSTEM = """You rewrite interview answers for neurodivergent candidates: warm, natural spoken English,
not corporate jargon. Preserve facts the candidate stated; do not invent employers, metrics, or degrees.

FORBIDDEN punctuation: em dashes (—). Use commas, colons, or rewrite the sentence instead.

Return ONLY JSON: {"text":"..."} where "text" is the full rewritten answer."""

FORMULATE_SPEECH_SYSTEM = """You turn STAR brainstorm notes into a single conversational interview answer
the candidate reads aloud — like explaining something to a friendly interviewer, not reading a list.

Write ONE continuous story in first person (about 60–90 seconds aloud). Use connected sentences with
natural transitions (so, then, because, after that, which meant). Merge related notes into the same
sentence instead of stacking separate facts.

SOUND LIKE SPEECH:
- Good: "When I joined the team we were still on a legacy API, so I mapped out a week-by-week plan
  and paired with frontend and QA every day. We shipped two days early and cut response times by 45%."
- Bad (bullet/list): "Leverage Java logic. Immersion in Python syntax. Deep-dive into Pandas.
  Study the codebase. Shipped early."

FORBIDDEN: bullet points, numbered lists, dash lists, line breaks between facts, semicolon chains of
tasks, repeating the interview question, STAR headings (Situation/Task/What I did/Result),
filler openers ("Absolutely", "I can tell you about a time"), meta talk about answering,
or em dashes (—). Use commas or rewrite instead of em dashes.

Start directly in the story. Plain spoken English, warm tone, no corporate jargon.
Preserve every fact from the notes; do not invent employers, metrics, tools, or outcomes.

Return ONLY JSON: {"text":"..."} where "text" is the full spoken answer."""

SPEECH_COACH_SYSTEM = """You are a friendly, encouraging speech coach for neurodivergent job candidates
practising interview answers out loud.

Analyse the spoken transcript of a STAR interview answer. Be specific and actionable — never vague.

Return ONLY JSON (no markdown fences):
{
  "star_coverage": {
    "situation": <0–100 how well the Situation was addressed>,
    "task": <0–100 how well the Task/goal was stated>,
    "action": <0–100 how well personal Actions were described>,
    "result": <0–100 how well concrete Results were given>
  },
  "strengths": ["1–2 specific things the candidate did well"],
  "improvements": ["1–2 specific, actionable suggestions (start with a verb)"],
  "filler_words": ["any filler words/phrases detected e.g. 'um', 'like', 'you know'; empty list if none"],
  "readiness_bump": <integer 5–15: 5=basic attempt, 10=solid answer, 15=excellent>,
  "summary": "<one warm encouraging sentence>"
}

Rules:
- Treat this as spoken speech — ignore punctuation and minor repetitions.
- If the written_answer is provided, note gaps between what was written vs spoken.
- Never invent facts the candidate didn't mention.
- Keep strengths and improvements to plain spoken English, max 20 words each.
"""

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


_SPLIT_MIN_CHARS = 180
_SPLIT_FORCE_CHARS = 300
_MAX_POINTS_PER_CARD = 5


def should_split_card_text(text: str) -> bool:
    t = text.strip()
    if len(t) < _SPLIT_MIN_CHARS:
        return False
    parts = [p.strip() for p in re.split(r"(?<=[.!?])\s+", t) if p.strip()]
    # Multiple sentences detected, or text is long enough to force a split.
    if len(parts) >= 2 or len(t) >= _SPLIT_FORCE_CHARS:
        return True
    # Run-on text with no sentence endings (spoken brain dump): still split if long enough.
    has_no_sentence_endings = not re.search(r"[.!?]", t)
    return has_no_sentence_endings and len(t) >= _SPLIT_MIN_CHARS


def heuristic_split_card_text(text: str) -> list[str]:
    """Split long notes on sentence boundaries (no AI)."""
    t = text.strip()
    if not t:
        return []
    if not should_split_card_text(t):
        return [t]

    parts = [p.strip() for p in re.split(r"\n{2,}|(?<=[.!?])\s+", t) if p.strip()]
    if len(parts) <= 1 and len(t) > 300:
        parts = [p.strip() for p in re.split(r";\s+", t) if p.strip()]
    if len(parts) <= 1:
        return [t]

    merged: list[str] = []
    buf = ""
    for part in parts:
        candidate = f"{buf} {part}".strip() if buf else part
        if len(candidate) > 260 and buf:
            merged.append(buf)
            buf = part
        else:
            buf = candidate
    if buf:
        merged.append(buf)

    if len(merged) > _MAX_POINTS_PER_CARD:
        merged = merged[: _MAX_POINTS_PER_CARD - 1] + [
            " ".join(merged[_MAX_POINTS_PER_CARD - 1 :]).strip()
        ]

    return [p for p in merged if p.strip()] or [t]


def _gemini_generate_json(
    client: genai.Client,
    model_chain: list[str],
    *,
    system_instruction: str,
    user_prompt: str,
) -> dict[str, Any]:
    response = None
    last_exc: BaseException | None = None
    for idx, model_name in enumerate(model_chain):
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=user_prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction,
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
        return _parse_json_loose(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail="Could not parse model response.") from exc


def split_card_text_with_gemini(text: str, question: str, settings: Settings) -> list[str]:
    if not settings.gemini_api_key:
        return heuristic_split_card_text(text)

    user_prompt = (
        f"Interview question (context only): {question.strip()}\n\n"
        f"Note to split:\n{text.strip()}\n\n"
        "Return only the JSON object."
    )
    client = genai.Client(api_key=settings.gemini_api_key)
    data = _gemini_generate_json(
        client,
        _gemini_model_fallback_chain(settings.gemini_model),
        system_instruction=SPLIT_CARD_SYSTEM,
        user_prompt=user_prompt,
    )
    points = [str(p).strip() for p in (data.get("points") or []) if str(p).strip()]
    if not points:
        return heuristic_split_card_text(text)
    return points[:_MAX_POINTS_PER_CARD]


def expand_long_cards(
    cards: list[dict[str, str]],
    question: str,
    settings: Settings,
) -> list[dict[str, str]]:
    """Replace long single cards with 2-4 shorter point cards before STAR sort."""
    expanded: list[dict[str, str]] = []
    for card in cards:
        text = card["text"]
        if not should_split_card_text(text):
            expanded.append(card)
            continue
        try:
            points = split_card_text_with_gemini(text, question, settings)
        except HTTPException:
            points = heuristic_split_card_text(text)
        except Exception:
            logger.warning("[InterviewPrep] split failed for card %s, using heuristic", card["id"])
            points = heuristic_split_card_text(text)

        if len(points) <= 1:
            expanded.append({**card, "text": points[0] if points else text})
            continue

        for idx, point in enumerate(points):
            suffix = f"_s{idx + 1}" if len(points) > 1 else ""
            expanded.append({"id": f"{card['id']}{suffix}", "text": point})

    return expanded


def _validate_star_partition(
    card_ids: set[str],
    zones: dict[str, list[str]],
) -> dict[str, list[str]]:
    keys = ("situation", "task", "action", "result")
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
) -> tuple[dict[str, list[str]], list[dict[str, str]]]:
    if not settings.gemini_api_key:
        raise HTTPException(
            status_code=503,
            detail="Gemini API is not configured. Set GEMINI_API_KEY in the backend environment.",
        )

    working_cards = expand_long_cards(cards, question, settings)
    card_ids = {c["id"] for c in working_cards}
    payload = json.dumps(
        {"question": question, "cards": [{"id": c["id"], "text": c["text"]} for c in working_cards]},
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
        zones = _validate_star_partition(
            card_ids,
            {
                "situation": list(data.get("situation") or []),
                "task": list(data.get("task") or []),
                "action": list(data.get("action") or []),
                "result": list(data.get("result") or []),
            },
        )
    except ValueError as exc:
        logger.warning("[InterviewPrep] STAR validation failed: %s | data=%s", exc, data)
        raise HTTPException(
            status_code=502,
            detail="The model returned an invalid STAR partition. Try again or organise manually.",
        ) from exc

    return zones, working_cards


def _format_star_zone_lines(label: str, points: list[str]) -> str:
    cleaned = [p.strip() for p in points if isinstance(p, str) and p.strip()]
    if not cleaned:
        return f"{label}: (none)"
    if len(cleaned) == 1:
        return f"{label}: {cleaned[0]}"
    bullets = "\n".join(f"  - {p}" for p in cleaned)
    return f"{label}:\n{bullets}"


def formulate_speech_from_star_with_gemini(
    question: str,
    *,
    situation: list[str],
    task: list[str],
    action: list[str],
    result: list[str],
    settings: Settings,
) -> str:
    if not settings.gemini_api_key:
        raise HTTPException(
            status_code=503,
            detail="Gemini API is not configured. Set GEMINI_API_KEY in the backend environment.",
        )

    zones_block = "\n\n".join(
        [
            _format_star_zone_lines("Situation", situation),
            _format_star_zone_lines("Task", task),
            _format_star_zone_lines("Action", action),
            _format_star_zone_lines("Result", result),
        ]
    )
    user_prompt = (
        f"Interview question: {question.strip()}\n\n"
        "Organised STAR notes:\n"
        f"{zones_block}\n\n"
        "Return only the JSON object with key \"text\"."
    )

    client = genai.Client(api_key=settings.gemini_api_key)
    data = _gemini_generate_json(
        client,
        _gemini_model_fallback_chain(settings.gemini_model),
        system_instruction=FORMULATE_SPEECH_SYSTEM,
        user_prompt=user_prompt,
    )
    text = (data.get("text") or "").strip()
    if not text:
        raise HTTPException(status_code=502, detail="Model returned empty text.")
    return text


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


def coach_spoken_answer_with_gemini(
    question: str,
    spoken_transcript: str,
    written_answer: str,
    settings: Settings,
) -> dict[str, Any]:
    if not settings.gemini_api_key:
        raise HTTPException(
            status_code=503,
            detail="Gemini API is not configured. Set GEMINI_API_KEY in the backend environment.",
        )

    parts = [
        f"Question: {question.strip()}",
        f"Spoken transcript: {spoken_transcript.strip()}",
    ]
    if written_answer.strip():
        parts.append(f"Written answer (for reference): {written_answer.strip()}")
    parts.append("Return only the JSON object.")
    user_prompt = "\n\n".join(parts)

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
                    system_instruction=SPEECH_COACH_SYSTEM,
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
        raise HTTPException(status_code=502, detail="Could not parse speech coach response.") from exc

    def clamp(v: Any, lo: int = 0, hi: int = 100) -> int:
        try:
            return max(lo, min(hi, int(v)))
        except (TypeError, ValueError):
            return lo

    coverage_raw = data.get("star_coverage") or {}
    return {
        "star_coverage": {
            "situation": clamp(coverage_raw.get("situation", 0)),
            "task": clamp(coverage_raw.get("task", 0)),
            "action": clamp(coverage_raw.get("action", 0)),
            "result": clamp(coverage_raw.get("result", 0)),
        },
        "strengths": [str(s) for s in (data.get("strengths") or []) if s][:2],
        "improvements": [str(s) for s in (data.get("improvements") or []) if s][:2],
        "filler_words": [str(s) for s in (data.get("filler_words") or []) if s][:8],
        "readiness_bump": clamp(data.get("readiness_bump", 10), 0, 20),
        "summary": str(data.get("summary") or "").strip(),
    }


# ── Generate Interview Questions ──────────────────────────────────────────────

_GENERATE_QUESTIONS_SYSTEM = """You write beginner-friendly interview questions for a first-time job applicant.
You will receive the job title, company, a plain-language job summary, the day-to-day responsibilities,
and two skill lists: skills the candidate already has, and skills they are missing.

Generate exactly 4 questions in this fixed order:

Question 1 — KNOWN SKILL question (index 0):
  Pick the first known skill. Connect it to something real in the role or at the company.
  e.g. "Can you walk me through a time you used Python to solve a real problem?"

Question 2 — KNOWN SKILL question (index 1):
  Pick the second known skill (or the first again if only one exists). Use a different sentence structure from question 1.
  e.g. "How has working with SQL shaped the way you think about data?"

Question 3 — MISSING SKILL question (index 2):
  Pick the first missing skill. Be encouraging and practical, not intimidating.
  e.g. "You'll be using Kubernetes here. If you had a week to get started, what would your first steps be?"

Question 4 — COMPANY question (index 3):
  Ask something about the company or role that shows genuine interest or awareness.
  Use the company name, what they do, or what the day-to-day looks like.
  e.g. "What excites you most about working at Acme on their security team?"
  or   "This role involves protecting patient data every day. What draws you to that kind of responsibility?"

Additional rules:
- Every question must use a DIFFERENT sentence structure — no two questions can open the same way.
- Keep each question short (under 30 words), plain, and warm. No jargon.
- Write as if speaking directly to the candidate in a friendly interview.
- If known_skills is empty, write a role-based question instead of questions 1 and 2.
- If missing_skills is empty, write a third known-skill question instead of question 3.
- Return ONLY valid JSON with exactly 4 items: {"questions": ["...", "...", "...", "..."]}
- No markdown fences, no extra keys."""


def generate_interview_questions_with_gemini(
    known_skills: list[str],
    missing_skills: list[str],
    role: str,
    settings: Settings,
    company: str = "",
    summary: str = "",
    responsibilities: str = "",
) -> list[str]:
    """Generate 4 beginner-friendly, skill-based interview questions via Gemini."""
    if not settings.gemini_api_key:
        raise HTTPException(status_code=502, detail="Gemini not configured.")

    client = genai.Client(api_key=settings.gemini_api_key)
    model_chain = _gemini_model_fallback_chain("gemini-2.0-flash")

    known_str = ", ".join(known_skills[:4]) if known_skills else "none"
    missing_str = ", ".join(missing_skills[:4]) if missing_skills else "none"

    prompt_parts = [f"Role: {role.strip() or 'not specified'}"]
    if company.strip():
        prompt_parts.append(f"Company: {company.strip()}")
    if summary.strip():
        prompt_parts.append(f"Job summary: {summary.strip()[:600]}")
    if responsibilities.strip():
        prompt_parts.append(f"Day-to-day responsibilities: {responsibilities.strip()[:800]}")
    prompt_parts.append(f"Skills the candidate already has: {known_str}")
    prompt_parts.append(f"Skills the candidate is missing: {missing_str}")
    prompt_parts.append(
        "\nGenerate exactly 4 questions in order: [0] known skill question, "
        "[1] known skill question (different structure), [2] missing skill question, [3] company question."
    )
    user_prompt = "\n".join(prompt_parts)

    data = _gemini_generate_json(
        client,
        model_chain,
        system_instruction=_GENERATE_QUESTIONS_SYSTEM,
        user_prompt=user_prompt,
    )

    raw_list = data.get("questions") if isinstance(data, dict) else data
    if not isinstance(raw_list, list):
        raise HTTPException(status_code=502, detail="Unexpected response shape from Gemini.")

    questions = [str(q).strip() for q in raw_list if str(q).strip()]
    return questions[:4]
