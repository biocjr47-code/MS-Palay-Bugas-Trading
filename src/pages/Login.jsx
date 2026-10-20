import { useState } from "react";
import { useAuth } from "../lib/auth.jsx";
import { PasswordInput } from "../components/ui.jsx";

export default function Login() {
  const { signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!username.trim() || !password) return setErr("Enter your username and password.");
    setBusy(true); setErr("");
    const msg = await signIn(username.trim().toLowerCase(), password);
    setBusy(false);
    if (msg) setErr(msg);
  }

  return (
    <div className="ms-login">
      <header><img src="/logo.svg" alt="MS Lami-ang Bugas" /></header>
      <main>
        <section>
          <h1>Every sack of palay, every peso, in one place.</h1>
          <p className="lead">The records system of MS Lami-ang Bugas: palay bought from farmers, trips to the rice miller,
            bigas sold, wages and expenses, with the day's profit kept up to date for Marvie and Salome.</p>
          <form onSubmit={submit} className="ms-login-form" noValidate>
            <div className="ms-field">
              <label htmlFor="u">Username</label>
              <input id="u" autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <PasswordInput id="p" label="Password" autoComplete="current-password" value={password} onChange={setPassword} />
            {err && <div className="ms-alert bad" role="alert">{err}</div>}
            <button className="ms-btn primary wide" type="submit" disabled={busy}>{busy ? "Logging in…" : "Log in"}</button>
            <p className="ms-muted">For owners and staff. Forgot your password? Ask Marvie or Salome to set a new one.</p>
          </form>
        </section>
        <iframe className="ms-sack big" src="/sack.html" title="3D Lami-ang Bugas rice sack; drag to turn it" tabIndex={-1} />
      </main>
      <footer><span>MS Lami-ang Bugas · Palay &amp; rice trading</span><span>Owned by Marvie &amp; Salome</span></footer>
    </div>
  );
}
