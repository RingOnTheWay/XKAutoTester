// 应用入口 — 全部装配逻辑藏 ApplicationService 深模块 (RFC 2026-07-27)。
// 99 → 2 行: 20 服务依赖图 + 3 await 顺序 + electronApp 副作用 + 错误兜底经 27 factory-or-default 注入。
const { app } = require('electron');
const { ApplicationService } = require('./services/application');

// R27 修复: 模块加载期崩溃兜底 — run() 的 try/catch 只能接住装配/初始化期异常,
// 模块级 require 失败 (如缺依赖 ERR_MODULE_NOT_FOUND) 发生在 new ApplicationService()
// 之前, 直通 uncaughtException。打包版 Electron 默认弹 "Uncaught Exception" 对话框后
// 进程不退 → 关框后挂后台只能任务管理器杀。此处注册兜底: 致命异常记日志 + 强制退出。
// 抽函数 + require.main 守卫: 测试可直接 require 本模块 (不触发 run) 验证 handler。
function installFatalErrorHandlers(electronApp = app) {
  const onUncaught = (error) => {
    console.error('[main] 未捕获异常, 强制退出:', error);
    try {
      electronApp.exit(1);
    } catch {
      process.exit(1);
    }
  };
  const onRejection = (reason) => {
    console.error('[main] 未处理的 Promise 拒绝:', reason);
  };
  process.on('uncaughtException', onUncaught);
  process.on('unhandledRejection', onRejection);
  return () => {
    process.removeListener('uncaughtException', onUncaught);
    process.removeListener('unhandledRejection', onRejection);
  };
}

// R27 修复: 原 require.main === module 守卫 — electron-vite dev 下 electron 的
// require.main 指向 electron 可执行本身 (entry=false), 启动逻辑被整体跳过 → 无窗口。
// 改判 process.versions.electron (仅 electron 主进程存在), node 测试 require 不受影响。
if (process.versions.electron) {
  installFatalErrorHandlers();
  new ApplicationService().run();
}

module.exports = { installFatalErrorHandlers };
