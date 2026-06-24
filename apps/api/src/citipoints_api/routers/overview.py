"""Home/Overview chart endpoints — trend, category mix, stores, tiers, top products."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from citipoints_api.data.filters import parse_filters
from citipoints_api.data.store import FilterParams
from citipoints_api.schemas import (
    CategoryMixItem,
    StorePerfItem,
    TierDistItem,
    TopProductItem,
    TrendPoint,
    TrendResponse,
)
from citipoints_api.services import queries

router = APIRouter(prefix="/overview")


@router.get("/revenue-trend", response_model=TrendResponse)
def revenue_trend(filters: FilterParams = Depends(parse_filters)) -> TrendResponse:
    df = queries.revenue_trend(filters)
    if df.empty:
        return TrendResponse(series=[])
    series = [
        TrendPoint(date=row.date.date() if hasattr(row.date, "date") else row.date,
                   revenue=float(row.revenue), transactions=int(row.transactions))
        for row in df.itertuples(index=False)
    ]
    return TrendResponse(series=series)


@router.get("/category-mix", response_model=list[CategoryMixItem])
def category_mix(filters: FilterParams = Depends(parse_filters)) -> list[CategoryMixItem]:
    df = queries.category_mix(filters)
    return [
        CategoryMixItem(
            category=row.category,
            revenue=float(row.revenue),
            share_pct=float(row.share_pct),
        )
        for row in df.itertuples(index=False)
    ]


@router.get("/store-performance", response_model=list[StorePerfItem])
def store_performance(filters: FilterParams = Depends(parse_filters)) -> list[StorePerfItem]:
    df = queries.store_performance(filters)
    return [
        StorePerfItem(
            store=row.store,
            revenue=float(row.revenue),
            transactions=int(row.transactions),
            avg_basket=float(row.avg_basket),
        )
        for row in df.itertuples(index=False)
    ]


@router.get("/tier-distribution", response_model=list[TierDistItem])
def tier_distribution(filters: FilterParams = Depends(parse_filters)) -> list[TierDistItem]:
    df = queries.tier_distribution(filters)
    return [
        TierDistItem(
            tier=row.tier,
            members=int(row.members),
            revenue=float(row.revenue),
            share_pct=float(row.share_pct),
        )
        for row in df.itertuples(index=False)
    ]


@router.get("/top-products", response_model=list[TopProductItem])
def top_products(
    filters: FilterParams = Depends(parse_filters),
    limit: int = Query(default=10, ge=1, le=50),
) -> list[TopProductItem]:
    df = queries.top_products(filters, limit=limit)
    return [
        TopProductItem(
            sku_id=row.sku_id,
            product_name=row.product_name,
            brand=row.brand,
            category=row.category,
            revenue=float(row.revenue),
            units=int(row.units),
        )
        for row in df.itertuples(index=False)
    ]
