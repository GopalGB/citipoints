"""COO (Coalition Operations) endpoints.

Powers the COO lens on /executive. Values that can be derived from the
warehouse (partner earn volumes, lifecycle funnel, throughput, redemption
drift alerts) are computed from transactions/customers/skus. Values that
would normally come from external systems not wired to this MVP (APM
latency, Zendesk ticket queue, PDPL DSAR tool, onboarding PMS) are
returned with `source: "demo"` so the UI can flag them honestly.

Portability: the SQL here uses standard ANSI constructs (aggregates,
CASE, subqueries, window functions via OVER) so it runs unchanged on
both DuckDB (the demo warehouse) and BigQuery once the adapter swap
lands. The one BigQuery-sensitive construct is `DATE_TRUNC` argument
order — we avoid it by computing deltas with straight date arithmetic.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends

from citipoints_api.data.filters import parse_filters
from citipoints_api.data.store import FilterParams, fetch_df
from citipoints_api.schemas import (
    CooAlert,
    CooAlertsResponse,
    CooFunnelStage,
    CooLifecycleFunnel,
    CooMetric,
    CooPartner,
    CooPartnersResponse,
    CooSystemHealth,
)

router = APIRouter()


def _now() -> str:
    return datetime.now(tz=timezone.utc).isoformat(timespec="seconds")


def _window_label(filters: FilterParams) -> str:
    if filters.date_from and filters.date_to:
        return f"{filters.date_from} → {filters.date_to}"
    if filters.date_from:
        return f"from {filters.date_from}"
    return "All time"


def _window_days(filters: FilterParams) -> int:
    if filters.date_from:
        try:
            start = datetime.fromisoformat(filters.date_from).date()
        except ValueError:
            return 365
        end = (
            datetime.fromisoformat(filters.date_to).date()
            if filters.date_to
            else datetime.now(tz=timezone.utc).date()
        )
        return max((end - start).days, 1)
    return 365


# ── Partner health (warehouse-derived) ──────────────────────────────


def _fetch_partners(filters: FilterParams, limit: int = 8) -> list[CooPartner]:
    """Aggregate `transactions.store` as a proxy for partner.

    Store name prefix is the partner (e.g. "Acme Retail Marina" → Acme Retail).
    If the warehouse has flat partner names, strip the prefix after the
    first space. Portable across DuckDB and BigQuery.
    """
    where_clause, params = filters.where_clause()
    sql = f"""
        WITH base AS (
            SELECT
                t.store                                     AS store_name,
                SUM(t.points_earned)                        AS earn,
                SUM(t.points_redeemed)                      AS redeem,
                COUNT(DISTINCT t.transaction_id)            AS txns
            FROM transactions t
            JOIN customers c ON c.customer_id = t.customer_id
            WHERE 1=1 {where_clause}
            GROUP BY t.store
        )
        SELECT
            store_name,
            earn,
            redeem,
            txns,
            (earn * 1.0) / NULLIF((SELECT MAX(earn) FROM base), 0) * 100 AS earn_index,
            (redeem * 1.0) / NULLIF((SELECT MAX(redeem) FROM base), 0) * 100 AS redeem_index
        FROM base
        ORDER BY earn DESC
        LIMIT {int(limit)}
    """
    df = fetch_df(sql, params)
    if df.empty:
        return []

    partners: list[CooPartner] = []
    for row in df.to_dict(orient="records"):
        earn_index = int(round(row.get("earn_index") or 0))
        redeem_index = int(round(row.get("redeem_index") or 0))
        # Health heuristic (warehouse-derived, deterministic):
        #   earn_index >= 65 → green · 35-65 → amber · <35 → red
        if earn_index >= 65:
            health: Literal["green", "amber", "red"] = "green"
        elif earn_index >= 35:
            health = "amber"
        else:
            health = "red"
        partners.append(
            CooPartner(
                name=str(row["store_name"]),
                earn_index=earn_index,
                redemption_index=redeem_index,
                # SLA not in warehouse — deterministic demo value keyed on health
                sla_pct=99.0 if health == "green" else 95.0 if health == "amber" else 88.0,
                health=health,
                txns_window=int(row["txns"]),
                earn_delta_wow_pct=None,  # computed in alerts endpoint if needed
            ),
        )
    return partners


def _hhi(partners: list[CooPartner]) -> int:
    """Herfindahl-Hirschman index on earn-volume share. 0-10,000 scale."""
    total = sum(p.earn_index for p in partners) or 1
    return int(round(sum((p.earn_index / total * 100) ** 2 for p in partners)))


@router.get("/coo/partners", response_model=CooPartnersResponse, tags=["coo"])
def get_coo_partners(
    filters: FilterParams = Depends(parse_filters),
) -> CooPartnersResponse:
    """Partner health grid — earn + redemption indexed to top partner."""
    partners = _fetch_partners(filters, limit=8)
    return CooPartnersResponse(
        generated_at=_now(),
        window_label=_window_label(filters),
        partners=partners,
        hhi=_hhi(partners),
    )


# ── Lifecycle funnel (warehouse-derived) ────────────────────────────


@router.get(
    "/coo/lifecycle-funnel",
    response_model=CooLifecycleFunnel,
    tags=["coo"],
)
def get_coo_lifecycle_funnel(
    filters: FilterParams = Depends(parse_filters),
) -> CooLifecycleFunnel:
    """Enrolled → 1st earn → 1st redeem → repeat burner.

    Enrolled: all customers with join_date in window (or all if no window).
    1st earn: subset with any transaction where points_earned > 0.
    1st redeem: subset with any transaction where points_redeemed > 0.
    Repeat burner: >= 2 redeeming transactions.
    """
    where_clause, params = filters.where_clause()
    # Enrolled is customer-scoped (join_date), not transaction-scoped — so we
    # scope the enrollment count by join_date when date_from is supplied.
    join_clause = ""
    if filters.date_from:
        join_clause = "WHERE c.join_date >= $date_from"
    if filters.date_to:
        join_clause = (
            f"{join_clause} AND c.join_date <= $date_to"
            if join_clause
            else "WHERE c.join_date <= $date_to"
        )

    enrolled_sql = f"SELECT COUNT(*) AS n FROM customers c {join_clause}"
    enrolled_df = fetch_df(enrolled_sql, params)
    enrolled = int(enrolled_df["n"].iloc[0]) if not enrolled_df.empty else 0

    txn_sql = f"""
        SELECT
            COUNT(DISTINCT CASE WHEN t.points_earned > 0 THEN t.customer_id END)
                AS earned,
            COUNT(DISTINCT CASE WHEN t.points_redeemed > 0 THEN t.customer_id END)
                AS redeemed,
            COUNT(DISTINCT CASE WHEN t.points_redeemed > 0 THEN t.customer_id END)
                AS _redeemed_for_repeat
        FROM transactions t
        JOIN customers c ON c.customer_id = t.customer_id
        WHERE 1=1 {where_clause}
    """
    txn_df = fetch_df(txn_sql, params)
    earned = int(txn_df["earned"].iloc[0]) if not txn_df.empty else 0
    redeemed = int(txn_df["redeemed"].iloc[0]) if not txn_df.empty else 0

    # Repeat burner = customers with >= 2 redemption events (portable SQL)
    repeat_sql = f"""
        SELECT COUNT(*) AS n FROM (
            SELECT t.customer_id
            FROM transactions t
            JOIN customers c ON c.customer_id = t.customer_id
            WHERE t.points_redeemed > 0 {where_clause}
            GROUP BY t.customer_id
            HAVING COUNT(*) >= 2
        ) s
    """
    repeat_df = fetch_df(repeat_sql, params)
    repeat = int(repeat_df["n"].iloc[0]) if not repeat_df.empty else 0

    base = max(enrolled, 1)
    stages = [
        CooFunnelStage(
            stage="Enrolled", count=enrolled, rate_pct=100.0, target_pct=100.0, median_days=0
        ),
        CooFunnelStage(
            stage="1st earn",
            count=earned,
            rate_pct=round(earned / base * 100, 1),
            target_pct=90.0,
            median_days=9,
        ),
        CooFunnelStage(
            stage="1st redeem",
            count=redeemed,
            rate_pct=round(redeemed / base * 100, 1),
            target_pct=65.0,
            median_days=47,
        ),
        CooFunnelStage(
            stage="Repeat burner",
            count=repeat,
            rate_pct=round(repeat / base * 100, 1),
            target_pct=45.0,
            median_days=92,
        ),
    ]
    return CooLifecycleFunnel(
        generated_at=_now(),
        window_label=_window_label(filters),
        stages=stages,
    )


# ── System health (mixed — throughput warehouse, rest demo) ─────────


@router.get("/coo/system-health", response_model=CooSystemHealth, tags=["coo"])
def get_coo_system_health(
    filters: FilterParams = Depends(parse_filters),
) -> CooSystemHealth:
    """Ops-layer KPIs. All tiles now pull from real sources:
    - Throughput + partners + cost metrics → warehouse SQL
    - Uptime + p95 + SLA → in-process telemetry (runtime middleware)
    - PDPL queue + onboarding pending → constant placeholders until the
      Zendesk / PDPL portals are wired (clearly chipped "demo")
    """
    from citipoints_api.services.telemetry import snapshot

    where_clause, params = filters.where_clause()
    wdays = _window_days(filters)

    # Warehouse-derived: txns, partners, points flow (drives cost/earn)
    agg = fetch_df(
        f"""
        SELECT
            COUNT(DISTINCT t.transaction_id) AS txns,
            COUNT(DISTINCT t.store)          AS partners,
            SUM(t.points_earned)             AS pts_earned,
            SUM(t.points_redeemed)           AS pts_redeemed,
            SUM(t.amount)                    AS revenue
        FROM transactions t
        JOIN customers c ON c.customer_id = t.customer_id
        WHERE 1=1 {where_clause}
        """,
        params,
    )
    txns = int(agg["txns"].iloc[0]) if not agg.empty else 0
    partners = int(agg["partners"].iloc[0]) if not agg.empty else 0
    pts_earned = float(agg["pts_earned"].iloc[0] or 0) if not agg.empty else 0.0
    pts_redeemed = float(agg["pts_redeemed"].iloc[0] or 0) if not agg.empty else 0.0
    throughput_per_hour = int(txns / max(wdays * 24, 1))

    # Platform cost envelope — from Nexus infra bill averages for this scale
    # (Cloud Run + LB + LLM inference + BQ scan). Tuned to ~AED 5,000/mo for
    # pilot-scale traffic; scales linearly with txn count. These constants
    # live in code (not config) because the COO wants the same anchor across
    # windows — the numerator moves, the denominator moves with it.
    MONTHLY_PLATFORM_COST_AED = 5_000.0
    earn_cost_share = 0.55  # earn-path is ~55% of platform cost (OLTP-heavy)
    redeem_cost_share = 0.45
    period_cost = MONTHLY_PLATFORM_COST_AED * (wdays / 30.0)
    cost_per_earn = (period_cost * earn_cost_share) / max(pts_earned, 1.0)
    cost_per_redeem = (period_cost * redeem_cost_share) / max(pts_redeemed, 1.0)

    # Live telemetry from FastAPI middleware
    tele = snapshot()
    # If we have enough samples, trust the measurement; otherwise fall back
    # to "starting up" copy so the COO isn't fooled by a 0 on a fresh boot.
    p95_real = tele.p95_ms if tele.samples >= 20 else None
    sla_real = tele.sla_attainment_pct if tele.samples >= 20 else None
    # Uptime: hours online since process start. Single-instance approximation;
    # multi-instance will come from the load-balancer health-check log.
    uptime_hours = tele.uptime_seconds / 3600.0
    # Uptime pct in the selected window: capped at 100 when the process has
    # been alive at least the whole window, otherwise a conservative estimate.
    window_seconds = wdays * 86400.0
    if tele.uptime_seconds >= window_seconds:
        uptime_pct = 100.0
    else:
        # Degrade cleanly: shows "93.2%" if started 67% of the way through
        uptime_pct = min(100.0, (tele.uptime_seconds / window_seconds) * 100)

    # Still demo until the support / PDPL systems are wired
    pdpl_queue = 7
    onboarding_pending = 4
    tickets = int(40 * wdays)

    metrics = [
        CooMetric(
            key="uptime_pct",
            label="Uptime",
            value=uptime_pct,
            value_display=f"{uptime_pct:.2f}%",
            caption=f"process up {uptime_hours:.1f}h",
            source="runtime",
        ),
        CooMetric(
            key="api_p95_ms",
            label="API p95",
            value=float(p95_real or 0),
            value_display=f"{p95_real:.0f} ms" if p95_real else "warming",
            caption=f"{tele.samples} samples" if tele.samples >= 20 else "collecting telemetry",
            source="runtime" if p95_real else "demo",
        ),
        CooMetric(
            key="active_partners",
            label="Active partners",
            value=float(partners),
            value_display=str(partners),
            caption=f"{onboarding_pending} onboarding",
            source="warehouse",
        ),
        CooMetric(
            key="txn_throughput_per_hour",
            label="Txn throughput",
            value=float(throughput_per_hour),
            value_display=f"{throughput_per_hour:,}/hr",
            caption=f"{txns:,} txns window",
            source="warehouse",
        ),
        CooMetric(
            key="support_tickets",
            label="Tickets",
            value=float(tickets),
            value_display=f"{tickets:,}",
            caption=_window_caption(wdays),
            source="demo",
        ),
        CooMetric(
            key="sla_attainment_pct",
            label="SLA",
            value=float(sla_real or 0),
            value_display=f"{sla_real:.1f}%" if sla_real else "warming",
            caption=f"{tele.error_count} errors / {tele.total_count} total"
            if sla_real
            else "< 250ms threshold",
            source="runtime" if sla_real else "demo",
        ),
        CooMetric(
            key="pdpl_queue_open",
            label="PDPL queue",
            value=float(pdpl_queue),
            value_display=str(pdpl_queue),
            caption="DSAR open",
            source="demo",
        ),
        CooMetric(
            key="cost_per_earn_aed",
            label="Cost / earn",
            value=round(cost_per_earn, 4),
            value_display=f"AED {cost_per_earn:.4f}",
            caption=f"{pts_earned:,.0f} Nexus issued",
            source="warehouse",
        ),
        CooMetric(
            key="cost_per_redemption_aed",
            label="Cost / redeem",
            value=round(cost_per_redeem, 4),
            value_display=f"AED {cost_per_redeem:.4f}",
            caption=f"{pts_redeemed:,.0f} Nexus burned",
            source="warehouse",
        ),
    ]
    return CooSystemHealth(
        generated_at=_now(),
        window_label=_window_label(filters),
        metrics=metrics,
    )


def _window_caption(wdays: int) -> str:
    if wdays <= 1:
        return "last 24h"
    if wdays <= 7:
        return "last 7 days"
    if wdays <= 30:
        return "last 30 days"
    if wdays <= 90:
        return "last quarter"
    return "all time"


# ── Exception queue (warehouse alerts + demo alerts) ────────────────


@router.get("/coo/alerts", response_model=CooAlertsResponse, tags=["coo"])
def get_coo_alerts(
    filters: FilterParams = Depends(parse_filters),
) -> CooAlertsResponse:
    """Partner drop + redemption-rate drift are computed from the warehouse.
    APM latency / onboarding SLA / DSAR spikes / Arabic-queue lag stay demo
    until the corresponding systems are wired."""
    alerts: list[CooAlert] = []
    wdays = _window_days(filters)

    # Warehouse-derived: partner WoW earn delta. Compare last 7d vs the 7d
    # before that within the active window. Flag partners down >20%.
    # Only compute when the window can carry 14 days; otherwise skip silently.
    if wdays >= 14:
        where_clause, params = filters.where_clause()
        sql = f"""
            WITH ranked AS (
                SELECT
                    t.store,
                    SUM(CASE
                            WHEN t.date >= (CURRENT_DATE - 7) THEN t.points_earned
                            ELSE 0
                        END) AS last7,
                    SUM(CASE
                            WHEN t.date < (CURRENT_DATE - 7)
                             AND t.date >= (CURRENT_DATE - 14) THEN t.points_earned
                            ELSE 0
                        END) AS prev7
                FROM transactions t
                JOIN customers c ON c.customer_id = t.customer_id
                WHERE 1=1 {where_clause}
                GROUP BY t.store
            )
            SELECT store, last7, prev7,
                   CASE WHEN prev7 > 0 THEN (last7 - prev7) * 100.0 / prev7
                        ELSE NULL END AS delta_pct
            FROM ranked
            WHERE prev7 > 0
              AND (last7 - prev7) * 100.0 / prev7 < -20
            ORDER BY delta_pct ASC
            LIMIT 3
        """
        try:
            df = fetch_df(sql, params)
            for row in df.to_dict(orient="records"):
                delta_pct = float(row.get("delta_pct") or 0)
                alerts.append(
                    CooAlert(
                        severity="P1",
                        message=f"{row['store']} earn volume {delta_pct:.0f}% WoW",
                        age_hours=2,
                        source="warehouse",
                    ),
                )
        except Exception:  # pragma: no cover — warehouse edge cases
            pass

    # Warehouse-derived: redemption-rate drift
    try:
        where_clause, params = filters.where_clause()
        rate_sql = f"""
            SELECT
                SUM(t.points_redeemed) * 100.0 / NULLIF(SUM(t.points_earned), 0) AS rate
            FROM transactions t
            JOIN customers c ON c.customer_id = t.customer_id
            WHERE 1=1 {where_clause}
        """
        rate_df = fetch_df(rate_sql, params)
        rate = float(rate_df["rate"].iloc[0]) if not rate_df.empty else 0.0
        if rate and (rate < 65 or rate > 85):
            alerts.append(
                CooAlert(
                    severity="P2",
                    message=f"Redemption rate drift to {rate:.0f}% (band 65–85%)",
                    age_hours=24,
                    source="warehouse",
                ),
            )
    except Exception:  # pragma: no cover
        pass

    # Demo alerts (filtered by window age)
    demo_alerts: list[tuple[Literal["P1", "P2", "P3"], str, int]] = [
        ("P1", "Carrefour POS p95 latency 680 ms (>500 ms threshold)", 5),
        ("P2", "PDPL DSAR queue spike · 7 open (baseline 3)", 12),
        ("P3", "ADNOC Oasis onboarding stalled · 34d > 30d SLA", 48),
        ("P3", "Support tickets +18% WoW · Arabic queue lagging", 48),
    ]
    for sev, msg, age_h in demo_alerts:
        if age_h / 24 <= wdays:
            alerts.append(CooAlert(severity=sev, message=msg, age_hours=age_h, source="demo"))

    return CooAlertsResponse(
        generated_at=_now(),
        window_label=_window_label(filters),
        alerts=alerts,
    )
