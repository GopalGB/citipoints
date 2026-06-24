"""Auto-generated insights surfaced at the top of each analytical page."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from citipoints_api.data.filters import parse_filters
from citipoints_api.data.store import FilterParams
from citipoints_api.schemas import BannerResponse, InsightBundle
from citipoints_api.services.banners import generate_banner, supported_pages
from citipoints_api.services.insights import home_insights, now_iso

router = APIRouter(prefix="/insights")


@router.get("/home", response_model=InsightBundle)
def home(filters: FilterParams = Depends(parse_filters)) -> InsightBundle:
    question, insights = home_insights(filters)
    return InsightBundle(
        page="home",
        generated_at=now_iso(),
        question=question,
        insights=insights,
    )


@router.get("/banner/{page}", response_model=BannerResponse)
async def banner(
    page: str,
    filters: FilterParams = Depends(parse_filters),
    polish: bool = Query(
        False,
        description=(
            "When true, the template subtitle is rewritten by Claude in the page's "
            "voice. Adds 1-4s latency; the result is cached for 2 minutes."
        ),
    ),
) -> BannerResponse:
    """Return a data-driven banner (hero subtitle) for the given page.

    Supported page keys are listed at `/insights/banner` (see below). The
    response's `source` field tells the caller whether the subtitle came
    from the deterministic template or from a Claude rewrite.
    """
    if page not in supported_pages():
        raise HTTPException(
            status_code=404,
            detail=f"No banner generator for '{page}'. Supported: {supported_pages()}",
        )
    return await generate_banner(page, filters, polish=polish)
