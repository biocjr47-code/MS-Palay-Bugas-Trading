import { useState } from "react";
import { peso, kg } from "../lib/format.js";

// Gain/loss pair validated for colorblind separation (paddy green / grain gold).
const GAIN = "#2A7A45";
const LOSS = "#B98320";

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / p) * p;
}
const short = (v) => {
  const a = Math.abs(v);
  const s = a >= 1e6 ? `${+(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${+(a / 1e3).toFixed(0)}k` : `${Math.round(a)}`;
  return v < 0 ? `−${s}` : s;
};

/** Daily net profit: bars above zero in green, below in gold; hover/tap a day for the breakdown. */
export function NetBars({ series }) {
  const [hover, setHover] = useState(null);
  const W = 720, H = 240, L = 44, R = 8, T = 10, B = 26;
  const top = niceMax(Math.max(0, ...series.map((d) => d.net)));
  const bottom = -niceMax(Math.max(0, ...series.map((d) => -d.net)) || 0) || 0;
  const span = top - bottom || 1;
  const y = (v) => T + ((top - v) / span) * (H - T - B);
  const band = (W - L - R) / series.length;
  const ticks = [top, top / 2, 0, bottom / 2, bottom].filter((v, i, a) => a.indexOf(v) === i && v >= bottom);
  const h = hover != null ? series[hover] : null;
  return (
    <figure className="ms-chart">
      <div className="ms-legend"><span><i style={{ background: GAIN }} />Profit</span><span><i style={{ background: LOSS }} />Loss</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Daily net profit, last 30 days" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#4A5048" : "#E8E2D4"} strokeWidth="1" />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" className="tick">{short(t)}</text>
          </g>
        ))}
        {series.map((d, i) => {
          const x = L + i * band + band * 0.19, w = band * 0.62;
          const y0 = y(Math.max(0, d.net)), y1 = y(Math.min(0, d.net));
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)}>
              <rect x={L + i * band} y={T} width={band} height={H - T - B} fill="transparent" />
              {d.net !== 0 && <rect x={x} y={y0} width={w} height={Math.max(1, y1 - y0)} rx="2"
                                    fill={d.net >= 0 ? GAIN : LOSS} opacity={hover == null || hover === i ? 1 : 0.45} />}
              {i % 7 === 0 && <text x={L + i * band + band / 2} y={H - 6} textAnchor="middle" className="tick">
                {new Date(`${d.date}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "2-digit" })}</text>}
            </g>
          );
        })}
      </svg>
      <figcaption className="ms-tip" aria-live="polite">
        {h ? <>
          <b>{new Date(`${h.date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</b>
          <span>Sales {peso(h.revenue)}</span><span>Costs {peso(h.costs)}</span><span>Net <b>{peso(h.net)}</b></span>
        </> : <span>Point at a bar (or tap it) to see that day.</span>}
      </figcaption>
    </figure>
  );
}

/** Horizontal bars with the value written at the end of each bar. */
export function HBars({ items, money = true, color = GAIN }) {
  const max = Math.max(1, ...items.map(([, v]) => v));
  const fmt = money ? peso : (v) => kg(v, 0);
  return (
    <div className="ms-hbars">
      {items.map(([label, v]) => (
        <div className="row" key={label}>
          <span className="lbl">{label}</span>
          <span className="bar"><i style={{ width: `${(v / max) * 78}%`, background: color }} /><em>{fmt(v)}</em></span>
        </div>
      ))}
    </div>
  );
}

export { GAIN, LOSS };
