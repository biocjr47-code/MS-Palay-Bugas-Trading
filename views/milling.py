from datetime import timedelta

import streamlit as st

from lib import calc, db, ui
from lib.widgets import delete_picker, key, save

F = "mill"
data = db.load_all()
runs = data["milling_runs"]
low, high = calc.RECOVERY_RANGE
today = calc.today()


def last_used(col: str) -> float:
    """The rate used on the most recent trip, so it doesn't have to be typed again."""
    if runs.empty:
        return 0.0
    return float(runs.sort_values(["date", "id"])[col].iloc[-1])


ui.page_header("Milling & Production",
               "Take palay sacks from the warehouse to the rice miller and record the bigas you bring back. "
               f"A healthy recovery is {low:.0f}–{high:.0f}% of the palay weight.")

send_tab, stock_tab, history_tab = st.tabs(["Send to miller", "Bigas stock", "Milling history"])

with send_tab:
    stock = calc.palay_stock(data["palay_purchases"], runs)
    millers = sorted(runs["miller"].dropna().unique()) if not runs.empty else []

    c1, c2 = st.columns(2)
    with c1:
        d = st.date_input("Date", today, key=key(F, "date"), format="YYYY-MM-DD")
        miller_pick = st.selectbox("Rice miller", ["New rice miller…"] + millers, index=1 if millers else None,
                                   key=key(F, "miller_pick"), placeholder="Choose or add a rice miller")
        if miller_pick in (None, "New rice miller…"):
            miller = st.text_input("Rice miller's name", key=key(F, "miller_new"), placeholder="e.g. Sta. Barbara Rice Mill")
        else:
            miller = miller_pick
        sacks = st.number_input("Sacks of palay sent", min_value=0, step=1, key=key(F, "sacks"),
                                help=f"In the warehouse now: {stock['sacks']:,.0f} sacks · {ui.kg(stock['kg'], 0)}.")
        palay = st.number_input("Palay weight sent (kg)", min_value=0.0, step=10.0, format="%.1f", key=key(F, "palay"),
                                help="Total scale weight of the sacks you took to the miller.")
    with c2:
        rice = st.number_input("Bigas brought back (kg)", min_value=0.0, step=10.0, format="%.1f", key=key(F, "rice"),
                               help="Weight of the milled rice you received from the miller.")
        fee_per_sack = st.number_input("Miller's fee per sack (₱)", min_value=0.0, value=last_used("fee_per_sack"),
                                       step=1.0, format="%.2f", key=key(F, "fee"),
                                       help="Filled in with last trip's rate. Change it if the miller's price changed.")
        transport_per_sack = st.number_input("Transportation fee per sack (₱)", min_value=0.0,
                                             value=last_used("transport_per_sack"), step=1.0, format="%.2f",
                                             key=key(F, "transport"),
                                             help="Hauling the palay to the miller and the bigas back. Filled in with last trip's rate.")
        notes = st.text_input("Notes (optional)", key=key(F, "notes"))

    fee = round(sacks * fee_per_sack, 2)
    transport = round(sacks * transport_per_sack, 2)
    recovery = rice / palay * 100 if palay else 0.0
    ui.readout([
        ("Recovery", ui.pct(recovery) if palay and rice else "—"),
        ("Miller's fee", ui.peso(fee)),
        ("Transportation", ui.peso(transport)),
        ("Total for this trip", ui.peso(fee + transport)),
        ("Left in warehouse", f"{stock['sacks'] - sacks:,.0f} sacks · {ui.kg(stock['kg'] - palay, 0)}"),
    ])
    if palay and rice and not (low <= recovery <= high + 3):
        st.warning(f"Recovery of {recovery:.1f}% is outside the usual {low:.0f}–{high:.0f}%. "
                   "Double-check both weights before saving.")
    if sacks > stock["sacks"] or palay > stock["kg"] + 0.5:
        st.caption("This is more palay than the warehouse record shows. "
                   "You can still save it; a palay purchase may be missing.")

    if st.button("Save milling", type="primary", key=key(F, "save")):
        missing = [name for name, ok in (("the rice miller", bool((miller or "").strip())), ("the sacks sent", sacks > 0),
                                         ("the palay weight", palay > 0), ("the bigas brought back", rice > 0)) if not ok]
        if missing:
            st.error("Please enter " + ", ".join(missing) + ".")
        elif rice > palay:
            st.error("The bigas weighs more than the palay sent. Check the two weights.")
        else:
            save("milling_runs", {
                "date": d, "miller": miller.strip(), "variety": None, "sacks": int(sacks), "palay_kg": palay,
                "rice_kg": rice, "binlid_kg": 0, "darak_kg": 0, "ipa_kg": 0, "recovery_pct": round(recovery, 2),
                "fee_per_kg": 0, "fee_per_sack": fee_per_sack, "milling_fee": fee,
                "transport_per_sack": transport_per_sack, "transport_fee": transport,
                "operator": None, "notes": notes.strip() or None,
            }, F, f"Saved: {sacks} sacks → {ui.kg(rice, 0)} bigas. Miller {ui.peso(fee)} + transport {ui.peso(transport)}.")

with stock_tab:
    ps = calc.product_stock(runs, data["sales"]).set_index("product").loc["Bigas"]
    unit_cost = calc.rice_unit_cost(data["palay_purchases"], runs)
    ui.stats([
        ("Bigas on hand", ui.kg(ps["on_hand_kg"], 0), f"{ps['on_hand_kg'] / calc.SACK_KG:,.1f} sacks of 50 kg", True),
        ("Value at cost", ui.peso(ps["on_hand_kg"] * unit_cost), f"{ui.peso(unit_cost)} per kg"),
        ("Brought back from miller", ui.kg(ps["produced_kg"], 0), "All time"),
        ("Sold", ui.kg(ps["sold_kg"], 0), "All time"),
    ])
    if runs.empty:
        ui.empty("No milling recorded yet", "Record a trip to the rice miller in the first tab and your bigas stock counts up here.")
    if ps["on_hand_kg"] < -0.5:
        st.warning("Bigas stock is negative: more was sold than brought back from the miller. A milling entry may be missing.")

with history_tab:
    if runs.empty:
        ui.empty("No milling recorded yet", "Every trip to the rice miller appears here with its recovery and fees.")
    else:
        month = calc.between(runs, today.replace(day=1), today)
        last7 = calc.between(runs, today - timedelta(days=6), today)
        ui.stats([
            ("Average recovery", ui.pct(calc.recovery_rate(runs) * 100), f"Target {low:.0f}–{high:.0f}%", True),
            ("Miller's fees this month", ui.peso(month["milling_fee"].sum()), f"{len(month)} trips"),
            ("Transportation this month", ui.peso(month["transport_fee"].sum()), f"{month['sacks'].sum():,.0f} sacks"),
            ("Bigas back, 7 days", ui.kg(last7["rice_kg"].sum(), 0), f"{last7['rice_kg'].sum() / calc.SACK_KG:,.0f} sacks"),
        ])
        log = runs.sort_values(["date", "id"], ascending=False)
        ui.table(log, {"date": "Date", "miller": "Rice miller", "sacks": "Sacks", "palay_kg": "Palay sent",
                       "rice_kg": "Bigas back", "recovery_pct": "Recovery", "milling_fee": "Miller's fee",
                       "transport_fee": "Transport"},
                 weight=("palay_kg", "rice_kg"), percent=("recovery_pct",), money=("milling_fee", "transport_fee"),
                 height=420)
        st.download_button("Download CSV", log.to_csv(index=False).encode(), "milling.csv", "text/csv")
    delete_picker("milling_runs", runs,
                  lambda r: f"#{r['id']} · {r['date']} · {r['miller'] or ''} · {r['sacks']:,.0f} sacks → {ui.kg(r['rice_kg'], 0)}",
                  F)
