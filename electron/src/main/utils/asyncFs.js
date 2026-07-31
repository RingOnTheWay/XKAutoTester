const fs = require('fs').promises;

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

async function writeJson(path, data, spaces = 2) {
  await fs.writeFile(path, JSON.stringify(data, null, spaces), 'utf8');
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
  readConfigIfExists
};
