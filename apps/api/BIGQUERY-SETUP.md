# BigQuery setup — connecting this API to Nexus's warehouse

The API is warehouse-agnostic. DuckDB (bundled demo data) is the default.
BigQuery is a drop-in swap — no router changes, no frontend changes.

## 1. What Nexus needs to provide

We need **one service account** with these roles on the loyalty analytics dataset:

| Role                              | Why                                         |
|-----------------------------------|---------------------------------------------|
| `roles/bigquery.dataViewer`       | SELECT rights on the loyalty tables         |
| `roles/bigquery.jobUser`          | Permission to run query jobs                |
| `roles/bigquery.readSessionUser`  | Optional — faster `to_dataframe()` fetches  |

Plus:

- **GCP project ID** (e.g. `nexus-analytics-prod`)
- **Dataset name** holding the loyalty tables (e.g. `loyalty`)
- **Service-account JSON key** (we store it locked down on the server)

## 2. Expected table schema

Our routers assume three tables exist in the target dataset:

```sql
-- nexus-analytics-prod.loyalty.transactions
transaction_id    STRING
customer_id       STRING
date              DATE
store             STRING         -- partner / branch name
sku_id            STRING
category          STRING
units             INT64
amount            FLOAT64        -- AED
points_earned     INT64
points_redeemed   INT64

-- nexus-analytics-prod.loyalty.customers
customer_id       STRING
name              STRING
gender            STRING         -- nullable
age               INT64          -- nullable
tier              STRING         -- Platinum / Gold / Silver / Bronze
join_date         DATE
city              STRING

-- nexus-analytics-prod.loyalty.skus
sku_id            STRING
category          STRING
subcategory       STRING
brand             STRING
product_name      STRING
base_price        FLOAT64
```

If Nexus's real column names differ, we add a thin **view layer** in their BQ
project that maps the real columns to these names — no code changes on our side.

```sql
-- example mapping view in the Nexus project
CREATE OR REPLACE VIEW `nexus-analytics-prod.loyalty.transactions` AS
SELECT
  txn_id        AS transaction_id,
  member_id     AS customer_id,
  txn_date      AS date,
  branch_name   AS store,
  sku           AS sku_id,
  line_category AS category,
  qty           AS units,
  line_total    AS amount,
  pts_earned    AS points_earned,
  pts_redeemed  AS points_redeemed
FROM `nexus-analytics-prod.raw.fact_txns`;
```

## 3. Go-live (4 env vars, 1 restart)

```bash
# 1. drop the key somewhere safe (0600 perms)
sudo install -m 0600 /path/to/nexus-sa-key.json /etc/citipoints/nexus-sa.json

# 2. set environment
export USE_BIGQUERY=1
export GBQ_PROJECT=nexus-analytics-prod
export GBQ_DATASET=loyalty
export GOOGLE_APPLICATION_CREDENTIALS=/etc/citipoints/nexus-sa.json

# 3. restart the API
cd apps/api && uv run uvicorn citipoints_api.main:app --host 0.0.0.0 --port 8000
```

Verify:

```bash
curl -s http://localhost:8000/ready | jq
# {
#   "status": "ok",
#   "checks": {
#     "api": "ok",
#     "backend": "bigquery",
#     "bigquery": "32,481,903 txns",
#     "customers": "1,203,771",
#     "skus": "18,402"
#   },
#   "version": "0.1.0"
# }
```

## 4. What automatically works after the swap

- **All 8 KPI tiles** — revenue, txns, members, ATV, points, redemption rate, basket
- **Revenue trend** (60-day rolling + Ramadan overlays)
- **Category mix donut, tier distribution, top products**
- **Market Basket Analysis (FP-Growth)** on real transactions
- **RFM segmentation + KMeans silhouette**
- **Churn prediction (XGBoost)** — retrained on Nexus data
- **CLV prediction (BG/NBD + Gamma-Gamma)**
- **Hybrid recommender** (content-based + collaborative)
- **Anomaly detection (STL residuals)** on daily revenue
- **Cohort retention heatmap** from customer join-date
- **AI Chat with SQL audit trail** — generates BigQuery SQL, runs it read-only
- **CxO dashboard** (CEO / CFO / CMO / COO lenses) — all lenses live
- **Time-window selector** (Today / 7d / 30d / 90d / All) with `date_from` filter
- **PDPL compliance strip, IFRS 15 liability, breakage ledger**

## 5. What we do NOT write to BigQuery

The adapter is **read-only**. The API never issues `INSERT / UPDATE / DELETE /
CREATE / DROP` against the Nexus warehouse. That keeps the service-account
scope minimal and the blast radius of any bug = zero writes.

If Nexus wants saved-view / saved-insight persistence, we layer that on a
separate Postgres or DynamoDB in **our** infra, not theirs.

## 6. Rollback

If anything misbehaves after the swap:

```bash
export USE_BIGQUERY=0
# restart — API falls back to the bundled DuckDB demo immediately
```

Zero data loss (nothing gets written to Nexus's BQ anyway).

## 7. Cost envelope

BigQuery pricing for this workload, rule of thumb:

- One cached KPI refresh ≈ 1-10 MB scanned
- One lens flip + window change ≈ 4 cached queries ≈ 40 MB scanned
- One analyst session (50 interactions) ≈ 500 MB - 2 GB scanned
- 10 active users × 50 sessions/day ≈ 10-40 GB/day

At BigQuery's $6.25/TB on-demand pricing: **~$2-8/day**. If Nexus runs this
against flat-rate slots instead, the marginal cost is **zero**.

Our cache (`cache: 'no-store'` on the frontend fetcher is intentional for
freshness — can be switched to 60s SWR if BQ cost ever becomes a concern).

## 8. Troubleshooting

**`google.auth.exceptions.DefaultCredentialsError`**
→ `GOOGLE_APPLICATION_CREDENTIALS` not set or file unreadable. Check perms.

**`403 Request had insufficient authentication scopes`**
→ Service account missing `roles/bigquery.jobUser`. Grant it.

**`404 Not found: Table nexus-analytics-prod:loyalty.transactions`**
→ Either the table doesn't exist in that dataset, or the SA doesn't have
`dataViewer` on it. Check `bq ls nexus-analytics-prod:loyalty` with an
authorised human account first.

**Dashboards empty, API returns 200**
→ The column-name mapping view (section 2) isn't created yet. Run it in
Nexus's BQ console.

**Everything works but one endpoint is slow**
→ Add a BQ partition on `date` and a clustering column on `customer_id`
(one-time DDL in Nexus's project). Typical 10× query-time improvement.
