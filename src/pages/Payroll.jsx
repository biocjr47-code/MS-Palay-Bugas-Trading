import { useMemo, useState } from "react";
import { useAuth } from "../lib/auth.jsx";
import { useData } from "../lib/data.jsx";
import * as c from "../lib/calc.js";
import { num, peso } from "../lib/format.js";
import {
  Alert, Button, DateInput, DeletePicker, Empty, NumberInput, PageHeader, Readout, Section, Select, Stats, Table, Tabs,
  TextInput, downloadCsv, useTab,
} from "../components/ui.jsx";

const unitOf = (basis) => c.PAY_UNIT[basis].replace(/s$/, "");

export default function Payroll() {
  const { data } = useData();
  const { isOwner } = useAuth();
  const tabs = useMemo(() => (isOwner ? ["Log work", "Payroll", "Laborers"] : ["Log work", "Payroll"]), [isOwner]);
  const [tab, setTab] = useTab("payroll", tabs);
  return (
    <>
      <PageHeader title="Labor & Payroll">Pay by the day (arawan) or by output (pakyaw: per sack or per kilo). Log work daily, pay weekly.</PageHeader>
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === "Log work" && <LogWork laborers={data.laborers.filter((l) => l.active)} isOwner={isOwner} />}
      {tab === "Payroll" && <PayrollSummary logs={data.labor_logs} isOwner={isOwner} />}
      {tab === "Laborers" && isOwner && <Crew laborers={data.laborers} />}
    </>
  );
}

function LogWork({ laborers, isOwner }) {
  const { insert } = useData();
  const [who, setWho] = useState(laborers[0] ? String(laborers[0].id) : "");
  const person = laborers.find((l) => String(l.id) === who) || laborers[0];
  const [date, setDate] = useState(c.today());
  const [qty, setQty] = useState("");
  const [rate, setRate] = useState(null); // null = use the laborer's own rate
  const [task, setTask] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  if (!person) return <Empty title="No laborers yet">An owner adds the crew in the Laborers tab, with each person's daily or per-output rate.</Empty>;

  const basis = person.pay_basis;
  const q = qty === "" ? (basis === "Daily" ? 1 : 0) : Number(qty) || 0;
  const r = rate ?? person.rate;
  const amount = Math.round(q * r * 100) / 100;

  async function save() {
    if (q <= 0) return setErr(`Enter the ${c.PAY_UNIT[basis]} worked or handled.`);
    setErr(""); setBusy(true);
    const ok = await insert("labor_logs", {
      date, laborer_id: person.id, laborer_name: person.name, pay_basis: basis, quantity: q, rate: r, amount,
      task: task.trim() || null, paid: false, paid_date: null,
    }, `Logged ${peso(amount)} for ${person.name}.`);
    setBusy(false);
    if (ok) { setQty(""); setRate(null); setTask(""); }
  }

  return (
    <div className="ms-form">
      <div className="ms-grid">
        <div>
          <DateInput value={date} onChange={setDate} />
          <Select label="Laborer" value={String(person.id)} onChange={(v) => { setWho(v); setQty(""); setRate(null); }}
                  options={laborers.map((l) => [String(l.id), `${l.name} — ${l.role || l.pay_basis}`])}
                  help={`Pay basis: ${basis} at ${peso(person.rate)} per ${unitOf(basis)}`} />
        </div>
        <div>
          <NumberInput label={`${c.PAY_UNIT[basis][0].toUpperCase()}${c.PAY_UNIT[basis].slice(1)} ${basis === "Daily" ? "worked" : "handled"}`}
                       step={basis === "Daily" ? 0.5 : basis === "Per sack" ? 1 : 10} value={qty === "" ? (basis === "Daily" ? 1 : "") : qty} onChange={setQty} />
          <NumberInput label="Rate (₱)" step={0.5} value={r} onChange={(v) => setRate(v === "" ? 0 : v)} disabled={!isOwner}
                       help={isOwner ? "Change only for a one-off rate on this entry." : "Only an owner can change rates."} />
          <TextInput label="Task" value={task} onChange={setTask} placeholder="e.g. Loading, Sun-drying, Hauling" />
        </div>
      </div>
      <Readout items={[["Wage for this entry", peso(amount)], ["Computation", `${q} × ${peso(r)}`]]} />
      {err && <Alert tone="bad">{err}</Alert>}
      <Button kind="primary" busy={busy} onClick={save}>Save work log</Button>
    </div>
  );
}

function PayrollSummary({ logs, isOwner }) {
  const { updateMany } = useData();
  const [wkStart, wkEnd] = c.weekBounds(c.today());
  const [start, setStart] = useState(wkStart);
  const [end, setEnd] = useState(wkEnd);
  const rows = c.between(logs, start, end);
  const unpaid = rows.filter((r) => !r.paid);
  const names = [...new Set(unpaid.map((r) => r.laborer_name))].sort();
  const [skip, setSkip] = useState([]);
  const selected = unpaid.filter((r) => !skip.includes(r.laborer_name));

  const summary = Object.values(rows.reduce((m, r) => {
    const k = `${r.laborer_name}|${r.pay_basis}`;
    m[k] ||= { id: k, laborer_name: r.laborer_name, pay_basis: r.pay_basis, quantity: 0, gross: 0, unpaid: 0 };
    m[k].quantity += r.quantity; m[k].gross += r.amount; if (!r.paid) m[k].unpaid += r.amount;
    return m;
  }, {})).sort((a, b) => b.gross - a.gross);

  return (
    <>
      <div className="ms-grid">
        <DateInput label="Pay period from" value={start} onChange={setStart} />
        <DateInput label="to" value={end} onChange={setEnd} />
      </div>
      {!rows.length ? <Empty title="No work logged in this period">Log work in the first tab, or pick another pay period.</Empty> : <>
        <Stats items={[
          { label: "Gross payroll", value: peso(c.sum(rows, "amount")), note: `${new Set(rows.map((r) => r.laborer_name)).size} laborers`, lead: true },
          { label: "Still to pay", value: peso(c.sum(unpaid, "amount")), note: `${unpaid.length} entries` },
          { label: "Already paid", value: peso(c.sum(rows.filter((r) => r.paid), "amount")) },
        ]} />
        <Table rows={summary} columns={[
          { key: "laborer_name", label: "Laborer" }, { key: "pay_basis", label: "Basis" },
          { key: "quantity", label: "Days / output", num: true, format: (v, r) => `${num(v, 1)} ${c.PAY_UNIT[r.pay_basis]}` },
          { key: "gross", label: "Gross pay", num: true, format: (v) => peso(v) },
          { key: "unpaid", label: "Unpaid", num: true, format: (v) => peso(v) },
        ]} />
        {unpaid.length > 0 && (isOwner ? (
          <Section title="Pay out" note="Marks the unpaid entries in this period as paid today.">
            <div className="ms-checks">
              {names.map((n) => (
                <label key={n} className="ms-check"><input type="checkbox" checked={!skip.includes(n)}
                  onChange={(e) => setSkip((s) => (e.target.checked ? s.filter((x) => x !== n) : [...s, n]))} />{n}</label>
              ))}
            </div>
            <Button kind="primary" disabled={!selected.length}
                    onClick={() => updateMany("labor_logs", selected.map((r) => r.id), { paid: true, paid_date: c.today() },
                      `Paid ${peso(c.sum(selected, "amount"))} to ${new Set(selected.map((r) => r.laborer_name)).size} laborer(s).`)}>
              Mark {peso(c.sum(selected, "amount"))} as paid
            </Button>
          </Section>
        ) : <p className="ms-muted">Only an owner can mark wages as paid.</p>)}
        <details className="ms-details">
          <summary>Entries in this period</summary>
          <Table rows={[...rows].sort((a, b) => a.date.localeCompare(b.date))} columns={[
            { key: "date", label: "Date" }, { key: "laborer_name", label: "Laborer" }, { key: "task", label: "Task" },
            { key: "quantity", label: "Qty", num: true }, { key: "rate", label: "Rate", num: true, format: (v) => peso(v) },
            { key: "amount", label: "Amount", num: true, format: (v) => peso(v) },
            { key: "paid", label: "Status", format: (v) => (v ? "Paid" : "Unpaid") },
          ]} />
          <Button onClick={() => downloadCsv(`payroll_${start}_${end}.csv`, rows)}>Download payroll CSV</Button>
        </details>
      </>}
      <DeletePicker table="labor_logs" rows={logs} describe={(r) => `#${r.id} · ${r.date} · ${r.laborer_name} · ${r.quantity} × ${peso(r.rate)}`} />
    </>
  );
}

function Crew({ laborers }) {
  const { insert, update } = useData();
  const blank = { name: "", role: "", basis: "Daily", rate: "" };
  const [f, setF] = useState(blank);
  const [err, setErr] = useState("");
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  const sorted = [...laborers].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  return (
    <>
      <Section title="Add a laborer">
        <div className="ms-form">
          <div className="ms-grid">
            <div>
              <TextInput label="Full name" value={f.name} onChange={set("name")} />
              <TextInput label="Role" value={f.role} onChange={set("role")} placeholder="e.g. Kargador, Truck driver" />
            </div>
            <div>
              <Select label="Pay basis" value={f.basis} onChange={set("basis")} options={c.PAY_BASES}
                      help="Daily = arawan. Per sack / per kg = pakyaw, paid by output." />
              <NumberInput label={`Rate per ${unitOf(f.basis)} (₱)`} step={0.5} value={f.rate} onChange={set("rate")} />
            </div>
          </div>
          {err && <Alert tone="bad">{err}</Alert>}
          <Button kind="primary" onClick={async () => {
            if (!f.name.trim() || !(Number(f.rate) > 0)) return setErr("Enter the laborer's name and a rate above ₱0.");
            setErr("");
            if (await insert("laborers", { name: f.name.trim(), role: f.role.trim() || null, pay_basis: f.basis, rate: Number(f.rate), active: true },
              `Added ${f.name.trim()} to the crew.`)) setF(blank);
          }}>Add laborer</Button>
        </div>
      </Section>
      <Section title="Crew">
        {!laborers.length ? <Empty title="No laborers yet">Add the first one above.</Empty> : (
          <Table rows={sorted} columns={[
            { key: "name", label: "Name" }, { key: "role", label: "Role" }, { key: "pay_basis", label: "Basis" },
            { key: "rate", label: "Rate", num: true, format: (v) => peso(v) },
            { key: "active", label: "Status", format: (v, r) => (
              <button type="button" className="ms-link" onClick={() => update("laborers", r.id, { active: !v }, `${r.name} is now ${v ? "inactive" : "active"}.`)}>
                {v ? "Active · set inactive" : "Inactive · set active"}
              </button>) },
          ]} />
        )}
      </Section>
    </>
  );
}
