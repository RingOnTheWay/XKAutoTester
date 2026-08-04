// I18nService — 国际化深模块。
//
// 藏 i18next 实例 + locales 加载 + config 读取 + init 状态机。
// 3 factory-or-default (对称 test_initializer.py L146-198 7-factory + smartScheduler.js L46-71 7-factory options bag)。
//
// 生产: new I18nService()  # 零参
// 测试: new I18nService({ i18nextFactory: fake, localesLoader: fake, languageResolver: fake })

const i18next = require('i18next');
const path = require('path');
const asyncFs = require('../utils/asyncFs');
const pathHelper = require('../utils/pathHelper');

// ── 3 默认 factory (factory-or-default, 对称 test_initializer.py default factories L177-198) ──

const defaultI18nextFactory = () => i18next.createInstance();

const defaultLocalesLoader = async (localesPath) => {
  const resources = {};
  const zhCNPath = path.join(localesPath, 'zh-CN', 'translation.json');
  if (await asyncFs.exists(zhCNPath)) {
    resources['zh-CN'] = { translation: await asyncFs.readJson(zhCNPath) };
  }
  const enUSPath = path.join(localesPath, 'en-US', 'translation.json');
  if (await asyncFs.exists(enUSPath)) {
    resources['en-US'] = { translation: await asyncFs.readJson(enUSPath) };
  }
  return resources;
};

const defaultLanguageResolver = async (userConfigPath, projectRoot) => {
  let savedLanguage = 'zh-CN';
  try {
    const configPath = userConfigPath
      ? path.join(userConfigPath, 'config.json')
      : path.join(projectRoot, 'config', 'config.json');
    if (await asyncFs.exists(configPath)) {
      const configData = await asyncFs.readJson(configPath);
      if (configData.APP_SETTINGS && configData.APP_SETTINGS.language) {
        savedLanguage = configData.APP_SETTINGS.language;
      }
    }
  } catch (error) {
    console.error('读取配置文件失败:', error);
  }
  return savedLanguage;
};

// ── I18nService 类 ──

class I18nService {
  /**
   * @param {Object} [opts] - factory-or-default (全可选, 生产不传)
   * @param {Function} [opts.i18nextFactory] - 默认 i18next.createInstance
   * @param {Function} [opts.localesLoader] - 默认读 locales/{zh-CN,en-US}/translation.json
   * @param {Function} [opts.languageResolver] - 默认读 config.json APP_SETTINGS.language
   */
  constructor(opts = {}) {
    this._i18nextFactory = opts.i18nextFactory || defaultI18nextFactory;
    this._localesLoader = opts.localesLoader || defaultLocalesLoader;
    this._languageResolver = opts.languageResolver || defaultLanguageResolver;
    this.i18n = this._i18nextFactory();
    this.initialized = false;
  }

  async init(projectRoot, isPackaged, userConfigPath) {
    if (this.initialized) return;
    try {
      // S5: 走 pathHelper.getLocalesPath (SSOT), 与 PythonTestService._buildSpawnEnv 注入 Python 的路径一致.
      // 原 __dirname/../../../locales 硬编码在打包模式与 pathHelper 返回值错位 (asar 内 vs resourcesPath/electron/locales).
      const localesPath = pathHelper.getLocalesPath(projectRoot);
      const resources = await this._localesLoader(localesPath);  // 步骤 1: 加载 locales
      const savedLanguage = await this._languageResolver(userConfigPath, projectRoot);  // 步骤 2: 解析语言
      await this.i18n.init({  // 步骤 3: 配置 i18next
        lng: savedLanguage,
        fallbackLng: 'zh-CN',
        resources,
        interpolation: { escapeValue: false },
      });
      this.initialized = true;
    } catch (error) {
      console.error('i18next初始化失败:', error);
    }
  }

  t(key, options) {
    return this.i18n.t(key, options);
  }

  changeLanguage(lng) {
    return this.i18n.changeLanguage(lng);
  }

  getLanguage() {
    return this.i18n.language;
  }
}

module.exports = { I18nService };
