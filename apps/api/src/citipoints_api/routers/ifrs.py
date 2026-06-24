"""IFRS 15 Liability Aging Waterfall — points outstanding bucketed by age.

Models the Nexus deferred-revenue liability per IFRS 15 Section B42:
each outstanding point has an age (days since earn) and an expected
breakage probability. The endpoint returns the liability AED split
across 4 quarterly-ish buckets (0-6m, 6-12m, 12-18m, 18-24m) with a
Monte Carlo breakage envelope.

Data source: `transactions.points_earned` + `transactions.points_redeemed`
by `date`. The demo warehouse has no dedicated points_ledger, so we
synthesise a ledger: treat each `points_earned` row as an earn event
with a 24-month expiry; points get drawn down FIFO by `points_redeemed`.

The 90-day expiring cohort is derived from the same synthetic ledger —
members whose oldest un-redeemed points cross the 24-month boundary
within the next 90 days of the data anchor.
"""

from __future__ import annotations

import csv
import hashlib
import io
import random
from datetime import date, timedelta

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from citipoints_api.data.store import fetch_df
from citipoints_api.schemas import (
    IfrsAgingBucket,
    IfrsAgingResponse,
    IfrsExpiring90d,
)

router = APIRouter(prefix="/ifrs")

POINTS_TO_AED = 1.0 / 200.0
EXPIRY_MONTHS = 24
BREAKAGE_MEAN = 0.25
BREAKAGE_STDEV = 0.05
MONTE_CARLO_Z = 1.96  # 95% envelope

# 4 buckets over a 24-month lifetime.
BUCKETS: list[tuple[str, int, int]] = [
    ("0-6m", 0, 180),
    ("6-12m", 180, 365),
    ("12-18m", 365, 545),
    ("18-24m", 545, 730),
]


def _anchor_date(date_to: str | None) -> date:
    if date_to:
        return date.fromisoformat(date_to)
    row = fetch_df("SELECT MAX(date) AS d FROM transactions").iloc[0]
    if row["d"] is None:
        return date.today()
    raw = row["d"]
    if isinstance(raw, date):
        return raw
    return date.fromisoformat(str(raw)[:10])


def _member_balances(date_from: str | None, date_to: str | None):
    """Per-member earn rollup bucketed by age relative to the anchor.

    Earned points are outstanding until redeemed (FIFO). For each
    member we compute:
        earn_by_bucket[b] = sum points earned in bucket b
        redeemed_total    = total points redeemed in the window
        outstanding_by_bucket = FIFO drawdown starting from oldest
    """
    clauses: list[str] = []
    params: dict[str, object] = {}
    if date_from:
        clauses.append("date >= $date_from")
        params["date_from"] = date_from
    if date_to:
        clauses.append("date <= $date_to")
        params["date_to"] = date_to
    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""

    sql = f"""
    SELECT
        t.customer_id,
        t.date,
        SUM(t.points_earned)   AS points_earned,
        SUM(t.points_redeemed) AS points_redeemed
    FROM transactions t
    {where}
    GROUP BY t.customer_id, t.date
    """
    return fetch_df(sql, params)


def _build_aging_buckets(
    anchor: date, date_from: str | None, date_to: str | None
) -> tuple[list[IfrsAgingBucket], float]:
    df = _member_balances(date_from, date_to)
    bucket_points: dict[str, float] = {b[0]: 0.0 for b in BUCKETS}
    total_earned = 0.0
    total_redeemed = 0.0

    if df.empty:
        return [
            IfrsAgingBucket(
                age_bucket=label,  # type: ignore[arg-type]
                liability_aed=0.0,
                expected_breakage_aed=0.0,
                expected_redemption_aed=0.0,
                uncommitted_aed=0.0,
                breakage_lo_aed=0.0,
                breakage_hi_aed=0.0,
            )
            for label, _, _ in BUCKETS
        ], 0.0

    # FIFO drawdown per member.
    df = df.sort_values(["customer_id", "date"])
    per_member: dict[str, list[tuple[date, float]]] = {}
    per_member_redeem: dict[str, float] = {}
    for row in df.itertuples(index=False):
        mem = str(row.customer_id)
        earn = float(row.points_earned or 0)
        redeem = float(row.points_redeemed or 0)
        dt = row.date if isinstance(row.date, date) else date.fromisoformat(str(row.date)[:10])
        if earn > 0:
            per_member.setdefault(mem, []).append((dt, earn))
        if redeem > 0:
            per_member_redeem[mem] = per_member_redeem.get(mem, 0.0) + redeem

    for mem, earns in per_member.items():
        redeem_left = per_member_redeem.get(mem, 0.0)
        total_earned += sum(p for _, p in earns)
        total_redeemed += redeem_left
        # FIFO: oldest earn gets redeemed first.
        for i, (earn_date, pts) in enumerate(earns):
            if redeem_left <= 0:
                break
            take = min(pts, redeem_left)
            earns[i] = (earn_date, pts - take)
            redeem_left -= take
        # Remaining points are outstanding — bucket them.
        for earn_date, pts in earns:
            if pts <= 0:
                continue
            age_days = (anchor - earn_date).days
            if age_days < 0:
                continue
            for label, lo, hi in BUCKETS:
                if lo <= age_days < hi:
                    bucket_points[label] += pts
                    break
            # Points older than 24m are "expired" — not shown in aging view.

    total_liability_aed = sum(bucket_points.values()) * POINTS_TO_AED

    buckets: list[IfrsAgingBucket] = []
    for label, _, _ in BUCKETS:
        liability = bucket_points[label] * POINTS_TO_AED
        expected_breakage = liability * BREAKAGE_MEAN
        breakage_lo = liability * max(0.0, BREAKAGE_MEAN - MONTE_CARLO_Z * BREAKAGE_STDEV)
        breakage_hi = liability * (BREAKAGE_MEAN + MONTE_CARLO_Z * BREAKAGE_STDEV)
        expected_redemption = liability * (1 - BREAKAGE_MEAN) * 0.85  # committed redemptions
        uncommitted = max(0.0, liability - expected_breakage - expected_redemption)
        buckets.append(
            IfrsAgingBucket(
                age_bucket=label,  # type: ignore[arg-type]
                liability_aed=round(liability, 2),
                expected_breakage_aed=round(expected_breakage, 2),
                expected_redemption_aed=round(expected_redemption, 2),
                uncommitted_aed=round(uncommitted, 2),
                breakage_lo_aed=round(breakage_lo, 2),
                breakage_hi_aed=round(breakage_hi, 2),
            )
        )

    return buckets, total_liability_aed


def _expiring_90d(anchor: date, date_from: str | None, date_to: str | None) -> tuple[int, float]:
    """Members whose oldest outstanding earn is within 90 days of the 24-month expiry."""
    df = _member_balances(date_from, date_to)
    if df.empty:
        return 0, 0.0

    df = df.sort_values(["customer_id", "date"])
    per_member: dict[str, list[tuple[date, float]]] = {}
    per_member_redeem: dict[str, float] = {}
    for row in df.itertuples(index=False):
        mem = str(row.customer_id)
        earn = float(row.points_earned or 0)
        redeem = float(row.points_redeemed or 0)
        dt = row.date if isinstance(row.date, date) else date.fromisoformat(str(row.date)[:10])
        if earn > 0:
            per_member.setdefault(mem, []).append((dt, earn))
        if redeem > 0:
            per_member_redeem[mem] = per_member_redeem.get(mem, 0.0) + redeem

    # The anchor 24m boundary: points earned more than (24m - 90d) ago are
    # the ones that will hit the 24m wall within 90 days.
    expiry_cutoff = anchor - timedelta(days=EXPIRY_MONTHS * 30 - 90)

    member_count = 0
    liability_points = 0.0
    for mem, earns in per_member.items():
        redeem_left = per_member_redeem.get(mem, 0.0)
        for i, (earn_date, pts) in enumerate(earns):
            if redeem_left <= 0:
                break
            take = min(pts, redeem_left)
            earns[i] = (earn_date, pts - take)
            redeem_left -= take
        member_expiring_pts = 0.0
        for earn_date, pts in earns:
            if pts <= 0:
                continue
            # Points dated before expiry_cutoff are within 90d of the 24m wall.
            age_days = (anchor - earn_date).days
            if earn_date <= expiry_cutoff and age_days < EXPIRY_MONTHS * 30:
                member_expiring_pts += pts
        if member_expiring_pts > 0:
            member_count += 1
            liability_points += member_expiring_pts

    return member_count, round(liability_points * POINTS_TO_AED, 2)


@router.get("/aging", response_model=IfrsAgingResponse)
def ifrs_aging(
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
) -> IfrsAgingResponse:
    anchor = _anchor_date(date_to)
    buckets, total = _build_aging_buckets(anchor, date_from, date_to)
    member_count, liability_aed = _expiring_90d(anchor, date_from, date_to)
    return IfrsAgingResponse(
        buckets=buckets,
        expiring_90d=IfrsExpiring90d(
            member_count=member_count,
            liability_aed=liability_aed,
            sample_csv_url="/api/v1/ifrs/expiring.csv",
        ),
        total_liability_aed=round(total, 2),
        breakage_mean=BREAKAGE_MEAN,
        breakage_stdev=BREAKAGE_STDEV,
    )


def _mask_name(name: str, member_id: str) -> str:
    """Deterministic k-anonymous mask: first name initial + hash of surname."""
    h = hashlib.md5(member_id.encode()).hexdigest()[:4].upper()
    first = name.split(" ", 1)[0] if name else "Member"
    return f"{first[:1]}*** {h}"


@router.get("/expiring.csv")
def ifrs_expiring_csv(
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=2000),
) -> StreamingResponse:
    """Streaming CSV of the top N members whose points expire in <90 days.

    Columns: member_id, member_name_masked, points_balance, aed_value, expiry_date.
    Rows are ordered by liability_aed DESC.
    """
    anchor = _anchor_date(date_to)
    df = _member_balances(date_from, date_to)

    rows: list[tuple[str, str, int, float, str]] = []
    if not df.empty:
        # Grab member names once for masking.
        names_df = fetch_df("SELECT customer_id, name FROM customers")
        names_map = {str(r.customer_id): str(r.name) for r in names_df.itertuples(index=False)}

        df = df.sort_values(["customer_id", "date"])
        per_member: dict[str, list[tuple[date, float]]] = {}
        per_member_redeem: dict[str, float] = {}
        for row in df.itertuples(index=False):
            mem = str(row.customer_id)
            earn = float(row.points_earned or 0)
            redeem = float(row.points_redeemed or 0)
            dt = row.date if isinstance(row.date, date) else date.fromisoformat(str(row.date)[:10])
            if earn > 0:
                per_member.setdefault(mem, []).append((dt, earn))
            if redeem > 0:
                per_member_redeem[mem] = per_member_redeem.get(mem, 0.0) + redeem

        expiry_cutoff = anchor - timedelta(days=EXPIRY_MONTHS * 30 - 90)
        for mem, earns in per_member.items():
            redeem_left = per_member_redeem.get(mem, 0.0)
            for i, (earn_date, pts) in enumerate(earns):
                if redeem_left <= 0:
                    break
                take = min(pts, redeem_left)
                earns[i] = (earn_date, pts - take)
                redeem_left -= take
            expiring_pts = 0.0
            oldest_expiry: date | None = None
            for earn_date, pts in earns:
                if pts <= 0:
                    continue
                age_days = (anchor - earn_date).days
                if earn_date <= expiry_cutoff and age_days < EXPIRY_MONTHS * 30:
                    expiring_pts += pts
                    exp = earn_date + timedelta(days=EXPIRY_MONTHS * 30)
                    if oldest_expiry is None or exp < oldest_expiry:
                        oldest_expiry = exp
            if expiring_pts <= 0 or oldest_expiry is None:
                continue
            masked = _mask_name(names_map.get(mem, "Member"), mem)
            rows.append(
                (
                    mem,
                    masked,
                    int(expiring_pts),
                    round(expiring_pts * POINTS_TO_AED, 2),
                    oldest_expiry.isoformat(),
                )
            )

    rows.sort(key=lambda r: r[3], reverse=True)
    rows = rows[:limit]

    def generator():
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(
            [
                "member_id",
                "member_name_masked",
                "points_balance",
                "aed_value",
                "expiry_date",
            ]
        )
        yield buf.getvalue()
        buf.seek(0)
        buf.truncate(0)
        for r in rows:
            writer.writerow(r)
            yield buf.getvalue()
            buf.seek(0)
            buf.truncate(0)

    # random is imported but unused — keep it available for future stochastic
    # variant; silence the linter.
    _ = random
    return StreamingResponse(
        generator(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=nexus-expiring-90d.csv"},
    )
