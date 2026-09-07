const path = require('path');
const fs = require('fs');
const { ProcessRunner } = require('../spawnHelper');

/**
 * Allure CLI 调用器
 * 负责 Allure CLI 工具发现 + 报告生成命令执行
 */
class AllureCliInvoker {
  constructor(projectRoot, logger) {
    this.projectRoot = projectRoot;
    this.logger = logger;
    this._runner = new ProcessRunner();
  }

  /**
   * 异步查找系统 Node.js 可执行文件路径。
   * R10: 原 execSync('where node') 阻塞主进程最长 3s, 改用 ProcessRunner.spawn 异步执行。
   * @returns {Promise<string|null>} node.exe 路径, 未找到返 null
   */
  async _findSystemNode() {
    const result = await this._runner.execute({
      command: 'where',
      args: ['node'],
      timeout: 3000,
    });
    if (result.code !== 0 || !result.stdout) return null;
    const paths = result.stdout
      .split('\n')
      .map((p) => p.trim())
      .filter((p) => p && p.endsWith('.exe'));
    return paths[0] || null;
  }

  /**
   * 解析 allure npm 包的 CLI 入口路径 (cli.js)
   */
  _getAllureCliPath() {
    try {
      // Allure 3 是 ESM 包，require.resolve 可能失败，用路径探测。
      // 路径既可能是真实目录(.unpacked / extraResources / dev node_modules),
      // 也可能在 app.asar 内部 —— 后者须配合 generate() 用 Electron 自带 node(RUN_AS_NODE) 才能读取。
      const searchPaths = [
        // 打包: asarUnpack 解包出的真实目录 (系统 node 可直接读)
        path.join(this.projectRoot, 'app.asar.unpacked', 'node_modules', 'allure'),
        // 打包: extraResources 复制的真实目录 (系统 node 可直接读)
        path.join(this.projectRoot, 'node_modules', 'allure'),
        // 开发: electron/node_modules
        path.join(this.projectRoot, 'electron', 'node_modules', 'allure'),
        // 打包: app.asar 内部 (须用 Electron node)
        path.join(__dirname, '..', '..', '..', '..', 'node_modules', 'allure'),
      ];

      for (const allureDir of searchPaths) {
        const cliPath = path.join(allureDir, 'cli.js');
        if (fs.existsSync(cliPath)) {
          return cliPath;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * 调用 allure CLI 生成报告
   * @param {string} resultsDir allure-results 目录路径
   * @param {string} outputDir 报告输出目录路径
   * @returns {Promise<{code:number, stdout:string, stderr:string}>}
   */
  async generate(resultsDir, outputDir) {
    const allureCliPath = this._getAllureCliPath();
    const env = { ...process.env };

    let command;
    let args;

    if (allureCliPath) {
      // 路径在 app.asar 内时, 系统 node 视 asar 为普通文件无法加载(MODULE_NOT_FOUND),
      // 必须用 Electron 自带 node: 其内置 Node 二进制含 asar 支持, 配 ELECTRON_RUN_AS_NODE 可读 asar。
      const isAsarPath = /[\\/]app[.]asar[\\/]/.test(allureCliPath);

      if (!isAsarPath) {
        // 真实目录: 优先系统 Node(ESM 兼容更好), 回退 Electron node
        const systemNode = await this._findSystemNode();
        command = systemNode || process.execPath;
        if (!systemNode) env.ELECTRON_RUN_AS_NODE = '1';
      } else {
        command = process.execPath;
        env.ELECTRON_RUN_AS_NODE = '1';
      }
      // Allure 3 generate: allure generate <resultsDir> -o <outputDir>
      args = [allureCliPath, 'generate', resultsDir, '-o', outputDir];
    } else {
      // 回退: 尝试系统 npx
      command = 'npx';
      args = ['allure', 'generate', resultsDir, '-o', outputDir];
      // R27 修复: logger 方法名是 warn (原 warning 不存在 → 任何回退路径即 TypeError
      // "warning is not a function" → generate 崩 → 报告目录建好但空)
      await this.logger.warn('Allure npm package not found, falling back to npx');
    }

    const result = await this._runner.execute({
      command,
      args,
      options: { env, stdio: ['pipe', 'pipe', 'pipe'] },
    });

    // 与原逻辑一致: error 事件映射到 stderr 字段 (code:-1, stdout:'')
    if (result.errorObject) {
      return { code: -1, stdout: '', stderr: result.errorObject.message };
    }
    return { code: result.code, stdout: result.stdout, stderr: result.stderr };
  }
}

module.exports = AllureCliInvoker;
