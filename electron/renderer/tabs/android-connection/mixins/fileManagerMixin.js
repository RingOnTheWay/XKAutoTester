// File Manager Mixin for AndroidConnectionView
// Extracted from view.js during refactor
// Provides: file list rendering, path breadcrumbs + ellipsis, context menu, selection, file size formatting
// Note: class-private methods (#formatFileSize, #checkAndApplyEllipsis) converted to public to enable
// prototype composition via Object.assign. Call sites updated accordingly.

export const fileManagerMixin = {
  // ─── 文件管理器显示 ────────────────────────────────────────────

  showFileListLoading() {
    const { fileList } = this.els;
    if (fileList) {
      fileList.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;"><div style="display:flex;align-items:center;justify-content:center;gap:8px;">'
        + this.getIconHtml('sync', 'vertical-align:middle;')
        + `<span style="vertical-align:middle;">${window.i18n.t('fileManager.loadingFiles')}</span></div></td></tr>`;
    }
  },

  displayFileError(message) {
    const { fileList } = this.els;
    if (fileList) {
      fileList.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;"><div style="display:flex;align-items:center;justify-content:center;gap:8px;">'
        + this.getIconHtml('error', 'vertical-align:middle;color:var(--error);')
        + `<span style="vertical-align:middle;color:var(--error);">${message}</span></div></td></tr>`;
    }
  },

  displayFileList(files, selectedFiles, onFileClick, onCheckboxChange, onActionsBtnClick) {
    const { fileList } = this.els;
    if (!fileList) return;

    fileList.innerHTML = '';

    // 空目录
    if (!files || files.length === 0) {
      fileList.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:20px;"><div style="display:flex;align-items:center;justify-content:center;gap:8px;">'
        + this.getIconHtml('folder_open', 'vertical-align:middle;')
        + `<span style="vertical-align:middle;">${window.i18n.t('fileManager.emptyDirectory')}</span></div></td></tr>`;
      return;
    }

    files.forEach(file => {
      if (file.name === '.' || file.name === '..') return;

      const isSelected = selectedFiles?.some(f => f.path === file.path);
      const sizeDisplay = file.isDirectory ? '' : this.formatFileSize(file.size);

      const row = document.createElement('tr');
      row.className = 'file-item';
      row.setAttribute('data-path', file.path);
      row.setAttribute('data-is-directory', file.isDirectory);

      row.innerHTML = `
        <td><input type="checkbox" class="file-checkbox" ${isSelected ? 'checked' : ''} data-path="${file.path}"></td>
        <td>
          <div class="file-item-name ${file.isDirectory ? 'directory' : 'file'}">
            ${this.getIconHtml(file.isDirectory ? 'folder' : 'description')}
            <span>${file.name}</span>
          </div>
        </td>
        <td class="file-size">${sizeDisplay}</td>
        <td class="file-date">${file.modifiedTime || ''}</td>
        <td class="file-date">${file.createdAt || ''}</td>
        <td class="file-actions">
          <button class="file-actions-btn" data-path="${file.path}">
            ${this.getIconHtml('more_vert')}
          </button>
        </td>
      `;

      // 文件名点击
      const nameEl = row.querySelector('.file-item-name');
      nameEl?.addEventListener('click', () => onFileClick?.(file));

      // 复选框
      const checkbox = row.querySelector('.file-checkbox');
      checkbox?.addEventListener('change', (e) => onCheckboxChange?.(file, e.target.checked));

      // 操作按钮
      const actionsBtn = row.querySelector('.file-actions-btn');
      actionsBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        onActionsBtnClick?.(file, actionsBtn);
      });

      // 行点击
      row.addEventListener('click', (e) => {
        if (e.target.closest('.file-actions-btn') || e.target.closest('.file-checkbox')) return;
        if (file.isDirectory) onFileClick?.(file);
      });

      fileList.appendChild(row);
    });
  },

  updatePathDisplay(pathSegments, onSegmentClick, onEllipsisClick) {
    const { pathDisplay } = this.els;
    if (!pathDisplay) return;

    pathDisplay.innerHTML = '';

    const container = document.createElement('div');
    container.className = 'path-segments';
    pathDisplay.appendChild(container);

    // 先渲染所有片段
    this.renderPathSegments(container, pathSegments, 0, pathSegments.length, onSegmentClick);

    // 延迟检查溢出
    setTimeout(() => {
      this.checkAndApplyEllipsis(pathDisplay, container, pathSegments, onSegmentClick, onEllipsisClick);
    }, 0);
  },

  renderPathSegments(container, segments, startIndex, endIndex, onClick) {
    const fragment = document.createDocumentFragment();
    for (let i = startIndex; i < endIndex; i++) {
      const seg = segments[i];
      if (i > startIndex) {
        const sep = document.createElement('span');
        sep.className = 'path-separator';
        sep.textContent = '/';
        fragment.appendChild(sep);
      }
      const el = document.createElement('span');
      el.className = `path-segment ${i === endIndex - 1 ? 'active' : ''}`;
      el.textContent = seg.displayName;
      el.setAttribute('data-path', seg.path);
      el.addEventListener('click', () => onClick?.(seg.path));
      fragment.appendChild(el);
    }
    container.appendChild(fragment);
  },

  renderEllipsis(container, hiddenSegments, onClick) {
    const el = document.createElement('span');
    el.className = 'path-ellipsis';
    el.textContent = '...';
    el.title = window.i18n.t('fileManager.clickToViewMorePath');
    el.style.cssText = 'cursor:pointer;font-size:16px;margin:0 4px;color:var(--primary);display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;';

    container.appendChild(el);

    // 渲染省略项到下拉菜单
    const dropdown = this.els.ellipsisDropdown;
    if (dropdown) {
      dropdown.innerHTML = '';
      hiddenSegments.forEach(seg => {
        const item = document.createElement('div');
        item.className = 'ellipsis-item';
        item.innerHTML = `${this.getIconHtml('folder')}<span>${seg.displayName}</span>`;
        item.addEventListener('click', () => {
          onClick?.(seg.path);
          dropdown.classList.remove('show');
        });
        dropdown.appendChild(item);
      });
    }

    el.id = 'unique-ellipsis';
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (dropdown) {
        dropdown.classList.toggle('show');
        this.positionEllipsisDropdown(el, dropdown);
      }
    });
  },

  positionEllipsisDropdown(ellipsisElement, dropdown) {
    const rect = ellipsisElement.getBoundingClientRect();
    dropdown.style.left = `${rect.left}px`;
    dropdown.style.top = `${rect.bottom + 5}px`;
    dropdown.style.position = 'fixed';
  },

  updateBackButtonState(isRoot) {
    const { backBtn } = this.els;
    if (backBtn) {
      backBtn.disabled = isRoot;
      backBtn.classList.toggle('disabled', isRoot);
    }
  },

  updateActionButtonsState(hasSelection) {
    const { deleteBtn, downloadBtn } = this.els;
    if (deleteBtn) {
      deleteBtn.disabled = !hasSelection;
      deleteBtn.classList.toggle('disabled', !hasSelection);
    }
    if (downloadBtn) {
      downloadBtn.disabled = !hasSelection;
      downloadBtn.classList.toggle('disabled', !hasSelection);
    }
  },

  updateSelectAllCheckbox(totalFiles, selectedCount) {
    const { selectAll } = this.els;
    if (!selectAll) return;
    selectAll.checked = totalFiles > 0 && selectedCount === totalFiles;
    selectAll.indeterminate = selectedCount > 0 && selectedCount < totalFiles;
  },

  showContextMenu(x, y, file, triggerElement = null) {
    const { contextMenu } = this.els;
    if (!contextMenu) return;

    // 锁定滚动
    const fileListContainer = document.querySelector('.file-list-container');
    fileListContainer?.classList.add('scroll-locked');

    contextMenu.classList.remove('hidden');
    contextMenu.offsetHeight; // 强制重排

    const menuWidth = contextMenu.offsetWidth || 140;
    const menuHeight = contextMenu.offsetHeight || 120;
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const hPad = 20;
    const vPad = 20;
    const bottomSafe = 50;

    let posX, posY;

    if (triggerElement) {
      const rect = triggerElement.getBoundingClientRect();
      const spaceBelow = windowHeight - rect.bottom - vPad;
      const spaceAbove = rect.top - vPad;

      if (spaceBelow < menuHeight + bottomSafe && spaceAbove > menuHeight) {
        posY = rect.top - menuHeight - 4;
      } else {
        posY = rect.bottom + 4;
        if (spaceBelow < menuHeight && spaceAbove >= menuHeight) {
          posY = rect.top - menuHeight - 4;
        }
      }

      posX = rect.left - 45;
      if (posX + menuWidth > windowWidth - hPad) posX = windowWidth - menuWidth - hPad;
      if (posX < hPad) posX = hPad;
      if (posY < vPad) posY = vPad;
      if (posY + menuHeight > windowHeight - vPad) posY = windowHeight - menuHeight - vPad;
    } else {
      posX = x;
      posY = y;
      if (posX + menuWidth > windowWidth - hPad) posX = windowWidth - menuWidth - hPad;
      if (posX < hPad) posX = hPad;
      if (posY + menuHeight > windowHeight - vPad) posY = windowHeight - menuHeight - vPad;
      if (posY < vPad) posY = vPad;
    }

    contextMenu.style.left = `${posX}px`;
    contextMenu.style.top = `${posY}px`;
  },

  hideContextMenu() {
    const { contextMenu } = this.els;
    if (contextMenu) contextMenu.classList.add('hidden');
    const fileListContainer = document.querySelector('.file-list-container');
    fileListContainer?.classList.remove('scroll-locked');
  },

  toggleFileSelection(file, isSelected) {
    const row = document.querySelector(`.file-item[data-path="${file.path}"]`);
    if (row) {
      row.classList.toggle('selected', isSelected);
    }
  },

  // ─── 私有方法 ──────────────────────────────────────────────────

  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  },

  checkAndApplyEllipsis(pathDisplay, segmentsContainer, allSegments, onSegmentClick, onEllipsisClick) {
    // 移除旧省略号
    const existingEllipsis = segmentsContainer.querySelector('.path-ellipsis');
    if (existingEllipsis) existingEllipsis.remove();

    // 重新渲染
    segmentsContainer.innerHTML = '';

    const containerWidth = pathDisplay.clientWidth;

    // 测量文本宽度
    const temp = document.createElement('span');
    temp.style.cssText = 'visibility:hidden;position:absolute;white-space:nowrap;font-size:14px;';
    document.body.appendChild(temp);

    let totalWidth = 0;
    const segWidths = [];

    allSegments.forEach((seg, idx) => {
      let w = 0;
      if (idx > 0) {
        temp.textContent = '/';
        w += temp.clientWidth + 8;
      }
      temp.textContent = seg.displayName;
      w += temp.clientWidth + 12;
      segWidths.push(w);
      totalWidth += w;
    });

    // 不溢出 -> 全部显示
    if (totalWidth <= containerWidth) {
      this.renderPathSegments(segmentsContainer, allSegments, 0, allSegments.length, onSegmentClick);
      document.body.removeChild(temp);
      return;
    }

    // 计算省略号宽度
    temp.textContent = '...';
    temp.style.fontSize = '16px';
    temp.style.padding = '0 4px';
    const ellipsisWidth = temp.clientWidth + 8;
    document.body.removeChild(temp);

    // 从末尾向前累加
    let visibleWidth = 0;
    let startIdx = allSegments.length - 1;
    visibleWidth += segWidths[startIdx];
    startIdx--;

    while (startIdx >= 0) {
      const newWidth = visibleWidth + segWidths[startIdx];
      if (newWidth + ellipsisWidth <= containerWidth) {
        visibleWidth = newWidth;
        startIdx--;
      } else {
        break;
      }
    }

    const hiddenSegments = allSegments.slice(0, startIdx + 1);
    this.renderEllipsis(segmentsContainer, hiddenSegments, onEllipsisClick);
    this.renderPathSegments(segmentsContainer, allSegments, startIdx + 1, allSegments.length, onSegmentClick);
  },
};
