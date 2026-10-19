// Vercel serverless function: manage logins. Runs on the server with the SECRET key,
// which never reaches the browser. Only a logged-in owner may call it.
import { createClient } from "@supabase/supabase-js";

const EMAIL_DOMAIN = "users.lamiang.local"; // usernames map to private placeholder addresses, never emailed
const ROLES = ["owner", "staff"];
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/;
const MIN_PASSWORD = 8;
const BAN_FOREVER = "876000h"; // about 100 years: how Supabase turns an account off

const toEmail = (username) => `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;

function summary(u) {
  const role = u.app_metadata?.role;
  if (!ROLES.includes(role)) return null; // accounts this app didn't create
  return {
    id: u.id,
    username: u.app_metadata.username || u.email.split("@")[0],
    name: u.user_metadata?.name || u.email.split("@")[0],
    role,
    active: !(u.banned_until && new Date(u.banned_until) > new Date()),
    lastLogin: u.last_sign_in_at || null,
  };
}

async function allUsers(admin) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.map(summary).filter(Boolean)
    .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === "owner" ? -1 : 1));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return res.status(500).json({ error: "Server is missing SUPABASE_URL or SUPABASE_SECRET_KEY." });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // Who is asking? Must be a logged-in, active owner.
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const { data: me, error: meErr } = await admin.auth.getUser(token);
  if (meErr || !me?.user) return res.status(401).json({ error: "Please log in again." });
  if (me.user.app_metadata?.role !== "owner") return res.status(403).json({ error: "Only an owner can manage users." });

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const { action } = body;
  try {
    const users = await allUsers(admin);
    const target = users.find((u) => u.id === body.id);
    const activeOwners = users.filter((u) => u.role === "owner" && u.active).length;
    const isLastOwner = target && target.role === "owner" && target.active && activeOwners <= 1;

    if (action === "list") return res.status(200).json({ users });

    if (action === "create") {
      const username = String(body.username || "").trim().toLowerCase();
      const name = String(body.name || "").trim();
      if (!name) return res.status(400).json({ error: "Enter the person's name." });
      if (!USERNAME_RE.test(username)) return res.status(400).json({ error: "Usernames are 3–30 characters: small letters, numbers, dot, dash or underscore (e.g. marites)." });
      if (users.some((u) => u.username === username)) return res.status(400).json({ error: `The username “${username}” is already taken.` });
      if (!ROLES.includes(body.role)) return res.status(400).json({ error: "Choose Owner or Staff." });
      if (String(body.password || "").length < MIN_PASSWORD) return res.status(400).json({ error: `Use a password of at least ${MIN_PASSWORD} characters.` });
      const { error } = await admin.auth.admin.createUser({
        email: toEmail(username), password: body.password, email_confirm: true,
        app_metadata: { role: body.role, username }, user_metadata: { name },
      });
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (!target) return res.status(404).json({ error: "That account no longer exists." });
    const self = target.id === me.user.id;

    if (action === "password") {
      if (String(body.password || "").length < MIN_PASSWORD) return res.status(400).json({ error: `Use a password of at least ${MIN_PASSWORD} characters.` });
      const { error } = await admin.auth.admin.updateUserById(target.id, { password: body.password });
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }
    if (action === "active") {
      if (self) return res.status(400).json({ error: "You can't turn off your own account." });
      if (!body.active && isLastOwner) return res.status(400).json({ error: "This is the only active owner, so it can't be turned off." });
      const { error } = await admin.auth.admin.updateUserById(target.id, { ban_duration: body.active ? "none" : BAN_FOREVER });
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }
    if (action === "role") {
      if (self || isLastOwner) return res.status(400).json({ error: "You can't change your own role or remove the last owner." });
      if (!ROLES.includes(body.role)) return res.status(400).json({ error: "Choose Owner or Staff." });
      const { error } = await admin.auth.admin.updateUserById(target.id, { app_metadata: { role: body.role, username: target.username } });
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: "Unknown action." });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Something went wrong." });
  }
}
