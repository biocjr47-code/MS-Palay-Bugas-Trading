"""Business rules for the rice trading business (milling is done by an outside rice miller). Pure functions over DataFrames, no Streamlit."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

import pandas as pd

PH_TZ = timezone(timedelta(hours=8))  # Philippines, no daylight saving

SACK_KG = 50.0             # one sako of bigas
DEFAULT_RECOVERY = 0.62    # bigas received / palay sent, used until milling data exists
RECOVERY_RANGE = (60.0, 65.0)

# Only bigas comes back from the rice miller; the miller keeps the by-products.
PRODUCTS = ("Bigas",)
MILLING_COLUMN = {"Bigas": "rice_kg"}
PRODUCT_LABEL = {"Bigas": "Bigas (milled rice)"}
EXPENSE_CATEGORIES = (
    "Electricity",
    "Diesel & fuel",
    "Repairs & maintenance",
    "Sacks & packaging",
    "Hauling & transport",
    "Rent",
    "Permits & taxes",
    "Food & snacks for crew",
    "Miscellaneous",
)
PAY_BASES = ("Daily", "Per sack", "Per kg")
PAY_UNIT = {"Daily": "days", "Per sack": "sacks", "Per kg": "kg"}


def today() -> date:
    return datetime.now(PH_TZ).date()


def _sum(df: pd.DataFrame, col: str) -> float:
    if df.empty or col not in df.columns:
        return 0.0
    return float(pd.to_numeric(df[col], errors="coerce").fillna(0).sum())


def _upto(df: pd.DataFrame, end: date | None) -> pd.DataFrame:
    if end is None or df.empty:
        return df
    return df[df["date"] <= end]


def between(df: pd.DataFrame, start: date, end: date) -> pd.DataFrame:
    if df.empty:
        return df
    return df[(df["date"] >= start) & (df["date"] <= end)]


# ---------- Inventory ----------

def avg_palay_cost(purchases: pd.DataFrame, end: date | None = None) -> float:
    p = _upto(purchases, end)
    kg = _sum(p, "net_kg")
    return _sum(p, "total_cost") / kg if kg else 0.0


def recovery_rate(milling: pd.DataFrame, end: date | None = None) -> float:
    m = _upto(milling, end)
    palay = _sum(m, "palay_kg")
    if not palay:
        return DEFAULT_RECOVERY
    return _sum(m, "rice_kg") / palay


def avg_milling_cost(milling: pd.DataFrame, end: date | None = None) -> float:
    """Miller's fee plus transportation, per kilo of palay milled, averaged over all trips."""
    m = _upto(milling, end)
    kg = _sum(m, "palay_kg")
    return (_sum(m, "milling_fee") + _sum(m, "transport_fee")) / kg if kg else 0.0


def rice_unit_cost(purchases: pd.DataFrame, milling: pd.DataFrame, end: date | None = None) -> float:
    """Cost of one kilo of bigas = (palay cost + miller's fee + transport, per kilo of palay) / recovery."""
    rec = recovery_rate(milling, end)
    return (avg_palay_cost(purchases, end) + avg_milling_cost(milling, end)) / rec if rec else 0.0


def palay_stock(purchases: pd.DataFrame, milling: pd.DataFrame) -> dict[str, float]:
    """Palay still in the warehouse: bought minus sent to the miller, in kilos and sacks."""
    return {
        "kg": _sum(purchases, "net_kg") - _sum(milling, "palay_kg"),
        "sacks": _sum(purchases, "sacks") - _sum(milling, "sacks"),
    }


def product_stock(milling: pd.DataFrame, sales: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for product in PRODUCTS:
        produced = _sum(milling, MILLING_COLUMN[product])
        sold = _sum(sales[sales["product"] == product], "qty_kg") if not sales.empty else 0.0
        rows.append({"product": product, "produced_kg": produced, "sold_kg": sold, "on_hand_kg": produced - sold})
    return pd.DataFrame(rows)


# ---------- Profit ----------

def cost_of_sales(sales: pd.DataFrame, unit_cost: float) -> float:
    if sales.empty:
        return 0.0
    return _sum(sales[sales["product"].isin(PRODUCTS)], "qty_kg") * unit_cost


def pnl(data: dict[str, pd.DataFrame], start: date, end: date) -> dict:
    sales = between(data["sales"], start, end)
    expenses = between(data["expenses"], start, end)
    labor = between(data["labor_logs"], start, end)
    unit_cost = rice_unit_cost(data["palay_purchases"], data["milling_runs"], end)
    recovery = recovery_rate(data["milling_runs"], end)

    revenue = _sum(sales, "total")
    cogs = cost_of_sales(sales, unit_cost)
    overhead = _sum(expenses, "amount")
    payroll = _sum(labor, "amount")
    gross = revenue - cogs
    net = gross - overhead - payroll
    by_product = sales.groupby("product")["total"].sum() if not sales.empty else pd.Series(dtype=float)
    by_category = expenses.groupby("category")["amount"].sum() if not expenses.empty else pd.Series(dtype=float)
    return {
        "revenue": revenue,
        "cogs": cogs,
        "gross": gross,
        "overhead": overhead,
        "payroll": payroll,
        "net": net,
        "margin": net / revenue if revenue else 0.0,
        "unit_cost": unit_cost,
        "palay_cost_per_kg": avg_palay_cost(data["palay_purchases"], end),
        "milling_per_kg": avg_milling_cost(data["milling_runs"], end),
        "recovery": recovery,
        "by_product": by_product.sort_values(ascending=False),
        "by_category": by_category.sort_values(ascending=False),
    }


def daily_net(data: dict[str, pd.DataFrame], start: date, end: date) -> pd.DataFrame:
    unit_cost = rice_unit_cost(data["palay_purchases"], data["milling_runs"], end)
    days = pd.date_range(start, end, freq="D").date
    out = pd.DataFrame({"date": days})

    def per_day(df: pd.DataFrame, value) -> pd.Series:
        df = between(df, start, end)
        if df.empty:
            return pd.Series(0.0, index=days)
        return value(df).groupby(df["date"]).sum().reindex(days, fill_value=0.0)

    sales = data["sales"]
    rice_mask = lambda d: d["product"].isin(PRODUCTS)
    revenue = per_day(sales, lambda d: d["total"].astype(float))
    cogs = per_day(sales, lambda d: d["qty_kg"].astype(float).where(rice_mask(d), 0.0) * unit_cost)
    overhead = per_day(data["expenses"], lambda d: d["amount"].astype(float))
    payroll = per_day(data["labor_logs"], lambda d: d["amount"].astype(float))
    out["revenue"] = revenue.values
    out["costs"] = (cogs + overhead + payroll).values
    out["net"] = out["revenue"] - out["costs"]
    return out


# ---------- Cash ----------

def cash_position(data: dict[str, pd.DataFrame]) -> dict:
    owners = data["owner_transactions"]
    capital = _sum(owners[owners["kind"] == "Capital in"], "amount") if not owners.empty else 0.0
    drawings = _sum(owners[owners["kind"] == "Drawing"], "amount") if not owners.empty else 0.0
    labor = data["labor_logs"]
    wages_paid = _sum(labor[labor["paid"]], "amount") if not labor.empty else 0.0
    wages_due = _sum(labor[~labor["paid"]], "amount") if not labor.empty else 0.0

    cash_in = _sum(data["sales"], "amount_paid") + capital
    cash_out = (_sum(data["palay_purchases"], "amount_paid") + _sum(data["milling_runs"], "milling_fee")
                + _sum(data["milling_runs"], "transport_fee")
                + _sum(data["expenses"], "amount") + wages_paid + drawings)
    return {
        "cash_on_hand": cash_in - cash_out,
        "receivables": _sum(data["sales"], "total") - _sum(data["sales"], "amount_paid"),
        "farmer_payables": _sum(data["palay_purchases"], "total_cost") - _sum(data["palay_purchases"], "amount_paid"),
        "wages_due": wages_due,
        "capital": capital,
        "drawings": drawings,
    }


def week_bounds(d: date) -> tuple[date, date]:
    """Payroll week: Monday to Sunday."""
    start = d - timedelta(days=d.weekday())
    return start, start + timedelta(days=6)
