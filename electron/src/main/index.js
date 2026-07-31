// 应用入口 — 全部装配逻辑藏 ApplicationService 深模块 (RFC 2026-07-27)。
// 99 → 2 行: 20 服务依赖图 + 3 await 顺序 + electronApp 副作用 + 错误兜底经 27 factory-or-default 注入。
const { ApplicationService } = require('./services/application');
new ApplicationService().run();
