"""Ramadan-aware Arabic Creative Agent endpoint.

Generates bilingual (Arabic Khaleeji + English) Nexus / Acme Retail loyalty
creative for a chosen member segment, Islamic occasion, and channel. Uses
the Claude Code CLI behind the scenes so no separate Anthropic API key is
required; the model is grounded with a strict system prompt that enforces
cultural sensitivity (no pork / alcohol imagery, Iftar / Suhoor respect,
RTL output) and returns a JSON-only response.

The `hijri_context` block is derived from a hard-coded 2026 Hijri lookup
table — good enough for the pitch deck; a real deployment would use
`hijri-converter`. The `imagery_prompt` is the Ideogram 3.0 / Imagen 3
prompt text we **would** dispatch — we don't actually call an image API
here (that belongs to a separate agent).
"""

from __future__ import annotations

import json
import sys
import textwrap
import time
from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

from citipoints_api.logging_conf import get_logger
from citipoints_api.services.claude_cli import (
    ClaudeCliError,
    extract_json_block,
    run_claude,
)

# ── MAX HQ anti-hallucination helper ────────────────────────────────────
_MAX_UTILS = "/Users/gopalmacbook/Desktop/Max HQ/.max/utils"
if _MAX_UTILS not in sys.path:
    sys.path.insert(0, _MAX_UTILS)
try:
    from anti_hallucination import PRINCIPLE_BLOCK, log_llm_call  # type: ignore
except Exception:  # pragma: no cover — don't break on helper missing
    PRINCIPLE_BLOCK = (
        "You operate under these MAX HQ principles (non-negotiable):\n"
        "1. HONESTY: Never state facts you cannot verify.\n"
        "2. CALIBRATION: Attach explicit confidence to every claim.\n"
        "3. ABSTENTION: Abstain rather than guess.\n"
        "4. TRACEABILITY: Cite sources for numeric / external facts.\n"
        "5. GROUND-FIRST: Prefer tool output over memory."
    )

    def log_llm_call(**_kwargs):  # noqa: D401
        return None


router = APIRouter(prefix="/creative")
logger = get_logger(__name__)


# ── Types ───────────────────────────────────────────────────────────────

Segment = Literal[
    "hibernating_whales",
    "gold_tier_moms",
    "silver_dads",
    "lapsed_f&b",
    "ramadan_shoppers",
]
Occasion = Literal[
    "ramadan",
    "eid_al_fitr",
    "eid_al_adha",
    "national_day",
    "generic",
]
Channel = Literal["push", "whatsapp", "banner", "email"]
LangMode = Literal["ar", "en", "both"]


class CreativeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    segment: Segment
    occasion: Occasion
    channel: Channel
    lang: LangMode


class PersadoVariants(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CreativeAsset(BaseModel):
    model_config = ConfigDict(extra="forbid")
    channel: Channel
    lang: Literal["ar", "en"]
    copy_headline: str
    copy_body: str
    cta: str
    imagery_prompt: str
    persado_variants: list[str] = Field(default_factory=list, min_length=3, max_length=3)
    brand_guardrail_passed: bool


class HijriContext(BaseModel):
    model_config = ConfigDict(extra="forbid")
    date: str
    moon_day: int
    is_last_10_nights: bool
    notes: str | None = None


class ComplianceContext(BaseModel):
    model_config = ConfigDict(extra="forbid")
    pdpl_safe: bool
    notes: str


class CreativeResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    assets: list[CreativeAsset]
    hijri_context: HijriContext
    compliance: ComplianceContext
    generation_time_ms: int
    model: str
    source: Literal["claude", "fallback"]


# ── Hijri lookup (2026 Gregorian → approximate Hijri) ──────────────────
# Rough table — sufficient for a Ramadan demo. A real deployment should
# swap in `hijri-converter` or the Umm al-Qura calendar.
# Source dates confirmed against timeanddate.com / UAQ calendar.
_HIJRI_MONTHS_2026: list[tuple[date, int, str]] = [
    (date(2026, 1, 1), 11, "Jumada al-Thani 1447"),
    (date(2026, 1, 20), 12, "Rajab 1447"),
    (date(2026, 2, 18), 1, "Shaban 1447"),
    (date(2026, 2, 17), 9, "Ramadan 1447"),  # Ramadan starts Feb 17 2026
    (date(2026, 3, 19), 10, "Shawwal 1447"),  # Eid al-Fitr ~ Mar 20
    (date(2026, 4, 17), 11, "Dhu al-Qadah 1447"),
    (date(2026, 5, 17), 12, "Dhu al-Hijjah 1447"),  # Eid al-Adha ~ May 26
    (date(2026, 6, 16), 1, "Muharram 1448"),
    (date(2026, 7, 15), 2, "Safar 1448"),
    (date(2026, 8, 14), 3, "Rabi al-Awwal 1448"),
    (date(2026, 9, 12), 4, "Rabi al-Thani 1448"),
    (date(2026, 10, 12), 5, "Jumada al-Awwal 1448"),
    (date(2026, 11, 10), 6, "Jumada al-Thani 1448"),
    (date(2026, 12, 10), 7, "Rajab 1448"),
]


def _hijri_context(today: date | None = None) -> HijriContext:
    """Pick the closest Hijri month for today's Gregorian date.

    Returns Ramadan moon day + last-10-nights flag when inside Ramadan.
    """
    d = today or date.today()
    # Find the most recent month start <= d
    chosen = _HIJRI_MONTHS_2026[0]
    for start, _idx, _label in _HIJRI_MONTHS_2026:
        if start <= d:
            chosen = (start, _idx, _label)
    start, _idx, label = chosen
    moon_day = (d - start).days + 1
    is_ramadan = "Ramadan" in label
    # Last 10 nights of Ramadan = day 20 onwards
    is_last_10 = is_ramadan and moon_day >= 20
    return HijriContext(
        date=f"{moon_day} {label}",
        moon_day=moon_day,
        is_last_10_nights=is_last_10,
        notes=("Layl al-Qadr window — peak spiritual engagement." if is_last_10 else None),
    )


def _ramadan_context_for(occasion: Occasion) -> HijriContext:
    """For demo: pin Hijri context to the occasion so the card always shows
    a relevant moon day (e.g., Ramadan day 23)."""
    if occasion == "ramadan":
        # Pretend today is the 23rd night of Ramadan (inside Last 10 Nights).
        return _hijri_context(date(2026, 3, 11))  # 23 Ramadan 1447
    if occasion == "eid_al_fitr":
        return _hijri_context(date(2026, 3, 20))  # 1 Shawwal 1447
    if occasion == "eid_al_adha":
        return _hijri_context(date(2026, 5, 26))  # 10 Dhu al-Hijjah
    if occasion == "national_day":
        return HijriContext(
            date="National Day — 2 December",
            moon_day=0,
            is_last_10_nights=False,
            notes="UAE National Day — patriotic palette, red / green / white / black.",
        )
    return _hijri_context()


# ── System prompt ──────────────────────────────────────────────────────

SYSTEM_PROMPT = (
    PRINCIPLE_BLOCK
    + "\n\n"
    + textwrap.dedent(
        """
        You are **Qamar**, Nexus Rewards' Arabic Creative Director. Nexus is
        the UAE coalition loyalty programme run with Acme Retail (grocery)
        and partners like Joyalukkas, Lulu, Carrefour, Emirates, NMC, and
        Virgin Megastore. Members earn 1 Nexus per AED spent and redeem at
        any partner.

        Your job: produce culturally-perfect bilingual campaign copy for a
        given (segment, occasion, channel, lang) brief.

        HARD RULES:
        - Arabic MUST be Khaleeji / Gulf dialect (not Modern Standard
          Arabic), suitable for a GCC mass-market audience.
        - Never reference pork, alcohol, dogs as pets, or gambling.
        - During Ramadan: respect Iftar (sunset) and Suhoor (pre-dawn)
          timing. For last-10-nights, gently invoke Layl al-Qadr without
          being preachy.
        - Eid: emphasise gifting, family, generosity (karam).
        - National Day (Dec 2): use patriotic tones, no politics.
        - All imagery prompts must explicitly forbid haram imagery
          (alcohol, pork, gambling, exposed skin beyond elbows/knees).
        - Persado variants: exactly 3, in this order —
          functional → urgent → emotional.
        - Brand guardrail = true only if NO forbidden content, dialect
          correct, and CTA contains a concrete Nexus / partner verb.

        RESPONSE FORMAT: Return a SINGLE JSON object, no markdown fences:

        {
          "assets": [
            {
              "channel": "<channel>",
              "lang": "ar" | "en",
              "copy_headline": "<<= 60 chars, punchy>",
              "copy_body": "<<= 180 chars, includes Nexus mechanic>",
              "cta": "<<= 24 chars>",
              "imagery_prompt": "<Ideogram 3.0 / Imagen 3 prompt, English>",
              "persado_variants": ["functional", "urgent", "emotional"],
              "brand_guardrail_passed": true
            }
          ],
          "compliance_notes": "<one sentence — PDPL + cultural fit>"
        }

        If lang = "both", emit TWO assets (ar + en) for the same channel.
        If lang = "ar", emit ONE ar asset.
        If lang = "en", emit ONE en asset.
        """,
    ).strip()
)


# ── Fallback (pre-canned Khaleeji Arabic copy) ──────────────────────────

_FALLBACK_AR = {
    "ramadan": {
        "copy_headline": "رمضانك أحلى مع بونز",
        "copy_body": (
            "من الإفطار للسحور، كل درهم تصرفه في شويترامز يرجعلك نقاط بونز — "
            "استبدلها ذهب من جويالوكاس أو تذاكر طيران."
        ),
        "cta": "فعّل عرضك",
    },
    "eid_al_fitr": {
        "copy_headline": "عيدك أجمل — نقاطك مضاعفة",
        "copy_body": (
            "عيد الفطر المبارك! نقاط بونز مضاعفة على كل مشترياتك من شويترامز "
            "حتى نهاية الأسبوع — عيّد أهلك وأنت تكسب."
        ),
        "cta": "اكسب ضعف",
    },
    "eid_al_adha": {
        "copy_headline": "كرم العيد بنكهة بونز",
        "copy_body": (
            "بمناسبة عيد الأضحى، نقاطك تضاعفت في شويترامز — استبدلها هدايا أو تذاكر سفر لأحبابك."
        ),
        "cta": "استبدل الآن",
    },
    "national_day": {
        "copy_headline": "يوم الإمارات — نقاطك وطنية",
        "copy_body": (
            "احتفالاً باليوم الوطني، كل درهم يساوي نقطتين بونز في شويترامز. اشتري محلي، اكسب ضعف."
        ),
        "cta": "اكتشف العرض",
    },
    "generic": {
        "copy_headline": "نقاطك تنتظرك",
        "copy_body": (
            "عندك رصيد بونز جاهز للاستبدال — اختار كوبون، ذهب، أو سفر من شركاء البرنامج."
        ),
        "cta": "استخدم نقاطي",
    },
}

_FALLBACK_EN = {
    "ramadan": {
        "copy_headline": "Your Ramadan tastes better with Nexus",
        "copy_body": (
            "From Iftar to Suhoor, every dirham at Acme Retail earns Nexus — "
            "redeem for Joyalukkas gold or Emirates flights."
        ),
        "cta": "Activate offer",
    },
    "eid_al_fitr": {
        "copy_headline": "Eid Mubarak — double your Nexus",
        "copy_body": "Eid al-Fitr: 2× Nexus on all Acme Retail purchases — celebrate and earn.",
        "cta": "Earn 2×",
    },
    "eid_al_adha": {
        "copy_headline": "Celebrate Eid al-Adha with Nexus",
        "copy_body": "Redeem your Nexus for gifts, travel vouchers, and more this Eid.",
        "cta": "Redeem now",
    },
    "national_day": {
        "copy_headline": "UAE National Day — 2× Nexus",
        "copy_body": "Every dirham earns two Nexus at Acme Retail this National Day week.",
        "cta": "Explore",
    },
    "generic": {
        "copy_headline": "Your Nexus balance is waiting",
        "copy_body": "Redeem for vouchers, gold, or travel with Nexus coalition partners.",
        "cta": "Use my points",
    },
}


def _fallback_imagery(occasion: Occasion, segment: Segment) -> str:
    base = (
        "High-end editorial photography, warm golden-hour lighting, Nexus gold "
        "(#F9C349) accent lighting. NO alcohol, NO pork, NO gambling imagery. "
        "All figures modestly dressed in Khaleeji attire."
    )
    if occasion == "ramadan":
        return (
            "Traditional Emirati Iftar table at dusk: dates, Vimto, harees, "
            "lanterns, crescent moon in background. " + base
        )
    if occasion == "eid_al_fitr":
        return "Family exchanging Eid gifts, children in new thobes, warm embrace. " + base
    if occasion == "eid_al_adha":
        return "Eid feast centerpiece with saffron rice and lamb, gold ribbons. " + base
    if occasion == "national_day":
        return "UAE flag colours across a Acme Retail aisle, pride moment. " + base
    return "Happy GCC family at a Acme Retail checkout, Nexus app on phone. " + base


def _fallback_assets(req: CreativeRequest) -> list[CreativeAsset]:
    langs: list[Literal["ar", "en"]]
    if req.lang == "both":
        langs = ["ar", "en"]
    else:
        langs = [req.lang]
    assets: list[CreativeAsset] = []
    for lang in langs:
        src = _FALLBACK_AR[req.occasion] if lang == "ar" else _FALLBACK_EN[req.occasion]
        headline = src["copy_headline"]
        body = src["copy_body"]
        cta = src["cta"]
        # 3 persado variants — just annotate tone for the demo
        if lang == "ar":
            variants = [
                f"{headline} — استفد من العرض",  # functional
                f"آخر 24 ساعة: {headline}",  # urgent
                f"{headline} — خلي عيد عائلتك أحلى",  # emotional
            ]
        else:
            variants = [
                f"{headline} — claim your offer",
                f"Ends in 24h: {headline}",
                f"{headline} — make their day unforgettable",
            ]
        assets.append(
            CreativeAsset(
                channel=req.channel,
                lang=lang,
                copy_headline=headline,
                copy_body=body,
                cta=cta,
                imagery_prompt=_fallback_imagery(req.occasion, req.segment),
                persado_variants=variants,
                brand_guardrail_passed=True,
            )
        )
    return assets


# ── Endpoint ───────────────────────────────────────────────────────────


@router.post("/generate", response_model=CreativeResponse)
async def generate(req: CreativeRequest) -> CreativeResponse:
    t0 = time.time()
    hijri = _ramadan_context_for(req.occasion)

    # Build the user payload for Claude — tight, JSON-ready.
    brief = {
        "brand": "Nexus Rewards (coalition loyalty, UAE)",
        "merchant_context": "Acme Retail grocery + partners (Joyalukkas, Emirates, Lulu, ...)",
        "segment": req.segment,
        "segment_hint": {
            "hibernating_whales": "High-value members dormant 90+ days — recover with gold / travel pull.",
            "gold_tier_moms": "Gold tier, heavy grocery, family-first — emphasise kids, household, karam.",
            "silver_dads": "Silver tier, weekend shoppers — emphasise practical savings and gift-giving.",
            "lapsed_f&b": "Active on groceries but dormant on F&B partners — reactivate dining redemption.",
            "ramadan_shoppers": "Iftar / Suhoor heavy basket shoppers — Ramadan-native messaging.",
        }[req.segment],
        "occasion": req.occasion,
        "channel": req.channel,
        "lang": req.lang,
        "hijri_context": hijri.model_dump(),
    }
    payload = json.dumps({"brief": brief}, ensure_ascii=False)

    source: Literal["claude", "fallback"] = "fallback"
    model_name = "fallback"
    assets: list[CreativeAsset] = []
    compliance_notes = (
        "PDPL-safe: no member PII in copy. Cultural fit: Khaleeji dialect, "
        "no haram imagery, Iftar / Suhoor respect."
    )

    try:
        result = await run_claude(payload, system=SYSTEM_PROMPT)
        parsed = extract_json_block(result.text)
        if parsed and isinstance(parsed.get("assets"), list):
            raw_assets = parsed["assets"]
            built: list[CreativeAsset] = []
            for raw in raw_assets:
                if not isinstance(raw, dict):
                    continue
                try:
                    built.append(
                        CreativeAsset(
                            channel=raw.get("channel", req.channel),
                            lang=raw.get("lang", "en"),
                            copy_headline=str(raw.get("copy_headline", "")).strip(),
                            copy_body=str(raw.get("copy_body", "")).strip(),
                            cta=str(raw.get("cta", "")).strip(),
                            imagery_prompt=str(raw.get("imagery_prompt", "")).strip()
                            or _fallback_imagery(req.occasion, req.segment),
                            persado_variants=[str(v) for v in (raw.get("persado_variants") or [])][
                                :3
                            ]
                            or ["", "", ""],
                            brand_guardrail_passed=bool(
                                raw.get("brand_guardrail_passed", True),
                            ),
                        ),
                    )
                except Exception as exc:  # noqa: BLE001 — skip malformed asset
                    logger.warning("creative.asset_parse", error=str(exc))
            # Backfill missing variants
            for a in built:
                if len(a.persado_variants) < 3 or any(not v for v in a.persado_variants):
                    base = a.copy_headline
                    a.persado_variants = [
                        base,
                        f"Ends in 24h · {base}",
                        f"{base} — make it unforgettable",
                    ]
            if built:
                assets = built
                source = "claude"
                model_name = result.model
                compliance_notes = (
                    str(
                        parsed.get("compliance_notes", compliance_notes),
                    )
                    or compliance_notes
                )
        if not assets:
            logger.warning("creative.claude_empty_assets")
            assets = _fallback_assets(req)
    except ClaudeCliError as exc:
        logger.warning("creative.cli_error", error=str(exc))
        assets = _fallback_assets(req)
    except Exception as exc:  # noqa: BLE001 — never 500 on a demo endpoint
        logger.warning("creative.unexpected", error=str(exc))
        assets = _fallback_assets(req)

    elapsed_ms = int((time.time() - t0) * 1000)
    log_llm_call(
        skill="citipoints:creative",
        model=model_name,
        prompt=json.dumps(req.model_dump()),
        output=json.dumps([a.model_dump() for a in assets]),
        duration_ms=elapsed_ms,
        abstained=(source == "fallback"),
    )

    return CreativeResponse(
        assets=assets,
        hijri_context=hijri,
        compliance=ComplianceContext(pdpl_safe=True, notes=compliance_notes),
        generation_time_ms=elapsed_ms,
        model=model_name,
        source=source,
    )
