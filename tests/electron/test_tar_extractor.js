// TarExtractor 单元测试
// 验证: 1) 普通文件 extract 2) 多文件 3) 目录 entry 4) 文件名特殊字符替换
//      5) 空文件 6) 嵌套目录 7) 大文件 (跨 block) 8) 不存在 tarPath 抛异常
// 策略: 手动构造 tar buffer (无外部依赖) + tmp_path 隔离
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const fsp = require('fs').promises;
const os = require('os');

const TarExtractor = require(path.join(
  __dirname, '..', '..', 'electron', 'src', 'main', 'services', 'TarExtractor.js'
));

// ── tar buffer 构造工具 ──────────────────────────────────────

const BLOCK_SIZE = 512;

/**
 * 构造 tar header buffer
 * @param {string} name - 文件名
 * @param {number} size - 文件大小 (字节)
 * @param {string} typeFlag - '0' 文件 / '5' 目录
 * @returns {Buffer} 512 字节 header
 */
function buildTarHeader(name, size, typeFlag = '0') {
  const header = Buffer.alloc(BLOCK_SIZE, 0);

  // name (0-99)
  header.write(name.slice(0, 100), 0, 'utf8');

  // mode (100-107) - 0644 文件 / 0755 目录
  header.write('0000644\0', 100, 'utf8');

  // uid (108-115)
  header.write('0001000\0', 108, 'utf8');

  // gid (116-123)
  header.write('0001000\0', 116, 'utf8');

  // size (124-135) - octal, 11 位 + null
  const sizeOctal = size.toString(8).padStart(11, '0') + '\0';
  header.write(sizeOctal, 124, 'utf8');

  // mtime (136-147)
  header.write('00000000000\0', 136, 'utf8');

  // checksum 占位 (148-155) - 先填空格
  header.write('        ', 148, 'utf8');

  // type flag (156)
  header.write(typeFlag, 156, 'utf8');

  // 计算校验和: header 所有字节之和, checksum 字段视为空格 (0x20)
  let checksum = 0;
  for (let i = 0; i < BLOCK_SIZE; i++) {
    checksum += header[i];
  }
  // 写入 checksum (148-155, 6 位 octal + null + 空格)
  const checksumStr = checksum.toString(8).padStart(6, '0') + '\0 ';
  header.write(checksumStr, 148, 'utf8');

  return header;
}

/**
 * 构造完整 tar buffer (header + 数据 + 填充至 512 倍数)
 */
function buildTarEntry(name, content, typeFlag = '0') {
  const header = buildTarHeader(name, typeFlag === '5' ? 0 : content.length, typeFlag);
  if (typeFlag === '5') {
    return header;
  }
  const data = Buffer.from(content);
  const paddingSize = (BLOCK_SIZE - (data.length % BLOCK_SIZE)) % BLOCK_SIZE;
  const padding = Buffer.alloc(paddingSize, 0);
  return Buffer.concat([header, data, padding]);
}

/**
 * 构造 tar 文件并写入临时路径
 */
async function writeTarFile(tarPath, entries) {
  const buffers = entries.map(e => buildTarEntry(e.name, e.content || '', e.type || '0'));
  // tar 结束: 两个全零 block
  buffers.push(Buffer.alloc(BLOCK_SIZE * 2, 0));
  await fsp.writeFile(tarPath, Buffer.concat(buffers));
}

// ── tmp_path 工具 ─────────────────────────────────────────

async function makeTmpDir(prefix = 'xkat-tar-test-') {
  return await fsp.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function dirExists(p) {
  try {
    const stat = await fsp.stat(p);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(p) {
  try {
    const stat = await fsp.stat(p);
    return stat.isFile();
  } catch {
    return false;
  }
}


// ─── extract 基本场景 ────────────────────────────────────────

test('extract 单个普通文件 → 返回路径列表 + 写入文件', async () => {
  const tmpDir = await makeTmpDir();
  const tarPath = path.join(tmpDir, 'test.tar');
  const outputDir = path.join(tmpDir, 'output');
  try {
    await writeTarFile(tarPath, [{ name: 'hello.txt', content: 'hello world' }]);
    const extractor = new TarExtractor();

    const files = await extractor.extract(tarPath, outputDir);

    assert.strictEqual(files.length, 1);
    assert.ok(files[0].endsWith('hello.txt'));
    const content = await fsp.readFile(files[0], 'utf8');
    assert.strictEqual(content, 'hello world');
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }
});

test('extract 多个文件 → 全部写入 + 返回全部路径', async () => {
  const tmpDir = await makeTmpDir();
  const tarPath = path.join(tmpDir, 'multi.tar');
  const outputDir = path.join(tmpDir, 'output');
  try {
    await writeTarFile(tarPath, [
      { name: 'a.txt', content: 'aaa' },
      { name: 'b.txt', content: 'bbb' },
      { name: 'c.txt', content: 'ccc' },
    ]);
    const extractor = new TarExtractor();

    const files = await extractor.extract(tarPath, outputDir);

    assert.strictEqual(files.length, 3);
    for (const f of files) {
      assert.ok(await fileExists(f));
    }
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }
});

test('extract 空文件 → 写入 0 字节文件', async () => {
  const tmpDir = await makeTmpDir();
  const tarPath = path.join(tmpDir, 'empty.tar');
  const outputDir = path.join(tmpDir, 'output');
  try {
    await writeTarFile(tarPath, [{ name: 'empty.txt', content: '' }]);
    const extractor = new TarExtractor();

    const files = await extractor.extract(tarPath, outputDir);

    assert.strictEqual(files.length, 1);
    const stat = await fsp.stat(files[0]);
    assert.strictEqual(stat.size, 0);
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }
});

test('extract 大文件 (>512 字节, 跨 block) → 完整写入', async () => {
  const tmpDir = await makeTmpDir();
  const tarPath = path.join(tmpDir, 'big.tar');
  const outputDir = path.join(tmpDir, 'output');
  try {
    const bigContent = 'x'.repeat(1500);  // 跨 3 个 block
    await writeTarFile(tarPath, [{ name: 'big.txt', content: bigContent }]);
    const extractor = new TarExtractor();

    const files = await extractor.extract(tarPath, outputDir);

    assert.strictEqual(files.length, 1);
    const content = await fsp.readFile(files[0], 'utf8');
    assert.strictEqual(content.length, 1500);
    assert.ok(content === bigContent);
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }
});


// ─── 目录场景 ─────────────────────────────────────────────

test('extract 目录 entry → 创建目录, 不出现在文件列表', async () => {
  const tmpDir = await makeTmpDir();
  const tarPath = path.join(tmpDir, 'dir.tar');
  const outputDir = path.join(tmpDir, 'output');
  try {
    await writeTarFile(tarPath, [
      { name: 'mydir/', content: '', type: '5' },
      { name: 'mydir/file.txt', content: 'inside' },
    ]);
    const extractor = new TarExtractor();

    const files = await extractor.extract(tarPath, outputDir);

    // 仅返回文件路径, 不含目录
    assert.strictEqual(files.length, 1);
    assert.ok(files[0].endsWith(path.join('mydir', 'file.txt')));
    // 目录应被创建
    assert.ok(await dirExists(path.join(outputDir, 'mydir')));
    const content = await fsp.readFile(files[0], 'utf8');
    assert.strictEqual(content, 'inside');
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }
});

test('extract 嵌套目录 → 自动创建父目录', async () => {
  const tmpDir = await makeTmpDir();
  const tarPath = path.join(tmpDir, 'nested.tar');
  const outputDir = path.join(tmpDir, 'output');
  try {
    await writeTarFile(tarPath, [
      { name: 'a/b/c/file.txt', content: 'deep' },
    ]);
    const extractor = new TarExtractor();

    const files = await extractor.extract(tarPath, outputDir);

    assert.strictEqual(files.length, 1);
    assert.ok(await fileExists(path.join(outputDir, 'a', 'b', 'c', 'file.txt')));
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }
});


// ─── 边界场景 ─────────────────────────────────────────────

test('extract 文件名含特殊字符 → 替换为下划线', async () => {
  const tmpDir = await makeTmpDir();
  const tarPath = path.join(tmpDir, 'special.tar');
  const outputDir = path.join(tmpDir, 'output');
  try {
    // <>:"|?* 应被替换为 _
    await writeTarFile(tarPath, [
      { name: 'a<b.txt', content: 'special' },
    ]);
    const extractor = new TarExtractor();

    const files = await extractor.extract(tarPath, outputDir);

    assert.strictEqual(files.length, 1);
    assert.ok(files[0].endsWith('a_b.txt'));
    const content = await fsp.readFile(files[0], 'utf8');
    assert.strictEqual(content, 'special');
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }
});

test('extract 不存在的 tarPath → 抛 ENOENT', async () => {
  const tmpDir = await makeTmpDir();
  const outputDir = path.join(tmpDir, 'output');
  try {
    const extractor = new TarExtractor();

    await assert.rejects(
      () => extractor.extract(path.join(tmpDir, 'nonexistent.tar'), outputDir),
      /ENOENT/
    );
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }
});

test('extract 输出目录不存在 → 自动创建', async () => {
  const tmpDir = await makeTmpDir();
  const tarPath = path.join(tmpDir, 'test.tar');
  const outputDir = path.join(tmpDir, 'deeply', 'nested', 'output');
  try {
    await writeTarFile(tarPath, [{ name: 'hello.txt', content: 'hi' }]);
    const extractor = new TarExtractor();

    const files = await extractor.extract(tarPath, outputDir);

    assert.strictEqual(files.length, 1);
    assert.ok(await fileExists(files[0]));
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }
});

test('extract 空 tar (仅 2 个零 block) → 返回空数组', async () => {
  const tmpDir = await makeTmpDir();
  const tarPath = path.join(tmpDir, 'empty.tar');
  const outputDir = path.join(tmpDir, 'output');
  try {
    await fsp.writeFile(tarPath, Buffer.alloc(BLOCK_SIZE * 2, 0));
    const extractor = new TarExtractor();

    const files = await extractor.extract(tarPath, outputDir);

    assert.strictEqual(files.length, 0);
  } finally {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  }
});


// ─── _parseTarBuffer 单元测试 ──────────────────────────────

test('_parseTarBuffer 单文件 → 1 entry (非目录)', () => {
  const extractor = new TarExtractor();
  const buffer = Buffer.concat([
    buildTarEntry('test.txt', 'hello'),
    Buffer.alloc(BLOCK_SIZE * 2, 0),
  ]);

  const entries = extractor._parseTarBuffer(buffer);

  assert.strictEqual(entries.length, 1);
  assert.strictEqual(entries[0].name, 'test.txt');
  assert.strictEqual(entries[0].isDirectory, false);
  assert.strictEqual(entries[0].data.toString(), 'hello');
});

test('_parseTarBuffer 目录 entry → isDirectory=true, data=null', () => {
  const extractor = new TarExtractor();
  const buffer = Buffer.concat([
    buildTarEntry('mydir/', '', '5'),
    Buffer.alloc(BLOCK_SIZE * 2, 0),
  ]);

  const entries = extractor._parseTarBuffer(buffer);

  assert.strictEqual(entries.length, 1);
  assert.strictEqual(entries[0].name, 'mydir/');
  assert.strictEqual(entries[0].isDirectory, true);
  assert.strictEqual(entries[0].data, null);
});

test('_sanitizeFileName 替换 Windows 非法字符', () => {
  const extractor = new TarExtractor();
  // < > : " | ? * 共 7 个字符全替换为 _
  // 'a<b>c:"d|e?f*h.txt' → a_b_c__d_e_f_h.txt (c 后 2 个 _ 来自 : ")
  assert.strictEqual(extractor._sanitizeFileName('a<b>c:"d|e?f*h.txt'), 'a_b_c__d_e_f_h.txt');
  assert.strictEqual(extractor._sanitizeFileName('normal.txt'), 'normal.txt');
  assert.strictEqual(extractor._sanitizeFileName('a\x00b'), 'ab');
});
