from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
import uvicorn
import traceback
import logging
from contextlib import asynccontextmanager

from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi import _rate_limit_exceeded_handler

from limiter import limiter
from constants import APP_VERSION
from db.database import init_db

from routers.auth import router as auth_router
from routers.diagrams import router as diagrams_router
from routers.projects import router as projects_router
from routers.invitations import router as invitations_router
from routers.admin import router as admin_router
from routers.simulation import router as simulation_router
from routers.ws_simulation import router as ws_simulation_router
from routers.pipe_classes import router as pipe_classes_router
from routers.fitting_standards import router as fitting_standards_router
from routers.settings import router as settings_router

logger = logging.getLogger("uvicorn")

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(title="WalFlow Engine", description="Hydraulic Simulation Backend", version=APP_VERSION, lifespan=lifespan)

# Attach slowapi rate limiter state & middleware
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global sanitized exception handler to prevent stack trace data leakage (SEC-06)
@app.exception_handler(Exception)
async def global_unhandled_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, (StarletteHTTPException, RequestValidationError, RateLimitExceeded)):
        raise exc
    logger.error(f"Unhandled server exception on {request.url.path}: {exc}")
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred. Please try again later."}
    )

app.include_router(auth_router)
app.include_router(diagrams_router)
app.include_router(projects_router)
app.include_router(invitations_router)
app.include_router(admin_router)
app.include_router(simulation_router)
app.include_router(ws_simulation_router)
app.include_router(pipe_classes_router)
app.include_router(fitting_standards_router)
app.include_router(settings_router)


@app.get("/")
async def read_root():
    return {"status": "online", "message": "WalFlow Engine is ready.", "version": APP_VERSION}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
