import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quantile, upperTukeyFence, pearson, round } from '../src/data/stats.js';

test('quantile interpolates like PERCENTILE_CONT', () => {
  const sorted = [1, 2, 3, 4];
  assert.equal(quantile(sorted, 0.5), 2.5);
  assert.equal(quantile(sorted, 0.25), 1.75);
  assert.equal(quantile([], 0.5), null);
});

test('upper Tukey fence ignores nulls', () => {
  // Q1 = 1.75, Q3 = 3.25, IQR = 1.5 -> fence = 3.25 + 2.25 = 5.5
  assert.equal(upperTukeyFence([4, null, 1, 3, 2]), 5.5);
  assert.equal(upperTukeyFence([null]), null);
});

test('pearson correlation', () => {
  assert.equal(pearson([1, 2, 3], [2, 4, 6]), 1);
  assert.equal(pearson([1, 2, 3], [3, 2, 1]), -1);
  assert.equal(pearson([1, 1, 1], [1, 2, 3]), null); // no variance
});

test('round matches SQL ROUND (decimal half away from zero)', () => {
  assert.equal(round(179.575, 2), 179.58); // toFixed would give 179.57
  assert.equal(round(-2.345, 2), -2.35);
  assert.equal(round(0, 2), 0);
  assert.equal(round(null), null);
});
