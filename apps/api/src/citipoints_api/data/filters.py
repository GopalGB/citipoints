"""Reusable FastAPI dependency that parses shared filter query params."""

from __future__ import annotations

from fastapi import Query

from citipoints_api.data.store import FilterParams


def parse_filters(
    store: str | None = Query(default=None, description="Store name"),
    category: str | None = Query(default=None, description="Product category"),
    tier: str | None = Query(default=None, description="Customer tier"),
    date_from: str | None = Query(default=None, description="ISO date lower bound"),
    date_to: str | None = Query(default=None, description="ISO date upper bound"),
) -> FilterParams:
    """Dependency that bundles optional filter query params."""
    return FilterParams(
        store=store,
        category=category,
        tier=tier,
        date_from=date_from,
        date_to=date_to,
    )
