import { BaseModel } from '../../../core/BaseModel.js';
import { ApiBridge } from '../../../core/ApiBridge.js';
import { renderMarkdown as renderMarkdownHtml } from '../../../core/utils/markdown.js';

/** 更新下载结果状态 (权威词汇 #1: main 产出 state, renderer 只读不猜原取消/正则) */
export const UPDATE_DOWNLOAD_RESULT_STATE = Object.freeze({
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  NO_ACTIVE: 'no_active',
});

/**
 * UpdateModel - 版本/更新链路状态 (settings 拆分, R26 候选②)
 *
 * 更新链路是历史 bug 高发区 (双 toast / 取消幂等 / 进度小数 / SHA256 解析),
 * 独立成模型后测试面从"settings 整体"缩到本接口。
 * 状态: versionInfo / updateData / updatePendingFilePath / 进度监听解绑函数。
 */
export class UpdateModel extends BaseModel {
  #api = ApiBridge.bind({
    getVersionInfo: 'getVersionInfo',
    checkForUpdateRaw: 'checkForUpdateRaw',
    downloadUpdate: 'downloadUpdate',
    cancelUpdateDownload: 'cancelUpdateDownload', // R27: UI 取消进行中下载
    installUpdate: 'installUpdate',
  });

  // 取消旗 (作用域于当前下载): 取消时同步置位, 供 downloadUpdate catch 判定是否静默。
  // 取消/下载是两个独立 IPC, 下载错误可能先于取消 IPC 落地 → 仅靠 main 无法保证唯一权威,
  // 需渲染层同步信号协调 (等价旧 #cancelWindowUntil 防护, 但非时间窗、作用域明确)。
  #cancelling = false;

  constructor() {
    super({
      versionInfo: null,
      updateData: null,
      updatePendingFilePath: null,
      removeUpdateProgressListener: null,
    });
  }

  get versionInfo() {
    return this.get('versionInfo');
  }

  get updateData() {
    return this.get('updateData');
  }

  get updatePendingFilePath() {
    return this.get('updatePendingFilePath');
  }

  async loadVersionInfo() {
    try {
      const versionInfo = await this.#api.getVersionInfo();
      this.set('versionInfo', versionInfo, 'version-info-changed');
    } catch (error) {
      this.emitError('loadVersionInfo', error);
    }
  }

  async checkForUpdate() {
    try {
      const result = await this.#api.checkForUpdateRaw();
      if (result && result.success === false) {
        const err = new Error(result.error || 'Unknown IPC error');
        err.code = result.errorCode;
        err.statusCode = result.statusCode;
        throw err;
      }
      const data = result?.data || {};
      if (data.hasUpdate) {
        this.set(
          'updateData',
          {
            // R27: 显示保留 'v' 前缀 (latestVersionDisplay 带 v, 与 tag 一致);
            // latestVersion 仍可访问用于 semver 比较 (无 v)
            version: data.latestVersionDisplay || data.latestVersion,
            releaseNotes: data.releaseNotes,
            releaseName: data.releaseName,
            downloadUrl: data.downloadUrl,
            fileName: data.fileName,
            fileSize: data.fileSize,
            htmlUrl: data.htmlUrl,
            sha256: data.sha256, // R10: 透出 hash 供 UI 显示
            secure: data.secure !== false && !!data.sha256, // R10: 无 hash 标记不可安装
          },
          'update-available'
        );
      } else {
        this.emit('update-not-available', data);
      }
      return data;
    } catch (error) {
      this.emitError('checkUpdate', error, { code: error.code, statusCode: error.statusCode });
      return { success: false, error: error.message };
    }
  }

  async downloadUpdate() {
    try {
      this.#cancelling = false; // 新下载复位取消旗
      // 注册下载进度监听
      // R27 P3-7: 仅当为函数才调用 — 旧 preload 兼容可能存非函数真值 → 原调抛 TypeError
      if (typeof this.get('removeUpdateProgressListener') === 'function') {
        this.get('removeUpdateProgressListener')();
      }
      const removeListener = ApiBridge.api.onUpdateDownloadProgress((progress) => {
        this.emit('download-progress', progress);
      });
      this.set('removeUpdateProgressListener', removeListener);

      const updateData = this.get('updateData');
      if (!updateData) {
        this.emit('error', {
          source: 'downloadUpdate',
          message: 'noUpdateData',
        });
        return;
      }

      const downloadUrl = updateData.downloadUrl || updateData.url;
      const fileName = updateData.fileName || updateData.version || 'update';
      const result = await this.#api.downloadUpdate(downloadUrl, fileName);

      if (removeListener) removeListener();
      this.set('removeUpdateProgressListener', null);

      if (result && result.filePath) {
        this.set('updatePendingFilePath', result.filePath, 'update-downloaded');
      }
      // 取消下载 (state=cancelled) → 状态复位, UI 已由取消按钮关闭
      else if (result && result.state === UPDATE_DOWNLOAD_RESULT_STATE.CANCELLED) {
        this.emit('update-download-cancelled');
      }
      return result;
    } catch (error) {
      // 权威词汇 + 渲染层取消旗: 用户已取消 (取消旗置位, 下载错误可能已先落地) → 静默不报错;
      // 否则为真实失败 → 报错弹红 toast
      if (!this.#cancelling) {
        const remove = this.get('removeUpdateProgressListener');
        if (remove) {
          remove();
          this.set('removeUpdateProgressListener', null);
        }
        this.emitError('downloadUpdate', error);
      }
      return { success: false, error: error.message };
    }
  }

  /**
   * 取消进行中的更新下载 (abort 主进程下载 + 清临时文件)
   * 权威词汇: main 依 abort 产出 state='cancelled'; 渲染层同步置取消旗, 供 downloadUpdate catch 静默
   */
  async cancelDownload() {
    this.#cancelling = true; // 同步置位 (先于 IPC), 保证下载错误落到 catch 时已可识别为取消
    try {
      return await this.#api.cancelUpdateDownload();
    } catch (error) {
      // 取消失败静默 (取消为尽力而为, IPC 异常不打扰用户)
      return { success: false, error: error.message };
    }
  }

  async installUpdate(filePath) {
    try {
      const path = filePath || this.get('updatePendingFilePath');
      if (!path) {
        this.emit('error', {
          source: 'installUpdate',
          message: 'noUpdateFile',
        });
        return;
      }
      return await this.#api.installUpdate(path);
    } catch (error) {
      this.emitError('installUpdate', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 渲染 Release body 的 Markdown (GFM 子集) 为安全 HTML。
   * 实现在 core/utils/markdown.js: 零依赖、先转义后变换、链接白名单。
   * @param {string} text - 原始 markdown 文本
   * @returns {string} 可直接 innerHTML 的 HTML
   */
  static renderMarkdown(text) {
    return renderMarkdownHtml(text);
  }

  destroy() {
    const remove = this.get('removeUpdateProgressListener');
    if (remove) {
      remove();
      this.set('removeUpdateProgressListener', null);
    }
    super.destroy();
  }
}
