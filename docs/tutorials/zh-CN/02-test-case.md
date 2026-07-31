# 02 - 测试用例管理

> **适用版本**: v0.1.4+ | **目标读者**: 有自动化测试经验的测试工程师

---

## 概述

「测试用例」Tab（`renderer/tabs/test-case/`，含 25 个 Mixin）提供可视化的 Android 测试用例编辑器，支持：

- 基本信息填写（文件名、名称、描述）
- 目标应用与平台选择
- 测试步骤可视化配置（引用页面封装中的元素定位器）
- Allure 报告标签配置（Epic / Feature / Story / Markers）
- Python 测试代码自动生成（`TestCaseCodeGenerator` + Jinja 模板，从 `TestCaseService` 拆出）
- 蓝牙 Mock 设备配置（BLE 串口模拟）

---

## 整体流程

```
选择测试目录 → 新建/选择用例 → 填写表单 → 添加测试步骤 → 保存并生成代码
```

---

## 步骤 1：选择测试目录

点击左侧「选择测试目录」按钮，选择存放测试用例 JSON 文件的文件夹。目录选择后：

- 左侧文件列表会列出该目录下所有 `.json` 用例文件
- 点击文件名可在右侧加载对应用例的编辑表单

---

## 步骤 2：新建测试用例

点击右侧面板中央的 **+** 按钮，进入编辑表单。

### 2.1 填写基本信息

| 字段 | 说明 | 约束 |
|------|------|------|
| **文件名称** | 生成的 JSON 文件名 | 仅英文、数字、下划线（如 `login_test`） |
| **用例名称** | 用例中文名称，用于 Allure 报告标题 | 任意文本 |
| **用例描述** | 用例说明 | 任意文本 |

### 2.2 选择应用平台

| 字段 | 说明 |
|------|------|
| **平台** | 固定为 `Android` |
| **应用** | 从「页面封装」中已添加的应用列表中选择 |

> 选择应用后，「测试步骤」区域解锁；选择应用前步骤区域为禁用状态。

---

## 步骤 3：配置测试步骤

测试步骤是自动化测试执行的核心单元。每个步骤包含：**动作**（操作元素的方式）和**属性**（该动作所需的参数）。

### 3.1 添加步骤

点击「添加步骤」按钮，将一个步骤卡片插入步骤列表。

### 3.2 步骤动作类型

| 动作 | 说明 | 关键参数 |
|------|------|----------|
| **click** | 点击元素 | 目标页面 + 元素 |
| **input_text** | 输入文本 | 目标页面 + 元素 + 输入值 |
| **get_text** | 获取文本 | 目标页面 + 元素 + 变量名 |
| **wait_for_element** | 等待元素出现 | 目标页面 + 元素 + 超时(秒) |
| **swipe** | 滑动操作 | 方向 + 偏移量 + 起始坐标 |
| **back** | 返回键 | 无额外参数 |
| **home** | Home 键 | 无额外参数 |
| **install_app** | 安装应用 | APK 路径 |
| **remove_app** | 卸载应用 | 包名 |
| **start_app** | 启动应用 | 包名 |
| **assert_text** | 断言文本匹配 | 目标页面 + 元素 + 预期值 |
| **launch_app** | 启动 Activity | Activity 名称 |
| **launch_app_with_wait** | 启动 Activity 并等待 | Activity + 等待页面 + 等待元素 |
| **sleep** | 等待固定时长 | 秒数 |
| **start_ble_mock** | 启动蓝牙 Mock | 设备名称 |
| **stop_ble_mock** | 停止蓝牙 Mock | 设备名称 |
| **start_app_permission** | 授权应用权限 | 应用包名 |

### 3.3 步骤属性详解

每个步骤根据其动作类型展示不同的属性字段：

#### 基础属性（大部分动作共有）

| 属性 | 说明 |
|------|------|
| **目标页面** | 从当前选中应用的页面封装中选择，自动关联元素定位器 |
| **目标元素** | 从目标页面的元素列表中选择，引用其定位器(ID/XPath等) |
| **步骤描述** | 步骤说明文本 |

#### 特殊属性

| 动作 | 额外属性 |
|------|----------|
| **input_text** | **输入值** — 文本内容 / 变量引用（如 `${phone_number}`） |
| **wait_for_element** | **超时时间(秒)** — 最大等待时长 |
| **get_text** | **变量名** — 提取的文本存入该变量，后续步骤可通过 `${变量名}` 引用 |
| **swipe** | **滑动方向** — up/down/left/right；**偏移量** — 0.0~1.0 屏幕比例 |
| **assert_text** | **预期值** — 期望匹配的文本（分两种失败语义：元素未找到重试 / 值不匹配立即 fail） |
| **sleep** | **等待秒数** |
| **start_ble_mock** | **蓝牙设备名称** — 从已配置的 BLE 设备中选择 |
| **start_app_permission** | **应用包名** |

### 3.4 步骤操作

每个步骤卡片支持：
- **拖拽排序** — 按住左侧拖拽手柄调整执行顺序
- **复制** — 复制当前步骤插入到下一位置
- **删除** — 移除当前步骤

---

## 步骤 4：配置 Allure 标签（可选）

展开「Allure配置」折叠面板，设置报告标签：

| 标签 | 说明 | 示例 |
|------|------|------|
| **Epic** | 被测应用/系统 | `被测应用` |
| **Feature** | 被测模块 | `登录模块` |
| **Story** | 被测功能 | `密码登录` |
| **Markers** | Pytest 标记 | `smoke`, `regression` |

> Markers 选项来源于 `config/pytest.ini` 中定义的 markers 列表。

---

## 步骤 5：保存并生成 Python 代码

点击右下角「保存」按钮：

1. 用例 JSON 文件写入测试目录
2. Python 测试脚本自动生成到对应目录（基于 `templates/test_case_template.py` 模板）

生成的 Python 代码自动集成 `TestInitializer`，包含 ADB 连接、Appium 启动和蓝牙初始化（如有）逻辑。

---

## 管理用例

### 编辑已有用例

点击左侧文件列表中的文件名加载用例 → 修改表单 → 点击「保存」。

### 删除用例

进入编辑状态后，点击左下角「删除」红色按钮，确认后删除 JSON 文件和对应 Python 代码。

### 取消编辑

点击「取消编辑」退出当前编辑状态，返回空表单。

---

## 蓝牙 Mock 设备配置

当测试步骤中包含 `start_ble_mock` / `stop_ble_mock` 动作时，需要在用例中配置蓝牙设备。

### 配置方式

1. 在测试用例表单的「设备」信息中，选择「添加蓝牙Mock端口」
2. 输入串口端口号（如 `COM7`），须匹配 `config/ble_device.json` 中已配置的设备
3. 生成的代码将自动包含 BLE 设备初始化逻辑

### BLE 设备管理

在「安卓连接 → 设备管理」中可通过 `BleDeviceDiscoveryService` + `SerialPortEnumerator` 扫描可用串口和已连接的蓝牙设备，配置参数（名称、串口端口、波特率等）持久化到 `config/ble_device.json`。详见 [05 - 设备连接与投屏](05-device-connection.md)。

---

## 生成的代码结构

保存后生成的 Python 测试文件结构：

```
test_cases/
├── login_test.json          # 用例元数据
└── login_test.py            # 自动生成的测试脚本
    ├── TestInitializer      # 统一初始化（ADB + Appium + BLE）
    ├── setup_method()       # 每个测试方法执行前自动运行
    ├── test_login_test()    # 生成的测试方法
    └── 步骤映射代码         # JSON 步骤 → Python 代码的 1:1 映射
```

### 代码生成机制（重构后）

代码生成由 `TestCaseCodeGenerator`（`services/TestCaseCodeGenerator.js`）负责，该模块从原 `TestCaseService` 拆出，进一步通过 `services/mixins/` 下 5 个 Mixin 拆分逻辑：

| Mixin | 职责 |
|------|------|
| `generatorCodeBuildersMixin.js` | 代码片段构建 |
| `generatorHelpersMixin.js` | 辅助工具 |
| `generatorStepsMixin.js` | 步骤代码生成 |
| `generatorTemplateConfigMixin.js` | 模板配置 |
| `generatorTestMethodsMixin.js` | 测试方法生成 |

---

## 下一步

- [03 - 页面元素封装](03-page-package.md)
- [04 - 测试执行与报告](04-test-execution.md)
