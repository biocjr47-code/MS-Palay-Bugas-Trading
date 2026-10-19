"""MS Lami-ang Bugas Management System — entry point.

Run:  streamlit run app.py
"""
import html

import streamlit as st

from lib import auth, db
from lib.ui import inject_css
from lib.widgets import show_flash

st.set_page_config(
    page_title="MS Lami-ang Bugas",
    page_icon=":material/grass:",
    layout="wide",
    initial_sidebar_state="auto",
)
inject_css()
st.logo("assets/logo.svg", size="large")

error = db.check_connection()
if error:
    st.error(
        "Could not read from Supabase. Check the URL and key in `.streamlit/secrets.toml`, "
        "and that `supabase/schema.sql` has been run in the SQL Editor.\n\n"
        f"Details: {error}"
    )
    st.stop()

# ---------- Login: nothing below runs for someone who is not logged in ----------
if not db.is_demo():
    auth.refresh_session()
    if not auth.current_user():
        try:
            setup_needed = not auth.has_owner()
        except Exception as exc:
            st.error(f"Could not reach the login service. Check the internet connection and reload. ({exc})")
            st.stop()
        if setup_needed:
            auth.first_owner_screen()
        else:
            auth.login_screen()
        st.stop()

user = auth.current_user()
owner = user["role"] == "owner"

pages = [
    st.Page("views/dashboard.py", title="Dashboard", icon=":material/space_dashboard:", default=True),
    st.Page("views/palay.py", title="Palay & Inventory", icon=":material/inventory_2:"),
    st.Page("views/milling.py", title="Milling & Production", icon=":material/precision_manufacturing:"),
    st.Page("views/payroll.py", title="Labor & Payroll", icon=":material/badge:"),
    st.Page("views/finance.py", title="Sales, Expenses & P&L" if owner else "Sales & Expenses",
            icon=":material/account_balance_wallet:"),
]
if owner and not db.is_demo():
    pages.append(st.Page("views/users.py", title="Users", icon=":material/manage_accounts:"))
nav = st.navigation(pages, position="sidebar")

with st.sidebar:
    if db.is_demo():
        st.html('<div class="ms-demo"><b>Demo mode.</b> Sample data only; changes are not saved. '
                'Add your Supabase URL and key to <code>.streamlit/secrets.toml</code> to go live.</div>')
    else:
        st.html(f'<div class="ms-user"><b>{html.escape(user["name"])}</b>'
                f'<span>{auth.ROLE_LABEL[user["role"]]} · {html.escape(user["username"])}</span></div>')
        if st.button("Log out", icon=":material/logout:", width="stretch"):
            auth.sign_out()
            st.rerun()
    st.caption("Owned by Marvie & Salome")

show_flash()
nav.run()
