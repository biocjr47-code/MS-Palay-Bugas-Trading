"""Shared look and feel: tokens, CSS, peso formatting, stat strips, tables, charts."""
from __future__ import annotations

import html
from datetime import date

import altair as alt
import pandas as pd
import streamlit as st

# Harvest field tokens (see PRODUCT.md). Gain/loss pair validated for colorblind separation.
INK = "#1E2420"
BODY = "#4A5048"
MUTE = "#6E7368"
HAIRLINE = "#DDD6C5"
CANVAS = "#F6F3EA"
SURFACE = "#FCFBF7"
PRIMARY = "#1F5E36"
GAIN = "#2A7A45"
LOSS = "#B98320"
FONT = "Hanken Grotesk"

CSS = f"""
<style>
@import url('https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&display=swap');

/* Only the ₱ glyph comes from the system font: its two-bar peso sign reads clearly at small sizes. */
@font-face {{
  font-family: "Peso Sign";
  src: local("Segoe UI"), local("Roboto"), local("Helvetica Neue"), local("Arial");
  unicode-range: U+20B1;
}}

:root {{
  --ink: {INK}; --body: {BODY}; --mute: {MUTE}; --hairline: {HAIRLINE};
  --canvas: {CANVAS}; --surface: {SURFACE}; --primary: {PRIMARY};
  --primary-pale: #E2ECDD; --warning: #8A5E0B; --warning-bg: #F6EBD2;
  --danger: #9A3B22; --danger-bg: #F5E1D9;
}}

.stApp, .stApp *:not([data-testid="stIconMaterial"]):not([class*="material"]):not(code):not(pre) {{
  font-family: "Peso Sign", "{FONT}", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}}
.stApp {{ color: var(--ink); font-variant-numeric: tabular-nums; }}
::selection {{ background: #CFE0C8; color: var(--ink); }}
* {{ scrollbar-color: #CFC7B3 transparent; scrollbar-width: thin; }}
input, textarea {{ caret-color: var(--primary); }}

[data-testid="stMainBlockContainer"], .block-container {{
  max-width: 1240px; padding-top: 2.25rem; padding-bottom: 4rem;
}}
h1, h2, h3, h4 {{ letter-spacing: -0.02em; color: var(--ink); text-wrap: balance; }}
[data-testid="stHeadingWithActionElements"] a {{ display: none; }}

/* Sidebar */
[data-testid="stSidebar"] {{ border-right: 1px solid var(--hairline); }}
[data-testid="stSidebarNav"] a {{ border-radius: 8px; }}
[data-testid="stSidebarNav"] a[aria-current="page"] {{ background: var(--primary-pale); }}
[data-testid="stSidebarNav"] a[aria-current="page"] span {{ color: var(--primary); font-weight: 600; }}

/* Buttons: tactile press */
.stButton button, .stFormSubmitButton button, .stDownloadButton button {{
  font-weight: 600; transition: transform .15s cubic-bezier(.16,1,.3,1), background-color .15s;
}}
.stButton button:active, .stFormSubmitButton button:active, .stDownloadButton button:active {{
  transform: scale(.98);
}}
button:focus-visible, input:focus-visible, textarea:focus-visible, [role="tab"]:focus-visible {{
  outline: 2px solid var(--primary) !important; outline-offset: 2px;
}}

/* Tabs */
.stTabs [role="tablist"] {{ gap: .25rem; border-bottom: 1px solid var(--hairline); overflow-x: auto; }}
.stTabs [role="tab"] {{ padding: .5rem .75rem; }}
.stTabs [role="tab"] p {{ font-weight: 500; }}
.stTabs [role="tab"][aria-selected="true"] p {{ color: var(--primary); font-weight: 600; }}

/* Page header */
.ms-head {{ margin: 0 0 1.25rem; }}
.ms-head h1 {{ font-size: 1.65rem; font-weight: 650; line-height: 1.15; margin: 0; padding: 0; }}
.ms-head p {{ color: var(--body); margin: .35rem 0 0; max-width: 62ch; font-size: .975rem; }}

/* Section title */
.ms-section {{ margin: 1.75rem 0 .5rem; }}
.ms-section h3 {{ font-size: 1.02rem; font-weight: 600; margin: 0; padding: 0; }}
.ms-section p {{ color: var(--mute); font-size: .875rem; margin: .2rem 0 0; }}

/* Stat strip: hairline-divided grid, no boxed cards */
.ms-stats {{
  display: grid; grid-template-columns: repeat(auto-fit, minmax(168px, 1fr));
  border-block: 1px solid var(--hairline); margin: .25rem 0 .5rem; overflow: hidden;
}}
/* dividers drawn per cell, so a short last row leaves no filler block */
.ms-stat {{ padding: .9rem 1rem; min-width: 0; box-shadow: 1px 0 0 var(--hairline), 0 1px 0 var(--hairline); }}
.ms-stat-label {{ color: var(--body); font-size: .8rem; font-weight: 500; }}
.ms-stat-value {{
  font-size: 1.45rem; font-weight: 600; letter-spacing: -0.02em; line-height: 1.25;
  margin-top: .2rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}}
.ms-stat-note {{ color: var(--mute); font-size: .8rem; margin-top: .15rem; }}
.ms-stat-value.is-lead {{ font-size: 1.75rem; color: var(--primary); }}

/* Inline formula readout under live inputs */
.ms-readout {{
  display: flex; flex-wrap: wrap; gap: .35rem 1.5rem; padding: .75rem 1rem; margin: .25rem 0 .75rem;
  background: var(--surface); border: 1px solid var(--hairline); border-radius: 10px;
}}
.ms-readout div {{ font-size: .85rem; color: var(--body); }}
.ms-readout b {{ display: block; color: var(--ink); font-size: 1.05rem; font-weight: 600; }}

.ms-empty {{
  border: 1px dashed #CFC7B3; border-radius: 12px; padding: 1.5rem 1.25rem; color: var(--body);
  background: var(--surface);
}}
.ms-empty strong {{ display: block; color: var(--ink); font-weight: 600; margin-bottom: .2rem; }}

.ms-pill {{
  display: inline-block; font-size: .75rem; font-weight: 600; padding: .1rem .5rem; border-radius: 999px;
}}
.ms-pill.ok {{ background: var(--primary-pale); color: var(--primary); }}
.ms-pill.warn {{ background: var(--warning-bg); color: var(--warning); }}
.ms-pill.bad {{ background: var(--danger-bg); color: var(--danger); }}

.ms-user {{ display: flex; flex-direction: column; gap: .1rem; margin-bottom: .25rem; }}
.ms-user b {{ font-weight: 600; color: var(--ink); }}
.ms-user span {{ font-size: .8rem; color: var(--mute); }}

.ms-demo {{
  font-size: .8rem; color: var(--warning); background: var(--warning-bg); border-radius: 8px;
  padding: .5rem .7rem; line-height: 1.35;
}}

@media (max-width: 640px) {{
  [data-testid="stMainBlockContainer"], .block-container {{ padding: 4.25rem 1rem 3rem; }}
  .ms-head h1 {{ font-size: 1.4rem; }}
  .ms-stats {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }}
  .ms-stat {{ padding: .75rem; }}
  .ms-stat-value {{ font-size: 1.2rem; }}
  .ms-stat-value.is-lead {{ font-size: 1.35rem; }}
}}
@media (prefers-reduced-motion: reduce) {{
  * {{ transition: none !important; animation: none !important; }}
}}
</style>
"""


def inject_css() -> None:
    st.html(CSS)


# ---------- Formatting ----------

def peso(value: float | None, decimals: int = 2) -> str:
    if value is None or pd.isna(value):
        return "₱0.00"
    sign = "−" if value < 0 else ""
    return f"{sign}₱{abs(value):,.{decimals}f}"


def kg(value: float | None, decimals: int = 1) -> str:
    if value is None or pd.isna(value):
        return "0 kg"
    return f"{value:,.{decimals}f} kg"


def pct(value: float, decimals: int = 1) -> str:
    return f"{value:.{decimals}f}%"


def long_date(d: date) -> str:
    return f"{d:%A, %B} {d.day}, {d.year}"


# ---------- Blocks ----------

def page_header(title: str, subtitle: str = "") -> None:
    sub = f"<p>{html.escape(subtitle)}</p>" if subtitle else ""
    st.html(f'<div class="ms-head"><h1>{html.escape(title)}</h1>{sub}</div>')


def section(title: str, note: str = "") -> None:
    sub = f"<p>{html.escape(note)}</p>" if note else ""
    st.html(f'<div class="ms-section"><h3>{html.escape(title)}</h3>{sub}</div>')


def stats(items: list[tuple]) -> None:
    """items: (label, value, note) or (label, value, note, lead)."""
    cells = []
    for item in items:
        label, value, note = item[0], item[1], item[2] if len(item) > 2 else ""
        lead = " is-lead" if len(item) > 3 and item[3] else ""
        note_html = f'<div class="ms-stat-note">{html.escape(note)}</div>' if note else ""
        cells.append(
            f'<div class="ms-stat"><div class="ms-stat-label">{html.escape(label)}</div>'
            f'<div class="ms-stat-value{lead}" title="{html.escape(value)}">{html.escape(value)}</div>{note_html}</div>'
        )
    st.html(f'<div class="ms-stats">{"".join(cells)}</div>')


def readout(items: list[tuple[str, str]]) -> None:
    cells = "".join(f"<div>{html.escape(k)}<b>{html.escape(v)}</b></div>" for k, v in items)
    st.html(f'<div class="ms-readout">{cells}</div>')


def empty(title: str, how: str) -> None:
    st.html(f'<div class="ms-empty"><strong>{html.escape(title)}</strong>{html.escape(how)}</div>')


def pill(text: str, tone: str = "ok") -> str:
    return f'<span class="ms-pill {tone}">{html.escape(text)}</span>'


def table(df: pd.DataFrame, columns: dict[str, str], money: tuple = (), weight: tuple = (),
          percent: tuple = (), height: int | None = None) -> None:
    """Show selected columns with ₱ / kg formatting. `columns` maps source column to header."""
    view = df[list(columns)].copy()
    for c in money:
        if c in view:
            view[c] = view[c].astype(float).map(peso)
    for c in weight:
        if c in view:
            view[c] = view[c].astype(float).map(kg)
    for c in percent:
        if c in view:
            view[c] = view[c].astype(float).map(pct)
    view = view.rename(columns=columns)
    kwargs = {"height": height} if height else {}
    st.dataframe(view, hide_index=True, width="stretch", **kwargs)


# ---------- Charts ----------

def _theme(chart: alt.Chart) -> alt.Chart:
    return (
        chart.configure(font=FONT, background="transparent")
        .configure_view(stroke=None)
        .configure_axis(labelColor=MUTE, titleColor=BODY, gridColor="#E8E2D4", domain=False,
                        tickColor=HAIRLINE, labelFontSize=11, titleFontSize=11, titleFontWeight=500)
        .configure_legend(labelColor=BODY, titleColor=BODY, orient="top", labelFontSize=12)
    )


def net_bars(df: pd.DataFrame) -> alt.Chart:
    """Daily net profit; bars above zero in gain green, below zero in grain gold."""
    d = df.copy()
    d["result"] = d["net"].map(lambda v: "Profit" if v >= 0 else "Loss")
    d["net_label"] = d["net"].map(peso)
    d["rev_label"] = d["revenue"].map(peso)
    d["cost_label"] = d["costs"].map(peso)
    d["day"] = pd.to_datetime(d["date"])
    # band scale so bar width follows screen width (thin on phones, no overlap)
    bars = alt.Chart(d).mark_bar(cornerRadiusEnd=3, width=alt.RelativeBandSize(0.62)).encode(
        x=alt.X("yearmonthdate(day):O", title=None,
                axis=alt.Axis(format="%b %d", formatType="time", labelAngle=0, labelOverlap="greedy",
                              labelSeparation=12, ticks=False)),
        y=alt.Y("net:Q", title="Net profit (₱)", axis=alt.Axis(format="~s")),
        color=alt.Color("result:N", title=None,
                        scale=alt.Scale(domain=["Profit", "Loss"], range=[GAIN, LOSS])),
        tooltip=[alt.Tooltip("day:T", title="Date", format="%a, %b %d"),
                 alt.Tooltip("rev_label:N", title="Sales"),
                 alt.Tooltip("cost_label:N", title="Costs"),
                 alt.Tooltip("net_label:N", title="Net")],
    )
    zero = alt.Chart(pd.DataFrame({"y": [0]})).mark_rule(color=BODY, strokeWidth=1).encode(y="y:Q")
    return _theme((bars + zero).properties(height=260, padding={"left": 0, "right": 12, "top": 4, "bottom": 0}))


def hbars(df: pd.DataFrame, label: str, value: str, value_title: str, money_values: bool = True,
          color: str = GAIN) -> alt.Chart:
    d = df.copy()
    d["shown"] = d[value].map(peso if money_values else kg)
    base = alt.Chart(d).encode(
        y=alt.Y(f"{label}:N", title=None, sort="-x", axis=alt.Axis(labelLimit=180)),
        # headroom past the longest bar so its value label is never clipped
        x=alt.X(f"{value}:Q", title=value_title, axis=alt.Axis(format="~s", tickCount=5),
                scale=alt.Scale(domain=[0, float(d[value].max() or 1) * 1.28], nice=False)),
        tooltip=[alt.Tooltip(f"{label}:N", title="Item"), alt.Tooltip("shown:N", title=value_title)],
    )
    bars = base.mark_bar(color=color, cornerRadiusEnd=4, size=16)
    text = base.mark_text(align="left", dx=6, color=BODY, fontSize=11).encode(text="shown:N")
    return _theme((bars + text).properties(height=max(120, 34 * len(d))))
