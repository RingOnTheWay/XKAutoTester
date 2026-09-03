// deviceHandlers.js 单元测试 — R26 P1-1: 上传/下载 localPath 路径约束
// 覆盖 UPLOAD_FILE / DOWNLOAD_FILE: 非法 localPath (相对/非字符串/空) 拒绝且不调 fileTransfer;
// 合法绝对路径正常转发 (三参含 event.sender)。

const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { IpcFake } = require('./helpers/ipcFake');

const HANDLER_PATH = path.resolve(__dirname, '../../electron/src/main/handlers/deviceHandlers.js');

function makeIpc(services) {
  const ipc = new IpcFake();
  const handlerModule = require(HANDLER_PATH);
  handlerModule.register(ipc, services);
  return ipc;
}

function makeFileTransferMock() {
  const uploadCalls = [];
  const downloadCalls = [];
  return {
    uploadCalls,
    downloadCalls,
    upload: async (localPath, remotePath, deviceId, sender) => {
      uploadCalls.push([localPath, remotePath, deviceId, sender]);
      return { success: true };
    },
    download: async (remotePath, localPath, deviceId, sender) => {
      downloadCalls.push([remotePath, localPath, deviceId, sender]);
      return { success: true };
    },
  };
}

describe('deviceHandlers UPLOAD_FILE/DOWNLOAD_FILE 路径约束', () => {
  test('UPLOAD_FILE 非法 localPath → 拒绝且不调 fileTransfer.upload', async () => {
    const ft = makeFileTransferMock();
    const ipc = makeIpc({
      adbService: { fileTransfer: ft },
      scrcpyService: {},
    });

    const r1 = await ipc.invoke('uploadFile', 'relative.apk', '/sdcard/a.apk', 'dev1');
    assert.strictEqual(r1.success, false, '相对路径拒绝');
    const r2 = await ipc.invoke('uploadFile', '', '/sdcard/a.apk', 'dev1');
    assert.strictEqual(r2.success, false, '空串拒绝');
    const r3 = await ipc.invoke('uploadFile', 123, '/sdcard/a.apk', 'dev1');
    assert.strictEqual(r3.success, false, '非字符串拒绝');
    assert.strictEqual(ft.uploadCalls.length, 0, '非法 localPath 不得触发上传');
  });

  test('UPLOAD_FILE 合法绝对路径 → 转发 upload(localPath, remotePath, deviceId, event.sender)', async () => {
    const ft = makeFileTransferMock();
    const ipc = makeIpc({
      adbService: { fileTransfer: ft },
      scrcpyService: {},
    });

    const result = await ipc.invoke('uploadFile', '/data/app.apk', '/sdcard/app.apk', 'dev1');

    assert.strictEqual(result.success, true);
    assert.strictEqual(ft.uploadCalls.length, 1);
    assert.strictEqual(ft.uploadCalls[0][0], '/data/app.apk');
    assert.strictEqual(ft.uploadCalls[0][1], '/sdcard/app.apk');
    assert.strictEqual(ft.uploadCalls[0][2], 'dev1');
    assert.ok(ft.uploadCalls[0][3] && typeof ft.uploadCalls[0][3].send === 'function', '第四参为 event.sender');
  });

  test('DOWNLOAD_FILE 非法 localPath → 拒绝且不调 fileTransfer.download', async () => {
    const ft = makeFileTransferMock();
    const ipc = makeIpc({
      adbService: { fileTransfer: ft },
      scrcpyService: {},
    });

    const r1 = await ipc.invoke('downloadFile', '/sdcard/a.txt', 'output.txt', 'dev1');
    assert.strictEqual(r1.success, false, '相对路径拒绝 (防写任意目录)');
    const r2 = await ipc.invoke('downloadFile', '/sdcard/a.txt', null, 'dev1');
    assert.strictEqual(r2.success, false, 'null 拒绝');
    assert.strictEqual(ft.downloadCalls.length, 0, '非法 localPath 不得触发下载');
  });

  test('DOWNLOAD_FILE 合法绝对路径 → 转发 download(remotePath, localPath, deviceId, event.sender)', async () => {
    const ft = makeFileTransferMock();
    const ipc = makeIpc({
      adbService: { fileTransfer: ft },
      scrcpyService: {},
    });

    const result = await ipc.invoke('downloadFile', '/sdcard/a.txt', '/downloads/a.txt', 'dev1');

    assert.strictEqual(result.success, true);
    assert.strictEqual(ft.downloadCalls.length, 1);
    assert.strictEqual(ft.downloadCalls[0][0], '/sdcard/a.txt');
    assert.strictEqual(ft.downloadCalls[0][1], '/downloads/a.txt');
    assert.ok(ft.downloadCalls[0][3] && typeof ft.downloadCalls[0][3].send === 'function');
  });
});
