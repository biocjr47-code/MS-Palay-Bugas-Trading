import { useState } from "react";
import { useData } from "../lib/data.jsx";
import * as c from "../lib/calc.js";
import { kg, num, peso, pct } from "../lib/format.js";
import {
  Alert, Button, DateInput, DeletePicker, Empty, NumberInput, PageHeader, PickOrNew, Readout, Stats, Table, Tabs,
  TextInput, downloadCsv, useTab,
} from "../components/ui.jsx";

const TABS = ["Send to miller", "Bigas stock", "Milling history"];
const [LOW, HIGH] = c.RECOVERY_RANGE;

export default function Milling() {
  const { data, insert } = useData();
  const runs = data.milling_runs;
  const [tab, setTab] = useTab("milling", TABS);

  const latest = [...runs].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id).at(-1);
  const millers = [...new Set(runs.map((r) => r.miller).filter(Boolean))].sort();
  const blank = () => ({
    date: c.today(), miller: latest?.miller || "", sacks: "", palay: "", rice: "",
    fee: latest?.fee_per_sack || "", transport: latest?.transport_per_sack || "", notes: "",
  });
  const [f, setF] = useState(blank);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));

  const stock = c.palayStock(data.palay_purchases, runs);
  const sacks = Number(f.sacks) || 0, palay = Number(f.palay) || 0, rice = Number(f.rice) || 0;
  const fee = sacks * (Number(f.fee) || 0), transport = sacks * (Number(f.transport) || 0);
  const recovery = palay ? (rice / palay) * 100 : 0;

  async function save() {
    const missing = [!f.miller.trim() && "the rice miller", sacks <= 0 && "the sacks sent", palay <= 0 && "the palay weight",
      rice <= 0 && "the bigas brought back"].filter(Boolean);
    if (missing.length) return setErr(`Please enter ${missing.join(", ")}.`);
    if (rice > palay) return setErr("The bigas weighs more than the palay sent. Check the two weights.");
    setErr(""); setBusy(true);
    const ok = await insert("milling_runs", {
      date: f.date, miller: f.miller.trim(), sacks, palay_kg: palay, rice_kg: rice, recovery_pct: Math.round(recovery * 100) / 100,
      fee_per_sack: Number(f.fee) || 0, milling_fee: fee, transport_per_sack: Number(f.transport) || 0, transport_fee: transport,
      notes: f.notes.trim() || null,
    }, `Saved: ${sacks} sacks → ${kg(rice, 0)} bigas. Miller ${peso(fee)} + transport ${peso(transport)}.`);
    setBusy(false);
    if (ok) setF({ ...blank(), miller: f.miller, fee: f.fee, transport: f.transport });
  }

  const bigas = c.bigasStock(runs, data.sales);
  const unitCost = c.riceUnitCost(data.palay_purchases, runs);
  const today = c.today();
  const month = c.between(runs, c.monthStart(today), today);
  const last7 = c.between(runs, c.addDays(today, -6), today);
  const log = [...runs].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

  return (
    <>
      <PageHeader title="Milling & Production">
        Take palay sacks from the warehouse to the rice miller and record the bigas you bring back. A healthy recovery is {LOW}–{HIGH}% of the palay weight.
      </PageHeader>
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "Send to miller" && (
        <div className="ms-form">
          <div className="ms-grid">
            <div>
              <DateInput value={f.date} onChange={set("date")} />
              <PickOrNew label="Rice miller" newLabel="Rice miller's name" options={millers} value={f.miller} onChange={set("miller")} placeholder="e.g. Sta. Barbara Rice Mill" />
              <NumberInput label="Sacks of palay sent" value={f.sacks} onChange={set("sacks")}
                           help={`In the warehouse now: ${num(stock.sacks)} sacks · ${kg(stock.kg, 0)}.`} />
              <NumberInput label="Palay weight sent (kg)" step={10} value={f.palay} onChange={set("palay")} help="Total scale weight of the sacks you took to the miller." />
            </div>
            <div>
              <NumberInput label="Bigas brought back (kg)" step={10} value={f.rice} onChange={set("rice")} help="Weight of the milled rice you received." />
              <NumberInput label="Miller's fee per sack (₱)" value={f.fee} onChange={set("fee")} help="Filled in with last trip's rate. Change it if the price changed." />
              <NumberInput label="Transportation fee per sack (₱)" value={f.transport} onChange={set("transport")} help="Hauling the palay to the miller and the bigas back." />
              <TextInput label="Notes (optional)" value={f.notes} onChange={set("notes")} />
            </div>
          </div>
          <Readout items={[
            ["Recovery", palay && rice ? pct(recovery) : "—"], ["Miller's fee", peso(fee)], ["Transportation", peso(transport)],
            ["Total for this trip", peso(fee + transport)], ["Left in warehouse", `${num(stock.sacks - sacks)} sacks · ${kg(stock.kg - palay, 0)}`],
          ]} />
          {palay > 0 && rice > 0 && (recovery < LOW || recovery > HIGH + 3) &&
            <Alert>Recovery of {recovery.toFixed(1)}% is outside the usual {LOW}–{HIGH}%. Double-check both weights before saving.</Alert>}
          {(sacks > stock.sacks || palay > stock.kg + 0.5) &&
            <p className="ms-muted">This is more palay than the warehouse record shows. You can still save it; a palay purchase may be missing.</p>}
          {err && <Alert tone="bad">{err}</Alert>}
          <Button kind="primary" busy={busy} onClick={save}>Save milling</Button>
        </div>
      )}

      {tab === "Bigas stock" && (
        <>
          <Stats items={[
            { label: "Bigas on hand", value: kg(bigas.onHand, 0), note: `${num(bigas.onHand / c.SACK_KG, 1)} sacks of 50 kg`, lead: true },
            { label: "Value at cost", value: peso(bigas.onHand * unitCost), note: `${peso(unitCost)} per kg` },
            { label: "Brought back from miller", value: kg(bigas.made, 0), note: "All time" },
            { label: "Sold", value: kg(bigas.sold, 0), note: "All time" },
          ]} />
          {!runs.length && <Empty title="No milling recorded yet">Record a trip to the rice miller in the first tab and your bigas stock counts up here.</Empty>}
          {bigas.onHand < -0.5 && <Alert>Bigas stock is negative: more was sold than brought back from the miller. A milling entry may be missing.</Alert>}
        </>
      )}

      {tab === "Milling history" && (
        <>
          {!runs.length ? <Empty title="No milling recorded yet">Every trip to the rice miller appears here with its recovery and fees.</Empty> : <>
            <Stats items={[
              { label: "Average recovery", value: pct(c.recoveryRate(runs) * 100), note: `Target ${LOW}–${HIGH}%`, lead: true },
              { label: "Miller's fees this month", value: peso(c.sum(month, "milling_fee")), note: `${month.length} trips` },
              { label: "Transportation this month", value: peso(c.sum(month, "transport_fee")), note: `${num(c.sum(month, "sacks"))} sacks` },
              { label: "Bigas back, 7 days", value: kg(c.sum(last7, "rice_kg"), 0), note: `${num(c.sum(last7, "rice_kg") / c.SACK_KG)} sacks` },
            ]} />
            <Table rows={log} columns={[
              { key: "date", label: "Date" }, { key: "miller", label: "Rice miller" }, { key: "sacks", label: "Sacks", num: true },
              { key: "palay_kg", label: "Palay sent", num: true, format: (v) => kg(v) },
              { key: "rice_kg", label: "Bigas back", num: true, format: (v) => kg(v) },
              { key: "recovery_pct", label: "Recovery", num: true, format: (v) => pct(v) },
              { key: "milling_fee", label: "Miller's fee", num: true, format: (v) => peso(v) },
              { key: "transport_fee", label: "Transport", num: true, format: (v) => peso(v) },
            ]} />
            <Button onClick={() => downloadCsv("milling.csv", log)}>Download CSV</Button>
          </>}
          <DeletePicker table="milling_runs" rows={runs}
                        describe={(r) => `#${r.id} · ${r.date} · ${r.miller || ""} · ${num(r.sacks)} sacks → ${kg(r.rice_kg, 0)}`} />
        </>
      )}
    </>
  );
}
