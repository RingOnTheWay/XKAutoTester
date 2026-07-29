// directoryMixin for TestExecutionView
// Extracted from view.js during refactor
// Provides: 目录显示 + 测试文件渲染

export const directoryMixin = {
  // ─── 目录显示 ──────────────────────────────────────────────────

  updateSelectedDirectory(path, displayName) {
    const { selectedDirectory } = this.els;
    if (!selectedDirectory) return;
    if (path) {
      selectedDirectory.textContent = displayName || path;
      selectedDirectory.title = path;
      selectedDirectory.removeAttribute('data-i18n');
      // MVC: 颜色由 CSS .selected-path 统一管理 (var(--text-secondary)),与 test-case tab 一致
    } else {
      selectedDirectory.textContent = window.i18n.t('testExecution.noDirectorySelected');
      selectedDirectory.title = '';
    }
  },

  // 更新"选择测试目录"按钮的禁用状态（选中测试计划时禁用）
  updateSelectDirectoryButton(disabled) {
    const { selectDirectoryBtn } = this.els;
    if (!selectDirectoryBtn) return;
    // 运行中状态由 updateUIForRunning 单独控制，此处仅在非运行时生效
    selectDirectoryBtn.disabled = !!disabled;
  },

  renderTestFiles(files, selectedFiles) {
    const { testFileList } = this.els;
    if (!testFileList) return;
    testFileList.innerHTML = '';

    if (!files || files.length === 0) {
      testFileList.innerHTML = `<div class="placeholder-message">${
        this.getIconHtml('info', 'vertical-align:middle;')
      }<span style="vertical-align:middle;">${window.i18n.t('testExecution.noTestFilesInDir') || '当前目录下没有测试文件'}</span></div>`;
      return;
    }

    files.forEach(file => {
      const isChecked = selectedFiles?.includes(file) ? 'checked' : '';
      const item = document.createElement('div');
      item.className = 'test-file-item';
      item.innerHTML = `
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
          <input type="checkbox" value="${file}" ${isChecked}>
          <span>${file}</span>
        </label>
      `;
      testFileList.appendChild(item);
    });
  },
};
