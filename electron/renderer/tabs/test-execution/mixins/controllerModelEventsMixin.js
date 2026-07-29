// Model events mixin for TestExecutionController
// Extracted from controller.js during refactor
// Provides: model event → view render wiring (bindModelEvents) + model listener helper (onModel)

import { Toast } from '../../../components/toast.js';

export const controllerModelEventsMixin = {
  // ─── Model 事件 → View 渲染 ──────────────────────────────

  bindModelEvents() {
    const model = this.model;
    const view = this.view;

    // 测试计划列表变更
    this.onModel(model, 'testPlans-changed', (plans) => {
      view.renderTestPlans(plans, model.currentTestPlan?.id, (plan) => {
        // toggle: 再次点击已选中的计划则取消选中
        if (model.currentTestPlan?.id === plan.id) {
          model.deselectTestPlan();
        } else {
          model.selectTestPlan(plan);
        }
      }, model.runningTestPlanName);
    });

    // 当前测试计划变更
    this.onModel(model, 'currentTestPlan-changed', (plan) => {
      view.selectTestPlanItem(plan?.id);
      // 选中测试计划时取消定时计划选中
      if (plan && model.currentScheduledPlan) {
        model.deselectScheduledPlan();
      }
      view.updatePlanButtons(!!plan, model.isRunning);
      view.updateRunButtonState(!!plan, model.isRunning);
      view.updateViewReportButton(!!plan);

      // 根据测试计划自动设置测试目录，并禁用/启用"选择测试目录"按钮
      if (plan && plan.testFiles && plan.testFiles.length > 0) {
        const firstFile = plan.testFiles[0];
        const filePath = firstFile.path || firstFile;
        if (filePath) {
          const pathParts = String(filePath).split(/[\\/]/);
          const directoryPath = pathParts.slice(0, -1).join('/');
          const displayName = pathParts[pathParts.length - 2] || directoryPath.split(/[\\/]/).pop() || directoryPath;
          model.updateSelectedDirectory(directoryPath, displayName);
        }
        // 同步设置 selectedTestFiles（runTests/checkAndroidDeviceConfig/checkBlePortConfig 依赖此值）
        model.setSelectedTestFiles(plan.testFiles);
        // 选中计划时禁用"选择测试目录"按钮
        view.updateSelectDirectoryButton(true);
        // 用计划的testTypes渲染测试类型，并禁用checkbox
        const testTypes = plan.testTypes || [];
        const markers = testTypes.map(t => typeof t === 'string' ? t : t?.name || t);
        view.displayTestTypes(markers, null, false, (selectedTypes) => {
          model.emit('test-types-selection-changed', selectedTypes);
        }, true, testTypes);
      } else {
        // 取消选中或计划无文件时清空目录并启用按钮
        model.updateSelectedDirectory(null, null);
        view.updateSelectDirectoryButton(false);
        // 清空测试类型显示，恢复占位消息
        view.displayTestTypes([], window.i18n.t('testExecution.selectTestPlanFirstPlaceholder'), false);
      }
    });

    // 定时计划列表变更
    this.onModel(model, 'scheduledPlans-changed', (plans) => {
      view.renderScheduledPlansList(plans, model.currentScheduledPlan?.id, (plan) => {
        // toggle: 再次点击已选中的计划则取消选中
        if (model.currentScheduledPlan?.id === plan.id) {
          model.deselectScheduledPlan();
        } else {
          model.selectScheduledPlan(plan);
        }
      }, model.runningScheduledPlanId);
    });

    // 当前定时计划变更
    this.onModel(model, 'currentScheduledPlan-changed', (plan) => {
      view.selectScheduledPlanItem(plan?.id);
      // 选中定时计划时取消测试计划选中
      if (plan && model.currentTestPlan) {
        model.deselectTestPlan();
      }
      view.updateScheduledPlanButtons(!!plan);

      if (plan) {
        // 选中定时计划时：自动选中关联的测试计划（不启用编辑/删除按钮）
        const testPlanIds = (plan.testPlans || []).map(p => typeof p === 'string' ? p : p.id);

        // 视觉上高亮关联的测试计划卡片
        view.highlightTestPlanItems(testPlanIds);

        // 找到关联的测试计划来显示目录和测试类型
        const allPlans = model.testPlans;
        const matchedPlans = allPlans.filter(p => testPlanIds.includes(p.id));
        const firstPlan = matchedPlans.length > 0 ? matchedPlans[0] : null;

        if (firstPlan) {
          // 显示目录
          if (firstPlan.testDirectory) {
            model.updateSelectedDirectory(firstPlan.testDirectory, firstPlan.testDirectory.split(/[/\\]/).pop());
          }
          // 显示测试类型（禁用状态）
          const testTypes = firstPlan.testTypes || [];
          const markers = testTypes.map(t => typeof t === 'string' ? t : t?.name || t);
          view.displayTestTypes(markers, null, false, () => {}, true, testTypes);
        } else {
          model.updateSelectedDirectory(null, null);
          view.displayTestTypes([], window.i18n.t('testExecution.selectTestPlanFirstPlaceholder'), false);
        }

        // 不启用测试计划的编辑/删除按钮
        view.updatePlanButtons(false, model.isRunning);
        view.updateSelectDirectoryButton(true);
        view.updateRunButtonState(true, model.isRunning);
        view.updateViewReportButton(true);
      } else {
        view.highlightTestPlanItems([]);
        model.setSelectedTestFiles([]);
        model.updateSelectedDirectory(null, null);
        view.displayTestTypes([], window.i18n.t('testExecution.selectTestPlanFirstPlaceholder'), false);
        view.updatePlanButtons(false, model.isRunning);
        view.updateSelectDirectoryButton(false);
        view.updateRunButtonState(false, model.isRunning);
        view.updateViewReportButton(false);
      }
    });

    // 运行状态变更
    this.onModel(model, 'isRunning-changed', (isRunning) => {
      view.updateUIForRunning(isRunning);
      view.updateRunButtonState(!!model.currentTestPlan, isRunning);
      // 运行结束后，若仍有测试计划选中，保持"选择测试目录"按钮禁用
      if (!isRunning && model.currentTestPlan) {
        view.updateSelectDirectoryButton(true);
      }
    });

    // 正在执行的测试计划名称变更 → 边框渐变动画
    this.onModel(model, 'runningTestPlanName-changed', (planName) => {
      view.setTestPlanRunning(planName, model.isRunning);
    });

    // 正在执行的定时计划 ID 变更 → 边框渐变动画
    this.onModel(model, 'runningScheduledPlanId-changed', (planId) => {
      view.setScheduledPlanRunning(planId, model.isRunning);
    });

    // 选中目录变更
    this.onModel(model, 'selectedDirectory-changed', (path) => {
      const displayName = path ? path.split(/[\\/]/).pop() : '';
      view.updateSelectedDirectory(path, displayName);
    });

    // 选中测试文件变更（仅手动选择目录时重新加载标记）
    this.onModel(model, 'selectedTestFiles-changed', () => {
      // 从计划选择文件时不重新加载标记（计划已有testTypes）
      if (!model.currentTestPlan) {
        // 无选中文件时显示占位，不读 pytest.ini 全部 marker
        const files = model.selectedTestFiles;
        if (!files || files.length === 0) {
          view.displayTestTypes([], window.i18n.t('testExecution.selectTestPlanFirstPlaceholder'), false);
          return;
        }
        // 从选中文件提取实际使用的 @pytest.mark.xxx
        model.extractMarkersFromSelectedFiles();
      }
    });

    // 当前标记（测试类型）变更
    this.onModel(model, 'currentMarkers-changed', (markers) => {
      const isPlanSelected = !!model.currentTestPlan;
      const planTestTypes = model.currentTestPlan?.testTypes || [];
      const preselected = planTestTypes.map(t => typeof t === 'string' ? t : t?.name || t);
      view.displayTestTypes(markers, null, false, (selectedTypes) => {
        model.emit('test-types-selection-changed', selectedTypes);
      }, isPlanSelected, preselected);
    });

    // 输出刷新（批量缓冲）
    this.onModel(model, 'output-flushed', (bufferedItems) => {
      for (const item of bufferedItems) {
        view.appendOutputToDOM(item.text, item.isError);
      }
    });

    // 输出清除
    this.onModel(model, 'output-cleared', () => {
      view.clearOutputDisplay();
    });

    // MVC: model 请求显示设备选择弹窗 → controller 调 view,结果回传 model
    this.onModel(model, 'request-device-selection', async ({ mode, resolve, reject }) => {
      try {
        const deviceId = await view.showDeviceSelection({ mode });
        resolve(deviceId);
      } catch (error) {
        reject(error);
      }
    });

    // 进度变更
    this.onModel(model, 'progress-changed', ({ status, percentage }) => {
      view.updateProgress(status, percentage);
    });

    // 循环进度变更
    this.onModel(model, 'loop-progress-changed', ({ current, total }) => {
      view.updateLoopProgress(current, total);
    });

    // 测试运行完成
    this.onModel(model, 'test-run-complete', () => {
      view.updateRunButtonState(!!model.currentTestPlan, false);
      view.updatePlanButtons(!!model.currentTestPlan, false);
      view.updateViewReportButton(true);
    });

    // 报告模态框事件
    this.onModel(model, 'show-report-modal', (testPlan) => {
      view.openReportModal();
      view.resetReportModalButtons();
      view.setReportPlanName(testPlan?.name || '');
      // 显示加载状态
      view.showReportLoading();
    });

    this.onModel(model, 'report-runs-loaded', (runs) => {
      view.renderReportRuns(runs, null, (run) => {
        // 直接存储选中的 run 对象
        model.selectReportRun(run);
      }, (run) => {
        // 删除按钮回调: 弹确认框
        view.showConfirmModal(
          window.i18n.t('reportModal.delete'),
          window.i18n.t('reportModal.deleteConfirm'),
          () => model.deleteReportRun(run)
        );
      });
      // 初始禁用"打开"按钮（选择运行记录后启用）
      view.enableViewReportButton(false);
    });

    this.onModel(model, 'report-runs-error', (errorMsg) => {
      view.showReportError(errorMsg);
    });

    this.onModel(model, 'report-run-selected', () => {
      view.enableViewReportButton(true);
    });

    this.onModel(model, 'report-run-deleted', () => {
      Toast.success(window.i18n.t('reportModal.deleteSuccess'));
      view.enableViewReportButton(false);
    });

    this.onModel(model, 'report-opened', () => {
      view.closeReportModal();
      view.resetReportModalButtons();
      Toast.success(window.i18n.t('python.pytestRunner.reportOpened'));
    });

    this.onModel(model, 'report-open-failed', (error) => {
      view.resetReportModalButtons();
      const reason = error?.message || window.i18n.t('python.pytestRunner.reportOpenFailed');
      Toast.error(window.i18n.t('python.pytestRunner.reportOpenFailed') + ': ' + reason);
    });

    // 通用错误
    this.onModel(model, 'error', (err) => {
      const msg = typeof err === 'string' ? err : (err?.error?.message || err?.message || err?.source || String(err));
      view.showError(msg);
    });

    // 编辑测试计划弹窗
    this.onModel(model, 'show-edit-plan-modal', async (plan) => {
      view.openPlanModal();
      view.setPlanModalTitle(window.i18n.t('testExecution.editTestPlan'));
      // 先扫描并渲染文件列表（传入编辑设备按钮回调）
      const files = await this.model.scanTestFiles();
      await view.renderModalTestFiles(files || [], plan.testFiles || [], (file, checked) => {
        // 文件选择变更时重新提取测试类型
        this.refreshModalTestTypes();
      }, (fileName, filePath) => {
        // 编辑设备按钮回调
        this.model.showEditDeviceIdModal(fileName, filePath);
      }, (fileName) => this.model.getTestCase(fileName));
      // 预选表单字段（名称、描述、循环等）+ 按钮切换为更新模式
      view.preselectModalItems(plan);
      // 从计划文件提取 markers 并渲染测试类型，预选 plan.testTypes
      const selectedFiles = view.getModalSelectedTestFiles();
      if (selectedFiles.length > 0) {
        const markers = await this.model.extractMarkersFromFiles(selectedFiles);
        view.renderModalTestTypes(markers, plan.testTypes || [], (type, checked) => {
          // 类型选择变更回调
        });
      } else {
        view.renderModalTestTypesPlaceholder();
      }
    });

    // 编辑定时计划弹窗
    this.onModel(model, 'show-edit-scheduled-plan-modal', (plan) => {
      // 设置弹窗标题
      view.setScheduledPlanModalTitle(window.i18n.t('scheduledPlan.editTitle') || '编辑定时计划');

      // 填充定时计划表单数据（ISO 时间 → "YYYY-MM-DD HH:mm"）
      view.fillScheduledPlanForm({
        name: plan.name || '',
        scheduledTime: plan.scheduledTime,
      });

      // 显示/隐藏按钮：编辑模式显示更新按钮
      view.setScheduledPlanModalMode('edit');

      // 渲染测试计划列表并预选
      // plan.testPlans 可能是 ID 字符串数组 ["id1","id2"] 或对象数组 [{id,name}]
      let selectedPlanIds = [];
      if (plan.testPlans && Array.isArray(plan.testPlans)) {
        selectedPlanIds = plan.testPlans.map(p => typeof p === 'string' ? p : p.id);
      }
      const plans = model.testPlans;
      view.renderScheduledPlanTestPlansList(plans, selectedPlanIds, (planId, checked) => {
        // checkbox 变更回调
      });

      view.openScheduledPlanModal();
    });

    // 定时计划弹窗的测试计划列表
    this.onModel(model, 'test-plans-for-scheduled-modal', (plans) => {
      view.renderScheduledPlanTestPlansList(plans, [], () => {});
    });

    // 编辑设备连接标识弹窗
    this.onModel(model, 'show-edit-device-id-modal', ({ fileName, filePath, deviceName, platformVersion, blePort, isAndroid, hasBleSteps }) => {
      view.openEditDeviceIdModal({ deviceName, platformVersion, blePort, isAndroid, hasBleSteps });
    });

    // 运行警告（设备未配置等）
    this.onModel(model, 'run-warning', ({ message }) => {
      Toast.warning(message);
    });
  },

  // ─── 辅助方法（Model 事件） ──────────────────────────────

  onModel(emitter, event, handler) {
    const unsub = emitter.on(event, handler);
    this.cleanups.push(unsub);
  },
};
