/**
 * Test Execution Tab - 统一导出
 */
import { TestExecutionModel } from './model.js';
import { TestExecutionView } from './view.js';
import { TestExecutionController } from './controller.js';

export { TestExecutionModel, TestExecutionView, TestExecutionController };

/**
 * 创建 test-execution Tab 实例
 * @returns {{ model: TestExecutionModel, view: TestExecutionView, controller: TestExecutionController }}
 */
export function createTestExecutionTab() {
  const model = new TestExecutionModel();
  const view = new TestExecutionView();
  const controller = new TestExecutionController(model, view);
  return { model, view, controller };
}
