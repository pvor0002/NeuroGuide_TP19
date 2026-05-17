import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import ResponseValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from mangum import Mangum
from app.api.router import api_router
from app.core.config import get_settings

# Lambda captures stdout/stderr → CloudWatch. Set INFO so all [Gemini] logs appear.
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

logger = logging.getLogger(__name__)

settings = get_settings()
logger.info("[Startup] NeuroGuide API initialising — api_prefix=%s", settings.api_v1_prefix)

app = FastAPI(title=settings.app_name, debug=settings.debug)


@app.exception_handler(ResponseValidationError)
async def response_validation_handler(
    _request: Request, exc: ResponseValidationError
) -> JSONResponse:
    logger.error("[API] Response validation failed: %s", exc)
    return JSONResponse(
        status_code=502,
        content={"detail": "The server could not build a valid response. Please try again."},
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    # Apex + subdomains for product domains; Render/Vercel preview hosts.
    allow_origin_regex=(
        r"https://([\w-]+\.)*(neuroguide\.dev|neuroguide\.app|onrender\.com|vercel\.app)$"
        r"|http://(localhost|127\.0\.0\.1)(:\d+)?$"
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api_router, prefix=settings.api_v1_prefix)
logger.info("[Startup] App ready — routes registered, Mangum handler attached")


@app.get("/", tags=["meta"], summary="API root")
def root() -> dict[str, str]:
    return {"message": "NeuroGuide API is running"}

handler = Mangum(app, lifespan="off")