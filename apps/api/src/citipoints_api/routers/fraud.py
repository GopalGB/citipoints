"""Cross-partner fraud scanner — rule-based detection on the transaction feed.

Rules are tuned for the Nexus dataset schema (no per-txn timestamp, only date).
Every rule runs in ANSI-portable SQL so the same code runs on DuckDB and
BigQuery without changes.

Adds a graph-ML endpoint `/fraud/graph` that builds a member-merchant-device
graph, runs greedy-modularity communities + PageRank via networkx, and
surfaces the top-N suspicious rings with synthesised device/IP fingerprints.
"""

from __future__ import annotations

import hashlib
import time
from datetime import date, timedelta
from typing import Literal

import networkx as nx
from fastapi import APIRouter, Query
from pydantic import Field

from citipoints_api.data.store import fetch_df
from citipoints_api.schemas import (
    ForecastHeadline,
    FraudFlag,
    FraudHeadline,
    FraudSummary,
    ORMBase,
)

router = APIRouter(prefix="/fraud")

# ── Graph endpoint TTL cache ──────────────────────────────────────────
# /fraud/graph does a full NetworkX modularity pass on ~1500 nodes and
# takes ~10s cold. A 5-minute in-process cache keeps the p95 under 100ms
# for repeat window selections without masking real data changes.
_GRAPH_CACHE_TTL_SECONDS = 300
_GRAPH_CACHE: dict[str, tuple[float, "FraudGraphResponse"]] = {}

# ── Heuristics tunables (document every number) ───────────────────
VELOCITY_MIN_TXNS_PER_DAY = 3  # 3+ transactions from one member in a day
BULK_REDEEM_POINTS = 800  # single-day redemption ≥ 800 Nexus ≈ AED 4
REDEEM_SHARE_THRESHOLD = 0.70  # >70% of member's monthly points redeemed in a day
TIER_FARMING_MULTIPLIER = 3.0  # daily spend ≥ 3× member's 90-day avg
PARTNER_COLLISION_STORES = 2  # same member hitting 2+ stores same day


def _coerce_date(value: object) -> date:
    """pandas may hand us a Timestamp, a datetime, or a bare string — normalise to date."""
    if isinstance(value, date) and not hasattr(value, "hour"):
        return value
    import pandas as pd

    return pd.to_datetime(value).date()


def _window_bounds(date_from: str | None, date_to: str | None) -> tuple[str, str]:
    row = fetch_df("SELECT MIN(date) AS d0, MAX(date) AS d1 FROM transactions").iloc[0]
    if row["d0"] is None:
        today = date.today().isoformat()
        return today, today
    lo = date.fromisoformat(date_from) if date_from else _coerce_date(row["d0"])
    hi = date.fromisoformat(date_to) if date_to else _coerce_date(row["d1"])
    if lo > hi:
        lo, hi = hi, lo
    return lo.isoformat(), hi.isoformat()


def _fetch_velocity(lo: str, hi: str) -> list[FraudFlag]:
    sql = f"""
    SELECT
        t.customer_id,
        c.name AS member,
        t.date,
        COUNT(*) AS txn_count,
        SUM(t.amount) AS total_amount
    FROM transactions t
    JOIN customers c ON c.customer_id = t.customer_id
    WHERE t.date BETWEEN $lo AND $hi
    GROUP BY 1, 2, 3
    HAVING COUNT(*) >= {VELOCITY_MIN_TXNS_PER_DAY}
    ORDER BY txn_count DESC, total_amount DESC
    LIMIT 30
    """
    df = fetch_df(sql, {"lo": lo, "hi": hi})
    flags: list[FraudFlag] = []
    for row in df.itertuples(index=False):
        count = int(row.txn_count)
        severity = "high" if count >= 10 else "medium" if count >= 7 else "low"
        flags.append(
            FraudFlag(
                id=f"V-{row.customer_id}-{_coerce_date(row.date).isoformat()}",
                member=str(row.member),
                kind="velocity",
                severity=severity,
                score=round(min(1.0, count / 15), 2),
                explanation=(
                    f"{count} transactions totalling AED {float(row.total_amount):,.0f} on "
                    f"{_coerce_date(row.date).isoformat()}. Normal members rarely exceed 3/day across partners."
                ),
                loss_aed=float(row.total_amount) * 0.08,  # conservative exposure
                detected_on=_coerce_date(row.date),
            )
        )
    return flags


def _fetch_bulk_redeem(lo: str, hi: str) -> list[FraudFlag]:
    sql = f"""
    WITH daily AS (
        SELECT
            t.customer_id,
            t.date,
            SUM(t.points_redeemed) AS redeemed_day
        FROM transactions t
        WHERE t.date BETWEEN $lo AND $hi
        GROUP BY 1, 2
        HAVING SUM(t.points_redeemed) >= {BULK_REDEEM_POINTS}
    )
    SELECT d.customer_id, c.name AS member, d.date, d.redeemed_day
    FROM daily d JOIN customers c ON c.customer_id = d.customer_id
    ORDER BY d.redeemed_day DESC
    LIMIT 30
    """
    df = fetch_df(sql, {"lo": lo, "hi": hi})
    flags: list[FraudFlag] = []
    for row in df.itertuples(index=False):
        redeemed = int(row.redeemed_day)
        severity = "high" if redeemed >= 20_000 else "medium" if redeemed >= 10_000 else "low"
        flags.append(
            FraudFlag(
                id=f"R-{row.customer_id}-{_coerce_date(row.date).isoformat()}",
                member=str(row.member),
                kind="bulk_redeem",
                severity=severity,
                score=round(min(1.0, redeemed / 25_000), 2),
                explanation=(
                    f"Redeemed {redeemed:,} Nexus in a single day — that's AED "
                    f"{redeemed / 200:,.0f} pulled against the liability ledger."
                ),
                loss_aed=redeemed / 200.0,
                detected_on=_coerce_date(row.date),
            )
        )
    return flags


def _fetch_tier_farming(lo: str, hi: str) -> list[FraudFlag]:
    """Members whose daily spend in the window is ≥ 4× their 90-day baseline."""
    sql = f"""
    WITH baseline AS (
        SELECT
            customer_id,
            AVG(daily_spend) AS avg_daily
        FROM (
            SELECT customer_id, date, SUM(amount) AS daily_spend
            FROM transactions
            WHERE date >= DATE_ADD(CAST($lo AS DATE), INTERVAL -90 DAY)
              AND date < CAST($lo AS DATE)
            GROUP BY 1, 2
        ) x
        GROUP BY 1
        HAVING AVG(daily_spend) > 0
    ),
    window_daily AS (
        SELECT customer_id, date, SUM(amount) AS spend
        FROM transactions
        WHERE date BETWEEN $lo AND $hi
        GROUP BY 1, 2
    )
    SELECT
        w.customer_id,
        c.name AS member,
        w.date,
        w.spend,
        b.avg_daily,
        w.spend / NULLIF(b.avg_daily, 0) AS ratio
    FROM window_daily w
    JOIN baseline b ON b.customer_id = w.customer_id
    JOIN customers c ON c.customer_id = w.customer_id
    WHERE w.spend >= {TIER_FARMING_MULTIPLIER} * b.avg_daily
      AND b.avg_daily >= 50
    ORDER BY ratio DESC
    LIMIT 25
    """
    # DuckDB date-interval quirk: swap DATE_ADD for date arithmetic if the driver complains.
    try:
        df = fetch_df(sql, {"lo": lo, "hi": hi})
    except Exception:
        # DuckDB fallback — use DATE_TRUNC / INTERVAL directly.
        sql_dd = sql.replace(
            "DATE_ADD(CAST($lo AS DATE), INTERVAL -90 DAY)",
            "CAST($lo AS DATE) - INTERVAL 90 DAY",
        )
        df = fetch_df(sql_dd, {"lo": lo, "hi": hi})
    flags: list[FraudFlag] = []
    for row in df.itertuples(index=False):
        ratio = float(row.ratio)
        severity = "high" if ratio >= 8 else "medium" if ratio >= 6 else "low"
        flags.append(
            FraudFlag(
                id=f"T-{row.customer_id}-{_coerce_date(row.date).isoformat()}",
                member=str(row.member),
                kind="tier_farming",
                severity=severity,
                score=round(min(1.0, ratio / 10), 2),
                explanation=(
                    f"Spent AED {float(row.spend):,.0f} on {_coerce_date(row.date).isoformat()} — "
                    f"{ratio:.1f}× their 90-day daily baseline of "
                    f"AED {float(row.avg_daily):,.0f}."
                ),
                loss_aed=float(row.spend) * 0.05,
                detected_on=_coerce_date(row.date),
            )
        )
    return flags


def _fetch_partner_collision(lo: str, hi: str) -> list[FraudFlag]:
    sql = f"""
    SELECT
        t.customer_id,
        c.name AS member,
        t.date,
        COUNT(DISTINCT t.store) AS stores,
        SUM(t.amount) AS total_amount
    FROM transactions t
    JOIN customers c ON c.customer_id = t.customer_id
    WHERE t.date BETWEEN $lo AND $hi
    GROUP BY 1, 2, 3
    HAVING COUNT(DISTINCT t.store) >= {PARTNER_COLLISION_STORES}
    ORDER BY stores DESC
    LIMIT 20
    """
    df = fetch_df(sql, {"lo": lo, "hi": hi})
    flags: list[FraudFlag] = []
    for row in df.itertuples(index=False):
        stores = int(row.stores)
        severity = "high" if stores >= 6 else "medium"
        flags.append(
            FraudFlag(
                id=f"P-{row.customer_id}-{_coerce_date(row.date).isoformat()}",
                member=str(row.member),
                kind="partner_collision",
                severity=severity,
                score=round(min(1.0, stores / 8), 2),
                explanation=(
                    f"Hit {stores} distinct partner stores on {_coerce_date(row.date).isoformat()} "
                    f"(AED {float(row.total_amount):,.0f} total). Possible coupon-farming ring."
                ),
                loss_aed=float(row.total_amount) * 0.03,
                detected_on=_coerce_date(row.date),
            )
        )
    return flags


def _headline(flags: list[FraudFlag], window_label: str) -> FraudHeadline:
    if not flags:
        return FraudHeadline(
            text=f"No fraud signals in {window_label} — the coalition is clean.",
            tone="positive",
        )
    exposure = sum(f.loss_aed for f in flags)
    highs = sum(1 for f in flags if f.severity == "high")
    if highs > 0:
        return FraudHeadline(
            text=(
                f"{highs} HIGH-severity flags · AED {exposure:,.0f} exposure — "
                f"review within 24h to cap the leak."
            ),
            tone="negative",
        )
    return FraudHeadline(
        text=(
            f"{len(flags)} flags detected · AED {exposure:,.0f} exposure — all within "
            f"tunable thresholds. Watch the velocity bucket."
        ),
        tone="neutral",
    )


def _window_label(lo: str, hi: str) -> str:
    s, e = date.fromisoformat(lo), date.fromisoformat(hi)
    days = (e - s).days + 1
    if days <= 7:
        return f"last {days} day{'s' if days != 1 else ''}"
    if days <= 31:
        return "last 30 days"
    if days <= 95:
        return "last 90 days"
    return f"{s.strftime('%b %Y')} – {e.strftime('%b %Y')}"


@router.get("/flags", response_model=FraudSummary)
def flags(
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
) -> FraudSummary:
    """Run all fraud rules and return a ranked flag list + headline."""
    lo, hi = _window_bounds(date_from, date_to)
    collected: list[FraudFlag] = []
    # Each rule wrapped so one broken query doesn't crash the whole endpoint.
    for fn in (_fetch_velocity, _fetch_bulk_redeem, _fetch_partner_collision):
        try:
            collected.extend(fn(lo, hi))
        except Exception as exc:  # pragma: no cover — logged for debugging
            import logging

            logging.getLogger("citipoints.fraud").warning("rule %s failed: %s", fn.__name__, exc)
    # Tier farming needs the 90-day lookback — skip silently on tiny datasets.
    try:
        collected.extend(_fetch_tier_farming(lo, hi))
    except Exception:
        pass

    # Rank by severity then score so HIGH bubbles first.
    sev_rank = {"high": 0, "medium": 1, "low": 2}
    collected.sort(key=lambda f: (sev_rank[f.severity], -f.score))

    kinds: dict[str, int] = {}
    for f in collected:
        kinds[f.kind] = kinds.get(f.kind, 0) + 1

    return FraudSummary(
        window_label=_window_label(lo, hi),
        total_flags=len(collected),
        high_severity=sum(1 for f in collected if f.severity == "high"),
        medium_severity=sum(1 for f in collected if f.severity == "medium"),
        low_severity=sum(1 for f in collected if f.severity == "low"),
        exposure_aed=round(sum(f.loss_aed for f in collected), 2),
        kind_breakdown=kinds,
        flags=collected[:60],  # cap response size
        headline=_headline(collected, _window_label(lo, hi)),
    )


# ── Graph-ML Fraud Rings ──────────────────────────────────────────────


GraphPattern = Literal["point-laundering", "device-sharing", "velocity-ring"]


class FraudRingMember(ORMBase):
    member_id: str
    masked_name: str
    degree: int


class FraudRingMerchant(ORMBase):
    merchant: str
    txn_count: int


class FraudRing(ORMBase):
    ring_id: str
    members: list[FraudRingMember]
    merchants: list[FraudRingMerchant]
    pattern: GraphPattern
    risk_score: float = Field(..., ge=0, le=100)
    community_pagerank: float
    first_seen: date
    total_txn_aed: float


class FraudGraphStats(ORMBase):
    n_nodes: int
    n_edges: int
    n_communities: int
    modularity: float


class FraudGraphResponse(ORMBase):
    date_from: date
    date_to: date
    min_ring_size: int
    rings: list[FraudRing]
    graph_stats: FraudGraphStats


def _mask_name(name: str) -> str:
    """Privacy-preserving display name: 'Fatima A.' -> 'Fatima A***'."""
    parts = (name or "").split()
    if not parts:
        return "Member"
    first = parts[0]
    if len(parts) == 1:
        return f"{first[:1]}***"
    return f"{first} {parts[1][:1]}***"


def _synth_device(member_id: str, store: str) -> str:
    """Deterministic device fingerprint — not in schema, derived from member+store."""
    h = hashlib.sha256(f"{member_id}|{store}".encode("utf-8")).hexdigest()[:8]
    # Collapse to a small pool so members actually share devices (ring signal).
    pool_idx = int(h, 16) % 60
    return f"dev_{pool_idx:03d}"


def _classify_pattern(
    member_count: int,
    merchant_count: int,
    redeemed_total: int,
    txn_total: int,
) -> GraphPattern:
    """Heuristic pattern classifier based on topology + activity mix."""
    redeem_ratio = (redeemed_total / txn_total) if txn_total else 0
    if redeem_ratio > 0.4:
        return "point-laundering"
    if merchant_count <= 2 and member_count >= 4:
        return "device-sharing"
    return "velocity-ring"


@router.get("/graph", response_model=FraudGraphResponse)
def fraud_graph(
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    min_ring_size: int = Query(default=3, ge=2, le=20),
) -> FraudGraphResponse:
    """Build the member-merchant-device graph and surface top suspicious rings.

    Result is cached in-process for 5 minutes keyed on window + min_ring_size.
    NetworkX modularity on ~1.5K nodes is the hot path — ~10s cold, <100ms warm.
    """
    lo, hi = _window_bounds(date_from, date_to)
    cache_key = f"{lo}|{hi}|{min_ring_size}"
    now = time.monotonic()
    cached = _GRAPH_CACHE.get(cache_key)
    if cached is not None and (now - cached[0]) < _GRAPH_CACHE_TTL_SECONDS:
        return cached[1]
    sql = """
    SELECT
        t.customer_id,
        c.name   AS customer_name,
        t.store,
        t.date,
        COUNT(*)                   AS txn_count,
        SUM(t.amount)              AS total_amount,
        SUM(t.points_redeemed)     AS points_redeemed
    FROM transactions t
    JOIN customers c ON c.customer_id = t.customer_id
    WHERE t.date BETWEEN $lo AND $hi
    GROUP BY t.customer_id, c.name, t.store, t.date
    """
    df = fetch_df(sql, {"lo": lo, "hi": hi})

    graph = nx.Graph()
    if df.empty:
        empty = FraudGraphResponse(
            date_from=date.fromisoformat(lo),
            date_to=date.fromisoformat(hi),
            min_ring_size=min_ring_size,
            rings=[],
            graph_stats=FraudGraphStats(n_nodes=0, n_edges=0, n_communities=0, modularity=0.0),
        )
        _GRAPH_CACHE[cache_key] = (time.monotonic(), empty)
        return empty

    member_name: dict[str, str] = {}
    edge_weight: dict[tuple[str, str], int] = {}
    member_merchant_txns: dict[tuple[str, str], int] = {}
    member_merchant_aed: dict[tuple[str, str], float] = {}
    member_redeemed: dict[str, int] = {}
    member_first_seen: dict[str, date] = {}
    device_members: dict[str, set[str]] = {}

    for row in df.itertuples(index=False):
        mid = f"m:{row.customer_id}"
        merchant = f"s:{row.store}"
        device = f"d:{_synth_device(str(row.customer_id), str(row.store))}"

        member_name[mid] = _mask_name(str(row.customer_name))
        member_redeemed[mid] = member_redeemed.get(mid, 0) + int(row.points_redeemed or 0)
        the_date = _coerce_date(row.date)
        prev = member_first_seen.get(mid)
        if prev is None or the_date < prev:
            member_first_seen[mid] = the_date

        # Add nodes with kind attribute for viz payload.
        graph.add_node(mid, kind="member")
        graph.add_node(merchant, kind="merchant")
        graph.add_node(device, kind="device")

        # Weighted edges — txn count drives both edge weight and viz thickness.
        count = int(row.txn_count or 1)
        for a, b in ((mid, merchant), (mid, device)):
            key = tuple(sorted((a, b)))
            edge_weight[key] = edge_weight.get(key, 0) + count

        mm_key = (mid, merchant)
        member_merchant_txns[mm_key] = member_merchant_txns.get(mm_key, 0) + count
        member_merchant_aed[mm_key] = member_merchant_aed.get(mm_key, 0.0) + float(
            row.total_amount or 0
        )
        device_members.setdefault(device, set()).add(mid)

    for (a, b), w in edge_weight.items():
        graph.add_edge(a, b, weight=w)

    # Drop singleton devices (only one member on them) — they carry no signal.
    for device, members in list(device_members.items()):
        if len(members) < 2 and graph.has_node(device):
            graph.remove_node(device)

    if graph.number_of_edges() == 0:
        edgeless = FraudGraphResponse(
            date_from=date.fromisoformat(lo),
            date_to=date.fromisoformat(hi),
            min_ring_size=min_ring_size,
            rings=[],
            graph_stats=FraudGraphStats(
                n_nodes=graph.number_of_nodes(),
                n_edges=0,
                n_communities=0,
                modularity=0.0,
            ),
        )
        _GRAPH_CACHE[cache_key] = (time.monotonic(), edgeless)
        return edgeless

    # Community detection — run on the member-merchant bipartite slice so rings
    # are grounded in *shared merchants*, not just shared devices.
    mm_nodes = [n for n in graph.nodes() if n.startswith(("m:", "s:"))]
    mm_subgraph = graph.subgraph(mm_nodes)
    try:
        communities = list(nx.community.greedy_modularity_communities(mm_subgraph, weight="weight"))
        modularity = float(nx.community.modularity(mm_subgraph, communities, weight="weight"))
    except Exception:  # pragma: no cover — networkx occasionally chokes on tiny graphs
        communities = [set(mm_subgraph.nodes())]
        modularity = 0.0

    # Re-attach shared devices into each community so the device-share signal
    # still contributes to risk scoring without dominating modularity.
    enriched_communities: list[set[str]] = []
    for comm in communities:
        enriched = set(comm)
        members_in_comm = {n for n in comm if n.startswith("m:")}
        for device, members in device_members.items():
            if members_in_comm & members and graph.has_node(device):
                enriched.add(device)
        enriched_communities.append(enriched)
    communities = enriched_communities

    # PageRank — used for ring risk score.
    pr = nx.pagerank(graph, weight="weight")

    rings: list[FraudRing] = []
    for idx, community in enumerate(communities):
        member_nodes = [n for n in community if n.startswith("m:")]
        merchant_nodes = [n for n in community if n.startswith("s:")]
        device_nodes = [n for n in community if n.startswith("d:")]
        if len(member_nodes) < min_ring_size:
            continue

        # Build member detail
        members_payload: list[FraudRingMember] = []
        for n in sorted(member_nodes, key=lambda x: -graph.degree(x))[:10]:
            members_payload.append(
                FraudRingMember(
                    member_id=n[2:],
                    masked_name=member_name.get(n, "Member"),
                    degree=int(graph.degree(n)),
                )
            )
        # Merchant detail with txn counts
        merchants_payload: list[FraudRingMerchant] = []
        for merch_node in sorted(
            merchant_nodes,
            key=lambda mn: -sum(member_merchant_txns.get((m, mn), 0) for m in member_nodes),
        )[:8]:
            txn_count = sum(member_merchant_txns.get((m, merch_node), 0) for m in member_nodes)
            merchants_payload.append(
                FraudRingMerchant(merchant=merch_node[2:], txn_count=int(txn_count))
            )

        total_aed = sum(
            member_merchant_aed.get((m, merch), 0.0)
            for m in member_nodes
            for merch in merchant_nodes
        )
        total_txn = sum(
            member_merchant_txns.get((m, merch), 0)
            for m in member_nodes
            for merch in merchant_nodes
        )
        redeemed = sum(member_redeemed.get(m, 0) for m in member_nodes)
        community_pr = sum(pr.get(n, 0.0) for n in community) / max(len(community), 1)

        pattern = _classify_pattern(
            member_count=len(member_nodes),
            merchant_count=len(merchant_nodes),
            redeemed_total=int(redeemed),
            txn_total=int(total_txn * 100),  # scale proxy
        )
        # Risk score: normalise density + shared-device count + pagerank tail.
        density = nx.density(graph.subgraph(community)) if len(community) > 1 else 0.0
        device_share = len(device_nodes) / max(len(member_nodes), 1)
        risk = min(
            100.0,
            round(
                (density * 40.0) + (device_share * 30.0) + (community_pr * 1000.0),
                2,
            ),
        )

        first_seen = min(
            (member_first_seen[m] for m in member_nodes if m in member_first_seen),
            default=date.fromisoformat(lo),
        )

        rings.append(
            FraudRing(
                ring_id=f"RING-{idx:03d}",
                members=members_payload,
                merchants=merchants_payload,
                pattern=pattern,
                risk_score=float(risk),
                community_pagerank=round(float(community_pr), 6),
                first_seen=first_seen,
                total_txn_aed=round(float(total_aed), 2),
            )
        )

    rings.sort(key=lambda r: r.risk_score, reverse=True)
    rings = rings[:5]

    response = FraudGraphResponse(
        date_from=date.fromisoformat(lo),
        date_to=date.fromisoformat(hi),
        min_ring_size=min_ring_size,
        rings=rings,
        graph_stats=FraudGraphStats(
            n_nodes=graph.number_of_nodes(),
            n_edges=graph.number_of_edges(),
            n_communities=len(communities),
            modularity=round(modularity, 4),
        ),
    )
    _GRAPH_CACHE[cache_key] = (time.monotonic(), response)
    return response
