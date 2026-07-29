// testPlansMixin for TestExecutionView
// Extracted from view.js during refactor
// Provides: 测试计划列表显示 + 测试类型显示

export const testPlansMixin = {
  // ─── 测试计划显示 ──────────────────────────────────────────────

  renderTestPlans(plans, currentPlanId, onSelectPlan, runningPlanName = null) {
    const { testPlanList } = this.els;
    if (!testPlanList) return;
    testPlanList.innerHTML = '';

    if (!plans || plans.length === 0) {
      this.displayTestPlansPlaceholder(window.i18n.t('testExecution.noTestPlans') || '暂无测试计划');
      return;
    }

    plans.forEach(plan => {
      const item = document.createElement('div');
      item.className = `test-plan-item${plan.id === currentPlanId ? ' selected' : ''}${plan.name === runningPlanName ? ' running' : ''}`;
      item.setAttribute('data-plan-id', plan.id);
      item.setAttribute('data-plan-name', plan.name);

      // 构建测试计划详细信息
      const fileCount = plan.testFiles ? plan.testFiles.length : 0;
      const typeCount = plan.testTypes ? plan.testTypes.length : 0;
      const fileInfo = fileCount > 0 ? `${fileCount} ${window.i18n.t('testExecution.files')}` : window.i18n.t('testExecution.noFiles');
      const typeInfo = typeCount > 0 ? `${typeCount} ${window.i18n.t('testExecution.types')}` : window.i18n.t('testExecution.allTypes');

      // 循环设置信息
      const loopCount = plan.loopCount || 1;
      const continueOnFailure = plan.continueOnFailure !== false;
      const loopInfo = window.i18n.t('testExecution.loopInfo', { count: loopCount });
      const continueInfo = !continueOnFailure ? `<span class="continue-info">${this.getIconHtml('warning')}<span>${window.i18n.t('testExecution.stopOnFailure')}</span></span>` : '';

      const descriptionHtml = plan.description ? `<div style="font-size: 12px; color: var(--text-secondary); margin-left: 1px;">${this.escapeHtml(plan.description)}</div>` : '';

      item.innerHTML = `
        ${this.getIconHtml('assignment')}
        <div class="test-plan-content">
          <div class="test-plan-header">
            <div style="font-weight: 500;">${this.escapeHtml(plan.name)}</div>
          </div>
          ${descriptionHtml}
          <div class="test-plan-meta">
            <span class="meta-item">${this.getIconHtml('description')}<span>${fileInfo}</span></span>
            <span class="meta-item">${this.getIconHtml('category')}<span>${typeInfo}</span></span>
          </div>
          <div class="test-plan-meta">
            <span class="loop-info">${this.getIconHtml('repeat')}<span>${loopInfo}</span></span>
            ${continueInfo}
          </div>
        </div>
      `;
      item.addEventListener('click', () => onSelectPlan?.(plan));
      testPlanList.appendChild(item);
    });
  },

  selectTestPlanItem(planId) {
    const { testPlanList } = this.els;
    if (!testPlanList) return;
    testPlanList.querySelectorAll('.test-plan-item.selected').forEach(el => el.classList.remove('selected'));
    if (planId) {
      const target = testPlanList.querySelector(`.test-plan-item[data-plan-id="${CSS.escape(planId)}"]`);
      if (target) target.classList.add('selected');
    }
  },

  /**
   * 设置测试计划项的运行中状态（边框渐变动画）
   * @param {string|null} planName - 测试计划名称，null 表示清除运行状态
   * @param {boolean} isRunning - 是否正在运行
   */
  setTestPlanRunning(planName, isRunning) {
    const { testPlanList } = this.els;
    if (!testPlanList) return;
    testPlanList.querySelectorAll('.test-plan-item.running').forEach(el => el.classList.remove('running'));
    if (isRunning && planName) {
      const target = testPlanList.querySelector(`.test-plan-item[data-plan-name="${CSS.escape(planName)}"]`);
      if (target) target.classList.add('running');
    }
  },

  highlightTestPlanItems(planIds) {
    const { testPlanList } = this.els;
    if (!testPlanList) return;
    testPlanList.querySelectorAll('.test-plan-item.selected').forEach(el => el.classList.remove('selected'));
    if (planIds && planIds.length > 0) {
      planIds.forEach(id => {
        const target = testPlanList.querySelector(`.test-plan-item[data-plan-id="${CSS.escape(id)}"]`);
        if (target) target.classList.add('selected');
      });
    }
  },

  displayTestPlansPlaceholder(message) {
    const { testPlanList } = this.els;
    if (!testPlanList) return;
    testPlanList.innerHTML = `<div class="placeholder-message">${
      this.getIconHtml('info', 'vertical-align:middle;')
    }<span style="vertical-align:middle;">${message}</span></div>`;
  },

  updatePlanButtons(hasPlan, isRunning) {
    const { editPlanBtn, deletePlanBtn } = this.els;
    if (editPlanBtn) editPlanBtn.disabled = !hasPlan || isRunning;
    if (deletePlanBtn) deletePlanBtn.disabled = !hasPlan || isRunning;
  },

  // ─── 测试类型显示 ──────────────────────────────────────────────

  displayTestTypes(markers, placeholder, forceRender, onTypeChange, disabled = false, preselected = []) {
    const { testTypeSelector } = this.els;
    if (!testTypeSelector) return;

    // 如果有占位消息且非强制渲染
    if (placeholder && !forceRender) {
      testTypeSelector.innerHTML = '';
      const placeholderElement = document.createElement('div');
      placeholderElement.className = 'placeholder-message';
      placeholderElement.innerHTML = `${this.getIconHtml('info')}<span>${placeholder}</span>`;
      testTypeSelector.appendChild(placeholderElement);
      return;
    }

    if (!markers || markers.length === 0) {
      testTypeSelector.innerHTML = '';
      const placeholderElement = document.createElement('div');
      placeholderElement.className = 'placeholder-message';
      placeholderElement.innerHTML = `${this.getIconHtml('info')}<span>${window.i18n.t('testExecution.noMarkers') || '没有找到pytest标记，将执行所有测试'}</span>`;
      testTypeSelector.appendChild(placeholderElement);
      return;
    }

    // 去重
    const uniqueMarkers = [];
    const seenNames = new Set();
    markers.forEach(marker => {
      const markerName = typeof marker === 'string' ? marker : marker?.name;
      if (markerName && !seenNames.has(markerName)) {
        seenNames.add(markerName);
        uniqueMarkers.push(marker);
      }
    });

    testTypeSelector.innerHTML = '';
    const fragment = document.createDocumentFragment();
    uniqueMarkers.forEach(marker => {
      const markerName = typeof marker === 'string' ? marker : marker?.name;
      const markerDesc = typeof marker === 'string' ? marker : (marker?.description || marker?.name);
      if (!markerName) return;

      const label = document.createElement('label');
      label.className = 'checkbox-container' + (disabled ? ' disabled' : '');

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `${markerName}-tests`;
      checkbox.value = markerName;
      checkbox.checked = preselected.length > 0 ? preselected.includes(markerName) : true;
      if (disabled) checkbox.disabled = true;

      const checkmark = document.createElement('span');
      checkmark.className = 'checkmark';

      const text = document.createTextNode(markerDesc || markerName);

      label.appendChild(checkbox);
      label.appendChild(checkmark);
      label.appendChild(text);

      if (!disabled) {
        checkbox.addEventListener('change', () => onTypeChange?.());
      }

      fragment.appendChild(label);
    });
    testTypeSelector.appendChild(fragment);
  },

  getSelectedTestTypes() {
    const { testTypeSelector } = this.els;
    if (!testTypeSelector) return [];
    const checked = testTypeSelector.querySelectorAll('input[type="checkbox"]:checked');
    return Array.from(checked).map(cb => cb.value);
  },

  refreshTestTypes() {
    // 重新渲染当前测试类型（保留选中状态由 controller 管理）
    // 此方法由 controller 调用，controller 负责传入最新 markers 和选中状态
  },
};
