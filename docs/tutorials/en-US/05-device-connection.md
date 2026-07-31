# 05 - Device Connection & Mirroring

> **Applicable Version**: v0.1.4+ | **Target Audience**: Experienced test engineers

---

## Overview

The **Android Connection** tab (`renderer/tabs/android-connection/`, with 10 Mixins) provides full lifecycle management for Android devices:

- ADB device connection (USB / wireless)
- Scrcpy real-time mirroring control
- Device file management (upload / download / browse)
- One-click APK installation
- BLE device discovery + serial port enumeration
- Serial port driver detection

---

## Workflow

```
Connect Android device (USB/WiFi) → Start Scrcpy mirroring → File management / APK install / BLE Mock configuration
```

---

## Step 1: Connect an Android Device

### 1.1 USB Connection

1. Enable **Developer Options** and **USB Debugging** on the Android device
2. Connect to the computer via USB cable
3. Click **Refresh Devices** in the **Android Connection** tab
4. `ADBService` scans connected devices via the `adb/` submodule:
   - `AdbCommandExecutor.js` executes `adb devices`
   - Returns a device list (serial + status)

### 1.2 Wireless Connection

1. Ensure the computer and Android device are on the same WiFi network
2. With USB connected, run `adb tcpip 5555`
3. Unplug the USB cable
4. In **Android Connection**, enter the device IP and click **Connect**
5. `device_connection.py` handles the wireless connection

### 1.3 Device Cascade Selection

Use the `device-cascade-select.js` component for cascade selection:
- Device serial → device details (model / Android version / resolution, etc.)

---

## Step 2: Scrcpy Mirroring

### 2.1 Start Mirroring

Click **Scrcpy Mirroring**:

1. `ScrcpyService` reads `SCRCPY_PARAMS` from `config.json`:
   ```json
   {
     "max_size": "1920",
     "video_bit_rate": "8",
     "max_fps": "60",
     "video_codec": "h264",
     "always_on_top": true
   }
   ```
2. Invokes `env/scrcpy/scrcpy.exe` (or scrcpy in PATH) to start mirroring
3. The mirroring window displays independently, supporting real-time mouse / keyboard control

### 2.2 Mirroring Parameters

Adjust in **Settings → Mirroring**:

| Parameter | Default | Description |
|-----------|---------|-------------|
| max_size | 1920 | Max resolution |
| video_bit_rate | 8 | Video bitrate (Mbps) |
| max_fps | 60 | Max frame rate |
| video_codec | h264 | Video codec (h264/h265/av1) |
| always_on_top | true | Window on top |

---

## Step 3: Device File Management

### 3.1 Browse Device Files

Via `DataTransferService` (aggregating `adb/FileTransferService.js` + `adb/RemoteStatService.js`):

- Browse device directories (`ls` command)
- View file size / permissions / modification time (`RemoteStatService`)
- Enter subdirectories / go back up

### 3.2 Upload Files

Click **Upload** and select a local file:

1. `FileTransferService.push()` invokes `adb push`
2. `AdbProgressMonitor.js` monitors transfer progress
3. Refreshes the directory on completion

### 3.3 Download Files

Select a device file and click **Download**:

1. `FileTransferService.pull()` invokes `adb pull`
2. Choose a local save path
3. `AdbProgressMonitor.js` monitors progress

### 3.4 Remote stat

`RemoteStatService.js` retrieves remote file metadata via `adb shell stat`, used to:
- Display file size / modification time
- Distinguish files / directories

---

## Step 4: APK Installation

### 4.1 Select APK to Install

Click **Install APK**:

1. Select a local APK file
2. `adb/ApkInstaller.js` invokes `adb install -r <path>`
3. `AdbProgressMonitor.js` shows installation progress
4. Installation result pushed via Toast notification

### 4.2 Drag-and-Drop Install

Supports dragging APK files directly into the device file management area to auto-trigger installation.

### 4.3 Split APK Installation

Supports `.apks` / `.xapk` split APK packages:
1. `TarExtractor.js` extracts the package
2. Filter splits by architecture
3. `adb install-multiple` installs

---

## Step 5: BLE Device Discovery (New)

### 5.1 Serial Port Enumeration

Click **Scan Serial Ports**:

1. `SerialPortEnumerator.js` enumerates COM ports via Windows registry / `mode` command
2. Returns a list of available serial ports (e.g. `COM3`, `COM7`)

### 5.2 BLE Device Discovery

Click **Scan BLE Devices**:

1. `BleDeviceDiscoveryService` scans connected BLE devices
2. Verifies device identity (MB026A module) via serial communication
3. Returns a device list (name + serial port + signal)

### 5.3 Driver Detection

`DriverChecker.js` checks whether the CP210x serial driver is installed:
- Queries Windows Device Manager / registry
- If not installed, prompts the user to run `env/CP210x_Windows_Drivers/CP210xVCPInstaller_x64.exe`

### 5.4 Add a BLE Device

1. Click **Add BLE Device**
2. Fill in:
   - Device name (e.g. `Thermometer_Mock`)
   - Serial port (select from scan results)
   - Baud rate (default 9600)
   - Device type (e.g. `bioland_thermometer`)
3. Save to `config/ble_device.json`

### 5.5 BLE Device Management

- **Edit** — Modify device parameters
- **Delete** — Remove device
- **Test Connection** — Send a test command via serial port

> BLE devices are used by `start_ble_mock` / `stop_ble_mock` steps in test cases. See [02 - Test Case Management](02-test-case.md).

---

## ADB Command Execution

**Android Connection** provides an ADB command execution entry (`deviceHandlers.executeAdbCommand`):

- Input an ADB command (e.g. `shell pm list packages`)
- Execute via `AdbCommandExecutor.js`
- Output displayed in the console

> Note: Paths with spaces or special characters are auto-escaped by `AdbPathQuoter.js` to prevent shell injection.

---

## Next Steps

- [02 - Test Case Management](02-test-case.md) (BLE Mock configuration)
- [06 - Scheduled Plans & Loop Execution](06-scheduled-plan.md)
