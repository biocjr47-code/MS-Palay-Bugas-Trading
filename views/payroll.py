import streamlit as st

from lib import auth, calc, db, ui
from lib.widgets import delete_picker, flash, key, save

F, FL = "labor", "laborer"
data = db.load_all()
laborers = data["laborers"]
logs = data["labor_logs"]
active = laborers[laborers["active"]] if not laborers.empty else laborers

ui.page_header("Labor & Payroll",
               "Pay by the day (arawan) or by output (pakyaw: per sack or per kilo). Log work daily, pay weekly.")

owner = auth.is_owner()
log_tab, pay_tab, *rest = st.tabs(["Log work", "Payroll", "Laborers"] if owner else ["Log work", "Payroll"])

# ---------- Log work ----------
with log_tab:
    if active.empty:
        ui.empty("No laborers yet", "Add your crew in the Laborers tab first, with their daily or per-output rate.")
    else:
        people = {int(r["id"]): r for _, r in active.iterrows()}
        c1, c2 = st.columns(2)
        with c1:
            d = st.date_input("Date", calc.today(), key=key(F, "date"), format="YYYY-MM-DD")
            lid = st.selectbox("Laborer", list(people), key=key(F, "who"),
                               format_func=lambda i: f"{people[i]['name']} — {people[i]['role'] or people[i]['pay_basis']}")
            person = people[lid]
            basis = person["pay_basis"]
            st.caption(f"Pay basis: **{basis}** at **{ui.peso(person['rate'])}** per {calc.PAY_UNIT[basis].rstrip('s')}")
        with c2:
            step = {"Daily": 0.5, "Per sack": 1.0, "Per kg": 10.0}[basis]
            qty = st.number_input(f"{calc.PAY_UNIT[basis].capitalize()} {'worked' if basis == 'Daily' else 'handled'}",
                                  min_value=0.0, value=1.0 if basis == "Daily" else 0.0, step=step,
                                  key=key(F, f"qty.{lid}"))
            rate = st.number_input("Rate (₱)", min_value=0.0, value=float(person["rate"]), step=0.5, format="%.2f", disabled=not owner,
                                   key=key(F, f"rate.{lid}"),
                                   help="Change only for a one-off rate on this entry." if owner else "Only an owner can change rates.")
            task = st.text_input("Task", key=key(F, "task"), placeholder="e.g. Loading, Sun-drying, Milling")
        amount = round(qty * rate, 2)
        ui.readout([("Wage for this entry", ui.peso(amount)), ("Computation", f"{qty:g} × {ui.peso(rate)}")])
        if st.button("Save work log", type="primary", key=key(F, "save")):
            if qty <= 0:
                st.error(f"Enter the {calc.PAY_UNIT[basis]} worked or handled.")
            else:
                save("labor_logs", {
                    "date": d, "laborer_id": lid, "laborer_name": person["name"], "pay_basis": basis,
                    "quantity": qty, "rate": rate, "amount": amount, "task": task.strip() or None,
                    "paid": False, "paid_date": None,
                }, F, f"Logged {ui.peso(amount)} for {person['name']}.")

# ---------- Payroll ----------
with pay_tab:
    wk_start, wk_end = calc.week_bounds(calc.today())
    period = st.date_input("Pay period", (wk_start, wk_end), key="pay.period", format="YYYY-MM-DD",
                           help="Defaults to this week, Monday to Sunday.")
    start, end = (period if isinstance(period, tuple) and len(period) == 2 else (wk_start, wk_end))
    rows = calc.between(logs, start, end)
    if rows.empty:
        ui.empty("No work logged in this period", "Log work in the first tab, or pick another pay period.")
    else:
        unpaid = rows[~rows["paid"]]
        ui.stats([
            ("Gross payroll", ui.peso(rows["amount"].sum()), f"{rows['laborer_name'].nunique()} laborers", True),
            ("Still to pay", ui.peso(unpaid["amount"].sum()), f"{len(unpaid)} entries"),
            ("Already paid", ui.peso(rows.loc[rows["paid"], "amount"].sum()), ""),
        ])
        summary = rows.groupby(["laborer_name", "pay_basis"]).agg(
            quantity=("quantity", "sum"), gross=("amount", "sum"),
            unpaid=("amount", lambda s: s[~rows.loc[s.index, "paid"]].sum()),
        ).reset_index()
        summary["output"] = [f"{q:,.1f} {calc.PAY_UNIT[b]}" for q, b in zip(summary["quantity"], summary["pay_basis"])]
        ui.table(summary.sort_values("gross", ascending=False),
                 {"laborer_name": "Laborer", "pay_basis": "Basis", "output": "Days / output", "gross": "Gross pay",
                  "unpaid": "Unpaid"}, money=("gross", "unpaid"))

        if not unpaid.empty and owner:
            ui.section("Pay out", "Marks the unpaid entries in this period as paid today.")
            names = sorted(unpaid["laborer_name"].unique())
            who = st.multiselect("Laborers to pay", names, default=names, key="pay.who")
            selected = unpaid[unpaid["laborer_name"].isin(who)]
            if st.button(f"Mark {ui.peso(selected['amount'].sum())} as paid", type="primary",
                         disabled=selected.empty, key="pay.go"):
                db.update_many("labor_logs", selected["id"].astype(int).tolist(),
                               {"paid": True, "paid_date": calc.today()})
                flash(f"Paid {ui.peso(selected['amount'].sum())} to {len(who)} laborer(s).")
                st.rerun()

        with st.expander("Entries in this period"):
            detail = rows.sort_values(["date", "laborer_name"]).assign(
                status=rows["paid"].map({True: "Paid", False: "Unpaid"}))
            ui.table(detail, {"date": "Date", "laborer_name": "Laborer", "task": "Task", "quantity": "Qty",
                              "rate": "Rate", "amount": "Amount", "status": "Status"}, money=("rate", "amount"))
            st.download_button("Download payroll CSV", detail.to_csv(index=False).encode(),
                               f"payroll_{start}_{end}.csv", "text/csv")
    delete_picker("labor_logs", logs,
                  lambda r: f"#{r['id']} · {r['date']} · {r['laborer_name']} · {r['quantity']:g} × {ui.peso(r['rate'])}",
                  F)

# ---------- Crew ----------
if owner:
    with rest[0]:
        ui.section("Add a laborer")
        c1, c2 = st.columns(2)
        with c1:
            name = st.text_input("Full name", key=key(FL, "name"))
            role = st.text_input("Role", key=key(FL, "role"), placeholder="e.g. Kargador, Miller operator")
        with c2:
            basis = st.selectbox("Pay basis", calc.PAY_BASES, key=key(FL, "basis"),
                                 help="Daily = arawan. Per sack / per kg = pakyaw, paid by output.")
            rate = st.number_input(f"Rate per {calc.PAY_UNIT[basis].rstrip('s')} (₱)", min_value=0.0, step=0.5,
                                   format="%.2f", key=key(FL, "rate"))
        if st.button("Add laborer", type="primary", key=key(FL, "save")):
            if not name.strip() or rate <= 0:
                st.error("Enter the laborer's name and a rate above ₱0.")
            else:
                save("laborers", {"name": name.strip(), "role": role.strip() or None, "pay_basis": basis,
                                  "rate": rate, "active": True}, FL, f"Added {name.strip()} to the crew.")

        ui.section("Crew")
        if laborers.empty:
            ui.empty("No laborers yet", "Add the first one above.")
        else:
            crew = laborers.assign(status=laborers["active"].map({True: "Active", False: "Inactive"}))
            ui.table(crew.sort_values(["active", "name"], ascending=[False, True]),
                     {"name": "Name", "role": "Role", "pay_basis": "Basis", "rate": "Rate", "status": "Status"},
                     money=("rate",))
            opts = {int(r["id"]): f"{r['name']} ({'active' if r['active'] else 'inactive'})" for _, r in laborers.iterrows()}
            c3, c4 = st.columns([3, 1], vertical_alignment="bottom")
            with c3:
                pick = st.selectbox("Change a laborer's status", list(opts), format_func=opts.get, key="crew.pick")
            with c4:
                is_active = bool(laborers.loc[laborers["id"] == pick, "active"].iloc[0])
                if st.button("Set inactive" if is_active else "Set active", key="crew.toggle", width="stretch"):
                    db.update("laborers", pick, {"active": not is_active})
                    flash("Crew updated.")
                    st.rerun()
