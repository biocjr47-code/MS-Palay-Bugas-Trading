import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "./supabase.js";

export const TABLES = ["palay_purchases", "milling_runs", "sales", "laborers", "labor_logs", "expenses", "owner_transactions"];
const NUMERIC = new Set(["sacks", "gross_kg", "net_kg", "price_per_kg", "total_cost", "amount_paid", "palay_kg", "rice_kg",
  "recovery_pct", "fee_per_sack", "milling_fee", "transport_per_sack", "transport_fee", "qty_kg", "total", "rate", "quantity", "amount"]);
const PAGE = 1000; // Supabase returns at most 1000 rows per request

function clean(row) {
  const out = { ...row };
  for (const k of Object.keys(out)) if (NUMERIC.has(k)) out[k] = Number(out[k]) || 0;
  return out;
}

async function fetchTable(table) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select("*").order("id").range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...data.map(clean));
    if (data.length < PAGE) return rows;
  }
}

function friendly(error) {
  const msg = error?.message || String(error);
  if (/row-level security|permission denied/i.test(msg)) return "Your account isn't allowed to do this. Ask an owner.";
  if (/fetch|network/i.test(msg)) return "No internet connection. Check it and try again.";
  return msg;
}

const DataContext = createContext(null);

export function DataProvider({ children }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  const loadAll = useCallback(async () => {
    try {
      const results = await Promise.all(TABLES.map(fetchTable));
      setData(Object.fromEntries(TABLES.map((t, i) => [t, results[i]])));
      setError(null);
    } catch (e) {
      setError(friendly(e));
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const reload = useCallback(async (table) => {
    const rows = await fetchTable(table);
    setData((d) => ({ ...d, [table]: rows }));
  }, []);

  const flash = useCallback((message, tone = "ok") => {
    setToast({ message, tone, id: Date.now() });
  }, []);

  // Writes return true on success; on failure they show the reason and return false.
  const run = useCallback(async (table, op, message) => {
    const { error: err } = await op;
    if (err) { flash(friendly(err), "bad"); return false; }
    await reload(table);
    if (message) flash(message);
    return true;
  }, [reload, flash]);

  const api = {
    data, error, toast, flash, reloadAll: loadAll,
    clearToast: () => setToast(null),
    insert: (table, row, message) => run(table, supabase.from(table).insert(row), message),
    update: (table, id, values, message) => run(table, supabase.from(table).update(values).eq("id", id), message),
    updateMany: (table, ids, values, message) => run(table, supabase.from(table).update(values).in("id", ids), message),
    remove: (table, id, message) => run(table, supabase.from(table).delete().eq("id", id), message),
  };
  return <DataContext.Provider value={api}>{children}</DataContext.Provider>;
}

export const useData = () => useContext(DataContext);
