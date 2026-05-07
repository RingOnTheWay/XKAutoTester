<div align="center">

<img src="../electron/assets/icon.png" alt="XKAutoTester" align="center" height="96" />

# XKAutoTester

**Automation Testing Platform Based on Electron + Python**

[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.12.4-3c873a?style=flat-square)](https://www.python.org)
[![Electron](https://img.shields.io/badge/Electron-38-47848f?style=flat-square)](https://www.electronjs.org)
[![Version](https://img.shields.io/badge/Version-0.1.3-9cf?style=flat-square)](https://github.com/RingOnTheWay/XKAutoTester)
[![Platform](https://img.shields.io/badge/Platform-Windows-0078d7?style=flat-square)](https://www.microsoft.com/windows)

**[简体中文](../README.md) | English**

⭐ If you like this project, please give it a Star on GitHub — Thank you!

[Features](#features) • [Quick Start](#quick-start) • [Requirements](#requirements) • [Installation](#installation) • [Usage Guide](#usage-guide)

</div>

***

## Overview

XKAutoTester is a powerful automation testing platform that combines Electron's cross-platform desktop application capabilities with Python's automation testing ecosystem. Currently, only the Windows platform execution environment is maintained. The platform supports automated testing for Android devices, providing complete functionality including test case management, page element encapsulation, Bluetooth device simulation, test plan management, scheduled execution, and report generation.

## Features

### Test Management

- **Test Case Management** - Visually create and edit test cases, support Android case templated Python code generation
- **Page Element Encapsulation** - App-Page-Element three-level management, APK package info auto-recognition, element locator unified maintenance
- **Test Plan Management** - Create, edit, delete test plans, support test file selection and test type filtering
- **Scheduled Execution** - Set scheduled plans to automatically execute tests at specified times
- **Loop Execution** - Support loop running tests, configurable whether to continue after failure
- **Allure Reports** - Automatically generate professional test reports, support history viewing and DingTalk notification push

### Device & Connection

- **Android Device Management** - ADB connection management, support USB and wireless connection
- **Bluetooth Device Simulation** - BLE device Mock management, support serial communication and data simulation
- **Screen Control** - Integrated Scrcpy, real-time view and control device screen
- **File Management** - Browse and manage Android device file system, support one-click APK installation

### Platform Capabilities

- **Multi-language Support** - Support Chinese and English interface languages
- **Dark Mode** - Support light/dark theme switching
- **Notification Push** - Support DingTalk platform notification push
- **Auto Update** - Support application version check and auto update
- **Config Migration** - User config cross-version auto migration and sync
- **Prevent System Sleep** - Can prevent system sleep during test execution

## Tech Stack

|  Component  |              Technology             |
| :--------- | :-------------------------------: |
| Desktop App | Electron 38 + Native HTML/CSS/JS |
| Test Framework |        Pytest + Allure           |
| Mobile Testing |     Appium + UiAutomator2        |
| Device Control |         ADB + Scrcpy             |
| Bluetooth Simulation |     PySerial + MB026A Module     |
| Code Generation |          Jinja Template Engine    |
| Package Manager |  uv (Python) + npm (Node.js)     |
| Icons       |         Lucide Icons             |
| i18n        |            i18next               |
| Packaging   |    electron-builder (NSIS)       |

## Requirements

| Tool                      | Version  | Description               |
| :------------------------ | :------: | :----------------------- |
| Python                    |  3.12.4  | Test execution core       |
| Node.js                   |   22+    | Electron runtime          |
| JDK                       |   17+    | Allure report dependency  |
| Allure                    |  2.35.1  | Test report generation    |
| Android SDK Platform-tools |    36    | ADB tool                  |
| Android SDK Build-tools   |  29.0.3  | aapt2 tool                |
| Scrcpy                    |   3.3.3  | Device screen mirroring   |

> \[!NOTE]
> The installer includes all required environments. No manual configuration needed. For development mode, please install manually.

## Installation

### 1. Clone the Project

```bash
git clone https://github.com/RingOnTheWay/XKAutoTester.git
```

### 2. Install Python Dependencies

Use [uv](https://github.com/astral-sh/uv) for dependency management:

```bash
# Install uv (if not already installed)
pip install uv

# Sync dependencies
uv sync
```

### 3. Install Electron Dependencies

```bash
cd electron
npm install
```

### 4. Download and configure Allure, Android SDK, Scrcpy to environment variables

## Quick Start

### Run in Development Mode

```bash
# In project root directory
cd electron
npm start
```

### Build Production Version

```bash
cd electron
npm run build-win
```

After build completes, the installer will be generated in `electron/dist` directory.

## Usage Guide

For complete operating instructions, please refer to the following tutorials:

| No. | Tutorial | Content |
|:--:|------|------|
| 01 | [Installation & Environment Setup](tutorials/en-US/01-installation.md) | Dev environment setup, dependency installation, first launch |
| 02 | [Test Case Management](tutorials/en-US/02-test-case.md) | Case creation, step configuration, code generation, BLE Mock |
| 03 | [Page Element Packaging](tutorials/en-US/03-page-package.md) | App-Page-Element management, APK auto-parsing |
| 04 | [Test Execution & Reports](tutorials/en-US/04-test-execution.md) | Plan management, test running, Allure report viewing |
| 05 | [Device Connection & Mirroring](tutorials/en-US/05-device-connection.md) | Device connection, Scrcpy mirroring, file management, APK install |
| 06 | [Scheduled Plans & Loop Execution](tutorials/en-US/06-scheduled-plan.md) | Scheduled triggers, loop execution, failure handling |
| 07 | [System Settings](tutorials/en-US/07-settings.md) | Language/theme/notifications/data path/updates |

> 中文指南请参阅 [tutorials/zh-CN/](tutorials/zh-CN/)

## Project Structure

```
XKAutoTester/
├── electron/                    # Electron frontend
│   ├── src/
│   │   ├── main/               # Main process
│   │   │   ├── handlers/       # IPC handlers
│   │   │   ├── services/       # Business service layer
│   │   │   └── utils/          # Utility modules
│   │   ├── preload/            # Preload bridge script
│   │   └── shared/             # IPC channel constants
│   ├── renderer/               # Renderer process (UI)
│   │   └── components/         # UI components
│   ├── assets/                 # Static assets
│   ├── locales/                # i18n files
│   └── templates/              # Test case code templates
├── src/main/                    # Python backend
│   ├── core/                   # Core modules
│   │   ├── adb_manager.py      # ADB device management
│   │   ├── appium_server.py    # Appium service management
│   │   ├── pytest_runner.py    # Pytest runner
│   │   └── mock_ble_device.py  # BLE Bluetooth device simulation
│   ├── device/                 # Device modules
│   │   └── temperature/        # Thermometer data generation
│   ├── recognition/            # Recognition modules (captcha OCR)
│   └── utils/                  # Utility modules
│       ├── config.py           # Config manager
│       ├── logger.py           # Logger
│       ├── test_initializer.py # Test initializer
│       └── test_utils.py       # Test utilities
├── config/                      # Config files
│   ├── config.json             # App config
│   ├── ble_device.json         # Bluetooth device config
│   ├── page_package.json       # Page encapsulation config
│   └── pytest.ini              # Pytest config
├── scripts/                     # Utility scripts
│   └── sync_version.py         # Version sync script
└── version.json                 # Version info
```

<br />

## Resources

- [Pytest Documentation](https://docs.pytest.org/)
- [Allure Report Documentation](https://docs.qameta.io/allure/)
- [Appium Documentation](https://appium.io/)
- [Electron Documentation](https://www.electronjs.org/docs)
- [Scrcpy Project](https://github.com/Genymobile/scrcpy)
- [Lucide Icons](https://lucide.dev/)
- [Temurin17 Project](https://github.com/adoptium/temurin17-binaries)

## License

This project is open-sourced under the [MIT](LICENSE) license.
