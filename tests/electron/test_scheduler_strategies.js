// strategies 单测 — 阈值 + checkInterval 纯函数。
// 验证: SCHEDULE_STRATEGY 3 阈值 + SAFETY_THRESHOLD + IDLE/LONG_TERM 间隔 + calculateMediumCheckInterval 3 分支。
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const {
  SCHEDULE_STRATEGY,
  SAFETY_THRESHOLD,
  IDLE_CHECK_INTERVAL,
  LONG_TERM_REFRESH_INTERVAL,
  calculateMediumCheckInterval,
} = require(path.join(
  __dirname,
  '..',
  '..',
  'electron',
  'src',
  'main',
  'services',
  'scheduler',
  'strategies.js'
));

test('SCHEDULE_STRATEGY 3 阈值: PRECISE=1h, MEDIUM=24h, LONG_TERM=Infinity', () => {
  assert.strictEqual(SCHEDULE_STRATEGY.PRECISE.threshold, 60 * 60 * 1000);
  assert.strictEqual(SCHEDULE_STRATEGY.MEDIUM.threshold, 24 * 60 * 60 * 1000);
  assert.strictEqual(SCHEDULE_STRATEGY.LONG_TERM.threshold, Infinity);
});

test('SAFETY_THRESHOLD = 100ms (precise mode 提前量)', () => {
  assert.strictEqual(SAFETY_THRESHOLD, 100);
});

test('IDLE_CHECK_INTERVAL = 30min (idle mode polling)', () => {
  assert.strictEqual(IDLE_CHECK_INTERVAL, 30 * 60 * 1000);
});

test('LONG_TERM_REFRESH_INTERVAL = 24h (long_term mode refresh)', () => {
  assert.strictEqual(LONG_TERM_REFRESH_INTERVAL, 24 * 60 * 60 * 1000);
});

test('calculateMediumCheckInterval: <2h → 10min', () => {
  assert.strictEqual(calculateMediumCheckInterval(1 * 60 * 60 * 1000), 10 * 60 * 1000);
  assert.strictEqual(calculateMediumCheckInterval(2 * 60 * 60 * 1000 - 1), 10 * 60 * 1000);
});

test('calculateMediumCheckInterval: <6h → 30min', () => {
  assert.strictEqual(calculateMediumCheckInterval(2 * 60 * 60 * 1000), 30 * 60 * 1000);
  assert.strictEqual(calculateMediumCheckInterval(6 * 60 * 60 * 1000 - 1), 30 * 60 * 1000);
});

test('calculateMediumCheckInterval: else → 60min', () => {
  assert.strictEqual(calculateMediumCheckInterval(6 * 60 * 60 * 1000), 60 * 60 * 1000);
  assert.strictEqual(calculateMediumCheckInterval(24 * 60 * 60 * 1000), 60 * 60 * 1000);
});
