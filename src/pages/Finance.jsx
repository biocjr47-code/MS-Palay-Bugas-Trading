import { useMemo, useState } from "react";
import { useAuth } from "../lib/auth.jsx";
import { useData } from "../lib/data.jsx";
import * as c from "../lib/calc.js";
import { kg, peso, pct, shortDate } from "../lib/format.js";
import {
  Alert, Button, DateInput, DeletePicker, Empty, NumberInput, PageHeader, PickOrNew, Radio, Readout, Section, Select, Stats,
  Table, Tabs, TextInput, Toggle, downloadCsv, useTab,
} from "../components/ui.jsx";
import { HBars, LOSS } from "../components/charts.jsx";

export default function Finance() {
  const { isOwner } = useAuth();
  const tabs = useMemo(() => (isOwner ? ["Profit & loss", "Sales", "Expenses", "Owners' capital"] : ["Sales", "Expenses"]), [isOwner]);
  const [tab, setTab] = useTab("finance", tabs);
  return (
    <>
      {isOwner
        ? <PageHeader title="Sales, Expenses & P&L">Record what you sell and spend, then read the profit and loss for any period.</PageHeader>
        : <PageHeader title="Sales & Expenses">Record what you sell and what you spend.</PageHeader>}
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === "Profit & loss" && isOwner && <ProfitLoss />}
      {tab === "Sales" && <Sales />}
      {tab === "Expenses" && <Expenses />}
      {tab === "Owners' capital" && isOwner && <Owners />}
    </>
  );
}

function ProfitLoss() {
  const { data } = useData();
  const today = c.today();
  const lastMonthEnd = c.addDays(c.monthStart(today), -1);
  const presets = {
    "This month": [c.monthStart(today), today],
    "Last 30 days": [c.addDays(today, -29), today],
    "This week": c.weekBounds(today),
    "Last month": [c.monthStart(lastMonthEnd), lastMonthEnd],
    Custom: null,
  };
  const [choice, setChoice] = useState("This month");
  const [custom, setCustom] = useState([c.addDays(today, -6), today]);
  const [start, end] = presets[choice] || custom;
  const p = c.pnl(data, start, end);
  const lines = [
    ["Sales", p.revenue, "head"],
    ...p.byProduct.map(([k, v]) => [k === "Bigas" ? "Bigas (milled rice)" : k, v, "sub"]),
    ["Less: cost of rice sold", -p.cogs, ""],
    ["Gross profit", p.gross, "head"],
    ["Less: wages (labor & payroll)", -p.payroll, ""],
    ...p.byCategory.map(([k, v]) => [`Less: ${k.toLowerCase()}`, -v, ""]),
    ["Net income", p.net, "total"],
  ];
  return (
    <>
      <div className="ms-grid">
        <Select label="Period" value={choice} onChange={setChoice} options={Object.keys(presets)} />
        {choice === "Custom" ? (
          <div className="ms-grid tight">
            <DateInput label="From" value={custom[0]} onChange={(v) => setCustom([v, custom[1]])} />
            <DateInput label="To" value={custom[1]} onChange={(v) => setCustom([custom[0], v])} />
          </div>
        ) : <TextInput label="From – to" value={`${shortDate(start)} – ${shortDate(end)}`} onChange={() => {}} disabled />}
      </div>
      <Stats items={[
        { label: "Net income", value: peso(p.net), note: `${pct(p.margin * 100)} net margin`, lead: true },
        { label: "Sales", value: peso(p.revenue) },
        { label: "Gross profit", value: peso(p.gross), note: "Sales − cost of rice sold" },
        { label: "Overhead + wages", value: peso(p.overhead + p.payroll) },
      ]} />
      <table className="ms-pnl" aria-label="Profit and loss statement">
        <tbody>{lines.map(([label, v, cls]) => <tr key={label} className={cls}><td>{label}</td><td>{peso(v)}</td></tr>)}</tbody>
      </table>
      <p className="ms-muted">
        Cost of rice sold = (palay {peso(p.palayCostPerKg)}/kg + miller's fee &amp; transport {peso(p.millingPerKg)}/kg of palay)
        ÷ {pct(p.recovery * 100)} recovery = {peso(p.unitCost)} per kg of bigas sold.
      </p>
      {p.byCategory.length > 0 && <Section title="Where the overhead went"><HBars items={p.byCategory} color={LOSS} /></Section>}
    </>
  );
}

function Sales() {
  const { data, insert, update } = useData();
  const sales = data.sales;
  const blank = () => ({ date: c.today(), customer: "", bySack: false, sacks: "", qty: "", price: "", paidFull: true, paid: "" });
  const [f, setF] = useState(blank);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const qty = f.bySack ? (Number(f.sacks) || 0) * c.SACK_KG : Number(f.qty) || 0;
  const price = Number(f.price) || 0;
  const total = Math.round(qty * price * 100) / 100;
  const paid = f.paidFull ? total : Math.min(Number(f.paid) || 0, total);
  const stock = c.bigasStock(data.milling_runs, sales).onHand;
  const customers = [...new Set(sales.map((s) => s.customer).filter(Boolean))].sort();

  async function save() {
    if (!f.customer.trim() || qty <= 0 || price <= 0) return setErr("Please enter the customer, the quantity and the price.");
    setErr(""); setBusy(true);
    const ok = await insert("sales", { date: f.date, customer: f.customer.trim(), product: "Bigas", qty_kg: qty, price_per_kg: price, total, amount_paid: paid },
      `Saved sale: ${kg(qty, 0)} bigas for ${peso(total)}.`);
    setBusy(false);
    if (ok) setF(blank());
  }

  const owed = sales.map((s) => ({ ...s, balance: s.total - s.amount_paid })).filter((s) => s.balance > 0.005).sort((a, b) => a.date.localeCompare(b.date));
  const log = [...sales].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).map((s) => ({ ...s, balance: s.total - s.amount_paid }));

  return (
    <>
      <div className="ms-form">
        <div className="ms-grid">
          <div>
            <DateInput value={f.date} onChange={set("date")} />
            <PickOrNew label="Customer" newLabel="Customer name" options={customers} value={f.customer} onChange={set("customer")} placeholder="e.g. Aling Nena's Store" />
          </div>
          <div>
            <Toggle label="Enter by sacks of 50 kg" checked={f.bySack} onChange={set("bySack")} />
            {f.bySack ? <NumberInput label="Sacks of bigas" value={f.sacks} onChange={set("sacks")} />
              : <NumberInput label="Bigas sold (kg)" step={5} value={f.qty} onChange={set("qty")} />}
            <NumberInput label="Price per kg (₱)" step={0.5} value={f.price} onChange={set("price")} />
            <Toggle label="Paid in full (cash)" checked={f.paidFull} onChange={set("paidFull")} />
            {!f.paidFull && <NumberInput label="Amount paid now (₱)" step={50} max={total} value={f.paid} onChange={set("paid")}
                                         help="The rest goes to receivables (utang)." />}
          </div>
        </div>
        <Readout items={[["Total", peso(total)], ["Balance (utang)", peso(total - paid)], ["In stock", kg(stock, 0)]]} />
        {qty > stock + 0.5 && <p className="ms-muted">This is more bigas than the {kg(stock, 0)} on record. You can still save it; a milling entry may be missing.</p>}
        {err && <Alert tone="bad">{err}</Alert>}
        <Button kind="primary" busy={busy} onClick={save}>Save sale</Button>
      </div>

      <Section title="Collect utang" note="Record a payment against an unpaid sale.">
        {!owed.length ? <p className="ms-muted">No unpaid sales. Everyone is paid up.</p> : <Collect owed={owed} update={update} />}
      </Section>

      <Section title="Recent sales">
        {!sales.length ? <Empty title="No sales yet">Your first sale will appear here.</Empty> : <>
          <Table rows={log} columns={[
            { key: "date", label: "Date" }, { key: "customer", label: "Customer" }, { key: "qty_kg", label: "Qty", num: true, format: (v) => kg(v) },
            { key: "price_per_kg", label: "Price/kg", num: true, format: (v) => peso(v) }, { key: "total", label: "Total", num: true, format: (v) => peso(v) },
            { key: "balance", label: "Balance", num: true, format: (v) => peso(v) }, { key: "created_by", label: "By" },
          ]} />
          <Button onClick={() => downloadCsv("sales.csv", log)}>Download CSV</Button>
        </>}
        <DeletePicker table="sales" rows={sales} describe={(r) => `#${r.id} · ${r.date} · ${r.customer} · ${peso(r.total)}`} />
      </Section>
    </>
  );
}

function Collect({ owed, update }) {
  const [pick, setPick] = useState(String(owed[0].id));
  const row = owed.find((r) => String(r.id) === pick) || owed[0];
  const [amt, setAmt] = useState("");
  const pay = amt === "" ? row.balance : Math.min(Number(amt) || 0, row.balance);
  return (
    <div className="ms-form">
      <div className="ms-grid">
        <Select label="Unpaid sale" value={String(row.id)} onChange={(v) => { setPick(v); setAmt(""); }}
                options={owed.map((r) => [String(r.id), `${r.date} · ${r.customer} · balance ${peso(r.balance)}`])} />
        <NumberInput label="Amount (₱)" step={50} max={row.balance} value={amt === "" ? row.balance : amt} onChange={setAmt} />
      </div>
      <Button kind="primary" disabled={pay <= 0}
              onClick={() => update("sales", row.id, { amount_paid: row.amount_paid + pay }, `Collected ${peso(pay)} from ${row.customer}.`)}>Record payment</Button>
    </div>
  );
}

function Expenses() {
  const { data, insert } = useData();
  const expenses = data.expenses;
  const used = [...new Set(expenses.map((e) => e.category))].filter((x) => x && !c.EXPENSE_CATEGORIES.includes(x)).sort();
  const categories = [...c.EXPENSE_CATEGORIES, ...used];
  const blank = () => ({ date: c.today(), category: categories[0], amount: "", desc: "", payee: "" });
  const [f, setF] = useState(blank);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const today = c.today();
  const month = c.between(expenses, c.monthStart(today), today);
  const log = [...expenses].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

  async function save() {
    const amount = Number(f.amount) || 0;
    if (!f.category.trim()) return setErr("Type a name for the new category.");
    if (amount <= 0) return setErr("Enter an amount above ₱0.");
    const existing = categories.find((x) => x.toLowerCase() === f.category.trim().toLowerCase()); // "rent" reuses "Rent"
    const category = existing || f.category.trim();
    setErr(""); setBusy(true);
    const ok = await insert("expenses", { date: f.date, category, description: f.desc.trim() || null, payee: f.payee.trim() || null, amount },
      `Saved ${category.toLowerCase()} expense of ${peso(amount)}.`);
    setBusy(false);
    if (ok) setF(blank());
  }

  return (
    <>
      <div className="ms-form">
        <div className="ms-grid">
          <div>
            <DateInput value={f.date} onChange={set("date")} />
            <PickOrNew label="Category" newLabel="New category name" options={categories} value={f.category} onChange={set("category")} placeholder="e.g. Load / cellphone" />
            <NumberInput label="Amount (₱)" step={50} value={f.amount} onChange={set("amount")} />
          </div>
          <div>
            <TextInput label="Description" value={f.desc} onChange={set("desc")} placeholder="e.g. 20 L diesel for truck" />
            <TextInput label="Paid to (optional)" value={f.payee} onChange={set("payee")} placeholder="e.g. Petron Brgy. Ilaya" />
          </div>
        </div>
        <p className="ms-muted">Don't enter wages, palay, or the miller's and transport fees here: Labor &amp; Payroll, Palay &amp; Inventory, and Milling &amp; Production already record them.</p>
        {err && <Alert tone="bad">{err}</Alert>}
        <Button kind="primary" busy={busy} onClick={save}>Save expense</Button>
      </div>
      <Section title="This month's overhead">
        {!month.length ? <Empty title="No expenses this month">Electricity, diesel, repairs and other overhead show up here once recorded.</Empty> : <>
          <Stats items={[{ label: "Overhead this month", value: peso(c.sum(month, "amount")), note: `${month.length} entries`, lead: true }]} />
          <Table rows={log} columns={[
            { key: "date", label: "Date" }, { key: "category", label: "Category" }, { key: "description", label: "Description" },
            { key: "payee", label: "Paid to" }, { key: "amount", label: "Amount", num: true, format: (v) => peso(v) }, { key: "created_by", label: "By" },
          ]} />
          <Button onClick={() => downloadCsv("expenses.csv", log)}>Download CSV</Button>
        </>}
        <DeletePicker table="expenses" rows={expenses} describe={(r) => `#${r.id} · ${r.date} · ${r.category} · ${peso(r.amount)}`} />
      </Section>
    </>
  );
}

function Owners() {
  const { data, insert } = useData();
  const owners = data.owner_transactions;
  const cash = c.cashPosition(data);
  const [f, setF] = useState({ date: c.today(), owner: "Marvie", kind: "Capital in", amount: "", notes: "" });
  const [err, setErr] = useState("");
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const per = ["Marvie", "Salome"].map((name) => {
    const o = owners.filter((x) => x.owner === name);
    const cap = c.sum(o.filter((x) => x.kind === "Capital in"), "amount"), draw = c.sum(o.filter((x) => x.kind === "Drawing"), "amount");
    return { label: `${name}: capital − drawings`, value: peso(cap - draw), note: `${peso(cap, 0)} in · ${peso(draw, 0)} out` };
  });
  return (
    <>
      <Stats items={[{ label: "Cash on hand", value: peso(cash.cashOnHand), note: "All accounts", lead: true }, ...per]} />
      <div className="ms-form">
        <div className="ms-grid">
          <div>
            <DateInput value={f.date} onChange={set("date")} />
            <Radio label="Owner" value={f.owner} onChange={set("owner")} options={[["Marvie", "Marvie"], ["Salome", "Salome"]]} />
          </div>
          <div>
            <Radio label="Type" value={f.kind} onChange={set("kind")} options={[["Capital in", "Capital in"], ["Drawing", "Drawing"]]} />
            <NumberInput label="Amount (₱)" step={500} value={f.amount} onChange={set("amount")}
                         help="Capital in: money put into the business. Drawing: money taken out for personal use." />
          </div>
        </div>
        <TextInput label="Notes (optional)" value={f.notes} onChange={set("notes")} />
        {err && <Alert tone="bad">{err}</Alert>}
        <Button kind="primary" onClick={async () => {
          const amount = Number(f.amount) || 0;
          if (amount <= 0) return setErr("Enter an amount above ₱0.");
          setErr("");
          if (await insert("owner_transactions", { date: f.date, owner: f.owner, kind: f.kind, amount, notes: f.notes.trim() || null },
            `Saved ${f.kind.toLowerCase()} of ${peso(amount)} for ${f.owner}.`)) setF((s) => ({ ...s, amount: "", notes: "" }));
        }}>Save</Button>
      </div>
      {owners.length > 0 && <Table rows={[...owners].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)} columns={[
        { key: "date", label: "Date" }, { key: "owner", label: "Owner" }, { key: "kind", label: "Type" },
        { key: "amount", label: "Amount", num: true, format: (v) => peso(v) }, { key: "notes", label: "Notes" },
      ]} />}
      <DeletePicker table="owner_transactions" rows={owners} describe={(r) => `#${r.id} · ${r.date} · ${r.owner} · ${r.kind} · ${peso(r.amount)}`} />
    </>
  );
}
