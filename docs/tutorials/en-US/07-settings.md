# 07 - System Settings

> **Applicable Version**: v0.1.3+ | **Target Audience**: Experienced test engineers

---

## Overview

The **Settings** tab centrally manages all configurable options across 6 categories:

| Category | Covered Items |
|----------|--------------|
| **Directory** | Default download path, config data storage location |
| **Display** | Dark mode, theme color, UI language |
| **Notification** | DingTalk bot push configuration |
| **Data** | Allure report cleanup, log cleanup |
| **Run** | Prevent system sleep toggle |
| **Updates** | Auto-update toggle, manual update check |

All settings persisted in `config/config.json`.

![Settings Main Interface](../images/07-settings-main.png)

---

## Directory Settings

### Default Download Path

Set the default save directory when downloading files from a device:

1. Click **Browse** to choose a directory
2. The path appears in the input field
3. Click **Clear** to reset (manual selection required on download)

![Default Download Path](../images/07-download-path.png)

### Config Storage Location

Customize the storage path for user data (test cases, plans, page packages, BLE devices, etc.):

| Action | Button | Description |
|--------|--------|-------------|
| **Custom path** | **Browse** | Choose target folder |
| **Restore default** | **Restore** | Reset to system AppData directory |

**On first setup**, the system copies default configurations from the installation directory to the new path and completes data migration.

> [!WARNING]
> Changing the config storage location triggers an app restart. Ensure no tests are currently executing.

![Config Storage Location](../images/07-config-storage.png)

---

## Display Settings

### Dark Mode

| State | Effect |
|-------|--------|
| **On** | Global dark theme, reduced brightness, suitable for nighttime |
| **Off** | Material Design light theme |

Changes take effect immediately — no restart needed.

![Dark Mode](../images/07-dark-mode.png)

### Theme Color

5 preset theme colors plus custom HEX input:

| Preset | HEX |
|--------|-----|
| Blue | `#2196F3` |
| Green | `#4CAF50` |
| Orange | `#FF9800` |
| Purple | `#9C27B0` |
| Red | `#F44336` |
| Brown | `#795548` |
| **Custom** | Enter any HEX value (e.g. `#00BCD4`) |

Theme color applies to navigation, buttons, progress bars, and other UI elements.

![Theme Color Settings](../images/07-theme-color.png)

### Language

| Option | Value |
|--------|-------|
| Simplified Chinese | `zh-CN` |
| English | `en-US` |

UI text updates instantly on switch (via i18next) — no refresh needed.

![Language Settings](../images/07-language.png)

---

## Notification Settings

XKAutoTester can push test report summaries via DingTalk bot after test completion.

### Select Notification Platform

| Option | Description |
|--------|-------------|
| **None** | No notifications sent |
| **DingTalk** | Push via DingTalk bot Webhook |

Selecting DingTalk reveals Access Token and Secret input fields below.

![Notification Platform Selection](../images/07-notification-platform.png)

### Configure DingTalk Bot

| Parameter | Description | How to Obtain |
|-----------|-------------|---------------|
| **Access Token** | The `access_token` parameter from the bot's Webhook URL | DingTalk group → Group Settings → Smart Assistant → Add Bot → Webhook URL |
| **Secret** | HMAC-SHA256 signing secret | Bot Security Settings → Signing → Copy Secret |

#### Configuration Steps

1. Create a custom bot in a DingTalk group, choose "Signing" security mode
2. Copy the `access_token` value from the Webhook URL into the Token field
3. Copy the signing Secret into the Secret field
4. Save the configuration

After test completion, the system POSTs a test summary to the Webhook using HMAC-SHA256 signing:

- Test plan name
- Passed/failed/skipped counts
- Execution duration
- Report link (if available)

![DingTalk Notification Configuration](../images/07-dingtalk-config.png)

---

## Data Management

### Clear Allure Reports

Click **Clear** to delete all historical Allure report result files and free disk space.

> [!CAUTION]
> This action is irreversible; historical report data will be permanently deleted.

### Clear All Logs

Click **Clear** to delete application runtime log files.

![Data Management](../images/07-data-management.png)

---

## Run Settings

### Prevent System Sleep

| State | Effect |
|-------|--------|
| **On** | During test execution, the `powerSaveBlocker` API prevents Windows from entering sleep/hibernation |
| **Off** | System sleep policy unaffected |

> [!TIP]
> Recommended for long-running test plans, especially scheduled plans.

![Prevent Sleep Settings](../images/07-prevent-sleep.png)

---

## Update Settings

### Auto-check for Updates

| State | Effect |
|-------|--------|
| **On** | Automatically checks GitHub Releases for new versions on app startup |
| **Off** | Manual check only |

### Check Updates Manually

Click **Check Now**:

1. System queries the GitHub Releases API
2. If a newer version exists, a **Version Update** modal appears, showing the new version and changelog
3. Click **Download Update** to download the new installer (with progress bar)
4. After download, click install; the app restarts automatically to complete the update

![Check for Updates](../images/07-check-update.png)

![Update Modal](../images/07-update-modal.png)

---

## Configuration File Structure

All settings stored in `config/config.json`:

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

---

## Configuration Sync & Migration

- On app upgrades, `UserDataService` automatically merges new config items from the installer into user configs
- User-customized configs (under the AppData directory) are unaffected by installer upgrades
- Use **Config Storage Location** to migrate user data to a custom path

---

## Next Steps

- [01 - Installation & Environment Setup](01-installation.md)
- [04 - Test Execution & Reports](04-test-execution.md)
