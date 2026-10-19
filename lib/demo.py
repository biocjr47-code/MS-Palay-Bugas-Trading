"""Sample data for demo mode: five weeks of a small Visayan rice mill. Deterministic."""
from __future__ import annotations

import random
from datetime import timedelta

from lib.calc import today

FARMERS = [
    ("Teodoro Abellana", "Brgy. Tabucan"),
    ("Luz Villacruz", "Brgy. Cubay"),
    ("Rosalie Panes", "Brgy. Sibucao"),
    ("Danilo Gumban", "Brgy. Tabucan"),
    ("Herminia Sorongon", "Brgy. Ilaya"),
    ("Ramil Escalona", "Brgy. Cubay"),
]
CUSTOMERS = ["Aling Nena's Store", "Jollimart Grocery", "Tindahan ni Bebing", "Carinderia Lola Pacing", "Walk-in buyer"]
MILLERS = ["Sta. Barbara Rice Mill", "JRV Ricemill Corp."]


def seed(days: int = 35) -> dict[str, list[dict]]:
    rnd = random.Random(20261019)
    end = today()
    start = end - timedelta(days=days - 1)
    this_monday = end - timedelta(days=end.weekday())  # past weeks' wages are already paid
    t: dict[str, list[dict]] = {k: [] for k in (
        "palay_purchases", "milling_runs", "sales", "laborers", "labor_logs", "expenses", "owner_transactions")}

    def add(table: str, row: dict) -> None:
        row["id"] = len(t[table]) + 1
        t[table].append(row)

    laborers = [
        ("Jun-jun Dela Peña", "Truck driver", "Daily", 520.0),
        ("Edgar Tumbagahan", "Kargador (loader)", "Per sack", 9.0),
        ("Nonoy Bacaling", "Kargador (loader)", "Per sack", 9.0),
        ("Marites Ochavo", "Store & repacking", "Daily", 480.0),
        ("Rodel Ybañez", "Dryer helper", "Per kg", 0.35),
    ]
    for name, role, basis, rate in laborers:
        add("laborers", {"name": name, "role": role, "pay_basis": basis, "rate": rate, "active": True})

    add("owner_transactions", {"date": start.isoformat(), "owner": "Marvie", "kind": "Capital in", "amount": 300000.0, "notes": "Opening capital"})
    add("owner_transactions", {"date": start.isoformat(), "owner": "Salome", "kind": "Capital in", "amount": 300000.0, "notes": "Opening capital"})

    palay_left, sacks_left = 0.0, 0
    stock = {"Bigas": 0.0}

    for i in range(days):
        d = start + timedelta(days=i)
        ds = d.isoformat()
        sunday = d.weekday() == 6

        # Palay buying: most days, 1-3 farmers
        if not sunday:
            for _ in range(rnd.randint(1, 2)):
                farmer, brgy = rnd.choice(FARMERS)
                sacks = rnd.randint(14, 38)
                gross = round(sacks * rnd.uniform(44.5, 52.5), 1)
                net = gross
                price = round(24.0 + rnd.uniform(-1.4, 1.8), 2)
                total = round(net * price, 2)
                paid = total if rnd.random() > 0.35 or (end - d).days > 10 else round(total * 0.5, 2)
                add("palay_purchases", {
                    "date": ds, "farmer": farmer, "barangay": brgy, "variety": None, "sacks": sacks,
                    "gross_kg": gross, "net_kg": net, "price_per_kg": price,
                    "total_cost": total, "amount_paid": paid, "notes": None,
                })
                palay_left += net
                sacks_left += sacks

        # Milling: one trip a day to the rice miller
        if not sunday and i > 0 and sacks_left >= 8:
            kg_per_sack = palay_left / sacks_left
            sacks = min(sacks_left, rnd.randint(26, 40))
            palay = round(min(sacks * kg_per_sack * rnd.uniform(0.99, 1.01), palay_left), 1)
            if sacks:
                rice = round(palay * rnd.uniform(0.6, 0.655), 1)
                fee_per_sack, transport_per_sack = 95.0, 15.0
                add("milling_runs", {
                    "date": ds, "miller": rnd.choices(MILLERS, weights=[4, 1])[0], "variety": None,
                    "sacks": sacks, "palay_kg": palay, "rice_kg": rice, "binlid_kg": 0, "darak_kg": 0, "ipa_kg": 0,
                    "recovery_pct": round(rice / palay * 100, 2), "fee_per_kg": 0, "fee_per_sack": fee_per_sack,
                    "milling_fee": sacks * fee_per_sack, "transport_per_sack": transport_per_sack,
                    "transport_fee": sacks * transport_per_sack, "operator": None, "notes": None,
                })
                palay_left -= palay
                sacks_left -= sacks
                stock["Bigas"] += rice
                sacks_handled = round(palay / 50)
                for lid, name, basis, rate, qty, task in (
                    (1, "Jun-jun Dela Peña", "Daily", 520.0, 1, "Hauling to rice miller"),
                    (4, "Marites Ochavo", "Daily", 480.0, 1, "Store & repacking"),
                    (2, "Edgar Tumbagahan", "Per sack", 9.0, sacks_handled // 2 + rnd.randint(0, 6), "Loading"),
                    (3, "Nonoy Bacaling", "Per sack", 9.0, sacks_handled // 2, "Loading"),
                    (5, "Rodel Ybañez", "Per kg", 0.35, round(palay * rnd.uniform(0.4, 0.7)), "Sun-drying"),
                ):
                    add("labor_logs", {
                        "date": ds, "laborer_id": lid, "laborer_name": name, "pay_basis": basis,
                        "quantity": float(qty), "rate": rate, "amount": round(qty * rate, 2), "task": task,
                        "paid": d < this_monday, "paid_date": None,
                    })

        # Sales
        if not sunday:
            for _ in range(rnd.randint(3, 6)):
                if stock["Bigas"] < 600:
                    break
                qty = float(rnd.choice([50, 100, 150, 250, 300, 500]))
                qty = min(qty, stock["Bigas"] - 10)
                price = round(rnd.uniform(47.0, 51.0), 2)
                total = round(qty * price, 2)
                paid = total if rnd.random() > 0.12 or (end - d).days > 14 else 0.0
                add("sales", {"date": ds, "customer": rnd.choice(CUSTOMERS), "product": "Bigas", "qty_kg": qty,
                              "price_per_kg": price, "total": total, "amount_paid": paid, "notes": None})
                stock["Bigas"] -= qty

        # Overhead
        if not sunday:
            add("expenses", {"date": ds, "category": "Diesel & fuel", "description": "Hauling truck",
                             "payee": "Petron Brgy. Ilaya", "amount": round(rnd.uniform(650, 1400), 2)})
        if rnd.random() < 0.3:
            add("expenses", {"date": ds, "category": "Food & snacks for crew", "description": "Merienda",
                             "payee": None, "amount": round(rnd.uniform(180, 420), 2)})
        if rnd.random() < 0.12:
            add("expenses", {"date": ds, "category": "Sacks & packaging", "description": "100 pcs 50-kg sacks",
                             "payee": "Ilonggo Packaging", "amount": 1450.0})
        if d.day == 5:
            add("expenses", {"date": ds, "category": "Electricity", "description": "Monthly bill",
                             "payee": "Electric cooperative", "amount": round(rnd.uniform(2400, 3600), 2)})
        if d.day == 1:
            add("expenses", {"date": ds, "category": "Rent", "description": "Warehouse",
                             "payee": "Landowner", "amount": 8000.0})
        if i in (11, 27):
            add("expenses", {"date": ds, "category": "Repairs & maintenance", "description": "Truck tires & tune-up",
                             "payee": "Auto parts supplier", "amount": round(rnd.uniform(3200, 5400), 2)})

    return t
