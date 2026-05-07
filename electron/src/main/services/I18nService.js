const i18next = require('i18next');
const path = require('path');
const asyncFs = require('../utils/asyncFs');

class I18nService {
  constructor() {
    this.i18n = i18next.createInstance();
    this.initialized = false;
  }

  async init(projectRoot, isPackaged, userConfigPath) {
    if (this.initialized) return;
    
    try {
      const localesPath = path.join(__dirname, '..', '..', '..', 'locales');
      
      const resources = {};
      
      const zhCNPath = path.join(localesPath, 'zh-CN', 'translation.json');
      if (await asyncFs.exists(zhCNPath)) {
        const zhCNData = await asyncFs.readJson(zhCNPath);
        resources['zh-CN'] = { translation: zhCNData };
      }
      
      const enUSPath = path.join(localesPath, 'en-US', 'translation.json');
      if (await asyncFs.exists(enUSPath)) {
        const enUSData = await asyncFs.readJson(enUSPath);
        resources['en-US'] = { translation: enUSData };
      }
      
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
      
      await this.i18n.init({
        lng: savedLanguage,
        fallbackLng: 'zh-CN',
        resources: resources,
        interpolation: { escapeValue: false }
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

module.exports = new I18nService();
