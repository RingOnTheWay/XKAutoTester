import { Toast } from './toast.js';

export class ProgressIndicator {
  constructor() {
    this.downloadProgressTimer = null;
    this.countdownUpdateTimer = null;
    this.totalFiles = 1;
    this.currentFileIndex = 1;
    this.type = 'download';

    this.init();
  }

  init() {
    const closeBtn = document.getElementById('download-progress-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hide());
    }
  }

  /** R27 P1-2: HTML 转义 — R25 XSS 修复 showError 引用本方法但类未定义, 失败时 TypeError 崩溃 */
  escapeHtml(str) {
    return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  show(message = window.i18n.t('environment.preparing'), type = 'download') {
    this.type = type;
    const progressContainer = document.getElementById('download-progress-container');
    if (progressContainer) {
      const progressBar = document.getElementById('download-progress-bar');
      if (progressBar) {
        progressBar.style.width = '0%';
      }

      const percentageElement = document.getElementById('download-percentage');
      if (percentageElement) {
        percentageElement.textContent = '0%';
      }

      const filenameElement = document.getElementById('download-filename');
      if (filenameElement) {
        filenameElement.textContent = message;
      }

      const fileCountElement = document.getElementById('download-file-count');
      if (fileCountElement) {
        if (this.totalFiles > 1) {
          fileCountElement.textContent = window.i18n.t('fileManager.fileCount', {
            current: this.currentFileIndex,
            total: this.totalFiles,
          });
        } else if (this.totalFiles === 1) {
          fileCountElement.textContent = '';
        } else {
          fileCountElement.textContent = window.i18n.t('fileManager.fileCountZero');
        }
      }

      this.clearError();

      const countdownElement = document.getElementById('download-countdown');
      if (countdownElement) {
        countdownElement.style.display = 'none';
      }

      if (this.downloadProgressTimer) {
        clearTimeout(this.downloadProgressTimer);
        this.downloadProgressTimer = null;
      }
      if (this.countdownUpdateTimer) {
        clearInterval(this.countdownUpdateTimer);
        this.countdownUpdateTimer = null;
      }

      progressContainer.classList.remove('hidden');

      const closeButton = document.getElementById('download-progress-close');
      if (closeButton) {
        closeButton.style.display = 'none';
      }
    }
  }

  hide() {
    // 立即停止 100% 倒计时 interval 与兜底 timeout，避免隐藏后定时器持续回调
    if (this.countdownUpdateTimer) {
      clearInterval(this.countdownUpdateTimer);
      this.countdownUpdateTimer = null;
    }
    if (this.downloadProgressTimer) {
      clearTimeout(this.downloadProgressTimer);
      this.downloadProgressTimer = null;
    }
    const progressContainer = document.getElementById('download-progress-container');
    if (progressContainer) {
      progressContainer.classList.add('hidden');
    }
    this.clearError();
  }

  update(progress) {
    this.show('', this.type);

    let overallPercentage = progress.percentage;
    if (this.totalFiles > 1) {
      const completedFiles = this.currentFileIndex - 1;
      const fileProgress = (completedFiles / this.totalFiles) * 100;
      const currentFileProgress = (progress.percentage / 100) * (100 / this.totalFiles);
      overallPercentage = Math.min(100, fileProgress + currentFileProgress);
    }

    const filenameElement = document.getElementById('download-filename');
    if (filenameElement) {
      if (progress.message) {
        filenameElement.textContent = progress.message;
      } else if (overallPercentage === 100) {
        const completeMessages = {
          download: window.i18n.t('fileManager.downloadComplete'),
          install: window.i18n.t('fileManager.installComplete'),
          upload: window.i18n.t('fileManager.uploadComplete'),
        };
        filenameElement.textContent = completeMessages[this.type] || window.i18n.t('common.done');
      } else {
        const progressMessages = {
          download: window.i18n.t('fileManager.downloadProgress'),
          install: window.i18n.t('fileManager.installProgress'),
          upload: window.i18n.t('fileManager.uploadProgress'),
        };
        filenameElement.textContent = progressMessages[this.type] || window.i18n.t('fileManager.inProgress');
      }
    }

    const progressBar = document.getElementById('download-progress-bar');
    if (progressBar) {
      progressBar.style.width = `${overallPercentage}%`;
    }

    const percentageElement = document.getElementById('download-percentage');
    if (percentageElement) {
      percentageElement.textContent = `${Math.round(overallPercentage)}%`;
    }

    const fileCountElement = document.getElementById('download-file-count');
    if (fileCountElement) {
      if (progress.fileSize) {
        fileCountElement.textContent = window.i18n.t('fileManager.sizeLabel', {
          size: progress.fileSize,
        });
      } else if (this.totalFiles > 1) {
        fileCountElement.textContent = window.i18n.t('fileManager.fileCount', {
          current: this.currentFileIndex,
          total: this.totalFiles,
        });
      } else {
        const transferred = progress.transferred || 0;
        const totalSize = progress.totalSize || 1;
        fileCountElement.textContent = window.i18n.t('fileManager.fileCount', {
          current: transferred,
          total: totalSize,
        });
      }
    }

    const countdownElement = document.getElementById('download-countdown');
    const closeButton = document.getElementById('download-progress-close');

    if (progress.error) {
      this.showError(progress.error);
      if (countdownElement) {
        countdownElement.style.display = 'none';
      }
      if (closeButton) {
        closeButton.style.display = 'flex';
      }
    } else if (overallPercentage === 100) {
      if (countdownElement) {
        countdownElement.style.display = 'inline';
      }
      if (closeButton) {
        closeButton.style.display = 'flex';
      }

      if (this.downloadProgressTimer) {
        clearTimeout(this.downloadProgressTimer);
      }
      if (this.countdownUpdateTimer) {
        clearInterval(this.countdownUpdateTimer);
      }

      let countdownSeconds = 5;

      const updateCountdown = () => {
        if (countdownElement) {
          countdownElement.textContent = window.i18n.t('fileManager.autoCloseCountdown', { seconds: countdownSeconds });
        }

        if (countdownSeconds <= 0) {
          this.hide();
          if (this.countdownUpdateTimer) {
            clearInterval(this.countdownUpdateTimer);
            this.countdownUpdateTimer = null;
          }
          this.downloadProgressTimer = null;
        } else {
          countdownSeconds--;
        }
      };

      updateCountdown();

      this.countdownUpdateTimer = setInterval(updateCountdown, 1000);

      this.downloadProgressTimer = setTimeout(() => {
        this.hide();
        if (this.countdownUpdateTimer) {
          clearInterval(this.countdownUpdateTimer);
          this.countdownUpdateTimer = null;
        }
        this.downloadProgressTimer = null;
      }, 5000);
    } else {
      if (countdownElement) {
        countdownElement.style.display = 'none';
      }
      if (closeButton) {
        closeButton.style.display = 'none';
      }
    }
  }

  showError(errorMessage) {
    const errorContainer = document.getElementById('download-error');
    const errorMessageElement = document.getElementById('download-error-message');
    const errorTooltipElement = document.getElementById('download-error-tooltip');
    const filenameElement = document.getElementById('download-filename');
    const errorTitleElement = errorContainer?.querySelector('.error-title');

    if (errorContainer && errorMessageElement && errorTooltipElement) {
      if (filenameElement) {
        const failMessages = {
          download: window.i18n.t('fileManager.downloadFailed'),
          install: window.i18n.t('fileManager.installFailed'),
          upload: window.i18n.t('fileManager.uploadFailed'),
        };
        filenameElement.textContent = failMessages[this.type] || window.i18n.t('fileManager.operationFailed');
      }

      if (errorTitleElement) {
        const failTitleMessages = {
          download: window.i18n.t('fileManager.downloadFailed'),
          install: window.i18n.t('fileManager.installFailed'),
          upload: window.i18n.t('fileManager.uploadFailed'),
        };
        errorTitleElement.textContent = failTitleMessages[this.type] || window.i18n.t('fileManager.uploadFailed');
      }

      let filteredError = errorMessage;
      if (filteredError.includes('pull: building fle list')) {
        filteredError = filteredError.replace(/pull: building fle list[.\s]*/g, '');
      }

      errorTooltipElement.textContent = filteredError;

      let simpleError = window.i18n.t('fileManager.adbCommandFailed');
      const errorLines = filteredError.split('\n');

      let foundDetailedError = false;
      for (const line of errorLines) {
        if (line.includes('详细错误:')) {
          simpleError = line.replace('详细错误:', '').trim();
          foundDetailedError = true;
          break;
        }
      }

      if (!foundDetailedError) {
        for (const line of errorLines) {
          if (line.includes('执行的ADB命令:')) {
            simpleError = window.i18n.t('fileManager.adbCommandFailed');
            break;
          }
        }
      }

      // P2-1 XSS 修复: 先转义 HTML 再替换换行 (错误文本含用户可控内容, 此前直插 innerHTML)
      const formattedError = this.escapeHtml(simpleError).replace(/\n/g, '<br>');
      errorMessageElement.innerHTML = formattedError;
      errorContainer.classList.remove('hidden');

      const toastMessages = {
        download: window.i18n.t('fileManager.downloadFailed'),
        install: window.i18n.t('fileManager.installFailed'),
        upload: window.i18n.t('fileManager.uploadFailed'),
      };
      let toastMessage = toastMessages[this.type] || window.i18n.t('fileManager.uploadFailed');

      if (errorMessage.includes('创建zip文件失败')) {
        toastMessage = window.i18n.t('fileManager.zipCreationFailed');
      } else if (errorMessage.includes('执行的ADB命令:')) {
        toastMessage = window.i18n.t('fileManager.adbCommandFailed');
      }

      Toast.error(toastMessage);
    }
  }

  clearError() {
    const errorContainer = document.getElementById('download-error');
    const errorMessageElement = document.getElementById('download-error-message');
    const errorTooltipElement = document.getElementById('download-error-tooltip');

    if (errorContainer && errorMessageElement && errorTooltipElement) {
      errorMessageElement.textContent = '';
      errorTooltipElement.textContent = '';
      errorContainer.classList.add('hidden');
    }
  }

  setTotalFiles(total) {
    this.totalFiles = total;
  }

  setCurrentFileIndex(index) {
    this.currentFileIndex = index;
  }
}
