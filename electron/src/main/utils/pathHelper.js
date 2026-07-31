const path = require('path');
const fs = require('fs');

function getProjectRoot(isPackaged, mainDir) {
  if (isPackaged) {
    return process.resourcesPath;
  } else {
    return path.join(mainDir, '..', '..', '..');
  }
}

function getPreloadPath(isPackaged, mainDir) {
  return path.join(mainDir, '..', 'preload', 'index.js');
}

function getAssetsPath(isPackaged, mainDir) {
  return path.join(mainDir, '..', '..', 'assets');
}

function getRendererPath(isPackaged, mainDir) {
  return path.join(mainDir, '..', '..', 'renderer');
}

function getSplashPath(isPackaged, mainDir) {
  return path.join(mainDir, '..', '..', 'splash.html');
}

function getDefaultConfigPath(isPackaged, mainDir) {
  if (isPackaged) {
    return path.join(process.resourcesPath, 'config');
  } else {
    return path.join(mainDir, '..', '..', '..', 'config');
  }
}

function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function getLogsPath(baseDir, ...subdirs) {
  return path.join(baseDir, 'logs', ...subdirs);
}

let adbPathCache = null;

function getAdbPath(projectRoot, useCache = true) {
  if (useCache && adbPathCache) {
    return adbPathCache;
  }

  const possiblePaths = [
    path.join(projectRoot, 'env', 'android-sdk', 'platform-tools', 'adb.exe'),
    path.join(projectRoot, 'env', 'scrcpy', 'adb.exe')
  ];

  for (const adbPath of possiblePaths) {
    if (fs.existsSync(adbPath)) {
      if (useCache) {
        adbPathCache = adbPath;
      }
      return adbPath;
    }
  }

  if (useCache) {
    adbPathCache = 'adb';
  }
  return 'adb';
}

function clearAdbPathCache() {
  adbPathCache = null;
}

let aapt2PathCache = null;

function getAapt2Path(projectRoot, useCache = true) {
  if (useCache && aapt2PathCache) {
    return aapt2PathCache;
  }

  const possiblePaths = [
    path.join(projectRoot, 'env', 'android-sdk', 'build-tools', 'aapt2.exe'),
    path.join(projectRoot, 'env', 'android-tools', 'aapt2.exe')
  ];

  for (const aapt2Path of possiblePaths) {
    if (fs.existsSync(aapt2Path)) {
      if (useCache) {
        aapt2PathCache = aapt2Path;
      }
      return aapt2Path;
    }
  }

  if (useCache) {
    aapt2PathCache = 'aapt2';
  }
  return 'aapt2';
}

function clearAapt2PathCache() {
  aapt2PathCache = null;
}

function getLocalesPath(projectRoot) {
  // 开发模式: projectRoot/electron/locales
  // 打包模式: projectRoot === process.resourcesPath，locales 在 asar 内 (app.asar/electron/locales)
  //          Node.js fs 能读 asar 内文件，但 Python 子进程读不到，将走 i18n.py 的 logger.warning 降级路径
  return path.join(projectRoot, 'electron', 'locales');
}

function getEmbeddedPythonPath(projectRoot) {
  const pythonExe = path.join(projectRoot, 'env', 'python', 'python.exe');
  if (fs.existsSync(pythonExe)) {
    return pythonExe;
  }
  return null;
}

function getVenvPythonPath(projectRoot) {
  const venvPython = path.resolve(projectRoot, '.venv', 'Scripts', 'python.exe');
  if (fs.existsSync(venvPython)) {
    return venvPython;
  }
  return null;
}

let pythonConfigCache = null;

function getPythonConfig() {
  return pythonConfigCache;
}

function setPythonConfig(config) {
  pythonConfigCache = config;
}

function getVenvSitePackagesPath(projectRoot) {
  return path.resolve(projectRoot, '.venv', 'Lib', 'site-packages');
}

function fixPyvenvCfg(projectRoot, homePath) {
  const pyvenvCfgPath = path.resolve(projectRoot, '.venv', 'pyvenv.cfg');
  if (!fs.existsSync(pyvenvCfgPath)) return false;

  try {
    let content = fs.readFileSync(pyvenvCfgPath, 'utf8');
    const homeLine = content.split('\n').find(line => line.trim().startsWith('home'));
    if (!homeLine) return false;

    const currentHome = homeLine.split('=')[1].trim();
    if (currentHome === homePath) return true;

    content = content.replace(/home\s*=\s*.*/, `home = ${homePath}`);
    fs.writeFileSync(pyvenvCfgPath, content, 'utf8');
    console.log(`[pathHelper] Fixed pyvenv.cfg home: ${homePath}`);
    return true;
  } catch (error) {
    console.error('[pathHelper] Failed to fix pyvenv.cfg:', error);
    return false;
  }
}

module.exports = {
  getProjectRoot,
  getPreloadPath,
  getAssetsPath,
  getRendererPath,
  getSplashPath,
  getDefaultConfigPath,
  ensureDirectoryExists,
  getTimestamp,
  getLogsPath,
  getAdbPath,
  clearAdbPathCache,
  getAapt2Path,
  clearAapt2PathCache,
  getLocalesPath,
  getEmbeddedPythonPath,
  getVenvPythonPath,
  getPythonConfig,
  setPythonConfig,
  getVenvSitePackagesPath,
  fixPyvenvCfg
};
