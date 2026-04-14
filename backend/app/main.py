from fastapi import FastAPI

from app.api.router import api_router
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(title=settings.app_name, debug=settings.debug)
app.include_router(api_router, prefix=settings.api_v1_prefix)


@app.get("/", tags=["meta"], summary="API root")
def root() -> dict[str, str]:
    return {"message": "NeuroGuide API is running"}
