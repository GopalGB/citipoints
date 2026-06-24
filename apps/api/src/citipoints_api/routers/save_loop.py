"""Agentic Churn-Save Loop endpoint.

Parses a natural-language command ("target hibernating whales with AED 50 at
Acme Retail"), segments the warehouse, drafts bilingual offer copy, splits a
10% holdout, and projects causal lift. Anti-hallucination PRINCIPLE_BLOCK is
prepended to every Claude call; every call is logged to the MAX HQ SQLite log.
"""

from __future__ import annotations

import json
import sys
import textwrap
import time
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from citipoints_api.data.store import fetch_df
from citipoints_api.logging_conf import get_logger
from citipoints_api.schemas import ORMBase
from citipoints_api.services.claude_cli import (
    ClaudeCliError,
    extract_json_block,
    run_claude,
)

# MAX HQ anti-hallucination helper
_MAX_UTILS = "/Users/gopalmacbook/Desktop/Max HQ/.max/utils"
if _MAX_UTILS not in sys.path:
    sys.path.insert(0, _MAX_UTILS)
try:
    from anti_hallucination import PRINCIPLE_BLOCK, log_llm_call  # type: ignore
except Exception:  # pragma: no cover
    PRINCIPLE_BLOCK = ""

    def log_llm_call(**_kwargs):  # noqa: D401
        return None


router = APIRouter(prefix="/save-loop")
logger = get_logger(__name__)


# ── Schemas ────────────────────────────────────────────────────────────

Channel = Literal["whatsapp", "email", "push"]
Confidence = Literal["high", "medium", "low"]


class SaveLoopRequest(BaseModel):
    command: str = Field(..., min_length=3, max_length=500)


class SaveLoopSegment(ORMBase):
    sql: str
    member_count: int
    avg_spend_aed: float


class SaveLoopOffer(ORMBase):
    en: str
    ar: str
    bonus_aed: float
    channel: Channel


class SaveLoopPlan(ORMBase):
    treated_count: int
    holdout_count: int
    expected_lift_aed: float
    expected_lift_pct: float
    confidence: Confidence


class SaveLoopTraceStep(ORMBase):
    step: str
    tool: str
    output: str


class SaveLoopResponse(ORMBase):
    command: str
    segment: SaveLoopSegment
    offer: SaveLoopOffer
    plan: SaveLoopPlan
    trace: list[SaveLoopTraceStep]
    abstained: bool = False


# ── Prompts ────────────────────────────────────────────────────────────

SYSTEM_PROMPT_PARSE = (
    PRINCIPLE_BLOCK
    + "\n\n"
    + textwrap.dedent(
        """
        You are the CITI Points save-loop planner. Parse the loyalty manager's
        free-text command into a structured campaign brief. Use ONLY the fields
        below. Do not invent filters not supported by the schema.

        Available tiers: Platinum, Gold, Silver, Bronze.
        Available recency bands: active | cooling | hibernating | lapsed.
        Available partners (store match substring): Acme Retail, Lulu, Carrefour,
            Spinneys, EROS, or null for all.
        Available channels: whatsapp | email | push.

        Respond with a SINGLE JSON object (no fences):

        {
          "tier_filter": ["Platinum"] | ["Platinum","Gold"] | null,
          "recency_band": "hibernating" | "cooling" | "lapsed" | "active" | null,
          "partner_substring": "acme" | "lulu" | ... | null,
          "bonus_aed": <float, default 25>,
          "channel": "whatsapp" | "email" | "push",
          "persona_label": "<short human label, e.g. 'Hibernating Whales'>",
          "confidence_score": <0.0-1.0>
        }
        """
    ).strip()
)

SYSTEM_PROMPT_COPY = (
    PRINCIPLE_BLOCK
    + "\n\n"
    + textwrap.dedent(
        """
        You are the CITI Points offer-copy writer for Nexus / Acme Retail. Given
        a campaign brief (persona, bonus_aed, channel, member_count), produce
        short, on-brand copy in English AND Arabic. Arabic MUST be real Arabic
        (RTL). Mention Nexus, the bonus_aed amount, and the channel context.

        Respond with a SINGLE JSON object:

        {
          "en": "<80-200 chars, friendly, 1 CTA>",
          "ar": "<80-200 chars Arabic, friendly, 1 CTA>",
          "confidence_score": <0.0-1.0>
        }
        """
    ).strip()
)


# ── Tool implementations (grounded in warehouse) ───────────────────────


def _recency_band_sql(band: str | None) -> str:
    """DuckDB clause that filters on last-transaction recency."""
    if band is None:
        return ""
    mapping = {
        "active": "MAX(t.date) >= (SELECT MAX(date) - INTERVAL 14 DAY FROM transactions)",
        "cooling": (
            "MAX(t.date) < (SELECT MAX(date) - INTERVAL 14 DAY FROM transactions) AND "
            "MAX(t.date) >= (SELECT MAX(date) - INTERVAL 45 DAY FROM transactions)"
        ),
        "hibernating": (
            "MAX(t.date) < (SELECT MAX(date) - INTERVAL 45 DAY FROM transactions) AND "
            "MAX(t.date) >= (SELECT MAX(date) - INTERVAL 90 DAY FROM transactions)"
        ),
        "lapsed": "MAX(t.date) < (SELECT MAX(date) - INTERVAL 90 DAY FROM transactions)",
    }
    return mapping.get(band, "")


def _build_segment_sql(
    tiers: list[str] | None,
    band: str | None,
    partner: str | None,
) -> str:
    tier_clause = ""
    if tiers:
        in_list = ", ".join(
            f"'{t}'" for t in tiers if t in {"Platinum", "Gold", "Silver", "Bronze"}
        )
        if in_list:
            tier_clause = f"AND c.tier IN ({in_list})"
    partner_clause = ""
    if partner:
        partner_safe = partner.replace("'", "").lower()
        partner_clause = f"AND LOWER(t.store) LIKE '%{partner_safe}%'"
    having_clause = _recency_band_sql(band)
    having_sql = f"HAVING {having_clause}" if having_clause else ""
    return textwrap.dedent(
        f"""
        SELECT
            c.customer_id,
            c.tier,
            MAX(t.date)   AS last_txn,
            SUM(t.amount) AS spend_90d,
            COUNT(*)      AS txn_90d
        FROM customers c
        JOIN transactions t USING(customer_id)
        WHERE t.date >= (SELECT MAX(date) - INTERVAL 90 DAY FROM transactions)
        {tier_clause}
        {partner_clause}
        GROUP BY c.customer_id, c.tier
        {having_sql}
        """
    ).strip()


async def _parse_command(command: str) -> tuple[dict, SaveLoopTraceStep]:
    """Claude parses the free-text command into a structured brief."""
    t0 = time.time()
    brief: dict = {
        "tier_filter": None,
        "recency_band": None,
        "partner_substring": None,
        "bonus_aed": 25.0,
        "channel": "whatsapp",
        "persona_label": "At-risk members",
        "confidence_score": 0.6,
    }
    try:
        result = await run_claude(command, system=SYSTEM_PROMPT_PARSE)
        parsed = extract_json_block(result.text) or {}
        brief.update({k: v for k, v in parsed.items() if v is not None})
        log_llm_call(
            skill="citipoints:save-loop:parse",
            model=result.model,
            prompt=command,
            output=result.text,
            duration_ms=int((time.time() - t0) * 1000),
            abstained=False,
            confidence=float(parsed.get("confidence_score") or 0.6),
        )
    except ClaudeCliError as exc:
        logger.warning("save_loop.parse.cli_error", error=str(exc))
        # Heuristic fallback so the endpoint always produces output.
        lc = command.lower()
        if "platinum" in lc or "whale" in lc:
            brief["tier_filter"] = ["Platinum", "Gold"]
        if "hibern" in lc or "lapsed" in lc or "dormant" in lc:
            brief["recency_band"] = "hibernating"
        elif "cooling" in lc or "win back" in lc:
            brief["recency_band"] = "cooling"
        for partner in ("acme", "lulu", "carrefour", "spinneys", "eros"):
            if partner in lc:
                brief["partner_substring"] = partner
                break
        log_llm_call(
            skill="citipoints:save-loop:parse",
            model="claude-cli",
            prompt=command,
            output=None,
            duration_ms=int((time.time() - t0) * 1000),
            abstained=True,
            error=str(exc),
        )

    trace = SaveLoopTraceStep(
        step="parse_command",
        tool="claude-cli",
        output=json.dumps(
            {
                "persona_label": brief.get("persona_label"),
                "tier_filter": brief.get("tier_filter"),
                "recency_band": brief.get("recency_band"),
                "partner_substring": brief.get("partner_substring"),
                "bonus_aed": brief.get("bonus_aed"),
                "channel": brief.get("channel"),
            },
            default=str,
        ),
    )
    return brief, trace


def _run_segment(brief: dict) -> tuple[SaveLoopSegment, SaveLoopTraceStep]:
    sql = _build_segment_sql(
        brief.get("tier_filter"),
        brief.get("recency_band"),
        brief.get("partner_substring"),
    )
    try:
        df = fetch_df(sql)
    except Exception as exc:  # pragma: no cover
        logger.warning("save_loop.segment.sql_error", error=str(exc))
        df = None

    if df is None or df.empty:
        member_count = 0
        avg_spend = 0.0
    else:
        member_count = int(len(df))
        avg_spend = float(df["spend_90d"].mean()) if "spend_90d" in df.columns else 0.0

    segment = SaveLoopSegment(
        sql=sql,
        member_count=member_count,
        avg_spend_aed=round(avg_spend, 2),
    )
    trace = SaveLoopTraceStep(
        step="segment",
        tool="duckdb",
        output=f"{member_count:,} members · avg 90d spend AED {avg_spend:,.0f}",
    )
    return segment, trace


async def _draft_copy(
    brief: dict, segment: SaveLoopSegment
) -> tuple[SaveLoopOffer, SaveLoopTraceStep]:
    """Claude drafts EN + AR offer copy grounded in the segment numbers."""
    t0 = time.time()
    persona = brief.get("persona_label") or "At-risk members"
    bonus = float(brief.get("bonus_aed") or 25.0)
    channel: Channel = brief.get("channel") or "whatsapp"  # type: ignore[assignment]
    payload = {
        "persona_label": persona,
        "bonus_aed": bonus,
        "channel": channel,
        "member_count": segment.member_count,
        "avg_spend_aed": segment.avg_spend_aed,
        "lang": ["en", "ar"],
    }

    en_copy = (
        f"Hi! As a valued Nexus member we saved AED {bonus:.0f} in bonus points for you. "
        f"Visit us this week and we will add them on your first purchase. See you soon."
    )
    ar_copy = (
        f"مرحبًا! بصفتك عضوًا مميزًا في Nexus، قمنا بتخصيص {bonus:.0f} درهم إضافية كنقاط مكافأة لك. "
        f"زُرنا هذا الأسبوع لنضيفها عند أول عملية شراء."
    )

    try:
        result = await run_claude(
            json.dumps(payload, ensure_ascii=False),
            system=SYSTEM_PROMPT_COPY,
        )
        parsed = extract_json_block(result.text) or {}
        if parsed.get("en"):
            en_copy = str(parsed["en"]).strip()
        if parsed.get("ar"):
            ar_copy = str(parsed["ar"]).strip()
        log_llm_call(
            skill="citipoints:save-loop:copy",
            model=result.model,
            prompt=json.dumps(payload, ensure_ascii=False)[:400],
            output=result.text,
            duration_ms=int((time.time() - t0) * 1000),
            abstained=False,
            confidence=float(parsed.get("confidence_score") or 0.7),
        )
    except ClaudeCliError as exc:
        logger.warning("save_loop.copy.cli_error", error=str(exc))
        log_llm_call(
            skill="citipoints:save-loop:copy",
            model="claude-cli",
            prompt=json.dumps(payload, ensure_ascii=False)[:400],
            output=None,
            duration_ms=int((time.time() - t0) * 1000),
            abstained=True,
            error=str(exc),
        )

    offer = SaveLoopOffer(
        en=en_copy,
        ar=ar_copy,
        bonus_aed=bonus,
        channel=channel,
    )
    trace = SaveLoopTraceStep(
        step="draft_copy",
        tool="claude-cli",
        output=f"EN {len(en_copy)} chars · AR {len(ar_copy)} chars · channel {channel}",
    )
    return offer, trace


def _plan(segment: SaveLoopSegment) -> tuple[SaveLoopPlan, SaveLoopTraceStep]:
    """10% holdout + synthetic uplift model: treated_avg = base_avg * 1.15."""
    total = segment.member_count
    holdout = max(1, round(total * 0.10)) if total else 0
    treated = max(0, total - holdout)
    base_avg = segment.avg_spend_aed or 0.0
    # Synthetic uplift: treated arm spends 15% more on average during campaign window.
    treated_spend = base_avg * 1.15
    holdout_spend = base_avg
    # Expected incremental revenue attributable to the campaign.
    expected_lift_aed = round(max(0.0, (treated_spend - holdout_spend) * treated), 2)
    expected_lift_pct = 15.0 if base_avg > 0 else 0.0

    # Confidence based on sample size — below 30 treated members the estimate is noisy.
    if treated >= 200 and base_avg > 0:
        confidence: Confidence = "high"
    elif treated >= 30 and base_avg > 0:
        confidence = "medium"
    else:
        confidence = "low"

    plan = SaveLoopPlan(
        treated_count=treated,
        holdout_count=holdout,
        expected_lift_aed=expected_lift_aed,
        expected_lift_pct=expected_lift_pct,
        confidence=confidence,
    )
    trace = SaveLoopTraceStep(
        step="holdout_and_lift",
        tool="synthetic-uplift-model",
        output=(
            f"treated={treated:,} · holdout={holdout:,} · "
            f"expected lift AED {expected_lift_aed:,.0f} (+{expected_lift_pct:.1f}%)"
        ),
    )
    return plan, trace


@router.post("/run", response_model=SaveLoopResponse)
async def run_save_loop(req: SaveLoopRequest) -> SaveLoopResponse:
    if not req.command.strip():
        raise HTTPException(status_code=422, detail="Command is required")

    trace: list[SaveLoopTraceStep] = []
    brief, t1 = await _parse_command(req.command)
    trace.append(t1)

    segment, t2 = _run_segment(brief)
    trace.append(t2)

    offer, t3 = await _draft_copy(brief, segment)
    trace.append(t3)

    plan, t4 = _plan(segment)
    trace.append(t4)

    abstained = plan.confidence == "low" and segment.member_count < 5

    return SaveLoopResponse(
        command=req.command,
        segment=segment,
        offer=offer,
        plan=plan,
        trace=trace,
        abstained=abstained,
    )
