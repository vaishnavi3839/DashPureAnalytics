import { useEffect, useRef, useState } from 'react';
import { statusMeta } from '../status.js';

// One bay per report. Colour = load-time band, stripes = no owner, red dot = refresh failed.

const BANDS = [
  { key: 'OK', label: 'Within 15s SLA' },
  { key: 'WARNING', label: '15–30s' },
  { key: 'CRITICAL', label: 'Over 30s' },
];
const PING_MS = 1000;

export function FleetMap({ reports, samples, onSelect }) {
  const [live, setLive] = useState({}); // report_id -> { band, status } from telemetry
  const [pinged, setPinged] = useState(null);
  const [hover, setHover] = useState(null);
  const lastSample = useRef(null);

  useEffect(() => {
    const sample = samples.at(-1);
    if (!sample || sample === lastSample.current) return undefined;
    lastSample.current = sample;
    setLive((prev) => ({ ...prev, [sample.report_id]: { band: sample.latency_band, status: sample.last_refresh_status } }));
    setPinged(sample.report_id);
    const timer = setTimeout(() => setPinged(null), PING_MS);
    return () => clearTimeout(timer);
  }, [samples]);

  const bays = reports.map((r) => ({
    ...r,
    band: live[r.report_id]?.band ?? r.latest_latency_band,
    status: live[r.report_id]?.status ?? r.last_refresh_status,
  }));
  const counts = Object.fromEntries(BANDS.map((b) => [b.key, bays.filter((bay) => bay.band === b.key).length]));
  const orphaned = bays.filter((b) => b.is_orphaned).length;
  const failing = bays.filter((b) => b.status === 'FAILED' || b.status === 'TIMED_OUT').length;

  return (
    <div className="fleet-wrap">
      <div className="chart" onMouseLeave={() => setHover(null)}>
        <div className="fleet" role="grid" aria-label="Report fleet">
          {bays.map((bay) => {
            const failed = bay.status === 'FAILED' || bay.status === 'TIMED_OUT';
            const classes = ['bay', `bay-${bay.band}`, bay.is_orphaned && 'orphaned', failed && 'refresh-failed', pinged === bay.report_id && 'ping'];
            return (
              <button
                key={bay.report_id}
                className={classes.filter(Boolean).join(' ')}
                aria-label={`${bay.report_id}: ${statusMeta(bay.band).label}${bay.is_orphaned ? ', orphaned' : ''}`}
                onClick={() => onSelect(bay.report_id)}
                onMouseMove={(e) => {
                  const box = e.currentTarget.parentElement.getBoundingClientRect();
                  setHover({ bay, x: e.clientX - box.left + 14, y: e.clientY - box.top + 14 });
                }}
              >
                <span className="led" />
              </button>
            );
          })}
        </div>
        {hover && (
          <div className="chart-tip" style={{ left: hover.x, top: hover.y }}>
            <b>{hover.bay.report_id}</b> · {hover.bay.report_name}
            <br />Load band: {statusMeta(hover.bay.band).label} · refresh {statusMeta(hover.bay.status).label.toLowerCase()}
            <br />Owner: {hover.bay.owner_email ?? 'none (orphaned)'}
          </div>
        )}
      </div>
      <div className="fleet-legend">
        <div><div className="fleet-big">{bays.length}</div><span>reports in the fleet</span></div>
        <ul>
          {BANDS.map((b) => (
            <li key={b.key}><span className={`sw bay-${b.key}`} />{b.label}<b>{counts[b.key]}</b></li>
          ))}
          <li><span className="sw orphaned" style={{ backgroundColor: '#e3d9cf' }} />No owner<b>{orphaned}</b></li>
          <li><span className="sw" style={{ background: '#fff', border: '1px solid rgba(84,62,46,.2)', position: 'relative' }}><span className="led-sample" /></span>Refresh failing<b>{failing}</b></li>
        </ul>
      </div>
    </div>
  );
}
