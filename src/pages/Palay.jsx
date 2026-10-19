import { useState } from "react";
import { useData } from "../lib/data.jsx";
import * as c from "../lib/calc.js";
import { kg, num, peso } from "../lib/format.js";
import {
  Alert, Button, DateInput, DeletePicker, Empty, NumberInput, PageHeader, PickOrNew, Readout, Section, Select,
  Stats, Table, Tabs, TextInput, Toggle, downloadCsv, useTab,
} from "../components/ui.jsx";

const TABS = ["Buy palay", "Palay stock", "Owed to farmers", "Purchase log"];
const blank = () => ({ date: c.today(), farmer: "", barangay: "", sacks: "", weight: "", price: "", paidFull: true, paid: "", notes: "" });

export default function Palay() {
  const { data, insert, update } = useData();
  const purchases = data.palay_purchases;
  const [tab, setTab] = useTab("palay", TABS);
  const [f, setF] = useState(blank);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));

  const weight = Number(f.weight) || 0, price = Number(f.price) || 0, sacks = Number(f.sacks) || 0;
  const total = Math.round(weight * price * 100) / 100;
  const paid = f.paidFull ? total : Math.min(Number(f.paid) || 0, total);
  const farmers = [...new Set(purchases.map((p) => p.farmer).filter(Boolean))].sort();

  async function save() {
    const missing = [!f.farmer.trim() && "the farmer's name", weight <= 0 && "the weight", price <= 0 && "the price per kg"].filter(Boolean);
    if (missing.length) return setErr(`Please enter ${missing.join(", ")}.`);
    setErr(""); setBusy(true);
    const ok = await insert("palay_purchases", {
      date: f.date, farmer: f.farmer.trim(), barangay: f.barangay.trim() || null, sacks, gross_kg: weight, net_kg: weight,
      price_per_kg: price, total_cost: total, amount_paid: paid, notes: f.notes.trim() || null,
    }, `Saved: ${kg(weight, 0)} palay from ${f.farmer.trim()} for ${peso(total)}.`);
    setBusy(false);
    if (ok) setF(blank());
  }

  const stock = c.palayStock(purchases, data.milling_runs);
  const avg = c.avgPalayCost(purchases);
  const owed = purchases.map((p) => ({ ...p, balance: p.total_cost - p.amount_paid })).filter((p) => p.balance > 0.005)
    .sort((a, b) => a.date.localeCompare(b.date));
  const log = [...purchases].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).map((p) => ({ ...p, balance: p.total_cost - p.amount_paid }));

  return (
    <>
      <PageHeader title="Palay Procurement & Inventory">Record palay bought from farmers, track what is in the warehouse, and what you still owe.</PageHeader>
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "Buy palay" && (
        <div className="ms-form">
          <div className="ms-grid">
            <div>
              <DateInput value={f.date} onChange={set("date")} />
              <PickOrNew label="Farmer" newLabel="Farmer's name" options={farmers} value={f.farmer} onChange={set("farmer")} placeholder="e.g. Teodoro Abellana" />
              <TextInput label="Barangay" value={f.barangay} onChange={set("barangay")} placeholder="e.g. Brgy. Tabucan" />
            </div>
            <div>
              <NumberInput label="Sacks (sako)" value={f.sacks} onChange={set("sacks")} />
              <NumberInput label="Weight (kg)" step={10} value={f.weight} onChange={set("weight")} help="Total weight on the scale. This is the weight you pay for." />
              <NumberInput label="Price per kg (₱)" step={0.25} value={f.price} onChange={set("price")} />
            </div>
          </div>
          <Readout items={[["Weight", kg(weight)], ["Total cost", peso(total)], ["Avg per sack", sacks ? kg(weight / sacks) : "—"]]} />
          <div className="ms-grid">
            <Toggle label="Paid in full now" checked={f.paidFull} onChange={set("paidFull")} />
            {!f.paidFull && <NumberInput label="Amount paid now (₱)" step={100} max={total} value={f.paid} onChange={set("paid")} />}
          </div>
          <TextInput label="Notes (optional)" value={f.notes} onChange={set("notes")} />
          {err && <Alert tone="bad">{err}</Alert>}
          <Button kind="primary" busy={busy} onClick={save}>Save purchase</Button>
        </div>
      )}

      {tab === "Palay stock" && (
        <>
          <Stats items={[
            { label: "Palay in warehouse", value: `${num(stock.sacks)} sacks`, note: `${kg(stock.kg, 0)} not yet milled`, lead: true },
            { label: "Stock value", value: peso(stock.kg * avg), note: "At average buying cost" },
            { label: "Average cost", value: `${peso(avg)}/kg`, note: "All purchases" },
          ]} />
          {!purchases.length && <Empty title="No palay in the warehouse">Record a purchase in the Buy palay tab to start the stock count.</Empty>}
          {(stock.sacks < 0 || stock.kg < -0.5) && <Alert>Stock is negative: more palay was sent to the miller than bought. Check the milling history or record the missing purchase.</Alert>}
        </>
      )}

      {tab === "Owed to farmers" && (!purchases.length ? <Empty title="No purchases yet">Unpaid balances to farmers will list here.</Empty>
        : !owed.length ? <Alert tone="ok">All farmers are fully paid.</Alert>
        : <Payables owed={owed} update={update} />)}

      {tab === "Purchase log" && (
        <>
          {!purchases.length ? <Empty title="No purchases yet">Every palay purchase you save appears here, newest first.</Empty> : <>
            <Table rows={log} columns={[
              { key: "date", label: "Date" }, { key: "farmer", label: "Farmer" }, { key: "barangay", label: "Barangay" },
              { key: "sacks", label: "Sacks", num: true }, { key: "net_kg", label: "Weight", num: true, format: (v) => kg(v) },
              { key: "price_per_kg", label: "Price/kg", num: true, format: (v) => peso(v) },
              { key: "total_cost", label: "Total", num: true, format: (v) => peso(v) },
              { key: "balance", label: "Balance", num: true, format: (v) => peso(v) },
            ]} />
            <Button onClick={() => downloadCsv("palay_purchases.csv", log)}>Download CSV</Button>
          </>}
          <DeletePicker table="palay_purchases" rows={purchases}
                        describe={(r) => `#${r.id} · ${r.date} · ${r.farmer} · ${kg(r.net_kg, 0)} · ${peso(r.total_cost)}`} />
        </>
      )}
    </>
  );
}

function Payables({ owed, update }) {
  const [pick, setPick] = useState(String(owed[0].id));
  const row = owed.find((r) => String(r.id) === pick) || owed[0];
  const [amt, setAmt] = useState("");
  const byFarmer = Object.entries(owed.reduce((m, r) => ({ ...m, [r.farmer]: (m[r.farmer] || 0) + r.balance }), {}))
    .sort((a, b) => b[1] - a[1]).map(([farmer, balance]) => ({ id: farmer, farmer, balance }));
  const pay = amt === "" ? row.balance : Math.min(Number(amt) || 0, row.balance);
  return (
    <>
      <Stats items={[{ label: "Total owed to farmers", value: peso(c.sum(owed, "balance")), note: `${byFarmer.length} farmer(s)`, lead: true }]} />
      <Table rows={byFarmer} columns={[{ key: "farmer", label: "Farmer" }, { key: "balance", label: "Balance", num: true, format: (v) => peso(v) }]} />
      <Section title="Record a payment">
        <div className="ms-form">
          <Select label="Purchase" value={pick} onChange={(v) => { setPick(v); setAmt(""); }}
                  options={owed.map((r) => [String(r.id), `${r.date} · ${r.farmer} · ${kg(r.net_kg, 0)} · balance ${peso(r.balance)}`])} />
          <NumberInput label="Amount paid (₱)" step={100} max={row.balance} value={amt === "" ? row.balance : amt} onChange={setAmt} />
          <Button kind="primary" disabled={pay <= 0}
                  onClick={() => update("palay_purchases", row.id, { amount_paid: row.amount_paid + pay }, `Paid ${peso(pay)} to ${row.farmer}.`)}>
            Record payment
          </Button>
        </div>
      </Section>
    </>
  );
}
