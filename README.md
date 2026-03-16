<div align="center">

<img src="./electron/assets/icon.png" alt="XKAutoTester" align="center" height="96" />

# XKAutoTester

**基于 Electron + Python 的自动化测试平台**

[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.12.4-3c873a?style=flat-square)](https://www.python.org)
[![Java](https://img.shields.io/badge/Java-17.0.15-007396?style=flat-square)](https://www.java.com)
[![Electron](https://img.shields.io/badge/Electron-38.7.2-47848f?style=flat-square)](https://www.electronjs.org)
[![Node.js](https://img.shields.io/badge/Node.js-22.19.0-3c873a?style=flat-square)](https://nodejs.org)
[![Version](https://img.shields.io/badge/Version-0.1.2--dev.5-9cf?style=flat-square)](https://github.com/your-username/XKAutoTester)
[![Platform](https://img.shields.io/badge/Platform-Windows-0078d7?style=flat-square)](https://www.microsoft.com/windows)

⭐ 如果您喜欢这个项目，不妨在 GitHub 上点个 Star — 非常感谢！

[功能特性](#功能特性) • [快速开始](#快速开始) • [环境要求](#环境要求) • [安装](#安装) • [使用指南](#使用指南)

</div>

---

## 概述

XKAutoTester 是一个功能强大的自动化测试平台，结合了 Electron 的跨平台桌面应用能力和 Python 的自动化测试生态，目前只维护Windows平台下软件的执行环境。该平台支持 Android 设备的自动化测试，提供完整的测试计划管理、定时执行、报告生成等功能。

> [!TIP]
> 本项目采用前后端分离架构，Electron 负责桌面 GUI 界面，Python 负责测试执行和设备控制，两者通过 IPC 通信实现无缝集成。

## 功能特性

- **测试计划管理** - 创建、编辑、删除测试计划，支持测试文件选择和测试类型筛选
- **定时执行** - 设置定时计划，自动在指定时间执行测试
- **循环执行** - 支持循环运行测试，可配置失败后是否继续
- **Allure 报告** - 自动生成专业的测试报告，支持历史记录查看
- **Android 设备管理** - ADB 连接管理，支持 USB 和无线连接
- **屏幕控制** - 集成 Scrcpy，实时查看和控制设备屏幕
- **文件管理** - 浏览和管理安卓设备文件系统
- **多语言支持** - 支持中文和英文界面语言
- **通知推送** - 支持钉钉平台的通知推送

## 技术架构

| 组件 | 技术栈 |
|:---:|:---:|
| 桌面应用 | Electron 38 |
| 测试框架 | Pytest + Allure |
| 移动测试 | Appium + UiAutomator2 |
| 设备控制 | ADB + Scrcpy |
| 包管理 | uv (Python) + npm (Node.js) |

## 环境要求

### 必需环境

| 工具 | 版本要求 | 说明 |
|:---|:---:|:---|
| Python | 3.12.4 | 测试执行核心 |
| Node.js | 22.19.0 | Electron 运行环境 |
| Java | 17.0.15 | Allure 报告生成 |
| Android SDK | - | ADB 和相关工具 |

### 可选工具

| 工具 | 说明 |
|:---|:---|
| Appium | 移动端自动化测试 |
| Scrcpy | 设备屏幕镜像控制 |

## 安装

### 1. 克隆项目

```bash
git clone https://github.com/RingOnTheWay/XKAutoTester.git
```

### 2. 安装 Python 依赖

使用 [uv](https://github.com/astral-sh/uv) 进行依赖管理：

```bash
# 安装 uv（如果尚未安装）
pip install uv

# 同步依赖
uv sync
```

### 3. 安装 Electron 依赖

```bash
cd electron
npm install
```

### 4. 安装 Allure 和 Scrcpy

下载并放置到项目的 `env/allure` 目录下。

## 快速开始

### 开发模式运行

```bash
# 在项目根目录
cd electron
npm start
```

### 构建生产版本

```bash
cd electron
npm run build-win
```

构建完成后，安装包将生成在 `electron/dist` 目录。

## 使用指南

### 测试执行

1. **选择测试目录（如无测试计划）** - 点击「选择测试目录」，选择测试目录
2. **创建测试计划** - 点击「新建计划」，选择测试目录下的测试用例文件
3. **配置测试类型** - 选择要执行的测试类型（冒烟测试、单元测试等）
4. **运行测试** - 点击「运行测试」开始执行
5. **查看报告** - 测试完成后点击「查看报告」查看 Allure 报告

### 设备连接

1. **USB 连接** - 通过 USB 连接设备，在设备管理中查看
2. **无线连接** - 输入设备 IP 地址进行无线连接
3. **屏幕控制** - 选择设备后可启动 Scrcpy 进行屏幕控制

### 定时计划

1. 创建定时计划，选择要执行的测试计划
2. 设置执行时间
3. 系统将在指定时间自动执行测试（需禁止系统休眠）

## 项目结构

```
XKAutoTester/
├── electron/                 # Electron 前端代码
│   ├── src/
│   │   ├── main/            # 主进程代码
│   │   │   ├── handlers/    # IPC 处理器
│   │   │   └── services/    # 后端服务
│   │   ├── preload/         # 预加载脚本
│   │   └── shared/          # 共享常量
│   ├── renderer/            # 渲染进程（UI）
│   ├── assets/              # 静态资源
│   └── locales/             # 国际化文件
├── src/main/                 # Python 后端代码
│   ├── core/                # 核心模块
│   │   ├── adb_manager.py   # ADB 设备管理
│   │   ├── appium_server.py # Appium 服务器管理
│   │   └── pytest_runner.py # Pytest 运行器
│   ├── recognition/         # 识别模块
│   └── utils/               # 工具模块
├── config/                   # 配置文件
│   ├── config.json          # 应用配置
└── pytest.ini               # Pytest 配置
```

## 配置说明

主配置文件位于 `config/config.json`：

```json
{
  "LOG_CONFIG": {
    "level": "INFO",
    "format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
  },
  "SCRCPY_PARAMS": {
    "max_size": "1920",
    "video_bit_rate": "8",
    "max_fps": "60"
  },
  "APP_SETTINGS": {
    "language": "zh-CN",
    "theme_color": "#4CAF50"
  }
}
```

## 常见问题

<details>
<summary><b>Appium 服务器启动失败</b></summary>

确保已正确安装 Node.js 和 Appium：

```bash
npm install -g appium
appium driver install uiautomator2
```

</details>

<details>
<summary><b>ADB 设备连接失败</b></summary>

1. 确保已安装 Android SDK 并配置环境变量
2. 检查设备是否开启 USB 调试模式
3. 无线连接需确保设备与电脑在同一网络

</details>

<details>
<summary><b>Allure 报告生成失败</b></summary>

确保已安装 Java 运行环境（JRE 8+），Allure 依赖 Java 运行。

</details>

## 资源

- [Pytest 官方文档](https://docs.pytest.org/)
- [Allure 报告文档](https://docs.qameta.io/allure/)
- [Appium 官方文档](https://appium.io/)
- [Electron 官方文档](https://www.electronjs.org/docs)
- [Scrcpy 项目](https://github.com/Genymobile/scrcpy)

## 许可证

本项目采用 [MIT](LICENSE) 许可证开源。
