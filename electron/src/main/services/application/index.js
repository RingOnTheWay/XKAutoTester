// application/ — 应用入口深模块子目录。对称 src/main/services/scheduler/。
//
// 4 文件:
//   factories.js          — 20 服务默认 factory lambda (纯构造)
//   effects.js            — 默认副作用 (3 await injector + schedulerInitializer + registerHandlers + errorHandler)
//   applicationService.js — ApplicationService orchestrator (27 factory-or-default)
//   index.js              — re-export ApplicationService (单符号)

const { ApplicationService } = require('./applicationService');

module.exports = { ApplicationService };
