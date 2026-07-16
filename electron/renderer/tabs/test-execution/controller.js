import { Action } from '../../core/Action.js';
import { Toast } from '../../components/toast.js';

/**
 * TestExecutionController - 测试执行 Tab 控制器
 * 绑定 Model 事件到 View 渲染，绑定 DOM 事件到 Model 方法
 */
export class TestExecutionController {
  #model;
  #view;
  #cleanups = [];

  constructor(model, view) {
    this.#model = model;
    this.#view = view;
  }

  // ─── 生命周期 ────────────────────────────────────────────

  async init() {
    this.#bindModelEvents();
    this.#bindUserActions();
    this.#bindIpcEvents();
    await this.#model.load();
    // 显示测试计划和定时计划区域（HTML 中默认 hidden）
    const testPlanSection = document.getElementById('test-plan-section');
    const scheduledPlanSection = document.getElementById('scheduled-plan-section');
    if (testPlanSection) testPlanSection.classList.remove('hidden');
    if (scheduledPlanSection) scheduledPlanSection.classList.remove('hidden');
    // 设置初始视图状态
    this.#view.updateRunButtonState(false, false);
    this.#view.updatePlanButtons(false, false);
    this.#view.updateScheduledPlanButtons(false);
    this.#view.updateViewReportButton(false);
  }

  destroy() {
    this.#cleanups.forEach(fn => fn());
    this.#cleanups = [];
    this.#model.destroy();
  }

  // ─── Model 事件 → View 渲染 ──────────────────────────────

  #bindModelEvents() {
    const model = this.#model;
    const view = this.#view;

    // 测试计划列表变更
    this.#onModel(model, 'testPlans-changed', (plans) => {
      view.renderTestPlans(plans, model.currentTestPlan?.id, (plan) => {
        // toggle: 再次点击已选中的计划则取消选中
        if (model.currentTestPlan?.id === plan.id) {
          model.deselectTestPlan();
        } else {
          model.selectTestPlan(plan);
        }
      });
    });

    // 当前测试计划变更
    this.#onModel(model, 'currentTestPlan-changed', (plan) => {
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
        view.displayTestTypes([], window.i18n.t('testExecution.selectTestDirectoryFirstPlaceholder'), false);
      }
    });

    // 定时计划列表变更
    this.#onModel(model, 'scheduledPlans-changed', (plans) => {
      view.renderScheduledPlansList(plans, model.currentScheduledPlan?.id, (plan) => {
        // toggle: 再次点击已选中的计划则取消选中
        if (model.currentScheduledPlan?.id === plan.id) {
          model.deselectScheduledPlan();
        } else {
          model.selectScheduledPlan(plan);
        }
      });
    });

    // 当前定时计划变更
    this.#onModel(model, 'currentScheduledPlan-changed', (plan) => {
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
          view.displayTestTypes([], window.i18n.t('testExecution.selectTestDirectoryFirstPlaceholder'), false);
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
        view.displayTestTypes([], window.i18n.t('testExecution.selectTestDirectoryFirstPlaceholder'), false);
        view.updatePlanButtons(false, model.isRunning);
        view.updateSelectDirectoryButton(false);
        view.updateRunButtonState(false, model.isRunning);
        view.updateViewReportButton(false);
      }
    });

    // 运行状态变更
    this.#onModel(model, 'isRunning-changed', (isRunning) => {
      view.updateUIForRunning(isRunning);
      view.updateRunButtonState(!!model.currentTestPlan, isRunning);
      // 运行结束后，若仍有测试计划选中，保持"选择测试目录"按钮禁用
      if (!isRunning && model.currentTestPlan) {
        view.updateSelectDirectoryButton(true);
      }
    });

    // 选中目录变更
    this.#onModel(model, 'selectedDirectory-changed', (path) => {
      const displayName = path ? path.split(/[\\/]/).pop() : '';
      view.updateSelectedDirectory(path, displayName);
    });

    // 选中测试文件变更（仅手动选择目录时重新加载标记）
    this.#onModel(model, 'selectedTestFiles-changed', () => {
      // 从计划选择文件时不重新加载标记（计划已有testTypes）
      if (!model.currentTestPlan) {
        model.loadPytestMarkers();
      }
    });

    // 当前标记（测试类型）变更
    this.#onModel(model, 'currentMarkers-changed', (markers) => {
      const isPlanSelected = !!model.currentTestPlan;
      const planTestTypes = model.currentTestPlan?.testTypes || [];
      const preselected = planTestTypes.map(t => typeof t === 'string' ? t : t?.name || t);
      view.displayTestTypes(markers, null, false, (selectedTypes) => {
        model.emit('test-types-selection-changed', selectedTypes);
      }, isPlanSelected, preselected);
    });

    // 输出刷新（批量缓冲）
    this.#onModel(model, 'output-flushed', (bufferedItems) => {
      for (const item of bufferedItems) {
        view.appendOutputToDOM(item.text, item.isError);
      }
    });

    // 输出清除
    this.#onModel(model, 'output-cleared', () => {
      view.clearOutputDisplay();
      const { testOutput } = view.els;
      if (testOutput) testOutput.classList.remove('has-content');
    });

    // 进度变更
    this.#onModel(model, 'progress-changed', ({ status, percentage }) => {
      view.updateProgress(status, percentage);
    });

    // 循环进度变更
    this.#onModel(model, 'loop-progress-changed', ({ current, total }) => {
      view.updateLoopProgress(current, total);
    });

    // 测试运行完成
    this.#onModel(model, 'test-run-complete', () => {
      view.updateRunButtonState(!!model.currentTestPlan, false);
      view.updatePlanButtons(!!model.currentTestPlan, false);
      view.updateViewReportButton(true);
    });

    // 报告模态框事件
    this.#onModel(model, 'show-report-modal', (testPlan) => {
      view.openReportModal();
      view.resetReportModalButtons();
      const planNameElement = document.getElementById('report-plan-name');
      if (planNameElement) planNameElement.textContent = testPlan?.name || '';
      // 显示加载状态
      const runsList = document.getElementById('report-runs-list');
      const noRuns = document.getElementById('report-no-runs');
      if (runsList) {
        runsList.innerHTML = `
          <div class="report-loading">
            <div class="report-loading-spinner"></div>
            <span data-i18n="reportModal.loading">${window.i18n?.t('reportModal.loading') || '加载中...'}</span>
          </div>
        `;
        runsList.classList.remove('hidden');
      }
      if (noRuns) noRuns.classList.add('hidden');
    });

    this.#onModel(model, 'report-runs-loaded', (runs) => {
      view.renderReportRuns(runs, null, (run) => {
        // 直接存储选中的 run 对象
        model.selectReportRun(run);
      });
      // 初始禁用"打开"按钮（选择运行记录后启用）
      view.enableViewReportButton(false);
    });

    this.#onModel(model, 'report-runs-error', (errorMsg) => {
      const runsList = document.getElementById('report-runs-list');
      if (runsList) {
        runsList.innerHTML = `
          <div class="report-no-runs">
            <span class="svg-icon" data-icon="error"></span>
            <span>${errorMsg}</span>
          </div>
        `;
      }
    });

    this.#onModel(model, 'report-run-selected', () => {
      view.enableViewReportButton(true);
    });

    this.#onModel(model, 'report-opened', () => {
      view.closeReportModal();
      view.resetReportModalButtons();
    });

    this.#onModel(model, 'report-open-failed', () => {
      view.resetReportModalButtons();
    });

    // 通用错误
    this.#onModel(model, 'error', (err) => {
      const msg = typeof err === 'string' ? err : (err?.error?.message || err?.message || err?.source || String(err));
      view.showError(msg);
    });

    // 编辑测试计划弹窗
    this.#onModel(model, 'show-edit-plan-modal', async (plan) => {
      view.openPlanModal();
      view.setPlanModalTitle(window.i18n?.t('testExecution.editTestPlan') || '编辑测试计划');
      // 先扫描并渲染文件列表（传入编辑设备按钮回调）
      const files = await this.#model.scanTestFiles();
      await view.renderModalTestFiles(files || [], plan.testFiles || [], (file, checked) => {
        // 文件选择变更时重新提取测试类型
        this.#refreshModalTestTypes();
      }, (fileName, filePath) => {
        // 编辑设备按钮回调
        this.#model.showEditDeviceIdModal(fileName, filePath);
      });
      // 预选表单字段（名称、描述、循环等）+ 按钮切换为更新模式
      view.preselectModalItems(plan);
      // 从计划文件提取 markers 并渲染测试类型，预选 plan.testTypes
      const selectedFiles = view.getModalSelectedTestFiles();
      if (selectedFiles.length > 0) {
        const markers = await this.#model.extractMarkersFromFiles(selectedFiles);
        view.renderModalTestTypes(markers, plan.testTypes || [], (type, checked) => {
          // 类型选择变更回调
        });
      } else {
        view.renderModalTestTypesPlaceholder();
      }
    });

    // 编辑定时计划弹窗
    this.#onModel(model, 'show-edit-scheduled-plan-modal', (plan) => {
      // 设置弹窗标题
      const modalTitle = document.getElementById('scheduled-plan-modal-title');
      if (modalTitle) modalTitle.textContent = window.i18n.t('scheduledPlan.editTitle') || '编辑定时计划';

      // 填充定时计划表单数据
      const nameInput = document.getElementById('scheduled-plan-name');
      const timeInput = document.getElementById('scheduled-plan-time');
      if (nameInput) nameInput.value = plan.name || '';

      // 转换 scheduledTime：ISO → "YYYY-MM-DD HH:mm"
      if (plan.scheduledTime && timeInput) {
        const date = new Date(plan.scheduledTime);
        if (!isNaN(date.getTime())) {
          const pad = (n) => String(n).padStart(2, '0');
          timeInput.value = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
        } else {
          timeInput.value = plan.scheduledTime;
        }
      }

      // 显示/隐藏按钮
      const saveBtn = document.getElementById('save-scheduled-plan-btn');
      const updateBtn = document.getElementById('update-scheduled-plan-btn');
      if (saveBtn) saveBtn.classList.add('hidden');
      if (updateBtn) updateBtn.classList.remove('hidden');

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
    this.#onModel(model, 'test-plans-for-scheduled-modal', (plans) => {
      view.renderScheduledPlanTestPlansList(plans, [], () => {});
    });

    // 编辑设备连接标识弹窗
    this.#onModel(model, 'show-edit-device-id-modal', ({ fileName, filePath, deviceName, platformVersion, blePort, isAndroid, hasBleSteps }) => {
      view.openEditDeviceIdModal({ deviceName, platformVersion, blePort, isAndroid, hasBleSteps });
    });

    // 运行警告（设备未配置等）
    this.#onModel(model, 'run-warning', ({ message }) => {
      if (typeof Toast !== 'undefined') {
        Toast.warning(message);
      } else {
        view.showError(message);
      }
    });
  }

  // ─── DOM 事件绑定 ──────────────────────────────────────────

  #bindUserActions() {
    // ── 目录选择 ─────────────────────────────────────────────
    this.#addAction('#select-directory-btn', () => this.handleSelectDirectory());

    // ── 测试执行控制 ─────────────────────────────────────────
    this.#addAction('#run-tests-btn', () => this.handleRunTests());
    this.#addAction('#stop-tests-btn', () => this.handleStopTests());
    this.#addAction('#view-report-btn', () => this.handleViewReport());
    this.#addAction('#clear-output-btn', () => this.#model.clearOutput());
    this.#addAction('#open-xkat-folder-btn', () => this.handleOpenXkatFolder());

    // ── 测试计划 CRUD ────────────────────────────────────────
    this.#addAction('#new-plan-btn', () => this.handleShowNewPlanModal());
    this.#addAction('#edit-plan-btn', () => this.handleEditTestPlan());
    this.#addAction('#delete-plan-btn', () => this.handleDeleteTestPlan());
    this.#addAction('#modal-close-btn', () => this.#view.closePlanModal());
    this.#addAction('#modal-cancel-btn', () => this.#view.closePlanModal());
    this.#addAction('#update-plan-btn', () => this.handleUpdateTestPlan());

    // 测试计划表单提交
    const testPlanForm = document.getElementById('test-plan-form');
    if (testPlanForm) {
      const submitHandler = (e) => {
        e.preventDefault();
        this.handleSaveTestPlan();
      };
      testPlanForm.addEventListener('submit', submitHandler);
      this.#cleanups.push(() => testPlanForm.removeEventListener('submit', submitHandler));
    }

    // ── 定时计划 CRUD ────────────────────────────────────────
    this.#addAction('#new-scheduled-plan-btn', () => this.handleShowNewScheduledPlanModal());
    this.#addAction('#edit-scheduled-plan-btn', () => this.handleEditScheduledPlan());
    this.#addAction('#delete-scheduled-plan-btn', () => this.handleDeleteScheduledPlan());
    this.#addAction('#scheduled-plan-modal-close-btn', () => this.#view.closeScheduledPlanModal());
    this.#addAction('#scheduled-plan-cancel-btn', () => this.#view.closeScheduledPlanModal());
    this.#addAction('#update-scheduled-plan-btn', () => this.handleUpdateScheduledPlan());

    // 定时计划表单提交
    const scheduledPlanForm = document.getElementById('scheduled-plan-form');
    if (scheduledPlanForm) {
      const submitHandler = (e) => {
        e.preventDefault();
        this.handleSaveScheduledPlan();
      };
      scheduledPlanForm.addEventListener('submit', submitHandler);
      this.#cleanups.push(() => scheduledPlanForm.removeEventListener('submit', submitHandler));
    }

    // ── 报告弹窗 ─────────────────────────────────────────────
    this.#addAction('#report-modal-close-btn', () => this.#view.closeReportModal());
    this.#addAction('#report-modal-cancel-btn', () => this.#view.closeReportModal());
    this.#addAction('#report-modal-open-btn', () => this.#model.openSelectedReport(this.#model.currentTestPlan));

    // ── 编辑设备连接标识弹窗 ─────────────────────────────────
    // 使用 addEventListener 直接绑定（避免和 android-connection controller 的 Action.bind 冲突）
    const editDeviceCloseBtn = document.getElementById('edit-device-id-modal-close-btn');
    const editDeviceCancelBtn = document.getElementById('edit-device-id-cancel-btn');
    const editDeviceConfirmBtn = document.getElementById('edit-device-id-confirm-btn');
    const editDeviceManageBtn = document.getElementById('edit-device-id-manage-btn');
    const editPortManageBtn = document.getElementById('edit-port-manage-btn');

    if (editDeviceCloseBtn) {
      editDeviceCloseBtn.addEventListener('click', () => this.#view.closeEditDeviceIdModal());
    }
    if (editDeviceCancelBtn) {
      editDeviceCancelBtn.addEventListener('click', () => this.#view.closeEditDeviceIdModal());
    }
    if (editDeviceConfirmBtn) {
      editDeviceConfirmBtn.addEventListener('click', async () => await this.handleConfirmEditDeviceId());
    }
    // 编辑设备ID弹窗中的"设备管理"按钮：先关闭编辑弹窗→打开设备管理弹窗→选完设备后回填并重新打开编辑弹窗
    if (editDeviceManageBtn) {
      editDeviceManageBtn.addEventListener('click', async () => {
        // 保存当前弹窗中的蓝牙端口数据
        const currentData = this.#view.getEditDeviceIdFormData();
        this._editDeviceBlePortBackup = currentData.blePort;
        this._editDeviceHasBleBackup = !!document.getElementById('ble-mock-port-group')?.style.display?.includes('block');

        // 先关闭编辑设备弹窗（解决z-index问题）
        this.#view.closeEditDeviceIdModal();

        const result = await this.#model.selectDeviceForEdit();
        // 重新打开编辑弹窗
        this.#view.openEditDeviceIdModal({
          blePort: this._editDeviceBlePortBackup || '',
          hasBleSteps: this._editDeviceHasBleBackup,
        });
        if (result) {
          this.#view.fillEditDeviceIdFields(result);
        }
      });
    }
    // 蓝牙端口管理按钮
    if (editPortManageBtn) {
      editPortManageBtn.addEventListener('click', async () => {
        // 打开端口管理弹窗 + 扫描端口（不依赖 android-connection controller）
        await this.#handleShowPortModal();
      });
    }

    // ── 端口管理弹窗按钮（android-connection 可能延迟初始化，需独立绑定） ──
    const portModalCloseBtn = document.getElementById('port-modal-close-btn');
    const portModalCancelBtn = document.getElementById('port-modal-cancel-btn');
    const portModalConfirmBtn = document.getElementById('port-modal-confirm-btn');

    if (portModalCloseBtn) {
      portModalCloseBtn.addEventListener('click', () => window.__XKAT_MODALS__?.port?.close());
    }
    if (portModalCancelBtn) {
      portModalCancelBtn.addEventListener('click', () => window.__XKAT_MODALS__?.port?.close());
    }
    if (portModalConfirmBtn) {
      portModalConfirmBtn.addEventListener('click', () => this.#handleConfirmPortSelection());
    }
  }

  /**
   * 打开端口管理弹窗并扫描串口（独立于 android-connection controller）
   * 因为 android-connection 是延迟初始化的，从测试执行 Tab 打开端口弹窗时可能还没 ready
   */
  async #handleShowPortModal() {
    const scanningEl = document.getElementById('port-scanning');
    const portListEl = document.getElementById('port-list');
    const confirmBtn = document.getElementById('port-modal-confirm-btn');

    window.__XKAT_MODALS__?.port?.open();
    if (scanningEl) scanningEl.style.display = 'flex';
    if (portListEl) portListEl.classList.add('hidden');
    if (confirmBtn) confirmBtn.disabled = true;

    try {
      const result = await window.electronAPI.getSerialPorts();

      if (scanningEl) scanningEl.style.display = 'none';
      if (portListEl) portListEl.classList.remove('hidden');

      const ports = result && result.success ? (result.data || []) : [];

      if (ports.length > 0) {
        portListEl.innerHTML = '';
        ports.forEach(port => {
          const item = document.createElement('div');
          item.className = 'device-item';
          item.setAttribute('data-port-id', port.deviceId);
          item.innerHTML = `
            <div style="display:flex;align-items:center;">
              ${this.#view.getIconHtml('cable', 'margin-right:8px;')}
              <div>
                <div style="font-weight:500;">${port.deviceId}</div>
                <div style="font-size:12px;color:var(--text-secondary);">${port.name || ''}</div>
              </div>
            </div>
          `;
          item.addEventListener('click', () => {
            portListEl.querySelectorAll('.device-item').forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
            if (confirmBtn) confirmBtn.disabled = false;
          });
          portListEl.appendChild(item);
        });
      } else {
        portListEl.innerHTML = `
          <div style="padding:16px;text-align:center;color:var(--text-secondary);">
            ${window.i18n.t('testExecution.deviceSelection.noPortsFound') || '未找到串口设备'}
          </div>
        `;
      }
    } catch (error) {
      console.error('获取串口列表失败:', error);
      if (scanningEl) scanningEl.style.display = 'none';
      if (portListEl) {
        portListEl.classList.remove('hidden');
        portListEl.innerHTML = `
          <div style="padding:16px;text-align:center;color:var(--text-secondary);">
            ${window.i18n.t('testExecution.deviceSelection.scanPortsFailed') || '获取串口列表失败'}
          </div>
        `;
      }
    }
  }

  /** 确认端口选择 → 回填到蓝牙端口输入框 */
  #handleConfirmPortSelection() {
    const selectedPort = document.querySelector('#port-list .device-item.selected');
    if (!selectedPort) return;

    const portId = selectedPort.getAttribute('data-port-id');
    const blePortInput = document.getElementById('edit-ble-port-input');
    if (blePortInput && portId) {
      blePortInput.value = portId;
    }
    window.__XKAT_MODALS__?.port?.close();
  }

  // ─── IPC 事件绑定 ──────────────────────────────────────────

  #bindIpcEvents() {
    // 测试输出
    if (window.electronAPI?.onTestOutput) {
      const unsub = window.electronAPI.onTestOutput((data) => {
        // 清理 ANSI 转义码和 \r 字符
        const cleaned = typeof data === 'string' ? data.replace(/\x1b\[[0-9;]*m/g, '').replace(/\r/g, '') : data;
        this.#model.appendOutput(cleaned);
      });
      if (typeof unsub === 'function') this.#cleanups.push(unsub);
    }

    // 测试错误输出
    if (window.electronAPI?.onTestError) {
      const unsub = window.electronAPI.onTestError((data) => {
        // 清理 ANSI 转义码和 \r 字符
        const cleaned = typeof data === 'string' ? data.replace(/\x1b\[[0-9;]*m/g, '').replace(/\r/g, '') : data;
        this.#model.appendError(cleaned);
      });
      if (typeof unsub === 'function') this.#cleanups.push(unsub);
    }

    // 定时计划触发执行
    if (window.electronAPI?.onScheduledTestStart) {
      const unsub = window.electronAPI.onScheduledTestStart((data) => {
        this.#model.handleScheduledTestStart(data);
      });
      if (typeof unsub === 'function') this.#cleanups.push(unsub);
    }

    // 定时计划过期
    if (window.electronAPI?.onScheduledPlanExpired) {
      const unsub = window.electronAPI.onScheduledPlanExpired((data) => {
        this.#model.handleScheduledPlanExpired(data);
      });
      if (typeof unsub === 'function') this.#cleanups.push(unsub);
    }
  }

  // ─── Handler 方法 ──────────────────────────────────────────

  handleSelectDirectory() {
    this.#model.selectDirectory();
  }

  handleRunTests() {
    this.#model.runTests();
  }

  handleStopTests() {
    this.#model.stopTests();
  }

  handleViewReport() {
    this.#model.showReportModal(this.#model.currentTestPlan);
  }

  async handleOpenXkatFolder() {
    try {
      const result = await window.electronAPI?.getDataPath?.();
      const dataPath = result?.currentPath || (typeof result === 'string' ? result : '');
      if (dataPath) {
        window.electronAPI?.openExternal?.(`file:///${dataPath.replace(/\\/g, '/')}`);
        Toast.success(window.i18n?.t('testExecution.openFolderSuccess') || '已打开目录');
      } else {
        Toast.error(window.i18n?.t('testExecution.openFolderFailed') || '未找到数据目录');
      }
    } catch (error) {
      console.error('[TestExecution] 打开日志目录失败:', error);
      Toast.error(window.i18n?.t('testExecution.openFolderFailed') || '打开目录失败');
    }
  }

  async handleShowNewPlanModal() {
    this.#view.openPlanModal();
    // 重置弹窗为"新建"模式：标题 + 清空表单 + 显示保存按钮、隐藏更新按钮
    this.#view.setPlanModalTitle(window.i18n?.t('testExecution.newTestPlan') || '新建测试计划');
    this.#view.resetPlanModalForNew();
    const files = await this.#model.scanTestFiles();
    // 初始渲染文件列表（无选中）和测试类型占位符（未选文件时提示）
    await this.#view.renderModalTestFiles(files || [], [], (file, checked) => {
      // 文件选择变更时重新提取测试类型
      this.#refreshModalTestTypes();
    }, (fileName, filePath) => {
      // 编辑设备按钮回调
      this.#model.showEditDeviceIdModal(fileName, filePath);
    });
    this.#view.renderModalTestTypesPlaceholder();
  }

  /**
   * 根据弹窗内当前选中的测试文件重新提取并渲染测试类型
   */
  async #refreshModalTestTypes() {
    const selectedFiles = this.#view.getModalSelectedTestFiles();
    if (selectedFiles.length === 0) {
      this.#view.renderModalTestTypesPlaceholder();
      return;
    }
    const markers = await this.#model.extractMarkersFromFiles(selectedFiles);
    // 保留当前已选中的测试类型
    const previouslySelected = this.#view.getModalSelectedTestTypes();
    this.#view.renderModalTestTypes(markers, previouslySelected, (type, checked) => {
      // 类型选择变更回调（无需重新提取）
    });
  }

  handleEditTestPlan() {
    if (!this.#model.currentTestPlan) return;
    this.#model.showEditPlanModal(this.#model.currentTestPlan);
  }

  async handleConfirmEditDeviceId() {
    const { deviceName, platformVersion, blePort } = this.#view.getEditDeviceIdFormData();

    if (!deviceName) {
      if (typeof Toast !== 'undefined') {
        Toast.error(window.i18n.t('android.deviceNameRequired') || '请输入设备名称');
      }
      return;
    }

    // BLE 端口格式校验
    if (blePort && !/^COM\d+$/i.test(blePort)) {
      if (typeof Toast !== 'undefined') {
        Toast.error(window.i18n.t('android.blePortFormatError') || '蓝牙端口格式应为 COM+数字');
      }
      return;
    }

    await this.#model.confirmEditDeviceId(deviceName, platformVersion, blePort);
    this.#view.closeEditDeviceIdModal();

    // 刷新测试计划弹窗中的文件列表（更新设备信息显示）
    if (this.#model.currentTestPlan) {
      const files = await this.#model.scanTestFiles();
      await this.#view.renderModalTestFiles(files || [], this.#model.currentTestPlan.testFiles || [], (file, checked) => {
        this.#refreshModalTestTypes();
      }, (fileName, filePath) => {
        this.#model.showEditDeviceIdModal(fileName, filePath);
      });
    }

    if (typeof Toast !== 'undefined') {
      Toast.success(window.i18n.t('android.deviceIdUpdated') || '设备信息已更新');
    }
  }

  async handleSaveTestPlan() {
    const planData = this.#view.collectPlanFormData();
    await this.#model.saveTestPlan(planData);
    this.#view.closePlanModal();
    await this.#model.loadTestPlans();
  }

  async handleUpdateTestPlan() {
    if (!this.#model.currentTestPlan) return;
    const planData = this.#view.collectPlanFormData();
    await this.#model.updateTestPlan(this.#model.currentTestPlan.id, planData);
    this.#view.closePlanModal();
    await this.#model.loadTestPlans();
  }

  async handleDeleteTestPlan() {
    if (!this.#model.currentTestPlan) return;
    this.#view.showConfirmModal(
      window.i18n?.t('testExecution.deletePlan') || '删除测试计划',
      window.i18n?.t('testExecution.deletePlanConfirm') || '确定要删除该测试计划吗？',
      async () => {
        await this.#model.deleteTestPlan(this.#model.currentTestPlan.id);
        await this.#model.loadTestPlans();
      },
    );
  }

  async handleShowNewScheduledPlanModal() {
    // 重置弹窗状态
    const modalTitle = document.getElementById('scheduled-plan-modal-title');
    if (modalTitle) modalTitle.textContent = window.i18n.t('scheduledPlan.newTitle') || '新建定时计划';
    const nameInput = document.getElementById('scheduled-plan-name');
    const timeInput = document.getElementById('scheduled-plan-time');
    if (nameInput) nameInput.value = '';
    if (timeInput) timeInput.value = '';

    const saveBtn = document.getElementById('save-scheduled-plan-btn');
    const updateBtn = document.getElementById('update-scheduled-plan-btn');
    if (saveBtn) saveBtn.classList.remove('hidden');
    if (updateBtn) updateBtn.classList.add('hidden');

    this.#view.openScheduledPlanModal();
    await this.#model.loadTestPlansForScheduledModal();
  }

  handleEditScheduledPlan() {
    if (!this.#model.currentScheduledPlan) return;
    this.#model.showEditScheduledPlanModal(this.#model.currentScheduledPlan);
  }

  async handleSaveScheduledPlan() {
    const formData = this.#view.collectScheduledPlanFormData();

    // 将 scheduledTime 从 "YYYY-MM-DD HH:mm" 转换为 ISO 格式
    let scheduledTime = null;
    if (formData.scheduledTime) {
      scheduledTime = new Date(formData.scheduledTime.replace(' ', 'T'));
      if (isNaN(scheduledTime.getTime())) {
        Toast.error(window.i18n?.t('scheduledPlan.invalidTime') || '无效的时间格式');
        return;
      }
    }

    const planData = {
      name: formData.name,
      scheduledTime: scheduledTime ? scheduledTime.toISOString() : '',
      testPlans: formData.testPlans,
      testPlanNames: this.#getTestPlanNames(formData.testPlans),
      status: 'pending',
    };

    // 检查时间冲突
    const conflictResult = await this.#model.checkTimeConflict(
      planData.scheduledTime,
      planData.excludeId || null
    );
    if (conflictResult?.hasConflict) {
      const override = await this.#showConfirmDialog(
        window.i18n?.t('scheduledPlan.timeConflict') || '时间冲突',
        window.i18n?.t('scheduledPlan.timeConflictMessage') || '该时间段已有定时计划，是否继续？',
      );
      if (!override) return;
    }
    await this.#model.saveScheduledPlan(planData);
    this.#view.closeScheduledPlanModal();
    await this.#model.loadScheduledPlans();
  }

  async handleUpdateScheduledPlan() {
    if (!this.#model.currentScheduledPlan) return;
    const formData = this.#view.collectScheduledPlanFormData();
    const currentPlan = this.#model.currentScheduledPlan;

    // 将 scheduledTime 从 "YYYY-MM-DD HH:mm" 转换为 ISO 格式
    let newScheduledTime = null;
    if (formData.scheduledTime) {
      newScheduledTime = new Date(formData.scheduledTime.replace(' ', 'T'));
      if (isNaN(newScheduledTime.getTime())) {
        Toast.error(window.i18n?.t('scheduledPlan.invalidTime') || '无效的时间格式');
        return;
      }
    }

    // 如果原来是已完成/已过期，但新时间是未来时间，则重置状态为待执行
    let status = currentPlan.status;
    const now = new Date();
    if ((status === 'completed' || status === 'expired') && newScheduledTime && newScheduledTime > now) {
      status = 'pending';
    }

    const planData = {
      id: currentPlan.id,
      name: formData.name,
      scheduledTime: newScheduledTime ? newScheduledTime.toISOString() : '',
      testPlans: formData.testPlans,
      testPlanNames: this.#getTestPlanNames(formData.testPlans),
      status: status,
      created: currentPlan.created,
    };

    await this.#model.updateScheduledPlan(currentPlan.id, planData);
    this.#view.closeScheduledPlanModal();
    await this.#model.loadScheduledPlans();
  }

  #getTestPlanNames(testPlanIds) {
    const allPlans = this.#model.testPlans;
    if (!testPlanIds || !allPlans) return [];
    return testPlanIds.map(id => {
      const plan = allPlans.find(p => p.id === id);
      return plan ? plan.name : id;
    });
  }

  async handleDeleteScheduledPlan() {
    if (!this.#model.currentScheduledPlan) return;
    this.#view.showConfirmModal(
      window.i18n?.t('testExecution.deleteScheduledPlan') || '删除定时计划',
      window.i18n?.t('testExecution.deleteScheduledPlanConfirm') || '确定要删除该定时计划吗？',
      async () => {
        await this.#model.deleteScheduledPlan(this.#model.currentScheduledPlan.id);
        await this.#model.loadScheduledPlans();
      },
    );
  }

  // ─── Tab 生命周期 ──────────────────────────────────────────

  onTabActivated() {
    // 刷新数据
    this.#model.loadTestPlans();
    this.#model.loadScheduledPlans();
  }

  onTabDeactivated() {
    // 无特殊处理
  }

  // ─── 辅助方法 ──────────────────────────────────────────────

  #onModel(emitter, event, handler) {
    const unsub = emitter.on(event, handler);
    this.#cleanups.push(unsub);
  }

  #addAction(selector, handler) {
    const unbind = Action.bind(selector, 'click', handler);
    this.#cleanups.push(unbind);
  }

  async #showConfirmDialog(title, message) {
    const result = await window.electronAPI?.showDialog?.({
      type: 'question',
      title,
      message,
      buttons: [window.i18n?.t('common.confirm') || '确认', window.i18n?.t('common.cancel') || '取消'],
      defaultId: 0,
      cancelId: 1,
    });
    return result?.response === 0;
  }
}
