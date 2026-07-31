# 01 - Installation & Environment Setup

> **Applicable Version**: v0.1.4+ | **Target Audience**: Experienced test engineers

---

## Overview

XKAutoTester depends on the following core components:

| Component         | Role                                                                 |
| ----------------- | -------------------------------------------------------------------- |
| **Python 3.10+** (bundled 3.12) | Test script execution engine, driving Appium / Pytest / Allure |
| **Node.js 22+**   | Electron desktop app runtime                                         |
| **uv**            | Python dependency manager (replaces pip)                             |
| **JDK 17+**       | Allure report generation dependency                                  |
| **Android SDK**   | ADB tools + aapt2 APK parsing                                        |
| **Scrcpy**        | Device screen mirroring & control                                    |
| **CP210x Driver** | USB serial driver (BLE module communication, bundled in installer)   |

> [!NOTE]
> The installer (Setup) bundles Python 3.12, Android SDK, Scrcpy, and CP210x serial drivers — **no manual configuration required**. The steps below apply only to **development mode**.

---

## Method 1: Run via Installer (Recommended)

Download the latest `XKAutoTester Setup vX.X.X.exe` from [GitHub Releases](https://github.com/RingOnTheWay/XKAutoTester/releases), run the installer, and launch the app.

### Full Installer vs Lite Installer

| Type | Filename Pattern | Size | Bundled Environments |
|------|------------------|------|----------------------|
| **Full Installer** | `XKAutoTester Setup vX.X.X.exe` | Larger | Python 3.12 + Android SDK + Scrcpy + CP210x driver + .venv |
| **Lite Installer** | `XKAutoTester Setup vX.X.X-lite.exe` | Smaller | No bundled environments; user must configure manually |

> The lite installer suits users with pre-configured environments and significantly reduces download size.

---

## Method 2: Development Mode

### 1. Environment Prerequisites

#### 1.1 Python 3.10+ (3.12 recommended)

```bash
python --version
# Expected: Python 3.12.x
```

> `pyproject.toml` declares `requires-python = ">=3.10"`, but 3.12 is recommended to match the bundled version.

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

#### 1.5 Android SDK Platform-tools + Build-tools

```bash
adb --version
# Expected: Android Debug Bridge version 1.0.x

aapt2 version
# Expected: Android Asset Packaging Tool (aapt) 2.19-x
```

> Requires platform-tools 36 and build-tools 29.0.3 (required by aapt2). In development mode, place them in the `env/android-sdk/` directory for automatic detection.

#### 1.6 Scrcpy 3.x

```bash
scrcpy --version
# Expected: scrcpy 3.x
```

> In development mode, place it in the `env/scrcpy/` directory.

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

> `npm install` automatically runs the `postinstall` hook (`patch-nsis.js`) to patch the NSIS build configuration.

### 4. Launch the App

#### Option A: Vite Dev Mode (Recommended)

```bash
cd electron
npm run dev
```

Supports HMR (Hot Module Replacement) — UI refreshes automatically after code changes for the best development experience.

#### Option B: Legacy Electron Launch

```bash
cd electron
npm start
# or
npm run dev:legacy
```

No HMR, but compatible with the legacy workflow.

The app first displays a splash screen; after `EnvironmentStartupService` completes environment checks, it enters the main interface.

---

## First-launch Guide

### Interface Overview

The main interface contains 5 functional tabs, each following the MVC architecture (Controller / Model / View + Mixin):

| Tab                    | Function                                                               | MVC Path                       |
| ---------------------- | ---------------------------------------------------------------------- | ------------------------------ |
| **Test Execution**     | Test plan management, execution, report viewing, loop execution        | `tabs/test-execution/`         |
| **Page Package**       | App-Page-Element three-level locator management + Inspector            | `tabs/page-package/`           |
| **Test Case**          | Visual case editor, automatic Python code generation                   | `tabs/test-case/`              |
| **Android Connection** | Device connection, file management, APK install, Scrcpy mirroring, BLE device discovery | `tabs/android-connection/`     |
| **Settings**           | Language / theme / notifications / data path / version updates / anti-sleep | `tabs/settings/`               |

### Configure DingTalk Notifications (Optional)

In **Settings → Notifications**, configure the DingTalk bot Access Token and Secret to automatically push report summaries after tests complete (`NotificationService` uses HMAC-SHA256 signing).

### Choose Data Storage Path (Optional)

In **Settings → Directory → Config Storage Location**, customize the storage path for user data (test cases, plans, page packages, etc.). Defaults to the system AppData directory; custom paths are persisted to the Windows registry via `WindowsRegistryBridge`.

---

## Troubleshooting

| Symptom                         | Cause                                    | Solution                               |
| ------------------------------- | ---------------------------------------- | -------------------------------------- |
| "Python not found" on startup   | Python not installed or version mismatch | Install Python 3.12 and add to PATH, or use the full installer |
| "Node.js not found" on startup  | Node.js not installed                    | Install Node.js 22+                    |
| Allure report fails to generate | JDK not installed or too old             | Install JDK 17+ and set JAVA_HOME      |
| ADB cannot recognize devices    | Android SDK not configured               | Install platform-tools 36 and add to PATH, or place in `env/android-sdk/` |
| aapt2 APK parsing fails         | build-tools missing                      | Install build-tools 29.0.3, or place in `env/android-sdk/build-tools/` |
| "uv not found" on startup       | uv not installed                         | Run `pip install uv`                   |
| npm install fails               | Node.js version too old                  | Upgrade to Node.js 22+                 |
| Serial port not recognized      | CP210x driver not installed              | Run `env/CP210x_Windows_Drivers/CP210xVCPInstaller_x64.exe` |
| Scrcpy mirroring fails          | Scrcpy missing or too old                | Install Scrcpy 3.3.3, or place in `env/scrcpy/` |
| Vite mode fails to start        | electron-vite not installed              | Re-run `npm install`                   |

---

## Next Steps

- [02 - Test Case Management](02-test-case.md)
- [03 - Page Element Packaging](03-page-package.md)
- [04 - Test Execution & Reports](04-test-execution.md)
