// RemoteStatService 单元测试
// 验证: 1) getFileSize stat -c %s 2) getDirSize du -sk 主路径 3) du -s 回退 4) du 回退 5) ls -laR 最终回退
//      6) 路径含特殊字符用 AdbPathQuoter 转义 7) deviceId 注入 -s 参数 8) 无 deviceId 不含 -s
//      9) 执行失败返回 0 10) 输出非数字返回 0
// 策略: mock commandExecutor (不依赖 spawn)
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const RemoteStatService = require(path.join(
  __dirname, '..', '..', 'electron', 'src', 'main', 'services', 'adb', 'RemoteStatService.js'
));
const AdbPathQuoter = require(path.join(
  __dirname, '..', '..', 'electron', 'src', 'main', 'services', 'adb', 'AdbPathQuoter.js'
));

// ── mock commandExecutor 工厂 ─────────────────────────────

/**
 * 创建 mock commandExecutor
 * @param {function} executeFn - (args, opts) => Promise<{success, output, error}>
 * @returns {object} mock executor,带 .calls 记录
 */
function createMockExecutor(executeFn) {
  const calls = [];
  const exec = {
    execute: async (args, opts) => {
      calls.push({ args, opts });
      return executeFn(args, opts);
    },
  };
  Object.defineProperty(exec, 'calls', {
    value: calls,
    enumerable: false,
    writable: false,
  });
  return exec;
}

const i18nMock = { t: (key, params) => key + (params ? JSON.stringify(params) : '') };

// ── getFileSize ──────────────────────────────────────────

test('getFileSize 解析 stat -c %s 数字输出', async () => {
  const exec = createMockExecutor(async () => ({ success: true, output: '12345\n', error: '' }));
  const svc = new RemoteStatService({ commandExecutor: exec, i18nService: i18nMock });

  const size = await svc.getFileSize('/sdcard/file.txt', null);

  assert.strictEqual(size, 12345);
});

test('getFileSize 含 deviceId 时 args 含 -s deviceId', async () => {
  const exec = createMockExecutor(async () => ({ success: true, output: '100\n', error: '' }));
  const svc = new RemoteStatService({ commandExecutor: exec, i18nService: i18nMock });

  await svc.getFileSize('/sdcard/file.txt', 'device123');

  assert.strictEqual(exec.calls.length, 1);
  assert.deepStrictEqual(exec.calls[0].args, ['-s', 'device123', 'shell', `stat -c %s ${AdbPathQuoter.quote('/sdcard/file.txt')}`]);
});

test('getFileSize 无 deviceId 时 args 不含 -s', async () => {
  const exec = createMockExecutor(async () => ({ success: true, output: '100\n', error: '' }));
  const svc = new RemoteStatService({ commandExecutor: exec, i18nService: i18nMock });

  await svc.getFileSize('/sdcard/file.txt', null);

  assert.deepStrictEqual(exec.calls[0].args, ['shell', `stat -c %s ${AdbPathQuoter.quote('/sdcard/file.txt')}`]);
});

test('getFileSize 路径含空格用 AdbPathQuoter 转义', async () => {
  const exec = createMockExecutor(async () => ({ success: true, output: '0\n', error: '' }));
  const svc = new RemoteStatService({ commandExecutor: exec, i18nService: i18nMock });

  await svc.getFileSize('/sdcard/my file.txt', null);

  const expectedQuoted = AdbPathQuoter.quote('/sdcard/my file.txt');
  assert.ok(exec.calls[0].args[1].includes(expectedQuoted));
});

test('getFileSize 执行失败返回 0', async () => {
  const exec = createMockExecutor(async () => ({ success: false, output: '', error: 'no such file' }));
  const svc = new RemoteStatService({ commandExecutor: exec, i18nService: i18nMock });

  const size = await svc.getFileSize('/nonexistent', null);

  assert.strictEqual(size, 0);
});

test('getFileSize 输出非数字返回 0', async () => {
  const exec = createMockExecutor(async () => ({ success: true, output: 'not a number\n', error: '' }));
  const svc = new RemoteStatService({ commandExecutor: exec, i18nService: i18nMock });

  const size = await svc.getFileSize('/sdcard/file.txt', null);

  assert.strictEqual(size, 0);
});

test('getFileSize 输出为 0 字节返回 0', async () => {
  const exec = createMockExecutor(async () => ({ success: true, output: '0\n', error: '' }));
  const svc = new RemoteStatService({ commandExecutor: exec, i18nService: i18nMock });

  const size = await svc.getFileSize('/sdcard/empty.txt', null);

  assert.strictEqual(size, 0);
});

test('getFileSize 含 timeoutMs=30000', async () => {
  const exec = createMockExecutor(async () => ({ success: true, output: '100\n', error: '' }));
  const svc = new RemoteStatService({ commandExecutor: exec, i18nService: i18nMock });

  await svc.getFileSize('/sdcard/file.txt', null);

  assert.strictEqual(exec.calls[0].opts.timeoutMs, 30000);
});

// ── getDirSize - du 主路径 ───────────────────────────────

test('getDirSize du -sk 成功返回字节数', async () => {
  // du -sk 输出 KB,需 * 1024
  const exec = createMockExecutor(async () => ({ success: true, output: '100\t/sdcard/dir\n', error: '' }));
  const svc = new RemoteStatService({ commandExecutor: exec, i18nService: i18nMock });

  const size = await svc.getDirSize('/sdcard/dir', null);

  assert.strictEqual(size, 100 * 1024);
  assert.strictEqual(exec.calls.length, 1);
  // 第一次试 du -sk
  assert.ok(exec.calls[0].args[1].includes('du -sk'));
});

test('getDirSize du -sk 取最后一行避免子目录大小', async () => {
  // 多行输出,最后一行是汇总
  const exec = createMockExecutor(async () => ({
    success: true,
    output: '50\t/sdcard/dir/sub1\n60\t/sdcard/dir/sub2\n200\t/sdcard/dir\n',
    error: '',
  }));
  const svc = new RemoteStatService({ commandExecutor: exec, i18nService: i18nMock });

  const size = await svc.getDirSize('/sdcard/dir', null);

  assert.strictEqual(size, 200 * 1024);
});

test('getDirSize du -sk 失败回退 du -s', async () => {
  let callCount = 0;
  const exec = createMockExecutor(async () => {
    callCount++;
    if (callCount === 1) {
      // du -sk 无输出 (失败)
      return { success: true, output: '', error: '' };
    }
    // du -s 成功
    return { success: true, output: '50\t/sdcard/dir\n', error: '' };
  });
  const svc = new RemoteStatService({ commandExecutor: exec, i18nService: i18nMock });

  const size = await svc.getDirSize('/sdcard/dir', null);

  assert.strictEqual(size, 50 * 1024);
  assert.strictEqual(exec.calls.length, 2);
  assert.ok(exec.calls[0].args[1].includes('du -sk'));
  assert.ok(exec.calls[1].args[1].includes('du -s'));
});

test('getDirSize du -s 失败回退 du', async () => {
  let callCount = 0;
  const exec = createMockExecutor(async () => {
    callCount++;
    if (callCount <= 2) return { success: true, output: '', error: '' };
    return { success: true, output: '30\t/sdcard/dir\n', error: '' };
  });
  const svc = new RemoteStatService({ commandExecutor: exec, i18nService: i18nMock });

  const size = await svc.getDirSize('/sdcard/dir', null);

  assert.strictEqual(size, 30 * 1024);
  assert.strictEqual(exec.calls.length, 3);
  // 第三个 du 命令也用 AdbPathQuoter 单引号转义 (统一设计)
  assert.ok(exec.calls[2].args[1].includes(AdbPathQuoter.quote('/sdcard/dir')));
  assert.ok(exec.calls[2].args[1].startsWith('du '));
});

test('getDirSize 所有 du 失败回退 ls -laR', async () => {
  let callCount = 0;
  const exec = createMockExecutor(async () => {
    callCount++;
    if (callCount <= 3) return { success: true, output: '', error: '' };
    // ls -laR 输出
    return {
      success: true,
      output: '-rw-r--r-- 1 root root 100 Jan 1 00:00 file1.txt\n' +
              '-rw-r--r-- 1 root root 200 Jan 1 00:00 file2.txt\n' +
              'drwxr-xr-x 2 root root 4096 Jan 1 00:00 subdir\n',
      error: '',
    };
  });
  const svc = new RemoteStatService({ commandExecutor: exec, i18nService: i18nMock });

  const size = await svc.getDirSize('/sdcard/dir', null);

  assert.strictEqual(size, 100 + 200);  // 文件大小求和 (目录条目不算)
  assert.strictEqual(exec.calls.length, 4);
  assert.ok(exec.calls[3].args[1].includes('ls -laR'));
});

test('getDirSize ls -laR 只匹配文件行 (typeFlag=-),跳过目录行', async () => {
  const exec = createMockExecutor(async () => {
    if (callCount <= 3) return { success: true, output: '', error: '' };
    return {
      success: true,
      output: '-rw-r--r-- 1 root root 100 ...\ndrwxr-xr-x 2 root root 4096 ...\n-rw-r--r-- 1 root root 200 ...\n',
      error: '',
    };
  });
  let callCount = 0;
  const exec2 = createMockExecutor(async () => {
    callCount++;
    if (callCount <= 3) return { success: true, output: '', error: '' };
    return {
      success: true,
      output: '-rw-r--r-- 1 root root 100 file1\n' +
              'drwxr-xr-x 2 root root 4096 subdir\n' +
              '-rw-r--r-- 1 root root 200 file2\n',
      error: '',
    };
  });
  const svc = new RemoteStatService({ commandExecutor: exec2, i18nService: i18nMock });

  const size = await svc.getDirSize('/sdcard/dir', null);

  assert.strictEqual(size, 300);  // 100 + 200,不含目录 4096
});

test('getDirSize 所有方法失败返回 0', async () => {
  const exec = createMockExecutor(async () => ({ success: true, output: '', error: '' }));
  const svc = new RemoteStatService({ commandExecutor: exec, i18nService: i18nMock });

  const size = await svc.getDirSize('/nonexistent', null);

  assert.strictEqual(size, 0);
  assert.strictEqual(exec.calls.length, 4);  // 3 个 du + 1 个 ls
});

test('getDirSize 路径用 AdbPathQuoter 转义', async () => {
  const exec = createMockExecutor(async () => ({ success: true, output: '10\t/sdcard/my dir\n', error: '' }));
  const svc = new RemoteStatService({ commandExecutor: exec, i18nService: i18nMock });

  await svc.getDirSize('/sdcard/my dir', null);

  const expectedQuoted = AdbPathQuoter.quote('/sdcard/my dir');
  assert.ok(exec.calls[0].args[1].includes(expectedQuoted));
});

test('getDirSize 含 deviceId 时 args 含 -s deviceId', async () => {
  const exec = createMockExecutor(async () => ({ success: true, output: '10\t/sdcard/dir\n', error: '' }));
  const svc = new RemoteStatService({ commandExecutor: exec, i18nService: i18nMock });

  await svc.getDirSize('/sdcard/dir', 'device123');

  assert.deepStrictEqual(exec.calls[0].args[0], '-s');
  assert.deepStrictEqual(exec.calls[0].args[1], 'device123');
});

test('getDirSize 每次调用都含 timeoutMs=30000', async () => {
  const exec = createMockExecutor(async () => ({ success: true, output: '10\t/dir\n', error: '' }));
  const svc = new RemoteStatService({ commandExecutor: exec, i18nService: i18nMock });

  await svc.getDirSize('/sdcard/dir', null);

  assert.strictEqual(exec.calls[0].opts.timeoutMs, 30000);
});

test('getDirSize du 输出无数字返回 0 (但不立即放弃,试下一个 du)', async () => {
  let callCount = 0;
  const exec = createMockExecutor(async () => {
    callCount++;
    if (callCount === 1) return { success: true, output: 'no numbers here', error: '' };
    if (callCount === 2) return { success: true, output: 'still no numbers', error: '' };
    if (callCount === 3) return { success: true, output: 'nothing', error: '' };
    return { success: true, output: '-rw-r--r-- 1 root root 50 f\n', error: '' };
  });
  const svc = new RemoteStatService({ commandExecutor: exec, i18nService: i18nMock });

  const size = await svc.getDirSize('/sdcard/dir', null);

  assert.strictEqual(size, 50);
  assert.strictEqual(exec.calls.length, 4);
});
