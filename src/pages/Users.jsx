import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../lib/auth.jsx";
import { useData } from "../lib/data.jsx";
import { usersApi } from "../lib/supabase.js";
import { Alert, Button, PageHeader, PasswordInput, Radio, Section, Select, Table, Tabs, TextInput } from "../components/ui.jsx";

const ROLE = { owner: "Owner", staff: "Staff" };
const lastLogin = (iso) => (iso ? new Date(iso).toLocaleString("en-US", {
  timeZone: "Asia/Manila", month: "short", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit",
}) : "Never");

export default function Users() {
  const { user } = useAuth();
  const { flash } = useData();
  const [users, setUsers] = useState(null);
  const [loadErr, setLoadErr] = useState("");

  const load = useCallback(async () => {
    try { setUsers((await usersApi("list")).users); setLoadErr(""); }
    catch (e) { setLoadErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function act(action, payload, message) {
    try { await usersApi(action, payload); flash(message); await load(); return true; }
    catch (e) { flash(e.message, "bad"); return false; }
  }

  return (
    <>
      <PageHeader title="Users">Create a login for each person. Owners see everything; staff record the daily work but cannot see profit, cash or capital, delete entries, or manage users.</PageHeader>
      {loadErr && <Alert tone="bad">Could not load the user list: {loadErr}</Alert>}
      {!users && !loadErr && <div className="ms-skeleton" aria-label="Loading users" />}
      {users && <>
        <Section title="Accounts">
          <Table rows={users} columns={[
            { key: "name", label: "Name" }, { key: "username", label: "Username" },
            { key: "role", label: "Role", format: (v) => ROLE[v] },
            { key: "active", label: "Status", format: (v) => (v ? "Active" : "Turned off") },
            { key: "lastLogin", label: "Last login", format: lastLogin },
          ]} />
        </Section>
        <AddUser onCreate={(p) => act("create", p, `Created ${ROLE[p.role].toLowerCase()} account “${p.username}” for ${p.name}.`)} />
        <ManageUser users={users} me={user} act={act} />
      </>}
    </>
  );
}

function AddUser({ onCreate }) {
  const blank = { name: "", username: "", role: "staff", password: "" };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v }));
  return (
    <Section title="Add a user" note="Give them their username and password in person. They can't sign themselves up.">
      <div className="ms-form">
        <div className="ms-grid">
          <div>
            <TextInput label="Full name" value={f.name} onChange={set("name")} placeholder="e.g. Marites Ochavo" />
            <TextInput label="Username" value={f.username} onChange={(v) => set("username")(v.toLowerCase().replace(/\s/g, ""))}
                       placeholder="e.g. marites" help="Small letters and numbers, no spaces. This is what they type to log in." />
          </div>
          <div>
            <Radio label="Role" value={f.role} onChange={set("role")} options={[["owner", "Owner"], ["staff", "Staff"]]} />
            <PasswordInput label="Password" value={f.password} onChange={set("password")} help="At least 8 characters. Click Show to check it before saving." />
          </div>
        </div>
        <Button kind="primary" busy={busy} onClick={async () => {
          setBusy(true);
          if (await onCreate({ ...f, name: f.name.trim() })) setF(blank);
          setBusy(false);
        }}>Create user</Button>
      </div>
    </Section>
  );
}

function ManageUser({ users, me, act }) {
  const [pick, setPick] = useState(users[0]?.id || "");
  const [tab, setTab] = useState("Set a new password");
  const [pw, setPw] = useState("");
  const target = users.find((u) => u.id === pick) || users[0];
  if (!target) return null;
  const isMe = target.id === me.id;
  const activeOwners = users.filter((u) => u.role === "owner" && u.active).length;
  const lastOwner = target.role === "owner" && target.active && activeOwners <= 1;
  const newRole = target.role === "owner" ? "staff" : "owner";
  return (
    <Section title="Change an account">
      <div className="ms-form">
        <Select label="Account" value={target.id} onChange={(v) => { setPick(v); setPw(""); }}
                options={users.map((u) => [u.id, `${u.name} (${u.username}) · ${ROLE[u.role]}${u.active ? "" : " · turned off"}`])} />
        <Tabs tabs={["Set a new password", "Turn on / off", "Change role"]} active={tab} onChange={setTab} />
        {tab === "Set a new password" && <>
          <PasswordInput label="New password" value={pw} onChange={setPw} help="At least 8 characters." />
          <Button onClick={async () => { if (await act("password", { id: target.id, password: pw }, `New password saved for ${target.username}. Give it to them in person.`)) setPw(""); }}>
            Save new password</Button>
        </>}
        {tab === "Turn on / off" && (isMe ? <p className="ms-muted">You can't turn off your own account.</p>
          : lastOwner ? <p className="ms-muted">This is the only active owner, so it can't be turned off.</p> : <>
            <p className="ms-muted">A turned-off account can't log in. Its past entries stay in the records.</p>
            <Button kind={target.active ? "danger" : "secondary"}
                    onClick={() => act("active", { id: target.id, active: !target.active }, `${target.username} is now ${target.active ? "turned off" : "active"}.`)}>
              {target.active ? "Turn off this account" : "Turn this account back on"}</Button>
          </>)}
        {tab === "Change role" && (isMe || lastOwner ? <p className="ms-muted">You can't change your own role or remove the last owner.</p> : <>
          <p className="ms-muted">The change applies the next time they log in (or within an hour).</p>
          <Button onClick={() => act("role", { id: target.id, role: newRole }, `${target.username} is now ${ROLE[newRole].toLowerCase()}.`)}>
            Make {ROLE[newRole].toLowerCase()}</Button>
        </>)}
      </div>
    </Section>
  );
}
