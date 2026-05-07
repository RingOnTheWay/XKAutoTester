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
  getAdbPath,
  clearAdbPathCache,
  getEmbeddedPythonPath,
  getVenvPythonPath,
  getPythonConfig,
  setPythonConfig,
  getVenvSitePackagesPath,
  fixPyvenvCfg
};
