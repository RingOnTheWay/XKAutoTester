// Model events mixin for TestCaseController
// Extracted from controller.js during refactor
// Provides: model event → view render wiring (bindModelEvents) + model listener helper (on)

import { Toast } from '../../../components/toast.js';

export const controllerModelEventsMixin = {
  // ─── Model 事件 → View 渲染 ──────────────────────────────

  bindModelEvents() {
    const model = this.model;

    this.on(model, 'directory-changed', (path) => {
      this.view.renderSelectedDirectory(path);
    });

    this.on(model, 'files-changed', () => {
      // 搜索loading期间跳过列表渲染，等待loading动画结束后再渲染
      if (this.isSearchLoading) {
        const hasDirectory = !!model.get('selectedDirectory');
        this.view.updateAddButtonState(hasDirectory);
        this.view.updateSearchState(hasDirectory);
        return;
      }
      this.view.renderTestFiles(
        model.get('testFiles'),
        model.get('jsonExistsMap'),
        model.get('searchQuery')
      );
      // 选择目录后启用添加按钮和搜索框
      const hasDirectory = !!model.get('selectedDirectory');
      this.view.updateAddButtonState(hasDirectory);
      this.view.updateSearchState(hasDirectory);
      // 绑定文件列表点击事件
      this.bindFileListEvents();
    });

    this.on(model, 'selected-file-changed', (file) => {
      if (file) {
        this.view.showEditor();
      } else {
        this.view.hideEditor();
      }
    });

    this.on(model, 'editing-changed', (isEditing) => {
      this.view.setEditingState(isEditing);
    });

    this.on(model, 'cancel-edit', () => {
      this.view.hideEditor();
      this.view.resetForm();
      this.view.selectFileItem(null);
    });

    this.on(model, 'show-editor', ({ file, isNew, jsonMissing, fileName }) => {
      this.view.showEditorUI({ file, isNew, jsonMissing, fileName });
      // 初始化编辑器组件（apps, markers, platform select 等）
      this.view.initEditor();
      // 绑定 dirty 回调
      this.view.onDirty(() => this.handleMarkDirty());
      // 绑定 app/platform/markers 选项点击事件
      this.bindAppOptionClicks();
      this.bindPlatformOptionClicks();
      this.bindMarkersOptionClicks();
    });

    this.on(model, 'dirty-changed', (isDirty) => {
      this.view.setDirtyState(isDirty);
    });

    this.on(model, 'steps-changed', (steps) => {
      this.view.renderSteps(steps);
      // 根据步骤是否为空显示/隐藏空状态
      if (steps && steps.length > 0) {
        this.view.hideStepsEmpty();
      } else {
        this.view.showStepsEmpty();
      }
      // 初始化步骤卡片内的 custom-select 组件
      this.view.initStepSelectsSafe();
      // 清理旧的步骤卡片事件，重新绑定
      this.unbindStepCardEvents();
      this.bindStepCardEvents();
    });

    this.on(model, 'app-changed', (app) => {
      this.view.renderSelectedApp(app);
      // 选中应用后启用步骤区域
      if (app) {
        this.view.updateStepsSectionState(true);
        this.view.hideStepsEmpty();
        // 重新渲染步骤卡片以更新页面/元素选项
        const steps = this.model.get('steps');
        if (steps && steps.length > 0) {
          this.view.renderSteps(steps);
          this.view.initStepSelectsSafe();
          this.unbindStepCardEvents();
          this.bindStepCardEvents();
        }
      }
    });

    this.on(model, 'platform-changed', (platform) => {
      this.view.renderSelectedPlatform(platform);
    });

    this.on(model, 'markers-changed', (markers) => {
      this.view.renderSelectedMarkers(markers);
      this.syncMarkerOptionsState(markers);
      this.bindMarkerBadgeRemove();
    });

    this.on(model, 'apps-changed', (apps) => {
      this.view.renderAppOptions(apps, this.model.get('selectedApp'));
      this.bindAppOptionClicks();
    });

    this.on(model, 'ble-devices-changed', (devices) => {
      this.view.renderBleDevices(devices);
    });

    this.on(model, 'markers-list-changed', (markers) => {
      this.view.renderMarkersOptions(markers, this.model.get('selectedMarkers'));
      this.bindMarkersOptionClicks();
    });

    this.on(model, 'case-loaded', (data) => {
      this.view.populateForm(data);
      // 确保步骤卡片 custom-select 已初始化
      this.view.initStepSelectsSafe();
      this.unbindStepCardEvents();
      this.bindStepCardEvents();
    });

    this.on(model, 'step-updated', ({ stepId, selectId, value, index }) => {
      // 需要级联渲染的 selectId：页面/元素/操作/输入类型/比较目标值类型/页面操作类型/搜索类型/BLE方法
      const cascadeSelects = [
        'tc-page-select', 'tc-element-select', 'tc-operation-select',
        'tc-input-type-select', 'tc-target-value-type', 'tc-page-operation-type',
        'tc-search-type', 'tc-ble-method-select', 'tc-ble-device-select',
        'tc-compare-element-page', 'tc-compare-element-select',
        'tc-search-element-page', 'tc-search-element-select',
        'tc-multi-element-select', 'tc-multi-operation-select',
        'tc-multi-input-type-select', 'tc-multi-faker-locale',
        'tc-faker-locale', 'tc-faker-provider', 'tc-faker-category', 'tc-faker-method',
        'tc-random-precision', 'tc-nav-key-select', 'tc-ble-step-select',
      ];
      const needsRerender = cascadeSelects.some(cs => selectId.startsWith(cs));
      if (needsRerender) {
        // 先同步 DOM 数据到 model，避免重新渲染时丢失用户编辑的值
        this.model.syncStepsFromDOM(this.view.collectStepCardsData(this.model.get('steps')));
        this.rerenderStepCard(stepId);
      }
    });

    this.on(model, 'case-saved', (result) => {
      this.view.hideEditor();
      Toast.success(window.i18n.t('testCase.saveSuccess'));
    });

    this.on(model, 'case-deleted', () => {
      this.view.hideEditor();
      Toast.success(window.i18n.t('testCase.deleteSuccess'));
    });

    this.on(model, 'error', (err) => {
      const msgKey = err.message || err.source || String(err);
      const translated = window.i18n.t(`testCase.${msgKey}`) || window.i18n.t(msgKey) || msgKey;
      Toast.error(translated);
    });
  },

  // ─── 工具方法 ────────────────────────────────────────────

  /**
   * 注册 Model 事件监听，自动收集取消函数
   */
  on(model, event, handler) {
    const unsub = model.on(event, handler);
    this.unbindModel.push(unsub);
  },
};
