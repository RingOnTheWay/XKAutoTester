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
  if (isPackaged) {
    return path.join(process.resourcesPath, 'app', 'src', 'preload', 'index.js');
  } else {
    return path.join(mainDir, '..', 'preload', 'index.js');
  }
}

function getAssetsPath(isPackaged, mainDir) {
  if (isPackaged) {
    return path.join(process.resourcesPath, 'app', 'assets');
  } else {
    return path.join(mainDir, '..', '..', 'assets');
  }
}

function getRendererPath(isPackaged, mainDir) {
  if (isPackaged) {
    return path.join(process.resourcesPath, 'app', 'renderer');
  } else {
    return path.join(mainDir, '..', '..', 'renderer');
  }
}

function getSplashPath(isPackaged, mainDir) {
  if (isPackaged) {
    return path.join(process.resourcesPath, 'app', 'splash.html');
  } else {
    return path.join(mainDir, '..', '..', 'splash.html');
  }
}

function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

module.exports = {
  getProjectRoot,
  getPreloadPath,
  getAssetsPath,
  getRendererPath,
  getSplashPath,
  ensureDirectoryExists
};
