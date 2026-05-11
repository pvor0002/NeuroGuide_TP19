from fastapi import APIRouter

from app.api.routes.health import router as health_router
from app.api.routes.interview_prep import router as interview_prep_router
from app.api.routes.job_description import router as job_description_router
from app.api.routes.postgres_data import router as postgres_data_router
from app.api.routes.profiles import router as profiles_router
from app.api.routes.session import router as session_router
from app.api.routes.job_score import router as job_score_router, router2 as job_score_router2
from app.api.routes.day_in_life import router as day_in_life_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(job_description_router)
api_router.include_router(interview_prep_router)
api_router.include_router(profiles_router)
api_router.include_router(postgres_data_router)
api_router.include_router(session_router)
api_router.include_router(job_score_router)
api_router.include_router(job_score_router2)
api_router.include_router(day_in_life_router)