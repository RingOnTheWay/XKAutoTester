const { registerHandlers } = require('./base/handlerUtils');
const path = require('path');
const asyncFs = require('../utils/asyncFs');
const { IPC_CHANNELS } = require('../../shared/constants');

function mapToAllureLanguage(appLanguage) {
  if (appLanguage && appLanguage.startsWith('zh')) return 'zh';
  if (appLanguage && appLanguage.startsWith('en')) return 'en';
  return 'en';
}

function register(ipcMain, services) {
  const { allureService, notificationService, electronApp, i18nService, userDataService, testPlanService } = services;

  // i18n 文案封装: i18nService 不可用时回退默认文案
  const t = (key, fallback) => (i18nService && typeof i18nService.t === 'function'
    ? i18nService.t(key, { defaultValue: fallback })
    : fallback);

  async function getAppTheme() {
    const configPath = path.join(electronApp.userConfigPath, 'config.json');
    const config = await asyncFs.readConfigIfExists(configPath);
    return config?.APP_SETTINGS?.dark_mode === true;
  }

  // 私有复用: 加载语言 + 主题并打开报告, 成功后创建 Allure 窗口
  // (原 VIEW_REPORT 与 OPEN_REPORT_BY_PATH 重复逻辑抽此)
  async function openReport(runOpen) {
    const appLanguage = i18nService ? i18nService.getLanguage() : 'zh-CN';
    const isDark = await getAppTheme();
    const options = { language: mapToAllureLanguage(appLanguage), isDark };
    const result = await runOpen(options);
    if (result.success && result.url) {
      electronApp.createAllureWindow(result.url, options.language, isDark, allureService);
    }
    return result;
  }

  registerHandlers(ipcMain, {
    [IPC_CHANNELS.VIEW_REPORT]: (testPlanName) =>
      openReport((options) => allureService.openAllureReport(testPlanName, options)),
    [IPC_CHANNELS.CHECK_REPORT_EXISTS]: (testPlanName) => allureService.checkReportExists(testPlanName),
    [IPC_CHANNELS.OPEN_REPORT_BY_PATH]: (reportPath) =>
      openReport((options) => allureService.openReportByPath(reportPath, options)),
    [IPC_CHANNELS.GET_ALLURE_SERVER_STATUS]: () => allureService.getAllureServerStatus(),
    [IPC_CHANNELS.CLEAR_ALLURE_REPORTS]: () => allureService.clearAllureReports(),
    [IPC_CHANNELS.DELETE_REPORT_RUN]: ({ testPlanName, reportPath }) => testPlanService.deleteReportRun(testPlanName, reportPath),
    [IPC_CHANNELS.CLEAR_ALL_LOGS]: () => allureService.clearAllLogs(),
    [IPC_CHANNELS.SEND_DINGTALK_NOTIFICATION]: async (notificationData) => {
      if (!notificationData || typeof notificationData !== 'object' || Array.isArray(notificationData)) {
        return { success: false, error: t('errors.invalidNotification', '无效的通知数据') };
      }
      // 从配置中读取 dingtalk access_token 和 secret，注入到 notificationData
      const configPath = path.join(electronApp.userConfigPath, 'config.json');
      const config = await asyncFs.readConfigIfExists(configPath);
      const dingtalkConfig = config?.APP_SETTINGS?.notification?.dingtalk;
      if (dingtalkConfig) {
        notificationData.accessToken = dingtalkConfig.access_token;
        notificationData.secret = dingtalkConfig.secret;
      }
      return notificationService.sendDingTalkNotification(notificationData);
    }
  });
}

module.exports = { register };
