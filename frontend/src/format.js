const missing = (v) => v === null || v === undefined;
const DASH = '—';

export const fmt = {
  int: (v) => (missing(v) ? DASH : Math.round(v).toLocaleString()),
  num: (v, dp = 1) => (missing(v) ? DASH : Number(v).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })),
  usd: (v, dp = 0) => (missing(v) ? DASH : `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}`),
  usdCompact: (v) => (missing(v) ? DASH : `$${Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 2 }).format(v)}`),
  pct: (v, dp = 1) => (missing(v) ? DASH : `${(v * 100).toFixed(dp)}%`),
  sec: (v) => (missing(v) ? DASH : `${Number(v).toFixed(1)}s`),
  time: (iso) => (iso ? new Date(iso).toLocaleTimeString() : DASH),
};
