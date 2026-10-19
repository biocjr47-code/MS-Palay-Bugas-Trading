import { useAuth } from "../lib/auth.jsx";
import { useData } from "../lib/data.jsx";
import * as c from "../lib/calc.js";
import { kg, longDate, num, peso, pct, shortDate } from "../lib/format.js";
import { Empty, PageHeader, Section, Stats, Table } from "../components/ui.jsx";
import { NetBars } from "../components/charts.jsx";

export default function Dashboard() {
  const { data } = useData();
  const { user, isOwner } = useAuth();
  const today = c.today();
  const hour = Number(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila", hour: "numeric", hour12: false }));
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const palay = c.palayStock(data.palay_purchases, data.milling_runs);
  const bigas = c.bigasStock(data.milling_runs, data.sales);
  const salesToday = c.between(data.sales, today, today);
  const s = salesToday.length === 1 ? "" : "s";

  const feed = [
    ...data.sales.map((r) => ({ ...r, type: "Sale", detail: `${kg(r.qty_kg, 0)} ${r.product} to ${r.customer}`, amt: r.total })),
    ...data.palay_purchases.map((r) => ({ ...r, type: "Palay bought", detail: `${kg(r.net_kg, 0)} palay from ${r.farmer}`, amt: -r.total_cost })),
    ...data.milling_runs.map((r) => ({ ...r, type: "Milling", detail: `${num(r.sacks)} sacks palay → ${kg(r.rice_kg, 0)} bigas at ${r.miller || "rice miller"}`, amt: -(r.milling_fee + r.transport_fee) })),
    ...data.expenses.map((r) => ({ ...r, type: "Expense", detail: [r.category, r.description].filter(Boolean).join(": "), amt: -r.amount })),
  ].sort((a, b) => b.date.localeCompare(a.date) || (b.created_at || "").localeCompare(a.created_at || "")).slice(0, 10)
    .map((r, i) => ({ ...r, id: `${r.type}-${r.id}-${i}` }));

  return (
    <>
      <div className="ms-hero">
        <div>
          <PageHeader title={`${greeting}, ${user.name.split(" ")[0]}`}>{longDate(today)} · Here is how the business stands today.</PageHeader>
          {isOwner ? (() => {
            const day = c.pnl(data, today, today);
            return <Stats items={[
              { label: "Net profit today", value: peso(day.net), note: `${pct(day.margin * 100)} of sales`, lead: true },
              { label: "Sales today", value: peso(day.revenue), note: `${salesToday.length} sale${s}` },
              { label: "Costs today", value: peso(day.cogs + day.overhead + day.payroll), note: "Rice cost, overhead & wages" },
            ]} />;
          })() : <Stats items={[
            { label: "Sales today", value: peso(c.sum(salesToday, "total")), note: `${salesToday.length} sale${s}`, lead: true },
            { label: "Palay in warehouse", value: `${num(palay.sacks)} sacks`, note: kg(palay.kg, 0) },
            { label: "Bigas on hand", value: kg(bigas.onHand, 0), note: `${num(bigas.onHand / c.SACK_KG, 1)} sacks of 50 kg` },
          ]} />}
        </div>
        <iframe className="ms-sack" src="/sack.html" title="3D Lami-ang Bugas rice sack; drag to turn it" tabIndex={-1} loading="lazy" />
      </div>

      {isOwner && (() => {
        const cash = c.cashPosition(data);
        const avg = c.avgPalayCost(data.palay_purchases);
        const series = c.dailyNet(data, c.addDays(today, -29), today);
        const month = c.pnl(data, c.addDays(today, -29), today);
        const best = series.reduce((b, d) => (d.net > b.net ? d : b), series[0]);
        const active = series.some((d) => d.revenue || d.costs);
        return <>
          <Section title="Cash flow" note="Cash on hand counts money actually received and paid out, plus owners' capital.">
            <Stats items={[
              { label: "Cash on hand", value: peso(cash.cashOnHand), note: "Capital + collections − payments" },
              { label: "Receivables (utang)", value: peso(cash.receivables), note: "Unpaid by customers" },
              { label: "Owed to farmers", value: peso(cash.farmerPayables), note: "Unpaid palay" },
              { label: "Wages due", value: peso(cash.wagesDue), note: "Logged, not yet paid" },
            ]} />
          </Section>
          <Section title="Inventory on hand">
            <Stats items={[
              { label: "Palay in warehouse", value: `${num(palay.sacks)} sacks`, note: `${kg(palay.kg, 0)} · not yet milled` },
              { label: "Palay value", value: peso(palay.kg * avg, 0), note: `At ${peso(avg)}/kg bought` },
              { label: "Bigas on hand", value: kg(bigas.onHand, 0), note: `${num(bigas.onHand / c.SACK_KG, 1)} sacks of 50 kg` },
              { label: "Bigas value", value: peso(bigas.onHand * c.riceUnitCost(data.palay_purchases, data.milling_runs), 0), note: "At cost, incl. miller & transport" },
            ]} />
          </Section>
          <Section title="Daily net profit, last 30 days" note="Sales minus estimated rice cost, overhead and wages for each day.">
            {!active ? <Empty title="No sales or costs in the last 30 days">Record a sale or a palay purchase and this chart fills in.</Empty> : <>
              <NetBars series={series} />
              <Stats items={[
                { label: "30-day net profit", value: peso(month.net), note: `${pct(month.margin * 100)} net margin` },
                { label: "30-day sales", value: peso(month.revenue) },
                { label: "Best day", value: peso(best.net), note: shortDate(best.date) },
                { label: "Rice cost per kg", value: peso(month.unitCost), note: "Palay + miller & transport ÷ recovery" },
              ]} />
            </>}
          </Section>
        </>;
      })()}

      <Section title="Latest entries">
        {!feed.length ? <Empty title="Nothing recorded yet">Start with Palay &amp; Inventory: record the first palay you buy. Every page feeds this dashboard.</Empty> : (
          <Table rows={feed} columns={[
            { key: "date", label: "Date" }, { key: "type", label: "Type" }, { key: "detail", label: "Detail" },
            { key: "amt", label: "Amount", num: true, format: (v) => (v ? peso(v) : "") },
            { key: "created_by", label: "Entered by" },
          ]} />
        )}
      </Section>
    </>
  );
}
