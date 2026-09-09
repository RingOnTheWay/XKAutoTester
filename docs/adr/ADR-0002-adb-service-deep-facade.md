# ADR-0002: ADBService 深门面 — 收窄 collaborator 泄漏

- **状态**: 已接受 (2026-09-08)
- **领域**: ADB 门面 / seam
- **来源**: improve-codebase-architecture 候选 #2 (git 热点: ADBService 16 次变更)

## 背景

`ADBService` 构造后把内部 collaborator 当属性暴露 (`fileTransfer` / `apkInstaller` / `remoteStat` / `tarExtractor`), 注释明写「调用方直接持属性」。生产调用方绕过门面 seam:

- `handlers/deviceHandlers.js` 直调 `adbService.fileTransfer.upload/download`
- `handlers/adbHandlers.js` 直调 `adbService.apkInstaller.install`

后果: 内部子模块签名一变, 直持属性调用方全散; 门面退化成对象盒, 深度集中在内部模块。`remoteStat`/`tarExtractor` getter 无任何生产调用方, 为纯测试暴露的死表面。

## 决策

**将门面加深, 内部 collaborator 私有化**:

- 新增 3 个门面方法, 委托内部模块:
  - `uploadFile(localPath, remotePath, deviceId, eventSender)` → `_fileTransfer.upload`
  - `downloadFile(remotePath, localPath, deviceId, eventSender)` → `_fileTransfer.download`
  - `installApk(apkPath, deviceId, eventSender)` → `_apkInstaller.install`
- **删除 4 个泄漏 getter** (`fileTransfer` / `apkInstaller` / `remoteStat` / `tarExtractor`), collaborator 保持私有字段。
- 生产调用方 (deviceHandlers / adbHandlers) 改走门面方法。
- 测试从「断言直持属性」翻转为「断言门面委托 + getter 已删」。

## 后果

- **正面**: 门面变深、接口收窄; 调用方只依赖一个 seam; 改内部子模块不再波及外部; 删除死表面 (remoteStat/tarExtractor test-only getter)。
- **负面 / 注意**: 注入测试无法再通过 getter 断言 wiring, 改为经门面委托断言行为; 若未来需暴露 tarExtractor 行为, 应加门面方法而非开 getter。
- **改动文件**: `ADBService.js`、`handlers/deviceHandlers.js`、`handlers/adbHandlers.js`、`tests/electron/test_adb_service.js`。
- **删除测试通过**: 删 getter 后复杂度集中到门面方法 (委托), 非挪位。

## 词汇

无新领域概念, 仅 seam 形态变更。