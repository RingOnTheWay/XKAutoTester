/**
 * Page Package Tab - 统一导出
 */
import { PagePackageModel } from './model.js';
import { PagePackageView } from './view.js';
import { PagePackageController } from './controller.js';

export { PagePackageModel, PagePackageView, PagePackageController };

/**
 * 创建 page-package Tab 实例
 * @returns {{ model: PagePackageModel, view: PagePackageView, controller: PagePackageController }}
 */
export function createPagePackageTab() {
  const model = new PagePackageModel();
  const view = new PagePackageView();
  const controller = new PagePackageController(model, view);
  return { model, view, controller };
}
