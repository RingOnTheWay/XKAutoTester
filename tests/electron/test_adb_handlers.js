// adbHandlers.js 单元测试 — R25 补 R24 遗留测试缺口
// 覆盖 INSTALL_APK: 注册 / adbService 未初始化 / apkPath 校验 / deviceId 校验 /
// 正常安装转发 (apkInstaller.install 三参含 event.sender)
// 注: harness 的 createServiceContainer 不支持 null/嵌套对象, 此处手动 register + IpcFake。

const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { IpcFake } = require('./helpers/ipcFake');

const HANDLER_PATH = path.resolve(__dirname, '../../electron/src/main/handlers/adbHandlers.js');

function makeIpc(services) {
  const ipc = new IpcFake();
  const handlerModule = require(HANDLER_PATH);
  handlerModule.register(ipc, services);
  return ipc;
}

describe('adbHandlers INSTALL_APK', () => {
  test('register 注册 install-apk channel', () => {
    const ipc = makeIpc({
      adbService: { apkInstaller: { install: async () => ({ success: true }) } },
      i18nService: {},
    });

    assert.ok(ipc.handlers.has('install-apk'), 'install-apk channel 应注册');
  });

  test('adbService 未初始化 → 错误', async () => {
    const ipc = makeIpc({ adbService: undefined, i18nService: {} });

    const result = await ipc.invoke('install-apk', { apkPath: '/a.apk', deviceId: 'dev1' });

    assert.strictEqual(result.success, false);
    assert.ok(result.error, '应返回错误信息');
  });

  test('非法 apkPath → 错误, 不调 install', async () => {
    const installCalls = [];
    const ipc = makeIpc({
      adbService: {
        apkInstaller: {
          install: async (apkPath, deviceId, sender) => {
            installCalls.push([apkPath, deviceId, sender]);
            return { success: true };
          },
        },
      },
      i18nService: {},
    });

    const r1 = await ipc.invoke('install-apk', { apkPath: '', deviceId: 'dev1' });
    assert.strictEqual(r1.success, false, '空 apkPath 拒绝');
    const r2 = await ipc.invoke('install-apk', { apkPath: 123, deviceId: 'dev1' });
    assert.strictEqual(r2.success, false, '非字符串 apkPath 拒绝');
    const r3 = await ipc.invoke('install-apk', null);
    assert.strictEqual(r3.success, false, 'null data 拒绝');
    const r4 = await ipc.invoke('install-apk', { deviceId: 'dev1' });
    assert.strictEqual(r4.success, false, '缺 apkPath 拒绝');
    assert.strictEqual(installCalls.length, 0, '非法输入不调 install');
  });

  test('非法 deviceId → 错误, 不调 install', async () => {
    const installCalls = [];
    const ipc = makeIpc({
      adbService: {
        apkInstaller: {
          install: async (...args) => {
            installCalls.push(args);
            return { success: true };
          },
        },
      },
      i18nService: {},
    });

    const r = await ipc.invoke('install-apk', { apkPath: '/a.apk', deviceId: '' });

    assert.strictEqual(r.success, false, '空 deviceId 拒绝');
    assert.strictEqual(installCalls.length, 0, '非法 deviceId 不调 install');
  });

  test('正常安装: 转发 install(apkPath, deviceId, event.sender)', async () => {
    const installCalls = [];
    const ipc = makeIpc({
      adbService: {
        apkInstaller: {
          install: async (apkPath, deviceId, sender) => {
            installCalls.push([apkPath, deviceId, sender]);
            return { success: true };
          },
        },
      },
      i18nService: {},
    });

    const result = await ipc.invoke('install-apk', { apkPath: '/path/app.apk', deviceId: 'dev1' });

    assert.strictEqual(result.success, true);
    assert.strictEqual(installCalls.length, 1);
    assert.strictEqual(installCalls[0][0], '/path/app.apk', 'apkPath 透传');
    assert.strictEqual(installCalls[0][1], 'dev1', 'deviceId 透传');
    assert.ok(installCalls[0][2] && typeof installCalls[0][2].send === 'function', '第三参为 event.sender');
  });
});
