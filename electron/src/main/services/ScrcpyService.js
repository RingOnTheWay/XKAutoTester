// ScrcpyService — scrcpy 投屏深模块。
//
// 藏 scrcpy 路径解析 (本地优先 + where 兜底) + 6 参数 args 构建 + 平台分支。
// 3 factory-or-default (processSpawner + pathResolver + logger) + buildScrcpyArgs 纯函数。
//
// 生产: new ScrcpyService(projectRoot, i18nService)  # 2 参
// 测试: new ScrcpyService(projectRoot, i18nService, { processSpawnerFactory, pathResolverFactory, loggerFactory })

const path = require('path');

/** @typedef {Object} ScrcpyProcessSpawner
 * @property {(cmd: string, args: string[], opts: object) => object} spawn - 返 child process
 */
/** @typedef {Object} ScrcpyPathResolver
 * @property {() => string|null} findScrcpyPath - 返 scrcpy.exe 路径或 null
 */
/** @typedef {Object} ScrcpyLogger
 * @property {(msg: string) => void} error
 */
/** @typedef {Object} ScrcpyServiceOptions
 * @property {() => ScrcpyProcessSpawner} [processSpawnerFactory]
 * @property {() => ScrcpyPathResolver} [pathResolverFactory]
 * @property {() => ScrcpyLogger} [loggerFactory]
 */

/**
 * 构建 scrcpy CLI args (纯函数, 对称 UpdateService compareVersions)
 * @param {Object} params - { max_size, video_bit_rate, max_fps, video_codec, always_on_top }
 * @returns {string[]}
 */
function buildScrcpyArgs(params) {
  const args = [];
  if (!params) return args;
  if (params.max_size) args.push('--max-size', params.max_size);
  if (params.video_bit_rate) {
    const bitRate = params.video_bit_rate;
    const bitRateWithUnit = typeof bitRate === 'string' && bitRate.endsWith('M')
      ? bitRate : `${bitRate}M`;
    args.push('--video-bit-rate', bitRateWithUnit);
  }
  if (params.max_fps) args.push('--max-fps', params.max_fps);
  if (params.video_codec) args.push('--video-codec', params.video_codec);
  if (params.always_on_top) args.push('--always-on-top');
  return args;
}

const defaultProcessSpawnerFactory = () => {
  const { spawn } = require('child_process');
  return {
    spawn: (cmd, args, opts) => spawn(cmd, args, opts)
  };
};

const defaultPathResolverFactory = (projectRoot) => {
  const fs = require('fs');
  const { execSync } = require('child_process');
  return {
    findScrcpyPath() {
      const localScrcpy = path.join(projectRoot, 'env', 'scrcpy', 'scrcpy.exe');
      if (fs.existsSync(localScrcpy)) return localScrcpy;
      try {
        const result = execSync('where scrcpy', {
          encoding: 'utf8', windowsHide: true, timeout: 3000
        });
        const systemPath = result.split('\n').map(p => p.trim())
          .find(p => p && p.endsWith('.exe'));
        if (systemPath) return systemPath;
      } catch {}
      return null;
    }
  };
};

const defaultLoggerFactory = () => ({ error: (msg) => console.error(msg) });

class ScrcpyService {
  /**
   * @param {string} projectRoot
   * @param {object} i18nService
   * @param {ScrcpyServiceOptions} [opts] - factory-or-default
   */
  constructor(projectRoot, i18nService, opts = {}) {
    this.projectRoot = projectRoot;
    this.i18nService = i18nService;
    this._processSpawnerFactory = opts.processSpawnerFactory || defaultProcessSpawnerFactory;
    this._pathResolverFactory = opts.pathResolverFactory || defaultPathResolverFactory;
    this._loggerFactory = opts.loggerFactory || defaultLoggerFactory;
    this._spawner = this._processSpawnerFactory();
    this._pathResolver = this._pathResolverFactory(projectRoot);
    this._logger = this._loggerFactory();
  }

  async startScrcpy(deviceId, scrcpyParams) {
    try {
      const scrcpyPath = this._pathResolver.findScrcpyPath();
      if (!scrcpyPath) {
        return {
          success: false,
          error: this.i18nService.t('main.scrcpyNotFound', {
            path: path.join(this.projectRoot, 'env', 'scrcpy', 'scrcpy.exe')
          })
        };
      }

      const args = ['-s', deviceId, ...buildScrcpyArgs(scrcpyParams)];

      let child;
      if (process.platform === 'win32') {
        child = this._spawner.spawn('cmd.exe', ['/c', scrcpyPath, ...args], {
          cwd: path.dirname(scrcpyPath),
          windowsHide: true,
          stdio: 'pipe'
        });
      } else {
        child = this._spawner.spawn(scrcpyPath, args, {
          cwd: path.dirname(scrcpyPath),
          stdio: 'pipe'
        });
      }

      child.stdout.resume();
      child.stderr.resume();

      return { success: true, process: child };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = { ScrcpyService, buildScrcpyArgs };
