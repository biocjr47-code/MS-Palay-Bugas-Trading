import streamlit as st

from lib import calc, db, ui
from lib.widgets import delete_picker, key, save

F = "palay"
data = db.load_all()
purchases = data["palay_purchases"]

ui.page_header("Palay Procurement & Inventory",
               "Record palay bought from farmers, track what is in the warehouse, and what you still owe.")

buy, stock_tab, payables_tab, log_tab = st.tabs(["Buy palay", "Palay stock", "Owed to farmers", "Purchase log"])

# ---------- Buy ----------
with buy:
    known_farmers = sorted(purchases["farmer"].dropna().unique()) if not purchases.empty else []
    c1, c2 = st.columns(2)
    with c1:
        d = st.date_input("Date", calc.today(), key=key(F, "date"), format="YYYY-MM-DD")
        farmer_pick = st.selectbox("Farmer", ["New farmer…"] + known_farmers, key=key(F, "farmer_pick"),
                                   index=None, placeholder="Choose or add a farmer")
        if farmer_pick in (None, "New farmer…"):
            farmer = st.text_input("Farmer's name", key=key(F, "farmer_new"), placeholder="e.g. Teodoro Abellana")
        else:
            farmer = farmer_pick or ""
        barangay = st.text_input("Barangay", key=key(F, "brgy"), placeholder="e.g. Brgy. Tabucan")
    with c2:
        sacks = st.number_input("Sacks (sako)", min_value=0, step=1, key=key(F, "sacks"))
        gross = st.number_input("Weight (kg)", min_value=0.0, step=10.0, format="%.1f", key=key(F, "gross"),
                                help="Total weight on the scale. This is the weight you pay for.")
        price = st.number_input("Price per kg (₱)", min_value=0.0, step=0.25, format="%.2f", key=key(F, "price"))

    net = round(gross, 2)
    total = round(net * price, 2)
    ui.readout([
        ("Weight", ui.kg(net)),
        ("Total cost", ui.peso(total)),
        ("Avg per sack", ui.kg(net / sacks) if sacks else "—"),
    ])
    c3, c4 = st.columns(2)
    with c3:
        paid_full = st.toggle("Paid in full now", value=True, key=key(F, "paidfull"))
    with c4:
        paid = total if paid_full else st.number_input("Amount paid now (₱)", min_value=0.0, max_value=max(total, 0.0),
                                                       step=100.0, format="%.2f", key=key(F, "paid"))
    notes = st.text_input("Notes (optional)", key=key(F, "notes"))

    problems = []
    if not farmer.strip():
        problems.append("the farmer's name")
    if gross <= 0:
        problems.append("the weight")
    if price <= 0:
        problems.append("the price per kg")

    if st.button("Save purchase", type="primary", key=key(F, "save")):
        if problems:
            st.error("Please enter " + ", ".join(problems) + ".")
        else:
            save("palay_purchases", {
                "date": d, "farmer": farmer.strip(), "barangay": barangay.strip() or None, "variety": None,
                "sacks": int(sacks), "gross_kg": gross, "net_kg": net,
                "price_per_kg": price, "total_cost": total, "amount_paid": paid, "notes": notes.strip() or None,
            }, F, f"Saved: {ui.kg(net, 0)} palay from {farmer.strip()} for {ui.peso(total)}.")

# ---------- Stock ----------
with stock_tab:
    stock = calc.palay_stock(purchases, data["milling_runs"])
    avg = calc.avg_palay_cost(purchases)
    total_kg, total_sacks = stock["kg"], stock["sacks"]
    ui.stats([
        ("Palay in warehouse", f"{total_sacks:,.0f} sacks", f"{ui.kg(total_kg, 0)} not yet milled", True),
        ("Stock value", ui.peso(total_kg * avg), "At average buying cost"),
        ("Average cost", f"{ui.peso(avg)}/kg", "All purchases"),
    ])
    if purchases.empty:
        ui.empty("No palay in the warehouse", "Record a purchase in the Buy palay tab to start the stock count.")
    elif total_sacks < 0 or total_kg < -0.5:
        st.warning("Stock is negative: more palay was sent to the miller than bought. Check the milling history or "
                   "record the missing purchase.")

# ---------- Payables ----------
with payables_tab:
    if purchases.empty:
        ui.empty("No purchases yet", "Unpaid balances to farmers will list here.")
    else:
        owed = purchases.assign(balance=purchases["total_cost"] - purchases["amount_paid"])
        owed = owed[owed["balance"] > 0.005].sort_values("date")
        if owed.empty:
            st.success("All farmers are fully paid.")
        else:
            by_farmer = owed.groupby("farmer")["balance"].sum().reset_index().sort_values("balance", ascending=False)
            ui.stats([("Total owed to farmers", ui.peso(owed["balance"].sum()), f"{len(by_farmer)} farmer(s)", True)])
            ui.table(by_farmer, {"farmer": "Farmer", "balance": "Balance"}, money=("balance",))
            ui.section("Record a payment")
            opts = {int(r["id"]): f"{r['date']} · {r['farmer']} · {ui.kg(r['net_kg'], 0)} · "
                                  f"balance {ui.peso(r['balance'])}" for _, r in owed.iterrows()}
            pid = st.selectbox("Purchase", list(opts), format_func=opts.get, key="palay.pay.pick")
            row = owed[owed["id"] == pid].iloc[0]
            amt = st.number_input("Amount paid (₱)", min_value=0.0, max_value=float(row["balance"]),
                                  value=float(row["balance"]), step=100.0, format="%.2f", key=f"palay.pay.amt.{pid}")
            if st.button("Record payment", type="primary", key="palay.pay.go"):
                db.update("palay_purchases", pid, {"amount_paid": float(row["amount_paid"]) + amt})
                st.session_state["_flash"] = f"Paid {ui.peso(amt)} to {row['farmer']}."
                st.rerun()

# ---------- Log ----------
with log_tab:
    if purchases.empty:
        ui.empty("No purchases yet", "Every palay purchase you save appears here, newest first.")
    else:
        log = purchases.sort_values(["date", "id"], ascending=False)
        log = log.assign(balance=log["total_cost"] - log["amount_paid"])
        ui.table(log, {"date": "Date", "farmer": "Farmer", "barangay": "Barangay",
                       "sacks": "Sacks", "net_kg": "Weight",
                       "price_per_kg": "Price/kg", "total_cost": "Total", "balance": "Balance"},
                 money=("price_per_kg", "total_cost", "balance"), weight=("net_kg",), height=420)
        st.download_button("Download CSV", log.to_csv(index=False).encode(), "palay_purchases.csv", "text/csv")
    delete_picker("palay_purchases", purchases,
                  lambda r: f"#{r['id']} · {r['date']} · {r['farmer']} · {ui.kg(r['net_kg'], 0)} · {ui.peso(r['total_cost'])}",
                  F)
