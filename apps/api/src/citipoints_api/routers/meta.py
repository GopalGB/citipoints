"""Warehouse metadata — data-bounds for the frontend window selector.

The frontend anchors all "last N days" windows to the MAX transaction date
(not the wall-clock date), so demo datasets + live feeds with lag both
produce sensible filtered results.
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict

from citipoints_api.data.store import date_bounds

router = APIRouter(prefix="/meta")


class DateBounds(BaseModel):
    model_config = ConfigDict(extra="forbid")
    min: str  # ISO YYYY-MM-DD; empty string when warehouse is empty
    max: str


@router.get("/date-bounds", response_model=DateBounds)
def get_date_bounds() -> DateBounds:
    lo, hi = date_bounds()
    return DateBounds(min=lo, max=hi)
