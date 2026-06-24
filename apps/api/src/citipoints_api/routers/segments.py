"""Customer Segments — RFM, KMeans clusters, tier-migration Sankey + matrix."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Query

from citipoints_api.schemas import (
    InsightBundle,
    RfmSegment,
    RfmSummary,
    TierMigrationHeadline,
    TierMigrationLink,
    TierMigrationResponse,
)
from citipoints_api.services import ml_models
from citipoints_api.services.insights import now_iso, segment_insights

router = APIRouter(prefix="/segments")


def _human_range(start: str, end: str) -> str:
    """Render 'Dec 1 – Dec 15' / 'Jan 1, 2026 – Feb 14' style ranges."""
    s = date.fromisoformat(start)
    e = date.fromisoformat(end)
    if s.year == e.year:
        if s.month == e.month:
            return f"{s.strftime('%b')} {s.day}–{e.day}, {s.year}"
        return f"{s.strftime('%b %-d')} – {e.strftime('%b %-d')}, {s.year}"
    return f"{s.strftime('%b %-d, %Y')} – {e.strftime('%b %-d, %Y')}"


def _headline(stats: ml_models.TierMigrationStats) -> TierMigrationHeadline:
    """One sentence the dashboard H1 subtitle uses. Data-driven, no static copy."""
    if stats.total_tracked == 0:
        return TierMigrationHeadline(
            text="No members moved tier in this window — pick a wider range.",
            tone="neutral",
        )
    up_pct = (stats.up_migrators / stats.total_tracked) * 100
    down_pct = (stats.down_migrators / stats.total_tracked) * 100
    if stats.down_migrators > stats.up_migrators:
        route = stats.biggest_drop_route or "top tier"
        return TierMigrationHeadline(
            text=(
                f"{stats.down_migrators:,} members slipped to a lower tier ({down_pct:.1f}%) — "
                f"the biggest leak is {route} losing {stats.biggest_drop_members:,} members."
            ),
            tone="negative",
        )
    if stats.up_migrators > stats.down_migrators:
        route = stats.biggest_lift_route or "a top route"
        return TierMigrationHeadline(
            text=(
                f"{stats.up_migrators:,} members climbed a tier ({up_pct:.1f}%) — "
                f"{route} led with {stats.biggest_lift_members:,} upgrades."
            ),
            tone="positive",
        )
    return TierMigrationHeadline(
        text=(
            f"Mix stable: {stats.up_migrators:,} up vs {stats.down_migrators:,} down "
            f"across {stats.total_tracked:,} tracked members."
        ),
        tone="neutral",
    )


@router.get("/rfm", response_model=RfmSummary)
def rfm(limit: int = Query(default=500, ge=1, le=10000)) -> RfmSummary:
    result = ml_models.run_rfm()
    rfm_df = result.rfm
    sample = rfm_df.head(limit)
    segments = [
        RfmSegment(
            customer_id=row.customer_id,
            recency=int(row.recency),
            frequency=int(row.frequency),
            monetary=float(row.monetary),
            rfm_score=row.rfm_score,
            segment=row.segment,
            predicted_cluster=int(row.predicted_cluster),
        )
        for row in sample.itertuples(index=False)
    ]
    return RfmSummary(
        segments=segments,
        silhouette_score=result.silhouette,
        persona_counts=result.persona_counts,
    )


@router.get("/tier-migration", response_model=list[TierMigrationLink])
def tier_migration(
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
) -> list[TierMigrationLink]:
    """Legacy endpoint — returns bare edge list. Kept for /analyst + /segments pages."""
    edges = ml_models.tier_migration_edges(date_from, date_to)
    if edges.empty:
        return []
    return [
        TierMigrationLink(
            source_tier=row.source_tier,
            target_tier=row.target_tier,
            members=int(row.members),
        )
        for row in edges.itertuples(index=False)
    ]


@router.get("/tier-migration/matrix", response_model=TierMigrationResponse)
def tier_migration_matrix(
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
) -> TierMigrationResponse:
    """Rich period-A vs period-B migration matrix with data-driven headline."""
    stats = ml_models.tier_migration_matrix(date_from, date_to)
    matrix = [
        TierMigrationLink(
            source_tier=row.source_tier,
            target_tier=row.target_tier,
            members=int(row.members),
        )
        for row in stats.edges.itertuples(index=False)
    ]
    up_pct = (stats.up_migrators / stats.total_tracked) * 100 if stats.total_tracked else 0.0
    down_pct = (stats.down_migrators / stats.total_tracked) * 100 if stats.total_tracked else 0.0
    return TierMigrationResponse(
        period_a_label=_human_range(stats.period_a_start, stats.period_a_end),
        period_b_label=_human_range(stats.period_b_start, stats.period_b_end),
        period_a_start=date.fromisoformat(stats.period_a_start),
        period_a_end=date.fromisoformat(stats.period_a_end),
        period_b_start=date.fromisoformat(stats.period_b_start),
        period_b_end=date.fromisoformat(stats.period_b_end),
        matrix=matrix,
        total_tracked=stats.total_tracked,
        up_migrators=stats.up_migrators,
        down_migrators=stats.down_migrators,
        static_members=stats.static_members,
        up_pct=round(up_pct, 2),
        down_pct=round(down_pct, 2),
        biggest_drop_route=stats.biggest_drop_route,
        biggest_drop_members=stats.biggest_drop_members,
        biggest_lift_route=stats.biggest_lift_route,
        biggest_lift_members=stats.biggest_lift_members,
        headline=_headline(stats),
    )


@router.get("/insights", response_model=InsightBundle)
def segment_insights_route() -> InsightBundle:
    rfm_df = ml_models.run_rfm().rfm
    insights = segment_insights(rfm_df)
    return InsightBundle(
        page="segments",
        generated_at=now_iso(),
        question="Who should we target with what offer — right now?",
        insights=insights,
    )
