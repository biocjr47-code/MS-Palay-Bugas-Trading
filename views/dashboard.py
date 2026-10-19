from datetime import datetime, timedelta
from pathlib import Path

import pandas as pd
import streamlit as st

from lib import auth, calc, db, ui

data = db.load_all()
today = calc.today()
owner = auth.is_owner()
user = auth.current_user()
hour = datetime.now(calc.PH_TZ).hour
greeting = "Good morning" if hour < 12 else "Good afternoon" if hour < 18 else "Good evening"
who = "Marvie & Salome" if db.is_demo() else user["name"].split()[0]

stock = calc.product_stock(data["milling_runs"], data["sales"]).set_index("product")["on_hand_kg"]
palay = calc.palay_stock(data["palay_purchases"], data["milling_runs"])
bigas_kg = float(stock.get("Bigas", 0))
sales_today = calc.between(data["sales"], today, today)

# ---------- Header: greeting left, 3D sack right ----------
left, right = st.columns([3, 2], vertical_alignment="center")
with left:
    ui.page_header(f"{greeting}, {who}", f"{ui.long_date(today)} · Here is how the business stands today.")
    if owner:
        day = calc.pnl(data, today, today)
        ui.stats([
            ("Net profit today", ui.peso(day["net"]), f"{ui.pct(day['margin'] * 100)} of sales", True),
            ("Sales today", ui.peso(day["revenue"]), f"{len(sales_today)} sale{'s' if len(sales_today) != 1 else ''}"),
            ("Costs today", ui.peso(day["cogs"] + day["overhead"] + day["payroll"]), "Rice cost, overhead & wages"),
        ])
    else:
        ui.stats([
            ("Sales today", ui.peso(sales_today["total"].sum()), f"{len(sales_today)} sale{'s' if len(sales_today) != 1 else ''}", True),
            ("Palay in warehouse", f"{palay['sacks']:,.0f} sacks", ui.kg(palay["kg"], 0)),
            ("Bigas on hand", ui.kg(bigas_kg, 0), f"{bigas_kg / calc.SACK_KG:,.1f} sacks of 50 kg"),
        ])
with right:
    st.iframe(Path(__file__).parent.parent / "assets" / "sack.html", height=300, tab_index=-1,
              alt="3D model of a Lami-ang Bugas rice sack; drag to turn it")

if owner:
    # ---------- Cash ----------
    cash = calc.cash_position(data)
    ui.section("Cash flow", "Cash on hand counts money actually received and paid out, plus owners' capital.")
    ui.stats([
        ("Cash on hand", ui.peso(cash["cash_on_hand"]), "Capital + collections − payments"),
        ("Receivables (utang)", ui.peso(cash["receivables"]), "Unpaid by customers"),
        ("Owed to farmers", ui.peso(cash["farmer_payables"]), "Unpaid palay"),
        ("Wages due", ui.peso(cash["wages_due"]), "Logged, not yet paid"),
    ])

    # ---------- Inventory ----------
    avg_cost = calc.avg_palay_cost(data["palay_purchases"])
    ui.section("Inventory on hand")
    ui.stats([
        ("Palay in warehouse", f"{palay['sacks']:,.0f} sacks", f"{ui.kg(palay['kg'], 0)} · not yet milled"),
        ("Palay value", ui.peso(palay["kg"] * avg_cost, 0), f"At {ui.peso(avg_cost)}/kg bought"),
        ("Bigas on hand", ui.kg(bigas_kg, 0), f"{bigas_kg / calc.SACK_KG:,.1f} sacks of 50 kg"),
        ("Bigas value", ui.peso(bigas_kg * calc.rice_unit_cost(data["palay_purchases"], data["milling_runs"]), 0),
         "At cost, incl. miller & transport"),
    ])

    # ---------- 30-day profit ----------
    ui.section("Daily net profit, last 30 days",
               "Sales minus estimated rice cost, overhead and wages for each day. Hover a bar for the breakdown.")
    series = calc.daily_net(data, today - timedelta(days=29), today)
    if series["revenue"].sum() == 0 and series["costs"].sum() == 0:
        ui.empty("No sales or costs in the last 30 days",
                 "Record a sale under Sales, Expenses & P&L, or a palay purchase, and this chart fills in.")
    else:
        st.altair_chart(ui.net_bars(series), width="stretch")
        month = calc.pnl(data, today - timedelta(days=29), today)
        best = series.loc[series["net"].idxmax()]
        ui.stats([
            ("30-day net profit", ui.peso(month["net"]), f"{ui.pct(month['margin'] * 100)} net margin"),
            ("30-day sales", ui.peso(month["revenue"]), ""),
            ("Best day", ui.peso(best["net"]), f"{best['date']:%a, %b %d}"),
            ("Rice cost per kg", ui.peso(month["unit_cost"]), "Palay + miller & transport ÷ recovery"),
        ])
        with st.expander("See the numbers as a table"):
            ui.table(series.sort_values("date", ascending=False),
                     {"date": "Date", "revenue": "Sales", "costs": "Costs", "net": "Net"},
                     money=("revenue", "costs", "net"))

# ---------- Recent activity ----------
ui.section("Latest entries")
feed = []


def by(r) -> str:
    return r.get("created_by") or ""


for _, r in data["sales"].iterrows():
    feed.append((r["date"], r["id"], "Sale", f"{ui.kg(r['qty_kg'], 0)} {r['product']} to {r['customer']}", r["total"], by(r)))
for _, r in data["palay_purchases"].iterrows():
    feed.append((r["date"], r["id"], "Palay bought", f"{ui.kg(r['net_kg'], 0)} palay from {r['farmer']}", -r["total_cost"], by(r)))
for _, r in data["milling_runs"].iterrows():
    feed.append((r["date"], r["id"], "Milling",
                 f"{r['sacks']:,.0f} sacks palay → {ui.kg(r['rice_kg'], 0)} bigas at {r['miller'] or 'rice miller'}",
                 -(r["milling_fee"] + r["transport_fee"]) or None, by(r)))
for _, r in data["expenses"].iterrows():
    feed.append((r["date"], r["id"], "Expense", f"{r['category']}: {r['description'] or ''}".strip(": "), -r["amount"], by(r)))

if not feed:
    ui.empty("Nothing recorded yet",
             "Start with Palay & Inventory: record the first palay you buy. Every module feeds this dashboard.")
else:
    recent = pd.DataFrame(feed, columns=["date", "id", "type", "detail", "amount", "by"]) \
        .sort_values(["date", "id"], ascending=False).head(10)
    recent["amount"] = recent["amount"].map(lambda v: "" if pd.isna(v) else ui.peso(v))
    st.dataframe(recent.drop(columns="id").rename(columns={"date": "Date", "type": "Type", "detail": "Detail",
                                                          "amount": "Amount", "by": "Entered by"}),
                 hide_index=True, width="stretch")
