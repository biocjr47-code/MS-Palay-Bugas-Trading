// Philippine Peso and weight formatting.
const money = (d) => new Intl.NumberFormat("en-PH", { minimumFractionDigits: d, maximumFractionDigits: d });

export function peso(value, decimals = 2) {
  const v = Number(value) || 0;
  return `${v < 0 ? "−" : ""}₱${money(decimals).format(Math.abs(v))}`;
}

export function kg(value, decimals = 1) {
  return `${money(decimals).format(Number(value) || 0)} kg`;
}

export function num(value, decimals = 0) {
  return money(decimals).format(Number(value) || 0);
}

export function pct(value, decimals = 1) {
  return `${(Number(value) || 0).toFixed(decimals)}%`;
}

export function longDate(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export function shortDate(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}
