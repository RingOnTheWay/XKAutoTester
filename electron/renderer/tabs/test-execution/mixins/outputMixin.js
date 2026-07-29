// outputMixin for TestExecutionView
// Extracted from view.js during refactor
// Provides: 测试执行 UI 状态 + 输出显示 + 通知

export const outputMixin = {
  // ─── 测试执行 UI ──────────────────────────────────────────────

  updateUIForRunning(isRunning) {
    const { runTestsBtn, stopTestsBtn, selectDirectoryBtn, newPlanBtn, editPlanBtn, deletePlanBtn } = this.els;

    if (runTestsBtn) runTestsBtn.disabled = isRunning;
    if (stopTestsBtn) stopTestsBtn.disabled = !isRunning;
    if (selectDirectoryBtn) selectDirectoryBtn.disabled = isRunning;
    if (newPlanBtn) newPlanBtn.disabled = isRunning;
    if (editPlanBtn) editPlanBtn.disabled = isRunning;
    if (deletePlanBtn) deletePlanBtn.disabled = isRunning;
  },

  updateRunButtonState(canRun, isRunning) {
    const { runTestsBtn } = this.els;
    if (!runTestsBtn) return;
    runTestsBtn.disabled = !canRun || isRunning;
  },

  updateViewReportButton(hasPlan) {
    const { viewReportBtn } = this.els;
    if (!viewReportBtn) return;
    viewReportBtn.disabled = !hasPlan;
  },

  updateProgress(status, percentage) {
    const { progressStatus, progressBar } = this.els;
    if (progressStatus) progressStatus.textContent = status;
    const percentageEl = document.getElementById('progress-percentage');
    if (percentageEl) percentageEl.textContent = percentage + '%';
    if (progressBar) {
      const fill = progressBar.querySelector('.progress-fill');
      if (fill) fill.style.width = percentage + '%';
    }
  },

  updateLoopProgress(current, total) {
    const { progressStatus } = this.els;
    if (progressStatus) {
      progressStatus.textContent = window.i18n.t('testExecution.loopProgress', { current, total })
        || `循环 ${current}/${total}`;
    }
  },

  appendOutputToDOM(text, isError = false) {
    const { testOutput } = this.els;
    if (!testOutput) return;

    // 移除欢迎消息
    const welcome = testOutput.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    // 清理所有非元素子节点（HTML 源码中的缩进/换行文本节点）
    const textNodes = Array.from(testOutput.childNodes).filter(n => n.nodeType === Node.TEXT_NODE);
    textNodes.forEach(n => n.remove());

    // 添加 has-content class
    testOutput.classList.add('has-content');
    // 按换行符拆分，每行创建一个 div
    const lines = text.split(/\r?\n/);
    for (const lineText of lines) {
      if (lineText.trim() === '') continue;
      const line = document.createElement('div');
      line.className = isError ? 'output-line error' : 'output-line';
      line.textContent = lineText;
      if (isError) line.style.color = 'var(--error)';
      testOutput.appendChild(line);
    }

    testOutput.scrollTop = testOutput.scrollHeight;
  },

  clearOutputDisplay() {
    const { testOutput } = this.els;
    if (!testOutput) return;
    testOutput.innerHTML = '';
    // MVC: has-content 类管理是 view 内部状态,由 view 自己维护
    testOutput.classList.remove('has-content');
    // 恢复欢迎消息（使用紧凑格式避免产生空白文本节点）
    const welcome = document.createElement('div');
    welcome.className = 'welcome-message';
    welcome.innerHTML = `<div class="welcome-text-container"><span class="welcome-text">${window.i18n.t('testExecution.welcome')}</span><span class="welcome-app-name">XKAutoTester</span></div><p>${window.i18n.t('testExecution.createTestPlan')}</p>`;
    testOutput.appendChild(welcome);
  },

  showError(message) {
    const { testOutput } = this.els;
    if (!testOutput) return;
    const welcome = testOutput.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    const line = document.createElement('div');
    line.className = 'output-line error';
    line.innerHTML = `${this.getIconHtml('error', 'vertical-align:middle;color:var(--error);margin-right:4px;')}<span style="vertical-align:middle;">${this.escapeHtml(message)}</span>`;
    testOutput.appendChild(line);
    testOutput.scrollTop = testOutput.scrollHeight;
  },

  showSuccess(message) {
    const { testOutput } = this.els;
    if (!testOutput) return;
    const welcome = testOutput.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    const line = document.createElement('div');
    line.className = 'output-line success';
    line.innerHTML = `${this.getIconHtml('check_circle', 'vertical-align:middle;color:var(--success);margin-right:4px;')}<span style="vertical-align:middle;">${this.escapeHtml(message)}</span>`;
    testOutput.appendChild(line);
    testOutput.scrollTop = testOutput.scrollHeight;
  },
};
