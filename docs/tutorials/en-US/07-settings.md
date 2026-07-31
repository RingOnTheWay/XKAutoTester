# 07 - System Settings

> **Applicable Version**: v0.1.4+ | **Target Audience**: Experienced test engineers

---

## Overview

The **Settings** tab (`renderer/tabs/settings/`, with 5 Mixins) provides global app configuration:

- Language switching (Chinese / English)
- Theme (light / dark / theme color)
- DingTalk notification configuration
- Data storage path management
- Version info & auto-update
- Anti-system-sleep
- Driver detection

---

## Workflow

```
Enter Settings tab → Select config item → Modify → Auto-save to config.json
```

---

## Step 1: Language Switching

### 1.1 Switch Language

In the **Language** dropdown, choose **Simplified Chinese** or **English**:

1. `I18nService` (inheriting i18next) switches the language
2. Translation files are in `electron/locales/{zh-CN,en-US}/translation.json`
3. UI refreshes instantly — no restart needed

### 1.2 Backend i18n

The Python backend provides internationalization via `utils/i18n.py` (singleton + `_initialized` guard):
- Used for localizing error messages and logs
- Stays in sync with the frontend language

---

## Step 2: Theme Settings

### 2.1 Light / Dark Mode

Toggle the **Dark Mode** switch:

- `APP_SETTINGS.dark_mode` written to `config.json`
- `styles.css` imports 15 CSS modules via `@import`, auto-applying the `[data-theme="dark"]` selector

### 2.2 Theme Color

Pick a theme color in the palette (default `#4CAF50`):

- `APP_SETTINGS.theme_color` written to `config.json`
- Applied globally via the CSS variable `--theme-color`

---

## Step 3: DingTalk Notifications

### 3.1 Configure DingTalk Bot

| Field | Description |
|-------|-------------|
| **Access Token** | The access_token from the DingTalk bot's Webhook URL |
| **Secret** | The signing secret from the bot's security settings |

### 3.2 Test Notification

Click **Test Notification**:

1. `NotificationService` constructs a test message
2. Signs with HMAC-SHA256 (timestamp + secret)
3. Sends to the DingTalk Webhook via `axios`
4. Result displayed via Toast

### 3.3 Notification Triggers

- Test execution complete (automatic)
- Test report generation complete (automatic)
- Manual trigger (test notification button)

---

## Step 4: Data Storage Path

### 4.1 Default Path

Defaults to the Windows AppData directory:
- `%APPDATA%\Xkautotester\config\` — Config directory
- `%APPDATA%\Xkautotester\` — Data directory

### 4.2 Custom Path

Click **Change Path** and select a new directory:

1. `UserDataService.changeDataPath(newPath)` triggers:
   - `UserDataMigrator` copies existing data to the new path
   - `WindowsRegistryBridge` persists the new path to the Windows registry
2. Prompts to restart the app
3. After restart, loads data from the new path

### 4.3 Reset Path

Click **Reset to Default** to restore the AppData default path.

### 4.4 Data Migration Mechanism

On version upgrades, `UserDataMigrator` auto-syncs new config items:
- Records the last migration version via `data-version.json`
- Compares with the current version and applies necessary migration rules
- Preserves existing user config; only adds new fields

---

## Step 5: Version & Auto-Update

### 5.1 View Version Info

`VersionService` reads from `version.json`:

| Field | Example | Description |
|-------|---------|-------------|
| version | `0.1.4` | Main version |
| buildDate | `2026-05-21` | Build date |
| prerelease | `dev.2` | Pre-release identifier |
| fullVersion | `0.1.4-dev.2` | Full version |

### 5.2 Check for Updates

Click **Check for Updates**:

1. `UpdateService` calls the GitHub Releases API
2. Compares the current version with the latest release
3. Returns update info (version / release date / release notes)

### 5.3 Download & Install

If a new version is available:

1. Click **Download Update**
2. `UpdateService` downloads the installer to a temp directory
3. Real-time download progress shown via IPC event `on-download-progress`
4. After download, click **Install Update**
5. The app exits and launches the NSIS installer
6. After installation, the app restarts

### 5.4 Auto-Check

Enable the **Auto-check Updates** switch (`APP_SETTINGS.autoCheckUpdate`):
- Checks automatically on app startup
- Toast notification on new versions

---

## Step 6: Anti-System-Sleep

### 6.1 Enable Anti-Sleep

Toggle the **Anti-System-Sleep** switch:

- When enabled, `powerHandlers.setPreventSleep(true)` calls Electron `powerSaveBlocker.start('prevent-display-sleep')`
- The system won't sleep during test execution
- Auto-stops on app exit

### 6.2 Persistence

Settings saved to `config.json`; restored on app startup via `restorePreventSleepSetting()`.

---

## Step 7: Driver Detection

### 7.1 Serial Driver Detection

`DriverChecker` detects the CP210x serial driver:
- Checks the Windows Device Manager
- If not installed, prompts to run `env/CP210x_Windows_Drivers/CP210xVCPInstaller_x64.exe`

### 7.2 ADB Driver Detection

`EnvironmentService` checks ADB availability:
- Calls `adb version`
- On failure, prompts to install Android SDK platform-tools or use the full installer

---

## Configuration File Structure

All settings persist to `config/config.json`:

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

> `config.json` is the **single source of truth** (single-source config); both JS and Python read from it — no hardcoded copies.

---

## Next Steps

- [01 - Installation & Environment Setup](01-installation.md) (troubleshooting)
- [04 - Test Execution & Reports](04-test-execution.md)
