"""Storage layer.

Supabase is the real backend. When no Supabase secrets are configured the app
falls back to an in-memory demo store (seeded with sample data) so the screens
can be tried out; nothing in demo mode is saved.
"""
from __future__ import annotations

import pandas as pd
import streamlit as st

TABLES = (
    "palay_purchases",
    "milling_runs",
    "sales",
    "laborers",
    "labor_logs",
    "expenses",
    "owner_transactions",
)

_PAGE = 1000  # Supabase returns at most 1000 rows per request

# Columns each screen relies on, so an empty table still has a usable shape.
COLUMNS = {
    "palay_purchases": ["id", "date", "farmer", "barangay", "variety", "sacks", "gross_kg", "moisture_pct",
                        "net_kg", "price_per_kg", "total_cost", "amount_paid", "notes"],
    "milling_runs": ["id", "date", "miller", "variety", "sacks", "palay_kg", "rice_kg", "binlid_kg", "darak_kg",
                     "ipa_kg", "recovery_pct", "fee_per_kg", "fee_per_sack", "milling_fee", "transport_per_sack",
                     "transport_fee", "operator", "notes"],
    "sales": ["id", "date", "customer", "product", "qty_kg", "price_per_kg", "total", "amount_paid", "notes"],
    "laborers": ["id", "name", "role", "pay_basis", "rate", "active"],
    "labor_logs": ["id", "date", "laborer_id", "laborer_name", "pay_basis", "quantity", "rate", "amount",
                   "task", "paid", "paid_date"],
    "expenses": ["id", "date", "category", "description", "payee", "amount"],
    "owner_transactions": ["id", "date", "owner", "kind", "amount", "notes"],
}
NUMERIC = {"sacks", "gross_kg", "moisture_pct", "net_kg", "price_per_kg", "total_cost", "amount_paid",
           "palay_kg", "rice_kg", "binlid_kg", "darak_kg", "ipa_kg", "recovery_pct", "fee_per_kg", "fee_per_sack", "milling_fee",
           "transport_per_sack", "transport_fee", "qty_kg", "total",
           "rate", "quantity", "amount"}


def _secrets_section(name: str) -> dict:
    try:
        return dict(st.secrets.get(name, {}))
    except Exception:  # no secrets.toml at all
        return {}


def is_demo() -> bool:
    cfg = _secrets_section("supabase")
    return not (cfg.get("url") and cfg.get("key"))


@st.cache_resource(show_spinner=False)
def _client():
    from supabase import create_client

    cfg = _secrets_section("supabase")
    return create_client(cfg["url"], cfg["key"])


@st.cache_data(ttl=120, show_spinner=False)
def _fetch(table: str) -> list[dict]:
    rows: list[dict] = []
    start = 0
    while True:
        res = _client().table(table).select("*").order("id").range(start, start + _PAGE - 1).execute()
        rows.extend(res.data)
        if len(res.data) < _PAGE:
            return rows
        start += _PAGE


def _demo_tables() -> dict[str, list[dict]]:
    if "demo_tables" not in st.session_state:
        from lib.demo import seed

        st.session_state.demo_tables = seed()
    return st.session_state.demo_tables


def _clean(row: dict) -> dict:
    """Make values JSON-safe for Supabase (dates to ISO strings, numpy to float)."""
    out = {}
    for k, v in row.items():
        if hasattr(v, "isoformat"):
            v = v.isoformat()
        elif hasattr(v, "item"):
            v = v.item()
        out[k] = v
    return out


def rows(table: str) -> pd.DataFrame:
    data = _demo_tables()[table] if is_demo() else _fetch(table)
    df = pd.DataFrame(data)
    for col in COLUMNS[table] + ["created_by"]:
        if col not in df.columns:
            df[col] = pd.Series(dtype=object)
    for col in NUMERIC & set(df.columns):
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)
    if "date" in df.columns and not df.empty:
        df["date"] = pd.to_datetime(df["date"]).dt.date
    if "paid_date" in df.columns and not df.empty:
        df["paid_date"] = pd.to_datetime(df["paid_date"]).dt.date
    for col in ("paid", "active"):
        if col in df.columns:
            df[col] = df[col].fillna(False).astype(bool)
    return df


def load_all() -> dict[str, pd.DataFrame]:
    return {t: rows(t) for t in TABLES}


def insert(table: str, row: dict) -> None:
    from lib.auth import current_user  # late import: auth depends on this module

    user = current_user()
    row = _clean({**row, "created_by": user["username"] if user else None})
    if is_demo():
        tbl = _demo_tables()[table]
        row["id"] = max((r["id"] for r in tbl), default=0) + 1
        tbl.append(row)
        return
    try:
        _client().table(table).insert(row).execute()
    except Exception as exc:
        # Database not yet updated with the created_by column (schema.sql not re-run): save without it.
        if "created_by" not in str(exc):
            raise
        row.pop("created_by")
        _client().table(table).insert(row).execute()
    _fetch.clear()


def update(table: str, row_id: int, values: dict) -> None:
    values = _clean(values)
    if is_demo():
        for r in _demo_tables()[table]:
            if r["id"] == row_id:
                r.update(values)
        return
    _client().table(table).update(values).eq("id", row_id).execute()
    _fetch.clear()


def update_many(table: str, row_ids: list[int], values: dict) -> None:
    if not row_ids:
        return
    values = _clean(values)
    if is_demo():
        ids = set(row_ids)
        for r in _demo_tables()[table]:
            if r["id"] in ids:
                r.update(values)
        return
    _client().table(table).update(values).in_("id", [int(i) for i in row_ids]).execute()
    _fetch.clear()


def delete(table: str, row_id: int) -> None:
    if is_demo():
        tbl = _demo_tables()[table]
        tbl[:] = [r for r in tbl if r["id"] != row_id]
        return
    _client().table(table).delete().eq("id", row_id).execute()
    _fetch.clear()


def check_connection() -> str | None:
    """Return an error message if Supabase is configured but unreachable or missing tables."""
    if is_demo():
        return None
    try:
        _fetch("laborers")
    except Exception as exc:  # network, bad key, or schema not created yet
        return str(exc)
    return None
