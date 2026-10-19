from datetime import timedelta

import streamlit as st

from lib import auth, calc, db, ui
from lib.widgets import delete_picker, flash, key, save

FS, FE, FO = "sale", "expense", "owner"
data = db.load_all()
sales, expenses, owners = data["sales"], data["expenses"], data["owner_transactions"]
today = calc.today()

owner = auth.is_owner()
if owner:
    ui.page_header("Sales, Expenses & P&L", "Record what you sell and spend, then read the profit and loss for any period.")
    pnl_tab, sales_tab, exp_tab, owner_tab = st.tabs(["Profit & loss", "Sales", "Expenses", "Owners' capital"])
else:
    ui.page_header("Sales & Expenses", "Record what you sell and what you spend.")
    sales_tab, exp_tab = st.tabs(["Sales", "Expenses"])

# ---------- P&L ----------
if owner:
    with pnl_tab:
        presets = {
            "This month": (today.replace(day=1), today),
            "Last 30 days": (today - timedelta(days=29), today),
            "This week": calc.week_bounds(today),
            "Last month": ((today.replace(day=1) - timedelta(days=1)).replace(day=1), today.replace(day=1) - timedelta(days=1)),
            "Custom": None,
        }
        c1, c2 = st.columns([1, 2])
        with c1:
            choice = st.selectbox("Period", list(presets), key="pnl.preset")
        with c2:
            if choice == "Custom":
                rng = st.date_input("From – to", (today - timedelta(days=6), today), key="pnl.custom", format="YYYY-MM-DD")
                start, end = rng if isinstance(rng, tuple) and len(rng) == 2 else (today, today)
            else:
                start, end = presets[choice]
                st.text_input("From – to", f"{start:%b %d, %Y} – {end:%b %d, %Y}", disabled=True)

        p = calc.pnl(data, start, end)
        ui.stats([
            ("Net income", ui.peso(p["net"]), f"{ui.pct(p['margin'] * 100)} net margin", True),
            ("Sales", ui.peso(p["revenue"]), ""),
            ("Gross profit", ui.peso(p["gross"]), "Sales − cost of rice sold"),
            ("Overhead + wages", ui.peso(p["overhead"] + p["payroll"]), ""),
        ])

        statement = [("Sales", p["revenue"], "head")]
        statement += [(f"    {calc.PRODUCT_LABEL.get(k, k)}", v, "sub") for k, v in p["by_product"].items()]
        statement += [("Less: cost of rice sold", -p["cogs"], "line"),
                      ("Gross profit", p["gross"], "head"),
                      ("Less: wages (labor & payroll)", -p["payroll"], "line")]
        statement += [(f"Less: {k.lower()}", -v, "line") for k, v in p["by_category"].items()]
        statement += [("Net income", p["net"], "total")]
        rows_html = "".join(
            f'<tr class="{cls}"><td>{label.strip()}</td><td>{ui.peso(val)}</td></tr>' for label, val, cls in statement)
        st.html(f"""
        <style>
          .ms-pnl {{ width: 100%; max-width: 640px; border-collapse: collapse; margin-top: .5rem; font-size: .95rem; }}
          .ms-pnl td {{ padding: .45rem 0; border-bottom: 1px solid var(--hairline); }}
          .ms-pnl td:last-child {{ text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }}
          .ms-pnl tr.sub td {{ color: var(--body); padding-left: 1rem; font-size: .9rem; }}
          .ms-pnl tr.head td {{ font-weight: 600; }}
          .ms-pnl tr.total td {{ font-weight: 700; font-size: 1.05rem; border-bottom: 2px solid var(--ink); border-top: 1px solid var(--ink); }}
        </style>
        <table class="ms-pnl" aria-label="Profit and loss statement">{rows_html}</table>
        """)
        st.caption(f"Cost of rice sold = (palay {ui.peso(p['palay_cost_per_kg'])}/kg + miller's fee & transport "
                   f"{ui.peso(p['milling_per_kg'])}/kg of palay) "
                   f"÷ {ui.pct(p['recovery'] * 100)} recovery = {ui.peso(p['unit_cost'])} per kg of bigas sold.")

        if not p["by_category"].empty:
            ui.section("Where the overhead went")
            cats = p["by_category"].rename("amount").reset_index()
            cats.columns = ["category", "amount"]
            st.altair_chart(ui.hbars(cats, "category", "amount", "Amount (₱)", color=ui.LOSS), width="stretch")

# ---------- Sales ----------
with sales_tab:
    stock = calc.product_stock(data["milling_runs"], sales).set_index("product")["on_hand_kg"]
    known = sorted(sales["customer"].dropna().unique()) if not sales.empty else []
    c1, c2 = st.columns(2)
    with c1:
        d = st.date_input("Date", today, key=key(FS, "date"), format="YYYY-MM-DD")
        product = "Bigas"
        cust_pick = st.selectbox("Customer", ["New customer…"] + known, index=None, key=key(FS, "cust"),
                                 placeholder="Choose or add a customer")
        customer = st.text_input("Customer name", key=key(FS, "cust_new")) if cust_pick in (None, "New customer…") \
            else cust_pick
    with c2:
        in_sacks = st.toggle("Enter by sacks of 50 kg", key=key(FS, "bysack"))
        if in_sacks:
            sacks = st.number_input("Sacks of bigas", min_value=0.0, step=1.0, key=key(FS, "sacks"))
            qty = sacks * calc.SACK_KG
        else:
            qty = st.number_input("Bigas sold (kg)", min_value=0.0, step=5.0, format="%.1f", key=key(FS, "qty"))
        price = st.number_input("Price per kg (₱)", min_value=0.0, step=0.5, format="%.2f", key=key(FS, "price"))
        paid_full = st.toggle("Paid in full (cash)", value=True, key=key(FS, "paidfull"),
                              help="Turn off for utang: the balance goes to receivables.")
    total = round(qty * price, 2)
    paid = total if paid_full else st.number_input("Amount paid now (₱)", min_value=0.0, max_value=max(total, 0.0),
                                                   step=50.0, format="%.2f", key=key(FS, "paid"))
    info = [("Total", ui.peso(total)), ("Balance (utang)", ui.peso(total - paid))]
    if product in stock:
        info.append(("In stock", ui.kg(stock[product], 0)))
    ui.readout(info)
    if product in stock and qty > stock[product] + 0.5:
        st.caption(f"This is more bigas than the {ui.kg(stock[product], 0)} on record. "
                   "You can still save it; a milling entry may be missing.")
    if st.button("Save sale", type="primary", key=key(FS, "save")):
        if not (customer or "").strip() or qty <= 0 or price <= 0:
            st.error("Please enter the customer, the quantity and the price.")
        else:
            save("sales", {"date": d, "customer": customer.strip(), "product": product, "qty_kg": qty,
                           "price_per_kg": price, "total": total, "amount_paid": paid, "notes": None},
                 FS, f"Saved sale: {ui.kg(qty, 0)} {product} for {ui.peso(total)}.")

    ui.section("Collect utang", "Record a payment against an unpaid sale.")
    owed = sales.assign(balance=sales["total"] - sales["amount_paid"]) if not sales.empty else sales
    owed = owed[owed["balance"] > 0.005].sort_values("date") if not owed.empty else owed
    if owed.empty:
        st.caption("No unpaid sales. Everyone is paid up.")
    else:
        opts = {int(r["id"]): f"{r['date']} · {r['customer']} · {r['product']} · balance {ui.peso(r['balance'])}"
                for _, r in owed.iterrows()}
        c3, c4, c5 = st.columns([3, 1.4, 1], vertical_alignment="bottom")
        with c3:
            sid = st.selectbox("Unpaid sale", list(opts), format_func=opts.get, key="collect.pick")
        row = owed[owed["id"] == sid].iloc[0]
        with c4:
            amt = st.number_input("Amount (₱)", min_value=0.0, max_value=float(row["balance"]),
                                  value=float(row["balance"]), step=50.0, format="%.2f", key=f"collect.amt.{sid}")
        with c5:
            if st.button("Record", type="primary", key="collect.go", width="stretch"):
                db.update("sales", sid, {"amount_paid": float(row["amount_paid"]) + amt})
                flash(f"Collected {ui.peso(amt)} from {row['customer']}.")
                st.rerun()

    ui.section("Recent sales")
    if sales.empty:
        ui.empty("No sales yet", "Your first sale will appear here.")
    else:
        log = sales.sort_values(["date", "id"], ascending=False)
        log = log.assign(balance=log["total"] - log["amount_paid"])
        ui.table(log, {"date": "Date", "customer": "Customer", "product": "Product", "qty_kg": "Qty",
                       "price_per_kg": "Price/kg", "total": "Total", "balance": "Balance"},
                 money=("price_per_kg", "total", "balance"), weight=("qty_kg",), height=380)
        st.download_button("Download CSV", log.to_csv(index=False).encode(), "sales.csv", "text/csv")
    delete_picker("sales", sales, lambda r: f"#{r['id']} · {r['date']} · {r['customer']} · {r['product']} · {ui.peso(r['total'])}", FS)

# ---------- Expenses ----------
with exp_tab:
    c1, c2 = st.columns(2)
    with c1:
        d = st.date_input("Date", today, key=key(FE, "date"), format="YYYY-MM-DD")
        # Built-in categories plus any the owners have added on earlier expenses.
        used = expenses["category"].dropna().unique() if not expenses.empty else []
        categories = list(calc.EXPENSE_CATEGORIES) + sorted(set(used) - set(calc.EXPENSE_CATEGORIES))
        NEW = "New category…"
        cat_pick = st.selectbox("Category", categories + [NEW], key=key(FE, "cat"))
        if cat_pick == NEW:
            category = st.text_input("New category name", key=key(FE, "cat_new"),
                                     placeholder="e.g. Load / cellphone",
                                     help="It is added to the list once you save this expense.").strip()
        else:
            category = cat_pick
        amount = st.number_input("Amount (₱)", min_value=0.0, step=50.0, format="%.2f", key=key(FE, "amt"))
    with c2:
        desc = st.text_input("Description", key=key(FE, "desc"), placeholder="e.g. 20 L diesel for truck")
        payee = st.text_input("Paid to (optional)", key=key(FE, "payee"), placeholder="e.g. Petron Brgy. Ilaya")
    st.caption("Don't enter wages, palay, or the miller's and transport fees here: Labor & Payroll, "
               "Palay & Inventory, and Milling & Production already record them.")
    if st.button("Save expense", type="primary", key=key(FE, "save")):
        if not category:
            st.error("Type a name for the new category.")
        elif amount <= 0:
            st.error("Enter an amount above ₱0.")
        else:
            existing = {c.lower(): c for c in categories}
            category = existing.get(category.lower(), category)  # "rent" reuses "Rent", no duplicate
            save("expenses", {"date": d, "category": category, "description": desc.strip() or None,
                              "payee": payee.strip() or None, "amount": amount},
                 FE, f"Saved {category.lower()} expense of {ui.peso(amount)}.")

    ui.section("This month's overhead")
    month = calc.between(expenses, today.replace(day=1), today)
    if month.empty:
        ui.empty("No expenses this month", "Electricity, diesel, repairs and other overhead show up here once recorded.")
    else:
        ui.stats([("Overhead this month", ui.peso(month["amount"].sum()), f"{len(month)} entries", True)])
        log = expenses.sort_values(["date", "id"], ascending=False)
        ui.table(log, {"date": "Date", "category": "Category", "description": "Description", "payee": "Paid to",
                       "amount": "Amount"}, money=("amount",), height=360)
        st.download_button("Download CSV", log.to_csv(index=False).encode(), "expenses.csv", "text/csv")
    delete_picker("expenses", expenses, lambda r: f"#{r['id']} · {r['date']} · {r['category']} · {ui.peso(r['amount'])}", FE)

# ---------- Owners ----------
if owner:
    with owner_tab:
        cash = calc.cash_position(data)
        per_owner = []
        for name in ("Marvie", "Salome"):
            o = owners[owners["owner"] == name] if not owners.empty else owners
            cap = o.loc[o["kind"] == "Capital in", "amount"].sum() if not o.empty else 0.0
            draw = o.loc[o["kind"] == "Drawing", "amount"].sum() if not o.empty else 0.0
            per_owner.append((f"{name}: capital − drawings", ui.peso(cap - draw),
                              f"{ui.peso(cap, 0)} in · {ui.peso(draw, 0)} out"))
        ui.stats([("Cash on hand", ui.peso(cash["cash_on_hand"]), "All accounts", True)] + per_owner)

        c1, c2 = st.columns(2)
        with c1:
            d = st.date_input("Date", today, key=key(FO, "date"), format="YYYY-MM-DD")
            owner = st.radio("Owner", ["Marvie", "Salome"], horizontal=True, key=key(FO, "who"))
        with c2:
            kind = st.radio("Type", ["Capital in", "Drawing"], horizontal=True, key=key(FO, "kind"),
                            help="Capital in: money put into the business. Drawing: money taken out for personal use.")
            amt = st.number_input("Amount (₱)", min_value=0.0, step=500.0, format="%.2f", key=key(FO, "amt"))
        notes = st.text_input("Notes (optional)", key=key(FO, "notes"))
        if st.button("Save", type="primary", key=key(FO, "save")):
            if amt <= 0:
                st.error("Enter an amount above ₱0.")
            else:
                save("owner_transactions", {"date": d, "owner": owner, "kind": kind, "amount": amt,
                                            "notes": notes.strip() or None},
                     FO, f"Saved {kind.lower()} of {ui.peso(amt)} for {owner}.")
        if not owners.empty:
            ui.table(owners.sort_values(["date", "id"], ascending=False),
                     {"date": "Date", "owner": "Owner", "kind": "Type", "amount": "Amount", "notes": "Notes"},
                     money=("amount",))
        delete_picker("owner_transactions", owners, lambda r: f"#{r['id']} · {r['date']} · {r['owner']} · {r['kind']} · {ui.peso(r['amount'])}", FO)
