import { useEffect, useRef, useState, useCallback } from 'react';

const MAX_SAMPLES = 60;
const MAX_FEED = 200;

// Live alert and telemetry state from the WebSocket. Reconnects with backoff (1s up to 30s).
export function useRealtime(token, { onAlert } = {}) {
  const [status, setStatus] = useState('connecting'); // connecting | live | reconnecting | closed
  const [alerts, setAlerts] = useState({});
  const [feed, setFeed] = useState([]);
  const [samples, setSamples] = useState([]);
  const [summary, setSummary] = useState(null);
  const [simulator, setSimulator] = useState(null);
  const onAlertRef = useRef(onAlert);
  onAlertRef.current = onAlert;

  useEffect(() => {
    if (!token) return undefined;
    let ws;
    let retry = 0;
    let timer;
    let closedByUs = false;

    const upsert = (alert) => setAlerts((prev) => ({ ...prev, [alert.id]: alert }));
    const pushFeed = (type, alert) =>
      setFeed((prev) => [{ type, alert, at: new Date().toISOString(), key: `${alert.id}-${type}-${alert.updated_at}` }, ...prev].slice(0, MAX_FEED));

    const connect = () => {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${window.location.host}/ws?token=${encodeURIComponent(token)}`);
      ws.onopen = () => {
        retry = 0;
        setStatus('live');
      };
      ws.onmessage = (ev) => {
        const { type, data } = JSON.parse(ev.data);
        switch (type) {
          case 'hello':
            setAlerts(Object.fromEntries(data.alerts.map((a) => [a.id, a])));
            setSummary(data.summary);
            setSimulator(data.simulator);
            break;
          case 'telemetry':
            setSamples((prev) => [...prev, data].slice(-MAX_SAMPLES));
            break;
          case 'alert.raised':
          case 'alert.updated':
          case 'alert.resolved':
          case 'alert.acknowledged':
            upsert(data);
            pushFeed(type, data);
            onAlertRef.current?.(type, data);
            break;
          case 'alert.summary':
            setSummary(data);
            break;
          case 'simulator.status':
            setSimulator(data);
            break;
          default:
        }
      };
      ws.onclose = () => {
        if (closedByUs) return setStatus('closed');
        setStatus('reconnecting');
        const delay = Math.min(30000, 1000 * 2 ** retry++);
        timer = setTimeout(connect, delay);
        return undefined;
      };
    };

    connect();
    return () => {
      closedByUs = true;
      clearTimeout(timer);
      ws?.close();
    };
  }, [token]);

  const alertList = Object.values(alerts).sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id.localeCompare(a.id));
  const mergeAlert = useCallback((a) => setAlerts((prev) => ({ ...prev, [a.id]: a })), []);

  return { status, alerts: alertList, feed, samples, summary, simulator, mergeAlert };
}
