/**
 * CanvasMixin - InspectorModal screenshot canvas drawing & resize handling.
 *
 * Extracted from inspector.js via Object.assign prototype composition.
 * NOTE: original private fields (#xxx) were converted to public (_xxx) so
 * mixin methods (defined outside the class body) can access them.
 */
import { Toast } from '../toast.js';

export const CanvasMixin = {
  renderScreenshot(base64Data) {
    const img = new Image();
    img.onload = () => {
      this._screenshotImage = img;
      this._updateCanvasAndHighlighter();

      this._deviceResolution = {
        width: img.naturalWidth,
        height: img.naturalHeight,
      };
      this.setupCanvasListeners();
    };
    img.onerror = () => {
      Toast.error(window.i18n.t('inspector.screenshotFailed') || 'Failed to load screenshot');
    };
    img.src = base64Data.startsWith('data:') ? base64Data : 'data:image/png;base64,' + base64Data;
  },

  _updateCanvasAndHighlighter() {
    if (!this._screenshotImage || !this._canvasContainer || !this._canvas) return;

    const img = this._screenshotImage;
    const padding = 12;
    const containerWidth = this._canvasContainer.clientWidth;
    const containerHeight = this._canvasContainer.clientHeight;
    const contentWidth = containerWidth - padding * 2;
    const contentHeight = containerHeight - padding * 2;

    if (contentWidth <= 0 || contentHeight <= 0) return;

    const scaleByWidth = contentWidth / img.naturalWidth;
    const scaleByHeight = contentHeight / img.naturalHeight;
    const scale = Math.min(scaleByWidth, scaleByHeight);

    const displayWidth = Math.floor(img.naturalWidth * scale);
    const displayHeight = Math.floor(img.naturalHeight * scale);

    // Center position within the container
    const offsetX = Math.floor((containerWidth - displayWidth) / 2);

    this._canvasScale = scale;
    this._canvas.width = displayWidth;
    this._canvas.height = displayHeight;
    this._canvas.style.width = displayWidth + 'px';
    this._canvas.style.height = displayHeight + 'px';
    this._canvas.style.left = offsetX + 'px';
    // 垂直贴顶 (P2: 之前垂直居中, 选中元素后面板展开时 canvasContainer 变矮,
    // 居中收缩导致预览"顶部下移", 失去"被面板挤压上移"的效果; 改为贴顶后容器变矮
    // 时预览贴 header 下方, 与"挤压上移"视觉一致)
    this._canvas.style.top = padding + 'px';

    this._scaleRatio = img.naturalWidth / displayWidth;

    if (this._highlighterContainer) {
      this._highlighterContainer.style.width = displayWidth + 'px';
      this._highlighterContainer.style.height = displayHeight + 'px';
      this._highlighterContainer.style.left = offsetX + 'px';
      this._highlighterContainer.style.top = padding + 'px';
    }

    this.redrawCanvas();
    this.renderHighlighterRects();
  },

  setupCanvasListeners() {
    // Canvas only displays screenshot; interaction handled by highlighter overlay divs
  },

  removeCanvasListeners() {
    // No-op: canvas no longer has mouse listeners
  },

  _initResizeObserver() {
    // R27: 幂等重建 — close() 会 _destroyResizeObserver() 断开, 第二次 open() 若不复建则
    // canvasContainer 高度变化 (选中元素 → 底部 locator 面板增高) 不再触发 canvas 重算,
    // 旧大图保持 → 视觉上"预览被底部面板遮挡/失效" (仅首次进入正常)
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (!this._canvasContainer) return;
    this._resizeObserver = new ResizeObserver(() => {
      this._updateCanvasAndHighlighter();
    });
    this._resizeObserver.observe(this._canvasContainer);
  },

  _destroyResizeObserver() {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
  },

  redrawCanvas() {
    if (!this._screenshotImage || !this._canvas) return;

    const ctx = this._canvas.getContext('2d');
    ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    ctx.drawImage(this._screenshotImage, 0, 0, this._canvas.width, this._canvas.height);
    // Highlight drawing is now handled by overlay divs
  },
};
