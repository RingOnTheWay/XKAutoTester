// fileHandlers.js 单元测试 — CREATE_DIRECTORY 路径安全 (P3-8):
// 盘符根 / 系统关键目录拒绝 (经 pathGuard.isSystemProtectedPath 判定),
// 非字符串拒绝, 合法用户目录放行。
const { test, describe } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { IpcFake } = require("./helpers/ipcFake");

const HANDLER_PATH = path.resolve(
  __dirname,
  "../../electron/src/main/handlers/fileHandlers.js",
);

function makeIpc() {
  const ipc = new IpcFake();
  const handlerModule = require(HANDLER_PATH);
  handlerModule.register(ipc, {
    electronApp: {
      userConfigPath: path.join(os.tmpdir(), "xkat-test-handler"),
    },
    i18nService: null, // fallback 默认文案
  });
  return ipc;
}

describe("fileHandlers CREATE_DIRECTORY 路径安全", () => {
  test("盘符根 → 拒绝 (success:false, 不创建)", async () => {
    const ipc = makeIpc();
    if (process.platform === "win32") {
      const r = await ipc.invoke("createDirectory", "C:\\");
      assert.strictEqual(r.success, false, "盘符根拒绝");
      assert.ok(!fs.existsSync("C:\\xkat-test-should-not-exist"));
    }
  });

  test("系统关键目录 (C:\\Windows) → 拒绝", async () => {
    const ipc = makeIpc();
    if (process.platform === "win32") {
      const r = await ipc.invoke(
        "createDirectory",
        "C:\\Windows\\System32\\xkat-test-ghost",
      );
      assert.strictEqual(r.success, false, "系统关键目录拒绝");
    } else {
      const r = await ipc.invoke("createDirectory", "/etc/xkat-test-ghost");
      assert.strictEqual(r.success, false, "POSIX 系统目录拒绝");
    }
  });

  test("非字符串 / 空串 → 拒绝", async () => {
    const ipc = makeIpc();
    assert.strictEqual(
      (await ipc.invoke("createDirectory", 123)).success,
      false,
    );
    assert.strictEqual(
      (await ipc.invoke("createDirectory", "")).success,
      false,
    );
    assert.strictEqual(
      (await ipc.invoke("createDirectory", null)).success,
      false,
    );
  });

  test("合法用户目录 → 放行并创建", async () => {
    const ipc = makeIpc();
    const dir = path.join(os.tmpdir(), "xkat-test-createdir", "sub");
    try {
      const r = await ipc.invoke("createDirectory", dir);
      assert.strictEqual(r.success, true);
      assert.ok(fs.existsSync(dir), "目录已创建");
    } finally {
      fs.rmSync(path.join(os.tmpdir(), "xkat-test-createdir"), {
        recursive: true,
        force: true,
      });
    }
  });
});
