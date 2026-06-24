"""AI Chat endpoint — Retrieval-Augmented answers via the Claude Code CLI.

The MVP wires G's existing Claude Code subscription to the app: rather than
using the Anthropic SDK with a separate API key, we shell out to the `claude`
binary in --print mode. The user question is grounded in a pre-computed data
snapshot (schema, KPI summary, top segments, top bundles) so the model answers
with facts, not hallucinations. The response includes an audit trail so the
loyalty manager can see which dataset the answer used.
"""

from __future__ import annotations

import json
import sys
import textwrap
import time

from fastapi import APIRouter, HTTPException

from citipoints_api.data.store import FilterParams, fetch_df
from citipoints_api.logging_conf import get_logger
from citipoints_api.schemas import ChatAuditTrail, ChatRequest, ChatResponse
from citipoints_api.services import ml_models, queries
from citipoints_api.services.claude_cli import (
    ClaudeCliError,
    extract_json_block,
    run_claude,
)

# MAX HQ anti-hallucination helper (Rule 1 principle block + Rule 7 SQLite log)
_MAX_UTILS = "/Users/gopalmacbook/Desktop/Max HQ/.max/utils"
if _MAX_UTILS not in sys.path:
    sys.path.insert(0, _MAX_UTILS)
try:
    from anti_hallucination import PRINCIPLE_BLOCK, log_llm_call  # type: ignore
except Exception:  # pragma: no cover — don't break chat if helper missing
    PRINCIPLE_BLOCK = ""

    def log_llm_call(**_kwargs):  # noqa: D401
        return None


router = APIRouter()
logger = get_logger(__name__)


SYSTEM_PROMPT = (
    PRINCIPLE_BLOCK
    + "\n\n"
    + textwrap.dedent(
        """
    You are CITI Points AI, an analytics copilot for the Nexus / Acme Retail
    loyalty team. You answer questions using ONLY the JSON "context" block the
    caller provides. If the context doesn't contain the data needed, say so —
    do not speculate, do not invent numbers.

    Respond with a single JSON object (no markdown fences, no trailing text):

    {
      "answer": "<plain-English answer, 2-4 sentences, include AED totals and %>",
      "used_tables": ["transactions", "customers", ...],
      "hypothetical_sql": "<the SQL a data analyst would have run — for audit>",
      "follow_ups": ["<3 concise follow-up questions the manager could ask>"]
    }

    Rules:
    - Use AED currency formatting (e.g., AED 1,234,000).
    - Keep `answer` under 500 characters. Be direct, not chatty.
    - `hypothetical_sql` is shown to the user as an audit trail — make it
      valid DuckDB SQL that references the tables they mention in the answer.
    - `follow_ups` must be three distinct, actionable questions.
    - Never output PII beyond customer_id tokens already in the context.
    - If the question is out of scope, set answer to a graceful refusal.
    """,
    ).strip()
)


def _build_context(filters: FilterParams) -> dict[str, object]:
    kpi = queries.kpi_snapshot(filters)
    stores = queries.store_performance(filters).head(5).to_dict(orient="records")
    categories = queries.category_mix(filters).to_dict(orient="records")
    tiers = queries.tier_distribution(filters).to_dict(orient="records")
    top_products = queries.top_products(filters, limit=5).to_dict(orient="records")

    # Segments + churn + basket are cached, so cheap to include
    rfm_personas = ml_models.run_rfm().persona_counts

    churn = ml_models.run_churn()
    churn_summary = {
        "auc_roc": churn.metrics.get("auc_roc", 0.0),
        "churn_rate_pct": churn.metrics.get("churn_rate", 0.0) * 100,
        "high_risk_count": int((churn.scores["risk_band"] == "High").sum())
        if not churn.scores.empty
        else 0,
    }

    clv = ml_models.run_clv()
    clv_summary = {
        "mean": clv.summary.get("mean", 0.0),
        "median": clv.summary.get("median", 0.0),
        "total_projected_12m": clv.summary.get("total", 0.0),
    }

    rules = ml_models.run_fpgrowth().rules
    top_bundles = (
        rules.head(5)[
            ["antecedents_label", "consequents_label", "support", "confidence", "lift"]
        ].to_dict(orient="records")
        if not rules.empty
        else []
    )

    schema = {
        "transactions": [
            "transaction_id TEXT",
            "customer_id TEXT",
            "date DATE",
            "store TEXT",
            "sku_id TEXT",
            "category TEXT",
            "units INTEGER",
            "amount DOUBLE (AED)",
            "points_earned INTEGER",
            "points_redeemed INTEGER",
        ],
        "customers": ["customer_id TEXT", "name TEXT", "tier TEXT", "join_date DATE", "city TEXT"],
        "skus": [
            "sku_id TEXT",
            "product_name TEXT",
            "brand TEXT",
            "category TEXT",
            "subcategory TEXT",
        ],
    }

    return {
        "schema": schema,
        "filters": filters.__dict__,
        "kpi": kpi,
        "top_stores": stores,
        "category_mix": categories,
        "tier_distribution": tiers,
        "top_products": top_products,
        "segments": rfm_personas,
        "churn": churn_summary,
        "clv": clv_summary,
        "top_bundles": top_bundles,
    }


def _fallback(question: str, context: dict[str, object]) -> ChatResponse:
    """Deterministic context-only answer. Pattern-matches common intents so
    the chatbot stays useful when the Claude CLI is slow or unreachable.
    """
    q = question.lower().strip()
    kpi = context.get("kpi") if isinstance(context.get("kpi"), dict) else {}
    kpi = kpi or {}
    revenue = float(kpi.get("revenue", 0) or 0)
    txns = int(kpi.get("transactions", 0) or 0)
    customers = int(
        kpi.get("customers", 0) or kpi.get("members", 0) or kpi.get("active_members", 0) or 0
    )
    if customers == 0 and isinstance(context.get("segments"), dict):
        # Fall back to summing segment populations — always non-zero if ML ran.
        customers = int(sum(int(v or 0) for v in context["segments"].values()))
    atv = kpi.get("atv") or (revenue / txns if txns else 0)
    churn = context.get("churn") if isinstance(context.get("churn"), dict) else {}
    churn = churn or {}
    clv = context.get("clv") if isinstance(context.get("clv"), dict) else {}
    clv = clv or {}
    segments = context.get("segments") if isinstance(context.get("segments"), dict) else {}
    segments = segments or {}
    top_bundles = context.get("top_bundles") or []
    top_stores = context.get("top_stores") or []

    answer: str
    tables: list[str] = ["transactions", "customers"]

    def _has(*keys: str) -> bool:
        return any(k in q for k in keys)

    if _has(
        "how many member", "member count", "how many customer", "customers do we", "total member"
    ):
        answer = (
            f"{customers:,} members in the active window. "
            f"Across segments — {', '.join(f'{k}: {v}' for k, v in list(segments.items())[:4]) or 'see Segments page'}."
        )
    elif _has("revenue", "how much did we make", "total sales", "aed"):
        answer = (
            f"AED {revenue:,.0f} revenue across {txns:,} transactions "
            f"(ATV AED {float(atv):,.2f}) in the selected window."
        )
    elif _has("churn", "at risk", "at-risk", "leaving"):
        pct = churn.get("churn_rate_pct", 0) or 0
        high = churn.get("high_risk_count", 0) or 0
        answer = (
            f"Churn rate {float(pct):.1f}% · {int(high):,} members flagged high-risk "
            f"(XGBoost, AUC {churn.get('auc_roc', 0):.2f}). See Churn + CLV page."
        )
    elif _has("clv", "lifetime value", "life time value"):
        answer = (
            f"Projected 12-month CLV: AED {float(clv.get('total_projected_12m', 0) or 0):,.0f} total · "
            f"mean AED {float(clv.get('mean', 0) or 0):,.0f} · median AED {float(clv.get('median', 0) or 0):,.0f} "
            f"(BG/NBD + Gamma-Gamma)."
        )
    elif _has("bundle", "basket", "sells together", "cross-sell", "lift"):
        if top_bundles:
            lines = [
                f"{b.get('antecedents_label')} → {b.get('consequents_label')} (lift {b.get('lift', 0):.2f}x)"
                for b in top_bundles[:3]
            ]
            answer = "Top bundles: " + " · ".join(lines) + ". Full list on Market Basket."
        else:
            answer = "No bundles above the support/confidence threshold in this window. Try lowering min-support on the Market Basket page."
    elif _has("segment", "rfm", "persona"):
        answer = (
            "Segments (RFM+KMeans): "
            + ", ".join(f"{k}={v}" for k, v in list(segments.items())[:5])
            + "."
        )
    elif _has("store", "branch", "outlet", "best store", "top store"):
        if top_stores:
            lines = [
                f"{s.get('store')} (AED {float(s.get('revenue', 0)):,.0f})" for s in top_stores[:3]
            ]
            answer = "Top stores by revenue: " + " · ".join(lines) + "."
        else:
            answer = "Store performance not available in this window."
    elif _has("ifrs", "liability", "breakage", "points outstanding"):
        answer = (
            "Open the IFRS 15 close page for the full waterfall: total outstanding liability, "
            "expected breakage (Monte Carlo envelope), and 90-day expiring member CSV."
        )
    else:
        answer = (
            f"Window snapshot: AED {revenue:,.0f} revenue · {txns:,} transactions · "
            f"{customers:,} members · ATV AED {float(atv):,.2f}. "
            "Try: revenue · members · churn · CLV · top bundles · segments · top stores · IFRS liability."
        )

    return ChatResponse(
        question=question,
        answer=answer,
        audit=ChatAuditTrail(
            retrieved_tables=tables,
            executed_sql=None,
            row_count=None,
        ),
        follow_ups=[
            "Which store had the biggest revenue drop this week?",
            "How many Platinum members are at high churn risk?",
            "Which product pair has the highest lift?",
        ],
    )


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    filters = FilterParams()
    try:
        context = _build_context(filters)
    except Exception as exc:  # noqa: BLE001 — context is best-effort; surface a graceful fallback
        logger.warning("chat.context_error", error=str(exc))
        context = {"kpi": {}, "note": "context unavailable — warehouse or ML run failed"}
    payload = json.dumps({"context": context, "question": req.question}, default=str)

    t0 = time.time()
    try:
        # 15s: fast-fail so the smart fallback can answer from context
        # before the frontend perceives the request as hung.
        result = await run_claude(payload, system=SYSTEM_PROMPT, timeout_s=15.0)
    except ClaudeCliError as exc:
        logger.warning("chat.cli_error", error=str(exc))
        log_llm_call(
            skill="citipoints:chat",
            model="claude-cli",
            prompt=req.question,
            output=None,
            duration_ms=int((time.time() - t0) * 1000),
            abstained=True,
            error=str(exc),
        )
        return _fallback(req.question, context)
    except Exception as exc:  # noqa: BLE001 — never let the chat endpoint 500
        logger.warning("chat.unexpected_error", error=str(exc))
        log_llm_call(
            skill="citipoints:chat",
            model="claude-cli",
            prompt=req.question,
            output=None,
            duration_ms=int((time.time() - t0) * 1000),
            abstained=True,
            error=str(exc),
        )
        return _fallback(req.question, context)

    log_llm_call(
        skill="citipoints:chat",
        model=result.model,
        prompt=req.question,
        output=result.text,
        duration_ms=int((time.time() - t0) * 1000),
    )

    parsed = extract_json_block(result.text)
    if parsed is None:
        logger.warning("chat.parse_error", text_preview=result.text[:200])
        return ChatResponse(
            question=req.question,
            answer=result.text.strip()[:2000],
            audit=ChatAuditTrail(
                retrieved_tables=["transactions", "customers", "skus"],
                executed_sql=None,
                row_count=None,
            ),
            follow_ups=[],
        )

    used_tables = parsed.get("used_tables") or ["transactions", "customers"]
    follow_ups = parsed.get("follow_ups") or []
    sql = parsed.get("hypothetical_sql")

    row_count = None
    if isinstance(sql, str) and sql.strip():
        try:
            # Only run if the SQL is read-only (safeguard)
            upper = sql.strip().upper()
            if (
                upper.startswith("SELECT")
                and "INSERT" not in upper
                and "UPDATE" not in upper
                and "DELETE" not in upper
            ):
                sample = fetch_df(sql)
                row_count = len(sample)
        except Exception:  # pragma: no cover — best-effort audit
            row_count = None

    return ChatResponse(
        question=req.question,
        answer=str(parsed.get("answer", "") or "").strip(),
        audit=ChatAuditTrail(
            retrieved_tables=[str(t) for t in used_tables],
            executed_sql=sql if isinstance(sql, str) else None,
            row_count=row_count,
        ),
        follow_ups=[str(f) for f in follow_ups][:3],
    )
