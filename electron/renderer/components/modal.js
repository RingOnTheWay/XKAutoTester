export class Modal {
  constructor(options = {}) {
    this.id = options.id;
    this.onOpen = options.onOpen || null;
    this.onClose = options.onClose || null;
    this.overlay = null;
    this._escHandler = null;
    this.init();
  }

  init() {
    this.overlay = document.getElementById(this.id);
    if (!this.overlay) return;
    this.bindCloseEvents();
  }

  open() {
    if (!this.overlay) return;
    this.overlay.classList.remove('hidden');
    if (this.onOpen) this.onOpen();
    this._addEscListener();
  }

  close() {
    if (!this.overlay) return;
    this.overlay.classList.add('hidden');
    if (this.onClose) this.onClose();
    this._removeEscListener();
  }

  isOpen() {
    return this.overlay && !this.overlay.classList.contains('hidden');
  }

  setTitle(title) {
    const titleEl = this.overlay.querySelector('.modal-header h3');
    if (titleEl) {
      titleEl.textContent = title;
    }
  }

  bindCloseEvents() {
    // 兼容两种 close 按钮命名：.pp-modal-close 类（page-package modal）+ button[id$="-close-btn"]（其他 modal）
    const closeBtn = this.overlay.querySelector('.pp-modal-close, button[id$="-close-btn"]');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.close();
      });
    }
  }

  _addEscListener() {
    // M5 修复: 重复 open 时先移除旧 handler, 避免泄漏 + 多 handler 同时触发
    this._removeEscListener();
    this._escHandler = (e) => {
      if (e.key === 'Escape') {
        this.close();
      }
    };
    document.addEventListener('keydown', this._escHandler);
  }

  _removeEscListener() {
    if (this._escHandler) {
      document.removeEventListener('keydown', this._escHandler);
      this._escHandler = null;
    }
  }

  static closeAll() {
    document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m => {
      m.classList.add('hidden');
    });
  }
}
