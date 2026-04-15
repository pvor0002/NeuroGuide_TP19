from pydantic import BaseModel, Field


class SimplifyRequest(BaseModel):
    text: str = Field(
        ...,
        min_length=1,
        max_length=200_000,
        description="Raw job posting text from paste or extracted file.",
    )


class SimplifyResponse(BaseModel):
    summary: str
    basic_info: str
    responsibilities: str
    skills_qualifications: str


class ExtractResponse(BaseModel):
    extracted_text: str
    warnings: list[str] = Field(default_factory=list)
