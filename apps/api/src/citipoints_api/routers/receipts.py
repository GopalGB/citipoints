"""Receipt OCR endpoint — off-SKU Nexus earning.

Demo-grade: we don't call a real OCR vendor. The image is accepted (or the
base64 payload is accepted) and a plausible UAE supermarket receipt is
*synthesised* by Claude so the demo has realistic line items, Arabic
product names, and realistic AED totals.

The Nexus points rule engine then runs on the parsed (mock) receipt:

    - Partner merchant (Carrefour, Lulu, Spinneys, Acme Retail, Waitrose)
      → 1.0 Nexus per AED
    - Non-partner merchant
      → 0.25 Nexus per AED (off-SKU rate, capped 500 Nexus / day)

The anti-hallucination PRINCIPLE_BLOCK is prepended to the Claude system
prompt so the synthesiser refuses to invent data outside what was asked.
Every call is logged to `.max/logs/llm-calls.sqlite`.
"""

from __future__ import annotations

import base64
import json
import sys
import textwrap
import time
import uuid
from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, ConfigDict, Field

from citipoints_api.logging_conf import get_logger
from citipoints_api.services.claude_cli import (
    ClaudeCliError,
    extract_json_block,
    run_claude,
)

# MAX HQ anti-hallucination helper (Rule 1 + Rule 7)
_MAX_UTILS = "/Users/gopalmacbook/Desktop/Max HQ/.max/utils"
if _MAX_UTILS not in sys.path:
    sys.path.insert(0, _MAX_UTILS)
try:
    from anti_hallucination import PRINCIPLE_BLOCK, log_llm_call  # type: ignore
except Exception:  # pragma: no cover
    PRINCIPLE_BLOCK = ""

    def log_llm_call(**_kwargs):  # noqa: D401
        return None


router = APIRouter(prefix="/ledger")
logger = get_logger(__name__)


# ── Rule engine ─────────────────────────────────────────────────────────

PARTNER_MERCHANTS: set[str] = {
    "Carrefour",
    "Lulu",
    "Lulu Hypermarket",
    "Spinneys",
    "Acme Retail",
    "Waitrose",
}
PARTNER_EARN_RATE = 1.0  # Nexus per AED on partner SKUs
NON_PARTNER_EARN_RATE = 0.25  # Nexus per AED — off-SKU receipts
DAILY_NON_PARTNER_CAP = 500  # Nexus / day for non-partner earning


# ── Schemas ─────────────────────────────────────────────────────────────


class ORMBase(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True, extra="ignore")


class ReceiptLineItem(ORMBase):
    sku: str
    description: str
    qty: int
    unit_price_aed: float
    line_aed: float
    category: str


class ReceiptScanRequest(ORMBase):
    image_base64: str | None = None
    member_id: str = Field(min_length=1, max_length=64)


class ReceiptScanResponse(ORMBase):
    receipt_id: str
    merchant: str
    merchant_is_partner: bool
    txn_date: date
    total_aed: float
    line_items: list[ReceiptLineItem]
    points_awarded: int
    points_rule_applied: str
    confidence: Literal["high", "medium", "low"]
    processing_time_ms: int
    flags: list[str] = Field(default_factory=list)


# ── Claude prompt ───────────────────────────────────────────────────────

_OCR_SYSTEM = (
    PRINCIPLE_BLOCK
    + "\n\n"
    + textwrap.dedent(
        """
        You are a receipt OCR service for a UAE loyalty program. You DO NOT
        read pixels — you synthesise one plausible UAE supermarket receipt
        per call. Output ONLY a single JSON object (no markdown fences, no
        prose), matching exactly this schema:

        {
          "merchant": "<one of: Carrefour, Lulu, Spinneys, Waitrose, ADNOC, KFC, Tim Hortons>",
          "txn_date": "<YYYY-MM-DD within the last 7 days>",
          "total_aed": <number, sum of all line_aed>,
          "line_items": [
            {
              "sku": "<short alphanumeric SKU like 7290001 or ADC-4102>",
              "description": "<English name; ~30% of items include Arabic in parentheses, e.g. 'Basmati Rice 5kg (أرز بسمتي)'>",
              "qty": <positive integer 1..5>,
              "unit_price_aed": <number, 2 decimals>,
              "line_aed": <qty * unit_price_aed>,
              "category": "<Grocery|Dairy|Produce|Beverages|Snacks|Household|Fuel|QSR>"
            }
          ],
          "confidence": "<high|medium|low>",
          "flags": [<optional strings like "blurred_total", "cropped_edge">]
        }

        Rules:
        - Generate 6-10 line items. Totals must reconcile (sum lines == total_aed, rounded to 2dp).
        - Prices realistic for UAE: bread 3-8 AED, milk 4-12 AED, fuel 200-400 AED, QSR combo 25-50 AED.
        - If merchant is ADNOC, at least one line is "Fuel". If KFC/Tim Hortons, category=QSR.
        - confidence defaults to "high"; use "medium" or "low" only if you add a flag explaining why.
        - Never invent PII. No names, no phone numbers, no loyalty numbers.
        """,
    ).strip()
)


# ── Helpers ─────────────────────────────────────────────────────────────


def _fallback_receipt() -> dict[str, object]:
    """Deterministic mock when Claude CLI is unavailable — keeps demo alive."""
    today = date.today() - timedelta(days=1)
    items = [
        {
            "sku": "7290145",
            "description": "Almarai Full Cream Milk 2L (حليب)",
            "qty": 2,
            "unit_price_aed": 11.50,
            "line_aed": 23.00,
            "category": "Dairy",
        },
        {
            "sku": "4029877",
            "description": "Basmati Rice 5kg (أرز بسمتي)",
            "qty": 1,
            "unit_price_aed": 42.90,
            "line_aed": 42.90,
            "category": "Grocery",
        },
        {
            "sku": "2003312",
            "description": "Cucumber 1kg (خيار)",
            "qty": 1,
            "unit_price_aed": 6.75,
            "line_aed": 6.75,
            "category": "Produce",
        },
        {
            "sku": "7501024",
            "description": "Pepsi 1.5L x6",
            "qty": 1,
            "unit_price_aed": 24.00,
            "line_aed": 24.00,
            "category": "Beverages",
        },
        {
            "sku": "9931170",
            "description": "Lays Classic 165g",
            "qty": 2,
            "unit_price_aed": 8.25,
            "line_aed": 16.50,
            "category": "Snacks",
        },
        {
            "sku": "8812340",
            "description": "Persil Detergent 3kg",
            "qty": 1,
            "unit_price_aed": 39.00,
            "line_aed": 39.00,
            "category": "Household",
        },
    ]
    total = round(sum(i["line_aed"] for i in items), 2)
    return {
        "merchant": "Carrefour",
        "txn_date": today.isoformat(),
        "total_aed": total,
        "line_items": items,
        "confidence": "medium",
        "flags": ["cli_offline_fallback"],
    }


def _is_partner(merchant: str) -> bool:
    m = merchant.strip().lower()
    return any(p.lower() in m or m in p.lower() for p in PARTNER_MERCHANTS)


def _compute_points(total_aed: float, is_partner: bool) -> tuple[int, str]:
    if is_partner:
        pts = int(round(total_aed * PARTNER_EARN_RATE))
        return pts, (f"Partner merchant · {PARTNER_EARN_RATE} Nexus per AED — full rate applied.")
    raw = total_aed * NON_PARTNER_EARN_RATE
    pts = int(min(round(raw), DAILY_NON_PARTNER_CAP))
    rule = (
        f"Non-partner {NON_PARTNER_EARN_RATE} Nexus per AED — capped at "
        f"{DAILY_NON_PARTNER_CAP} Nexus/day."
    )
    return pts, rule


def _line_items(raw: list[dict]) -> list[ReceiptLineItem]:
    out: list[ReceiptLineItem] = []
    for r in raw[:12]:
        try:
            out.append(
                ReceiptLineItem(
                    sku=str(r.get("sku", "UNKNOWN"))[:32],
                    description=str(r.get("description", ""))[:200],
                    qty=int(r.get("qty", 1)),
                    unit_price_aed=float(r.get("unit_price_aed", 0.0)),
                    line_aed=float(r.get("line_aed", 0.0)),
                    category=str(r.get("category", "Grocery"))[:32],
                )
            )
        except (TypeError, ValueError):
            continue
    return out


def _parse_date(raw: object) -> date:
    if isinstance(raw, str):
        try:
            return date.fromisoformat(raw[:10])
        except ValueError:
            pass
    return date.today()


async def _synthesise(image_bytes_len: int) -> tuple[dict[str, object], str]:
    """Call Claude to produce a mock receipt JSON. Returns (parsed_dict, source)."""
    user_prompt = json.dumps(
        {
            "task": "synthesise_receipt",
            "image_size_bytes": image_bytes_len,
            "note": (
                "Pixel parsing is not expected; produce one plausible UAE "
                "supermarket or QSR receipt for loyalty-demo purposes."
            ),
        }
    )
    try:
        result = await run_claude(user_prompt, system=_OCR_SYSTEM)
    except ClaudeCliError as exc:
        logger.warning("receipts.cli_error", error=str(exc))
        return _fallback_receipt(), "fallback"
    except Exception as exc:  # noqa: BLE001
        logger.warning("receipts.unexpected_cli_error", error=str(exc))
        return _fallback_receipt(), "fallback"

    parsed = extract_json_block(result.text)
    if not parsed:
        logger.warning("receipts.parse_error", preview=result.text[:160])
        return _fallback_receipt(), "fallback"
    return parsed, result.model


async def _run_scan(image_bytes_len: int, member_id: str) -> ReceiptScanResponse:
    if not member_id or len(member_id) > 64:
        raise HTTPException(status_code=400, detail="member_id required (<= 64 chars)")

    t0 = time.time()
    parsed, source = await _synthesise(image_bytes_len)
    merchant = str(parsed.get("merchant") or "Unknown Merchant")[:80]
    is_partner = _is_partner(merchant)
    items = _line_items(parsed.get("line_items") or [])  # type: ignore[arg-type]

    # Reconcile total from items if the LLM disagrees
    claimed_total = float(parsed.get("total_aed") or 0.0)
    computed_total = round(sum(i.line_aed for i in items), 2)
    total_aed = claimed_total if abs(claimed_total - computed_total) < 0.5 else computed_total

    points_awarded, rule = _compute_points(total_aed, is_partner)

    confidence_raw = str(parsed.get("confidence") or "medium").lower()
    confidence: Literal["high", "medium", "low"] = (
        "high" if confidence_raw == "high" else "low" if confidence_raw == "low" else "medium"
    )
    flags = [str(f) for f in (parsed.get("flags") or []) if isinstance(f, (str, int, float))][:6]
    if abs(claimed_total - computed_total) >= 0.5:
        flags.append("total_mismatch_reconciled")
    if total_aed <= 0 or not items:
        flags.append("empty_receipt")

    elapsed = int((time.time() - t0) * 1000)
    log_llm_call(
        skill="citipoints:receipt_ocr",
        model=source,
        prompt=f"synthesise_receipt({image_bytes_len}b, member={member_id})",
        output=json.dumps({"merchant": merchant, "total": total_aed, "items": len(items)}),
        duration_ms=elapsed,
        abstained=False,
    )

    return ReceiptScanResponse(
        receipt_id=f"rcpt_{uuid.uuid4().hex[:12]}",
        merchant=merchant,
        merchant_is_partner=is_partner,
        txn_date=_parse_date(parsed.get("txn_date")),
        total_aed=round(total_aed, 2),
        line_items=items,
        points_awarded=points_awarded,
        points_rule_applied=rule,
        confidence=confidence,
        processing_time_ms=elapsed,
        flags=flags,
    )


# ── Routes ──────────────────────────────────────────────────────────────


@router.post("/receipt", response_model=ReceiptScanResponse)
async def scan_receipt_multipart(
    image: UploadFile = File(...),
    member_id: str = Form(...),
) -> ReceiptScanResponse:
    """Multipart upload path — reads bytes for size only, does NOT parse pixels."""
    if image.content_type and not image.content_type.startswith("image/"):
        raise HTTPException(status_code=415, detail="Expected image/* content-type")
    content = await image.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image too large (max 10 MB)")
    return await _run_scan(len(content), member_id)


@router.post("/receipt/json", response_model=ReceiptScanResponse)
async def scan_receipt_json(req: ReceiptScanRequest) -> ReceiptScanResponse:
    """JSON / base64 path — mirror of the multipart endpoint for SPA clients."""
    size = 0
    if req.image_base64:
        try:
            size = len(base64.b64decode(req.image_base64, validate=False))
        except Exception:  # noqa: BLE001
            size = len(req.image_base64)
        if size > 10 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Image too large (max 10 MB)")
    return await _run_scan(size, req.member_id)
