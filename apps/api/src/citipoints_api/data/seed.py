"""Synthetic data generator — ported from citipoints-dashboard/generate_data.py.

Produces transactions/customers/skus CSVs that match the Nexus/Acme Retail
schema and seeds them into the DuckDB store so the API can query instantly.

Usage:
    uv run python -m citipoints_api.data.seed
    uv run python -m citipoints_api.data.seed --customers 10000 --transactions 200000
"""

from __future__ import annotations

import argparse
import random
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pandas as pd
from faker import Faker

from citipoints_api.config import get_settings
from citipoints_api.data.store import bootstrap_duckdb
from citipoints_api.logging_conf import configure_logging, get_logger

DATE_START = datetime(2025, 4, 1)
DATE_END = datetime(2026, 3, 31)

STORES: tuple[tuple[str, float], ...] = (
    ("Dubai Marina", 0.18),
    ("Downtown Dubai", 0.15),
    ("JBR Walk", 0.12),
    ("Business Bay", 0.11),
    ("Deira City Centre", 0.10),
    ("Abu Dhabi Mall", 0.09),
    ("Sharjah City Centre", 0.08),
    ("Al Ain Gateway", 0.07),
    ("Muscat Avenues", 0.05),
    ("Doha Festival City", 0.05),
)

TIER_WEIGHTS: dict[str, float] = {"Platinum": 0.05, "Gold": 0.15, "Silver": 0.30, "Bronze": 0.50}
TIER_FREQ: dict[str, int] = {"Platinum": 120, "Gold": 72, "Silver": 36, "Bronze": 18}
TIER_BASKET_MULT: dict[str, float] = {
    "Platinum": 1.5,
    "Gold": 1.3,
    "Silver": 1.1,
    "Bronze": 1.0,
}

CITIES: tuple[tuple[str, float], ...] = (
    ("Dubai", 0.40),
    ("Abu Dhabi", 0.20),
    ("Sharjah", 0.15),
    ("Al Ain", 0.08),
    ("Muscat", 0.10),
    ("Doha", 0.07),
)


@dataclass(frozen=True)
class SubCatalog:
    brands: tuple[str, ...]
    price_lo: float
    price_hi: float
    skus_per_brand: int


CATALOG: dict[str, dict[str, SubCatalog]] = {
    "Fresh Food": {
        "Fruits & Vegetables": SubCatalog(("Al Ain Fresh", "Barakat", "Local Farm", "Desert Bloom"), 5, 45, 4),
        "Dairy & Eggs": SubCatalog(("Al Rawabi", "Al Ain Dairy", "Almarai", "Nada"), 3, 35, 5),
        "Meat & Poultry": SubCatalog(("Al Kabeer", "Sadia", "Americana", "Farm Fresh"), 15, 120, 4),
        "Bakery": SubCatalog(("Modern Bakery", "Al Jadeed", "Sunbulah", "Sara Lee"), 3, 25, 3),
    },
    "Beverages": {
        "Water & Juices": SubCatalog(("Masafi", "Al Ain Water", "Mai Dubai", "Oasis"), 1, 20, 4),
        "Soft Drinks": SubCatalog(("Coca-Cola", "Pepsi", "Fanta", "Sprite"), 2, 15, 4),
        "Tea & Coffee": SubCatalog(("Lipton", "Nescafe", "Dilmah", "Brooke Bond"), 8, 55, 3),
        "Energy Drinks": SubCatalog(("Red Bull", "Monster", "Power Horse", "Sting"), 5, 20, 3),
    },
    "Household": {
        "Cleaning": SubCatalog(("Dettol", "Clorox", "Mr. Clean", "Harpic"), 5, 40, 3),
        "Paper Products": SubCatalog(("Fine", "Kleenex", "Familia", "Lulu White"), 5, 35, 3),
        "Kitchen": SubCatalog(("Glad", "Bayroute", "Home Pro", "Al Bayader"), 5, 30, 3),
        "Laundry": SubCatalog(("Tide", "OMO", "Persil", "Ariel"), 10, 60, 3),
    },
    "Personal Care": {
        "Skin Care": SubCatalog(("Nivea", "Vaseline", "Dove", "Neutrogena"), 10, 80, 4),
        "Hair Care": SubCatalog(("Pantene", "Head & Shoulders", "TRESemme", "Sunsilk"), 10, 55, 3),
        "Oral Care": SubCatalog(("Colgate", "Oral-B", "Sensodyne", "Closeup"), 5, 30, 3),
        "Body Care": SubCatalog(("Lux", "Dove", "Dettol", "Palmolive"), 5, 35, 3),
    },
}


def _weighted_choice(pairs: tuple[tuple[str, float], ...]) -> str:
    items, weights = zip(*pairs, strict=True)
    return random.choices(items, weights=weights, k=1)[0]


def build_sku_catalog() -> pd.DataFrame:
    """Build flat SKU table from the nested catalog."""
    rows: list[dict[str, object]] = []
    sku_id = 1000
    for category, subs in CATALOG.items():
        for sub_name, info in subs.items():
            for brand in info.brands:
                for idx in range(info.skus_per_brand):
                    price = round(random.uniform(info.price_lo, info.price_hi), 2)
                    rows.append(
                        {
                            "sku_id": f"SKU-{sku_id}",
                            "category": category,
                            "subcategory": sub_name,
                            "brand": brand,
                            "product_name": f"{brand} {sub_name.split('&')[0].strip()} #{idx + 1}",
                            "base_price": price,
                        },
                    )
                    sku_id += 1
    return pd.DataFrame(rows)


def build_customers(n: int, fake: Faker) -> pd.DataFrame:
    tiers: list[str] = []
    for tier, share in TIER_WEIGHTS.items():
        tiers.extend([tier] * int(n * share))
    while len(tiers) < n:
        tiers.append("Bronze")
    random.shuffle(tiers)

    rows: list[dict[str, object]] = []
    for idx in range(n):
        rows.append(
            {
                "customer_id": f"CUST-{10000 + idx}",
                "name": fake.name(),
                "gender": random.choice(["M", "F"]),
                "age": random.randint(18, 70),
                "tier": tiers[idx],
                "join_date": fake.date_between(start_date=datetime(2020, 1, 1), end_date=DATE_END),
                "city": _weighted_choice(CITIES),
            },
        )
    return pd.DataFrame(rows)


def _build_common_baskets(skus: pd.DataFrame) -> list[list[str]]:
    baskets: list[list[str]] = []
    cats = skus.groupby("category")["sku_id"].apply(list).to_dict()
    for sku_list in cats.values():
        if len(sku_list) >= 3:
            for _ in range(5):
                baskets.append(random.sample(sku_list, 3))
    fresh = cats.get("Fresh Food", [])
    beverages = cats.get("Beverages", [])
    household = cats.get("Household", [])
    care = cats.get("Personal Care", [])
    for _ in range(8):
        if len(fresh) >= 2 and len(beverages) >= 1:
            baskets.append(random.sample(fresh, 2) + random.sample(beverages, 1))
        if len(household) >= 1 and len(care) >= 2:
            baskets.append(random.sample(household, 1) + random.sample(care, 2))
    return baskets


def build_transactions(customers: pd.DataFrame, skus: pd.DataFrame, n: int) -> pd.DataFrame:
    sku_list = skus["sku_id"].tolist()
    sku_prices = dict(zip(skus["sku_id"], skus["base_price"], strict=True))
    sku_cats = dict(zip(skus["sku_id"], skus["category"], strict=True))
    cust_ids = customers["customer_id"].tolist()
    cust_tiers = dict(zip(customers["customer_id"], customers["tier"], strict=True))

    common_baskets = _build_common_baskets(skus)
    days_range = (DATE_END - DATE_START).days

    rows: list[dict[str, object]] = []
    txn_id = 100_000
    for _ in range(n):
        cust = random.choice(cust_ids)
        tier = cust_tiers[cust]
        txn_date = DATE_START + timedelta(days=random.randint(0, days_range))
        base_basket = random.randint(3, 12) if txn_date.weekday() >= 4 else random.randint(1, 8)
        basket_size = max(1, int(base_basket * TIER_BASKET_MULT[tier]))

        if common_baskets and random.random() < 0.40:
            skus_in_basket = list(random.choice(common_baskets))
            remaining = basket_size - len(skus_in_basket)
            if remaining > 0:
                skus_in_basket += random.sample(sku_list, min(remaining, len(sku_list)))
        else:
            skus_in_basket = random.sample(sku_list, min(basket_size, len(sku_list)))

        store = _weighted_choice(STORES)
        for sku in skus_in_basket:
            units = random.choices([1, 2, 3, 4], weights=[0.55, 0.25, 0.12, 0.08], k=1)[0]
            price = sku_prices[sku] * random.uniform(0.85, 1.15)
            amount = round(price * units, 2)
            points_earned = int(amount * random.uniform(0.5, 2.0))
            redeemed = int(points_earned * 0.3) if random.random() < 0.15 else 0

            rows.append(
                {
                    "transaction_id": f"TXN-{txn_id}",
                    "customer_id": cust,
                    "date": txn_date.date().isoformat(),
                    "store": store,
                    "sku_id": sku,
                    "category": sku_cats[sku],
                    "units": units,
                    "amount": amount,
                    "points_earned": points_earned,
                    "points_redeemed": redeemed,
                },
            )
        txn_id += 1

    return pd.DataFrame(rows)


def run(customers_n: int, transactions_n: int, data_dir: Path, seed: int) -> dict[str, int]:
    logger = get_logger(__name__)
    random.seed(seed)
    np.random.seed(seed)
    Faker.seed(seed)
    fake = Faker()

    data_dir.mkdir(parents=True, exist_ok=True)
    logger.info("seed.start", customers=customers_n, transactions=transactions_n, dir=str(data_dir))

    skus = build_sku_catalog()
    skus.to_csv(data_dir / "skus.csv", index=False)

    customers = build_customers(customers_n, fake)
    customers.to_csv(data_dir / "customers.csv", index=False)

    txns = build_transactions(customers, skus, transactions_n)
    txns.to_csv(data_dir / "transactions.csv", index=False)

    logger.info(
        "seed.complete",
        skus=len(skus),
        customers=len(customers),
        transactions=len(txns),
    )
    return {"skus": len(skus), "customers": len(customers), "transactions": len(txns)}


def main() -> None:
    configure_logging("INFO")
    parser = argparse.ArgumentParser(description="Generate synthetic Nexus/Acme Retail data.")
    parser.add_argument("--customers", type=int, default=5000)
    parser.add_argument("--transactions", type=int, default=80_000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--skip-duckdb", action="store_true", help="Write CSVs only")
    args = parser.parse_args()

    settings = get_settings()
    counts = run(args.customers, args.transactions, settings.data_dir, args.seed)

    if not args.skip_duckdb:
        bootstrap_duckdb(settings.duckdb_path, settings.data_dir)
        get_logger(__name__).info("seed.duckdb_loaded", path=str(settings.duckdb_path))

    print(
        f"✅ seeded {counts['transactions']:,} transactions / "
        f"{counts['customers']:,} customers / {counts['skus']} SKUs → {settings.data_dir}",
    )


if __name__ == "__main__":
    main()
