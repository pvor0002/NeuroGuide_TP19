"""Anonymous Career Profile endpoints.

The frontend wizard stores profile answers locally (in ``localStorage``). These
endpoints let a user optionally sync that blob to the backend so they can pick
up the same profile on a different browser or device using a short server-
issued code (e.g. ``K7X2-M4QR``). No personal information is collected — the
code is the only identifier.
"""

from fastapi import APIRouter, Depends, HTTPException, Path as FastAPIPath, status

from app.core.config import Settings, get_settings
from app.schemas.profile import ProfilePayload, ProfileResponse
from app.services.profile_store import (
    ProfileNotFoundError,
    ProfileStore,
    ProfileStoreError,
    ProfileTooLargeError,
    get_profile_store,
    is_valid_id_shape,
    normalize_profile_id,
)

router = APIRouter(prefix="/profiles", tags=["profiles"])


def _get_store(settings: Settings = Depends(get_settings)) -> ProfileStore:
    return get_profile_store(settings.profile_store_path)


def _resolve_raw_id(display_id: str) -> str:
    raw = normalize_profile_id(display_id)
    if not is_valid_id_shape(raw):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Profile id must be 8 alphanumeric characters (dashes optional).",
        )
    return raw


def _as_response(record: dict) -> ProfileResponse:
    return ProfileResponse(
        id=record["id"],
        profile=record["profile"],
        created_at=record["created_at"],
        updated_at=record["updated_at"],
    )


@router.post(
    "",
    response_model=ProfileResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new anonymous profile and return its generated id",
)
def create_profile(
    body: ProfilePayload,
    store: ProfileStore = Depends(_get_store),
) -> ProfileResponse:
    try:
        record = store.create(body.profile)
    except ProfileTooLargeError as exc:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=str(exc))
    except ProfileStoreError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))
    return _as_response(record)


@router.get(
    "/{profile_id}",
    response_model=ProfileResponse,
    summary="Fetch an existing profile by its 8-character id",
)
def get_profile(
    profile_id: str = FastAPIPath(..., min_length=8, max_length=12),
    store: ProfileStore = Depends(_get_store),
) -> ProfileResponse:
    raw_id = _resolve_raw_id(profile_id)
    try:
        record = store.get(raw_id)
    except ProfileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="We couldn't find a profile with that id. Double-check the letters and try again.",
        )
    return _as_response(record)


@router.put(
    "/{profile_id}",
    response_model=ProfileResponse,
    summary="Replace the payload of an existing profile id",
)
def update_profile(
    body: ProfilePayload,
    profile_id: str = FastAPIPath(..., min_length=8, max_length=12),
    store: ProfileStore = Depends(_get_store),
) -> ProfileResponse:
    raw_id = _resolve_raw_id(profile_id)
    try:
        record = store.update(raw_id, body.profile)
    except ProfileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="That profile id doesn't exist yet. Use POST /profiles to create one.",
        )
    except ProfileTooLargeError as exc:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=str(exc))
    except ProfileStoreError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))
    return _as_response(record)
