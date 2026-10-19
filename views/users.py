import pandas as pd
import streamlit as st

from lib import auth, ui
from lib.widgets import flash, key, reset

F = "user"
auth.require_owner()
me = auth.current_user()

ui.page_header("Users", "Create a login for each person. Owners see everything; staff record the daily work "
                        "but cannot see profit, cash or capital, delete entries, or manage users.")

try:
    users = auth.list_users()
except Exception as exc:
    st.error(f"Could not load the user list. Check the internet connection and reload. ({exc})")
    st.stop()

# ---------- List ----------
ui.section("Accounts")
if users:
    view = pd.DataFrame([{
        "Name": u["name"], "Username": u["username"], "Role": auth.ROLE_LABEL[u["role"]],
        "Status": "Active" if u["active"] else "Turned off",
        "Last login": pd.to_datetime(u["last_login"]).tz_convert("Asia/Manila").strftime("%b %d, %Y %I:%M %p")
        if u["last_login"] else "Never",
    } for u in users])
    st.dataframe(view, hide_index=True, width="stretch")

# ---------- Add ----------
ui.section("Add a user", "Give them their username and password in person. They can't sign themselves up.")
c1, c2 = st.columns(2)
with c1:
    name = st.text_input("Full name", key=key(F, "name"), placeholder="e.g. Marites Ochavo")
    username = st.text_input("Username", key=key(F, "username"), placeholder="e.g. marites",
                             help="Small letters and numbers, no spaces. This is what they type to log in.").strip().lower()
with c2:
    role = st.radio("Role", auth.ROLES, format_func=auth.ROLE_LABEL.get, index=1, horizontal=True, key=key(F, "role"),
                    help="Owner: full access. Staff: records palay, milling, payroll, sales and expenses only.")
    password = st.text_input("Password", type="password", key=key(F, "pw"), autocomplete="new-password",
                             help=f"At least {auth.MIN_PASSWORD} characters.")
if st.button("Create user", type="primary", key=key(F, "save")):
    taken = {u["username"] for u in users}
    err = (None if name.strip() else "Enter the person's name.") or auth.username_error(username) \
        or (f"The username “{username}” is already taken." if username in taken else None) \
        or auth.password_error(password)
    if err:
        st.error(err)
    else:
        try:
            auth.create_user(username, name, role, password)
        except Exception as exc:
            st.error(f"Could not create the user. ({exc})")
        else:
            reset(F)
            flash(f"Created {auth.ROLE_LABEL[role].lower()} account “{username}” for {name.strip()}.")
            st.rerun()

# ---------- Manage ----------
ui.section("Change an account")
others = {u["id"]: u for u in users}
pick = st.selectbox("Account", list(others), key="user.manage.pick",
                    format_func=lambda i: f"{others[i]['name']} ({others[i]['username']}) · "
                                          f"{auth.ROLE_LABEL[others[i]['role']]}"
                                          f"{'' if others[i]['active'] else ' · turned off'}")
target = others[pick]
is_me = target["id"] == me["id"]
active_owners = sum(1 for u in users if u["role"] == "owner" and u["active"])
last_owner = target["role"] == "owner" and target["active"] and active_owners <= 1

t1, t2, t3 = st.tabs(["Set a new password", "Turn on / off", "Change role"])
with t1:
    new_pw = st.text_input("New password", type="password", key=f"user.pw.{pick}", autocomplete="new-password")
    if st.button("Save new password", key="user.pw.go"):
        err = auth.password_error(new_pw)
        if err:
            st.error(err)
        else:
            auth.set_password(pick, new_pw)
            flash(f"New password saved for {target['username']}. Give it to them in person.")
            st.rerun()
with t2:
    if is_me:
        st.caption("You can't turn off your own account.")
    elif last_owner:
        st.caption("This is the only active owner, so it can't be turned off.")
    else:
        st.caption("A turned-off account can't log in. Its past entries stay in the records.")
        if st.button("Turn off this account" if target["active"] else "Turn this account back on", key="user.active.go"):
            auth.set_active(pick, not target["active"])
            flash(f"{target['username']} is now {'turned off' if target['active'] else 'active'}.")
            st.rerun()
with t3:
    if is_me or last_owner:
        st.caption("You can't change your own role or remove the last owner.")
    else:
        new_role = "staff" if target["role"] == "owner" else "owner"
        if st.button(f"Make {auth.ROLE_LABEL[new_role].lower()}", key="user.role.go"):
            auth.set_role(pick, target["username"], new_role)
            flash(f"{target['username']} is now {auth.ROLE_LABEL[new_role].lower()}.")
            st.rerun()
