"""Cohort retention heatmap."""

from __future__ import annotations

from fastapi import APIRouter

from citipoints_api.schemas import CohortCell
from citipoints_api.services import ml_models

router = APIRouter(prefix="/cohort")


@router.get("/retention", response_model=list[CohortCell])
def retention() -> list[CohortCell]:
    df = ml_models.cohort_retention()
    if df.empty:
        return []
    return [
        CohortCell(
            cohort_month=row.cohort_month,
            month_offset=int(row.month_offset),
            active_rate=float(row.active_rate),
            active_count=int(row.active_count),
            cohort_size=int(row.cohort_size),
        )
        for row in df.itertuples(index=False)
    ]
