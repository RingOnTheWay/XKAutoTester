// scheduler/ — 调度深模块子目录。对称 src/main/core/adb/。
//
// 6 文件:
//   planQueue.js       — 纯数据 heap (compare 注入)
//   strategies.js      — 常量 SSOT + checkInterval 纯函数
//   effects.js         — 默认 factory 实现 (fs.watch / webContents.send / timer)
//   smartScheduler.js  — orchestrator (7 factory-or-default)
//   SchedulerService.js — facade (公共 API 零变化)
//   index.js           — 4 符号 re-export (兼容)

const { SchedulerService } = require('./SchedulerService');
const { SmartScheduler } = require('./smartScheduler');
const { ScheduledPlanQueue, compareByScheduledTime } = require('./planQueue');
const { SCHEDULE_STRATEGY } = require('./strategies');

module.exports = {
  SchedulerService,
  SmartScheduler,
  ScheduledPlanQueue,
  SCHEDULE_STRATEGY,
  compareByScheduledTime,
};
