// Business rules for the palay buying and rice trading business.
// Milling is done by an outside rice miller; only bigas comes back.
// Dates are ISO strings (YYYY-MM-DD), so they compare correctly as text.

export const SACK_KG = 50;
export const DEFAULT_RECOVERY = 0.62; // bigas received / palay sent, used until milling data exists
export const RECOVERY_RANGE = [60, 65];
export const EXPENSE_CATEGORIES = [
  "Electricity", "Diesel & fuel", "Repairs & maintenance", "Sacks & packaging", "Hauling & transport",
  "Rent", "Permits & taxes", "Food & snacks for crew", "Miscellaneous",
];
export const PAY_BASES = ["Daily", "Per sack", "Per kg"];
export const PAY_UNIT = { Daily: "days", "Per sack": "sacks", "Per kg": "kg" };

export function today() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }); // Philippines date, YYYY-MM-DD
}
export function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function weekBounds(iso) {
  const day = (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  const start = addDays(iso, -day);
  return [start, addDays(start, 6)];
}
export const monthStart = (iso) => `${iso.slice(0, 8)}01`;

export const sum = (rows, col) => rows.reduce((t, r) => t + (Number(r[col]) || 0), 0);
export const between = (rows, start, end) => rows.filter((r) => r.date >= start && r.date <= end);
const upTo = (rows, end) => (end ? rows.filter((r) => r.date <= end) : rows);

// ---------- Inventory ----------
export function avgPalayCost(purchases, end) {
  const p = upTo(purchases, end);
  const kgs = sum(p, "net_kg");
  return kgs ? sum(p, "total_cost") / kgs : 0;
}
export function recoveryRate(milling, end) {
  const m = upTo(milling, end);
  const palay = sum(m, "palay_kg");
  return palay ? sum(m, "rice_kg") / palay : DEFAULT_RECOVERY;
}
/** Miller's fee plus transportation, per kilo of palay milled. */
export function avgMillingCost(milling, end) {
  const m = upTo(milling, end);
  const kgs = sum(m, "palay_kg");
  return kgs ? (sum(m, "milling_fee") + sum(m, "transport_fee")) / kgs : 0;
}
/** Cost of one kilo of bigas = (palay cost + miller & transport, per kilo of palay) / recovery. */
export function riceUnitCost(purchases, milling, end) {
  const rec = recoveryRate(milling, end);
  return rec ? (avgPalayCost(purchases, end) + avgMillingCost(milling, end)) / rec : 0;
}
export function palayStock(purchases, milling) {
  return { kg: sum(purchases, "net_kg") - sum(milling, "palay_kg"), sacks: sum(purchases, "sacks") - sum(milling, "sacks") };
}
export function bigasStock(milling, sales) {
  const made = sum(milling, "rice_kg");
  const sold = sum(sales.filter((s) => s.product === "Bigas"), "qty_kg");
  return { made, sold, onHand: made - sold };
}

// ---------- Profit ----------
function groupSum(rows, key, col) {
  const out = {};
  for (const r of rows) out[r[key]] = (out[r[key]] || 0) + (Number(r[col]) || 0);
  return Object.entries(out).sort((a, b) => b[1] - a[1]);
}

export function pnl(data, start, end) {
  const sales = between(data.sales, start, end);
  const expenses = between(data.expenses, start, end);
  const labor = between(data.labor_logs, start, end);
  const unitCost = riceUnitCost(data.palay_purchases, data.milling_runs, end);
  const revenue = sum(sales, "total");
  const cogs = sum(sales.filter((s) => s.product === "Bigas"), "qty_kg") * unitCost;
  const overhead = sum(expenses, "amount");
  const payroll = sum(labor, "amount");
  const gross = revenue - cogs;
  const net = gross - overhead - payroll;
  return {
    revenue, cogs, gross, overhead, payroll, net, unitCost,
    margin: revenue ? net / revenue : 0,
    palayCostPerKg: avgPalayCost(data.palay_purchases, end),
    millingPerKg: avgMillingCost(data.milling_runs, end),
    recovery: recoveryRate(data.milling_runs, end),
    byProduct: groupSum(sales, "product", "total"),
    byCategory: groupSum(expenses, "category", "amount"),
  };
}

export function dailyNet(data, start, end) {
  const unitCost = riceUnitCost(data.palay_purchases, data.milling_runs, end);
  const days = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  const perDay = (rows, value) => {
    const m = {};
    for (const r of between(rows, start, end)) m[r.date] = (m[r.date] || 0) + value(r);
    return m;
  };
  const rev = perDay(data.sales, (r) => Number(r.total) || 0);
  const cogs = perDay(data.sales, (r) => (r.product === "Bigas" ? (Number(r.qty_kg) || 0) * unitCost : 0));
  const over = perDay(data.expenses, (r) => Number(r.amount) || 0);
  const pay = perDay(data.labor_logs, (r) => Number(r.amount) || 0);
  return days.map((date) => {
    const revenue = rev[date] || 0;
    const costs = (cogs[date] || 0) + (over[date] || 0) + (pay[date] || 0);
    return { date, revenue, costs, net: revenue - costs };
  });
}

// ---------- Cash ----------
export function cashPosition(data) {
  const owners = data.owner_transactions;
  const capital = sum(owners.filter((o) => o.kind === "Capital in"), "amount");
  const drawings = sum(owners.filter((o) => o.kind === "Drawing"), "amount");
  const wagesPaid = sum(data.labor_logs.filter((l) => l.paid), "amount");
  const wagesDue = sum(data.labor_logs.filter((l) => !l.paid), "amount");
  const cashIn = sum(data.sales, "amount_paid") + capital;
  const cashOut = sum(data.palay_purchases, "amount_paid") + sum(data.milling_runs, "milling_fee")
    + sum(data.milling_runs, "transport_fee") + sum(data.expenses, "amount") + wagesPaid + drawings;
  return {
    cashOnHand: cashIn - cashOut,
    receivables: sum(data.sales, "total") - sum(data.sales, "amount_paid"),
    farmerPayables: sum(data.palay_purchases, "total_cost") - sum(data.palay_purchases, "amount_paid"),
    wagesDue, capital, drawings,
  };
}
