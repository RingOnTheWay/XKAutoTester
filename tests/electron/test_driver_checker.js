// DriverChecker 单元测试
// 验证: 1) getDriverInstallerPath (Win 真实 + 非 Win stub + x64/x86/缺失)
//      2) checkCP210xDriver (Win 真实 + 非 Win stub + 4 检测路径)
//      3) isInstallerRunning (Win 真实 + 非 Win stub + x64/x86/无)
// 策略: 注入 mock spawnHelper + 真实 fs.existsSync 模拟 + Object.defineProperty 覆盖 process.platform
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const Module = require('module');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const DRIVER_CHECKER_PATH = path.join(
  PROJECT_ROOT, 'electron', 'src', 'main', 'services', 'DriverChecker.js'
);

const i18nMock = {
  t: (key, params) => key + (params ? ` ${JSON.stringify(params)}` : ''),
};

function loadDriverChecker() {
  delete require.cache[require.resolve(DRIVER_CHECKER_PATH)];
  return require(DRIVER_CHECKER_PATH);
}

/**
 * 临时覆盖 process.platform
 * @returns {Function} restore 函数
 */
function setPlatform(platform) {
  const original = process.platform;
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true,
  });
  return () => {
    Object.defineProperty(process, 'platform', {
      value: original,
      configurable: true,
    });
  };
}

/**
 * 构造 mock spawnHelper (executeCommand 函数)
 * @param {Function} impl - async (cmd, args) => {code, stdout, stderr}
 */
function createSpawnHelperMock(impl) {
  const calls = [];
  const executeCommand = async (cmd, args, options) => {
    calls.push({ cmd, args, options });
    return impl ? impl(cmd, args, options) : { code: 0, stdout: '', stderr: '' };
  };
  return { executeCommand, calls };
}


// ─── getDriverInstallerPath ───────────────────────────────────

test('getDriverInstallerPath 非 Win 平台返回 null (stub)', () => {
  const restore = setPlatform('linux');
  try {
    const DriverChecker = loadDriverChecker();
    const spawnHelper = createSpawnHelperMock();
    const checker = new DriverChecker(i18nMock, PROJECT_ROOT, spawnHelper);

    const result = checker.getDriverInstallerPath();
    assert.strictEqual(result, null);
  } finally {
    restore();
  }
});

test('getDriverInstallerPath Win + x64 驱动存在时返回 x64 路径', () => {
  const restore = setPlatform('win32');
  const originalExists = fs.existsSync;
  try {
    const DriverChecker = loadDriverChecker();
    const spawnHelper = createSpawnHelperMock();
    const checker = new DriverChecker(i18nMock, PROJECT_ROOT, spawnHelper);

    fs.existsSync = (p) => {
      if (p === path.join(PROJECT_ROOT, 'env', 'CP210x_Windows_Drivers', 'CP210xVCPInstaller_x64.exe')) return true;
      return false;
    };

    const result = checker.getDriverInstallerPath();
    assert.ok(result.includes('CP210xVCPInstaller_x64.exe'));
  } finally {
    fs.existsSync = originalExists;
    restore();
  }
});

test('getDriverInstallerPath Win + 仅 x86 驱动存在时返回 x86 路径', () => {
  const restore = setPlatform('win32');
  const originalExists = fs.existsSync;
  try {
    const DriverChecker = loadDriverChecker();
    const spawnHelper = createSpawnHelperMock();
    const checker = new DriverChecker(i18nMock, PROJECT_ROOT, spawnHelper);

    fs.existsSync = (p) => {
      if (p === path.join(PROJECT_ROOT, 'env', 'CP210x_Windows_Drivers', 'CP210xVCPInstaller_x86.exe')) return true;
      return false;
    };

    const result = checker.getDriverInstallerPath();
    assert.ok(result.includes('CP210xVCPInstaller_x86.exe'));
  } finally {
    fs.existsSync = originalExists;
    restore();
  }
});

test('getDriverInstallerPath Win + 驱动都不存在时返回 null', () => {
  const restore = setPlatform('win32');
  const originalExists = fs.existsSync;
  try {
    const DriverChecker = loadDriverChecker();
    const spawnHelper = createSpawnHelperMock();
    const checker = new DriverChecker(i18nMock, PROJECT_ROOT, spawnHelper);

    fs.existsSync = () => false;
    const result = checker.getDriverInstallerPath();
    assert.strictEqual(result, null);
  } finally {
    fs.existsSync = originalExists;
    restore();
  }
});


// ─── checkCP210xDriver ────────────────────────────────────────

test('checkCP210xDriver 非 Win 平台返回 stub (warning + canInstall=false)', async () => {
  const restore = setPlatform('linux');
  try {
    const DriverChecker = loadDriverChecker();
    const spawnHelper = createSpawnHelperMock();
    const checker = new DriverChecker(i18nMock, PROJECT_ROOT, spawnHelper);

    const result = await checker.checkCP210xDriver();

    assert.strictEqual(result.status, 'warning');
    assert.strictEqual(result.canInstall, false);
    assert.strictEqual(result.installerPath, null);
    assert.strictEqual(spawnHelper.calls.length, 0, '非 Win 不应调用 executeCommand');
  } finally {
    restore();
  }
});

test('checkCP210xDriver Win + silabser.sys 存在 → success', async () => {
  const restore = setPlatform('win32');
  const originalExists = fs.existsSync;
  try {
    const DriverChecker = loadDriverChecker();
    const spawnHelper = createSpawnHelperMock();
    const checker = new DriverChecker(i18nMock, PROJECT_ROOT, spawnHelper);

    fs.existsSync = (p) => {
      // silabser.sys 路径命中
      if (p && p.includes('System32') && p.includes('drivers') && p.endsWith('silabser.sys')) return true;
      return false;
    };

    const result = await checker.checkCP210xDriver();
    assert.strictEqual(result.status, 'success');
    assert.ok(result.message.includes('cp210Found'));
    assert.strictEqual(spawnHelper.calls.length, 0, 'silabser.sys 命中后不应继续调用 reg/findstr');
  } finally {
    fs.existsSync = originalExists;
    restore();
  }
});

test('checkCP210xDriver Win + 注册表命中 (无 delete flag/start=4) → success', async () => {
  const restore = setPlatform('win32');
  const originalExists = fs.existsSync;
  try {
    const DriverChecker = loadDriverChecker();
    const spawnHelper = createSpawnHelperMock(async (cmd, args) => {
      if (cmd === 'reg.exe') {
        return {
          code: 0,
          stdout: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\silabser\n    Start REG_DWORD 0x3\n    Type REG_DWORD 0x1',
          stderr: '',
        };
      }
      return { code: 1, stdout: '', stderr: '' };
    });
    const checker = new DriverChecker(i18nMock, PROJECT_ROOT, spawnHelper);

    fs.existsSync = () => false;

    const result = await checker.checkCP210xDriver();
    assert.strictEqual(result.status, 'success');
    assert.ok(spawnHelper.calls.some(c => c.cmd === 'reg.exe'), '应调用 reg.exe 查询');
  } finally {
    fs.existsSync = originalExists;
    restore();
  }
});

test('checkCP210xDriver Win + 注册表命中但有 DeleteFlag → 不算 success', async () => {
  const restore = setPlatform('win32');
  const originalExists = fs.existsSync;
  try {
    const DriverChecker = loadDriverChecker();
    const spawnHelper = createSpawnHelperMock(async (cmd, args) => {
      if (cmd === 'reg.exe') {
        return {
          code: 0,
          stdout: 'silabser\n    DriverDelete REG_DWORD 0x1\n    Start REG_DWORD 0x3',
          stderr: '',
        };
      }
      // findstr 也未命中
      return { code: 1, stdout: '', stderr: '' };
    });
    const checker = new DriverChecker(i18nMock, PROJECT_ROOT, spawnHelper);

    fs.existsSync = () => false;

    const result = await checker.checkCP210xDriver();
    assert.strictEqual(result.status, 'warning');
    assert.strictEqual(result.canInstall, false);
  } finally {
    fs.existsSync = originalExists;
    restore();
  }
});

test('checkCP210xDriver Win + 注册表命中但 Start=4 (disabled) → 不算 success', async () => {
  const restore = setPlatform('win32');
  const originalExists = fs.existsSync;
  try {
    const DriverChecker = loadDriverChecker();
    const spawnHelper = createSpawnHelperMock(async (cmd, args) => {
      if (cmd === 'reg.exe') {
        return {
          code: 0,
          stdout: 'silabser\n    Start REG_DWORD 0x4',
          stderr: '',
        };
      }
      return { code: 1, stdout: '', stderr: '' };
    });
    const checker = new DriverChecker(i18nMock, PROJECT_ROOT, spawnHelper);

    fs.existsSync = () => false;

    const result = await checker.checkCP210xDriver();
    assert.strictEqual(result.status, 'warning');
  } finally {
    fs.existsSync = originalExists;
    restore();
  }
});

test('checkCP210xDriver Win + findstr 命中 oem*.inf → success', async () => {
  const restore = setPlatform('win32');
  const originalExists = fs.existsSync;
  try {
    const DriverChecker = loadDriverChecker();
    const spawnHelper = createSpawnHelperMock(async (cmd, args) => {
      if (cmd === 'reg.exe') return { code: 0, stdout: '', stderr: '' };
      if (cmd === 'findstr.exe') return { code: 0, stdout: 'C:\\Windows\\INF\\oem12.inf', stderr: '' };
      return { code: 1, stdout: '', stderr: '' };
    });
    const checker = new DriverChecker(i18nMock, PROJECT_ROOT, spawnHelper);

    fs.existsSync = () => false;

    const result = await checker.checkCP210xDriver();
    assert.strictEqual(result.status, 'success');
  } finally {
    fs.existsSync = originalExists;
    restore();
  }
});

test('checkCP210xDriver Win + 全部未命中 → warning + canInstall 取决于 installer 存在', async () => {
  const restore = setPlatform('win32');
  const originalExists = fs.existsSync;
  try {
    const DriverChecker = loadDriverChecker();
    const spawnHelper = createSpawnHelperMock(async () => ({ code: 1, stdout: '', stderr: '' }));
    const checker = new DriverChecker(i18nMock, PROJECT_ROOT, spawnHelper);

    fs.existsSync = (p) => {
      // installer 存在
      if (p === path.join(PROJECT_ROOT, 'env', 'CP210x_Windows_Drivers', 'CP210xVCPInstaller_x64.exe')) return true;
      return false;
    };

    const result = await checker.checkCP210xDriver();
    assert.strictEqual(result.status, 'warning');
    assert.strictEqual(result.canInstall, true);
    assert.ok(result.installerPath.includes('CP210xVCPInstaller_x64.exe'));
  } finally {
    fs.existsSync = originalExists;
    restore();
  }
});

test('checkCP210xDriver Win + executeCommand 抛异常 → catch 返回 warning + 错误消息', async () => {
  const restore = setPlatform('win32');
  const originalExists = fs.existsSync;
  try {
    const DriverChecker = loadDriverChecker();
    const spawnHelper = createSpawnHelperMock(async () => {
      throw new Error('spawn ENOENT');
    });
    const checker = new DriverChecker(i18nMock, PROJECT_ROOT, spawnHelper);

    fs.existsSync = () => false;

    const result = await checker.checkCP210xDriver();
    assert.strictEqual(result.status, 'warning');
    assert.ok(result.message.includes('cp210xCheckFailed'), '应使用 cp210xCheckFailed 文案');
  } finally {
    fs.existsSync = originalExists;
    restore();
  }
});


// ─── isInstallerRunning ───────────────────────────────────────

test('isInstallerRunning 非 Win 平台返回 false (stub)', async () => {
  const restore = setPlatform('linux');
  try {
    const DriverChecker = loadDriverChecker();
    const spawnHelper = createSpawnHelperMock();
    const checker = new DriverChecker(i18nMock, PROJECT_ROOT, spawnHelper);

    const result = await checker.isInstallerRunning();
    assert.strictEqual(result, false);
    assert.strictEqual(spawnHelper.calls.length, 0);
  } finally {
    restore();
  }
});

test('isInstallerRunning Win + x64 安装程序运行 → true', async () => {
  const restore = setPlatform('win32');
  try {
    const DriverChecker = loadDriverChecker();
    const spawnHelper = createSpawnHelperMock(async (cmd, args) => {
      const argStr = args.join(' ');
      if (cmd === 'tasklist' && argStr.includes('CP210xVCPInstaller_x64.exe')) {
        return {
          code: 0,
          stdout: 'CP210xVCPInstaller_x64.exe  1234 Console  1  5,000 K',
          stderr: '',
        };
      }
      return { code: 0, stdout: 'INFO: No tasks running', stderr: '' };
    });
    const checker = new DriverChecker(i18nMock, PROJECT_ROOT, spawnHelper);

    const result = await checker.isInstallerRunning();
    assert.strictEqual(result, true);
  } finally {
    restore();
  }
});

test('isInstallerRunning Win + x86 安装程序运行 → true', async () => {
  const restore = setPlatform('win32');
  try {
    const DriverChecker = loadDriverChecker();
    const spawnHelper = createSpawnHelperMock(async (cmd, args) => {
      const argStr = args.join(' ');
      if (argStr.includes('CP210xVCPInstaller_x86.exe')) {
        return {
          code: 0,
          stdout: 'CP210xVCPInstaller_x86.exe  5678 Console  1  4,000 K',
          stderr: '',
        };
      }
      return { code: 0, stdout: 'INFO: No tasks running', stderr: '' };
    });
    const checker = new DriverChecker(i18nMock, PROJECT_ROOT, spawnHelper);

    const result = await checker.isInstallerRunning();
    assert.strictEqual(result, true);
  } finally {
    restore();
  }
});

test('isInstallerRunning Win + 无安装程序运行 → false', async () => {
  const restore = setPlatform('win32');
  try {
    const DriverChecker = loadDriverChecker();
    const spawnHelper = createSpawnHelperMock(async () => ({
      code: 0,
      stdout: 'INFO: No tasks are running which match the specified criteria.',
      stderr: '',
    }));
    const checker = new DriverChecker(i18nMock, PROJECT_ROOT, spawnHelper);

    const result = await checker.isInstallerRunning();
    assert.strictEqual(result, false);
  } finally {
    restore();
  }
});

test('isInstallerRunning Win + executeCommand 抛异常 → catch 返回 false', async () => {
  const restore = setPlatform('win32');
  try {
    const DriverChecker = loadDriverChecker();
    const spawnHelper = createSpawnHelperMock(async () => {
      throw new Error('spawn fail');
    });
    const checker = new DriverChecker(i18nMock, PROJECT_ROOT, spawnHelper);

    const result = await checker.isInstallerRunning();
    assert.strictEqual(result, false);
  } finally {
    restore();
  }
});
