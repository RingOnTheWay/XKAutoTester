/**
 * Version Update Mixin - 版本信息与更新弹窗相关方法
 *
 * 从 SettingsView 提取，通过 Object.assign 绑定到原型。
 */

import { SettingsModel } from '../model.js';

export const versionUpdateMixin = {
  // ─── Version Info ──────────────────────────────────────────────

  renderVersionInfo(versionInfo) {
    if (!versionInfo) return;
    if (this.els.appVersionInfo) {
      const version = versionInfo.fullVersion || versionInfo.version || '-';
      this.els.appVersionInfo.textContent = `v${version}`;
    }
  },

  // ─── Update Modal ──────────────────────────────────────────────

  showUpdateModal(updateData) {
    if (!updateData) return;

    if (this.els.updateCurrentVersion) {
      const currentVersion = this.els.appVersionInfo?.textContent || '';
      this.els.updateCurrentVersion.textContent = currentVersion;
    }

    if (this.els.updateNewVersion) {
      this.els.updateNewVersion.textContent = updateData.version || '';
    }

    if (this.els.updateChangelog) {
      const changelog = updateData.changelog || updateData.releaseNotes || '';
      this.els.updateChangelog.innerHTML = SettingsModel.renderMarkdown(changelog);
    }

    // 重置进度
    if (this.els.updateProgressContainer) {
      this.els.updateProgressContainer.classList.add('hidden');
    }
    if (this.els.updateProgressFill) {
      this.els.updateProgressFill.style.width = '0%';
    }
    if (this.els.updateProgressText) {
      this.els.updateProgressText.textContent = '';
    }
    if (this.els.updateProgressSpeed) {
      this.els.updateProgressSpeed.textContent = '';
    }

    // 重置下载按钮
    if (this.els.updateDownloadBtn) {
      this.els.updateDownloadBtn.textContent = window.i18n.t('settings.downloadUpdate');
      this.els.updateDownloadBtn.disabled = false;
    }

    if (this.els.updateModalOverlay) {
      this.els.updateModalOverlay.classList.remove('hidden');
    }
  },

  hideUpdateModal() {
    if (this.els.updateModalOverlay) {
      this.els.updateModalOverlay.classList.add('hidden');
    }
  },

  updateDownloadProgress(progress) {
    if (!progress) return;

    if (this.els.updateProgressContainer) {
      this.els.updateProgressContainer.classList.remove('hidden');
    }

    const percent = progress.percent || 0;
    if (this.els.updateProgressFill) {
      this.els.updateProgressFill.style.width = `${percent}%`;
    }
    if (this.els.updateProgressText) {
      this.els.updateProgressText.textContent = `${percent.toFixed(1)}%`;
    }
    if (this.els.updateProgressSpeed) {
      this.els.updateProgressSpeed.textContent = SettingsModel.formatDownloadSpeed(progress.bytesPerSecond);
    }
  },

  updateDownloadButton(state) {
    if (!this.els.updateDownloadBtn) return;
    switch (state) {
      case 'downloaded':
        this.els.updateDownloadBtn.textContent = window.i18n.t('settings.installUpdate');
        this.els.updateDownloadBtn.disabled = false;
        break;
      case 'downloading':
        this.els.updateDownloadBtn.textContent = window.i18n.t('settings.downloading');
        this.els.updateDownloadBtn.disabled = true;
        break;
      default:
        this.els.updateDownloadBtn.textContent = window.i18n.t('settings.downloadUpdate');
        this.els.updateDownloadBtn.disabled = false;
    }
  },
};
