import { createClient } from "@supabase/supabase-js";

// Public values: the project URL and the PUBLISHABLE key. Safe in the browser;
// database rules (Row Level Security) decide what each logged-in person can do.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const configured = Boolean(url && key);
export const supabase = configured ? createClient(url, key) : null;

export const EMAIL_DOMAIN = "users.lamiang.local";
export const toEmail = (username) => `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;

export function sessionUser(session) {
  const u = session?.user;
  const role = u?.app_metadata?.role;
  if (!u || !["owner", "staff"].includes(role)) return null;
  return {
    id: u.id,
    username: u.app_metadata.username || u.email.split("@")[0],
    name: u.user_metadata?.name || u.email.split("@")[0],
    role,
  };
}

// Calls the server function that manages logins (owners only).
export async function usersApi(action, payload = {}) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token || ""}` },
    body: JSON.stringify({ action, ...payload }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status}).`);
  return json;
}
