import { useEffect, useRef, useState } from 'react';
import { statusMeta } from '../status.js';

// Small hand-written SVG charts (no chart library).

function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

function hBar(x, y, w, h, r = 4) {
  if (w <= 0) return '';
  const rr = Math.min(r, h / 2, w);
  return `M${x},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h - rr}Q${x + w},${y + h} ${x + w - rr},${y + h}H${x}Z`;
}

function Tooltip({ tip }) {
  if (!tip) return null;
  return (
    <div className="chart-tip" style={{ left: tip.x, top: tip.y }} role="status">
      {tip.content}
    </div>
  );
}

const BAND_FILL = { OK: 'var(--band-ok)', WARNING: 'var(--band-warn)', CRITICAL: 'url(#band-crit)', UNKNOWN: 'var(--band-unknown)' };

export function LiveLatencyChart({ samples, warn = 15, critical = 30, height = 240 }) {
  const [ref, width] = useWidth();
  const [tip, setTip] = useState(null);
  const m = { t: 30, r: 74, b: 26, l: 34 };
  const iw = width - m.l - m.r;
  const ih = height - m.t - m.b;
  const yMax = 60;
  const y = (v) => m.t + ih - (Math.min(v, yMax) / yMax) * ih;
  const slots = 48;
  const step = iw / slots;
  const bw = Math.min(10, Math.max(4, step * 0.5));
  const shown = samples.slice(-slots);
  const offset = slots - shown.length;
  const latest = shown.at(-1);

  return (
    <div className="chart" ref={ref} onMouseLeave={() => setTip(null)}>
      <svg width={width} height={height} role="img" aria-label="Live dashboard load time per telemetry sample">
        <defs>
          <linearGradient id="band-crit" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ff7023" />
            <stop offset="1" stopColor="#fe5000" />
          </linearGradient>
        </defs>
        {[0, 15, 30, 45, 60].map((t) => (
          <g key={t}>
            <line x1={m.l} x2={m.l + iw} y1={y(t)} y2={y(t)} className={t === 0 ? 'axis-base' : 'grid'} />
            <text x={m.l - 8} y={y(t)} className="tick" textAnchor="end" dominantBaseline="middle">{t}s</text>
          </g>
        ))}
        {shown.map((s, i) => {
          const cx = m.l + (offset + i + 0.5) * step;
          const band = s.latency_band ?? (s.avg_load_time_sec > critical ? 'CRITICAL' : s.avg_load_time_sec > warn ? 'WARNING' : 'OK');
          const top = y(s.avg_load_time_sec);
          return (
            <g key={`${s.row_number}-${s.ts}`}>
              <rect x={cx - bw / 2} y={top} width={bw} height={Math.max(bw, m.t + ih - top)} rx={bw / 2} fill={BAND_FILL[band]} />
              <rect
                x={cx - step / 2} y={m.t} width={step} height={ih} fill="transparent"
                onMouseMove={(e) => setTip({
                  x: e.nativeEvent.offsetX + 12, y: e.nativeEvent.offsetY - 10,
                  content: (
                    <>
                      <strong>{s.report_id}</strong> · {s.report_name}
                      <br />Load time <b>{s.avg_load_time_sec}s</b> ({statusMeta(band).label})
                      <br />Refresh {statusMeta(s.last_refresh_status).label} · snapshot {s.snapshot_seq}
                    </>
                  ),
                })}
              />
            </g>
          );
        })}
        {latest && (() => {
          const cx = m.l + (slots - 0.5) * step;
          const cy = y(latest.avg_load_time_sec) - 16;
          return (
            <g className="bubble" pointerEvents="none">
              <rect x={cx - 24} y={cy - 11} width={48} height={22} rx={11} fill="#2a2522" opacity="0.06" transform="translate(0 2)" />
              <rect x={cx - 24} y={cy - 11} width={48} height={22} rx={11} fill="#fff" stroke="rgba(84,62,46,.15)" />
              <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" className="value-label">{latest.avg_load_time_sec}s</text>
            </g>
          );
        })()}
        {[{ v: warn, label: `${warn}s SLA` }, { v: critical, label: `${critical}s critical` }].map((t) => (
          <g key={t.v}>
            <line x1={m.l} x2={m.l + iw} y1={y(t.v)} y2={y(t.v)} className="rule" />
            <text x={m.l + iw + 8} y={y(t.v)} className="rule-label" dominantBaseline="middle">{t.label}</text>
          </g>
        ))}
        <text x={m.l} y={height - 6} className="tick">older</text>
        <text x={m.l + iw} y={height - 6} className="tick" textAnchor="end">now</text>
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
}

export function CapsuleBar({ segments }) {
  const total = segments.reduce((sum, seg) => sum + seg.value, 0) || 1;
  return (
    <div className="capsules" role="img" aria-label={segments.map((seg) => `${seg.label} ${seg.value}`).join(', ')}>
      {segments.filter((seg) => seg.value > 0).map((seg) => {
        const pct = Math.round((seg.value / total) * 100);
        return (
          <div key={seg.label} className="capsule-col" style={{ flexGrow: seg.value }}>
            <span>{seg.label}</span>
            <div className={`capsule capsule-${seg.tone}`}>{pct}%</div>
          </div>
        );
      })}
    </div>
  );
}

export function RingGauge({ value, label, size = 196, stroke = 18 }) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const shown = Math.max(0, Math.min(1, value));
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} role="img" aria-label={`${label}: ${(shown * 100).toFixed(1)}%`}>
        <defs>
          <pattern id="ring-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="rgba(255,255,255,.55)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(84,62,46,.18)" strokeWidth="2" />
          </pattern>
          <linearGradient id="ring-orange" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffb891" />
            <stop offset="1" stopColor="#fe5000" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#ring-hatch)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#ring-orange)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${circumference * shown} ${circumference}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring-label">
        <b>{(shown * 100).toFixed(1)}%</b>
        <small>{label}</small>
      </div>
    </div>
  );
}

export function HBarStacked({ rows, series, format = (v) => v, rowHeight = 26, labelWidth = 92 }) {
  const [ref, width] = useWidth();
  const [tip, setTip] = useState(null);
  const valueWidth = 64;
  const iw = width - labelWidth - valueWidth;
  const max = Math.max(...rows.map((r) => r.values.reduce((a, b) => a + b, 0)), 1e-9);
  const height = rows.length * rowHeight + 4;
  const barH = rowHeight - 10;

  return (
    <div className="chart" ref={ref} onMouseLeave={() => setTip(null)}>
      <ul className="legend legend-top">
        {series.map((s) => (
          <li key={s.name}><span className="legend-swatch" style={{ background: s.color }} />{s.name}</li>
        ))}
      </ul>
      <svg width={width} height={height} role="img" aria-label="Stacked bar chart">
        {rows.map((r, i) => {
          const yTop = i * rowHeight + 5;
          let x = labelWidth;
          const total = r.values.reduce((a, b) => a + b, 0);
          return (
            <g key={r.id}>
              <text x={labelWidth - 8} y={yTop + barH / 2} className="tick" textAnchor="end" dominantBaseline="middle">{r.label}</text>
              {r.values.map((v, si) => {
                const w = (v / max) * iw;
                const isLast = si === r.values.length - 1;
                const seg = isLast
                  ? <path key={si} d={hBar(x, yTop, Math.max(0, w), barH)} fill={series[si].color} />
                  : <rect key={si} x={x} y={yTop} width={Math.max(0, w - 2)} height={barH} fill={series[si].color} />;
                x += w;
                return seg;
              })}
              <text x={labelWidth + (total / max) * iw + 6} y={yTop + barH / 2} className="value-label" dominantBaseline="middle">{format(total)}</text>
              <rect
                x={0} y={yTop - 4} width={width} height={rowHeight} fill="transparent"
                onMouseMove={(e) => setTip({
                  x: e.nativeEvent.offsetX + 12, y: e.nativeEvent.offsetY + 8,
                  content: (
                    <>
                      <strong>{r.label}</strong>{r.sub ? ` · ${r.sub}` : ''}
                      {series.map((s, si) => <div key={s.name}><span className="legend-swatch" style={{ background: s.color }} /> {s.name}: <b>{format(r.values[si])}</b></div>)}
                      <div>Total: <b>{format(total)}</b></div>
                    </>
                  ),
                })}
              />
            </g>
          );
        })}
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
}

export function LineChart({ points, thresholds = [], height = 200, yMax, unit = '', formatX = (x) => x, describe }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const m = { t: 12, r: 70, b: 26, l: 40 };
  const iw = width - m.l - m.r;
  const ih = height - m.t - m.b;
  const top = yMax ?? Math.ceil(Math.max(...points.map((p) => p.y), ...thresholds.map((t) => t.value), 1) / 10) * 10;
  const xs = points.map((p) => p.x);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const x = (v) => m.l + ((v - xMin) / Math.max(1, xMax - xMin)) * iw;
  const y = (v) => m.t + ih - (v / top) * ih;
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.x)},${y(p.y)}`).join('');
  const ticks = [0, top / 2, top];

  const onMove = (e) => {
    const px = e.nativeEvent.offsetX;
    let best = points[0];
    for (const p of points) if (Math.abs(x(p.x) - px) < Math.abs(x(best.x) - px)) best = p;
    setHover(best);
  };

  return (
    <div className="chart" ref={ref}>
      <svg width={width} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label="Line chart">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.l} x2={m.l + iw} y1={y(t)} y2={y(t)} className={t === 0 ? 'axis-base' : 'grid'} />
            <text x={m.l - 6} y={y(t)} className="tick" textAnchor="end" dominantBaseline="middle">{Math.round(t)}{unit}</text>
          </g>
        ))}
        {points.map((p) => (
          <text key={p.x} x={x(p.x)} y={height - 8} className="tick" textAnchor="middle">{points.length <= 20 || p.x % 2 === 0 ? formatX(p.x) : ''}</text>
        ))}
        {thresholds.map((t) => (
          <g key={t.value}>
            <line x1={m.l} x2={m.l + iw} y1={y(t.value)} y2={y(t.value)} className="rule" />
            <text x={m.l + iw + 6} y={y(t.value)} className="rule-label" dominantBaseline="middle">{t.label}</text>
          </g>
        ))}
        <path d={d} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeLinejoin="round" />
        {points.map((p) => (
          <circle key={p.x} cx={x(p.x)} cy={y(p.y)} r={hover?.x === p.x ? 5 : 3} fill="var(--series-1)" stroke="var(--surface-1)" strokeWidth="2" />
        ))}
        {hover && <line x1={x(hover.x)} x2={x(hover.x)} y1={m.t} y2={m.t + ih} className="crosshair" />}
      </svg>
      {hover && (
        <div className="chart-tip" style={{ left: Math.min(x(hover.x) + 12, width - 180), top: 8 }}>
          {describe ? describe(hover) : <>{formatX(hover.x)}: <b>{hover.y}{unit}</b></>}
        </div>
      )}
    </div>
  );
}

export function HBarSimple({ rows, format = (v) => v.toLocaleString(), labelWidth = 200, rowHeight = 28 }) {
  const [ref, width] = useWidth();
  const [tip, setTip] = useState(null);
  const valueWidth = 80;
  const iw = width - labelWidth - valueWidth;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="chart" ref={ref} onMouseLeave={() => setTip(null)}>
      <svg width={width} height={rows.length * rowHeight + 4} role="img" aria-label="Bar chart">
        {rows.map((r, i) => {
          const yTop = i * rowHeight + 6;
          const w = (r.value / max) * iw;
          return (
            <g key={r.id}>
              <text x={labelWidth - 8} y={yTop + 8} className="tick" textAnchor="end" dominantBaseline="middle">{r.label}</text>
              <line x1={labelWidth} x2={labelWidth} y1={yTop - 4} y2={yTop + 20} className="axis-base" />
              <path d={hBar(labelWidth, yTop, Math.max(w, r.value > 0 ? 2 : 0), 16)} fill="var(--series-1)" />
              <text x={labelWidth + w + 6} y={yTop + 8} className="value-label" dominantBaseline="middle">{format(r.value)}</text>
              <rect x={0} y={yTop - 6} width={width} height={rowHeight} fill="transparent"
                onMouseMove={(e) => setTip({ x: e.nativeEvent.offsetX + 12, y: e.nativeEvent.offsetY + 8, content: r.tip ?? <><b>{r.label}</b>: {format(r.value)}</> })} />
            </g>
          );
        })}
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
}
