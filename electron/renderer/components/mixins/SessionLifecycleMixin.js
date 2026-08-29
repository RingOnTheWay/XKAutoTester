/**
 * SessionLifecycleMixin - InspectorModal session lifecycle & init logic.
 *
 * Extracted from inspector.js via Object.assign prototype composition.
 * NOTE: original private fields (#xxx) were converted to public (_xxx) so
 * mixin methods (defined outside the class body) can access them.
 */
import { Toast } from '../toast.js';

export const SessionLifecycleMixin = {
  init() {
    this._overlay = document.getElementById('inspector-modal-overlay');
    if (!this._overlay) return;

    this._canvas = document.getElementById('inspector-canvas');
    this._highlighterContainer = document.getElementById('inspector-highlighter-container');
    this._canvasContainer = document.getElementById('inspector-canvas-container');
    this._treeContainer = document.getElementById('inspector-tree-container');
    this._treeSearch = document.getElementById('inspector-tree-search');
    this._loadingEl = document.getElementById('inspector-loading');
    this._locatorList = document.getElementById('inspector-locator-list');
    this._refreshBtn = document.getElementById('inspector-refresh-btn');
    this._confirmBtn = document.getElementById('inspector-confirm-btn');
    this._cancelBtn = document.getElementById('inspector-cancel-btn');
    this._closeBtn = document.getElementById('inspector-modal-close-btn');

    this.bindEvents();
    this._initResizeObserver();
  },

  bindEvents() {
    if (this._closeBtn) {
      this._closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.close();
      });
    }

    if (this._cancelBtn) {
      this._cancelBtn.addEventListener('click', () => this.close());
    }

    if (this._confirmBtn) {
      this._confirmBtn.addEventListener('click', () => this.confirmSelection());
    }

    if (this._refreshBtn) {
      this._refreshBtn.addEventListener('click', () => this.refreshView());
    }

    if (this._treeSearch) {
      this._treeSearch.addEventListener('input', (e) => {
        if (this._searchTimer) clearTimeout(this._searchTimer);
        this._searchTimer = setTimeout(() => {
          this.searchTree(e.target.value);
        }, 1000);
      });
    }

    const prevBtn = this._overlay?.querySelector('#inspector-search-prev-btn');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => this.navigateSearchResult(-1));
    }

    const nextBtn = this._overlay?.querySelector('#inspector-search-next-btn');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => this.navigateSearchResult(1));
    }

    this._bindHeaderDrag();
  },

  _bindHeaderDrag() {
    const header = this._overlay?.querySelector('.modal-header');
    if (!header) return;

    let isDragging = false;

    // P2-2: 保存 document 级监听引用, close() 时移除 — 原实现每次 init 累积监听
    this._headerDragHandlers = this._headerDragHandlers || {
      move: null,
      up: null,
    };

    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('button') || e.target.closest('.icon-button')) return;
      isDragging = true;
      window.electronAPI?.startWindowDrag(e.screenX, e.screenY);
      e.preventDefault();
    });

    const moveHandler = (e) => {
      if (!isDragging) return;
      window.electronAPI?.moveWindowDrag(e.screenX, e.screenY);
    };
    const upHandler = () => {
      if (isDragging) {
        isDragging = false;
        window.electronAPI?.endWindowDrag();
      }
    };
    document.addEventListener('mousemove', moveHandler);
    document.addEventListener('mouseup', upHandler);
    this._headerDragHandlers.move = moveHandler;
    this._headerDragHandlers.up = upHandler;
  },

  _removeHeaderDragListeners() {
    if (this._headerDragHandlers) {
      if (this._headerDragHandlers.move) {
        document.removeEventListener('mousemove', this._headerDragHandlers.move);
      }
      if (this._headerDragHandlers.up) {
        document.removeEventListener('mouseup', this._headerDragHandlers.up);
      }
      this._headerDragHandlers = { move: null, up: null };
    }
  },

  async open(deviceName, appPackage, appActivity, noReset = true) {
    if (!this._overlay) return;

    this.resetState();
    this._sessionParams = { deviceName, appPackage, appActivity, noReset };
    this._overlay.classList.remove('hidden');
    this._addEscListener();
    this.showLoading(true);
    this._subscribeProgress();

    try {
      // wrapper 已在 success=false 时抛错，无需再判断 result.success
      const result = await window.electronAPI.inspector.startSession(deviceName, appPackage, appActivity, '', noReset);
      if (result.warning) {
        Toast.warning(result.warning);
      }
      this._advanceLoadingStep(3);
      await this.refreshView({
        showSteps: true,
        preserveSteps: true,
        hideLoading: false,
      });
      await this._waitForStepQueue();
      await new Promise((resolve) => setTimeout(resolve, 400));
    } catch (err) {
      Toast.error(err.message || window.i18n.t('inspector.startFailed') || 'Failed to start inspector');
      this.close();
    } finally {
      this._unsubscribeProgress();
      this.showLoading(false);
    }
  },

  close() {
    if (!this._overlay) return;

    this._removeEscListener();
    this._unsubscribeProgress();
    this._destroyResizeObserver();
    this._removeHighlighterListeners();
    this._removeHeaderDragListeners(); // P2-2: 清理 document 拖拽监听
    this._overlay.classList.add('hidden');
    this.removeCanvasListeners();

    if (window.electronAPI?.inspector?.stopSession) {
      window.electronAPI.inspector.stopSession().catch(() => {});
    }

    this.resetState();
  },

  resetState() {
    this._screenshotImage = null;
    this._elementsTree = [];
    this._allElements = [];
    this._highlighterElements = [];
    this._selectedElement = null;
    this._hoveredElement = null;
    this._selectedLocator = null;
    this._canvasScale = 1;
    this._deviceResolution = null;
    this._scaleRatio = 1;

    if (this._treeContainer) this._treeContainer.innerHTML = '';
    if (this._locatorList) {
      this._locatorList.innerHTML = `<div class="inspector-locator-empty" data-i18n="inspector.noLocators">${window.i18n.t('inspector.noLocators')}</div>`;
    }
    const headerEl = this._overlay?.querySelector('#inspector-locator-header');
    if (headerEl) headerEl.style.display = 'none';
    if (this._canvas) {
      const ctx = this._canvas.getContext('2d');
      ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    }
    if (this._highlighterContainer) this._highlighterContainer.innerHTML = '';

    this._searchResults = [];
    this._searchResultIndex = -1;
    const countEl = this._overlay?.querySelector('#inspector-search-count');
    if (countEl) countEl.textContent = '0/0';
    const prevBtn = this._overlay?.querySelector('#inspector-search-prev-btn');
    if (prevBtn) prevBtn.disabled = true;
    const nextBtn = this._overlay?.querySelector('#inspector-search-next-btn');
    if (nextBtn) nextBtn.disabled = true;
    const hintEl = this._overlay?.querySelector('#inspector-search-hint');
    if (hintEl) hintEl.classList.add('hidden');
    if (this._confirmBtn) this._confirmBtn.disabled = true;
  },

  async refreshView(options = {}) {
    if (this._refreshing) return;
    this._refreshing = true;
    const { showSteps = false, preserveSteps = false, hideLoading = true } = options;
    this.showLoading(true, !preserveSteps, showSteps);
    try {
      // wrapper 已在 success=false 时抛错，用 try-catch 触发重启逻辑
      let result;
      try {
        result = await window.electronAPI.inspector.refreshSession();
      } catch (refreshErr) {
        if (!this._sessionParams) throw refreshErr;
        try {
          await window.electronAPI.inspector.stopSession();
        } catch (_) {}

        this._subscribeProgress();
        // startSession 失败时 wrapper 抛错，由外层 catch 接
        await window.electronAPI.inspector.startSession(
          this._sessionParams.deviceName,
          this._sessionParams.appPackage,
          this._sessionParams.appActivity,
          '',
          this._sessionParams.noReset
        );
        this._unsubscribeProgress();
        this._advanceLoadingStep(3);
        result = await window.electronAPI.inspector.refreshSession();
      }

      if (result.screenshot) {
        this.renderScreenshot(result.screenshot);
      }

      if (result.elements) {
        this._elementsTree = this.parsePageSource(result.elements);
        this._allElements = this.flattenElements(this._elementsTree);
        this.renderElementTree(this._elementsTree);
        this.renderHighlighterRects();
      }

      this._advanceLoadingStep(4);
    } catch (err) {
      Toast.error(err.message || window.i18n.t('inspector.refreshFailed') || 'Failed to refresh');
    } finally {
      this._refreshing = false;
      if (hideLoading) {
        this.showLoading(false);
      }
    }
  },

  _addEscListener() {
    this._escHandler = (e) => {
      if (e.key === 'Escape') {
        this.close();
      }
    };
    document.addEventListener('keydown', this._escHandler);
  },

  _removeEscListener() {
    if (this._escHandler) {
      document.removeEventListener('keydown', this._escHandler);
      this._escHandler = null;
    }
  },

  parsePageSource(pageSource) {
    if (!pageSource) return [];
    if (typeof pageSource === 'string') {
      try {
        pageSource = JSON.parse(pageSource);
      } catch (e) {
        return [];
      }
    }
    if (Array.isArray(pageSource)) return this.assignPaths(pageSource);
    if (pageSource.children) return this.assignPaths(pageSource.children);
    return [];
  },

  assignPaths(elements, parentPath = '') {
    if (!elements || !Array.isArray(elements)) return [];
    return elements.map((el, index) => {
      if (el.path === undefined || el.path === null) {
        el.path = parentPath ? `${parentPath}.${index}` : `${index}`;
      }
      if (el.children && el.children.length > 0) {
        el.children.forEach((child) => {
          child._parent = el;
        });
        this.assignPaths(el.children, el.path);
      }
      return el;
    });
  },

  flattenElements(elements) {
    if (!elements) return [];
    let result = [];
    elements.forEach((el) => {
      result.push(el);
      if (el.children && el.children.length > 0) {
        result = result.concat(this.flattenElements(el.children));
      }
    });
    return result;
  },
};
