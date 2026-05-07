# 01 - 安装与环境配置

> **适用版本**: v0.1.3+ | **目标读者**: 有自动化测试经验的测试工程师

---

## 概述

XKAutoTester 运行依赖以下核心组件：

| 组件                | 角色                                   |
| ----------------- | ------------------------------------ |
| **Python 3.12.4** | 测试脚本执行引擎，驱动 Appium / Pytest / Allure |
| **Node.js 22+**   | Electron 桌面应用运行环境                    |
| **uv**            | Python 依赖管理（替代 pip）                  |
| **JDK 17+**       | Allure 报告生成依赖                        |
| **Android SDK**   | ADB 工具 + aapt2 APK 解析                |
| **Scrcpy**        | 设备屏幕镜像与控制                            |

> [!NOTE]
> 安装包（Setup 程序）已内置上述环境，**无需手动配置**。以下步骤仅适用于**开发模式**运行。

---

## 方式一：安装包运行（推荐）

从 [GitHub Releases](https://github.com/RingOnTheWay/XKAutoTester/releases) 下载最新版 `XKAutoTester Setup vX.X.X.exe`，运行安装程序后直接启动即可。

---

## 方式二：开发模式运行

### 1. 环境依赖检查

#### 1.1 Python 3.12.4

```bash
python --version
# 预期输出: Python 3.12.4
```

#### 1.2 Node.js 22+

```bash
node --version
# 预期输出: v22.x.x
```

#### 1.3 uv（Python 包管理器）

```bash
# 安装 uv
pip install uv

# 验证
uv --version
```

#### 1.4 JDK 17+

```bash
java -version
# 预期输出: openjdk version "17.x.x"
```

> 推荐使用 [Adoptium Temurin 17](https://github.com/adoptium/temurin17-binaries)。

#### 1.5 Android SDK Platform-tools

```bash
adb --version
# 预期输出: Android Debug Bridge version 1.0.x
```

> SDK 自带 platform-tools 和 build-tools 29.0.3（aapt2 所需）。

#### 1.6 Scrcpy 3.x

```bash
scrcpy --version
# 预期输出: scrcpy 3.x
```

### 2. 克隆项目

```bash
git clone https://github.com/RingOnTheWay/XKAutoTester.git
cd XKAutoTester
```

### 3. 安装依赖

```bash
# Python 依赖
uv sync

# Electron 依赖
cd electron
npm install
```

### 4. 启动应用

```bash
cd electron
npm start
```

应用将首先显示启动画面（splash screen），环境检查通过后进入主界面。

---

## 首次启动引导

### 界面概览

主界面包含 5 个功能 Tab：

| Tab      | 功能                         |
| -------- | -------------------------- |
| **测试执行** | 测试计划管理、执行、报告查看             |
| **页面封装** | 应用-页面-元素三级元素定位器管理          |
| **测试用例** | 可视化用例编辑、Python 代码自动生成      |
| **安卓连接** | 设备连接、文件管理、APK 安装、Scrcpy 投屏 |
| **设置**   | 语言/主题/通知/数据路径/版本更新         |

### 配置电信通知（可选）

在「设置 → 通知」中配置 DingTalk 机器人 Access Token 和 Secret，测试完成后自动推送报告摘要。

### 选择数据存储路径（可选）

在「设置 → 目录 → 配置存放位置」中自定义用户数据（测试用例、计划、页面封装等）的存储路径。默认使用系统 AppData 目录。

---

## 环境问题排查

| 现象                       | 原因               | 解决方法                       |
| ------------------------ | ---------------- | -------------------------- |
| 启动时报 "Python not found"  | Python 未安装或版本不匹配 | 安装 Python 3.12.4 并加入 PATH  |
| 启动时报 "Node.js not found" | Node.js 未安装      | 安装 Node.js 22+             |
| Allure 报告无法生成            | JDK 未安装          | 安装 JDK 17+ 并设置 JAVA_HOME   |
| ADB 无法识别设备               | Android SDK 未配置  | 安装 platform-tools 并加入 PATH |
| 启动时报 "uv not found"      | uv 未安装           | 执行 `pip install uv`        |
| npm install 失败           | Node.js 版本过低     | 升级至 Node.js 22+            |

---

## 下一步

- [02 - 测试用例管理](02-test-case.md)
- [03 - 页面元素封装](03-page-package.md)
- [04 - 测试执行与报告](04-test-execution.md)
