"""Small form helpers shared by the module pages."""
from __future__ import annotations

from typing import Callable

import pandas as pd
import streamlit as st

from lib import db


def key(form: str, field: str) -> str:
    """Widget key that changes after a save, so the form clears itself."""
    return f"{form}.{st.session_state.get(f'_{form}_v', 0)}.{field}"


def reset(form: str) -> None:
    st.session_state[f"_{form}_v"] = st.session_state.get(f"_{form}_v", 0) + 1


def flash(message: str) -> None:
    st.session_state["_flash"] = message


def show_flash() -> None:
    msg = st.session_state.pop("_flash", None)
    if msg:
        st.toast(msg, icon=":material/check_circle:")


def save(table: str, row: dict, form: str, message: str) -> None:
    try:
        db.insert(table, row)
    except Exception as exc:
        st.error(f"Could not save. Check your internet connection and try again. ({exc})")
        return
    reset(form)
    flash(message)
    st.rerun()


def delete_picker(table: str, df: pd.DataFrame, describe: Callable[[pd.Series], str], form: str) -> None:
    from lib.auth import is_owner

    if not is_owner():
        st.caption("Made a mistake? Ask Marvie or Salome to delete the entry.")
        return
    with st.expander("Fix a mistake: delete an entry"):
        if df.empty:
            st.caption("Nothing to delete yet.")
            return
        recent = df.sort_values(["date", "id"] if "date" in df else ["id"], ascending=False).head(200)
        options = {int(r["id"]): describe(r) for _, r in recent.iterrows()}
        picked = st.selectbox("Entry", list(options), format_func=options.get, key=f"{form}.del.pick")
        sure = st.checkbox("Yes, delete this entry for good", key=f"{form}.del.sure")
        if st.button("Delete entry", disabled=not sure, key=f"{form}.del.go"):
            try:
                db.delete(table, picked)
            except Exception as exc:
                st.error(f"Could not delete. ({exc})")
                return
            flash("Entry deleted.")
            st.session_state.pop(f"{form}.del.sure", None)
            st.rerun()
