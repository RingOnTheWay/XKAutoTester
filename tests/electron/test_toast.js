// Toast 组件测试 — R27 同文案 500ms 防重 (多调用源双 toast 兜底)
// 回归: 取消下载双触发/多源同时弹相同消息 → 只显示一条
const { test, before } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");

const { JSDOM } = require(
  path.join(__dirname, "..", "..", "electron", "node_modules", "jsdom"),
);

let ToastManager;

before(async () => {
  const dom = new JSDOM(
    '<!DOCTYPE html><html><body><div id="app"></div></body></html>',
    { url: "http://localhost/" },
  );
  global.window = dom.window;
  global.document = dom.window.document;
  // jsdom 无 layout, 需要最小补齐
  if (!dom.window.HTMLElement.prototype.getBoundingClientRect) {
    dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({
      width: 0,
      height: 0,
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,
    });
  }
  const mod = await import("../../electron/renderer/components/toast.js");
  ToastManager = mod.ToastManager;
});

test("同文案 500ms 内防重: 第二次 show 返回 null", () => {
  const tm = new ToastManager();
  const first = tm.show("已取消下载", "success");
  assert.ok(first, "首次 show 应创建 toast");
  const second = tm.show("已取消下载", "success");
  assert.strictEqual(second, null, "同文案 500ms 内应去重 (防双 toast)");
});

test("不同文案不受防重影响", () => {
  const tm = new ToastManager();
  assert.ok(tm.show("下载完成", "success"), "文案 A 应显示");
  assert.ok(tm.show("已取消下载", "success"), "文案 B 应显示 (异文案不去重)");
});

test("超过 500ms 后同文案可再次显示", async () => {
  const tm = new ToastManager();
  assert.ok(tm.show("提示", "info"));
  await new Promise((r) => setTimeout(r, 550));
  assert.ok(tm.show("提示", "info"), "超 500ms 应可再显示");
});
