from fastapi import APIRouter

from app.api.routes.health import router as health_router
from app.api.routes.job_description import router as job_description_router
from app.api.routes.profiles import router as profiles_router
from app.api.routes.job_score import router as job_score_router, router2 as job_score_router2

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(job_description_router)
api_router.include_router(profiles_router)
api_router.include_router(job_score_router)
api_router.include_router(job_score_router2)
