// TestCaseService 单测 — 4 factory 注入 + 懒初始化 + 9 方法 (8 原方法 + 1 新增 saveAndGenerate)。
// 验证: constructor 收 4 factory + 懒初始化 + listTestCases + getTestCase (ENOENT) +
//      saveTestCase (ID/文件名/条件生成) + saveAndGenerate (强制生成 + 双路径) +
//      deleteTestCase (字符串/对象参数) + checkJsonExists + batchCheckJsonExists + cleanupOrphanedFiles。
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const TEST_CASE_SERVICE_PATH = path.join(
  __dirname, '..', '..', 'electron', 'src', 'main', 'services', 'TestCaseService.js'
);
const { TestCaseService } = require(TEST_CASE_SERVICE_PATH);

// ── Fakes ──────────────────────────────────────────────

function makeFakeFileSystem(opts = {}) {
  const calls = {
    ensureDir: [],
    readdir: [],
    readFile: [],
    writeFile: [],
    writeJson: [],
    access: [],
    unlink: [],
  };
  // 用 path.normalize 统一路径键, 避免 Windows 正反斜杠不匹配
  const normalizePath = (p) => path.normalize(p);
  const files = {};
  for (const k in (opts.files || {})) files[normalizePath(k)] = opts.files[k];
  const dirs = {};
  for (const k in (opts.dirs || {})) dirs[normalizePath(k)] = opts.dirs[k];
  return {
    calls,
    ensureDir: async (dir) => { calls.ensureDir.push(dir); },
    readdir: async (dir) => {
      const nd = normalizePath(dir);
      calls.readdir.push(dir);  // 存原始路径供断言
      return dirs[nd] || [];
    },
    readFile: async (p) => {
      const np = normalizePath(p);
      calls.readFile.push(p);
      if (files[np] === undefined) {
        const err = new Error('ENOENT');
        err.code = 'ENOENT';
        throw err;
      }
      return files[np];
    },
    writeFile: async (p, content) => {
      const np = normalizePath(p);
      calls.writeFile.push({ path: p, content });
      files[np] = content;  // 写后可读
    },
    // P2: writeJson 原子写 fake (存 data + 字符串化供 readFile 读回)
    writeJson: async (p, data) => {
      const np = normalizePath(p);
      calls.writeJson.push({ path: p, data });
      files[np] = JSON.stringify(data, null, 2);
    },
    access: async (p) => {
      const np = normalizePath(p);
      calls.access.push(p);
      if (files[np] === undefined && !dirs[np]) {
        const err = new Error('ENOENT');
        err.code = 'ENOENT';
        throw err;
      }
    },
    unlink: async (p) => {
      const np = normalizePath(p);
      calls.unlink.push(p);  // 存原始路径供断言
      delete files[np];
    },
  };
}

function makeFakeCodeGenerator(result = null, error = null) {
  const calls = { generatePythonFile: [] };
  return {
    calls,
    async generatePythonFile(caseData, outputDir) {
      calls.generatePythonFile.push({ caseData, outputDir });
      if (error) throw error;
      return result || { success: true, path: '/fake/output/test.py' };
    }
  };
}

function makeFakeApp(opts = {}) {
  const fileSystem = makeFakeFileSystem(opts.fileSystem || {});
  const codeGenerator = makeFakeCodeGenerator(opts.codeGeneratorResult || null, opts.codeGeneratorError || null);
  const idGeneratorCalls = { generate: 0 };
  const idGenerator = opts.idGenerator || (() => {
    idGeneratorCalls.generate++;
    return 'tc_fixed_001';
  });
  const fileNameSanitizerCalls = { sanitize: [] };
  const fileNameSanitizer = opts.fileNameSanitizer || ((raw) => {
    fileNameSanitizerCalls.sanitize.push(raw);
    let name = raw || 'test_case';
    name = name.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_');
    return name.startsWith('test_') ? name : `test_${name}`;
  });

  const svc = new TestCaseService('/fake/config', '/fake/root', {
    fileSystemFactory: () => fileSystem,
    codeGeneratorFactory: () => codeGenerator,
    idGenerator,
    fileNameSanitizer,
  });

  return {
    svc,
    fileSystem,
    codeGenerator,
    idGeneratorCalls,
    fileNameSanitizerCalls,
  };
}

// ── 测试 ────────────────────────────────────────────────

test('constructor 收 4 factory + 4 实例建 + _initialized=false', () => {
  const { svc, fileSystem, codeGenerator } = makeFakeApp();

  assert.strictEqual(svc._initialized, false, '懒初始化 flag 初始 false');
  assert.strictEqual(svc._fileSystem, fileSystem, 'fileSystem 实例建');
  assert.strictEqual(svc._codeGenerator, codeGenerator, 'codeGenerator 实例建');
  assert.strictEqual(typeof svc._idGenerator, 'function', 'idGenerator 注入');
  assert.strictEqual(typeof svc._fileNameSanitizer, 'function', 'fileNameSanitizer 注入');
  // 懒初始化: constructor 不触发 fs
  assert.strictEqual(fileSystem.calls.ensureDir.length, 0, 'constructor 不调 ensureDir');
});

test('懒初始化: constructor 不触发 fs, 首次 saveTestCase 触发 ensureDir', async () => {
  const { svc, fileSystem } = makeFakeApp();

  assert.strictEqual(fileSystem.calls.ensureDir.length, 0, 'constructor 后 ensureDir 未调');

  await svc.saveTestCase({ name: 'Test', fileName: 'test_demo' });

  assert.strictEqual(fileSystem.calls.ensureDir.length, 1, '首次 saveTestCase 调 ensureDir 1 次');
  assert.strictEqual(fileSystem.calls.ensureDir[0], svc.testCasesDir, 'ensureDir 收 testCasesDir');
  assert.strictEqual(svc._initialized, true, '懒初始化后 _initialized=true');
});

test('懒初始化幂等: 重复 saveTestCase 仅初始化一次', async () => {
  const { svc, fileSystem } = makeFakeApp();

  await svc.saveTestCase({ name: 'A', fileName: 'test_a' });
  await svc.saveTestCase({ name: 'B', fileName: 'test_b' });
  await svc.saveTestCase({ name: 'C', fileName: 'test_c' });

  assert.strictEqual(fileSystem.calls.ensureDir.length, 1, '3 次 saveTestCase 仅 ensureDir 1 次');
});

test('listTestCases 调 fileSystem.readdir + 返字段映射 + hasPyFile 探测', async () => {
  const testCasesDir = '/fake/config/test_cases';
  const jsonPath = path.join(testCasesDir, 'test_demo.json');
  const testCase = {
    id: 'tc_1',
    name: 'Demo',
    fileName: 'test_demo',
    description: 'desc',
    targetApp: { name: 'App1' },
    steps: [{}, {}],
    created: '2026-01-01T00:00:00Z',
    updated: '2026-01-02T00:00:00Z',
    pyFilePath: '/fake/output/test_demo.py'
  };

  const { svc, fileSystem } = makeFakeApp({
    fileSystem: {
      files: {
        [jsonPath]: JSON.stringify(testCase),
        '/fake/output/test_demo.py': '# python code'
      },
      dirs: { [testCasesDir]: ['test_demo.json'] }
    }
  });

  const result = await svc.listTestCases();

  assert.strictEqual(result.success, true);
  assert.strictEqual(fileSystem.calls.readdir.length >= 1, true, 'listTestCases 调 readdir');
  assert.strictEqual(result.data.length, 1);
  const item = result.data[0];
  assert.strictEqual(item.id, 'tc_1');
  assert.strictEqual(item.name, 'Demo');
  assert.strictEqual(item.fileName, 'test_demo');
  assert.strictEqual(item.description, 'desc');
  assert.strictEqual(item.targetApp, 'App1');
  assert.strictEqual(item.stepCount, 2);
  assert.strictEqual(item.hasPyFile, true, 'hasPyFile 探测到 .py 存在');
  assert.strictEqual(item.pyFilePath, '/fake/output/test_demo.py');
});

test('getTestCase ENOENT 返 "测试用例不存在"', async () => {
  const { svc } = makeFakeApp();

  const result = await svc.getTestCase('missing');

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.error, '测试用例不存在');
});

// P1-3: 路径穿越清洗
test('P1-3 getTestCase 穿越文件名被清洗为 test_cases 内路径 (不读目录外文件)', async () => {
  const { svc, fileSystem } = makeFakeApp();
  const evilName = path.join('..', '..', 'config', 'config.json');

  const result = await svc.getTestCase(evilName);

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.error, '测试用例不存在');  // test_cases/config.json 不存在
  // 读的必须是 test_cases 目录内 (basename 后), 而非原穿越路径
  const readPath = fileSystem.calls.readFile[fileSystem.calls.readFile.length - 1];
  assert.ok(path.normalize(readPath).startsWith(path.normalize(svc.testCasesDir)),
    `readFile 应在 testCasesDir 内, 实际: ${readPath}`);
  assert.ok(!readPath.includes('config.json') || path.basename(readPath) === 'config.json');
});

test('P1-3 getTestCase 含非法字符文件名拒绝 (invalid_file_name)', async () => {
  const { svc, fileSystem } = makeFakeApp();

  const result = await svc.getTestCase('test" & calc.json');

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.error, 'invalid_file_name');
  assert.strictEqual(fileSystem.calls.readFile.length, 0, '非法名不触发 readFile');
});

test('P1-3 getTestCase 非字符串拒绝', async () => {
  const { svc } = makeFakeApp();
  assert.strictEqual((await svc.getTestCase(null)).error, 'invalid_file_name');
  assert.strictEqual((await svc.getTestCase(undefined)).error, 'invalid_file_name');
  assert.strictEqual((await svc.getTestCase('')).error, 'invalid_file_name');
});

test('P1-3 deleteTestCase 目录外 pyFilePath 拒绝删除', async () => {
  const { svc, fileSystem } = makeFakeApp({
    fileSystem: {
      files: {
        [path.join('/fake/config/test_cases', 'test_demo.json')]: JSON.stringify({
          id: 'tc_1', fileName: 'test_demo'
        })
      }
    }
  });
  const victimPath = path.join('/fake', 'victim.json');

  const result = await svc.deleteTestCase({
    fileName: 'test_demo',
    pyFilePath: victimPath
  });

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.error, 'invalid_py_path');
  // 受害路径从未被 unlink
  assert.ok(!fileSystem.calls.unlink.includes(victimPath), '目录外文件不得被删除');
  assert.ok(fileSystem.calls.unlink.includes(path.join('/fake/config/test_cases', 'test_demo.json')),
    'json 本身仍被删 (删除动作继续)');
});

test('P1-3 deleteTestCase 穿越 fileName 被收拢到 test_cases 内 (无法越界)', async () => {
  const { svc, fileSystem } = makeFakeApp();
  const result = await svc.deleteTestCase(path.join('..', '..', 'config', 'config.json'));
  // basename 清洗为 config.json → test_cases/config.json 不存在 → 业务错误, 非 invalid_file_name
  assert.strictEqual(result.success, false);
  assert.strictEqual(fileSystem.calls.unlink.length, 0, '无任何删除');
});

test('P1-3 deleteTestCase 含非法字符 fileName 拒绝', async () => {
  const { svc } = makeFakeApp();
  const result = await svc.deleteTestCase('test" & calc');
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.error, 'invalid_file_name');
});

test('P1-3 checkJsonExists 穿越文件名返回 false', async () => {
  const { svc } = makeFakeApp();
  const exists = await svc.checkJsonExists(path.join('..', '..', 'config', 'config.json'));
  assert.strictEqual(exists, false);
});

test('saveTestCase 调 idGenerator + fileNameSanitizer + fileSystem.writeJson (P2: 原子写)', async () => {
  const { svc, fileSystem, idGeneratorCalls, fileNameSanitizerCalls } = makeFakeApp();

  const result = await svc.saveTestCase({ name: 'Test', fileName: 'demo' });

  assert.strictEqual(result.success, true);
  assert.strictEqual(idGeneratorCalls.generate, 1, 'idGenerator 调 1 次');
  assert.strictEqual(fileNameSanitizerCalls.sanitize.length, 1, 'fileNameSanitizer 调 1 次');
  // P2: 改用 writeJson 原子写 (替代 writeFile), 防并发写产生半截 JSON 文件
  assert.strictEqual(fileSystem.calls.writeJson.length, 1, 'writeJson 调 1 次 (P2 原子写)');
  assert.strictEqual(fileSystem.calls.writeFile.length, 0, 'writeFile 不再调 (P2 改 writeJson)');
  assert.strictEqual(result.data.id, 'tc_fixed_001', 'ID 从 idGenerator 来');
  assert.strictEqual(result.data.fileName, 'test_demo', 'fileName 从 sanitizer 来 (加 test_ 前缀)');
  assert.ok(result.path, '返 path');
});

// P2: saveTestCase 不 mutation 入参 (副本写入)
test('P2: saveTestCase 不 mutation 入参 caseData (原对象保持不变)', async () => {
  const { svc } = makeFakeApp();
  const originalCase = { name: 'Test', fileName: 'demo' };
  const originalSnapshot = { ...originalCase };

  const result = await svc.saveTestCase(originalCase);

  assert.strictEqual(result.success, true, '保存成功');
  assert.strictEqual(originalCase.id, undefined, '原 caseData 不被设 id');
  assert.strictEqual(originalCase.updated, undefined, '原 caseData 不被设 updated');
  assert.strictEqual(originalCase.created, undefined, '原 caseData 不被设 created');
  assert.strictEqual(originalCase.fileName, 'demo', '原 caseData fileName 不被 sanitizer 覆盖');
  assert.deepStrictEqual(originalCase, originalSnapshot, '原 caseData 完全不变');
  assert.strictEqual(result.data.id, 'tc_fixed_001', 'result.data 含 id (副本)');
  assert.strictEqual(result.data.fileName, 'test_demo', 'result.data fileName 从 sanitizer 来 (副本)');
});

test('saveTestCase pyOutputDir 存在时内化条件生成 (调 codeGenerator.generatePythonFile)', async () => {
  const { svc, codeGenerator } = makeFakeApp();

  const result = await svc.saveTestCase({
    name: 'Test',
    fileName: 'demo',
    pyOutputDir: '/fake/output'
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(codeGenerator.calls.generatePythonFile.length, 1, 'codeGenerator 调 1 次');
  assert.strictEqual(codeGenerator.calls.generatePythonFile[0].outputDir, '/fake/output');
  assert.strictEqual(result.pyPath, '/fake/output/test.py', '返 pyPath');
});

test('saveAndGenerate 强制生成 + 返 {jsonPath, pyPath}', async () => {
  const { svc, codeGenerator } = makeFakeApp();

  const result = await svc.saveAndGenerate({ name: 'Test', fileName: 'demo' }, '/fake/output');

  assert.strictEqual(result.success, true);
  assert.strictEqual(codeGenerator.calls.generatePythonFile.length, 1, 'codeGenerator 仅调 1 次 (不重复)');
  assert.strictEqual(codeGenerator.calls.generatePythonFile[0].outputDir, '/fake/output');
  assert.ok(result.jsonPath, '返 jsonPath');
  assert.strictEqual(result.pyPath, '/fake/output/test.py', '返 pyPath');
  assert.strictEqual(result.data.pyOutputDir, '/fake/output', 'data 含 pyOutputDir');
});

test('A2: saveAndGenerate 不 mutation 入参 caseData (原对象保持不变)', async () => {
  const { svc } = makeFakeApp();
  const originalCase = { name: 'Test', fileName: 'demo' };
  const originalSnapshot = { ...originalCase };

  const result = await svc.saveAndGenerate(originalCase, '/fake/output');

  assert.strictEqual(result.success, true, '保存成功');
  assert.strictEqual(originalCase.pyOutputDir, undefined, '原 caseData 不被设 pyOutputDir');
  assert.strictEqual(originalCase.pyFilePath, undefined, '原 caseData 不被设 pyFilePath');
  assert.strictEqual(originalCase.id, undefined, '原 caseData 不被设 id');
  assert.strictEqual(originalCase.updated, undefined, '原 caseData 不被设 updated');
  assert.deepStrictEqual(originalCase, originalSnapshot, '原 caseData 完全不变');
  assert.strictEqual(result.data.pyOutputDir, '/fake/output', 'result.data 含 pyOutputDir (副本)');
});

test('deleteTestCase 字符串参数 + 删 json + 删 py', async () => {
  const testCasesDir = '/fake/config/test_cases';
  const jsonPath = path.join(testCasesDir, 'test_demo.json');
  // P1-3: py 输出在 userConfigPath 根 (android-connection 传 currentPath), 属合法范围
  const pyPath = '/fake/config/test_demo.py';
  const testCase = { id: 'tc_1', fileName: 'test_demo', pyFilePath: pyPath };

  const { svc, fileSystem } = makeFakeApp({
    fileSystem: {
      files: {
        [jsonPath]: JSON.stringify(testCase),
        [pyPath]: '# python'
      },
      dirs: {}
    }
  });

  const result = await svc.deleteTestCase('test_demo');

  assert.strictEqual(result.success, true);
  assert.ok(fileSystem.calls.unlink.includes(jsonPath), '删 json');
  assert.ok(fileSystem.calls.unlink.includes(pyPath), '删 py');
});

test('deleteTestCase 对象参数 {fileName, pyFilePath}', async () => {
  const testCasesDir = '/fake/config/test_cases';
  const jsonPath = path.join(testCasesDir, 'test_obj.json');
  // P1-3: py 输出在 userConfigPath 根, 属合法范围
  const pyPath = '/fake/config/test_obj.py';

  const { svc, fileSystem } = makeFakeApp({
    fileSystem: {
      files: { [jsonPath]: JSON.stringify({ id: 'tc_2', fileName: 'test_obj' }) },
      dirs: {}
    }
  });

  const result = await svc.deleteTestCase({ fileName: 'test_obj', pyFilePath: pyPath });

  assert.strictEqual(result.success, true);
  assert.ok(fileSystem.calls.unlink.includes(jsonPath), '删 json');
  assert.ok(fileSystem.calls.unlink.includes(pyPath), '删 py (从参数来)');
});

test('checkJsonExists + batchCheckJsonExists', async () => {
  const testCasesDir = '/fake/config/test_cases';
  const existentPath = path.join(testCasesDir, 'test_exist.json');

  const { svc } = makeFakeApp({
    fileSystem: {
      files: { [existentPath]: '{}' },
      dirs: {}
    }
  });

  const exists1 = await svc.checkJsonExists('test_exist');
  assert.strictEqual(exists1, true, '存在文件返 true');

  const exists2 = await svc.checkJsonExists('missing');
  assert.strictEqual(exists2, false, '不存在文件返 false');

  const batch = await svc.batchCheckJsonExists(['test_exist', 'missing']);
  assert.strictEqual(batch['test_exist'], true);
  assert.strictEqual(batch['missing'], false);
});

test('cleanupOrphanedFiles 清理孤立 json + 探测 orphaned py', async () => {
  const testCasesDir = '/fake/config/test_cases';
  const outputDir = '/fake/output';

  // 正常 json + 对应 .py 存在
  const validJsonPath = path.join(testCasesDir, 'test_valid.json');
  const validPyPath = path.join(outputDir, 'test_valid.py');
  const validCase = { id: 'tc_1', fileName: 'test_valid', pyOutputDir: outputDir, pyFilePath: validPyPath };

  // 孤立 json (对应 .py 丢失)
  const orphanJsonPath = path.join(testCasesDir, 'test_orphan.json');
  const orphanCase = { id: 'tc_2', fileName: 'test_orphan', pyOutputDir: outputDir, pyFilePath: '/fake/output/test_orphan.py' };

  // 孤立 .py (无对应 json)
  const orphanedPyPath = path.join(outputDir, 'test_nojson.py');

  const { svc } = makeFakeApp({
    fileSystem: {
      files: {
        [validJsonPath]: JSON.stringify(validCase),
        [validPyPath]: '# valid py',
        [orphanJsonPath]: JSON.stringify(orphanCase),
        [orphanedPyPath]: '# orphan py'
      },
      dirs: {
        [testCasesDir]: ['test_valid.json', 'test_orphan.json'],
        [outputDir]: ['test_valid.py', 'test_nojson.py']
      }
    }
  });

  const results = await svc.cleanupOrphanedFiles();

  assert.ok(results.cleanedJson.includes('test_orphan.json'), '清理孤立 json (对应 .py 丢失)');
  assert.ok(results.orphanedPy.some(o => o.fileName === 'test_nojson'), '探测到 orphaned py');
});
