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
    const closeBtn = this.overlay.querySelector('.modal-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.close();
      });
    }
  }

  _addEscListener() {
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
