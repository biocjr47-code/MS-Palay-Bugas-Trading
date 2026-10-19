"""User accounts and logins, backed by Supabase Auth.

People log in with a username. Supabase Auth needs an email address, so each
username maps to a private placeholder address (never emailed). The role
lives in app_metadata, which only the server's secret key can change, so a
user can never promote themselves.
"""
from __future__ import annotations

import hmac
import re
from datetime import datetime, timezone

import streamlit as st

from lib import db

EMAIL_DOMAIN = "users.lamiang.local"
ROLES = ("owner", "staff")
ROLE_LABEL = {"owner": "Owner", "staff": "Staff"}
USERNAME_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{2,29}$")
MIN_PASSWORD = 8
BAN_FOREVER = "876000h"  # about 100 years: how Supabase disables an account


def username_error(username: str) -> str | None:
    if not USERNAME_RE.match(username):
        return "Usernames are 3–30 characters: small letters, numbers, dot, dash or underscore (e.g. marvie)."
    return None


def password_error(password: str) -> str | None:
    if len(password) < MIN_PASSWORD:
        return f"Use a password of at least {MIN_PASSWORD} characters."
    return None


def _email(username: str) -> str:
    return f"{username.strip().lower()}@{EMAIL_DOMAIN}"


def _setup_code() -> str | None:
    try:
        app = dict(st.secrets.get("app", {}))
    except Exception:
        return None
    return app.get("setup_code") or app.get("password") or None


# ---------- Session ----------

def current_user() -> dict | None:
    if db.is_demo():
        # No Supabase means no accounts: demo mode acts as an owner so every screen can be tried.
        return {"id": "demo", "username": "demo", "name": "Demo", "role": "owner"}
    return st.session_state.get("user")


def is_owner() -> bool:
    user = current_user()
    return bool(user and user["role"] == "owner")


def require_owner() -> None:
    if not is_owner():
        st.error("Only an owner can open this page.")
        st.stop()


def sign_out() -> None:
    st.session_state.pop("user", None)


def _to_session(user) -> dict | None:
    role = (user.app_metadata or {}).get("role")
    if role not in ROLES:
        return None  # an account not created through this app
    return {
        "id": user.id,
        "username": (user.app_metadata or {}).get("username") or user.email.split("@")[0],
        "name": (user.user_metadata or {}).get("name") or user.email.split("@")[0],
        "role": role,
    }


def sign_in(username: str, password: str) -> str | None:
    """Log in; returns an error message, or None on success."""
    from supabase import create_client

    cfg = dict(st.secrets["supabase"])
    # A throwaway client, so one person's login never touches the shared server connection.
    client = create_client(cfg["url"], cfg["key"])
    try:
        res = client.auth.sign_in_with_password({"email": _email(username), "password": password})
    except Exception as exc:
        if "banned" in str(exc).lower():
            return "This account is turned off. Ask Marvie or Salome to turn it back on."
        return "Wrong username or password."
    user = _to_session(res.user)
    if not user:
        return "This account has no access to the app. Ask an owner to create one for you."
    st.session_state.user = user
    return None


# ---------- Account management (owners) ----------

def _admin():
    return db._client().auth.admin


def list_users() -> list[dict]:
    out = []
    for u in _admin().list_users(page=1, per_page=1000):
        info = _to_session(u)
        if not info:
            continue
        banned = getattr(u, "banned_until", None)
        if isinstance(banned, str):
            banned = datetime.fromisoformat(banned.replace("Z", "+00:00"))
        info["active"] = not (banned and banned > datetime.now(timezone.utc))
        info["last_login"] = u.last_sign_in_at
        out.append(info)
    return sorted(out, key=lambda r: (r["role"] != "owner", r["name"].lower()))


def create_user(username: str, name: str, role: str, password: str) -> None:
    _admin().create_user({
        "email": _email(username),
        "password": password,
        "email_confirm": True,
        "app_metadata": {"role": role, "username": username.strip().lower()},
        "user_metadata": {"name": name.strip()},
    })
    _users_cached.clear()


def set_password(user_id: str, password: str) -> None:
    _admin().update_user_by_id(user_id, {"password": password})
    _users_cached.clear()


def set_active(user_id: str, active: bool) -> None:
    _admin().update_user_by_id(user_id, {"ban_duration": "none" if active else BAN_FOREVER})
    _users_cached.clear()


def set_role(user_id: str, username: str, role: str) -> None:
    _admin().update_user_by_id(user_id, {"app_metadata": {"role": role, "username": username}})
    _users_cached.clear()


@st.cache_data(ttl=60, show_spinner=False)
def _users_cached() -> list[dict]:
    return list_users()


def has_owner() -> bool:
    return any(u["role"] == "owner" and u["active"] for u in _users_cached())


def refresh_session() -> None:
    """Pick up changes an owner made (turned off, role changed) within a minute, without logging out everyone."""
    user = st.session_state.get("user")
    if not user:
        return
    match = next((u for u in _users_cached() if u["id"] == user["id"]), None)
    if not match or not match["active"]:
        sign_out()
        return
    user.update(role=match["role"], name=match["name"])


# ---------- Screens ----------

def _centered():
    _, mid, _ = st.columns([1, 2, 1])
    return mid


def login_screen() -> None:
    with _centered():
        st.html('<div class="ms-head"><h1>MS Lami-ang Bugas</h1>'
                '<p>Log in with the username and password an owner gave you.</p></div>')
        with st.form("login"):
            username = st.text_input("Username", autocomplete="username").strip().lower()
            password = st.text_input("Password", type="password", autocomplete="current-password")
            if st.form_submit_button("Log in", type="primary", width="stretch"):
                if not username or not password:
                    st.error("Enter your username and password.")
                else:
                    err = sign_in(username, password)
                    if err:
                        st.error(err)
                    else:
                        st.rerun()
        st.caption("Forgot your password? Ask Marvie or Salome to set a new one for you.")


def first_owner_screen() -> None:
    """Shown once, while no owner account exists. Protected by the setup code in secrets.toml."""
    code = _setup_code()
    with _centered():
        st.html('<div class="ms-head"><h1>Create the first owner account</h1>'
                '<p>No accounts exist yet. Create one for Marvie or Salome; that owner can then add everyone else '
                'from the Users page.</p></div>')
        if not code:
            st.error("Add a `setup_code` under `[app]` in `.streamlit/secrets.toml`, then reload this page.")
            return
        with st.form("first_owner"):
            entered = st.text_input("Setup code", type="password",
                                    help="The setup_code value in .streamlit/secrets.toml.")
            name = st.text_input("Full name", placeholder="e.g. Marvie")
            username = st.text_input("Username", placeholder="e.g. marvie").strip().lower()
            pw1 = st.text_input("Password", type="password", autocomplete="new-password")
            pw2 = st.text_input("Type the password again", type="password", autocomplete="new-password")
            if st.form_submit_button("Create owner account", type="primary", width="stretch"):
                err = (None if hmac.compare_digest(entered, str(code)) else "The setup code is not right.") \
                    or (None if name.strip() else "Enter the owner's name.") \
                    or username_error(username) or password_error(pw1) \
                    or (None if pw1 == pw2 else "The two passwords don't match.")
                if err:
                    st.error(err)
                    return
                try:
                    create_user(username, name, "owner", pw1)
                except Exception as exc:
                    st.error(f"Could not create the account. ({exc})")
                    return
                sign_in(username, pw1)
                st.rerun()
