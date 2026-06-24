"""Hybrid recommender — content-based + collaborative via market basket rules."""

from __future__ import annotations

from fastapi import APIRouter, Query

from citipoints_api.data.store import fetch_df
from citipoints_api.schemas import Recommendation, RecommendationBundle
from citipoints_api.services import ml_models
from citipoints_api.services.insights import now_iso

router = APIRouter(prefix="/recommendations")

# Canonical customer-id format in the warehouse — used for cold-start hints
# and tolerant lookup (we fold case + strip whitespace before matching).
_ID_FORMAT_HINT = "CUST-NNNNN (e.g. CUST-10331)"


def _resolve_customer_id(raw: str) -> str | None:
    """Return the canonical customer_id for `raw`, or None if unknown.

    Accepts exact, trimmed, and upper-case variants so the endpoint is tolerant
    of whitespace / casing coming from bookmarks or external integrations.
    """
    candidate = (raw or "").strip()
    if not candidate:
        return None
    for probe in (candidate, candidate.upper()):
        row = fetch_df(
            "SELECT customer_id FROM customers WHERE customer_id = $cid LIMIT 1",
            {"cid": probe},
        )
        if not row.empty:
            return str(row.iloc[0]["customer_id"])
    return None


@router.get("/{customer_id}", response_model=RecommendationBundle)
def for_customer(
    customer_id: str,
    limit: int = Query(default=6, ge=1, le=20),
) -> RecommendationBundle:
    """Return recommendations for a member.

    Tolerant of unknown customer IDs — rather than 404, the endpoint returns a
    cold-start bundle built from store-wide bestsellers so downstream clients
    (NBA, campaign preview) keep working for previewed / prospective members.
    The `reason` field tells callers they are seeing a cold-start result and
    what the canonical ID format is.
    """
    resolved = _resolve_customer_id(customer_id)

    catalog = fetch_df("SELECT sku_id, product_name FROM skus")
    name_map = dict(zip(catalog["sku_id"], catalog["product_name"], strict=True))

    if resolved is None:
        # Cold-start: surface store-wide bestsellers with a clear reason string
        # so the UI can render "popular now" instead of failing.
        popular = fetch_df(
            """
            SELECT s.sku_id, s.product_name, SUM(t.amount) AS spend
            FROM transactions t
            JOIN skus s USING(sku_id)
            GROUP BY s.sku_id, s.product_name
            ORDER BY spend DESC
            LIMIT $lim
            """,
            {"lim": limit},
        )
        cold_items = [
            Recommendation(
                sku_id=row.sku_id,
                product_name=str(row.product_name or name_map.get(row.sku_id, row.sku_id)),
                score=round(float(row.spend) / 1000.0, 4),
                reason=(
                    f"Cold-start — customer '{customer_id}' not on file. "
                    f"Showing store-wide bestsellers. Canonical ID format: {_ID_FORMAT_HINT}."
                ),
            )
            for row in popular.itertuples(index=False)
        ]
        return RecommendationBundle(
            customer_id=customer_id,
            generated_at=now_iso(),
            recommendations=cold_items,
        )

    result = ml_models.recommendations_for(resolved, limit=limit)
    items = [
        Recommendation(
            sku_id=item["sku_id"],
            product_name=item.get("product_name") or name_map.get(item["sku_id"], item["sku_id"]),
            score=round(float(item["score"]), 4),
            reason=item["reason"],
        )
        for item in result.items
    ]
    return RecommendationBundle(
        customer_id=resolved,
        generated_at=now_iso(),
        recommendations=items,
    )
