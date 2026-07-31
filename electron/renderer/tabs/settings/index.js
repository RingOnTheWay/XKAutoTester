/**
 * Settings Tab - 统一导出
 * 将 Model / View / Controller 组装为完整 Tab 模块
 */
import { SettingsModel } from './model.js';
import { SettingsView } from './view.js';
import { SettingsController } from './controller.js';

export { SettingsModel, SettingsView, SettingsController };

/**
 * 创建 settings Tab 实例
 * @returns {{ model: SettingsModel, view: SettingsView, controller: SettingsController }}
 */
export function createSettingsTab() {
  const model = new SettingsModel();
  const view = new SettingsView();
  const controller = new SettingsController(model, view);
  return { model, view, controller };
}
