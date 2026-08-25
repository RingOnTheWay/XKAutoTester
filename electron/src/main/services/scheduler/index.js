// scheduler/ — 调度深模块子目录。对称 src/main/core/adb/。
//
// 现 5 文件:
//   planQueue.js       — 纯数据 heap (compare 注入)
//   strategies.js      — 常量 SSOT + checkInterval 纯函数
//   effects.js         — 默认 factory 实现 (fs.watch / webContents.send / timer)
//   smartScheduler.js  — orchestrator (7 factory-or-default) — 唯一对外接口
//   index.js           — 4 符号 re-export
// 调用方 (factories.js / ElectronApp.js / scheduledPlanHandlers.js) 直接持 SmartScheduler。

const { SmartScheduler } = require('./smartScheduler');
const { ScheduledPlanQueue, compareByScheduledTime } = require('./planQueue');
const { SCHEDULE_STRATEGY } = require('./strategies');

module.exports = {
  SmartScheduler,
  ScheduledPlanQueue,
  SCHEDULE_STRATEGY,
  compareByScheduledTime,
};
