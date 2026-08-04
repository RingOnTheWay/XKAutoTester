// effects — 默认副作用包装 (4 await injector + registerHandlers + errorHandler)。
//
// 对称 smartScheduler.js effects.js (globalTimerProvider + defaultWatcherFactory + defaultNotifierFactory)。
// 4 类副作用经 factory-or-default 注入 ApplicationService。
// M1: 删 defaultSchedulerInitializer (SmartScheduler 直接由 factory 2 参构造, 无需 2-step init)
// M4: 新增 defaultUpdateServiceInitializer (从 factory 外移的读 config.json 副作用, 对称 apkParserInitializer)

const path = require('path');
const asyncFs = require('../../utils/asyncFs');
const { registerAllHandlers } = require('../../handlers');

// i18nService 实例由 applicationService.js 通过 i18nServiceFactory 创建并注入 (构造注入, 删模块级单例)
const defaultI18nInitializer = async (i18nService, projectRoot, isPackaged, userConfigPath) => {
  await i18nService.init(projectRoot, isPackaged, userConfigPath);
};

const defaultPythonEnvConfigurer = async (environmentService) => {
  await environmentService.configurePythonEnvironment();
};

const defaultApkParserInitializer = async (apkParserService) => {
  await apkParserService.initialize();
};

// M4: 读 config.json + 调 updateService.initialize (对称 apkParserInitializer 二段构造)
// 容错: 读失败保持 constructor 默认 (allowInsecureSSL=false)
const defaultUpdateServiceInitializer = async (updateService, userConfigPath) => {
  try {
    const configPath = path.join(userConfigPath, 'config.json');
    if (await asyncFs.exists(configPath)) {
      const config = await asyncFs.readJson(configPath);
      updateService.initialize(config);
    }
  } catch (e) {
    // 忽略: 保持默认 false
  }
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
  defaultUpdateServiceInitializer,
  defaultRegisterHandlers,
  defaultErrorHandler,
};
