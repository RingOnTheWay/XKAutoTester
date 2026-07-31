/**
 * Android Connection Tab - 统一导出
 */
import { AndroidConnectionModel } from './model.js';
import { AndroidConnectionView } from './view.js';
import { AndroidConnectionController } from './controller.js';

export { AndroidConnectionModel, AndroidConnectionView, AndroidConnectionController };

/**
 * 创建 android-connection Tab 实例
 * @returns {{ model: AndroidConnectionModel, view: AndroidConnectionView, controller: AndroidConnectionController }}
 */
export function createAndroidConnectionTab() {
  const model = new AndroidConnectionModel();
  const view = new AndroidConnectionView();
  const controller = new AndroidConnectionController(model, view);
  return { model, view, controller };
}
