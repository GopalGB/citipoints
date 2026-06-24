"""FastAPI application entry point."""

from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from citipoints_api import __version__
from citipoints_api.config import get_settings
from citipoints_api.data.store import close_conn, table_counts, warm_backend
from citipoints_api.logging_conf import configure_logging, get_logger
from citipoints_api.routers import (
    anomaly,
    chat,
    coalition_flow,
    cohort,
    coo,
    creative,
    elasticity,
    forecast,
    fraud,
    ifrs,
    insights,
    kpi,
    market_basket,
    meta,
    nba,
    overview,
    predictive,
    receipts,
    recommendations,
    save_loop,
    segments,
)
from citipoints_api.schemas import HealthResponse
from citipoints_api.services.telemetry import record_request


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001 — FastAPI signature
    """Configure logging + warm the active data backend (DuckDB or BigQuery)."""
    settings = get_settings()
    configure_logging(settings.log_level)
    logger = get_logger(__name__)
    try:
        warm_backend()
        counts = table_counts()
        logger.info(
            "api.ready",
            version=__version__,
            backend="bigquery" if settings.use_bigquery else "duckdb",
            **counts,
        )
    except Exception as exc:  # pragma: no cover — surfaces only on misconfig
        logger.warning("api.startup_warning", error=str(exc))
    yield
    close_conn()
    logger.info("api.shutdown")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="CITI Points v2 API",
        description="Loyalty analytics API for the Power BI alternative MVP.",
        version=__version__,
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def request_logger(request: Request, call_next):
        logger = get_logger("citipoints.http")
        start = datetime.now(tz=timezone.utc)
        response = await call_next(request)
        duration_ms = (datetime.now(tz=timezone.utc) - start).total_seconds() * 1000
        logger.info(
            "http",
            method=request.method,
            path=request.url.path,
            status=response.status_code,
            duration_ms=round(duration_ms, 2),
        )
        # Feed in-process telemetry — powers the COO lens live ops metrics.
        record_request(duration_ms, errored=response.status_code >= 500)
        return response

    @app.exception_handler(Exception)
    async def on_unexpected(request: Request, exc: Exception) -> JSONResponse:  # noqa: ARG001
        get_logger(__name__).exception("unhandled", path=request.url.path)
        return JSONResponse(
            status_code=500,
            content={"error": {"code": "INTERNAL", "message": "Unexpected server error."}},
        )

    @app.get("/health", response_model=HealthResponse, tags=["meta"])
    async def health() -> HealthResponse:
        return HealthResponse(status="ok", checks={"api": "ok"}, version=__version__)

    @app.get("/ready", response_model=HealthResponse, tags=["meta"])
    async def ready() -> HealthResponse:
        active = get_settings()
        backend = "bigquery" if active.use_bigquery else "duckdb"
        try:
            counts = table_counts()
        except Exception as exc:  # pragma: no cover
            raise HTTPException(status_code=503, detail=f"{backend} unavailable: {exc}") from exc
        if counts["transactions"] == 0:
            return HealthResponse(
                status="degraded",
                checks={"api": "ok", "backend": backend, "seed": "missing"},
                version=__version__,
            )
        return HealthResponse(
            status="ok",
            checks={
                "api": "ok",
                "backend": backend,
                backend: f"{counts['transactions']:,} txns",
                "customers": f"{counts['customers']:,}",
                "skus": f"{counts['skus']:,}",
            },
            version=__version__,
        )

    v1_prefix = "/api/v1"
    app.include_router(kpi.router, prefix=v1_prefix, tags=["overview"])
    app.include_router(overview.router, prefix=v1_prefix, tags=["overview"])
    app.include_router(insights.router, prefix=v1_prefix, tags=["insights"])
    app.include_router(market_basket.router, prefix=v1_prefix, tags=["market-basket"])
    app.include_router(segments.router, prefix=v1_prefix, tags=["segments"])
    app.include_router(predictive.router, prefix=v1_prefix, tags=["predictive"])
    app.include_router(recommendations.router, prefix=v1_prefix, tags=["recommendations"])
    app.include_router(chat.router, prefix=v1_prefix, tags=["chat"])
    app.include_router(nba.router, prefix=v1_prefix, tags=["next-best-action"])
    app.include_router(cohort.router, prefix=v1_prefix, tags=["cohort"])
    app.include_router(anomaly.router, prefix=v1_prefix, tags=["anomaly"])
    app.include_router(coo.router, prefix=v1_prefix, tags=["coo"])
    app.include_router(fraud.router, prefix=v1_prefix, tags=["fraud"])
    app.include_router(forecast.router, prefix=v1_prefix, tags=["forecast"])
    app.include_router(coalition_flow.router, prefix=v1_prefix, tags=["coalition-flow"])
    app.include_router(ifrs.router, prefix=v1_prefix, tags=["ifrs"])
    app.include_router(creative.router, prefix=v1_prefix, tags=["creative"])
    app.include_router(save_loop.router, prefix=v1_prefix, tags=["save-loop"])
    app.include_router(receipts.router, prefix=v1_prefix, tags=["receipts"])
    app.include_router(elasticity.router, prefix=v1_prefix, tags=["elasticity"])
    app.include_router(meta.router, prefix=v1_prefix, tags=["meta"])
    return app


app = create_app()
