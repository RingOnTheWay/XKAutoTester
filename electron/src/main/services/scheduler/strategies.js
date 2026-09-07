// ScheduleStrategyTable — 调度策略常量 + checkInterval 纯函数 SSOT。
//
// 抽自 SmartScheduler.js L93-97 + L193 + L186 + L235 + L240-248。
// 0 副作用, 0 依赖, 可独立单测。对称 inspector_constants.py (协议词表 SSOT)。

const SCHEDULE_STRATEGY = {
  PRECISE: { threshold: 60 * 60 * 1000 }, // 1h
  MEDIUM: { threshold: 24 * 60 * 60 * 1000 }, // 24h
  LONG_TERM: { threshold: Infinity },
};

const SAFETY_THRESHOLD = 100; // ms, precise mode 提前量 (L193)
const IDLE_CHECK_INTERVAL = 30 * 60 * 1000; // 30min, idle mode polling (L186)
const LONG_TERM_REFRESH_INTERVAL = 24 * 60 * 60 * 1000; // 24h, long_term mode refresh (L235)

// R24 P3-10: medium mode checkInterval 3 分支阈值/间隔命名 (原内联乘法表达式)
const MEDIUM_CHECK_THRESHOLD_2H = 2 * 60 * 60 * 1000;
const MEDIUM_CHECK_INTERVAL_10M = 10 * 60 * 1000;
const MEDIUM_CHECK_THRESHOLD_6H = 6 * 60 * 60 * 1000;
const MEDIUM_CHECK_INTERVAL_30M = 30 * 60 * 1000;
const MEDIUM_CHECK_INTERVAL_1H = 60 * 60 * 1000;

/**
 * medium mode checkInterval 3 分支 (L240-248)。
 * - <2h → 10min
 * - <6h → 30min
 * - else → 60min
 */
function calculateMediumCheckInterval(timeUntilPlan) {
  if (timeUntilPlan < MEDIUM_CHECK_THRESHOLD_2H) return MEDIUM_CHECK_INTERVAL_10M;
  if (timeUntilPlan < MEDIUM_CHECK_THRESHOLD_6H) return MEDIUM_CHECK_INTERVAL_30M;
  return MEDIUM_CHECK_INTERVAL_1H;
}

module.exports = {
  SCHEDULE_STRATEGY,
  SAFETY_THRESHOLD,
  IDLE_CHECK_INTERVAL,
  LONG_TERM_REFRESH_INTERVAL,
  calculateMediumCheckInterval,
};
