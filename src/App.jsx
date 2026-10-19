import { useEffect, useState } from "react";
import { AuthProvider, useAuth } from "./lib/auth.jsx";
import { DataProvider, useData } from "./lib/data.jsx";
import { configured } from "./lib/supabase.js";
import { Toast } from "./components/ui.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Palay from "./pages/Palay.jsx";
import Milling from "./pages/Milling.jsx";
import Payroll from "./pages/Payroll.jsx";
import Finance from "./pages/Finance.jsx";
import Users from "./pages/Users.jsx";

// Icons: one consistent 1.6px stroke set, drawn as SVG.
const ICONS = {
  dashboard: "M3 3h6v8H3zM11 3h6v5h-6zM11 10h6v7h-6zM3 13h6v4H3z",
  palay: "M3 6l7-3 7 3v9l-7 3-7-3zM3 6l7 3 7-3M10 9v9",
  milling: "M4 17V9l4-3v3l4-3v3l4-3v11zM7 17v-3h2v3M12 12h2",
  payroll: "M4 5h12v11H4zM7 3v4M13 3v4M7 10h6M7 13h4",
  finance: "M3 6h14v10H3zM3 9h14M13 13h2",
  users: "M8 9a3 3 0 100-6 3 3 0 000 6zM2 17c0-3 3-5 6-5s6 2 6 5M14 7a2.5 2.5 0 110-5M15 12c2 .5 3.5 2 3.5 4.5",
  logout: "M8 4H4v12h4M12 7l4 3-4 3M16 10H8",
  menu: "M3 6h14M3 10h14M3 14h14",
};
const Icon = ({ name }) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={ICONS[name]} />
  </svg>
);

function pagesFor(isOwner) {
  return [
    { id: "dashboard", title: "Dashboard", icon: "dashboard", Page: Dashboard },
    { id: "palay", title: "Palay & Inventory", icon: "palay", Page: Palay },
    { id: "milling", title: "Milling & Production", icon: "milling", Page: Milling },
    { id: "payroll", title: "Labor & Payroll", icon: "payroll", Page: Payroll },
    { id: "finance", title: isOwner ? "Sales, Expenses & P&L" : "Sales & Expenses", icon: "finance", Page: Finance },
    ...(isOwner ? [{ id: "users", title: "Users", icon: "users", Page: Users }] : []),
  ];
}

function useHashPage(pages) {
  const read = () => {
    const id = window.location.hash.replace("#/", "");
    return pages.some((p) => p.id === id) ? id : "dashboard";
  };
  const [page, setPage] = useState(read);
  useEffect(() => {
    const onHash = () => setPage(read());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  });
  useEffect(() => { if (!pages.some((p) => p.id === page)) setPage("dashboard"); }, [pages.length]); // eslint-disable-line
  return page;
}

function Shell() {
  const { user, isOwner, signOut } = useAuth();
  const { data, error, reloadAll } = useData();
  const pages = pagesFor(isOwner);
  const current = useHashPage(pages);
  const [menuOpen, setMenuOpen] = useState(false);
  const { Page, title } = pages.find((p) => p.id === current) || pages[0];
  useEffect(() => { document.title = `${title} · MS Lami-ang Bugas`; setMenuOpen(false); window.scrollTo(0, 0); }, [title]);

  return (
    <div className="ms-app">
      <aside className={`ms-side${menuOpen ? " open" : ""}`}>
        <div className="ms-brand">
          <img src="/logo.svg" alt="MS Lami-ang Bugas" />
          <button className="ms-menu-btn" type="button" aria-label="Menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
            <Icon name="menu" />
          </button>
        </div>
        <nav aria-label="Main">
          {pages.map((p) => (
            <a key={p.id} href={`#/${p.id}`} aria-current={p.id === current ? "page" : undefined}>
              <Icon name={p.icon} />{p.title}
            </a>
          ))}
        </nav>
        <div className="ms-user">
          <b>{user.name}</b>
          <span>{isOwner ? "Owner" : "Staff"} · {user.username}</span>
          <button type="button" className="ms-btn secondary wide" onClick={signOut}><Icon name="logout" />Log out</button>
          <small>Owned by Marvie &amp; Salome</small>
        </div>
      </aside>
      <main className="ms-main">
        {error ? (
          <div className="ms-alert bad" role="alert">
            Could not load the records: {error}{" "}
            <button type="button" className="ms-link" onClick={reloadAll}>Try again</button>
          </div>
        ) : !data ? (
          <div aria-label="Loading records"><div className="ms-skeleton title" /><div className="ms-skeleton" /><div className="ms-skeleton" /></div>
        ) : <Page />}
      </main>
      <Toast />
    </div>
  );
}

function Gate() {
  const { ready, user } = useAuth();
  if (!ready) return <div className="ms-main"><div className="ms-skeleton title" /></div>;
  if (!user) return <Login />;
  return <DataProvider key={user.id}><Shell /></DataProvider>;
}

export default function App() {
  if (!configured) {
    return (
      <div className="ms-main">
        <div className="ms-alert bad" role="alert">
          The app is missing its Supabase settings. Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>
          {" "}(in <code>.env.local</code> on this computer, or in Vercel → Settings → Environment Variables), then rebuild.
        </div>
      </div>
    );
  }
  return <AuthProvider><Gate /></AuthProvider>;
}
