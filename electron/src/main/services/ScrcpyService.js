// ScrcpyService — scrcpy 投屏深模块。
//
// 藏 scrcpy 路径解析 (本地优先 + where 兜底) + 6 参数 args 构建 + 平台分支 +
// child process 生命周期 + crash 检测 (SCRCPY_CRASH_WINDOW_MS) + notifier 通知。
//
// 4 factory-or-default (processSpawner + pathResolver + logger + notifier) + buildScrcpyArgs 纯函数。
//
// 生产: new ScrcpyService(projectRoot, i18nService)  # 2 参
// 测试: new ScrcpyService(projectRoot, i18nService, { processSpawnerFactory, pathResolverFactory, loggerFactory, notifierFactory })
//
// 接口契约:
//   - notifierFactory (getMainWindow) → { notify(errorInfo) }
//   - startScrcpy 不再返回 process (消除句柄泄漏, service 内部管理生命周期)
//   - setMainWindow(mainWindow)

const path = require('path');
const { IPC_CHANNELS } = require('../../shared/constants');

/** scrcpy 启动后 2 秒内非 0 退出视为 crash */
const SCRCPY_CRASH_WINDOW_MS = 2000;

/** @typedef {Object} ScrcpyProcessSpawner
 * @property {(cmd: string, args: string[], opts: object) => object} spawn - 返 child process
 */
/** @typedef {Object} ScrcpyPathResolver
 * @property {() => string|null} findScrcpyPath - 返 scrcpy.exe 路径或 null
 */
/** @typedef {Object} ScrcpyLogger
 * @property {(msg: string) => void} error
 */
/** @typedef {Object} ScrcpyNotifier
 * @property {(errorInfo: object) => void} notify - 通知渲染进程 scrcpy 错误/crash
 */
/** @typedef {Object} ScrcpyServiceOptions
 * @property {() => ScrcpyProcessSpawner} [processSpawnerFactory]
 * @property {() => ScrcpyPathResolver} [pathResolverFactory]
 * @property {() => ScrcpyLogger} [loggerFactory]
 * @property {(getMainWindow: () => object|null) => ScrcpyNotifier} [notifierFactory]
 */

/**
 * 构建 scrcpy CLI args (纯函数, 对称 UpdateService compareVersions)
 * P1-2: 全部参数白名单校验 — 数值参数仅接受数字串, video_codec 仅枚举,
 * 恶意载荷 (含 &|" 等 cmd 元字符) 直接被丢弃, 不进入 spawn args.
 * @param {Object} params - { max_size, video_bit_rate, max_fps, video_codec, always_on_top }
 * @returns {string[]}
 */
function buildScrcpyArgs(params) {
  const args = [];
  if (!params) return args;
  if (params.max_size) {
    const size = String(params.max_size);
    if (/^\d+$/.test(size)) args.push('--max-size', size);
  }
  if (params.video_bit_rate) {
    const bitRateWithUnit =
      typeof params.video_bit_rate === 'string' && params.video_bit_rate.endsWith('M')
        ? params.video_bit_rate
        : `${params.video_bit_rate}M`;
    if (/^\d+M$/i.test(bitRateWithUnit)) args.push('--video-bit-rate', bitRateWithUnit);
  }
  if (params.max_fps) {
    const fps = String(params.max_fps);
    if (/^\d+$/.test(fps)) args.push('--max-fps', fps);
  }
  if (params.video_codec) {
    const codec = String(params.video_codec).toLowerCase();
    if (['h264', 'h265', 'av1'].includes(codec)) args.push('--video-codec', codec);
  }
  if (params.always_on_top) args.push('--always-on-top');
  return args;
}

// P1-2: 设备序列号白名单 (adb serial: 字母数字 + . : _ -), 阻断命令注入载荷
const DEVICE_SERIAL_RE = /^[A-Za-z0-9._:-]{1,64}$/;

const defaultProcessSpawnerFactory = () => {
  const { spawn } = require('child_process');
  return {
    spawn: (cmd, args, opts) => spawn(cmd, args, opts),
  };
};

const defaultPathResolverFactory = (projectRoot) => {
  const fs = require('fs');
  const { execFile } = require('child_process');
  let cachedPath; // undefined=未解析, null=解析失败, string=路径
  return {
    // 异步化避免阻塞事件循环 + 路径缓存 (避免每次 startScrcpy 都 where scrcpy)
    async findScrcpyPath() {
      if (cachedPath !== undefined) return cachedPath;
      const localScrcpy = path.join(projectRoot, 'env', 'scrcpy', 'scrcpy.exe');
      if (fs.existsSync(localScrcpy)) {
        cachedPath = localScrcpy;
        return cachedPath;
      }
      try {
        cachedPath = await new Promise((resolve) => {
          execFile(
            'where',
            ['scrcpy'],
            {
              encoding: 'utf8',
              windowsHide: true,
              timeout: 3000,
            },
            (err, stdout) => {
              if (err) {
                resolve(null);
                return;
              }
              const systemPath = stdout
                .split('\n')
                .map((p) => p.trim())
                .find((p) => p && p.endsWith('.exe'));
              resolve(systemPath || null);
            }
          );
        });
      } catch {
        cachedPath = null;
      }
      return cachedPath;
    },
  };
};

const defaultLoggerFactory = () => ({ error: (msg) => console.error(msg) });

/**
 * 默认 notifier factory
 * 接受 getMainWindow 函数 (lazy 获取, 因 mainWindow 在 service 构造后才 setMainWindow).
 * 返 { notify(errorInfo) } 包装 mainWindow.webContents.send(IPC_CHANNELS.SCRCPY_ERROR, ...)
 */
const defaultNotifierFactory = (getMainWindow) => ({
  notify: (errorInfo) => {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.SCRCPY_ERROR, errorInfo);
    }
  },
});

class ScrcpyService {
  /**
   * @param {string} projectRoot
   * @param {object} i18nService
   * @param {ScrcpyServiceOptions} [opts] - factory-or-default
   */
  constructor(projectRoot, i18nService, opts = {}) {
    this.projectRoot = projectRoot;
    this.i18nService = i18nService;
    this._mainWindow = null; // setMainWindow 后填充
    this._child = null; // 持有 child 引用供 stopScrcpy 管理
    this._processSpawnerFactory = opts.processSpawnerFactory || defaultProcessSpawnerFactory;
    this._pathResolverFactory = opts.pathResolverFactory || defaultPathResolverFactory;
    this._loggerFactory = opts.loggerFactory || defaultLoggerFactory;
    this._notifierFactory = opts.notifierFactory || defaultNotifierFactory;
    this._spawner = this._processSpawnerFactory();
    this._pathResolver = this._pathResolverFactory(projectRoot);
    this._logger = this._loggerFactory();
    this._notifier = this._notifierFactory(() => this._mainWindow);
  }

  /**
   * 注入 mainWindow
   * ElectronApp.initialize 创建 mainWindow 后调用.
   * @param {object} mainWindow
   */
  setMainWindow(mainWindow) {
    this._mainWindow = mainWindow;
  }

  /**
   * 停止当前 scrcpy 子进程.
   * startScrcpy 开头自动调此方法停旧进程, 避免累积.
   */
  stopScrcpy() {
    if (this._child) {
      try {
        this._child.kill();
      } catch {
        /* 已退出 */
      }
      this._child = null;
    }
  }

  async startScrcpy(deviceId, scrcpyParams) {
    try {
      // P1-2: deviceId 白名单校验 (阻断 &|" 等载荷, 防 cmd.exe/引号注入)
      if (typeof deviceId !== 'string' || !DEVICE_SERIAL_RE.test(deviceId)) {
        return { success: false, error: 'invalid_device_id' };
      }

      // 先停旧 scrcpy 进程 (避免多次调用累积)
      this.stopScrcpy();

      // findScrcpyPath 异步化 (避免阻塞事件循环)
      const scrcpyPath = await this._pathResolver.findScrcpyPath();
      if (!scrcpyPath) {
        return {
          success: false,
          error: this.i18nService.t('main.scrcpyNotFound', {
            path: path.join(this.projectRoot, 'env', 'scrcpy', 'scrcpy.exe'),
          }),
        };
      }

      const args = ['-s', deviceId, ...buildScrcpyArgs(scrcpyParams)];

      // P1-2: 直接 spawn 可执行文件, 不再经 cmd.exe /c 中转.
      // cmd.exe 会对命令行做二次解析, 参数中的 & | " 可闭合引号拼接任意命令 (宿主机 RCE);
      // scrcpy.exe 是原生 exe, spawn 数组参数不经 shell, 无注入面.
      const child = this._spawner.spawn(scrcpyPath, args, {
        cwd: path.dirname(scrcpyPath),
        windowsHide: true,
        stdio: 'pipe',
      });

      // 持有 child 引用供 stopScrcpy 管理
      this._child = child;

      child.stdout.resume();
      child.stderr.resume();

      // child process 生命周期管理
      const startTime = Date.now();
      child.on('error', (err) => {
        this._child = null;
        this._notifier.notify({
          error: err.message || 'Unknown spawn error',
        });
      });
      child.on('close', (code, signal) => {
        this._child = null;
        const elapsed = Date.now() - startTime;
        if (code !== 0 && elapsed < SCRCPY_CRASH_WINDOW_MS) {
          this._notifier.notify({
            error: 'crash',
            code,
            signal,
          });
        }
      });

      // 不再返回 process (消除句柄泄漏, service 内部管理生命周期)
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = { ScrcpyService, buildScrcpyArgs, SCRCPY_CRASH_WINDOW_MS };
