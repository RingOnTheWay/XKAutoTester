const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
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
   * 查找系统 Node.js 可执行文件路径
   */
  _findSystemNode() {
    try {
      const result = execSync('where node', {
        encoding: 'utf8',
        timeout: 3000,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      const paths = result.split('\n').map(p => p.trim()).filter(p => p && p.endsWith('.exe'));
      return paths[0] || null;
    } catch {
      return null;
    }
  }

  /**
   * 解析 allure npm 包的 CLI 入口路径 (cli.js)
   */
  _getAllureCliPath() {
    try {
      // Allure 3 是 ESM 包，require.resolve 可能失败，用路径探测
      const searchPaths = [
        path.join(this.projectRoot, 'node_modules', 'allure'),
        path.join(this.projectRoot, 'electron', 'node_modules', 'allure'),
        path.join(__dirname, '..', '..', '..', '..', 'node_modules', 'allure')
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
    // 优先使用系统 Node.js 运行 Allure CLI (ESM 兼容性更好)
    const allureCliPath = this._getAllureCliPath();
    const env = { ...process.env };

    let command;
    let args;

    if (allureCliPath) {
      // Electron 的 process.execPath 是 electron.exe，ELECTRON_RUN_AS_NODE=1 可能有 ESM 问题
      const systemNode = this._findSystemNode();
      command = systemNode || process.execPath;
      // Allure 3 generate: allure generate <resultsDir> -o <outputDir>
      args = [allureCliPath, 'generate', resultsDir, '-o', outputDir];
      if (!systemNode) {
        // 使用 Electron 作为 Node 时需要设置环境变量
        env.ELECTRON_RUN_AS_NODE = '1';
      }
    } else {
      // 回退: 尝试系统 npx
      command = 'npx';
      args = ['allure', 'generate', resultsDir, '-o', outputDir];
      await this.logger.warning('Allure npm package not found, falling back to npx');
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
