import { BaseModel } from '../../core/BaseModel.js';
import { hexToRgb, darkenColor, lightenColor, rgbToHex } from '../../core/utils/color.js';
import { formatDownloadSpeed } from '../../core/utils/format.js';
import { ConfigModel } from './models/ConfigModel.js';
import { ThemeModel } from './models/ThemeModel.js';
import { UpdateModel } from './models/UpdateModel.js';

export { UPDATE_DOWNLOAD_RESULT_STATE } from './models/UpdateModel.js';

/**
 * SettingsModel - 设置 Tab Model 门面 (R26 候选② 拆分后的组合根)
 *
 * 原单文件混 8 类关注, 现拆三个子模型 (各自 extends BaseModel):
 * - ConfigModel  配置读写/通知/数据路径/导入导出/清理/防睡眠
 * - ThemeModel   暗色模式/主题色/语言
 * - UpdateModel  版本/更新检查/下载/取消/安装
 *
 * 门面职责:
 * 1. 事件转发: 子模型事件原样上抛, controller/view 订阅词汇不变 (零调用方改动)
 * 2. config→theme 路由: config-changed 时把 APP_SETTINGS 派生进 ThemeModel
 *    (子模型互不引用, 路由逻辑只活在这一处)
 * 3. 方法/状态委托: 保持原 SettingsModel 公开面
 *
 * 迁移注: 颜色数学在 core/utils/color.js, 速度格式化在 core/utils/format.js,
 * markdown 渲染在 core/utils/markdown.js —— view 直接引工具, 静态入口仅为兼容保留。
 */
export class SettingsModel extends BaseModel {
  #configModel = new ConfigModel();
  #themeModel = new ThemeModel();
  #updateModel = new UpdateModel();

  // 状态 key → 子模型路由表 (保持原 get(key) 公开面)
  #themeKeys = new Set(['darkMode', 'themeColor', 'language']);
  #updateKeys = new Set(['versionInfo', 'updateData', 'updatePendingFilePath', 'removeUpdateProgressListener']);

  constructor() {
    super();
    // config → theme 路由 (先于转发注册: 保证 controller 收到 config-changed 前
    // theme 状态已同步, 与原 loadConfig 内联派生顺序一致)
    this.#configModel.on('config-changed', (config) => {
      this.#themeModel.applyFromConfig(config?.APP_SETTINGS || {});
    });
    // 子模型 → 门面 事件转发 (显式列出, 可 grep; 'error' 带原 source 上抛)
    const forward = [
      [this.#configModel, ['config-changed', 'data-path-changed', 'data-path-info-changed', 'error']],
      [this.#themeModel, ['dark-mode-changed', 'theme-color-changed', 'language-changed', 'error']],
      [
        this.#updateModel,
        [
          'version-info-changed',
          'update-available',
          'update-not-available',
          'download-progress',
          'update-downloaded',
          'update-download-cancelled',
          'error',
        ],
      ],
    ];
    for (const [sub, events] of forward) {
      for (const event of events) {
        sub.on(event, (...args) => this.emit(event, ...args));
      }
    }
  }

  // ── 子模型访问 (供渐进迁移与测试) ──────────────────────────────

  get configModel() {
    return this.#configModel;
  }

  get themeModel() {
    return this.#themeModel;
  }

  get updateModel() {
    return this.#updateModel;
  }

  // ── State Getters (委托) ────────────────────────────────────────

  get config() {
    return this.#configModel.config;
  }
  get darkMode() {
    return this.#themeModel.darkMode;
  }
  get themeColor() {
    return this.#themeModel.themeColor;
  }
  get language() {
    return this.#themeModel.language;
  }
  get notification() {
    return this.#configModel.notification;
  }
  get versionInfo() {
    return this.#updateModel.versionInfo;
  }
  get dataPath() {
    return this.#configModel.dataPath;
  }
  get updateData() {
    return this.#updateModel.updateData;
  }
  get updatePendingFilePath() {
    return this.#updateModel.updatePendingFilePath;
  }
  get autoCheckUpdate() {
    return this.#configModel.autoCheckUpdate;
  }
  get preventSleep() {
    return this.#configModel.preventSleep;
  }
  get allowInsecureSSL() {
    return this.#configModel.allowInsecureSSL;
  }

  /**
   * 按状态 key 路由到对应子模型 (保持原 get(key) 公开面)
   */
  get(key) {
    if (this.#themeKeys.has(key)) return this.#themeModel.get(key);
    if (this.#updateKeys.has(key)) return this.#updateModel.get(key);
    return this.#configModel.get(key);
  }

  // ── Initialization ─────────────────────────────────────────────

  async load() {
    await Promise.all([
      this.#configModel.loadConfig(),
      this.#configModel.loadDataPath(),
      this.#updateModel.loadVersionInfo(),
    ]);
  }

  async loadConfig() {
    return this.#configModel.loadConfig();
  }

  async loadVersionInfo() {
    return this.#updateModel.loadVersionInfo();
  }

  async loadDataPath() {
    return this.#configModel.loadDataPath();
  }

  // ── Config / Notification / Data Path / Import-Export / Clear ──

  async saveConfig(settings) {
    return this.#configModel.saveConfig(settings);
  }

  async saveNotificationConfig() {
    return this.#configModel.saveNotificationConfig();
  }

  async changeDataPath(newPath) {
    return this.#configModel.changeDataPath(newPath);
  }

  async resetDataPath() {
    return this.#configModel.resetDataPath();
  }

  async selectExportPath(type = 'config') {
    return this.#configModel.selectExportPath(type);
  }

  async selectImportPath() {
    return this.#configModel.selectImportPath();
  }

  async exportConfig(outputPath) {
    return this.#configModel.exportConfig(outputPath);
  }

  async exportLogs(outputPath) {
    return this.#configModel.exportLogs(outputPath);
  }

  async importConfig(zipPath) {
    return this.#configModel.importConfig(zipPath);
  }

  async clearAllureReports() {
    return this.#configModel.clearAllureReports();
  }

  async clearAllLogs() {
    return this.#configModel.clearAllLogs();
  }

  async setPreventSleep(enable) {
    return this.#configModel.setPreventSleep(enable);
  }

  async relaunchApp() {
    return this.#configModel.relaunchApp();
  }

  async selectDirectory() {
    return this.#configModel.selectDirectory();
  }

  async openExternal(url) {
    return this.#configModel.openExternal(url);
  }

  // ── Theme ──────────────────────────────────────────────────────

  applyDarkMode(isDark) {
    return this.#themeModel.applyDarkMode(isDark);
  }

  applyThemeColor(color) {
    return this.#themeModel.applyThemeColor(color);
  }

  changeLanguage(lang) {
    return this.#themeModel.changeLanguage(lang);
  }

  // ── Update ─────────────────────────────────────────────────────

  async checkForUpdate() {
    return this.#updateModel.checkForUpdate();
  }

  async downloadUpdate() {
    return this.#updateModel.downloadUpdate();
  }

  async cancelDownload() {
    return this.#updateModel.cancelDownload();
  }

  async installUpdate(filePath) {
    return this.#updateModel.installUpdate(filePath);
  }

  // ── Static Utilities (兼容入口: 实现已迁 core/utils) ────────────

  static hexToRgb(hex) {
    return hexToRgb(hex);
  }

  static darkenColor(hex, amount = 0.2) {
    return darkenColor(hex, amount);
  }

  static lightenColor(hex, amount = 0.2) {
    return lightenColor(hex, amount);
  }

  static rgbToHex(r, g, b) {
    return rgbToHex(r, g, b);
  }

  static renderMarkdown(text) {
    return UpdateModel.renderMarkdown(text);
  }

  static formatDownloadSpeed(bytesPerSecond) {
    return formatDownloadSpeed(bytesPerSecond);
  }

  // ── Lifecycle ──────────────────────────────────────────────────

  destroy() {
    this.#configModel.destroy();
    this.#themeModel.destroy();
    this.#updateModel.destroy();
    super.destroy();
  }
}
