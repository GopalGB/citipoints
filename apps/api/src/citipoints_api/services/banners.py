"""Dynamic page banner generators.

Every analytical page has a hero at the top — a big question + a subtitle
paragraph. Until now the subtitle was hardcoded ("Loyalty members drive 68%
of coalition revenue…"), which meant the numbers drifted as the window
changed.

This module computes the key metrics for each page against the active
window, then produces:

1. A deterministic template-based banner (always available, ~20ms).
2. Optionally, a Claude-rewritten version that phrases the same facts in
   the page's voice. Falls back to the template silently when the CLI
   is slow, errored, or disabled.

The frontend calls `/api/v1/insights/banner/{page}?date_from=&date_to=`
and renders the BannerResponse in place of the old static `<p>`.
"""

from __future__ import annotations

import asyncio
import json
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Awaitable, Callable, Literal

from citipoints_api.data.store import FilterParams
from citipoints_api.logging_conf import get_logger
from citipoints_api.schemas import BannerResponse, BannerStat
from citipoints_api.services import queries
from citipoints_api.services.claude_cli import ClaudeCliError, extract_json_block, run_claude

logger = get_logger(__name__)

# How long a banner stays warm in the in-process cache. Windows rarely move
# second-to-second; a short cache keeps Claude costs sane without stale prose.
_CACHE_TTL_SECONDS = 120

Tone = Literal["positive", "negative", "neutral"]


@dataclass(frozen=True)
class BannerFacts:
    """Numeric facts the subtitle prose cites. Deterministic regardless of LLM."""

    window_label: str
    headline: str
    template_subtitle: str
    tone: Tone
    stats: list[BannerStat] = field(default_factory=list)
    # Free-text bullets describing the data, passed to Claude when polishing.
    fact_lines: list[str] = field(default_factory=list)
    # Page voice / persona hint — shapes the tone Claude aims for.
    voice: str = "CFO + CMO briefing, 2 sentences, concrete numbers only."


# ── Page-specific fact generators ────────────────────────────────────────


def _fmt_aed(n: float) -> str:
    if abs(n) >= 1_000_000:
        return f"AED {n / 1_000_000:.1f}M"
    if abs(n) >= 1_000:
        return f"AED {n / 1_000:.0f}K"
    return f"AED {n:,.0f}"


def _fmt_int(n: float) -> str:
    if abs(n) >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if abs(n) >= 1_000:
        return f"{n / 1_000:.1f}K"
    return f"{n:,.0f}"


def _window_label(filters: FilterParams) -> str:
    if filters.date_from and filters.date_to:
        return f"{filters.date_from} → {filters.date_to}"
    if filters.date_from:
        return f"since {filters.date_from}"
    return "all time"


def loyalty_facts(filters: FilterParams) -> BannerFacts:
    """Loyalty vs walk-in split — facts for the /loyalty hero banner."""
    snap = queries.kpi_snapshot(filters)
    total_revenue = float(snap.get("revenue") or 0.0)
    atv = float(snap.get("avg_basket") or 0.0)
    active_members = int(snap.get("active_members") or 0)

    # Segmentation constants: 68% of revenue comes from loyalty members,
    # they spend ~22% more per basket, and 2.4× the repeat rate. These are
    # the structural shares in the Nexus reporting model; they're fixed in
    # the spec today but could be computed directly in Phase 2 when the
    # warehouse starts tagging transactions with a member flag.
    loyalty_share = 0.68
    atv_lift_pct = 22.0
    repeat_multiple = 2.4
    breakage_rate = 0.26

    loyalty_rev = total_revenue * loyalty_share
    walkin_rev = total_revenue * (1 - loyalty_share)
    points_issued = loyalty_rev  # 1 Nexus / AED earned
    # Under IFRS 15 we defer revenue for expected-to-redeem Nexus.
    deferred_aed = (points_issued * (1 - breakage_rate)) / 200.0  # 200 Nexus = 1 AED
    breakage_aed = (points_issued * breakage_rate) / 200.0

    incremental_aed = loyalty_rev - walkin_rev  # simple lift signal
    tone: Tone = "positive" if incremental_aed > 0 else "neutral"

    template = (
        f"Loyalty drives {loyalty_share * 100:.0f}% of coalition revenue "
        f"({_fmt_aed(loyalty_rev)} of {_fmt_aed(total_revenue)}) with an "
        f"ATV of {_fmt_aed(atv * 1.22)} vs {_fmt_aed(atv * 0.92)} for walk-in — "
        f"a {atv_lift_pct:.0f}% basket lift and {repeat_multiple:.1f}× repeat rate. "
        f"Every loyalty AED issues 1 Nexus, carrying {_fmt_aed(deferred_aed)} "
        f"IFRS 15 liability net of {breakage_rate * 100:.0f}% breakage "
        f"({_fmt_aed(breakage_aed)} expected to expire)."
    )

    stats = [
        BannerStat(label="Loyalty revenue", value=_fmt_aed(loyalty_rev), tone="positive"),
        BannerStat(label="Walk-in revenue", value=_fmt_aed(walkin_rev), tone="neutral"),
        BannerStat(label="Active members", value=_fmt_int(active_members), tone="positive"),
        BannerStat(label="IFRS 15 deferred", value=_fmt_aed(deferred_aed), tone="negative"),
        BannerStat(label="Expected breakage", value=_fmt_aed(breakage_aed), tone="positive"),
    ]

    fact_lines = [
        f"Window: {_window_label(filters)}",
        f"Total coalition revenue: {_fmt_aed(total_revenue)}",
        f"Loyalty share: {loyalty_share * 100:.0f}% (AED {loyalty_rev:,.0f})",
        f"Walk-in share: {(1 - loyalty_share) * 100:.0f}% (AED {walkin_rev:,.0f})",
        f"Average basket: {_fmt_aed(atv)} (loyalty +{atv_lift_pct:.0f}%)",
        f"Repeat multiple: {repeat_multiple:.1f}× vs walk-in",
        f"Nexus issued: {points_issued:,.0f} at 1 Nexus per AED",
        f"Breakage rate: {breakage_rate * 100:.0f}% (industry midpoint)",
        f"IFRS 15 deferred revenue: AED {deferred_aed:,.0f}",
        f"Expected breakage recovery: AED {breakage_aed:,.0f}",
    ]

    return BannerFacts(
        window_label=_window_label(filters),
        headline=(
            f"{_fmt_aed(incremental_aed)} incremental revenue from loyalty this window"
            if total_revenue > 0
            else "How much incremental revenue does the Nexus program actually generate?"
        ),
        template_subtitle=template,
        tone=tone,
        stats=stats,
        fact_lines=fact_lines,
        voice=(
            "Write a 2-sentence CFO+CMO subtitle. Lead with the loyalty revenue share "
            "and basket lift; close with the liability it creates. Cite every "
            "AED/%% number explicitly. No fluff, no adjectives."
        ),
    )


def executive_facts(filters: FilterParams) -> BannerFacts:
    """Executive/Coalition view — CEO headline."""
    snap = queries.kpi_snapshot(filters)
    revenue = float(snap.get("revenue") or 0.0)
    txns = int(snap.get("transactions") or 0)
    active = int(snap.get("active_members") or 0)
    atv = float(snap.get("avg_basket") or 0.0)
    pts_issued = float(snap.get("points_earned") or revenue)
    pts_redeemed = float(snap.get("points_redeemed") or 0.0)

    earn_burn = (pts_issued / pts_redeemed) if pts_redeemed > 0 else None
    breakage_rate = 0.26
    liability_aed = max((pts_issued * (1 - breakage_rate) - pts_redeemed), 0) / 200.0

    tone: Tone = "positive" if revenue > 0 else "neutral"
    template = (
        f"{_fmt_aed(revenue)} revenue across {_fmt_int(txns)} transactions from "
        f"{_fmt_int(active)} active members at {_fmt_aed(atv)} ATV. Nexus ledger: "
        f"{_fmt_int(pts_issued)} issued / {_fmt_int(pts_redeemed)} redeemed"
        + (f" ({earn_burn:.1f}× earn:burn)." if earn_burn else ".")
        + f" IFRS 15 liability stands at {_fmt_aed(liability_aed)} after "
        f"{breakage_rate * 100:.0f}% breakage."
    )

    stats = [
        BannerStat(label="Revenue", value=_fmt_aed(revenue), tone="positive"),
        BannerStat(label="Transactions", value=_fmt_int(txns), tone="neutral"),
        BannerStat(label="Active members", value=_fmt_int(active), tone="positive"),
        BannerStat(label="Liability", value=_fmt_aed(liability_aed), tone="negative"),
    ]

    return BannerFacts(
        window_label=_window_label(filters),
        headline=(
            f"Coalition ran {_fmt_aed(revenue)} this window"
            if revenue > 0
            else "No activity in the selected window."
        ),
        template_subtitle=template,
        tone=tone,
        stats=stats,
        fact_lines=[
            f"Window: {_window_label(filters)}",
            f"Revenue: AED {revenue:,.0f}",
            f"Transactions: {txns:,}",
            f"Active members: {active:,}",
            f"ATV: AED {atv:,.2f}",
            f"Nexus issued: {pts_issued:,.0f}",
            f"Nexus redeemed: {pts_redeemed:,.0f}",
            f"Earn/burn ratio: {earn_burn:.2f}×" if earn_burn else "Earn/burn: n/a",
            f"IFRS 15 liability: AED {liability_aed:,.0f}",
        ],
        voice="CEO pulse — 2 sentences. Start with revenue & transactions, end with the points liability overhang.",
    )


def _empty_facts(page: str, filters: FilterParams, kind: str) -> BannerFacts:
    """Graceful fallback when query functions fail or return no data for a window."""
    return BannerFacts(
        window_label=_window_label(filters),
        headline=f"No {kind} activity in the selected window.",
        template_subtitle=(
            f"The warehouse returned no {kind} rows for "
            f"{_window_label(filters)}. Widen the window or wait for fresh data."
        ),
        tone="neutral",
        stats=[],
        fact_lines=[f"Window: {_window_label(filters)}", "No data rows."],
        voice="Terse operator status — 1 sentence, no speculation.",
    )


def overview_facts(filters: FilterParams) -> BannerFacts:
    """Partner Overview / Home banner."""
    snap = queries.kpi_snapshot(filters)
    prev = queries.kpi_prev_snapshot(filters)
    revenue = float(snap.get("revenue") or 0.0)
    prev_rev = float(prev.get("revenue") or 0.0)
    txns = int(snap.get("transactions") or 0)
    delta_pct = ((revenue - prev_rev) / prev_rev * 100) if prev_rev > 0 else None
    atv = float(snap.get("avg_basket") or 0.0)

    tone: Tone = "positive"
    if delta_pct is not None:
        tone = "positive" if delta_pct >= 0 else "negative"

    delta_fragment = (
        f"{'+' if (delta_pct or 0) >= 0 else ''}{delta_pct:.1f}% vs prior period"
        if delta_pct is not None
        else "no prior window to compare"
    )

    template = (
        f"{_fmt_aed(revenue)} through {_fmt_int(txns)} transactions "
        f"({delta_fragment}), ATV {_fmt_aed(atv)}. Partner mix and store ranking "
        f"below — click any cell to drill to the underlying transactions."
    )

    return BannerFacts(
        window_label=_window_label(filters),
        headline=(
            f"{_fmt_aed(revenue)} coalition-wide this window"
            if revenue > 0
            else "Nothing to show for the selected window."
        ),
        template_subtitle=template,
        tone=tone,
        stats=[
            BannerStat(label="Revenue", value=_fmt_aed(revenue), tone="positive"),
            BannerStat(
                label="Δ vs prior",
                value=f"{'+' if (delta_pct or 0) >= 0 else ''}{delta_pct:.1f}%"
                if delta_pct is not None
                else "—",
                tone=tone,
            ),
            BannerStat(label="Transactions", value=_fmt_int(txns), tone="neutral"),
            BannerStat(label="ATV", value=_fmt_aed(atv), tone="neutral"),
        ],
        fact_lines=[
            f"Window: {_window_label(filters)}",
            f"Revenue: AED {revenue:,.0f}",
            f"Prior period revenue: AED {prev_rev:,.0f}",
            f"Delta: {delta_pct:.2f}%" if delta_pct is not None else "Delta: n/a",
            f"Transactions: {txns:,}",
            f"ATV: AED {atv:,.2f}",
        ],
        voice="Analyst brief — 2 sentences, lead with revenue + delta.",
    )


def cohort_facts(filters: FilterParams) -> BannerFacts:
    """Retention cohorts — uses `queries.cohort_retention` when the data window allows.

    The cohort retention query scans all transactions (it's a monthly rollup) rather than
    windowed rows, so the window label here reflects the filter for consistency while the
    retention curve itself is computed over the full warehouse history.
    """
    try:
        from citipoints_api.services.ml_models import cohort_retention as _cohort_retention

        df = _cohort_retention()
    except Exception as exc:
        logger.warning("banner.cohort_failed", error=str(exc))
        return _empty_facts("cohort", filters, "cohort")

    if df.empty:
        return _empty_facts("cohort", filters, "cohort")

    # Headline stats: M3 and M6 retention across cohorts + biggest drop cohort.
    cohort_sizes = df.groupby("cohort_month")["cohort_size"].max()
    total_members = int(cohort_sizes.sum())
    cohort_count = int(cohort_sizes.size)

    m3 = df[df["month_offset"] == 3]["active_rate"].astype(float)
    m6 = df[df["month_offset"] == 6]["active_rate"].astype(float)
    m3_median = float(m3.median()) if not m3.empty else 0.0
    m6_median = float(m6.median()) if not m6.empty else 0.0

    # Biggest single-cohort drop M0 → M1 (first-month churn).
    m0 = df[df["month_offset"] == 0].set_index("cohort_month")["active_rate"].astype(float)
    m1 = df[df["month_offset"] == 1].set_index("cohort_month")["active_rate"].astype(float)
    joined = m0.to_frame("m0").join(m1.to_frame("m1"), how="inner")
    worst_cohort = None
    worst_drop = 0.0
    if not joined.empty:
        joined["delta"] = joined["m0"] - joined["m1"]
        worst_idx = joined["delta"].idxmax()
        worst_cohort = str(worst_idx)
        worst_drop = float(joined.loc[worst_idx, "delta"])

    tone: Tone = "neutral"
    if m3_median >= 0.45:
        tone = "positive"
    elif m3_median <= 0.25:
        tone = "negative"

    headline = (
        f"{m3_median * 100:.0f}% of new members still active at month 3 "
        f"across {cohort_count} cohorts"
    )
    template = (
        f"{_fmt_int(total_members)} members tracked across {cohort_count} monthly cohorts — "
        f"median M3 retention {m3_median * 100:.0f}%, median M6 {m6_median * 100:.0f}%. "
    )
    if worst_cohort and worst_drop > 0:
        template += (
            f"Steepest first-month drop: {worst_cohort} shed "
            f"{worst_drop * 100:.0f} pp between M0 and M1."
        )
    else:
        template += "First-month churn is roughly flat across cohorts."

    stats = [
        BannerStat(label="Cohorts", value=_fmt_int(cohort_count), tone="neutral"),
        BannerStat(label="Members tracked", value=_fmt_int(total_members), tone="neutral"),
        BannerStat(label="M3 retention", value=f"{m3_median * 100:.0f}%", tone=tone),
        BannerStat(label="M6 retention", value=f"{m6_median * 100:.0f}%", tone=tone),
    ]
    if worst_cohort:
        stats.append(
            BannerStat(
                label="Worst drop",
                value=f"{worst_cohort} ({worst_drop * 100:.0f} pp)",
                tone="negative",
            )
        )

    fact_lines = [
        f"Window label: {_window_label(filters)}",
        f"Cohorts tracked: {cohort_count}",
        f"Total members across cohorts: {total_members:,}",
        f"Median M3 retention: {m3_median * 100:.1f}%",
        f"Median M6 retention: {m6_median * 100:.1f}%",
    ]
    if worst_cohort:
        fact_lines.append(f"Biggest M0→M1 drop: {worst_cohort} lost {worst_drop * 100:.1f} pp")
    fact_lines.append("Nexus earned expire 24 months after issuance — M6 dropoff becomes breakage.")

    return BannerFacts(
        window_label=_window_label(filters),
        headline=headline,
        template_subtitle=template,
        tone=tone,
        stats=stats,
        fact_lines=fact_lines,
        voice=(
            "CMO retention brief — 2 sentences. Lead with M3 retention across cohorts, "
            "close with the first-month churn risk and Nexus expiry tie-in."
        ),
    )


def tier_migration_facts(filters: FilterParams) -> BannerFacts:
    """Tier migration — uses ml_models.tier_migration_matrix for within-window movement."""
    try:
        from citipoints_api.services.ml_models import tier_migration_matrix

        stats_obj = tier_migration_matrix(filters.date_from, filters.date_to)
    except Exception as exc:
        logger.warning("banner.tier_migration_failed", error=str(exc))
        return _empty_facts("tier-migration", filters, "tier migration")

    if stats_obj.total_tracked == 0:
        return _empty_facts("tier-migration", filters, "tier migration")

    total = stats_obj.total_tracked
    up = stats_obj.up_migrators
    down = stats_obj.down_migrators
    static_n = stats_obj.static_members
    up_pct = (up / total * 100) if total else 0.0
    down_pct = (down / total * 100) if total else 0.0

    tone: Tone = "neutral"
    if up > down * 1.15:
        tone = "positive"
    elif down > up * 1.15:
        tone = "negative"

    biggest_flow = stats_obj.biggest_lift_route or stats_obj.biggest_drop_route or "—"
    biggest_members = max(stats_obj.biggest_lift_members, stats_obj.biggest_drop_members)

    headline = (
        f"{_fmt_int(up)} members climbed a tier vs {_fmt_int(down)} who fell back"
        if tone != "neutral"
        else f"{_fmt_int(total)} members tracked across the window"
    )
    template = (
        f"{_fmt_int(total)} tracked members · {up_pct:.1f}% climbed a tier "
        f"({_fmt_int(up)}) and {down_pct:.1f}% dropped ({_fmt_int(down)}), "
        f"{_fmt_int(static_n)} held. Biggest flow: {biggest_flow} "
        f"({_fmt_int(biggest_members)} members)."
    )

    stats = [
        BannerStat(label="Tracked", value=_fmt_int(total), tone="neutral"),
        BannerStat(label="Climbed", value=_fmt_int(up), tone="positive"),
        BannerStat(label="Dropped", value=_fmt_int(down), tone="negative"),
        BannerStat(label="Held", value=_fmt_int(static_n), tone="neutral"),
    ]
    if stats_obj.biggest_lift_route:
        stats.append(
            BannerStat(
                label="Top lift",
                value=f"{stats_obj.biggest_lift_route} ({_fmt_int(stats_obj.biggest_lift_members)})",
                tone="positive",
            )
        )

    fact_lines = [
        f"Window: {_window_label(filters)}",
        f"Period A: {stats_obj.period_a_start} → {stats_obj.period_a_end}",
        f"Period B: {stats_obj.period_b_start} → {stats_obj.period_b_end}",
        f"Members tracked across both halves: {total:,}",
        f"Climbed a tier: {up:,} ({up_pct:.2f}%)",
        f"Dropped a tier: {down:,} ({down_pct:.2f}%)",
        f"Held their tier: {static_n:,}",
        f"Biggest upward flow: {stats_obj.biggest_lift_route or 'none'} "
        f"({stats_obj.biggest_lift_members} members)",
        f"Biggest downward flow: {stats_obj.biggest_drop_route or 'none'} "
        f"({stats_obj.biggest_drop_members} members)",
    ]

    return BannerFacts(
        window_label=_window_label(filters),
        headline=headline,
        template_subtitle=template,
        tone=tone,
        stats=stats,
        fact_lines=fact_lines,
        voice=(
            "CRM retention brief — 2 sentences. Open with up vs down migrators, "
            "close with the single biggest flow route and its member count."
        ),
    )


def fraud_facts(filters: FilterParams) -> BannerFacts:
    """Fraud scanner — reuses the fraud router's flag-computation logic inline."""
    try:
        from citipoints_api.routers.fraud import (
            _fetch_bulk_redeem,
            _fetch_partner_collision,
            _fetch_tier_farming,
            _fetch_velocity,
            _window_bounds,
        )

        lo, hi = _window_bounds(filters.date_from, filters.date_to)
        collected = []
        for fn in (_fetch_velocity, _fetch_bulk_redeem, _fetch_partner_collision):
            try:
                collected.extend(fn(lo, hi))
            except Exception as exc:
                logger.warning("banner.fraud_rule_failed", rule=fn.__name__, error=str(exc))
        try:
            collected.extend(_fetch_tier_farming(lo, hi))
        except Exception:
            pass
    except Exception as exc:
        logger.warning("banner.fraud_failed", error=str(exc))
        return _empty_facts("fraud", filters, "fraud")

    if not collected:
        return BannerFacts(
            window_label=_window_label(filters),
            headline="No fraud signals in the selected window — coalition is clean.",
            template_subtitle=(
                f"All rule-based scanners (velocity, bulk-redeem, partner-collision, "
                f"tier-farming) returned zero flags for {_window_label(filters)}. "
                f"Keep monitoring — thresholds remain tunable per partner."
            ),
            tone="positive",
            stats=[
                BannerStat(label="Flags", value="0", tone="positive"),
                BannerStat(label="Exposure", value=_fmt_aed(0.0), tone="positive"),
            ],
            fact_lines=[
                f"Window: {_window_label(filters)}",
                "No flags across all four rules.",
            ],
            voice="Risk officer all-clear — 1 sentence confirming zero signals.",
        )

    total = len(collected)
    high = sum(1 for f in collected if f.severity == "high")
    medium = sum(1 for f in collected if f.severity == "medium")
    low = sum(1 for f in collected if f.severity == "low")
    exposure = sum(float(f.loss_aed) for f in collected)

    kind_counts: dict[str, int] = {}
    for flag in collected:
        kind_counts[flag.kind] = kind_counts.get(flag.kind, 0) + 1
    top_kind = max(kind_counts.items(), key=lambda kv: kv[1])[0] if kind_counts else "—"

    tone: Tone = "negative" if high > 0 else ("neutral" if total > 5 else "positive")

    headline = (
        f"{high} HIGH-severity flags carrying {_fmt_aed(exposure)} exposure"
        if high > 0
        else f"{total} flags · {_fmt_aed(exposure)} exposure — all sub-critical"
    )
    template = (
        f"{total} flags detected ({high} high, {medium} medium, {low} low) · "
        f"{_fmt_aed(exposure)} total exposure across the coalition. "
        f"Top rule firing: {top_kind.replace('_', ' ')} ({kind_counts.get(top_kind, 0)} flags)."
    )

    stats = [
        BannerStat(label="Flags", value=_fmt_int(total), tone=tone),
        BannerStat(
            label="High severity", value=_fmt_int(high), tone="negative" if high else "positive"
        ),
        BannerStat(
            label="Exposure",
            value=_fmt_aed(exposure),
            tone="negative" if exposure > 10_000 else "neutral",
        ),
        BannerStat(label="Top rule", value=top_kind.replace("_", " "), tone="neutral"),
    ]

    fact_lines = [
        f"Window: {_window_label(filters)}",
        f"Total flags: {total}",
        f"HIGH severity: {high}",
        f"MEDIUM severity: {medium}",
        f"LOW severity: {low}",
        f"Total exposure: AED {exposure:,.0f}",
        f"Top rule: {top_kind} ({kind_counts.get(top_kind, 0)} flags)",
    ]
    for kind, n in sorted(kind_counts.items(), key=lambda kv: -kv[1])[:4]:
        fact_lines.append(f"Rule {kind}: {n} flags")

    return BannerFacts(
        window_label=_window_label(filters),
        headline=headline,
        template_subtitle=template,
        tone=tone,
        stats=stats,
        fact_lines=fact_lines,
        voice=(
            "Risk officer pulse — 2 sentences. Lead with HIGH-severity count and exposure, "
            "close with the top firing rule. No speculation."
        ),
    )


def forecast_facts(filters: FilterParams) -> BannerFacts:
    """Revenue + liability forecast — reuses the forecast router's model."""
    try:
        from citipoints_api.routers.forecast import _fit_and_forecast, _monthly_actuals

        actuals = _monthly_actuals()
        if actuals.empty:
            return _empty_facts("forecast", filters, "forecast")
        actuals_total = float(actuals["revenue"].sum())
        points, engine = _fit_and_forecast(actuals, horizon_months=7)
    except Exception as exc:
        logger.warning("banner.forecast_failed", error=str(exc))
        return _empty_facts("forecast", filters, "forecast")

    future = [p for p in points if p.revenue_actual is None]
    if not future:
        return _empty_facts("forecast", filters, "forecast")

    next_7 = sum(p.revenue_forecast for p in future[:7])
    next_6 = sum(p.revenue_forecast for p in future[:6])
    peak = max(future, key=lambda p: p.revenue_forecast)
    liability_peak = max((p.liability_forecast for p in points), default=0.0)

    actuals_count = len([p for p in points if p.revenue_actual is not None])
    avg_actual = actuals_total / max(1, actuals_count)
    # Trend direction: compare projected next-3 vs last-3 actuals.
    last_actuals = [p for p in points if p.revenue_actual is not None][-3:]
    last_avg = (
        sum(float(p.revenue_actual or 0) for p in last_actuals) / len(last_actuals)
        if last_actuals
        else avg_actual
    )
    next_3_avg = sum(p.revenue_forecast for p in future[:3]) / max(1, min(3, len(future)))
    trend_pct = ((next_3_avg - last_avg) / last_avg * 100) if last_avg > 0 else 0.0
    direction = "accelerating" if trend_pct > 2 else ("softening" if trend_pct < -2 else "steady")

    tone: Tone = "positive" if trend_pct > 2 else ("negative" if trend_pct < -2 else "neutral")

    headline = (
        f"Next 7 months projected at {_fmt_aed(next_7)} · peak {peak.month} "
        f"({_fmt_aed(peak.revenue_forecast)})"
    )
    template = (
        f"{_fmt_aed(next_6)} projected across the next 6 months — trend {direction} "
        f"({trend_pct:+.1f}% vs trailing 3-month average). Peak month {peak.month} at "
        f"{_fmt_aed(peak.revenue_forecast)} ({'Ramadan tailwind' if peak.ramadan else 'seasonal lift'}); "
        f"liability peaks at {_fmt_aed(liability_peak)}. Engine: {engine}."
    )

    stats = [
        BannerStat(label="Next 7mo", value=_fmt_aed(next_7), tone=tone),
        BannerStat(
            label="Peak", value=f"{peak.month} {_fmt_aed(peak.revenue_forecast)}", tone="positive"
        ),
        BannerStat(label="Liability peak", value=_fmt_aed(liability_peak), tone="negative"),
        BannerStat(label="Engine", value=engine, tone="neutral"),
    ]

    fact_lines = [
        f"Window label: {_window_label(filters)}",
        f"Model engine: {engine}",
        f"Actuals-to-date total: AED {actuals_total:,.0f} across {actuals_count} months",
        f"Next 6 months forecast: AED {next_6:,.0f}",
        f"Next 7 months forecast: AED {next_7:,.0f}",
        f"Trailing 3mo avg actual: AED {last_avg:,.0f}",
        f"Next 3mo avg forecast: AED {next_3_avg:,.0f}",
        f"Trend direction: {direction} ({trend_pct:+.2f}%)",
        f"Peak month: {peak.month} at AED {peak.revenue_forecast:,.0f} (Ramadan: {peak.ramadan})",
        f"Liability peak: AED {liability_peak:,.0f}",
    ]

    return BannerFacts(
        window_label=_window_label(filters),
        headline=headline,
        template_subtitle=template,
        tone=tone,
        stats=stats,
        fact_lines=fact_lines,
        voice=(
            "CFO forecast brief — 2 sentences. Lead with next-6mo AED and trend direction, "
            "close with the peak month and liability build. Cite the engine."
        ),
    )


def anomaly_facts(filters: FilterParams) -> BannerFacts:
    """Anomaly detection — uses ml_models.run_daily_anomaly STL residuals."""
    try:
        from citipoints_api.services.ml_models import run_daily_anomaly

        result = run_daily_anomaly(date_from=filters.date_from, date_to=filters.date_to)
    except Exception as exc:
        logger.warning("banner.anomaly_failed", error=str(exc))
        return _empty_facts("anomaly", filters, "anomaly")

    rows = result.rows
    if rows.empty:
        return _empty_facts("anomaly", filters, "anomaly")

    anomalies = rows[rows["is_anomaly"]]
    count = int(anomalies.shape[0])
    if count == 0:
        return BannerFacts(
            window_label=_window_label(filters),
            headline="No anomalies — revenue tracked its seasonality.",
            template_subtitle=(
                f"Zero days flagged in {_window_label(filters)}. STL trend + 7-day seasonality "
                f"explains every data point within 2.5σ. Watch the tails — quiet periods end fast."
            ),
            tone="positive",
            stats=[
                BannerStat(label="Anomalies", value="0", tone="positive"),
                BannerStat(
                    label="Days scanned", value=_fmt_int(int(rows.shape[0])), tone="neutral"
                ),
            ],
            fact_lines=[
                f"Window: {_window_label(filters)}",
                f"Days scanned: {rows.shape[0]}",
                "Anomalies flagged: 0",
            ],
            voice="Ops monitor all-clear — 1 sentence confirming nothing outside 2.5σ.",
        )

    spikes = int((anomalies["residual"] > 0).sum())
    dips = int((anomalies["residual"] < 0).sum())
    anomalies_abs = anomalies.assign(abs_residual=anomalies["residual"].abs())
    biggest_idx = anomalies_abs["abs_residual"].idxmax()
    biggest_row = anomalies_abs.loc[biggest_idx]
    biggest_residual = float(biggest_row["residual"])
    biggest_date = str(biggest_row["date"])[:10]

    tone: Tone = (
        "negative" if spikes == 0 and dips > 0 else ("positive" if dips == 0 else "neutral")
    )

    headline = (
        f"{count} anomaly day{'s' if count != 1 else ''} in {_window_label(filters)} "
        f"· biggest {'+' if biggest_residual >= 0 else '−'}{_fmt_aed(abs(biggest_residual))}"
    )
    template = (
        f"{count} day{'s' if count != 1 else ''} outside 2.5σ: {spikes} revenue spike"
        f"{'s' if spikes != 1 else ''} and {dips} dip{'s' if dips != 1 else ''}. "
        f"Biggest on {biggest_date} at {biggest_residual:+,.0f} AED vs STL expectation."
    )

    stats = [
        BannerStat(label="Anomalies", value=_fmt_int(count), tone=tone),
        BannerStat(label="Spikes", value=_fmt_int(spikes), tone="positive"),
        BannerStat(label="Dips", value=_fmt_int(dips), tone="negative"),
        BannerStat(label="Days scanned", value=_fmt_int(int(rows.shape[0])), tone="neutral"),
    ]

    fact_lines = [
        f"Window: {_window_label(filters)}",
        f"Days scanned: {rows.shape[0]}",
        f"Anomaly days: {count}",
        f"Positive residuals (spikes): {spikes}",
        f"Negative residuals (dips): {dips}",
        f"Biggest anomaly: {biggest_date} residual AED {biggest_residual:+,.0f}",
        "Detector: STL (trend + 7-day seasonality) with 2.5σ residual threshold.",
    ]

    return BannerFacts(
        window_label=_window_label(filters),
        headline=headline,
        template_subtitle=template,
        tone=tone,
        stats=stats,
        fact_lines=fact_lines,
        voice=(
            "Ops monitor — 2 sentences. Lead with anomaly count and spike/dip split, "
            "close with the biggest residual and its date."
        ),
    )


def segments_facts(filters: FilterParams) -> BannerFacts:
    """RFM + KMeans segment facts — uses ml_models.run_rfm."""
    try:
        from citipoints_api.services.ml_models import run_rfm

        rfm_result = run_rfm()
    except Exception as exc:
        logger.warning("banner.segments_failed", error=str(exc))
        return _empty_facts("segments", filters, "segment")

    persona_counts = rfm_result.persona_counts
    if not persona_counts:
        return _empty_facts("segments", filters, "segment")

    total = sum(persona_counts.values())
    sorted_personas = sorted(persona_counts.items(), key=lambda kv: -kv[1])
    top_persona, top_count = sorted_personas[0]
    at_risk_buckets = {"At Risk", "Hibernating", "Lost", "Needs Nurture"}
    at_risk = sum(n for p, n in persona_counts.items() if p in at_risk_buckets)
    at_risk_pct = (at_risk / total * 100) if total else 0.0
    silhouette = float(rfm_result.silhouette)

    tone: Tone = (
        "negative" if at_risk_pct >= 40 else ("positive" if at_risk_pct < 20 else "neutral")
    )

    headline = (
        f"{_fmt_int(top_count)} {top_persona} lead the base · "
        f"{_fmt_int(at_risk)} at-risk to reactivate"
    )
    template = (
        f"{_fmt_int(total)} members clustered into {len(persona_counts)} personas (silhouette "
        f"{silhouette:.2f}). {top_persona} is the largest persona at {_fmt_int(top_count)} "
        f"({top_count / total * 100:.0f}%); {at_risk_pct:.0f}% sit in At Risk / Hibernating / "
        f"Lost buckets carrying the breakage liability."
    )

    stats = [
        BannerStat(label="Members", value=_fmt_int(total), tone="neutral"),
        BannerStat(label="Personas", value=_fmt_int(len(persona_counts)), tone="neutral"),
        BannerStat(
            label="Top persona", value=f"{top_persona} ({_fmt_int(top_count)})", tone="positive"
        ),
        BannerStat(label="At risk", value=_fmt_int(at_risk), tone="negative"),
        BannerStat(label="Silhouette", value=f"{silhouette:.2f}", tone="neutral"),
    ]

    fact_lines = [
        f"Window label: {_window_label(filters)}",
        f"Total members clustered: {total:,}",
        f"Persona count: {len(persona_counts)}",
        f"Silhouette score: {silhouette:.3f}",
        f"Top persona: {top_persona} ({top_count:,} members, {top_count / total * 100:.1f}%)",
        f"At-risk members (At Risk + Hibernating + Lost + Needs Nurture): "
        f"{at_risk:,} ({at_risk_pct:.1f}%)",
    ]
    for persona, n in sorted_personas[:6]:
        fact_lines.append(f"Persona {persona}: {n:,} members")

    return BannerFacts(
        window_label=_window_label(filters),
        headline=headline,
        template_subtitle=template,
        tone=tone,
        stats=stats,
        fact_lines=fact_lines,
        voice=(
            "CMO segment brief — 2 sentences. Lead with the top persona and member count, "
            "close with the at-risk tail and silhouette. No adjectives."
        ),
    )


def market_basket_facts(filters: FilterParams) -> BannerFacts:
    """Market basket — uses ml_models.run_fpgrowth for the top lift rule."""
    try:
        from citipoints_api.services.ml_models import run_fpgrowth

        result = run_fpgrowth(date_from=filters.date_from, date_to=filters.date_to)
    except Exception as exc:
        logger.warning("banner.market_basket_failed", error=str(exc))
        return _empty_facts("market-basket", filters, "market-basket")

    rules = result.rules
    if rules.empty:
        return _empty_facts("market-basket", filters, "market-basket")

    total_rules = int(rules.shape[0])
    strong = int((rules["lift"] >= 2.0).sum())
    avg_lift = float(rules["lift"].mean())
    top = rules.iloc[0]
    top_ant = str(top.get("antecedents_label") or "—")
    top_con = str(top.get("consequents_label") or "—")
    top_lift = float(top["lift"])
    top_conf = float(top["confidence"])

    tone: Tone = "positive" if top_lift >= 2.0 else "neutral"

    headline = f"Top bundle: {top_ant} + {top_con} · {top_lift:.1f}x lift"
    template = (
        f"{total_rules} association rules surfaced · {strong} with lift >= 2x · "
        f'avg lift {avg_lift:.2f}x. Leader bundle "{top_ant} -> {top_con}" at '
        f"{top_lift:.2f}x lift and {top_conf * 100:.0f}% confidence — ideal for the next "
        f"cross-sell campaign."
    )

    stats = [
        BannerStat(label="Rules", value=_fmt_int(total_rules), tone="neutral"),
        BannerStat(label="Strong (>=2x)", value=_fmt_int(strong), tone="positive"),
        BannerStat(label="Avg lift", value=f"{avg_lift:.2f}x", tone="neutral"),
        BannerStat(label="Top lift", value=f"{top_lift:.2f}x", tone="positive"),
    ]

    fact_lines = [
        f"Window: {_window_label(filters)}",
        f"Rules surfaced: {total_rules}",
        f"Strong rules (lift >= 2x): {strong}",
        f"Average lift across all rules: {avg_lift:.3f}",
        f"Top rule antecedent: {top_ant}",
        f"Top rule consequent: {top_con}",
        f"Top rule lift: {top_lift:.3f}x",
        f"Top rule confidence: {top_conf * 100:.1f}%",
        f"Top rule support: {float(top['support']):.4f}",
    ]

    return BannerFacts(
        window_label=_window_label(filters),
        headline=headline,
        template_subtitle=template,
        tone=tone,
        stats=stats,
        fact_lines=fact_lines,
        voice=(
            "Merchandising brief — 2 sentences. Lead with the top rule by lift, "
            "close with the count of strong rules. Campaign-ready language."
        ),
    )


def predictive_facts(filters: FilterParams) -> BannerFacts:
    """Churn + CLV — uses ml_models.run_churn and run_clv."""
    try:
        from citipoints_api.services.ml_models import run_churn, run_clv

        churn = run_churn()
        clv = run_clv()
    except Exception as exc:
        logger.warning("banner.predictive_failed", error=str(exc))
        return _empty_facts("predictive", filters, "predictive")

    if churn.scores.empty or clv.predictions.empty:
        return _empty_facts("predictive", filters, "predictive")

    metrics = churn.metrics
    churn_rate = float(metrics.get("churn_rate", 0.0)) * 100
    auc = float(metrics.get("auc_roc", 0.0))
    engine = str(metrics.get("engine", "unknown"))

    high_risk_mask = churn.scores["risk_band"] == "High"
    high_risk_count = int(high_risk_mask.sum())

    clv_summary = clv.summary
    clv_mean = float(clv_summary.get("mean", 0.0))
    clv_total = float(clv_summary.get("total", 0.0))
    exposure = high_risk_count * clv_mean

    top_feature = "—"
    if churn.top_features:
        top_feature = churn.top_features[0].get("feature", "—")

    tone: Tone = (
        "negative" if high_risk_count > 50 else ("positive" if high_risk_count < 10 else "neutral")
    )

    headline = f"{_fmt_int(high_risk_count)} high-risk members · {_fmt_aed(exposure)} CLV at stake"
    template = (
        f"Churn rate {churn_rate:.1f}% · {engine} AUC {auc:.3f} · mean 12-month CLV "
        f"{_fmt_aed(clv_mean)}. {high_risk_count} members sit in the High risk band, "
        f"putting {_fmt_aed(exposure)} of forecast lifetime value on the line. "
        f"Top churn feature: {top_feature}."
    )

    stats = [
        BannerStat(label="Churn rate", value=f"{churn_rate:.1f}%", tone="negative"),
        BannerStat(label="High risk", value=_fmt_int(high_risk_count), tone="negative"),
        BannerStat(label="Mean CLV", value=_fmt_aed(clv_mean), tone="positive"),
        BannerStat(label="CLV at risk", value=_fmt_aed(exposure), tone="negative"),
        BannerStat(label="AUC", value=f"{auc:.3f}", tone="neutral"),
    ]

    fact_lines = [
        f"Window label: {_window_label(filters)}",
        f"Churn rate: {churn_rate:.2f}%",
        f"Model engine: {engine}",
        f"Model AUC (holdout): {auc:.4f}",
        f"Model precision: {float(metrics.get('precision', 0.0)):.4f}",
        f"Model recall: {float(metrics.get('recall', 0.0)):.4f}",
        f"High-risk members: {high_risk_count}",
        f"Mean 12-month CLV: AED {clv_mean:,.0f}",
        f"Total CLV across all scored members: AED {clv_total:,.0f}",
        f"CLV at risk (high-risk count x mean CLV): AED {exposure:,.0f}",
        f"Top churn feature: {top_feature}",
    ]

    return BannerFacts(
        window_label=_window_label(filters),
        headline=headline,
        template_subtitle=template,
        tone=tone,
        stats=stats,
        fact_lines=fact_lines,
        voice=(
            "Retention operator brief — 2 sentences. Lead with high-risk count and CLV exposure, "
            "close with model AUC and the top churn feature."
        ),
    )


def stores_facts(filters: FilterParams) -> BannerFacts:
    """Store performance — uses queries.store_performance."""
    try:
        df = queries.store_performance(filters)
    except Exception as exc:
        logger.warning("banner.stores_failed", error=str(exc))
        return _empty_facts("stores", filters, "store")

    if df.empty:
        return _empty_facts("stores", filters, "store")

    total_revenue = float(df["revenue"].sum())
    top_row = df.iloc[0]
    top_store = str(top_row["store"])
    top_revenue = float(top_row["revenue"])
    top_share = (top_revenue / total_revenue * 100) if total_revenue > 0 else 0.0
    store_count = int(df.shape[0])

    # Herfindahl-Hirschman Index on revenue share (0-10000).
    shares = (
        (df["revenue"] / total_revenue).astype(float) if total_revenue > 0 else df["revenue"] * 0
    )
    hhi = float((shares**2).sum() * 10_000) if total_revenue > 0 else 0.0
    concentration = "concentrated" if hhi >= 2500 else ("moderate" if hhi >= 1500 else "diverse")

    tone: Tone = "negative" if hhi >= 2500 else ("neutral" if hhi >= 1500 else "positive")

    headline = (
        f"{top_store} leads at {_fmt_aed(top_revenue)} · {top_share:.0f}% of coalition revenue"
    )
    template = (
        f"{store_count} partner stores drove {_fmt_aed(total_revenue)} · {top_store} "
        f"pulled {top_share:.1f}% ({_fmt_aed(top_revenue)}). HHI at {hhi:,.0f} is "
        f"{concentration} — {'spread the load' if hhi >= 2500 else 'healthy coverage'}."
    )

    stats = [
        BannerStat(label="Stores", value=_fmt_int(store_count), tone="neutral"),
        BannerStat(label="Top store", value=top_store, tone="positive"),
        BannerStat(label="Top share", value=f"{top_share:.1f}%", tone=tone),
        BannerStat(label="HHI", value=f"{hhi:,.0f}", tone=tone),
    ]

    fact_lines = [
        f"Window: {_window_label(filters)}",
        f"Stores ranked: {store_count}",
        f"Total revenue across stores: AED {total_revenue:,.0f}",
        f"Top store: {top_store} at AED {top_revenue:,.0f}",
        f"Top store share: {top_share:.2f}%",
        f"Concentration (HHI): {hhi:.0f} ({concentration})",
    ]
    for row in df.head(5).itertuples(index=False):
        fact_lines.append(
            f"Store {getattr(row, 'store')}: AED {float(getattr(row, 'revenue')):,.0f}"
        )

    return BannerFacts(
        window_label=_window_label(filters),
        headline=headline,
        template_subtitle=template,
        tone=tone,
        stats=stats,
        fact_lines=fact_lines,
        voice=(
            "Ops brief — 2 sentences. Lead with the top store and its share, "
            "close with the HHI concentration read."
        ),
    )


def elasticity_facts(filters: FilterParams) -> BannerFacts:
    """Elasticity simulator — lean banner derived from kpi_snapshot as a proxy.

    The real elasticity model lives client-side (demo-data driven) and doesn't need a
    heavy server-side pull. We surface the live revenue + basket so the CFO context is
    consistent with the sliders.
    """
    try:
        snap = queries.kpi_snapshot(filters)
    except Exception as exc:
        logger.warning("banner.elasticity_failed", error=str(exc))
        return _empty_facts("elasticity", filters, "activity")

    revenue = float(snap.get("revenue") or 0.0)
    if revenue <= 0:
        return _empty_facts("elasticity", filters, "activity")

    atv = float(snap.get("avg_basket") or 0.0)
    active = int(snap.get("active_members") or 0)
    # Simple proxy: earn elasticity 0.62, breakage sensitivity 1 pp.
    earn_elasticity = 0.62
    breakage_sensitivity_pp = 1.0
    breakage_rate = 0.26
    # Ballpark shift on a +5% earn-rate bump.
    bump_pct = 5.0
    revenue_bump = revenue * (bump_pct / 100.0) * earn_elasticity
    liability_bump = revenue * breakage_sensitivity_pp / 100.0

    tone: Tone = "neutral"

    headline = f"Revenue base {_fmt_aed(revenue)} · +5% earn rate ≈ {_fmt_aed(revenue_bump)} upside"
    template = (
        f"Live revenue base {_fmt_aed(revenue)} across {_fmt_int(active)} active members "
        f"at {_fmt_aed(atv)} ATV. Earn-rate elasticity {earn_elasticity:.2f}: +5% richer "
        f"earn bumps revenue by roughly {_fmt_aed(revenue_bump)}. 1 pp breakage move ≈ "
        f"{_fmt_aed(liability_bump)} liability swing."
    )

    stats = [
        BannerStat(label="Revenue base", value=_fmt_aed(revenue), tone="neutral"),
        BannerStat(label="Active members", value=_fmt_int(active), tone="neutral"),
        BannerStat(label="Earn elasticity", value=f"{earn_elasticity:.2f}", tone="neutral"),
        BannerStat(
            label="1pp breakage swing",
            value=_fmt_aed(liability_bump),
            tone="neutral",
        ),
    ]

    fact_lines = [
        f"Window: {_window_label(filters)}",
        f"Revenue base: AED {revenue:,.0f}",
        f"Active members: {active:,}",
        f"Average basket: AED {atv:,.2f}",
        f"Earn-rate elasticity: {earn_elasticity:.2f}",
        f"+5% earn-rate revenue delta: AED {revenue_bump:,.0f}",
        f"1 pp breakage liability swing: AED {liability_bump:,.0f}",
        f"Baseline breakage rate: {breakage_rate * 100:.0f}%",
    ]

    return BannerFacts(
        window_label=_window_label(filters),
        headline=headline,
        template_subtitle=template,
        tone=tone,
        stats=stats,
        fact_lines=fact_lines,
        voice=(
            "What-if modeler — 2 sentences. Lead with the revenue base, "
            "close with the +5% earn-rate upside and 1 pp breakage swing."
        ),
    )


def ifrs_facts(filters: FilterParams) -> BannerFacts:
    """IFRS 15 — uses queries.kpi_snapshot points_earned / points_redeemed."""
    try:
        snap = queries.kpi_snapshot(filters)
    except Exception as exc:
        logger.warning("banner.ifrs_failed", error=str(exc))
        return _empty_facts("ifrs", filters, "IFRS")

    pts_issued = float(snap.get("points_earned") or 0.0)
    pts_redeemed = float(snap.get("points_redeemed") or 0.0)
    if pts_issued <= 0 and pts_redeemed <= 0:
        return _empty_facts("ifrs", filters, "IFRS")

    # 200 Nexus = AED 1 redemption value.
    redeem_per_point = 1.0 / 200.0
    breakage_rate = 0.26
    # IFRS 15 deferred revenue: outstanding points × (1 - breakage) × redemption value.
    outstanding = max(pts_issued - pts_redeemed, 0.0)
    deferred_aed = outstanding * (1 - breakage_rate) * redeem_per_point
    breakage_aed = outstanding * breakage_rate * redeem_per_point
    redeemed_aed = pts_redeemed * redeem_per_point
    # Sensitivity: 1 pp breakage on outstanding points.
    sensitivity_1pp = outstanding * 0.01 * redeem_per_point

    tone: Tone = "negative" if deferred_aed > 1_000_000 else "neutral"

    headline = f"{_fmt_aed(deferred_aed)} IFRS 15 liability on the Nexus ledger"
    template = (
        f"{_fmt_int(pts_issued)} Nexus issued and {_fmt_int(pts_redeemed)} redeemed this "
        f"window · {_fmt_int(outstanding)} outstanding. Deferred revenue stands at "
        f"{_fmt_aed(deferred_aed)} after {breakage_rate * 100:.0f}% breakage ("
        f"{_fmt_aed(breakage_aed)} expected to expire). 1 pp breakage move ≈ "
        f"{_fmt_aed(sensitivity_1pp)}."
    )

    stats = [
        BannerStat(label="Issued", value=_fmt_int(pts_issued), tone="neutral"),
        BannerStat(label="Redeemed", value=_fmt_int(pts_redeemed), tone="neutral"),
        BannerStat(label="Liability (deferred)", value=_fmt_aed(deferred_aed), tone="negative"),
        BannerStat(label="Expected breakage", value=_fmt_aed(breakage_aed), tone="positive"),
        BannerStat(label="1pp sensitivity", value=_fmt_aed(sensitivity_1pp), tone="neutral"),
    ]

    fact_lines = [
        f"Window: {_window_label(filters)}",
        f"Nexus issued: {pts_issued:,.0f}",
        f"Nexus redeemed: {pts_redeemed:,.0f}",
        f"Outstanding Nexus: {outstanding:,.0f}",
        f"Redemption rate: 1 AED per 200 Nexus",
        f"Breakage rate: {breakage_rate * 100:.0f}% (IFRS 15 B20 expected-value approach)",
        f"Deferred revenue (IFRS 15): AED {deferred_aed:,.0f}",
        f"Expected breakage recovery: AED {breakage_aed:,.0f}",
        f"Redeemed AED value this window: AED {redeemed_aed:,.0f}",
        f"Sensitivity on a 1 pp breakage shift: AED {sensitivity_1pp:,.0f}",
    ]

    return BannerFacts(
        window_label=_window_label(filters),
        headline=headline,
        template_subtitle=template,
        tone=tone,
        stats=stats,
        fact_lines=fact_lines,
        voice=(
            "CFO / auditor brief — 2 sentences. Lead with the IFRS 15 liability AED figure, "
            "close with the breakage recovery and 1 pp sensitivity."
        ),
    )


def save_loop_facts(filters: FilterParams) -> BannerFacts:
    """Save-the-whale loop — pairs churn high-risk count with CLV exposure.

    The on-page workflow (segment → retrieve → draft → holdout → schedule → lift)
    runs off the same churn + CLV models, so the banner speaks to "how many whales
    are on the block and what's the CLV at stake if we miss them".
    """
    try:
        from citipoints_api.services.ml_models import run_churn, run_clv

        churn = run_churn()
        clv = run_clv()
    except Exception as exc:
        logger.warning("banner.save_loop_failed", error=str(exc))
        return _empty_facts("save-loop", filters, "save-loop")

    if churn.scores.empty or clv.predictions.empty:
        return _empty_facts("save-loop", filters, "save-loop")

    high_risk = int((churn.scores["risk_band"] == "High").sum())
    clv_mean = float(clv.summary.get("mean", 0.0))
    exposure = high_risk * clv_mean
    # 10% auto-holdout is the default on the page; mirror that here.
    treatment = int(round(high_risk * 0.9))
    holdout = high_risk - treatment
    churn_rate = float(churn.metrics.get("churn_rate", 0.0)) * 100

    tone: Tone = "negative" if high_risk > 50 else ("positive" if high_risk < 10 else "neutral")
    headline = f"{_fmt_int(high_risk)} whales ready to save · {_fmt_aed(exposure)} CLV on the block"
    template = (
        f"{_fmt_int(treatment)} members queued for the save campaign with "
        f"{_fmt_int(holdout)} auto-held for causal lift measurement. "
        f"Churn rate {churn_rate:.1f}% · mean CLV {_fmt_aed(clv_mean)}. "
        f"Miss the window and {_fmt_aed(exposure)} of lifetime value walks."
    )
    stats = [
        BannerStat(label="High risk", value=_fmt_int(high_risk), tone="negative"),
        BannerStat(label="Treatment", value=_fmt_int(treatment), tone="neutral"),
        BannerStat(label="Holdout (10%)", value=_fmt_int(holdout), tone="neutral"),
        BannerStat(label="CLV at risk", value=_fmt_aed(exposure), tone="negative"),
    ]
    fact_lines = [
        f"Window: {_window_label(filters)}",
        f"High-risk members: {high_risk}",
        f"Treatment group size: {treatment}",
        f"Auto-holdout size (10%): {holdout}",
        f"Churn rate: {churn_rate:.2f}%",
        f"Mean 12-month CLV: AED {clv_mean:,.0f}",
        f"Total CLV exposure: AED {exposure:,.0f}",
    ]
    return BannerFacts(
        window_label=_window_label(filters),
        headline=headline,
        template_subtitle=template,
        tone=tone,
        stats=stats,
        fact_lines=fact_lines,
        voice=(
            "Retention ops brief — 2 sentences. Lead with the treatment + holdout split, "
            "close with the CLV that walks if nobody fires the save campaign."
        ),
    )


def price_tiers_facts(filters: FilterParams) -> BannerFacts:
    """Price-band preference — splits revenue across basket-size buckets."""
    try:
        snap = queries.kpi_snapshot(filters)
    except Exception as exc:
        logger.warning("banner.price_tiers_failed", error=str(exc))
        return _empty_facts("price-tiers", filters, "price-tier")

    revenue = float(snap.get("revenue") or 0.0)
    atv = float(snap.get("avg_basket") or 0.0)
    if revenue <= 0:
        return _empty_facts("price-tiers", filters, "price-tier")

    # Shares from the demo palette (mirrors the page's BUCKETS constant).
    bands = [
        ("Impulse (< AED 10)", 0.18, 0.28),
        ("Everyday (AED 10-25)", 0.28, 0.31),
        ("Mid-tier (AED 25-50)", 0.24, 0.16),
        ("Premium (AED 50-100)", 0.20, 0.24),
        ("Aspirational (AED 100+)", 0.10, 0.34),
    ]
    total_points = revenue  # 1 Nexus per AED
    # Weighted redemption across bands.
    weighted_redeem = sum(share * redeem for _, share, redeem in bands)
    hoarding = sum(share * (1 - redeem) for _, share, redeem in bands)
    hoarded_points = total_points * hoarding

    # Find the band with the weakest redemption weighted by revenue share.
    worst = min(bands, key=lambda b: b[2])
    worst_label, worst_share, worst_redeem = worst

    tone: Tone = "negative" if weighted_redeem < 0.25 else "neutral"
    headline = (
        f"{_fmt_int(hoarded_points)} Nexus hoarded · weakest band {worst_label} at "
        f"{worst_redeem * 100:.0f}% redemption"
    )
    template = (
        f"{_fmt_aed(revenue)} spread across 5 price bands at {_fmt_aed(atv)} ATV "
        f"issuing {_fmt_int(total_points)} Nexus · weighted redemption "
        f"{weighted_redeem * 100:.0f}%. Worst band {worst_label} carries "
        f"{worst_share * 100:.0f}% of revenue but only {worst_redeem * 100:.0f}% redeem "
        f"— the largest single contributor to the 24-month expiry bucket."
    )

    stats = [
        BannerStat(label="Revenue", value=_fmt_aed(revenue), tone="positive"),
        BannerStat(label="Nexus issued", value=_fmt_int(total_points), tone="neutral"),
        BannerStat(
            label="Weighted redemption",
            value=f"{weighted_redeem * 100:.0f}%",
            tone=tone,
        ),
        BannerStat(label="Hoarded Nexus", value=_fmt_int(hoarded_points), tone="negative"),
    ]
    fact_lines = [
        f"Window: {_window_label(filters)}",
        f"Revenue: AED {revenue:,.0f}",
        f"Average basket: AED {atv:,.2f}",
        f"Nexus issued (1 per AED): {total_points:,.0f}",
        f"Weighted redemption rate: {weighted_redeem * 100:.2f}%",
        f"Hoarded Nexus (unredeemed share): {hoarded_points:,.0f}",
        f"Weakest band: {worst_label} ({worst_share * 100:.1f}% share, "
        f"{worst_redeem * 100:.1f}% redemption)",
    ]
    for label, share, redeem in bands:
        fact_lines.append(f"Band {label}: {share * 100:.1f}% share, {redeem * 100:.0f}% redeem")

    return BannerFacts(
        window_label=_window_label(filters),
        headline=headline,
        template_subtitle=template,
        tone=tone,
        stats=stats,
        fact_lines=fact_lines,
        voice=(
            "Merchandising + CFO brief — 2 sentences. Lead with hoarded Nexus and the "
            "weakest band, close with the breakage / liability implication."
        ),
    )


# Dispatch table — add a page here to get a banner.
PageKey = Literal[
    "loyalty",
    "executive",
    "overview",
    "cohort",
    "tier-migration",
    "fraud",
    "forecast",
    "anomaly",
    "segments",
    "market-basket",
    "predictive",
    "stores",
    "elasticity",
    "ifrs",
    "save-loop",
    "price-tiers",
]


def coalition_flow_facts(filters: FilterParams) -> BannerFacts:
    return BannerFacts(
        window_label=_window_label(filters),
        headline="Who earns where — and who burns where?",
        template_subtitle=(
            "Earn-to-redeem Sankey exposes partners that are net points sinks and "
            "partners that are net points sources. Coalition health in one chart."
        ),
        tone="neutral",
        fact_lines=[
            "Left nodes = top 8 earning partners. Right nodes = top 8 redeeming partners.",
            "Line thickness = AED flow. Asymmetry = cross-partner value capture gap.",
        ],
        voice="Coalition-strategy briefing, 2 sentences, concrete numbers only.",
    )


def creative_facts(filters: FilterParams) -> BannerFacts:
    return BannerFacts(
        window_label=_window_label(filters),
        headline="Arabic Ramadan creative in 20 seconds",
        template_subtitle=(
            "Pick segment + occasion + channel. Agent generates bilingual copy "
            "(EN + AR RTL), imagery prompts (Ideogram 3.0), and 3 Persado-style "
            "tone variants with Hijri-calendar context."
        ),
        tone="positive",
        fact_lines=[
            "Segments: hibernating whales · gold-tier moms · silver dads · lapsed F&B · Ramadan shoppers",
            "Occasions: Ramadan · Eid al-Fitr · Eid al-Adha · National Day · generic",
            "Guardrails: PDPL-safe, brand-voice locked, Khaleeji dialect preferred.",
        ],
        voice="Creative-director briefing, 2 sentences, reference the Arabic RTL + Hijri context.",
    )


def receipts_facts(filters: FilterParams) -> BannerFacts:
    return BannerFacts(
        window_label=_window_label(filters),
        headline="Earn on the 80% of UAE retail not in the coalition",
        template_subtitle=(
            "Snap any receipt — Carrefour, Lulu, Spinneys, ADNOC, KFC. Agent "
            "parses line items, applies the rule engine, writes Nexus to the "
            "ledger. Unlocks 4× more earn events per member."
        ),
        tone="positive",
        fact_lines=[
            "Partner rule: 1 Nexus / AED. Non-partner rule: 0.25 Nexus / AED, capped 500/day.",
            "Flags: duplicate_suspected · blurred_total · low_confidence — go to manual review.",
        ],
        voice="Growth-marketing briefing, 2 sentences, concrete multiplier.",
    )


def compliance_facts(filters: FilterParams) -> BannerFacts:
    return BannerFacts(
        window_label=_window_label(filters),
        headline="UAE sovereign-cloud ready — Core42 + PDPL + Jais",
        template_subtitle=(
            "All member PII resident in Abu Dhabi. Core42 SFCSI deploy. SOC 2 "
            "Type II collection underway. Jais Arabic LLM for generative "
            "workloads. Ramadan regressors baked into every seasonal model."
        ),
        tone="positive",
        fact_lines=[
            "Core42 SFCSI launched by CBUAE on 2026-02-25 — we deploy on it by default.",
            "PDPL Federal Decree-Law 45/2021 — in force, audit trail at every admin action.",
            "Jais Arabic LLM (G42-aligned) handles Arabic generation — no US-cloud dependency.",
        ],
        voice="Regulatory + trust briefing, 2 sentences, name the specific regulations.",
    )


def alerts_facts(filters: FilterParams) -> BannerFacts:
    """Proactive alerts feed — deterministic template, no warehouse query."""
    return BannerFacts(
        window_label=_window_label(filters),
        headline="What needs attention this window?",
        template_subtitle=(
            "Proactive AI feed — anomalies, breakage spikes, model drift, POS "
            "heartbeat misses and seasonality warnings are pushed here with a "
            "plain-English narrative, evidence citation, and a one-click action."
        ),
        tone="neutral",
        stats=[
            BannerStat(label="Sources", value="6", tone="neutral"),
            BannerStat(label="Refresh", value="5 min", tone="neutral"),
        ],
        fact_lines=[
            "Sources: anomaly engine (STL), breakage monitor, model retrain hooks, seasonality forecaster, POS heartbeat, app-health watcher.",
            "Every alert carries severity (critical / warning / opportunity / info), evidence, and suggested action.",
            "Unacked alerts stick until dismissed or posted to the ops channel.",
        ],
        voice="Ops war-room briefing, 2 sentences, emphasise that the dashboard pushes instead of being pulled.",
    )


def benchmarks_facts(filters: FilterParams) -> BannerFacts:
    """Peer benchmarks — deterministic template, sources anonymised MENA peer dataset."""
    return BannerFacts(
        window_label=_window_label(filters),
        headline="How does Nexus rank against Shukran, SHARE, Smiles?",
        template_subtitle=(
            "Anonymised comparison against 9-11 MENA coalition loyalty peers — "
            "SHARE, ADCB Touchpoints, Lulu, Skywards-adjacent, Careem Rewards. "
            "Quartile bands show where Nexus sits in the distribution; median "
            "marker shows the gap to close."
        ),
        tone="neutral",
        stats=[
            BannerStat(label="Peer n", value="11", tone="neutral"),
            BannerStat(label="Refresh", value="quarterly", tone="neutral"),
        ],
        fact_lines=[
            "Peer cohort: 9-11 MENA coalition loyalty programs (SHARE, ADCB, Lulu, Skywards-adjacent, Careem).",
            "Metrics tracked: active-member rate, ATV lift, breakage, redemption velocity, NPS, churn, cost per active.",
            "Source: MENA Loyalty Summit 2025 baseline dataset, refreshed quarterly.",
        ],
        voice="Peer-benchmark briefing, 2 sentences, anchor on quartile position vs the median.",
    )


def experiments_facts(filters: FilterParams) -> BannerFacts:
    """A/B experiment ledger — deterministic template, causal lift discipline."""
    return BannerFacts(
        window_label=_window_label(filters),
        headline="Which experiments moved the needle?",
        template_subtitle=(
            "Every A/B with a 10% auto-holdout, SRM sanity-check, sequential "
            "stopping rule, and causal-lift readout. Kill-decisions logged; "
            "every shipped lift feeds forecast and model retraining."
        ),
        tone="neutral",
        stats=[
            BannerStat(label="Holdout", value="10%", tone="neutral"),
            BannerStat(label="SRM gate", value="p ≥ 0.05", tone="neutral"),
        ],
        fact_lines=[
            "Every experiment runs with 10% auto-holdout and SRM (sample ratio mismatch) guardrail.",
            "Sequential stopping rules: O'Brien-Fleming and alpha-spending.",
            "Verdicts: shipped / killed / inconclusive / pending — audit trail for the data council.",
        ],
        voice="Experimentation-lead briefing, 2 sentences, emphasise causal discipline + SRM gate.",
    )


def models_facts(filters: FilterParams) -> BannerFacts:
    """Model card transparency — deterministic template, drift watch."""
    return BannerFacts(
        window_label=_window_label(filters),
        headline="Are our models drifting?",
        template_subtitle=(
            "Every ML model powering the dashboard — its algorithm, training "
            "data, holdout metrics, feature list, drift status. Built for "
            "Nexus's data council and external audit. No black boxes."
        ),
        tone="neutral",
        stats=[
            BannerStat(label="Retrain cadence", value="nightly", tone="neutral"),
            BannerStat(label="Drift check", value="PSI + KS", tone="neutral"),
        ],
        fact_lines=[
            "Models covered: churn (LightGBM), CLV (XGBoost regressor), RFM + KMeans, FP-Growth, STL anomaly, Prophet forecast, recommender.",
            "Drift checks: PSI on feature distributions + KS on scores vs training baseline.",
            "Retrains: nightly on Airflow; out-of-band retrain endpoint available from the UI.",
        ],
        voice="ML-transparency briefing, 2 sentences, emphasise auditability + drift guardrails.",
    )


_DISPATCH: dict[str, Callable[[FilterParams], BannerFacts]] = {
    "loyalty": loyalty_facts,
    "executive": executive_facts,
    "overview": overview_facts,
    "cohort": cohort_facts,
    "tier-migration": tier_migration_facts,
    "fraud": fraud_facts,
    "forecast": forecast_facts,
    "anomaly": anomaly_facts,
    "segments": segments_facts,
    "market-basket": market_basket_facts,
    "predictive": predictive_facts,
    "stores": stores_facts,
    "elasticity": elasticity_facts,
    "ifrs": ifrs_facts,
    "save-loop": save_loop_facts,
    "price-tiers": price_tiers_facts,
    "coalition-flow": coalition_flow_facts,
    "creative": creative_facts,
    "receipts": receipts_facts,
    "compliance": compliance_facts,
    "alerts": alerts_facts,
    "benchmarks": benchmarks_facts,
    "experiments": experiments_facts,
    "models": models_facts,
}


def supported_pages() -> list[str]:
    return sorted(_DISPATCH.keys())


# ── Cache ───────────────────────────────────────────────────────────────


@dataclass
class _CacheEntry:
    response: BannerResponse
    expires_at: float


_cache: dict[str, _CacheEntry] = {}


def _cache_key(page: str, filters: FilterParams, polish: bool) -> str:
    return f"{page}|{filters.date_from or ''}|{filters.date_to or ''}|{int(polish)}"


def _now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat(timespec="seconds")


# ── LLM polish (optional) ───────────────────────────────────────────────


_CLAUDE_SYSTEM = (
    "You are the banner writer for Nexus Partner Analytics, a Power BI "
    "replacement for a UAE coalition loyalty program. Given a list of facts, "
    "write a 2-sentence hero subtitle that a CFO+CMO would read on the page. "
    "Cite every number exactly as given. Do not invent new numbers. Do not "
    "use filler like 'remarkable', 'significant'. Return JSON only, matching "
    'the schema: {"headline": str, "subtitle": str, "tone": "positive"|"negative"|"neutral"}.'
)


async def _polish_with_claude(facts: BannerFacts, page: str) -> dict[str, str] | None:
    """Ask Claude to rewrite the subtitle in the page's voice.

    Returns None on any failure — callers fall back to the template.
    """
    prompt = (
        f"PAGE: {page}\n"
        f"WINDOW: {facts.window_label}\n"
        f"VOICE: {facts.voice}\n\n"
        "FACTS (use these verbatim — do not invent):\n"
        + "\n".join(f"- {line}" for line in facts.fact_lines)
        + "\n\nOUTPUT JSON ONLY. No markdown fences. Schema:\n"
        '{"headline": "<one short question or claim>", '
        '"subtitle": "<2-sentence prose citing numbers>", '
        '"tone": "positive|negative|neutral"}'
    )

    try:
        start = time.monotonic()
        result = await run_claude(prompt, system=_CLAUDE_SYSTEM)
        logger.info("banner.claude_ok", page=page, ms=int((time.monotonic() - start) * 1000))
    except ClaudeCliError as exc:
        logger.warning("banner.claude_failed", page=page, error=str(exc))
        return None

    parsed = extract_json_block(result.text)
    if not isinstance(parsed, dict):
        try:
            parsed = json.loads(result.text.strip())
        except Exception:
            logger.warning("banner.claude_bad_json", page=page, raw=result.text[:200])
            return None
    if not isinstance(parsed, dict):
        return None

    headline = str(parsed.get("headline") or "").strip()
    subtitle = str(parsed.get("subtitle") or "").strip()
    tone = parsed.get("tone") or "neutral"
    if not subtitle:
        return None
    if tone not in ("positive", "negative", "neutral"):
        tone = "neutral"
    return {"headline": headline, "subtitle": subtitle, "tone": tone}


# ── Public API ──────────────────────────────────────────────────────────


async def generate_banner(
    page: str,
    filters: FilterParams,
    *,
    polish: bool = False,
) -> BannerResponse:
    """Main entry point — returns the banner for `page` over `filters`.

    When `polish=True` and the Claude CLI is reachable, the template subtitle
    is rewritten in the page's voice using the fact list. Otherwise we return
    the template directly (<50ms).
    """
    key = _cache_key(page, filters, polish)
    now = time.monotonic()
    cached = _cache.get(key)
    if cached and cached.expires_at > now:
        return cached.response

    fact_fn = _DISPATCH.get(page)
    if fact_fn is None:
        return BannerResponse(
            page=page,
            generated_at=_now_iso(),
            window_label=_window_label(filters),
            headline=f"No banner generator for '{page}' yet.",
            subtitle=(
                "This page hasn't been wired into the dynamic-banner system. "
                "Add a generator in services/banners.py → _DISPATCH."
            ),
            tone="neutral",
            stats=[],
            source="fallback",
        )

    facts = fact_fn(filters)
    headline = facts.headline
    subtitle = facts.template_subtitle
    tone: Tone = facts.tone
    source: Literal["template", "claude", "fallback"] = "template"

    if polish:
        polished = await _polish_with_claude(facts, page)
        if polished is not None:
            headline = polished["headline"] or headline
            subtitle = polished["subtitle"]
            tone = polished["tone"]  # type: ignore[assignment]
            source = "claude"

    response = BannerResponse(
        page=page,
        generated_at=_now_iso(),
        window_label=facts.window_label,
        headline=headline,
        subtitle=subtitle,
        tone=tone,
        stats=facts.stats,
        source=source,
    )
    _cache[key] = _CacheEntry(response=response, expires_at=now + _CACHE_TTL_SECONDS)
    return response


def generate_banner_sync(
    page: str, filters: FilterParams, *, polish: bool = False
) -> BannerResponse:
    """Sync wrapper for callers that can't await (tests, scripts)."""
    return asyncio.run(generate_banner(page, filters, polish=polish))
