# 05 - 设备连接与投屏

> **适用版本**: v0.1.4+ | **目标读者**: 有自动化测试经验的测试工程师

---

## 概述

「安卓连接」Tab（`renderer/tabs/android-connection/`，含 10 个 Mixin）提供 Android 设备全生命周期管理：

- ADB 设备连接（USB / 无线）
- Scrcpy 实时投屏控制
- 设备文件管理（上传 / 下载 / 浏览）
- APK 一键安装
- 蓝牙设备发现 + 串口枚举
- 串口驱动检测

---

## 整体流程

```
连接 Android 设备（USB/WiFi）→ 启动 Scrcpy 投屏 → 文件管理 / APK 安装 / 蓝牙 Mock 配置
```

---

## 步骤 1：连接 Android 设备

### 1.1 USB 连接

1. 在 Android 设备上启用「开发者选项」与「USB 调试」
2. 用 USB 线连接电脑
3. 在「安卓连接」Tab 点击「刷新设备」按钮
4. `ADBService` 通过 `adb/` 子模块扫描已连接设备：
   - `AdbCommandExecutor.js` 执行 `adb devices`
   - 返回设备列表（serial + 状态）

### 1.2 无线连接

1. 确保电脑与 Android 设备在同一 WiFi 网络
2. 在 USB 连接状态下执行 `adb tcpip 5555`
3. 拔掉 USB 线
4. 在「安卓连接」中输入设备 IP，点击「连接」
5. `device_connection.py` 处理无线连接

### 1.3 设备级联选择

通过 `device-cascade-select.js` 组件级联选择：
- 设备 serial → 设备详细信息（型号 / 安卓版本 / 分辨率等）

---

## 步骤 2：Scrcpy 投屏

### 2.1 启动投屏

点击「Scrcpy 投屏」按钮：

1. `ScrcpyService` 读取 `config.json` 中的 `SCRCPY_PARAMS`：
   ```json
   {
     "max_size": "1920",
     "video_bit_rate": "8",
     "max_fps": "60",
     "video_codec": "h264",
     "always_on_top": true
   }
   ```
2. 调用 `env/scrcpy/scrcpy.exe`（或 PATH 中的 scrcpy）启动投屏
3. 投屏窗口独立显示，支持实时鼠标 / 键盘控制

### 2.2 投屏参数

可在「设置 → 投屏」中调整：

| 参数 | 默认值 | 说明 |
|------|------|------|
| max_size | 1920 | 最大分辨率 |
| video_bit_rate | 8 | 视频码率（Mbps） |
| max_fps | 60 | 最大帧率 |
| video_codec | h264 | 视频编码（h264/h265/av1） |
| always_on_top | true | 窗口置顶 |

---

## 步骤 3：设备文件管理

### 3.1 浏览设备文件

通过 `DataTransferService`（聚合 `adb/FileTransferService.js` + `adb/RemoteStatService.js`）：

- 浏览设备目录（`ls` 命令）
- 查看文件大小 / 权限 / 修改时间（`RemoteStatService`）
- 进入子目录 / 返回上级

### 3.2 上传文件

点击「上传」按钮，选择本地文件：

1. `FileTransferService.push()` 调用 `adb push`
2. `AdbProgressMonitor.js` 监控传输进度
3. 完成后刷新目录

### 3.3 下载文件

选中设备文件，点击「下载」：

1. `FileTransferService.pull()` 调用 `adb pull`
2. 选择本地保存路径
3. `AdbProgressMonitor.js` 监控进度

### 3.4 远程 stat

`RemoteStatService.js` 通过 `adb shell stat` 获取远程文件元数据，用于：
- 显示文件大小 / 修改时间
- 区分文件 / 目录

---

## 步骤 4：APK 安装

### 4.1 选择 APK 安装

点击「安装 APK」按钮：

1. 选择本地 APK 文件
2. `adb/ApkInstaller.js` 调用 `adb install -r <path>`
3. `AdbProgressMonitor.js` 显示安装进度
4. 安装结果通过 Toast 通知

### 4.2 拖拽安装

支持将 APK 文件直接拖拽到设备文件管理区域，自动触发安装。

### 4.3 多 APK 拆分安装

支持 `.apks` / `.xapk` 等拆分 APK 包：
1. `TarExtractor.js` 解压包
2. 按架构筛选对应 split
3. `adb install-multiple` 安装

---

## 步骤 5：蓝牙设备发现（新增）

### 5.1 串口枚举

点击「扫描串口」按钮：

1. `SerialPortEnumerator.js` 通过 Windows 注册表 / `mode` 命令枚举 COM 端口
2. 返回可用串口列表（如 `COM3`, `COM7`）

### 5.2 蓝牙设备发现

点击「扫描 BLE 设备」按钮：

1. `BleDeviceDiscoveryService` 扫描已连接的 BLE 设备
2. 通过串口通信验证设备身份（MB026A 模块）
3. 返回设备列表（名称 + 串口 + 信号）

### 5.3 驱动检测

`DriverChecker.js` 检测 CP210x 串口驱动是否已安装：
- 通过 Windows 设备管理器 / 注册表查询
- 未安装时提示用户运行 `env/CP210x_Windows_Drivers/CP210xVCPInstaller_x64.exe`

### 5.4 添加蓝牙设备

1. 点击「添加蓝牙设备」
2. 填写：
   - 设备名称（如 `体温计_Mock`）
   - 串口端口（从扫描结果选择）
   - 波特率（默认 9600）
   - 设备类型（如 `bioland_thermometer`）
3. 保存到 `config/ble_device.json`

### 5.5 蓝牙设备管理

- **编辑** — 修改设备参数
- **删除** — 移除设备
- **测试连接** — 通过串口发送测试指令

> 蓝牙设备用于测试用例中的 `start_ble_mock` / `stop_ble_mock` 步骤，详见 [02 - 测试用例管理](02-test-case.md)。

---

## ADB 命令执行

「安卓连接」提供 ADB 命令执行入口（`deviceHandlers.executeAdbCommand`）：

- 输入 ADB 命令（如 `shell pm list packages`）
- 通过 `AdbCommandExecutor.js` 执行
- 输出结果显示在控制台

> 注意：路径含空格或特殊字符时由 `AdbPathQuoter.js` 自动转义，避免 shell 注入。

---

## 下一步

- [02 - 测试用例管理](02-test-case.md)（蓝牙 Mock 配置）
- [06 - 定时计划与循环执行](06-scheduled-plan.md)
