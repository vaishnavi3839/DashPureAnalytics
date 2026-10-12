// Same method as SQL PERCENTILE_CONT.
export function quantile(sorted, q) {
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function upperTukeyFence(values, k = 1.5) {
  const sorted = values.filter((v) => v !== null).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  return q3 + k * (q3 - q1);
}

// null when one of the series has no variance.
export function pearson(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let covariance = 0;
  let varX = 0;
  let varY = 0;
  for (let i = 0; i < n; i++) {
    covariance += (xs[i] - meanX) * (ys[i] - meanY);
    varX += (xs[i] - meanX) ** 2;
    varY += (ys[i] - meanY) ** 2;
  }
  return varX === 0 || varY === 0 ? null : covariance / Math.sqrt(varX * varY);
}

export const sum = (values) => values.reduce((a, b) => a + b, 0);
export const mean = (values) => (values.length ? sum(values) / values.length : null);

// Rounds like SQL ROUND(). toFixed() would turn 179.575 into 179.57, not 179.58.
export function round(value, dp = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  if (String(Math.abs(value)).includes('e')) return Number(value.toFixed(dp)); // tiny/huge: exponent form
  const magnitude = Math.round(Number(`${Math.abs(value)}e${dp}`));
  return Math.sign(value) * Number(`${magnitude}e-${dp}`) || 0; // avoid -0
}
