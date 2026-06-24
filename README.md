# CITI Points v2 — Power BI Alternative for Nexus · Acme Retail

> Reporting is table stakes. This is what you get **on top of it**.

CITI Points v2 replaces a Power BI loyalty dashboard with a production-grade, ML-augmented
analytics app: Next.js 15 on the front, FastAPI + DuckDB + XGBoost + BG/NBD + FP-Growth on
the back, and the Claude Code CLI powering an auditable natural-language chat layer.

## 30-second pitch

> "Power BI shows charts. Loyalty teams need insights + actions. v2 ships the reporting
> you already have, plus five analytical models every page opens with a plain-English
> takeaway — and an AI chat that shows the SQL it would have run so you can audit every
> answer. Day one with real credentials, it swaps from synthetic data to BigQuery without
> a frontend change."

## What Extra I Bring — analytical model layer (60% of effort)

| Layer | What it does | Business takeaway |
|---|---|---|
| **Market Basket Analysis (FP-Growth)** | Mines association rules across transactions with live support/confidence controls | Anchor any SKU → ranked companions + ready-to-send campaign brief |
| **Basket → Campaign bridge** | Clicks on a rule auto-generate a marketing ops brief | Closes the "insight → action" gap Power BI leaves open |
| **Customer Segmentation (RFM + KMeans)** | Persona assignment + silhouette score for honesty | Each persona mapped to an offer type, not a colour |
| **Tier migration matrix** | Quartile-based approximation of movement between tiers | See who's accelerating and who's regressing in one grid |
| **Churn prediction (XGBoost)** | Probability per customer with feature importances | "Act Now" list ranked by urgency × CLV |
| **CLV prediction (BG/NBD + Gamma-Gamma)** | Non-contractual LTV over a 12-month horizon | Mean/median/total projected revenue with tiering |
| **Hybrid recommender** | Content-based + collaborative (from basket rules) + cold-start fallback | Every recommendation ships with a "why this?" reason |
| **Next-Best-Action engine** | Rule + model hybrid per customer | Single action string + rationale + expected AED uplift |
| **Anomaly detection (STL residuals)** | Decomposes revenue into trend + 7-day seasonality | Days whose residual exceeds 2.5σ are flagged with reason |
| **Cohort retention heatmap** | Monthly signup cohorts × active rate | Spot cohorts that fall off a cliff in month 1 vs 3 |
| **AI Chat (Claude Code CLI)** | RAG over pre-computed data snapshot | Every answer has a "hypothetical SQL" audit trail — trust *and* verify |

## Reporting layer (40% — table-stakes coverage)

- 8 KPI tiles with WoW deltas + sparklines (Revenue, Transactions, Active Members, Avg Basket, Points Earned, Points Redeemed, Redemption Rate, Avg Units/Txn)
- URL-persisted filters (store / category / tier / date range) with chip-style applied state
- Revenue trend (area), category mix (donut), store performance (horizontal bar), tier distribution (grouped bar)
- Top-10 products table with brand + category
- Auto-generated "Insight Strip" at the top of every page — plain-English takeaways, not just charts

## Architecture

```
┌─────────────────────────┐        ┌───────────────────────────┐
│  Next.js 15 (App Router)│  HTTP  │  FastAPI + DuckDB          │
│  TanStack Query · shad- │ ─────▶ │  Pandas · scikit-learn     │
│  cn · Tremor/Recharts   │        │  XGBoost · lifetimes       │
│  next-themes · next-intl│ ◀───── │  mlxtend · statsmodels     │
└─────────┬───────────────┘        └──────────────┬────────────┘
          │  browser                             │
          ▼                                      ▼
   Vercel edge (preview)             Fly.io container (region: fra)
                                                 │
                                                 ▼
                                     ┌─────────────────────────┐
                                     │  Claude Code CLI         │
                                     │  (subprocess, --print)   │
                                     └─────────────────────────┘
```

Data path: `generate_data.py → CSV → DuckDB → FastAPI → Next.js`. Flip `USE_BIGQUERY=true`
and the exact same queries target a Acme Retail loyalty warehouse — swap is one env var.

## Local setup (3 commands)

```bash
# 1. Install once
pnpm install
uv sync --project apps/api --extra dev

# 2. Seed synthetic Nexus/Acme Retail data
pnpm --filter api seed

# 3. Boot both apps together
./scripts/dev.sh        # api on :8000, web on :3000
```

Open http://localhost:3000 (web) or http://localhost:8000/docs (API). Apple Silicon macOS + Linux supported; Windows via WSL2.

## Environment

The API reads a `.env` in `apps/api/` (copy `.env.example`). The web app reads
`NEXT_PUBLIC_API_BASE` from `apps/web/.env.local`. Default values work out of the box; see
both `.env.example` files for production-grade overrides.

## Deploy

### Frontend — Vercel

```bash
cd apps/web
vercel  # links project; Vercel auto-detects Next.js 15
```

Environment variables on Vercel:
- `NEXT_PUBLIC_API_BASE = https://citipoints-api.fly.dev`

### Backend — Fly.io

```bash
cd apps/api
fly launch --copy-config --no-deploy  # if first time
fly deploy
```

The bundled `fly.toml` ships a persistent 10 GB volume for the DuckDB file and a
health-check against `/ready`.

## Risks & Assumptions

The MVP is built against synthetic data generated by a schema-compatible seeder. The
following are flagged up front (senior thinking always acknowledges risk):

- **Schema assumption:** `apps/api/src/citipoints_api/data/seed.py` models `transactions`,
  `customers`, `skus` with columns that mirror a typical loyalty warehouse. On real
  access, field names/types will be re-mapped — the FastAPI data layer is the only module
  that should change.
- **FP-Growth tuning:** The default `min_support=0.02 / min_confidence=0.3` is tuned on
  the synthetic basket. On real Acme Retail data, these thresholds will need calibration;
  the UI exposes both as live sliders for that reason.
- **Churn model calibration:** 80-92% accuracy is realistic for retail churn with 6-12
  months of real history. On synthetic data the XGBoost AUC is shown honestly — treat it
  as a shape-of-solution proof, not a production score.
- **CLV model assumptions:** BG/NBD assumes a non-contractual purchase setting. Nexus
  grocery loyalty fits the assumption (customers shop when they want, not on contract).
  Gamma-Gamma assumes the frequency-monetary decoupling; this has been validated on
  grocery scanner data in the retail-analytics literature.
- **AI Chat hallucinations:** The Claude Code CLI is grounded on a pre-computed JSON
  context (schema + KPIs + segments + basket rules) — not on live SQL execution. Every
  reply exposes a "hypothetical SQL" audit trail and the user can re-run it at will. If
  the CLI is unreachable, a deterministic fallback response is returned.
- **UAE PDPL compliance:** The MVP uses synthetic data only. Production will need data
  minimisation, consent-tracked user records, and PDPL-compliant retention — scoped as
  Phase 12, out of scope for this MVP.
- **Bundle size growth:** Recharts + Radix primitives keep the bundle under 200 KB per
  route gzipped. The shadcn pattern of inlining primitives avoids the `@mui/material`
  class of bloat.

## Tech stack at a glance

- **Frontend:** Next.js 15 · React 19 · TypeScript strict · Tailwind CSS · shadcn patterns · Recharts · TanStack Query · next-themes · next-intl (EN default, AR scaffold)
- **Backend:** FastAPI · Pydantic v2 · DuckDB · Pandas · Polars · structlog · orjson
- **ML:** scikit-learn · XGBoost · lifetimes (BG/NBD) · mlxtend (FP-Growth) · SHAP · statsmodels (STL)
- **AI Chat:** Claude Code CLI subprocess (no Anthropic API key required)
- **Quality:** Ruff · mypy · Pytest · Biome · Vitest · Playwright (scaffold)
- **Deploy:** Vercel (frontend) · Fly.io (backend Docker)

## What's next if hired Monday

1. Connect Nexus / Acme Retail BigQuery — flip `USE_BIGQUERY=true`
2. Re-tune FP-Growth support/confidence on 12 months of real transactions
3. Retrain XGBoost churn with real labels (~6 months of history)
4. Run BG/NBD on real transaction cadence; verify non-contractual assumption holds
5. Add UAE PDPL consent layer + audit log
6. Wire Uplift / CausalML A/B test viewer for actual campaigns
7. Point-liability-aging dashboard + breakage forecast (loyalty-specific, the big Power BI gap)

## Author

Gopal Bagaswar · AI Engineer (transitioning from Senior Data Analyst) · Dubai-ready.
Email: gopalbagaswar7@gmail.com · LinkedIn: /in/gopalbagaswar
