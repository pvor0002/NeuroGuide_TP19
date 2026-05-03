from pydantic import BaseModel, Field

from app.schemas.job_fit_features import GeminiJobFitFeatures


class SimplifyRequest(BaseModel):
    """Body for POST /job-description/simplify: raw posting text."""

    text: str = Field(
        ...,
        min_length=1,
        max_length=200_000,
        description="Raw job posting text from paste or extracted file.",
    )


# ---------------------------------------------------------------------------
# Profile models – one per ADHD presentation style
# ---------------------------------------------------------------------------

class InattentiveProfile(BaseModel):
    """Calm, structured layout for ADHD-Inattentive readers."""

    job_summary: list[str]       # exactly 2 short lines: role + key hook
    what_you_do: list[str]       # 3-5 day-to-day duties, action-first
    skills_you_learn: list[str]  # 3-5 concrete skills
    requirements: list[str]      # 3-5 must-have eligibility items (checklist)
    important_notes: list[str]   # 2-3 key constraints / watch-outs


class HyperactiveProfile(BaseModel):
    """Energetic, action-oriented layout for ADHD-Hyperactive readers."""

    headline: str                # 1 punchy excitement hook
    why_exciting: list[str]      # 3-4 motivating reasons to apply
    what_you_do: list[str]       # 3-4 action-verb duties
    programme_flow: list[str]    # 3-5 ordered programme steps
    must_know: list[str]         # 2-3 hard constraints
    is_this_for_you: list[str]   # 3-4 fit-check statements


class CombinedProfile(BaseModel):
    """Balanced structure + engagement for ADHD-Combined readers."""

    quick_overview: list[str]        # exactly 2 summary lines
    what_makes_it_good: list[str]    # exactly 3 value propositions
    what_you_learn: list[str]        # 3-4 skills / areas
    simple_steps: list[str]          # 3-5 ordered steps to join
    requirements: list[str]          # exactly 3 must-haves
    important: list[str]             # exactly 2 key notes


# ---------------------------------------------------------------------------
# Main response
# ---------------------------------------------------------------------------

class SimplifyResponse(BaseModel):
    """What Gemini returns after simplifying: four text sections + profiles."""

    summary: str
    basic_info: str
    responsibilities: str
    skills_qualifications: str

    # Quick Snapshot: exactly 3 must-have requirement chips pinned at top
    quick_snapshot: list[str]

    # Job scoring fields: extracted by Gemini for use with the scoring model
    job_title: str = Field(default="", description="Extracted job title (e.g. 'Software Developer')")
    extracted_skills: list[str] = Field(default_factory=list, description="Key skills extracted from the posting")

    job_fit_features: GeminiJobFitFeatures = Field(
        default_factory=GeminiJobFitFeatures,
        description=(
            "Structured job environment (task shape, pace, load) for ADHD preference matching"
        ),
    )

    # Per-profile structured data
    profile_inattentive: InattentiveProfile
    profile_hyperactive: HyperactiveProfile
    profile_combined: CombinedProfile


class ExtractResponse(BaseModel):
    """Result of POST /job-description/extract: plain text plus any parser warnings."""

    extracted_text: str
    warnings: list[str] = Field(default_factory=list)
