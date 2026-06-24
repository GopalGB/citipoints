# citipoints-api

FastAPI analytics service for CITI Points v2. Serves KPIs, ML model outputs, and the RAG-powered AI Chat endpoint over HTTP.

## Quickstart

```bash
uv sync --extra dev
uv run python -m citipoints_api.data.seed      # generate synthetic data + load into DuckDB
uv run uvicorn citipoints_api.main:app --reload
```

API docs: http://localhost:8000/docs

## Environment

| Var | Default | Purpose |
|---|---|---|
| `USE_BIGQUERY` | `false` | Toggle between DuckDB (demo) and BigQuery (prod) |
| `DATA_DIR` | `./data` | CSV / DuckDB location |
| `GBQ_PROJECT` | — | BigQuery project id (if `USE_BIGQUERY=true`) |
| `GBQ_DATASET` | `loyalty_analytics` | BigQuery dataset |
| `CLAUDE_CLI_PATH` | `claude` | Path to the Claude Code CLI binary for AI Chat |
| `CLAUDE_CLI_MODEL` | `claude-sonnet-4-5` | Model for AI Chat responses |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated list of allowed origins |

## Endpoints (overview)

| Path | Purpose |
|---|---|
| `GET /health` | Liveness |
| `GET /ready` | Readiness (checks DuckDB + seed) |
| `GET /api/v1/kpi` | 8 headline KPIs with WoW deltas + sparkline series |
| `GET /api/v1/overview/revenue-trend` | Daily revenue area chart |
| `GET /api/v1/overview/category-mix` | Revenue by category |
| `GET /api/v1/overview/store-performance` | Revenue by store |
| `GET /api/v1/overview/tier-distribution` | Members + revenue by tier |
| `GET /api/v1/overview/top-products` | Top N products by revenue |
| `GET /api/v1/insights/home` | Auto-generated insights for Home page |
| `GET /api/v1/market-basket/rules` | FP-Growth association rules |
| `GET /api/v1/market-basket/bundles/{anchor_sku}` | Bundle Builder |
| `GET /api/v1/segments/rfm` | RFM segmentation |
| `GET /api/v1/segments/clusters` | KMeans customer clusters |
| `GET /api/v1/segments/tier-migration` | Sankey source data |
| `GET /api/v1/predictive/churn` | Churn scores per customer |
| `GET /api/v1/predictive/clv` | CLV predictions |
| `GET /api/v1/predictive/act-now` | Top-50 at-risk + high-CLV list |
| `GET /api/v1/recommendations/{customer_id}` | Hybrid recommendations |
| `POST /api/v1/chat` | RAG AI Chat (shells out to `claude` CLI) |
| `GET /api/v1/nba/{customer_id}` | Next-best-action suggestion |
| `GET /api/v1/cohort/retention` | Cohort retention heatmap |
| `GET /api/v1/anomaly/daily-revenue` | STL anomaly detection |

All query endpoints accept: `store`, `category`, `tier`, `date_from`, `date_to`.
