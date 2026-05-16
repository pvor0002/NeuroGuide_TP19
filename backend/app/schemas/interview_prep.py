"""Schemas for Interview Prep helper endpoints (STAR sort, answer reshape)."""

from pydantic import BaseModel, Field


class DumpCardIn(BaseModel):
    id: str = Field(..., min_length=1, max_length=120)
    text: str = Field(..., min_length=1, max_length=8000)


class StarSortRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    cards: list[DumpCardIn] = Field(..., min_length=1, max_length=80)


class DumpCardOut(BaseModel):
    id: str
    text: str


class StarSortResponse(BaseModel):
    situation: list[str] = Field(default_factory=list)
    task: list[str] = Field(default_factory=list)
    action: list[str] = Field(default_factory=list)
    result: list[str] = Field(default_factory=list)
    """Cards after splitting long notes into separate points (same shape as request)."""
    cards: list[DumpCardOut] = Field(default_factory=list)


class SplitBrainDumpRequest(BaseModel):
    question: str = Field(default="", max_length=2000)
    text: str = Field(..., min_length=1, max_length=8000)


class SplitBrainDumpResponse(BaseModel):
    points: list[str] = Field(default_factory=list)


class ReshapeRequest(BaseModel):
    answer: str = Field(..., min_length=1, max_length=50_000)
    instruction: str = Field(..., min_length=1, max_length=500)


class ReshapeResponse(BaseModel):
    text: str


# ── Speech Coach ──────────────────────────────────────────────────────────────

class SpeechCoachRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    written_answer: str = Field(default="", max_length=50_000)
    spoken_transcript: str = Field(..., min_length=1, max_length=50_000)


class StarCoverage(BaseModel):
    situation: int = Field(0, ge=0, le=100)
    task: int = Field(0, ge=0, le=100)
    action: int = Field(0, ge=0, le=100)
    result: int = Field(0, ge=0, le=100)


class SpeechCoachResponse(BaseModel):
    star_coverage: StarCoverage
    strengths: list[str] = Field(default_factory=list)
    improvements: list[str] = Field(default_factory=list)
    filler_words: list[str] = Field(default_factory=list)
    readiness_bump: int = Field(0, ge=0, le=20)
    summary: str = ""
