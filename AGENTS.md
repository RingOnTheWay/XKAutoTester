# XKAutoTester - Agent 信息文档

## 项目概述

XKAutoTester 是一个基于 Electron + Python 的自动化测试平台，用于移动端应用的自动化测试，支持 Appium 驱动、Appium Inspector 元素检查、蓝牙设备模拟、定时任务调度、scrcpy 投屏、APK 解析、钉钉通知、自动更新等功能。

- **版本**: 0.1.6-dev.1
- **技术栈**: Electron 43 + Node.js + Python 3.10+（内置 3.12）+ Vite 7.3.6 / electron-vite 5.0.0 + Appium + Pytest + Allure
- **工程化**: ESLint 9 (flat, `--max-warnings 0`) + Prettier + Ruff + GitHub Actions CI（Electron/Python 双 job，含 npm audit + uv audit 依赖漏洞扫描）
- **打包工具**: electron-builder (NSIS 安装程序，含 lite 版本)
- **Python 包管理**: uv
- **国际化**: i18next (zh-CN / en-US)
- **作者**: RiNG
- **许可证**: MIT

***

## 项目架构

```
XKAutoTester/
├── eslint.config.mjs                    # ESLint 9 flat config（R25 P3-17: 位于项目根, base path 覆盖 electron/ + tests/）
├── pyproject.toml                       # Python 项目配置 (uv)
├── uv.lock                              # uv 锁文件
├── tests/                               # 测试（electron 单测 node:test + unit Python pytest）
├── config/                              # 配置文件目录（随安装包分发）
│   ├── config.json                      # 应用设置（日志/投屏/主题/语言/通知/更新）
│   ├── ble_device.json                  # 蓝牙设备配置
│   ├── page_package.json                # 页面封装（应用/页面/元素定位器）
│   ├── pytest.ini                       # Pytest 配置
│   ├── test_cases/                      # 测试用例 JSON 文件（运行时创建）
│   ├── test_plans.json                  # 测试计划（运行时创建）
│   └── scheduled_plans.json             # 定时计划（运行时创建）
├── electron/                            # Electron 前端
│   ├── src/
│   │   ├── main/                        # 主进程
│   │   │   ├── ElectronApp.js           # 应用入口，管理窗口/启动页/服务生命周期
│   │   │   ├── index.js                 # 主进程入口，初始化所有服务并注册 IPC
│   │   │   ├── handlers/                # IPC 处理器
│   │   │   │   ├── base/
│   │   │   │   │   └── handlerUtils.js  # IPC 注册工具（registerHandler/registerHandlers）
│   │   │   │   ├── index.js             # 处理器统一注册入口
│   │   │   │   ├── windowHandlers.js    # 窗口控制（最小化/最大化/关闭/拖拽/鼠标穿透）
│   │   │   │   ├── fileHandlers.js      # 文件对话框（选择目录/文件/APK）
│   │   │   │   ├── configHandlers.js    # 配置读写/数据路径管理/应用重启
│   │   │   │   ├── environmentHandlers.js # 环境检查（JDK/SDK/Python）
│   │   │   │   ├── deviceHandlers.js    # 设备连接/ADB命令/scrcpy投屏
│   │   │   │   ├── adbHandlers.js       # APK 安装
│   │   │   │   ├── apkHandlers.js       # APK 解析（包名/版本/Activity）
│   │   │   │   ├── testCaseHandlers.js  # 测试用例 CRUD + Python 代码生成
│   │   │   │   ├── testPlanHandlers.js  # 测试计划管理
│   │   │   │   ├── scheduledPlanHandlers.js # 定时计划管理 + 冲突检查
│   │   │   │   ├── pagePackageHandlers.js # 页面封装操作（应用/页面/元素 CRUD + 搜索/统计）
│   │   │   │   ├── bleDeviceDiscoveryHandlers.js # 蓝牙设备发现 + 串口枚举
│   │   │   │   ├── dataTransferHandlers.js # 设备文件上传/下载/远程 stat
│   │   │   │   ├── inspectorHandlers.js  # Appium Inspector 元素检查器
│   │   │   │   ├── reportHandlers.js    # Allure 报告查看/清理 + 钉钉通知
│   │   │   │   ├── versionHandlers.js   # 版本信息查询
│   │   │   │   ├── updateHandlers.js    # 自动更新（检查/下载/安装）
│   │   │   │   └── powerHandlers.js     # 防睡眠模式（powerSaveBlocker）
│   │   │   ├── services/                # 业务服务层
│   │   │   │   ├── base/
│   │   │   │   │   └── JsonFileCrudService.js # JSON 文件 CRUD 基类
│   │   │   │   ├── adb/                 # ADB 子模块
│   │   │   │   │   ├── AdbCommandExecutor.js  # ADB 命令执行器
│   │   │   │   │   ├── AdbPathQuoter.js       # ADB 路径转义
│   │   │   │   │   ├── ApkInstaller.js        # APK 安装
│   │   │   │   │   ├── FileTransferService.js # 文件推/拉
│   │   │   │   │   └── RemoteStatService.js   # 远程 stat
│   │   │   │   ├── allure/              # Allure 子模块
│   │   │   │   │   ├── AllureCliInvoker.js    # Allure CLI 调用
│   │   │   │   │   └── AllureHttpServer.js    # Allure HTTP 服务
│   │   │   │   ├── apk/                 # APK 解析子模块
│   │   │   │   │   ├── Aapt2Invoker.js        # aapt2 调用
│   │   │   │   │   ├── Aapt2OutputParser.js   # aapt2 输出解析
│   │   │   │   │   └── LocaleLabelResolver.js # 多语言标签解析
│   │   │   │   ├── application/         # ElectronApp 生命周期
│   │   │   │   │   ├── applicationService.js
│   │   │   │   │   ├── effects.js
│   │   │   │   │   ├── factories.js
│   │   │   │   │   └── index.js
│   │   │   │   ├── scheduler/           # 调度器子模块
│   │   │   │   │   ├── planQueue.js        # 最小堆优先队列
│   │   │   │   │   ├── smartScheduler.js   # 智能调度 orchestrator（状态机 + timer 协调）
│   │   │   │   │   ├── strategies.js       # 调度策略
│   │   │   │   │   ├── effects.js
│   │   │   │   │   └── index.js
│   │   │   │   ├── ADBService.js        # ADB 门面（聚合 adb/ 子模块）
│   │   │   │   ├── AdbProgressMonitor.js # ADB 进度监控
│   │   │   │   ├── AllureService.js     # Allure 报告服务（聚合 allure/ 子模块）
│   │   │   │   ├── ApkParserService.js  # APK 解析门面（聚合 apk/ 子模块）
│   │   │   │   ├── BleDeviceDiscoveryService.js # 蓝牙设备发现 + 串口扫描
│   │   │   │   ├── DataTransferService.js # 设备文件传输门面
│   │   │   │   ├── DriverChecker.js     # 串口/USB 驱动检测
│   │   │   │   ├── EnvironmentService.js # 环境检查（JDK/Android SDK/Python）
│   │   │   │   ├── EnvironmentStartupService.js # 启动期环境编排
│   │   │   │   ├── FileBasedDialogMonitor.js # 文件对话框监控
│   │   │   │   ├── I18nService.js       # 国际化服务（i18next 初始化/语言切换）
│   │   │   │   ├── InspectorService.js  # Appium Inspector 集成
│   │   │   │   ├── JsonStdioTransport.js # stdio JSON 协议传输（Inspector + Python 后端）
│   │   │   │   ├── NotificationService.js # 钉钉机器人通知（HMAC-SHA256 签名）
│   │   │   │   ├── PagePackageService.js # 页面封装 CRUD（继承 JsonFileCrudService）
│   │   │   │   ├── PythonTestService.js # Python 测试执行（子进程调用 __main__.py）
│   │   │   │   ├── ScheduledPlanService.js # 定时计划管理（继承 JsonFileCrudService）
│   │   │   │   ├── ScrcpyService.js     # scrcpy 投屏控制（参数化启动）
│   │   │   │   ├── SerialPortEnumerator.js # 串口枚举
│   │   │   │   ├── TarExtractor.js      # tar 解压（APK/资源处理）
│   │   │   │   ├── TestCaseCodeGenerator.js # 测试用例 Python 代码生成（单文件, 原 5 mixin 合回）
│   │   │   │   ├── TestCaseService.js   # 测试用例 CRUD（自管理 JSON I/O, 未继承 JsonFileCrudService; 内部依赖 TestCaseCodeGenerator）
│   │   │   │   ├── TestPlanService.js   # 测试计划管理（继承 JsonFileCrudService）
│   │   │   │   ├── UpdateService.js     # 自动更新（GitHub Releases API 下载/安装）
│   │   │   │   ├── UserDataMigrator.js  # 用户数据迁移（从 UserDataService 拆出）
│   │   │   │   ├── UserDataService.js   # 用户数据路径管理（AppData 迁移/配置同步）
│   │   │   │   ├── VersionService.js    # 版本信息读取（version.json）
│   │   │   │   ├── WindowsRegistryBridge.js # Windows 注册表桥接
│   │   │   │   └── spawnHelper.js       # 子进程辅助
│   │   │   └── utils/
│   │   │       ├── pathHelper.js        # 路径解析（开发/打包环境 + aapt2/adb 路径缓存）
│   │   │       ├── asyncFs.js           # 异步文件操作工具
│   │   │       ├── logger.js            # 日志工具
│   │   │       ├── urlGuard.js          # openExternal URL 安全校验（https + host 白名单）
│   │   │       └── versionCompare.js    # 语义化版本比较（原 EnvironmentService/UpdateService 抽取）
│   │   ├── preload/
│   │   │   └── index.js                 # Preload 桥接脚本（contextBridge 暴露 electronAPI）
│   │   └── shared/
│   │       ├── constants.js             # IPC 通道常量定义（主进程/渲染进程共享）
│   │       ├── inspectorConstants.js    # Inspector 通道/事件常量
│   │       └── inspector-protocol.json  # Inspector stdio 协议消息定义
│   ├── renderer/                        # 渲染进程（MVC 架构；注意位于 electron/renderer，不在 src/ 下）
│   │   ├── core/                        # 核心基类
│   │   │   ├── Action.js                # Action 抽象
│   │   │   ├── ApiBridge.js             # electronAPI 桥接
│   │   │   ├── AppState.js              # 全局状态
│   │   │   ├── EventEmitter.js          # 事件发射器
│   │   │   └── utils/                   # html.js + confirmModal.js（通用确认弹窗 Promise 版，P2-3 收敛）+ scheduledPlanStatus.js（定时计划状态公共映射）
│   │   ├── tabs/                        # 5 个 Tab（MVC 单体：controller/model/view/index/tab.html；mixin 已全部合回）
│   │   │   ├── test-execution/          # 测试执行
│   │   │   ├── page-package/            # 页面封装
│   │   │   ├── test-case/               # 测试用例（含 modules/：FileBrowser/OptionPanel/StepEditor/TestCaseEditor/selectFieldRoutes）
│   │   │   ├── android-connection/      # 安卓连接
│   │   │   └── settings/                # 设置
│   │   ├── components/                  # UI 组件
│   │   │   ├── mixins/                  # 组件 Mixin（11 个：Canvas/Highlighter/Loading/Locator/SessionLifecycle/Tree/deviceModal*）
│   │   │   ├── base-select.js           # 基础选择器（级联/自定义选择统一基座）
│   │   │   ├── custom-select.html       # 自定义下拉模板
│   │   │   ├── datetime-picker.js/.html # 日期时间选择器（独立组件）
│   │   │   ├── device-cascade-select.js # 设备级联选择
│   │   │   ├── device-selection-modal.js # 设备选择弹窗
│   │   │   ├── inspector.js             # Appium Inspector 弹窗（含 6 个 mixin: SessionLifecycle/Canvas/Tree/Highlighter/Locator/Loading）
│   │   │   ├── inspector-modal.html     # Inspector 弹窗模板
│   │   │   ├── modal.js                 # 模态框
│   │   │   ├── progress-indicator.js    # 进度指示器
│   │   │   ├── progress-modal.js        # 进度弹窗
│   │   │   ├── toast.js                 # Toast 通知
│   │   │   ├── confirm-modal.html       # 确认弹窗模板
│   │   │   └── *.html                   # 组件 HTML 模板
│   │   ├── styles/                      # 15 个 CSS 模块（@import 架构）
│   │   ├── app.js                       # 应用主入口
│   │   ├── icons.js                     # Lucide 图标 SVG 定义
│   │   ├── lucide-icons-data.js         # Lucide 图标路径数据
│   │   ├── index.html                   # 主界面（5 个 Tab 页，按 tab 注入）
│   │   └── styles.css                   # @import 入口
│   ├── assets/                          # 静态资源
│   │   ├── icon.png                     # 应用图标
│   │   ├── installerSidebar.bmp         # NSIS 安装侧边栏图片
│   │   └── fonts/
│   │       └── HarmonyOS_Sans_SC_Regular.ttf # HarmonyOS 字体
│   ├── locales/                         # 国际化翻译文件
│   │   ├── zh-CN/translation.json
│   │   └── en-US/translation.json
│   ├── templates/
│   │   └── test_case_template.py        # 测试用例 Python 代码模板（Jinja 风格占位符）
│   ├── splash.html                      # 启动画面
│   ├── build/
│   │   └── installer.nsh                # NSIS 自定义安装脚本
│   ├── patch-nsis.js                    # NSIS 构建补丁（postinstall/prebuild 钩子）
│   ├── electron.vite.config.js          # Vite 配置（dev/build:vite 入口；renderer.root 指向 renderer/）
│   ├── electron-builder.lite.yml        # Lite 版打包配置（不含内置环境，build-lite-win 使用）
│   └── package.json                     # Electron 依赖与构建配置
├── src/                                 # Python 后端
│   └── main/
│       ├── __init__.py
│       ├── __main__.py                  # Electron 集成入口（ElectronTestRunner CLI）
│       ├── cli.py                       # CLI 入口（从 __main__.py 拆出）
│       ├── core/                        # 核心模块
│       │   ├── __init__.py
│       │   ├── adb/                     # ADB 子模块
│       │   │   ├── __init__.py
│       │   │   ├── adb_port.py          # ADB 端口检测（socket connect_ex）
│       │   │   ├── app_lifecycle.py     # 应用生命周期（启动/停止/安装/卸载）
│       │   │   ├── bluetooth_control.py # 蓝牙开关控制
│       │   │   ├── device_connection.py # 设备连接管理
│       │   │   └── subprocess_adb_adapter.py # subprocess adb 适配器
│       │   ├── logcat/                  # Logcat 子模块
│       │   │   ├── __init__.py
│       │   │   ├── crash_detector.py    # 崩溃检测器
│       │   │   ├── log_ring_buffer.py   # 日志环形缓冲
│       │   │   ├── logcat_parser.py     # logcat 解析
│       │   │   └── logcat_process.py    # logcat 进程管理
│       │   ├── pytest/                  # Pytest 子模块
│       │   │   ├── __init__.py
│       │   │   ├── args_builder.py      # pytest 参数构建
│       │   │   ├── path_resolver.py     # 路径解析
│       │   │   ├── pytest_process.py    # pytest 进程管理
│       │   │   ├── pytest_process_port.py # pytest 进程端口
│       │   │   ├── stats_parser.py      # 统计解析
│       │   │   └── summary_formatter.py # 摘要格式化
│       │   ├── adb_manager.py           # ADB 设备管理（聚合 adb/ 子模块）
│       │   ├── appium_server.py         # Appium 服务管理（自动启停/默认配置）
│       │   ├── ble_device.py            # BLE 蓝牙设备（MB026A 模块串口通信）
│       │   ├── crash_monitor.py         # 崩溃监控独立组件（聚合 logcat/）
│       │   ├── inspector_constants.py   # Inspector 常量
│       │   ├── inspector_service.py     # Appium Inspector 服务（与 Electron InspectorService 联动）
│       │   ├── logcat_monitor.py        # Logcat 监控
│       │   ├── pytest_runner.py         # Pytest 运行器（聚合 pytest/ 子模块，Allure 集成/摘要生成/标记行输出）
│       │   ├── stdio_protocol.py        # stdio JSON 协议（与 JsonStdioTransport 对接）
│       │   ├── subprocess_handle.py     # 子进程终止通用基类（Pytest/Logcat/Appium 共用 stop 模板）
│       │   └── test_initializer.py      # 测试初始化编排器（ADB/蓝牙/Appium/CrashMonitor 生命周期）
│       ├── device/                      # 设备模块
│       │   ├── __init__.py
│       │   └── bioland/
│       │       ├── __init__.py
│       │       ├── E127B.json       # Bioland 体温计数据配置（外置）
│       │       └── E127B.py         # Bioland 体温计 16 进制数据生成（原 generator.py 改名）
│       ├── recognition/                 # 识别模块
│       │   ├── __init__.py
│       │   └── captcha_recognizer.py    # 验证码 OCR 识别（ddddocr）
│       └── utils/
│           ├── __init__.py
│           ├── config.py                # Python 配置管理器（懒加载单例）
│           ├── i18n.py                  # 国际化（单例 + _initialized 守护）
│           ├── logger.py                # 日志管理（get_logger 入口）
│           ├── paths.py                 # 路径抽象（project_root/locales_root）
│           ├── test_reporter.py         # 测试报告桥接（封装 allure.attach/pytest.skip/pytest.fail）
│           └── text.py                  # 文本工具（clean_ansi_escape 等）
├── env/                                 # 内置环境（随安装包分发，开发模式可放置）
│   ├── python/                          # 内置 Python 3.12
│   ├── android-sdk/                     # Android SDK（platform-tools + build-tools，扁平结构无版本子目录）
│   ├── scrcpy/                          # scrcpy 3.3.3
│   └── CP210x_Windows_Drivers/          # CP210x 串口驱动
├── scripts/
│   ├── sync_version.py                  # 版本同步脚本（package.json ↔ version.json ↔ pyproject.toml）
│   └── *.ps1                            # 发布脚本（check-releases/check-tag/list-assets/patch-body/publish-release）
├── dev-records/                         # 开发记录（Electron 升级/安全修复等，已被 gitignore 忽略）
├── refactor-rfcs/                       # 已清空并加入 gitignore（历史 RFC 不再维护，勿依赖）
├── docs/                                # 文档
│   ├── README_EN.md                     # 英文 README
│   └── tutorials/                       # 教程（zh-CN / en-US 各 7 篇）
├── version.json                         # 版本信息（version/buildDate/prerelease/fullVersion）
├── pyproject.toml                       # Python 项目配置（依赖/lint/pytest）
└── uv.lock                              # Python 依赖锁定文件
```

***

## 核心架构机制

### 1. 应用启动流程

```
index.js → ApplicationService.run()
            ├── _buildServices()              # 20 服务依赖图编排 + 3 await 固定顺序
            │                                 #   (i18n.init / configurePythonEnvironment / apkParser.initialize)
            ├── electronApp.setServices(services)
            └── ElectronApp.initialize()
                ├── app.whenReady().then(() => {
                │     ├── createSplashWindow()           # 启动画面
                │     ├── services.registerHandlers(ipcMain, {...})  # 注册 IPC
                │     │                                 # (effects.js defaultRegisterHandlers = handlers/index.js registerAllHandlers)
                │     ├── schedulerService.initialize()  # 启动定时调度 (SmartScheduler, 非 .start())
                │     └── restorePreventSleepSetting()
                │   })
                ├── app.on('before-quit')  # 关 allureWindow + 同步释放子进程服务 (S1):
                │     schedulerService.destroy() / scrcpyService.stopScrcpy()
                │     / pythonTestService.stop() / inspectorService.dispose()  # 避免孤儿进程
                ├── app.on('will-quit')    # allureService.cleanupSync()
                └── EnvironmentStartupService 不在 whenReady 直接调用; 经 IPC 触发:
                      splash 发 startChecks → handleStartChecks() (env 检查 + cleanup + migration)
                      splash 发 splashReady → handleSplashReady() (closeSplash + createMainWindow)
```

### 2. IPC 通信架构

```
渲染进程 (renderer/tabs/*/controller.js)
    │
    │  window.electronAPI.xxx()     # 通过 contextBridge 暴露
    │
    ▼
Preload (preload/index.js)
    │
    │  ipcRenderer.invoke(channel) / ipcRenderer.send(channel)
    │
    ▼
主进程 Handlers (handlers/*.js)
    │
    │  调用对应 Service 方法
    │
    ▼
Services (services/*.js + services/{子模块}/)
    │
    │  文件 I/O / 子进程 / 网络请求 / stdio JSON 协议
    │
    ▼
Python 后端 (__main__.py → cli.py → core/*.py + core/{子模块}/)
```

**IPC 注册模式**（handlerUtils.js）：
- `registerHandler(ipcMain, channel, handler)` — 注册单个 handle 通道
- `registerHandlers(ipcMain, { channel: handler })` — 批量注册多个 handle 通道
- 所有 handler 自动包裹 try-catch，错误返回 `{ success: false, error: message }`

### 3. Preload API 分组

| API 分组 | 主要方法 | 对应 Handler |
|---------|---------|-------------|
| 窗口控制 | minimizeWindow, maximizeWindow, closeWindow, isWindowMaximized, onWindowMaximized, setIgnoreMouseEvents, startWindowDrag/moveWindowDrag/endWindowDrag | windowHandlers |
| 文件操作 | selectDirectory, selectFile, selectApkFile, getFilePath, selectFiles, selectExportPath, selectImportPath | fileHandlers |
| 测试执行 | runPythonTests, stopPythonTests | testPlanHandlers |
| 事件订阅 | onTestOutput, onTestError, onUploadProgress, onDownloadProgress, onInstallProgress, onScrcpyError, onScheduledTestStart, onScheduledPlanExpired, onUpdateDownloadProgress, onExportProgress, onImportProgress | 多个 handler (PythonTestService/Scheduler/Update 等 send) |
| 测试计划 | getTestPlans, saveTestPlan, updateTestPlan, deleteTestPlan, getTestPlanRuns | testPlanHandlers |
| 定时计划 | getScheduledPlans, saveScheduledPlan, updateScheduledPlan, deleteScheduledPlan, checkTimeConflict, getScheduledPlanRuns, getSchedulerStatus, scheduledTestComplete, onScheduledTestStart, onScheduledPlanExpired | scheduledPlanHandlers |
| 页面封装 | pagePackage.getApps/Pages/Elements (CRUD+搜索) + getAppStats/getPageStats | pagePackageHandlers |
| 蓝牙设备发现 | bleDeviceDiscovery.getDevices/getDeviceDetail | bleDeviceDiscoveryHandlers |
| 串口/驱动 | getSerialPorts, installDriver, checkInstallerRunning, recheckCP210xDriver | bleDeviceDiscoveryHandlers / environmentHandlers |
| 测试用例 | testCase.list/get/save/delete/checkJsonExists/batchCheckJsonExists/generatePython/saveAndGenerate | testCaseHandlers |
| APK 解析 | apk.parse | apkHandlers |
| 报告管理 | viewReport, checkReportExists, getTestPlanRuns, openReportByPath, getAllureServerStatus, clearAllureReports, deleteReportRun, clearAllLogs | reportHandlers |
| 设备连接 | getConnectedDevices, executeAdbCommand, startScrcpy | deviceHandlers |
| 文件传输 | uploadFile, downloadFile, onUploadProgress, onDownloadProgress（顶层, 无 dataTransfer 命名空间） | dataTransferHandlers |
| 元素检查器 | inspector.startSession/getScreenshot/getPageSource/findElementLocators/refreshSession/stopSession/onProgress | inspectorHandlers |
| 配置管理 | getConfig, saveConfig, getDataPath, changeDataPath, resetDataPath, relaunchApp | configHandlers |
| 版本/更新 | getVersionInfo, checkForUpdate, checkForUpdateRaw, downloadUpdate, installUpdate, onUpdateDownloadProgress | versionHandlers / updateHandlers |
| 系统 | openExternal, openPath, showDialog, setPreventSleep, getProjectInfo, getPytestMarkers | 多个 handler |
| 钉钉通知 | sendDingTalkNotification | reportHandlers |
| i18n | i18n.changeLanguage, i18n.t, i18n.getLanguage | preload 自行 i18next.init（不调主进程 I18nService） |

### 4. 服务初始化与依赖关系

```javascript
// ApplicationService._buildServices() 中的服务初始化顺序 (20 服务 + 3 await)
// 实际入口: index.js → new ApplicationService().run() → _buildServices() → setServices() → ElectronApp.initialize()
VersionService(projectRoot)                                  // 1. 版本信息（最先初始化）
I18nService()                                                // 2. 国际化（构造, 随后 await i18n.init）
UserDataService(projectRoot, versionService)                 // 3. 用户数据路径（依赖 versionService）
  → userConfigPath, userDataPath
  await i18nService.init(projectRoot, isPackaged, userConfigPath)  // await #1
ScheduledPlanService(userConfigPath)                         // 4. 定时计划
TestPlanService(userConfigPath, projectRoot)                 // 5. 测试计划
AllureService(projectRoot, i18nService, userDataPath)        // 6. Allure 报告（3 参, 含 userDataPath）
PythonTestService({projectRoot, i18nService, userDataPath,   // 7. Python 测试（opts 对象, 含 allureService/testPlanService）
                   mainWindow, allureService, testPlanService})
EnvironmentService(i18nService, projectRoot)                 // 8. 环境检查
  await environmentService.configurePythonEnvironment()      // await #2
ADBService(projectRoot, i18nService)                         // 9. ADB 管理
NotificationService(i18nService)                             // 10. 通知
ScrcpyService(projectRoot, i18nService)                      // 11. 投屏
PagePackageService(userConfigPath)                           // 12. 页面封装
BleDeviceDiscoveryService(projectRoot)                       // 13. 蓝牙设备发现 + 串口枚举
TestCaseService(userConfigPath, projectRoot)                 // 14. 测试用例（内部依赖 TestCaseCodeGenerator）
ApkParserService(projectRoot, i18nService)                   // 15. APK 解析（2 参, 含 i18nService; 随后 await initialize）
UpdateService(versionService, userDataService, {allowInsecureSSL})  // 16. 自动更新（3 参, 含 {allowInsecureSSL}）
InspectorService(projectRoot, i18nService, userDataPath)     // 17. Appium Inspector
DataTransferService(userDataService, i18nService, versionService)  // 18. 文件传输
  await apkParserService.initialize()                        // await #3
SmartScheduler(scheduledPlanService, i18nService)            // 19. 智能调度器（factory 直接构造, ElectronApp.initialize 调 .initialize()/.destroy()）
EnvironmentStartupService({environmentService, testCaseService,  // 20. 启动期环境编排（最后, opts 对象）
                           userDataService, i18nService, electronApp})
```

### 5. 用户数据路径管理

应用采用 **AppData 迁移机制**，将用户配置从安装目录迁移到系统 AppData：

| 路径 | 说明 |
|------|------|
| `AppData/Xkautotester/config/` | 用户配置目录（userConfigPath） |
| `AppData/Xkautotester/` | 用户数据目录（userDataPath） |
| `{projectRoot}/config/` | 默认配置目录（安装包内） |

**UserDataService** + **UserDataMigrator** + **WindowsRegistryBridge** 共同负责：
- 首次启动时将默认配置复制到 AppData
- 支持用户自定义数据路径（changeDataPath，通过 WindowsRegistryBridge 持久化到注册表）
- 版本升级时同步新增配置项（data-version.json）
- 管理的用户文件：config.json, ble_device.json, page_package.json, test_plans.json, scheduled_plans.json
- 管理的用户目录：test_cases/

### 6. 定时调度机制

**SmartScheduler**（`scheduler/` 子模块的 orchestrator）使用最小堆优先队列（`planQueue.js`）管理定时计划：
- 支持 cron 表达式和一次性执行
- `smartScheduler.js` + `strategies.js` 提供智能调度策略
- 到期自动触发测试执行
- 通过 IPC 事件通知渲染进程（scheduled-test-start / scheduled-plan-expired）
- 应用退出时自动停止调度器

### 7. 元素检查器机制

**InspectorService** + **JsonStdioTransport**（主进程）通过子进程启动 Python 后端 `inspector_service.py`，使用 **stdio JSON 协议**（`stdio_protocol.py`）双向通信（每行一个 JSON 消息）：
- 启动 Appium Inspector 会话
- 实时获取 UI 树（XML/JSON sources）
- 支持点击/查找元素/截图
- 渲染层 `components/inspector.js`（含 6 个 mixin）渲染交互弹窗
- 与「页面封装」联动：可将选中元素保存为定位器
- 启动 Inspector 需先连接 Android 设备并启动 Appium

***

## 关键路径解析机制

### pathHelper.js - 路径解析

| 路径类型 | 开发模式 | 打包模式 |
|---------|---------|---------|
| projectRoot | `mainDir/../../../` | `process.resourcesPath` |
| config 目录 | `projectRoot/config/` | `resourcesPath/config/` |
| preload | `mainDir/../preload/` | `resourcesPath/app/src/preload/` |
| assets | `mainDir/../../assets/` | `resourcesPath/app/assets/` |
| renderer | `mainDir/../../renderer/` | `resourcesPath/app/renderer/` |
| splash | `mainDir/../../splash.html` | `resourcesPath/app/splash.html` |
| adb | `env/android-sdk/platform-tools/adb.exe` → 回退 `env/scrcpy/adb.exe` → PATH `adb` | `resourcesPath/env/android-sdk/platform-tools/adb.exe`（同回退链） |
| aapt2 | `env/android-sdk/build-tools/aapt2.exe` → 回退 `env/android-tools/aapt2.exe` → PATH `aapt2` | `resourcesPath/env/android-sdk/build-tools/aapt2.exe`（同回退链） |

> aapt2/adb 路径解析统一到 `pathHelper.getAdbPath`/`getAapt2Path`，支持缓存机制。

### Python paths.py - 路径抽象

```python
# paths.py 抽象 project_root 和 locales_root
# config.py 通过 paths.py 解析配置路径
# 默认配置路径：project_root / "config" / "config.json"
```

### Python 测试执行路径

```bash
# Electron 通过子进程调用 Python
python -m main --test-paths <paths> --markers <markers> --test-plan <name>
# 环境变量 XKAUTOTESTER_USER_DATA 指定用户数据目录
# PythonTestService._buildSpawnEnv 另注入 XKAUTOTESTER_ADB_PATH (pathHelper.getAdbPath 解析结果),
# 供 Python 端 subprocess_adb_adapter 复用同一 adb 路径, 避免二次解析
```

***

## 配置文件分类

### 用户可修改配置（安装更新时必须保留）

| 文件 | 内容 | 服务 | 读写频率 |
|------|------|------|---------|
| `config/config.json` | 应用设置（日志/投屏/主题/语言/通知/更新） | configHandlers / UserDataService | 中 |
| `config/ble_device.json` | 蓝牙设备列表及参数 | BleDeviceDiscoveryService | 低 |
| `config/page_package.json` | 应用页面元素定位器 | PagePackageService | 中 |
| `config/test_cases/*.json` | 测试用例定义 | TestCaseService | 高 |
| `config/test_plans.json` | 测试计划 | TestPlanService | 中 |
| `config/scheduled_plans.json` | 定时执行计划 | ScheduledPlanService | 低 |

### 只读默认配置（安装更新时应替换）

| 文件 | 内容 | 说明 |
|------|------|------|
| `config/pytest.ini` | Pytest 标记和配置 | 随应用版本更新 |

### config.json 结构

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
    "autoCheckUpdate": true,
    "allowInsecureSSL": false
  }
}
```

> `config/config.json` 是**唯一权威源**（单源配置），JS/Python 端均从此读取，不再有硬编码副本。

***

## 打包配置

### electron-builder 关键配置

| 配置项 | 值 |
|-------|-----|
| appId | com.ring.xkautotester |
| productName | XKAutoTester |
| artifactName | ${productName} Setup v${version}.${ext} |
| asar | true（preload 目录 unpack） |
| NSIS | 非一键安装/可选安装目录/多语言/语言选择器/自定义侧边栏 |

### 构建脚本

| 脚本 | 用途 |
|------|------|
| `npm start` | 传统 Electron 直启（兼容旧流程） |
| `npm run dev` | Vite 开发模式（HMR 热更新，推荐） |
| `npm run dev:legacy` | 传统开发模式 |
| `npm run build` | electron-builder 默认构建 |
| `npm run build-win` | 完整 Windows 安装包（含 .venv + env/） |
| `npm run build-lite-win` | 精简 Windows 安装包（不含内置环境） |
| `npm run build:vite` | 仅 Vite 构建（产物，不打包） |
| `npm run pack` | 仅打包目录（不生成安装器） |
| `npm test` | Node 内置 test runner 执行 Electron 测试 |
| `npm run version:bump/verify/sync` | 版本同步脚本 |

### extraResources 打包映射（完整版）

| 源路径 | 目标路径 | 说明 |
|-------|---------|------|
| `../src/**/*.py` + `**/*.json` | `src/` | Python 后端代码（仅 .py/.json） |
| `../config/pytest.ini` | `config/pytest.ini` | Pytest 配置 |
| `../.venv/**/*` | `.venv/` | Python 虚拟环境（排除 __pycache__） |
| `../env/**/*` | `env/` | 内置工具（排除 jdk/ 和 allure/） |
| `../pyproject.toml` | `pyproject.toml` | Python 项目配置 |
| `../uv.lock` | `uv.lock` | 依赖锁定文件 |
| `../version.json` | `version.json` | 版本信息 |
| `locales` | `locales` | 国际化翻译文件 |

> **重要变更**：
> - `env/jdk/` 与 `env/allure/` 不再打包进安装包（filter 排除）
> - JDK 仍需用户在开发模式自行安装；Allure 改为 npm 依赖（`allure ^3.9.0`）
> - `env/` 现包含 `python/`（内置 Python 3.12）、`android-sdk/`、`scrcpy/`、`CP210x_Windows_Drivers/`
> - `../src` 只打包 `**/*.py` 和 `**/*.json`（不再打包其他文件类型）
> - 新增 `patch-nsis.js` 钩子（postinstall/prebuild），动态修补 NSIS 构建配置

### 内置环境工具（env/ 目录）

| 工具 | 路径 | 用途 |
|------|------|------|
| Python | `env/python/` | 内置 Python 3.12 运行时 |
| Android SDK | `env/android-sdk/` | ADB / aapt2 |
| scrcpy | `env/scrcpy/` | 安卓投屏 |
| CP210x 驱动 | `env/CP210x_Windows_Drivers/` | USB 串口驱动（蓝牙模块通信） |

***

## Python 依赖

| 包 | 版本 | 用途 |
|----|------|------|
| pytest | 8.4.2 | 测试框架 |
| allure-pytest | 2.15.0 | Allure 报告集成 |
| allure-python-commons | 2.15.0 | Allure 公共库 |
| Appium-Python-Client | 5.2.4 | Appium 驱动 |
| playwright | 1.55.0 | Web 自动化（可选） |
| pytest-playwright | 0.7.1 | Playwright pytest 插件 |
| ddddocr | 1.5.6 | 验证码 OCR |
| Faker | 37.11.0 | 测试数据生成 |
| requests | 2.32.5 | HTTP 请求 |
| pyserial | 3.5 | 串口通信（蓝牙设备） |
| Pillow | 10.4.0 | 图像处理（R7 安全修复升级，9.5.0 含 CVE） |

> Python 端测试依赖：`pytest>=8.0.0`, `pytest-cov>=5.0.0`（R25 P3-15: 移除无引用依赖 pytest-html/PyYAML/openpyxl）
> Lint：`ruff>=0.1.0`（line-length=120, target=py310，select=E/F/W/I/N/UP/B/C4，ignore=E501）

***

## 渲染进程 UI 结构

### 主界面 Tab 页

| Tab | data-tab | MVC 路径 | 结构说明 |
|-----|----------|---------|-----|
| 测试执行 | test-execution | tabs/test-execution/ | MVC 单体（mixin 已合回） |
| 页面封装 | page-package | tabs/page-package/ | MVC 单体 |
| 测试用例 | test-case | tabs/test-case/ | MVC 单体 + modules/（4 个模块） |
| 安卓连接 | android-connection | tabs/android-connection/ | MVC 单体（mixin 已合回） |
| 设置 | settings | tabs/settings/ | MVC 单体（mixin 已合回） |

### 前端技术特点

- **MVC 架构**：每个 Tab 拆为 `controller.js` / `model.js` / `view.js` / `index.js` / `tab.html`；早期 `mixins/` 已全部合回，test-case 改用 `modules/` 拆分
- **构建工具**：Vite 7.3.6 + electron-vite 5.0.0（开发模式 HMR / 构建产物打包；R23 由 Vite 5 升级）
- **核心基类**：`core/Action.js` / `ApiBridge.js` / `AppState.js` / `EventEmitter.js`
- **无框架**：原生 HTML + CSS + JavaScript（基于 Action 事件驱动）
- **样式架构**：`styles/` 下 15 个 CSS 模块，`styles.css` 通过 `@import` 统一引入
- **图标**：Lucide 图标库（SVG 内联）
- **样式风格**：Material Design，支持暗色模式
- **字体**：HarmonyOS Sans SC
- **组件**：自定义组件（base-select, custom-select, datetime-picker, modal, confirm-modal, toast, progress-indicator, progress-modal, device-cascade-select, device-selection-modal, inspector）

***

## 版本管理

### 版本文件

- `version.json` — 版本权威源（version/buildDate/prerelease/fullVersion）
- `electron/package.json` — Electron 包版本
- `pyproject.toml` — Python 包版本

### 版本同步

```bash
# 同步所有版本文件
python scripts/sync_version.py

# 验证版本一致性
python scripts/sync_version.py --verify

# 强制同步
python scripts/sync_version.py --sync

# 或通过 npm 脚本
cd electron
npm run version:bump      # 同步
npm run version:verify    # 验证
npm run version:sync      # 强制同步
```

***

## 测试用例代码生成

测试用例通过 `TestCaseService` 触发，由 `TestCaseCodeGenerator`（单文件, 原 `mixins/` 下 5 个 Mixin 已合回）将 JSON 定义转换为 Python 代码，使用 `templates/test_case_template.py` 模板：

**模板占位符**：

| 占位符 | 说明 |
|-------|------|
| `{{APP_NAME}}` | 应用名称 |
| `{{PACKAGE_NAME}}` | 应用包名 |
| `{{ACTIVITY_NAME}}` | 启动 Activity |
| `{{DEVICE_NAME}}` | 设备名称 |
| `{{PLATFORM_NAME}}` | 平台名称 |
| `{{PLATFORM_VERSION}}` | 平台版本 |
| `{{BLE_IMPORT}}` | 蓝牙导入语句 |
| `{{BLE_CONFIG}}` | 蓝牙配置常量 |
| `{{BLE_CONFIG_INIT}}` | 蓝牙初始化代码 |
| `{{CLASS_NAME}}` | 测试类名 |
| `{{ALLURE_DECORATORS}}` | Allure 装饰器 |
| `{{SETUP_METHOD_CONTENT}}` | setup_method 内容 |
| `{{TEST_METHODS}}` | 测试方法代码 |
| `{{ADDITIONAL_IMPORTS}}` | 额外导入语句 |

生成的代码自动集成 `TestInitializer`，统一管理 ADB/蓝牙/Appium 初始化。

***

## JsonFileCrudService 基类

多个 Service 继承自 `JsonFileCrudService`，提供统一的 JSON 文件 CRUD 操作：

| 继承的 Service | 文件 |
|---------------|------|
| PagePackageService | page_package.json |
| ScheduledPlanService | scheduled_plans.json |
| TestPlanService | test_plans.json |

> 注：`TestCaseService` 与 `BleDeviceDiscoveryService` 自管理 JSON I/O，未继承 `JsonFileCrudService`。

**基类方法**：`getData()`, `saveData(data)`, `_generateId()`, `_success(data)`, `_error(message)`

***

## 重构历程概览

项目历经多轮重构（`refactor-rfcs/` 已清空并加入 gitignore，历史 RFC 不再维护）：

| 阶段 | 时间 | 主题 |
|------|------|------|
| 第一轮 | 2026-06 ~ 2026-07 | Python 后端架构 / 渲染层 MVC 边界 / Python Test Service 重构 |
| 第二轮 | 2026-07-17 ~ 2026-07-22 | 13 候选项全部重构（25 RFC）：MVC 收紧、TestCaseCodeGenerator 抽取、配置单源、UserDataService 分解、AllureService 拆分、Inspector 私有字段统一、CSS/HTML 拆分等 |
| 第三轮 | 2026-07-24 ~ 2026-07-28 | Vite + electron-vite 引入；Appium/ADB/BLE/APK/Inspector 等服务 deep-module 重构；Scheduler 模块化（smartScheduler + strategies）；TestCase/TestPlan/PythonTest/DataTransfer 拆分 |
| 第四轮 | 2026-08-25 ~ 2026-08-26 | 版本 0.1.5；renderer tabs mixin 全部合回（test-case 改 modules/）；Electron 38→43 升级；R7 安全修复（Pillow 10.4.0 等）；新增发布脚本与 dev-records 记录 |

***

## 提醒

### 1. 部分文件因为加入了 .gitignore，你可能执行时看不到，请多加确认

以下目录/文件在 .gitignore 中，可能不存在于工作区：
- `electron/node_modules/` — 需执行 npm install
- `.venv/` — Python 虚拟环境，需执行 uv sync
- `env/` — 内置工具（Python/Android SDK/scrcpy/CP210x 驱动）
- `config/test_cases/` — 运行时创建
- `config/test_plans.json` — 运行时创建
- `config/scheduled_plans.json` — 运行时创建
- `electron/dist/` — 构建输出
- `electron/build/` — ⚠ 含 `installer.nsh` 源码，但整个目录被 gitignore；新环境 clone 后打包前需确认该文件存在（NSIS include 引用）
- `electron/out/` — electron-vite 构建产物
- `refactor-rfcs/` — 已清空并加入 gitignore（历史 RFC 不再维护）
- `dev-records/` — 开发记录（gitignore 忽略）
- `trae-backup/` — 文件修改备份（gitignore 忽略）
- `logs/` — 运行日志

### 2. 永远把涉及打包和 npm install 的指令留给用户自行执行

### 3. Python 代码修改后注意

- 修改 Python 后端代码后，需确认 `pyproject.toml` 中的依赖是否需要更新
- Python 代码风格遵循 ruff 规范（line-length=120, target=py310，select=E/F/W/I/N/UP/B/C4，ignore=E501）
- 测试运行通过 `python -m main` 入口（`__main__.py` 调用 `cli.py`），不是直接运行单个文件

### 4. IPC 通道命名规范

- 简单操作：`动词-名词` 格式（如 `get-config`, `save-config`）
- 命名空间操作：`命名空间:操作` 格式（如 `page-package:get-apps`, `ble-device-discovery:get-devices`, `test-case:save`, `inspector:start-session`）
- 事件监听：`on-事件名` 格式（如 `on-download-progress`, `on-install-progress`, `on-export-progress`）；注意部分历史事件通道无 on- 前缀（如 `test-output`, `upload-progress`, `scheduled-test-start`）
- ⚠ 存量通道有 camelCase 历史遗留（如 `getConnectedDevices`, `executeAdbCommand`, `uploadFile`, `downloadFile`, `selectFiles`, `checkPathExists`, `createDirectory`, `getSerialPorts`），新通道必须用 kebab-case

### 5. Vite / electron-vite 相关

- 开发模式优先用 `npm run dev`（HMR 热更新）
- 传统模式 `npm start` / `npm run dev:legacy` 仍可用，但无 HMR
- `npm run build:vite` 仅生成 Vite 产物，不打包；`npm run build-win` 才生成安装包
- `electron.vite.config.js` 为 Vite 配置入口
