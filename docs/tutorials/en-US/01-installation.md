# 01 - Installation & Environment Setup

> **Applicable Version**: v0.1.3+ | **Target Audience**: Experienced test engineers

---

## Overview

XKAutoTester depends on the following core components:

| Component | Role |
|-----------|------|
| **Python 3.12.4** | Test script execution engine, driving Appium / Pytest / Allure |
| **Node.js 22+** | Electron desktop app runtime |
| **uv** | Python dependency manager (replaces pip) |
| **JDK 17+** | Allure report generation dependency |
| **Android SDK** | ADB tools + aapt2 for APK parsing |
| **Scrcpy** | Device screen mirroring & control |

> [!NOTE]
> The installer (Setup) bundles all the above environments, **no manual configuration required**. The following steps apply only to **development mode** execution.

---

## Method 1: Run via Installer (Recommended)

Download the latest `XKAutoTester Setup vX.X.X.exe` from [GitHub Releases](https://github.com/RingOnTheWay/XKAutoTester/releases), run the installer, and launch the app.

![Installer Interface](../images/01-installer.png)

---

## Method 2: Development Mode

### 1. Environment Prerequisites

#### 1.1 Python 3.12.4

```bash
python --version
# Expected: Python 3.12.4
```

#### 1.2 Node.js 22+

```bash
node --version
# Expected: v22.x.x
```

#### 1.3 uv (Python Package Manager)

```bash
# Install uv
pip install uv

# Verify
uv --version
```

#### 1.4 JDK 17+

```bash
java -version
# Expected: openjdk version "17.x.x"
```

> Recommended: [Adoptium Temurin 17](https://github.com/adoptium/temurin17-binaries).

#### 1.5 Android SDK Platform-tools

```bash
adb --version
# Expected: Android Debug Bridge version 1.0.x
```

> The SDK includes platform-tools and build-tools 29.0.3 (required by aapt2).

#### 1.6 Scrcpy 3.x

```bash
scrcpy --version
# Expected: scrcpy 3.x
```

### 2. Clone the Project

```bash
git clone https://github.com/RingOnTheWay/XKAutoTester.git
cd XKAutoTester
```

### 3. Install Dependencies

```bash
# Python dependencies
uv sync

# Electron dependencies
cd electron
npm install
```

### 4. Launch the App

```bash
cd electron
npm start
```

The app first displays a splash screen, then enters the main interface after environment checks pass.

![Splash Screen](../images/01-splash.png)

---

## First-time Setup

### Interface Overview

The main interface contains 5 functional tabs:

| Tab | Function |
|-----|----------|
| **Test Execution** | Test plan management, execution, report viewing |
| **Page Package** | App-Page-Element three-level locator management |
| **Test Case** | Visual case editor, automatic Python code generation |
| **Android Connection** | Device connection, file management, APK installation, scrcpy mirroring |
| **Settings** | Language/theme/notifications/data path/updates |

![Main Interface](../images/01-main-interface.png)

### Configure Notifications (Optional)

In Settings → Notification, configure the DingTalk bot Access Token and Secret to automatically push report summaries after test completion.

### Select Data Storage Path (Optional)

In Settings → Directory → Config Storage Path, customize the storage location for user data (test cases, plans, page packages, etc.). Defaults to the system AppData directory.

---

## Troubleshooting

| Symptom | Cause | Solution |
|---------|-------|----------|
| "Python not found" on startup | Python not installed or version mismatch | Install Python 3.12.4 and add to PATH |
| "Node.js not found" on startup | Node.js not installed | Install Node.js 22+ |
| Allure report fails to generate | JDK not installed | Install JDK 17+ and set JAVA_HOME |
| ADB cannot recognize devices | Android SDK not configured | Install platform-tools and add to PATH |
| "uv not found" on startup | uv not installed | Run `pip install uv` |
| npm install fails | Node.js version too old | Upgrade to Node.js 22+ |

---

## Next Steps

- [02 - Test Case Management](02-test-case.md)
- [03 - Page Element Packaging](03-page-package.md)
- [04 - Test Execution & Reports](04-test-execution.md)
