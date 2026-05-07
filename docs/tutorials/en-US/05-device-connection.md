# 05 - Device Connection & Screen Mirroring

> **Applicable Version**: v0.1.3+ | **Target Audience**: Experienced test engineers

---

## Overview

The **Android Connection** tab provides full lifecycle management for Android devices:

- Device discovery & connection (USB / Wireless ADB)
- Device info display (manufacturer, model, Android version, WiFi, battery, storage, memory)
- Scrcpy screen mirroring & control
- File manager (browse, upload, download, delete, rename)
- One-click APK installation
- BLE mock device serial port management

![Android Connection Main Interface](../images/05-device-main.png)

---

## Workflow

```
Connect device → View device info → (Optional) Start screen mirroring → (Optional) File management / APK install
```

---

## Step 1: Connect a Device

### 1.1 Device Management Modal

Click **Device Management** to open the device management modal.

The modal auto-scans connected devices (USB + ADB wireless):

![Device Management Modal](../images/05-device-management.png)

### 1.2 Select a Device

- Left list shows all available devices
- Click a device entry to view detailed info on the right
- Click **Confirm Selection** to set the active device

### 1.3 Add Device by IP

If a device is not in the list (e.g. for wireless connection):

1. Click **Add Device by IP** in the device list
2. Enter an IP address or `IP:Port` (default port 5555)
3. Click ✓ to confirm connection

![Add Device by IP](../images/05-add-device-ip.png)

### 1.4 Open Port 5555

For USB-connected devices, select one and click **Open Port 5555**; the system executes `adb tcpip 5555`, enabling wireless ADB.

> [!NOTE]
> After opening the port, disconnect USB and reconnect wirelessly via IP.

---

## Step 2: View Device Information

After successfully selecting a device, the **Device Info Card** unlocks, showing real-time status:

| Info Item | Source Command |
|-----------|---------------|
| **Manufacturer** | `adb shell getprop ro.product.manufacturer` |
| **Model** | `adb shell getprop ro.product.model` |
| **Android Version** | `adb shell getprop ro.build.version.release` |
| **WiFi** | `adb shell dumpsys netstats | grep ...` |
| **Battery Level** | `adb shell dumpsys battery` |
| **Storage Usage** | `adb shell df` |
| **Memory Usage** | `adb shell dumpsys meminfo` |

![Device Info](../images/05-device-info.png)

---

## Step 3: Screen Control (Scrcpy)

### 3.1 Start Mirroring

After selecting a device, click **Screen Control** to start the scrcpy mirroring window:

- Real-time device screen mirroring
- Mouse-click to directly interact with the device UI
- Clipboard sync support

### 3.2 Configure Control Parameters

Click **Control Params** to open the parameter configuration modal:

| Parameter | Description | Default | Range |
|-----------|-------------|---------|-------|
| **Max Resolution** | Maximum video output width | 1920 | 320~6000 |
| **Video Bit Rate** | Video quality | 8 Mbps | 1~50 |
| **Max FPS** | Refresh rate | 60 FPS | 1~600 |
| **Video Codec** | Encoding format | h264 | h264 / h265 / av1 |
| **Always on Top** | Keep mirroring window on top | On | On/Off |

These parameters inherit defaults from global settings in `config/config.json` → `SCRCPY_PARAMS`.

![Control Params Modal](../images/05-control-params.png)

---

## Step 4: File Management

The right panel provides a file manager for the Android device, similar to a desktop file explorer.

### 4.1 Navigation

| Action | Method |
|--------|--------|
| **Enter directory** | Click a directory row |
| **Go up** | **Back** button |
| **Refresh** | **Refresh** button |
| **Path jump** | Click the `...` button in the path display area for a path hierarchy menu |
| **Select all** | Click the header checkbox |

![File Manager](../images/05-file-manager.png)

### 4.2 File Operations

| Operation | Button | Description |
|-----------|--------|-------------|
| **Upload** | **Upload** | Select local files to upload to the current device directory |
| **Download** | **Download** | Download device files to local (shows progress bar) |
| **Delete** | **Delete** | Delete selected files/directories |
| **Rename** | Right-click → Rename | Modify file or directory name |
| **Install APK** | **Install APK** | Select a local APK file for installation |

> [!TIP]
> Right-click a file row to bring up the context menu (Download / Rename / Delete).

### 4.3 Download Progress

Downloads show a real-time progress bar:

- Progress percentage + current file / total files
- 5-second countdown auto-close for the progress panel
- Error details shown on download failure

![Download Progress](../images/05-download-progress.png)

---

## Step 5: APK Installation

In the file manager:

1. Click **Install APK**
2. Select a `.apk` file in the file dialog
3. The system installs the APK to the currently selected device via `adb install`

Installation progress (including success/failure status) is pushed to the UI in real-time via IPC events.

---

## BLE Mock Device Port Management

In the device management modal, you can manage serial ports for BLE mock devices:

### Port Scanning

Click **Port Management** to auto-scan available system serial ports (COM ports).

### Select a Port

Choose the port occupied by the BLE mock device from the scanned list and confirm to associate it with the current test configuration.

![Port Management](../images/05-port-management.png)

Full BLE device configuration (name, baud rate, data format, etc.) is in `config/ble_device.json`.

---

## Command Reference

Device management is essentially ADB commands wrapped in a graphical UI:

| GUI Operation | Underlying Command |
|---------------|-------------------|
| Scan devices | `adb devices` |
| Open port 5555 | `adb tcpip 5555` |
| IP connect | `adb connect <ip>:5555` |
| File listing | `adb shell ls -al <path>` |
| Upload file | `adb push <local> <remote>` |
| Download file | `adb pull <remote> <local>` |
| Install APK | `adb install <apk>` |
| Start mirroring | `scrcpy --max-size=1920 ...` |

---

## Next Steps

- [04 - Test Execution & Reports](04-test-execution.md)
- [06 - Scheduled Plans & Loop Execution](06-scheduled-plan.md)
