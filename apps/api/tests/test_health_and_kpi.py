"""Smoke tests for the core endpoints that power the Home page."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from citipoints_api.main import create_app


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(create_app())


def test_health(client: TestClient) -> None:
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_ready(client: TestClient) -> None:
    res = client.get("/ready")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert "duckdb" in body["checks"]


def test_kpi_shape(client: TestClient) -> None:
    res = client.get("/api/v1/kpi")
    assert res.status_code == 200
    body = res.json()
    ids = [tile["id"] for tile in body["tiles"]]
    assert set(ids) >= {
        "revenue",
        "transactions",
        "active_members",
        "avg_basket",
        "points_earned",
        "points_redeemed",
        "redemption_rate",
        "avg_units_per_txn",
    }
    for tile in body["tiles"]:
        assert "value_display" in tile
        assert "trend" in tile


def test_overview_endpoints(client: TestClient) -> None:
    for path in (
        "/api/v1/overview/revenue-trend",
        "/api/v1/overview/category-mix",
        "/api/v1/overview/store-performance",
        "/api/v1/overview/tier-distribution",
        "/api/v1/overview/top-products?limit=5",
    ):
        res = client.get(path)
        assert res.status_code == 200, path


def test_insights_home(client: TestClient) -> None:
    res = client.get("/api/v1/insights/home")
    assert res.status_code == 200
    body = res.json()
    assert body["page"] == "home"
    assert isinstance(body["insights"], list)


def test_market_basket_rules(client: TestClient) -> None:
    res = client.get("/api/v1/market-basket/rules?min_support=0.01&min_confidence=0.1&limit=5")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)


def test_chat_fallback(client: TestClient) -> None:
    """CLI path is forced to /bin/false so the endpoint must degrade gracefully."""
    res = client.post(
        "/api/v1/chat",
        json={"question": "How is revenue this week?", "history": []},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["question"] == "How is revenue this week?"
    assert body["answer"]
