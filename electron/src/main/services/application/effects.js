// effects — 默认副作用包装 (3 await injector + schedulerInitializer + registerHandlers + errorHandler)。
//
// 对称 smartScheduler.js effects.js (globalTimerProvider + defaultWatcherFactory + defaultNotifierFactory)。
// 5 类副作用经 factory-or-default 注入 ApplicationService。

const { I18nService } = require('../I18nService');
const i18nService = new I18nService();
const { registerAllHandlers } = require('../../handlers');

const defaultI18nInitializer = async (projectRoot, isPackaged, userConfigPath) => {
  await i18nService.init(projectRoot, isPackaged, userConfigPath);
};

const defaultPythonEnvConfigurer = async (environmentService) => {
  await environmentService.configurePythonEnvironment();
};

const defaultApkParserInitializer = async (apkParserService) => {
  await apkParserService.initialize();
};

const defaultSchedulerInitializer = (schedulerService, i18nSvc, scheduledPlanService) => {
  schedulerService.init(i18nSvc, scheduledPlanService);
};

const defaultRegisterHandlers = registerAllHandlers;

const defaultErrorHandler = {
  onInitFail: (error) => {
    console.error('初始化服务失败:', error);
    process.exit(1);
  },
};

module.exports = {
  defaultI18nInitializer,
  defaultPythonEnvConfigurer,
  defaultApkParserInitializer,
  defaultSchedulerInitializer,
  defaultRegisterHandlers,
  defaultErrorHandler,
  // 暴露 i18n 单例供 applicationService.js 用 (factory 返回 require 实例)
  i18nService,
};
