import { useEffect, useId, useState } from "react";
import { useAuth } from "../lib/auth.jsx";
import { useData } from "../lib/data.jsx";

export function PageHeader({ title, children }) {
  return (
    <div className="ms-head">
      <h1>{title}</h1>
      {children && <p>{children}</p>}
    </div>
  );
}

export function Section({ title, note, children }) {
  return (
    <section className="ms-section">
      <h3>{title}</h3>
      {note && <p className="note">{note}</p>}
      {children}
    </section>
  );
}

/** items: [{ label, value, note, lead }] — hairline-divided, no boxed cards. */
export function Stats({ items }) {
  return (
    <div className="ms-stats">
      {items.map((s) => (
        <div className="ms-stat" key={s.label}>
          <div className="label">{s.label}</div>
          <div className={`value${s.lead ? " lead" : ""}`} title={s.value}>{s.value}</div>
          {s.note && <div className="note">{s.note}</div>}
        </div>
      ))}
    </div>
  );
}

export function Readout({ items }) {
  return (
    <div className="ms-readout" aria-live="polite">
      {items.map(([k, v]) => <div key={k}>{k}<b>{v}</b></div>)}
    </div>
  );
}

export function Empty({ title, children }) {
  return <div className="ms-empty"><strong>{title}</strong>{children}</div>;
}

export function Alert({ tone = "warn", children }) {
  return <div className={`ms-alert ${tone}`} role={tone === "bad" ? "alert" : "status"}>{children}</div>;
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="ms-tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t} role="tab" type="button" aria-selected={active === t} onClick={() => onChange(t)}>{t}</button>
      ))}
    </div>
  );
}

/** Remembers the selected tab per page while the app is open. */
export function useTab(page, tabs) {
  const [tab, setTab] = useState(() => {
    const saved = sessionStorage.getItem(`tab.${page}`);
    return tabs.includes(saved) ? saved : tabs[0];
  });
  useEffect(() => { if (!tabs.includes(tab)) setTab(tabs[0]); }, [tabs.join("|")]); // eslint-disable-line
  return [tab, (t) => { sessionStorage.setItem(`tab.${page}`, t); setTab(t); }];
}

// ---------- Form fields: label above, help below ----------
function Field({ label, help, children, id }) {
  return (
    <div className="ms-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {help && <small>{help}</small>}
    </div>
  );
}

export function TextInput({ label, help, value, onChange, type = "text", placeholder, autoComplete, disabled }) {
  const id = useId();
  return (
    <Field label={label} help={help} id={id}>
      <input id={id} type={type} value={value} placeholder={placeholder} autoComplete={autoComplete} disabled={disabled}
             onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export function NumberInput({ label, help, value, onChange, step = 1, min = 0, max, disabled }) {
  const id = useId();
  return (
    <Field label={label} help={help} id={id}>
      <input id={id} type="number" inputMode="decimal" step={step} min={min} max={max} disabled={disabled}
             value={value === 0 || value ? value : ""} placeholder="0"
             onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
             onFocus={(e) => e.target.select()} />
    </Field>
  );
}

export function DateInput({ label = "Date", value, onChange }) {
  const id = useId();
  return (
    <Field label={label} id={id}>
      <input id={id} type="date" value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export function Select({ label, help, value, onChange, options, placeholder }) {
  const id = useId();
  return (
    <Field label={label} help={help} id={id}>
      <select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        {placeholder && <option value="" disabled>{placeholder}</option>}
        {options.map((o) => {
          const [v, text] = Array.isArray(o) ? o : [o, o];
          return <option key={v} value={v}>{text}</option>;
        })}
      </select>
    </Field>
  );
}

export function Toggle({ label, checked, onChange }) {
  return (
    <label className="ms-toggle">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span aria-hidden="true" />{label}
    </label>
  );
}

export function Radio({ label, value, onChange, options }) {
  return (
    <fieldset className="ms-field ms-radio">
      <legend>{label}</legend>
      <div>
        {options.map(([v, text]) => (
          <label key={v}><input type="radio" checked={value === v} onChange={() => onChange(v)} />{text}</label>
        ))}
      </div>
    </fieldset>
  );
}

/** Pick an existing name or type a new one (farmers, customers, millers, categories). */
export function PickOrNew({ label, newLabel, options, value, onChange, placeholder }) {
  const NEW = "__new__";
  const [mode, setMode] = useState(options.length ? "pick" : "new");
  useEffect(() => { if (!options.length) setMode("new"); }, [options.length]);
  return (
    <>
      {options.length > 0 && (
        <Select label={label} value={mode === "new" ? NEW : value} placeholder="Choose…"
                options={[...options, [NEW, `New ${label.toLowerCase()}…`]]}
                onChange={(v) => { if (v === NEW) { setMode("new"); onChange(""); } else { setMode("pick"); onChange(v); } }} />
      )}
      {mode === "new" && <TextInput label={newLabel} value={value} onChange={onChange} placeholder={placeholder} />}
    </>
  );
}

export function Button({ children, kind = "secondary", busy, ...props }) {
  return (
    <button type="button" className={`ms-btn ${kind}`} disabled={busy || props.disabled} {...props}>
      {busy ? "Saving…" : children}
    </button>
  );
}

// ---------- Table ----------
export function Table({ rows, columns, maxHeight = 420, empty = "Nothing here yet." }) {
  if (!rows.length) return <p className="ms-muted">{empty}</p>;
  return (
    <div className="ms-table" style={{ maxHeight }}>
      <table>
        <thead><tr>{columns.map((c) => <th key={c.key} className={c.num ? "num" : ""}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id ?? i}>
              {columns.map((c) => (
                <td key={c.key} className={c.num ? "num" : ""}>{c.format ? c.format(r[c.key], r) : (r[c.key] ?? "")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function downloadCsv(filename, rows) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Owners can delete a wrong entry; staff are told to ask an owner. */
export function DeletePicker({ table, rows, describe }) {
  const { isOwner } = useAuth();
  const { remove } = useData();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState("");
  const [sure, setSure] = useState(false);
  if (!isOwner) return <p className="ms-muted">Made a mistake? Ask Marvie or Salome to delete the entry.</p>;
  const recent = [...rows].sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.id - a.id).slice(0, 200);
  return (
    <details className="ms-details" open={open} onToggle={(e) => setOpen(e.target.open)}>
      <summary>Fix a mistake: delete an entry</summary>
      {!recent.length ? <p className="ms-muted">Nothing to delete yet.</p> : (
        <>
          <Select label="Entry" value={pick} placeholder="Choose the entry…" onChange={setPick}
                  options={recent.map((r) => [String(r.id), describe(r)])} />
          <label className="ms-check"><input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} />
            Yes, delete this entry for good</label>
          <Button kind="danger" disabled={!pick || !sure}
                  onClick={async () => { if (await remove(table, Number(pick), "Entry deleted.")) { setPick(""); setSure(false); } }}>
            Delete entry
          </Button>
        </>
      )}
    </details>
  );
}

export function Toast() {
  const { toast, clearToast } = useData();
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(clearToast, toast.tone === "bad" ? 7000 : 3500);
    return () => clearTimeout(t);
  }, [toast]); // eslint-disable-line
  if (!toast) return null;
  return <div className={`ms-toast ${toast.tone}`} role="status" onClick={clearToast}>{toast.message}</div>;
}
