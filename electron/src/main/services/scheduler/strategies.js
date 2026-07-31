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

/**
 * medium mode checkInterval 3 分支 (L240-248)。
 * - <2h → 10min
 * - <6h → 30min
 * - else → 60min
 */
function calculateMediumCheckInterval(timeUntilPlan) {
  if (timeUntilPlan < 2 * 60 * 60 * 1000) return 10 * 60 * 1000;
  if (timeUntilPlan < 6 * 60 * 60 * 1000) return 30 * 60 * 1000;
  return 60 * 60 * 1000;
}

module.exports = {
  SCHEDULE_STRATEGY,
  SAFETY_THRESHOLD,
  IDLE_CHECK_INTERVAL,
  LONG_TERM_REFRESH_INTERVAL,
  calculateMediumCheckInterval,
};
