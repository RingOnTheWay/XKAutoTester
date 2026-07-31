const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const Module = require('module');

const projectRoot = path.join(__dirname, '..', '..');

// stub electron minimal
const fakeElectron = {
  app: { getPath: () => '/tmp/fake-app-data', isPackaged: false },
  process: { resourcesPath: '' }
};
const savedElectron = process.versions.electron;
require.cache.electron = { exports: fakeElectron };

const pathHelper = require(path.join(projectRoot, 'electron', 'src', 'main', 'utils', 'pathHelper'));

test('getAapt2Path returns aapt2.exe when local file exists', () => {
  pathHelper.clearAapt2PathCache();
  const fakeRoot = '/fake-root-1';
  const originalExists = fs.existsSync;
  fs.existsSync = (p) => {
    if (p === path.join(fakeRoot, 'env', 'android-sdk', 'build-tools', 'aapt2.exe')) return true;
    return false;
  };
  try {
    const result = pathHelper.getAapt2Path(fakeRoot, false);
    assert.strictEqual(result, path.join(fakeRoot, 'env', 'android-sdk', 'build-tools', 'aapt2.exe'));
  } finally {
    fs.existsSync = originalExists;
    pathHelper.clearAapt2PathCache();
  }
});

test('getAapt2Path falls back to second path when first missing', () => {
  pathHelper.clearAapt2PathCache();
  const fakeRoot = '/fake-root-2';
  const originalExists = fs.existsSync;
  fs.existsSync = (p) => {
    if (p === path.join(fakeRoot, 'env', 'android-tools', 'aapt2.exe')) return true;
    return false;
  };
  try {
    const result = pathHelper.getAapt2Path(fakeRoot, false);
    assert.strictEqual(result, path.join(fakeRoot, 'env', 'android-tools', 'aapt2.exe'));
  } finally {
    fs.existsSync = originalExists;
    pathHelper.clearAapt2PathCache();
  }
});

test('getAapt2Path returns "aapt2" when no local file exists', () => {
  pathHelper.clearAapt2PathCache();
  const fakeRoot = '/fake-root-3';
  const originalExists = fs.existsSync;
  fs.existsSync = () => false;
  try {
    const result = pathHelper.getAapt2Path(fakeRoot, false);
    assert.strictEqual(result, 'aapt2');
  } finally {
    fs.existsSync = originalExists;
    pathHelper.clearAapt2PathCache();
  }
});

test('getAapt2Path caches result when useCache=true', () => {
  pathHelper.clearAapt2PathCache();
  const fakeRoot = '/fake-root-4';
  let callCount = 0;
  const originalExists = fs.existsSync;
  fs.existsSync = (p) => {
    callCount++;
    if (p === path.join(fakeRoot, 'env', 'android-sdk', 'build-tools', 'aapt2.exe')) return true;
    return false;
  };
  try {
    pathHelper.getAapt2Path(fakeRoot, true);
    const firstCount = callCount;
    pathHelper.getAapt2Path(fakeRoot, true);
    assert.strictEqual(callCount, firstCount, 'fs.existsSync should not be called again on cache hit');
  } finally {
    fs.existsSync = originalExists;
    pathHelper.clearAapt2PathCache();
  }
});

test('clearAapt2PathCache forces re-resolution', () => {
  pathHelper.clearAapt2PathCache();
  const fakeRoot = '/fake-root-5';
  let callCount = 0;
  const originalExists = fs.existsSync;
  fs.existsSync = (p) => {
    callCount++;
    if (p === path.join(fakeRoot, 'env', 'android-sdk', 'build-tools', 'aapt2.exe')) return true;
    return false;
  };
  try {
    pathHelper.getAapt2Path(fakeRoot, true);
    const firstCount = callCount;
    pathHelper.clearAapt2PathCache();
    pathHelper.getAapt2Path(fakeRoot, true);
    assert.ok(callCount > firstCount, 'fs.existsSync should be called again after cache clear');
  } finally {
    fs.existsSync = originalExists;
    pathHelper.clearAapt2PathCache();
  }
});

test('useCache=false bypasses cache', () => {
  pathHelper.clearAapt2PathCache();
  const fakeRoot = '/fake-root-6';
  let callCount = 0;
  const originalExists = fs.existsSync;
  fs.existsSync = (p) => {
    callCount++;
    if (p === path.join(fakeRoot, 'env', 'android-sdk', 'build-tools', 'aapt2.exe')) return true;
    return false;
  };
  try {
    pathHelper.getAapt2Path(fakeRoot, false);
    const firstCount = callCount;
    pathHelper.getAapt2Path(fakeRoot, false);
    assert.ok(callCount > firstCount, 'fs.existsSync should be called again when useCache=false');
  } finally {
    fs.existsSync = originalExists;
    pathHelper.clearAapt2PathCache();
  }
});

test('getAapt2Path and clearAapt2PathCache are exported', () => {
  assert.strictEqual(typeof pathHelper.getAapt2Path, 'function');
  assert.strictEqual(typeof pathHelper.clearAapt2PathCache, 'function');
});

test('ApkParserService delegates aapt2 resolution to pathHelper', () => {
  const ApkParserService = require(path.join(projectRoot, 'electron', 'src', 'main', 'services', 'ApkParserService'));
  const service = new ApkParserService(projectRoot);
  assert.strictEqual(service.aapt2Path, null);
  // initialize delegates to pathHelper.getAapt2Path
  return service.initialize().then(() => {
    assert.ok(service.aapt2Path, 'aapt2Path should be set after initialize');
  });
});

test('EnvironmentService.getAapt2Path delegates to pathHelper', () => {
  const { EnvironmentService } = require(path.join(projectRoot, 'electron', 'src', 'main', 'services', 'EnvironmentService'));
  const service = new EnvironmentService({ t: (k) => k }, projectRoot);
  pathHelper.clearAapt2PathCache();
  const result = service.getAapt2Path();
  assert.ok(result, 'getAapt2Path should return a non-empty string');
});

test('ADBService no longer has getAdbPath wrapper method', () => {
  const ADBService = require(path.join(projectRoot, 'electron', 'src', 'main', 'services', 'ADBService'));
  const service = new ADBService(projectRoot, { t: (k) => k });
  assert.strictEqual(typeof service.getAdbPath, 'undefined', 'ADBService.getAdbPath should be removed');
});

test('EnvironmentService no longer has getAdbPath wrapper method', () => {
  const { EnvironmentService } = require(path.join(projectRoot, 'electron', 'src', 'main', 'services', 'EnvironmentService'));
  const service = new EnvironmentService({ t: (k) => k }, projectRoot);
  assert.strictEqual(typeof service.getAdbPath, 'undefined', 'EnvironmentService.getAdbPath should be removed');
});

test('No duplicate aapt2 possiblePaths in service files', () => {
  const apkParserSource = fs.readFileSync(
    path.join(projectRoot, 'electron', 'src', 'main', 'services', 'ApkParserService.js'),
    'utf8'
  );
  const envServiceSource = fs.readFileSync(
    path.join(projectRoot, 'electron', 'src', 'main', 'services', 'EnvironmentService.js'),
    'utf8'
  );
  // Services should not contain inline possiblePaths for aapt2
  assert.ok(!apkParserSource.includes('android-sdk\', \'build-tools\', \'aapt2'), 'ApkParserService should not have inline aapt2 path');
  assert.ok(!envServiceSource.includes('android-sdk\', \'build-tools\', \'aapt2'), 'EnvironmentService should not have inline aapt2 path');
});

test('No this.getAdbPath() calls in ADBService and EnvironmentService', () => {
  const adbServiceSource = fs.readFileSync(
    path.join(projectRoot, 'electron', 'src', 'main', 'services', 'ADBService.js'),
    'utf8'
  );
  const envServiceSource = fs.readFileSync(
    path.join(projectRoot, 'electron', 'src', 'main', 'services', 'EnvironmentService.js'),
    'utf8'
  );
  assert.ok(!/this\.getAdbPath\(\)/.test(adbServiceSource), 'ADBService should not call this.getAdbPath()');
  assert.ok(!/this\.getAdbPath\(\)/.test(envServiceSource), 'EnvironmentService should not call this.getAdbPath()');
});
