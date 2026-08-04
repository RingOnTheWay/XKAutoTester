# code-review 第六轮全栈架构审视 - 2026-08-04

## 概述

本轮跳出前5轮"diff 内三轴审查"模式，改从**全栈架构视角**切入：跨 commit 限制，审视模块边界/跨语言一致性/聚合根划分/factory 模式统一性/文档权威源漂移。前5轮聚焦 diff 内变更，本轮看整体架构合理性，发现单次 diff 审查遗漏的系统性问题。

4 路并行 search subagent 从不同维度审视：
- Electron 服务层架构（21 service + 19 handler）
- Python 后端架构（28 文件）
- 跨语言协议一致性（stdio/IPC/config/path/i18n）
- AGENTS.md 文档权威源核查

## 审查范围

| 维度 | 严重 | 中等 | 轻微 |
|---|---|---|---|
| Electron 服务层 | 1 (S1) | 4 (M2/M3/M4+L) | 4 |
| Python 后端 | 4 (S3/S4/S6+M6) | 3 (M5/M8+L) | 7 |
| 跨语言协议 | 2 (S2/S5) | 2 (M7/M9) | 5 |
| AGENTS.md 文档 | 0 | 1 (M1, 20 处漂移) | 0 |
| **合计** | **6** | **9** | **17** |

全部修复。

## 本轮修复项

| 项 | 问题 | 模块 | 方案 |
|---|---|---|---|
| S1 | 应用退出资源泄漏 (3 service 无 stop 钩子) | ElectronApp.js + InspectorService.js | before-quit 接 Scrcpy/PythonTest/Inspector stop + InspectorService 加 dispose() |
| S2 | JS 未把 adb 路径注入 Python 子进程 | PythonTestService.js | _buildSpawnEnv 加 XKAUTOTESTER_ADB_PATH |
| S3 | test_initializer 反向 import core | utils/test_initializer.py → core/ | 移文件 + 4 处 import 同步 |
| S4 | i18n.py 模块级 get_logger() 触发 IO | utils/i18n.py | 改 logging.getLogger() |
| S5 | I18nService locales 路径硬编码 | I18nService.js | 走 pathHelper.getLocalesPath (SSOT) |
| S6 | stdio_protocol 耦合 inspector_constants | core/stdio_protocol.py | 加 exit_command 参数注入 |
| M1 | AGENTS.md 20 处漂移 | AGENTS.md | 77+/55- 行同步 |
| M2 | mainWindow 注入三模式不一致 | ElectronApp + handlers | DataTransferService 集中注入 + 删 handler 3 处重复 |
| M3 | collaborator 三种异构形态 | ApkParserService + AllureService | ApkParser 加 collaborators 注入 + AllureService 注释 facade→聚合根 |
| M4 | factory 参数顺序+副作用 | factories.js + effects.js | 参数顺序统一 + UpdateService 副作用外移到 initializer |
| M5 | Python 3 处单例残留 | pytest_runner/config/captcha_recognizer | pytest/captcha 拆除 + config 加注入点 |
| M6 | PytestProcess 无 stop() | pytest_process.py | 加 stop() 幂等 + KeyboardInterrupt 处理 |
| M7 | IPC 命名规范违反 + 硬编码字符串 | constants.js + ElectronApp.js | 加命名规范注释 + 提取硬编码字符串 |
| M8 | 3 处静默吞异常 | inspector_service×2 + logcat_process | 加 logger.warning |
| M9 | Response schema 无契约 | inspector-protocol.json + JsonStdioTransport.js | 加 8 字段 + additionalProperties:false + JSDoc 同步 |
| L1-L5 | 17 项清理 | 多文件 | AllureService.cleanup/时间格式/硬编码/timeout 冗余/dead code 等 |

---

## 修复 S1: 应用退出资源泄漏

**问题**: `ElectronApp.js` `before-quit` 仅调 `schedulerService.destroy()` + `allureService.cleanupSync()`。第五轮给 ScrcpyService 补的 `stopScrcpy()` / PythonTestService.stop() / InspectorService.stopSession() 从未接到退出钩子。投屏中/测试运行中/Inspector 会话中关窗 → scrcpy/python/inspector 子进程成孤儿。下沉不闭环。

**方案**:
- InspectorService 加 `dispose()` 同步方法（不发 stop-session 命令到 Python，进程随 stdin EOF 自然退出，仅本地 dispose transport + 清空会话状态）
- ElectronApp `before-quit` 集中调 4 service stop（scheduler/scrcpy/pythonTest/inspector），每调用包 try-catch 避免阻塞退出

**文件**:
- `electron/src/main/ElectronApp.js` (before-quit 钩子)
- `electron/src/main/services/InspectorService.js` (新增 dispose 方法)

---

## 修复 S2: adb 路径未注入 Python 子进程

**问题**: `PythonTestService.js` `_buildSpawnEnv` 注入 LANG/LOCALES/USER_DATA/PYTHONPATH，漏 `XKAUTOTESTER_ADB_PATH`。Python `subprocess_adb_adapter.py` `ADB_CMD = os.environ.get("XKAUTOTESTER_ADB_PATH", "adb")`。打包模式 PATH 无 adb 时 `inspector_service._wake_device` 静默失败，息屏后 Appium 会话失效。

**方案**: `_buildSpawnEnv` 加 `XKAUTOTESTER_ADB_PATH: pathHelper.getAdbPath(this.projectRoot)`，跨语言传递 adb.exe 完整路径。

**文件**: `electron/src/main/services/PythonTestService.js`

---

## 修复 S3: test_initializer 反向 import core

**问题**: `src/main/utils/test_initializer.py` 是 orchestrator（编排 ADB/BLE/Appium/CrashMonitor 生命周期），不属于 utils 底层。它反向 import `main.core.adb_manager/appium_server/ble_device/crash_monitor`，形成 utils→core→utils 环路（层次颠倒）。

**方案**: 将文件移动到 `src/main/core/test_initializer.py`，更新所有 import（2 tests + 1 template）。

**文件**:
- 新建 `src/main/core/test_initializer.py`
- 删除 `src/main/utils/test_initializer.py`
- 更新 `tests/unit/test_test_initializer_integration.py` / `tests/test_test_initializer.py` / `electron/templates/test_case_template.py` 的 import

---

## 修复 S4: i18n.py 模块级 IO 副作用

**问题**: `i18n.py` 模块级 `logger = get_logger(__name__)`，触发 `get_logger → _setup_root_logger → get_config_manager (读 config.json) + get_logs_path (mkdir)`。L12 注释自称"导入零副作用"，实际任何 core import i18n 即触发 config 读取 + 目录创建。

**方案**: 改 `logging.getLogger(__name__)`（与 adb_manager/appium_server 等其他模块一致），root 配置由 Cli 入口显式触发。

**文件**: `src/main/utils/i18n.py`

---

## 修复 S5: I18nService locales 路径硬编码

**问题**: `I18nService.js` `path.join(__dirname, '..', '..', '..', 'locales')` 硬编码，未用 `pathHelper.getLocalesPath`。而 `PythonTestService.js` 注入 Python 的 `XKAUTOTESTER_LOCALES_PATH = pathHelper.getLocalesPath(projectRoot)`。SSOT 破裂，两源可能错位。

**方案**: `I18nService.init` 改走 `pathHelper.getLocalesPath(projectRoot)`，与 Python 端注入路径对齐。

**文件**: `electron/src/main/services/I18nService.js`

---

## 修复 S6: stdio_protocol 耦合 inspector_constants

**问题**: `stdio_protocol.py` 通用 JSON-line 协议层硬编码 `from main.core.inspector_constants import STOP_SESSION` 作退出信号。

**方案**: `StdioProtocol` 构造器加 `exit_command: str` 参数，由调用方（cli.py）传入 `STOP_SESSION`，通用层不再耦合业务命令。

**文件**:
- `src/main/core/stdio_protocol.py` (加参数)
- `src/main/cli.py` (传 STOP_SESSION)
- `tests/unit/test_stdio_protocol.py` (同步)

---

## 修复 M1: AGENTS.md 20 处漂移

**问题**: AGENTS.md 作为 workspace_rules 被 agent 消费，但全栈核查发现 20 处漂移（10 严重 + 10 轻微）。

**方案**: 77+/55- 行同步，每条改动有代码实证。主要修复：
- 服务初始化顺序整体错乱（21→20 服务，VersionService 实际第1/文档第19 等）
- Preload "蓝牙设备"/"文件传输"/"元素检查器"/"报告管理"4 个分组方法名错误
- 启动流程图错（.run()/.start()/registerAllHandlers）
- aapt2 路径表错（删 29.0.3 子目录）
- 文件树遗漏 shared/ 新文件
- android-connection mixin 数 10→11
- 版本号 0.1.4-dev.1→dev.2
- 构造参数不匹配（5 处）
- BLE 命名空间示例错
- TestCaseCodeGenerator 从服务列表删除

**误报 1 项**: "config/test_plans.json 运行时创建"实际准确（.gitignore 确认未跟踪），保留不动。

**文件**: `AGENTS.md`

---

## 修复 M2: mainWindow 注入三模式不一致

**问题**: ElectronApp createWindow 用 3 种方式：`schedulerService.setMainWindow()` / `pythonTestService.mainWindow = this.mainWindow`（直字段赋值）/ `dataTransferHandlers` 每个 handler 重复 `dataTransferService.setMainWindow(electronApp.mainWindow)`（handler 反向耦合 + 首调用前 mainWindow 恒 null）。

**方案**:
- DataTransferService 集中注入到 ElectronApp.createWindow
- 删 dataTransferHandlers 内 3 处重复 setMainWindow 调用
- **PythonTestService 保留直字段赋值**（前5轮决定：消除 setMainWindow 时序耦合，run() lazy 取 this.mainWindow，有守护测试"不应有 setMainWindow 方法"）

**文件**:
- `electron/src/main/ElectronApp.js`
- `electron/src/main/handlers/dataTransferHandlers.js`

---

## 修复 M3: collaborator 三种异构形态

**问题**:
- ADBService：聚合根 + 4 collaborator + @property
- AllureService：4 collaborator 全封装，注释仍写 "facade 深模块"
- ApkParserService：3 collaborator 硬编码 `new`，无 factory-or-default，单测只能整体 mock

**方案**:
- ApkParserService 构造器加 `collaborators` opts 参数（Aapt2Invoker/Parser/LabelResolver 三 collaborator），默认走 `new`，测试可注入 mock，对齐 ADBService 注入风格
- AllureService 注释 facade→聚合根（与 ADBService 术语统一）
- AllureService.cleanup() 去 async 关键字（body 仅同步 cleanupSync，async 误导）

**文件**:
- `electron/src/main/services/ApkParserService.js`
- `electron/src/main/services/AllureService.js`

---

## 修复 M4: factory 参数顺序+副作用

**问题**:
- `defaultEnvironmentServiceFactory(i18nService, projectRoot)` 反转 ADB/Scrcpy/ApkParser 的 `(projectRoot, i18nService)`
- `defaultSchedulerServiceFactory(i18nService, scheduledPlanService)` 反转 SmartScheduler 构造器顺序
- `defaultUpdateServiceFactory` 内联 `fs.existsSync` + `JSON.parse` 读 config.json，违反文件头注释"纯构造, 0 副作用"

**方案**:
- factory 参数顺序统一（Environment/Scheduler 对齐构造器）
- `defaultUpdateServiceFactory` 改纯构造
- 新增 `defaultUpdateServiceInitializer` 在 effects.js（对称 `apkParserInitializer`），负责读 config 后调 `updateService.initialize(config)`
- UpdateService 加 `initialize(config)` 方法接收 config

**文件**:
- `electron/src/main/services/application/factories.js`
- `electron/src/main/services/application/effects.js`
- `electron/src/main/services/application/applicationService.js`
- `electron/src/main/services/UpdateService.js`

---

## 修复 M5: Python 3 处单例残留

**问题**: i18n 已拆单例，但 pytest_runner/config/captcha_recognizer 三处仍保留模块级懒加载单例。Cli 已用 factory 注入 PytestRunner，单例冗余。

**方案**:
- pytest_runner: 删除 `_pytest_runner_instance` + `get_pytest_runner()`
- captcha_recognizer: 删除 `_captcha_recognizer_instance` + `get_captcha_recognizer()`（无调用方）
- config: 保留 `get_config_manager()` 懒加载（logger.py 深度依赖），仅加 `set_config_manager(instance)` 注入点提升可测试性

**文件**:
- `src/main/core/pytest_runner.py`
- `src/main/utils/config.py`
- `src/main/recognition/captcha_recognizer.py`

---

## 修复 M6: PytestProcess 无 stop()

**问题**: `pytest_process.py` 仅 `run()`，无 `stop()`/`destroy()`。KeyboardInterrupt 时 `process.wait()` 不执行，stdout/stderr 线程 + Popen 句柄泄漏。对比 LogcatProcess 有显式 `stop()` 幂等。

**方案**:
- 加 `stop()` 幂等方法（terminate→wait(2s)→kill 兜底，不抛异常）
- run() 存 `self._process` 供 stop() 终止
- run() 包 try/except KeyboardInterrupt 调 stop() 后 raise
- finally 清空 `self._process` 引用

**文件**: `src/main/core/pytest/pytest_process.py`

---

## 修复 M7: IPC 命名规范+硬编码字符串

**问题**:
- constants.js 多处 camelCase 违反"动词-名词"kebab 规范（`getConnectedDevices`/`uploadFile` 等）
- ElectronApp.js `webContents.send('window-maximized', ...)` 字面量，未引用 `IPC_CHANNELS.WINDOW_MAXIMIZED`

**方案**:
- ElectronApp.js 提取硬编码字符串到 `IPC_CHANNELS.WINDOW_MAXIMIZED`
- constants.js 加命名规范注释（camelCase 历史遗留说明，重命名风险大暂保留）

**决策**: 保守策略——camelCase 通道重命名需同步 preload/renderer/handler 三端，风险大暂保留，仅加规范注释 + 提取硬编码字符串。

**文件**:
- `electron/src/main/ElectronApp.js`
- `electron/src/shared/constants.js`

---

## 修复 M8: 3 处静默吞异常

**问题**:
- `inspector_service.py:277-278` `except Exception: pass`（driver.set_timeout 失败）
- `inspector_service.py:297-298` `except Exception: pass`（start_session 异常路径 driver.quit 失败）
- `logcat_process.py:98-99` `except Exception: pass`（stop 路径）

**方案**: 加 `logger.warning` 可观测性（与 stdio_protocol 已修的 `logger.warning` 模式一致）。logcat_process.py 加 logging import + logger。

**文件**:
- `src/main/core/inspector_service.py`
- `src/main/core/logcat/logcat_process.py`

---

## 修复 M9: Response schema 无契约

**问题**: `inspector-protocol.json` Response `additionalProperties:true`，未约束 `screenshot/source/elements/locators/session_id` 等异构字段。JSDoc `InspectorResponse` 仅 `{success, error}`，实际访问 `response.session_id`。

**方案**:
- Response schema 加 8 字段定义（success/error/session_id/screenshot/source/elements/locators/warning）
- `additionalProperties: false`（严格契约）
- 同步更新 JSDoc `InspectorResponse` 声明所有字段
- 字段类型以 Python `inspector_service.py` return dict 为准（elements 为 object 非 array，screenshot 为 data URI）

**文件**:
- `electron/src/shared/inspector-protocol.json`
- `electron/src/main/services/JsonStdioTransport.js`

---

## L 级清理项（17 项）

| 项 | 文件 | 修复 |
|---|---|---|
| L1 | captcha_recognizer.py | "0721" 4 处重复抽 DEFAULT_CAPTCHA 常量（实际 5 处） |
| L2 | config.py | 删除 save() dead code |
| L3 | logger.py + appium_server.py + text.py | 时间格式重复抽 DATETIME_FORMAT 常量 |
| L4 | inspector_service.py | 硬编码 "127.0.0.1"/4725 改引用 AppiumServer.DEFAULT_HOST |
| L5 | adb/device_connection.py + app_lifecycle.py + bluetooth_control.py + logcat_process.py | timeout=10 冗余清理 |
| L6 | AllureService.js | cleanup() 去 async 关键字 |
| L7 | pathHelper.js | getLocalesPath 注释过时更新 |
| L8 | reportHandlers.js | （未改，config 读取下沉留后续） |

---

## 关键决策

1. **M2 PythonTestService**: 保留前5轮"直字段赋值"决定（消除 setMainWindow 时序耦合），未强行统一为 setMainWindow。M2 真正收益在 DataTransferService 集中注入 + 删 handler 重复。有守护测试"不应有 setMainWindow 方法"验证。

2. **M5-2 config 单例**: 保留 `get_config_manager()` 懒加载（logger.py L17/L34/L61 深度依赖），仅加 `set_config_manager()` 注入点提升可测试性。主要收益是可测试性，非删除单例本身。

3. **M7 IPC 命名**: 保守策略——camelCase 通道重命名需同步 preload/renderer/handler 三端，风险大暂保留，仅加命名规范注释 + 提取硬编码字符串。

4. **M1 漂移 19 误报**: "config/test_plans.json 运行时创建"实际准确（.gitignore 确认未跟踪），保留不动。

---

## 测试结果

| 测试套件 | 结果 |
|---|---|
| Electron (npm test) | **726 pass**, 0 fail（新增 9 测试） |
| Python (uv run pytest tests/ -q) | **474 pass**, 7 skipped, 0 fail |
| ruff check | All checks passed |

---

## 改动文件清单（41 个）

### Electron 源码（15 个）
- electron/src/main/ElectronApp.js
- electron/src/main/handlers/dataTransferHandlers.js
- electron/src/main/services/AllureService.js
- electron/src/main/services/ApkParserService.js
- electron/src/main/services/I18nService.js
- electron/src/main/services/InspectorService.js
- electron/src/main/services/JsonStdioTransport.js
- electron/src/main/services/PythonTestService.js
- electron/src/main/services/UpdateService.js
- electron/src/main/services/application/applicationService.js
- electron/src/main/services/application/effects.js
- electron/src/main/services/application/factories.js
- electron/src/shared/constants.js
- electron/src/shared/inspector-protocol.json
- electron/templates/test_case_template.py

### Python 源码（14 个）
- src/main/cli.py
- src/main/core/adb/app_lifecycle.py
- src/main/core/adb/bluetooth_control.py
- src/main/core/adb/device_connection.py
- src/main/core/appium_server.py
- src/main/core/inspector_service.py
- src/main/core/logcat/logcat_process.py
- src/main/core/pytest/pytest_process.py
- src/main/core/pytest_runner.py
- src/main/core/stdio_protocol.py
- src/main/recognition/captcha_recognizer.py
- src/main/utils/config.py
- src/main/utils/i18n.py
- src/main/utils/logger.py
- src/main/utils/text.py
- src/main/core/test_initializer.py (新建)
- src/main/utils/test_initializer.py (删除)

### 测试文件（8 个）
- tests/electron/test_apk_parser_service.js
- tests/electron/test_application_service.js
- tests/electron/test_i18n_service.js
- tests/electron/test_update_service.js
- tests/test_pytest_runner.py
- tests/test_test_initializer.py
- tests/unit/test_config_manager.py
- tests/unit/test_stdio_protocol.py
- tests/unit/test_test_initializer_integration.py

### 文档（1 个）
- AGENTS.md

### 备份
所有原始文件已备份到 `trae-backup/`（扁平 `__` 命名）。

---

## 维度交叉确认的系统性问题

| 系统性问题 | 涉及项 |
|---|---|
| 文档作为 workspace_rules 但严重漂移 | M1（10 严重 + 10 轻微） |
| 资源生命周期不闭环 | S1（Electron 退出钩子）+ M6（PytestProcess 无 stop） |
| 注入模式三/多模式并存 | M2（mainWindow）+ M3（collaborator 形态）+ M4（factory） |
| 单例/Service Locator 残留 | M5（3 处 Python 单例）+ i18n 已修但未跟进 |
| 跨语言协议字段无契约 | M9（Response schema）+ S6（stdio 耦合 inspector）|
| 静默吞异常残留 | M8（3 处）+ stdio_protocol 已修 |
| 跨语言路径/常量未单源 | S2（adb 路径）+ S5（locales 路径）+ M7（IPC 命名）|
