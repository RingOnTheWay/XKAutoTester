<div align="center">

<img src="./electron/assets/icon.png" alt="XKAutoTester" align="center" height="96" />

# XKAutoTester

**基于 Electron + Python 的自动化测试平台**

[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.12.4-3c873a?style=flat-square)](https://www.python.org)
[![Electron](https://img.shields.io/badge/Electron-38-47848f?style=flat-square)](https://www.electronjs.org)
[![Version](https://img.shields.io/badge/Version-0.1.3-9cf?style=flat-square)](https://github.com/RingOnTheWay/XKAutoTester)
[![Platform](https://img.shields.io/badge/Platform-Windows-0078d7?style=flat-square)](https://www.microsoft.com/windows)

**简体中文 | [English](docs/README_EN.md)**

⭐ 如果您喜欢这个项目，不妨在 GitHub 上点个 Star — 非常感谢！

[功能特性](#功能特性) • [快速开始](#快速开始) • [环境要求](#环境要求) • [安装](#安装) • [使用指南](#使用指南)

</div>

***

## 概述

XKAutoTester 是一个功能强大的自动化测试平台，结合了 Electron 的跨平台桌面应用能力和 Python 的自动化测试生态，目前只维护 Windows 平台下软件的执行环境。该平台支持 Android 设备的自动化测试，提供测试用例管理、页面元素封装、蓝牙设备模拟、测试计划管理、定时执行、报告生成等完整功能。

## 功能特性

### 测试管理

- **测试用例管理** - 可视化创建、编辑测试用例，支持安卓用例模板化 Python 代码生成
- **页面元素封装** - 应用-页面-元素三级管理，APK 包信息自动识别，元素定位器统一维护
- **测试计划管理** - 创建、编辑、删除测试计划，支持测试文件选择和测试类型筛选
- **定时执行** - 设置定时计划，自动在指定时间执行测试
- **循环执行** - 支持循环运行测试，可配置失败后是否继续
- **Allure 报告** - 自动生成专业的测试报告，支持历史记录查看与钉钉通知推送

### 设备与连接

- **Android 设备管理** - ADB 连接管理，支持 USB 和无线连接
- **蓝牙设备模拟** - BLE 设备 Mock 管理，支持串口通信与数据模拟
- **屏幕控制** - 集成 Scrcpy，实时查看和控制设备屏幕
- **文件管理** - 浏览和管理安卓设备文件系统，支持 APK 一键安装

### 平台能力

- **多语言支持** - 支持中文和英文界面语言
- **暗色模式** - 支持亮色/暗色主题切换
- **通知推送** - 支持钉钉平台的通知推送
- **自动更新** - 支持应用版本检查与自动更新
- **配置迁移** - 用户配置跨版本自动迁移与同步
- **防系统休眠** - 测试执行期间可禁止系统睡眠

## 技术架构

|  组件  |              技术栈             |
| :--: | :--------------------------: |
| 桌面应用 | Electron 38 + 原生 HTML/CSS/JS |
| 测试框架 |        Pytest + Allure       |
| 移动测试 |     Appium + UiAutomator2    |
| 设备控制 |         ADB + Scrcpy         |
| 蓝牙模拟 |     PySerial + MB026A 模块     |
| 代码生成 |          Jinja 模板引擎          |
|  包管理 |  uv (Python) + npm (Node.js) |
|  图标  |         Lucide Icons         |
|  国际化 |            i18next           |
|  打包  |    electron-builder (NSIS)   |

## 环境要求

| 工具                         |  版本要求  | 说明            |
| :------------------------- | :----: | :------------ |
| Python                     | 3.12.4 | 测试执行核心        |
| Node.js                    |   22+  | Electron 运行环境 |
| JDK                        |   17+  | Allure 报告生成依赖 |
| Allure                     | 2.35.1 | 测试报告生成        |
| Android SDK Platform-tools |   36   | ADB 工具        |
| Android SDK Build-tools    | 29.0.3 | aapt2 工具      |
| Scrcpy                     |  3.3.3 | 设备屏幕镜像控制      |

> \[!NOTE]
> 安装包已内置所需环境，无需手动配置，开发模式下需自行安装。

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

### 4. 下载并配置Allure、Android SDK、Scrcpy到环境变量中

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

完整的操作指南请参阅以下教程：

| 编号 | 教程 | 内容 |
|:--:|------|------|
| 01 | [安装与环境配置](docs/tutorials/zh-CN/01-installation.md) | 开发环境搭建、依赖安装、首次启动 |
| 02 | [测试用例管理](docs/tutorials/zh-CN/02-test-case.md) | 用例创建、步骤配置、代码生成、蓝牙 Mock |
| 03 | [页面元素封装](docs/tutorials/zh-CN/03-page-package.md) | 应用-页面-元素三级管理、APK 自动解析 |
| 04 | [测试执行与报告](docs/tutorials/zh-CN/04-test-execution.md) | 计划管理、测试运行、Allure 报告查看 |
| 05 | [设备连接与投屏](docs/tutorials/zh-CN/05-device-connection.md) | 设备连接、Scrcpy 投屏、文件管理、APK 安装 |
| 06 | [定时计划与循环执行](docs/tutorials/zh-CN/06-scheduled-plan.md) | 定时触发、循环执行、失败处理策略 |
| 07 | [系统设置](docs/tutorials/zh-CN/07-settings.md) | 语言/主题/通知/数据路径/更新配置 |

> English guides are available at [docs/tutorials/en-US/](docs/tutorials/en-US/)

## 项目结构

```
XKAutoTester/
├── electron/                    # Electron 前端
│   ├── src/
│   │   ├── main/               # 主进程
│   │   │   ├── handlers/       # IPC 处理器
│   │   │   ├── services/       # 业务服务层
│   │   │   └── utils/          # 工具模块
│   │   ├── preload/            # Preload 桥接脚本
│   │   └── shared/             # IPC 通道常量
│   ├── renderer/               # 渲染进程（UI）
│   │   └── components/         # UI 组件
│   ├── assets/                 # 静态资源
│   ├── locales/                # 国际化文件
│   └── templates/              # 测试用例代码模板
├── src/main/                    # Python 后端
│   ├── core/                   # 核心模块
│   │   ├── adb_manager.py      # ADB 设备管理
│   │   ├── appium_server.py    # Appium 服务管理
│   │   ├── pytest_runner.py    # Pytest 运行器
│   │   └── mock_ble_device.py  # BLE 蓝牙设备模拟
│   ├── device/                 # 设备模块
│   │   └── temperature/        # 体温计数据生成
│   ├── recognition/            # 识别模块（验证码 OCR）
│   └── utils/                  # 工具模块
│       ├── config.py           # 配置管理器
│       ├── logger.py           # 日志管理
│       ├── test_initializer.py # 测试初始化
│       └── test_utils.py       # 测试工具
├── config/                      # 配置文件
│   ├── config.json             # 应用配置
│   ├── ble_device.json         # 蓝牙设备配置
│   ├── page_package.json       # 页面封装配置
│   └── pytest.ini              # Pytest 配置
├── scripts/                     # 工具脚本
│   └── sync_version.py         # 版本同步脚本
└── version.json                 # 版本信息
```

<br />

## 资源

- [Pytest 官方文档](https://docs.pytest.org/)
- [Allure 报告文档](https://docs.qameta.io/allure/)
- [Appium 官方文档](https://appium.io/)
- [Electron 官方文档](https://www.electronjs.org/docs)
- [Scrcpy 项目](https://github.com/Genymobile/scrcpy)
- [Lucide 图标库](https://lucide.dev/)
- [Temurin17 项目](https://github.com/adoptium/temurin17-binaries)

## 许可证

本项目采用 [MIT](LICENSE) 许可证开源。
