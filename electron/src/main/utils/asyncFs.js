const fs = require('fs').promises;
const pathLib = require('path');

// 简单互斥锁, 保护 read-modify-write 序列避免并发丢更新
class Mutex {
  constructor() {
    this._queue = [];
    this._locked = false;
  }
  async acquire() {
    if (!this._locked) {
      this._locked = true;
      return;
    }
    return new Promise((resolve) => {
      this._queue.push(resolve);
    });
  }
  release() {
    const next = this._queue.shift();
    if (next) {
      next();
    } else {
      this._locked = false;
    }
  }
  /** R24 P3-4: 锁空闲 (无持有者且无排队) — 供 withLock 完成后回收 Map 条目 */
  get idle() {
    return !this._locked && this._queue.length === 0;
  }
  async withLock(fn) {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

// per-path 锁注册表, 同路径的 read-modify-write 串行化
const _pathLocks = new Map();
function getLock(filePath) {
  const resolved = pathLib.resolve(filePath);
  if (!_pathLocks.has(resolved)) {
    _pathLocks.set(resolved, new Mutex());
  }
  return _pathLocks.get(resolved);
}

async function exists(path) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path) {
  const data = await fs.readFile(path, 'utf8');
  return JSON.parse(data);
}

// 原子写 - 先写临时文件再 rename, 防止并发写产生半截文件
// R24 P3-4: writeFile 抛错也清理 tmp (原 writeFile 在 try 外, 失败残留 .tmp 文件)
async function writeJson(path, data, spaces = 2) {
  const tmpPath = path + '.tmp.' + process.pid + '.' + Date.now();
  try {
    await fs.writeFile(tmpPath, JSON.stringify(data, null, spaces), 'utf8');
    await fs.rename(tmpPath, path);
  } catch (e) {
    // writeFile/rename 失败均清理临时文件
    try {
      await fs.unlink(tmpPath);
    } catch {
      /* ignore (tmp 未创建) */
    }
    throw e;
  }
}

async function ensureDir(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
}

async function readFile(path, encoding = 'utf8') {
  return fs.readFile(path, encoding);
}

async function writeFile(path, data, encoding = 'utf8') {
  return fs.writeFile(path, data, encoding);
}

async function unlink(path) {
  return fs.unlink(path);
}

async function rm(path, options = {}) {
  return fs.rm(path, { recursive: true, force: true, ...options });
}

async function stat(path) {
  return fs.stat(path);
}

async function readdir(path) {
  return fs.readdir(path);
}

async function mkdir(path, options = { recursive: true }) {
  return fs.mkdir(path, options);
}

async function appendFile(path, data, encoding = 'utf8') {
  return fs.appendFile(path, data, encoding);
}

async function readConfigIfExists(configPath) {
  try {
    if (await exists(configPath)) {
      return await readJson(configPath);
    }
  } catch (error) {
    console.error('读取配置文件失败:', error);
  }
  return null;
}

module.exports = {
  exists,
  readJson,
  writeJson,
  ensureDir,
  readFile,
  writeFile,
  unlink,
  rm,
  stat,
  readdir,
  mkdir,
  appendFile,
  readConfigIfExists,
  Mutex,
  getLock,
  withLock: async (filePath, fn) => {
    // R24 P3-4: 锁空闲即回收, 防 _pathLocks Map 无限增长 (运行期动态路径)
    const resolved = pathLib.resolve(filePath);
    let lock = _pathLocks.get(resolved);
    if (!lock) {
      lock = new Mutex();
      _pathLocks.set(resolved, lock);
    }
    try {
      return await lock.withLock(fn);
    } finally {
      if (lock.idle) _pathLocks.delete(resolved);
    }
  },
};
