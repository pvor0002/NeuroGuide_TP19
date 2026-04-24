from typing import Any

from pydantic import BaseModel, Field


class ProfilePayload(BaseModel):
    """Request body for create/update — just the wizard's JSON blob."""

    profile: dict[str, Any] = Field(
        ...,
        description=(
            "Opaque JSON object representing the user's career profile. No PII is"
            " expected; the server only persists what the wizard sends."
        ),
    )


class ProfileResponse(BaseModel):
    """Response envelope returned for create/get/update."""

    id: str = Field(..., description="Display-formatted profile id, e.g. K7X2-M4QR.")
    profile: dict[str, Any]
    created_at: str
    updated_at: str
