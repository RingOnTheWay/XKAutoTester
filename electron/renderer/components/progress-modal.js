import { Icons } from '../icons.js';
export class ProgressModal {
  constructor(options = {}) {
    this.options = options;
    this.overlay = null;
    this.container = null;
    this.statusElement = null;
    this.barElement = null;
    this.percentageElement = null;
    this.fileCountElement = null;
    this.closeBtn = null;
    this.headerIcon = null;
    this.headerTitle = null;
    this.errorContainer = null;
    this.errorMessageElement = null;
    this.isComplete = false;
    this.isError = false;
    this._escHandler = null;
    this._lastProgressTime = 0;
    this._pendingProgress = null;
    this._progressTimer = null;
    this._currentPercentage = 0;
    this._minProgressInterval = 80;
    this._destroyed = false;
  }

  show(title, options = {}) {
    this.isComplete = false;
    this.isError = false;
    this._destroyed = false;
    this._currentPercentage = 0;
    this._createDOM(title, options);
    this._attachEvents();
    document.body.appendChild(this.overlay);
    requestAnimationFrame(() => {
      this.overlay.classList.add('progress-modal-visible');
    });
  }

  updateProgress(data) {
    if (!this.overlay || this.isComplete || this.isError || this._destroyed) return;

    if (data.phase === 'error') {
      this._clearProgressTimer();
      this.showError(data.message);
      return;
    }

    this._pendingProgress = data;

    const now = Date.now();
    const elapsed = now - this._lastProgressTime;

    if (elapsed >= this._minProgressInterval) {
      this._applyProgress(data);
    } else if (!this._progressTimer) {
      this._progressTimer = setTimeout(() => {
        this._progressTimer = null;
        if (this._pendingProgress && !this.isComplete && !this.isError && !this._destroyed) {
          this._applyProgress(this._pendingProgress);
        }
      }, this._minProgressInterval - elapsed);
    }
  }

  _applyProgress(data) {
    this._lastProgressTime = Date.now();
    this._pendingProgress = null;

    const percentage = Math.min(100, Math.max(0, data.percentage || 0));
    this._currentPercentage = percentage;

    if (this.statusElement) {
      this.statusElement.textContent = data.message || '';
    }

    if (this.barElement) {
      this.barElement.style.width = `${percentage}%`;
    }

    if (this.percentageElement) {
      this.percentageElement.textContent = `${Math.round(percentage)}%`;
    }

    if (this.fileCountElement && data.total > 0) {
      this.fileCountElement.textContent = `${data.current || 0} / ${data.total}`;
    }
  }

  showComplete(message) {
    this._clearProgressTimer();
    this.isComplete = true;

    const targetPercentage = 100;
    const startPercentage = this._currentPercentage || 0;

    if (startPercentage < targetPercentage && this.barElement) {
      this.barElement.style.width = `${targetPercentage}%`;
    }

    const animDuration = Math.max(400, (targetPercentage - startPercentage) * 5);

    if (this.percentageElement) {
      this._animatePercentageText(startPercentage, targetPercentage, animDuration);
    }

    setTimeout(() => {
      if (this._destroyed) return;
      if (this.statusElement) {
        this.statusElement.textContent = message || window.i18n.t('common.done');
      }
      if (this.barElement) {
        this.barElement.classList.add('progress-modal-bar-complete');
      }
      if (this.closeBtn) {
        this.closeBtn.style.display = 'inline-flex';
      }
      if (this.fileCountElement) {
        this.fileCountElement.textContent = '';
      }
    }, animDuration + 100);
  }

  showError(message) {
    this._clearProgressTimer();
    this.isError = true;

    if (this.statusElement) {
      this.statusElement.textContent = window.i18n.t('common.error');
    }
    if (this.barElement) {
      this.barElement.classList.add('progress-modal-bar-error');
    }
    if (this.closeBtn) {
      this.closeBtn.style.display = 'inline-flex';
    }
    if (this.errorMessageElement) {
      this.errorMessageElement.textContent = message || '';
    }
    if (this.errorContainer) {
      this.errorContainer.classList.remove('hidden');
    }
  }

  hide() {
    if (this._destroyed) return;
    this._clearProgressTimer();
    if (this.overlay) {
      this.overlay.classList.remove('progress-modal-visible');
      setTimeout(() => {
        this.destroy();
      }, 300);
    }
  }

  destroy() {
    this._destroyed = true;
    this._clearProgressTimer();
    if (this._escHandler) {
      document.removeEventListener('keydown', this._escHandler);
      this._escHandler = null;
    }
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
    this.overlay = null;
    this.container = null;
    this.statusElement = null;
    this.barElement = null;
    this.percentageElement = null;
    this.fileCountElement = null;
    this.closeBtn = null;
    this.headerIcon = null;
    this.headerTitle = null;
    this.errorContainer = null;
    this.errorMessageElement = null;
  }

  _clearProgressTimer() {
    if (this._progressTimer) {
      clearTimeout(this._progressTimer);
      this._progressTimer = null;
    }
    this._pendingProgress = null;
  }

  _animatePercentageText(from, to, duration) {
    if (!this.percentageElement || this._destroyed) return;
    const startTime = Date.now();
    const step = () => {
      if (this._destroyed) return;
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / duration);
      const current = Math.round(from + (to - from) * progress);
      if (this.percentageElement) {
        this.percentageElement.textContent = `${current}%`;
      }
      if (progress < 1) {
        requestAnimationFrame(step);
      }
    };
    requestAnimationFrame(step);
  }

  _createDOM(title, options = {}) {
    const icon = options.icon || 'folder';

    this.overlay = document.createElement('div');
    this.overlay.className = 'progress-modal-overlay';

    this.container = document.createElement('div');
    this.container.className = 'progress-modal-container';

    const header = document.createElement('div');
    header.className = 'progress-modal-header';

    this.headerIcon = document.createElement('span');
    this.headerIcon.className = 'svg-icon';
    this.headerIcon.setAttribute('data-icon', icon);

    this.headerTitle = document.createElement('h3');
    this.headerTitle.textContent = title || '';

    header.appendChild(this.headerIcon);
    header.appendChild(this.headerTitle);

    const body = document.createElement('div');
    body.className = 'progress-modal-body';

    this.statusElement = document.createElement('div');
    this.statusElement.className = 'progress-modal-status';
    this.statusElement.textContent = options.initialMessage || '';

    const barContainer = document.createElement('div');
    barContainer.className = 'progress-modal-bar-container';

    this.barElement = document.createElement('div');
    this.barElement.className = 'progress-modal-bar';
    this.barElement.style.width = '0%';

    barContainer.appendChild(this.barElement);

    const infoRow = document.createElement('div');
    infoRow.className = 'progress-modal-info';

    this.percentageElement = document.createElement('span');
    this.percentageElement.className = 'progress-modal-percentage';
    this.percentageElement.textContent = '0%';

    this.fileCountElement = document.createElement('span');
    this.fileCountElement.className = 'progress-modal-file-count';

    infoRow.appendChild(this.percentageElement);
    infoRow.appendChild(this.fileCountElement);

    this.errorContainer = document.createElement('div');
    this.errorContainer.className = 'progress-modal-error hidden';
    this.errorMessageElement = document.createElement('div');
    this.errorMessageElement.className = 'progress-modal-error-message';
    this.errorContainer.appendChild(this.errorMessageElement);

    body.appendChild(this.statusElement);
    body.appendChild(barContainer);
    body.appendChild(infoRow);
    body.appendChild(this.errorContainer);

    const footer = document.createElement('div');
    footer.className = 'progress-modal-footer';

    this.closeBtn = document.createElement('button');
    this.closeBtn.className = 'material-button outlined small progress-modal-close-btn';
    this.closeBtn.textContent = window.i18n.t('common.close');
    this.closeBtn.style.display = 'none';
    this.closeBtn.addEventListener('click', () => this.hide());

    footer.appendChild(this.closeBtn);

    this.container.appendChild(header);
    this.container.appendChild(body);
    this.container.appendChild(footer);

    this.overlay.appendChild(this.container);

    if (Icons) {
      const iconName = this.headerIcon.getAttribute('data-icon');
      if (Icons[iconName]) {
        this.headerIcon.innerHTML = Icons[iconName];
      }
    }
  }

  _attachEvents() {
    this._escHandler = (e) => {
      if (e.key === 'Escape' && (this.isComplete || this.isError)) {
        this.hide();
      }
    };
    document.addEventListener('keydown', this._escHandler);
  }
}
