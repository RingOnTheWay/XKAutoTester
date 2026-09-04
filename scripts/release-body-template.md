<!--
  Release body 模板。
  用法：
    1. 复制本文件为 release-body-v<VERSION>.md（如 release-body-v0.1.6-dev.1.md）
    2. 将 {{VERSION}} / {{DATE}} 替换为实际值，填写大小 / SHA256 / 更新说明
    3. 运行发布脚本：publish-release.ps1 -Version <VERSION>，随后 patch-body.ps1 -Version <VERSION>
  注意：
    - SHA256 在打补丁前可从 electron/dist 本地 exe 计算，或先跑 patch-body.ps1 用其输出的 body/local 对比校验
    - GitHub 会将 asset 文件名中的空格规范化为点（XKAutoTester Setup -> XKAutoTester.Setup）
-->

# XKAutoTester v{{VERSION}}

**发布日期**: {{DATE}}

## 📦 下载

| 安装包                                        | 大小      | 说明                                                             |
| ------------------------------------------ | ------- | -------------------------------------------------------------- |
| `XKAutoTester.Setup.v{{VERSION}}.exe`      | xx.x MB | **完整版**：内置 Python 3.12 + Android SDK + scrcpy + CP210x 驱动，开箱即用 |
| `XKAutoTester.Lite.Setup.v{{VERSION}}.exe` | xx.x MB | **精简版**：不含内置环境，适合已自备 Python/JDK/ADB 的用户                        |

## 🔐 完整性校验（在线更新依赖，安装前请核对）

<!-- ⚠️ SHA256 行直接写 64 位 hex，勿加反引号/代码块包裹：
     UpdateService.parseSha256FromBody 正则期望 `SHA256: <hex>`，
     带反引号会匹配失败 → UI 报"未提供 SHA256 校验值, 已禁用下载"。
     patch-body.ps1 会按此格式自动写入, 手工改时保持一致。 -->

**XKAutoTester.Setup.v{{VERSION}}.exe**
SHA256: （64 位十六进制，留空待填）

**XKAutoTester.Lite.Setup.v{{VERSION}}.exe**
SHA256: （64 位十六进制，留空待填）

## ✨ 新增

- （本次新增功能）

## 🐛 修复

- （本次修复问题）

## 🔧 优化

- （性能 / 体验优化）
