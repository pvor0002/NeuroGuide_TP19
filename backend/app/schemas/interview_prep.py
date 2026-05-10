"""Schemas for Interview Prep helper endpoints (STAR sort, answer reshape)."""

from pydantic import BaseModel, Field


class DumpCardIn(BaseModel):
    id: str = Field(..., min_length=1, max_length=120)
    text: str = Field(..., min_length=1, max_length=8000)


class StarSortRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    cards: list[DumpCardIn] = Field(..., min_length=1, max_length=80)


class StarSortResponse(BaseModel):
    situation: list[str] = Field(default_factory=list)
    action: list[str] = Field(default_factory=list)
    result: list[str] = Field(default_factory=list)
    learning: list[str] = Field(default_factory=list)


class ReshapeRequest(BaseModel):
    answer: str = Field(..., min_length=1, max_length=50_000)
    instruction: str = Field(..., min_length=1, max_length=500)


class ReshapeResponse(BaseModel):
    text: str
