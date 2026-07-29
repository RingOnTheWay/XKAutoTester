/**
 * Test Case Tab - 统一导出
 * 将 Model / View / Controller 组装为完整 Tab 模块
 */
import { TestCaseModel } from './model.js';
import { TestCaseView } from './view.js';
import { TestCaseController } from './controller.js';

export { TestCaseModel, TestCaseView, TestCaseController };

/**
 * 创建 test-case Tab 实例
 * @returns {{ model: TestCaseModel, view: TestCaseView, controller: TestCaseController }}
 */
export function createTestCaseTab() {
  const model = new TestCaseModel();
  const view = new TestCaseView();
  const controller = new TestCaseController(model, view);
  return { model, view, controller };
}
