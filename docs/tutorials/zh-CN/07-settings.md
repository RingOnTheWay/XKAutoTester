# 07 - 系统设置

> **适用版本**: v0.1.4+ | **目标读者**: 有自动化测试经验的测试工程师

---

## 概述

「设置」Tab（`renderer/tabs/settings/`，含 5 个 Mixin）提供应用全局配置：

- 语言切换（中文 / 英文）
- 主题（亮色 / 暗色 / 主题色）
- 钉钉通知配置
- 数据存储路径管理
- 版本信息与自动更新
- 防系统休眠
- 驱动检测

---

## 整体流程

```
进入「设置」Tab → 选择配置项 → 修改 → 自动保存到 config.json
```

---

## 步骤 1：语言切换

### 1.1 切换语言

在「语言」下拉框中选择「简体中文」或「English」：

1. `I18nService`（继承 i18next）切换语言
2. 翻译文件位于 `electron/locales/{zh-CN,en-US}/translation.json`
3. 界面即时刷新，无需重启

### 1.2 后端 i18n

Python 后端通过 `utils/i18n.py`（单例 + `_initialized` 守护）提供国际化：
- 用于错误消息、日志的本地化
- 与前端语言保持一致

---

## 步骤 2：主题设置

### 2.1 亮色 / 暗色模式

切换「暗色模式」开关：

- `APP_SETTINGS.dark_mode` 写入 `config.json`
- `styles.css` 通过 `@import` 引入 15 个 CSS 模块，自动应用 `[data-theme="dark"]` 选择器

### 2.2 主题色

在调色板中选择主题色（默认 `#4CAF50`）：

- `APP_SETTINGS.theme_color` 写入 `config.json`
- 通过 CSS 变量 `--theme-color` 全局生效

---

## 步骤 3：钉钉通知

### 3.1 配置 DingTalk 机器人

| 字段 | 说明 |
|------|------|
| **Access Token** | 钉钉机器人 Webhook URL 中的 access_token |
| **Secret** | 机器人安全设置的加签密钥 |

### 3.2 测试通知

点击「测试通知」按钮：

1. `NotificationService` 构造测试消息
2. 使用 HMAC-SHA256 签名（timestamp + secret）
3. 通过 `axios` 发送到钉钉 Webhook
4. 返回结果通过 Toast 显示

### 3.3 通知触发时机

- 测试执行完成（自动）
- 测试报告生成完成（自动）
- 手动触发（测试通知按钮）

---

## 步骤 4：数据存储路径

### 4.1 默认路径

默认使用 Windows AppData 目录：
- `%APPDATA%\Xkautotester\config\` — 配置目录
- `%APPDATA%\Xkautotester\` — 数据目录

### 4.2 自定义路径

点击「更改路径」按钮，选择新目录：

1. `UserDataService.changeDataPath(newPath)` 触发：
   - `UserDataMigrator` 复制现有数据到新路径
   - `WindowsRegistryBridge` 将新路径持久化到 Windows 注册表
2. 提示重启应用
3. 重启后从新路径加载数据

### 4.3 重置路径

点击「重置为默认」按钮，恢复到 AppData 默认路径。

### 4.4 数据迁移机制

版本升级时 `UserDataMigrator` 自动同步新增配置项：
- 通过 `data-version.json` 记录上次迁移的版本
- 对比当前版本，应用必要的迁移规则
- 保留用户已有配置，仅添加新增字段

---

## 步骤 5：版本与自动更新

### 5.1 查看版本信息

`VersionService` 从 `version.json` 读取：

| 字段 | 示例 | 说明 |
|------|------|------|
| version | `0.1.4` | 主版本号 |
| buildDate | `2026-05-21` | 构建日期 |
| prerelease | `dev.2` | 预发布标识 |
| fullVersion | `0.1.4-dev.2` | 完整版本号 |

### 5.2 检查更新

点击「检查更新」按钮：

1. `UpdateService` 调用 GitHub Releases API
2. 对比当前版本与最新 release 版本
3. 返回更新信息（版本号 / 发布日期 / 更新说明）

### 5.3 下载并安装

若有新版本：

1. 点击「下载更新」
2. `UpdateService` 下载安装包到临时目录
3. 通过 IPC 事件 `on-download-progress` 实时显示下载进度
4. 下载完成后点击「安装更新」
5. 应用退出并启动 NSIS 安装程序
6. 安装完成后重启应用

### 5.4 自动检查

启用「自动检查更新」开关（`APP_SETTINGS.autoCheckUpdate`）：
- 应用启动时自动检查
- 有新版本时通过 Toast 提示

---

## 步骤 6：防系统休眠

### 6.1 启用防休眠

切换「防系统休眠」开关：

- 启用后 `powerHandlers.setPreventSleep(true)` 调用 Electron `powerSaveBlocker.start('prevent-display-sleep')`
- 测试执行期间系统不会进入睡眠
- 应用退出时自动停止

### 6.2 持久化

设置保存到 `config.json`，应用启动时通过 `restorePreventSleepSetting()` 恢复。

---

## 步骤 7：驱动检测

### 7.1 串口驱动检测

`DriverChecker` 检测 CP210x 串口驱动：
- 检查 Windows 设备管理器
- 若未安装，提示运行 `env/CP210x_Windows_Drivers/CP210xVCPInstaller_x64.exe`

### 7.2 ADB 驱动检测

`EnvironmentService` 检测 ADB 是否可用：
- 调用 `adb version`
- 失败时提示安装 Android SDK platform-tools 或使用完整安装包

---

## 配置文件结构

所有设置持久化到 `config/config.json`：

```json
{
  "LOG_CONFIG": {
    "level": "INFO",
    "format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    "file_path": ".",
    "max_bytes": 10485760,
    "backup_count": 5
  },
  "SCRCPY_PARAMS": {
    "max_size": "1920",
    "video_bit_rate": "8",
    "max_fps": "60",
    "video_codec": "h264",
    "always_on_top": true
  },
  "APP_SETTINGS": {
    "default_download_directory": "",
    "dark_mode": false,
    "theme_color": "#4CAF50",
    "language": "zh-CN",
    "notification": {
      "platform": "none",
      "dingtalk": {
        "access_token": "",
        "secret": ""
      }
    },
    "autoCheckUpdate": true
  }
}
```

> `config.json` 是**唯一权威源**（单源配置），JS/Python 端均从此读取，不再有硬编码副本。

---

## 下一步

- [01 - 安装与环境配置](01-installation.md)（环境问题排查）
- [04 - 测试执行与报告](04-test-execution.md)
