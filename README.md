# XKAutoTester - 自动化测试框架

基于Pytest框架的自动化测试项目，支持数据驱动、日志管理、Allure报告生成等功能。

## 项目特性

- >>> **Pytest框架** - 现代化的Python测试框架
- >>> **YAML数据驱动** - 测试数据与代码分离
- >>> **日志管理** - 统一的日志记录和分级管理
- >>> **Allure报告** - 美观的测试报告生成
- >>> **用例标记** - 支持单元测试、冒烟测试、异常测试标记
- >>> **模块化设计** - 高度解耦，易于扩展
- >>> **配置文件管理** - 所有参数可自定义配置
- >>> **Python API运行** - 使用Pytest Python API，不依赖命令行
- >>> **自动报告生成** - 测试完成后自动生成Allure报告
- >>> **测试计划管理** - 支持测试计划名称输入和动态报告目录管理
- >>> **历史记录管理** - 自动保存和加载测试计划历史记录

## 项目结构

```
XKAutoTester/
├── config/                 # 配置文件目录
│   └── config.py          # 项目配置文件
├── electron/              # Electron桌面应用目录
│   ├── main.js            # Electron主进程
│   ├── package.json       # Electron项目配置
│   ├── preload.js         # 预加载脚本
│   └── renderer/          # 渲染进程文件
│       ├── index.html     # 主界面HTML
│       ├── script.js      # 前端JavaScript逻辑
│       └── styles.css     # 样式文件
├── tests/                  # 测试用例目录
│   └── test_personal_info.py     # 个人信息测试用例
├── utils/                  # 工具模块目录
│   ├── logger.py          # 日志管理模块
│   ├── data_loader.py     # 数据加载模块
│   ├── test_utils.py      # 测试工具模块
│   └── pytest_runner.py   # Pytest测试运行器
├── test_data/             # 测试数据目录
│   ├── personal_info.yaml # 个人信息测试数据
│   ├── smoke_test.yaml    # 冒烟测试数据
│   └── exception_test.yaml # 异常测试数据
├── logs/                  # 日志文件目录
├── allure-results/       # Allure结果目录（临时文件，每次测试前清空）
├── allure-reports/      # Allure报告目录（包含多个测试计划的报告）
├── test_plans.json      # 测试计划历史记录文件
├── requirements.txt      # Python项目依赖
├── generate_sample_data.py  # 示例数据生成脚本
├── pytest.ini           # Pytest配置
├── electron_run_tests.py # Electron测试运行器
├── run_tests.py         # 测试运行脚本（Python API版本）
├── start_electron.bat   # Electron启动脚本（Windows）
└── README.md            # 项目说明
```

## 快速开始

### 1. 环境准备

```bash
# 安装依赖
pip install -r requirements.txt

# 安装Allure命令行工具（可选，用于生成报告）
# Windows: scoop install allure
# Mac: brew install allure
# Linux: 参考Allure官方文档
```

### 2. 运行测试

#### 方式一：使用Electron桌面应用（推荐）

```bash
# 启动Electron应用
start_electron.bat
```

或者手动启动：

```bash
# 进入electron目录
cd electron

# 安装依赖（首次运行）
npm install

# 启动应用
npm start
```

**Electron应用特性**：
- 图形化界面，支持拖拽选择测试目录
- 可视化测试计划管理
- 实时测试进度显示
- 一键生成和查看Allure报告
- 测试历史记录管理

#### 方式二：使用命令行脚本

```bash
python run_tests.py
```

然后选择相应的测试选项：
- 1: 选择测试目录并运行测试（先选目录，后选测试类型）
- 2: 生成Allure报告
- 3: 打开Allure报告
- 4: 查看测试计划历史
- 5: 清空测试计划历史
- 0: 退出

**交互流程**：
1. 选择选项1后，首先选择测试目录
2. 输入测试计划名称（如："冒烟测试_20241201"）
3. 然后选择测试类型（所有测试/冒烟测试/单元测试/异常测试/自定义标记）
4. 运行测试并自动生成Allure报告（报告保存在allure-reports/测试计划名称/目录下）
5. 可选择继续运行其他测试或返回主菜单

**测试计划管理特性**：
- 每次测试前需要输入测试计划名称
- 生成的allure-result过程文件会在测试前自动删除
- 每个测试计划执行后生成对应名称的allure-report文件夹
- 支持查看和选择历史测试计划报告
- 测试计划历史记录自动保存到test_plans.json文件

#### 方式二：使用Python API（推荐）

```python
from run_tests import TestRunner

# 创建运行器
runner = TestRunner()

# 发现测试目录
test_dirs = runner.discover_test_directories()
print(f"发现的测试目录: {test_dirs}")

# 运行选定路径的所有测试
success = runner.run_all_tests(['tests/'])
print(f"测试结果: {success}")

# 运行选定路径的冒烟测试
success = runner.run_smoke_tests(['tests/'])

# 运行选定路径的单元功能测试
success = runner.run_unit_tests(['tests/'])

# 运行选定路径的异常场景测试
success = runner.run_exception_tests(['tests/'])

# 运行自定义路径和标记的测试
success = runner.run_custom_tests(['tests/'], ['smoke'])

# 生成Allure报告
success = runner.generate_allure_report()

# 打开Allure报告
success = runner.open_allure_report()
```

#### 方式三：使用Pytest命令

```bash
# 运行所有测试
pytest tests/ -v

# 运行冒烟测试
pytest tests/ -m smoke -v

# 运行单元功能测试
pytest tests/ -m unit -v

# 运行异常场景测试
pytest tests/ -m exception -v

# 生成Allure报告
pytest tests/ --alluredir=allure-results
allure generate allure-results -o allure-report --clean
allure open allure-report
```

## TestRunner 使用指南

项目提供了全新的 `TestRunner` 类，基于 Pytest Python API 构建，支持先选目录后选测试类型的交互逻辑。

### 核心特性

- **先选目录后选测试类型**：用户首先选择测试目录，然后选择测试类型
- **目录状态管理**：自动跟踪当前选定的测试目录
- **纯Python实现**：使用 `pytest.main()` API 运行测试
- **自动报告生成**：测试完成后自动生成 Allure 报告
- **状态反馈**：提供详细的测试结果摘要
- **跨平台兼容**：无需担心不同操作系统的命令行差异

### 基本用法

```python
from run_tests import TestRunner

# 创建运行器实例
runner = TestRunner()

# 发现项目中的测试目录
test_dirs = runner.discover_test_directories()
print(f"发现的测试目录: {test_dirs}")

# 设置当前测试路径
runner.set_current_test_paths(['tests/'])

# 运行选定路径的所有测试
success = runner.run_all_tests(['tests/'])
print(f"测试结果: {success}")

# 获取当前测试路径
current_paths = runner.get_current_test_paths()
print(f"当前测试路径: {current_paths}")
```

### 高级用法

```python
# 运行选定路径的冒烟测试
success = runner.run_smoke_tests(['tests/'])

# 运行选定路径的单元功能测试
success = runner.run_unit_tests(['tests/'])

# 运行选定路径的异常场景测试
success = runner.run_exception_tests(['tests/'])

# 运行自定义路径和标记的测试
success = runner.run_custom_tests(['tests/'], ['smoke'])

# 生成Allure报告
success = runner.generate_allure_report()

# 打开Allure报告
success = runner.open_allure_report()
```

### 目录选择和测试运行功能

项目支持用户先选择测试目录，然后选择测试类型，实现灵活的测试管理：

```python
from run_tests import TestRunner

# 创建运行器
runner = TestRunner()

# 发现项目中的测试目录
test_dirs = runner.discover_test_directories()
print(f"发现的测试目录: {test_dirs}")
# 输出: 发现的测试目录: ['.pytest_cache/', 'test_data/', 'tests/']

# 设置当前测试路径
runner.set_current_test_paths(['tests/'])

# 运行选定路径的所有测试
success = runner.run_all_tests(['tests/'])
print(f"测试结果: {success}")

# 运行选定路径的冒烟测试
success = runner.run_smoke_tests(['tests/'])

# 运行自定义路径和标记的测试
success = runner.run_custom_tests(['tests/'], ['smoke'])
```

#### 新的交互式测试流程

在运行脚本中，选择选项 "1. 选择测试目录并运行测试" 可以：
1. 自动发现项目中的测试目录
2. 让用户选择要运行的测试目录（支持多选）
3. 选择测试类型（所有测试/冒烟测试/单元测试/异常测试/自定义标记）
4. 运行指定目录的测试并生成报告

示例交互流程：
```
==================================================
自动化测试运行器 (Python API版本)
==================================================
📁 当前测试目录: 未选择
==================================================
1. 选择测试目录并运行测试
2. 生成Allure报告
3. 打开Allure报告
0. 退出
==================================================
请选择操作 (0-3): 1

==================================================
选择测试目录
==================================================
1. tests/
2. test_data/
0. 返回主菜单
==================================================
请选择测试目录 (输入序号，多个用逗号分隔): 1
✅ 已选择测试目录: tests/
✅ 已设置测试路径: tests/

==================================================
选择测试类型
==================================================
1. 运行所有测试
2. 运行冒烟测试
3. 运行单元功能测试
4. 运行异常场景测试
5. 自定义测试标记
0. 返回目录选择
==================================================
请选择测试类型 (0-5): 1
```

### 测试结果格式

测试结果返回字典包含以下信息：

```python
{
    "exit_code": 0,                    # 退出码 (0=成功, 1=失败, 2=中断等)
    "allure_report_path": "path/to/report",  # Allure报告路径
    "test_paths": ["tests/"],          # 测试路径列表
    "markers": ["smoke"],              # 测试标记列表
    "keywords": None                   # 关键字过滤列表
}
```

## 测试用例标记

项目支持以下测试标记：

- `@pytest.mark.smoke` - 冒烟测试
- `@pytest.mark.unit` - 单元功能测试
- `@pytest.mark.exception` - 异常场景测试
- `@pytest.mark.critical` - 关键功能测试

### 使用示例

```python
import pytest
from utils.test_utils import test_marker

@test_marker.smoke_test
def test_smoke_case():
    """冒烟测试用例"""
    pass

@test_marker.unit_test
def test_unit_case():
    """单元功能测试用例"""
    pass

@test_marker.exception_test
def test_exception_case():
    """异常场景测试用例"""
    pass
```

## 数据驱动

测试数据使用YAML格式管理，支持从文件加载测试用例：

### YAML数据格式

```yaml
test_cases:
  - case_id: "PI_001"
    name: "正常个人信息填写"
    description: "验证正常个人信息填写功能"
    data:
      name: "张三"
      age: 25
      gender: "男"
      email: "zhangsan@example.com"
      phone: "13800138000"
      address: "北京市朝阳区"
    expected:
      success: true
      message: "个人信息保存成功"
```

### 数据驱动测试示例

```python
from utils.test_utils import data_provider

@data_provider.parametrize_from_yaml("personal_info")
def test_personal_info(test_data, expected, case_info):
    """数据驱动测试示例"""
    result = personal_info_service.save_personal_info(test_data)
    assert result["success"] == expected["success"]
```

## 配置管理

所有可配置参数都在 `config/config.py` 中管理：

### 主要配置项

- **日志配置**：日志级别、格式、文件路径等
- **测试数据配置**：数据文件路径、文件名等
- **报告配置**：Allure报告目录等
- **测试用例配置**：测试目录、标记定义等

### 自定义配置示例

```python
# 修改日志级别
LOG_CONFIG["level"] = "DEBUG"

# 修改测试数据目录
TEST_DATA_CONFIG["data_dir"] = "/custom/data/path"

# 添加新的测试标记
TEST_CASE_CONFIG["new_marker"] = "new_feature"
```

## 日志管理

项目使用统一的日志管理系统：

### 使用示例

```python
from utils.logger import get_logger

logger = get_logger(__name__)

logger.info("这是一条信息日志")
logger.debug("这是一条调试日志")
logger.warning("这是一条警告日志")
logger.error("这是一条错误日志")
```

### 日志配置

日志配置在 `config/config.py` 中管理：

```python
LOG_CONFIG = {
    "level": "INFO",  # 日志级别
    "format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    "file_path": "logs/test.log",  # 日志文件路径
    "max_bytes": 10485760,  # 10MB
    "backup_count": 5  # 备份文件数量
}
```

## 测试计划管理

项目新增了完整的测试计划管理功能，支持测试计划名称输入、动态报告目录生成和历史记录管理。

### 测试计划特性

1. **测试计划名称输入** - 每次运行测试时支持输入测试计划名称，默认为"default_plan"
2. **动态报告目录** - 根据测试计划名称自动生成独立的Allure报告目录
3. **历史记录管理** - 自动保存和加载测试计划历史记录
4. **持久化存储** - 测试计划历史记录保存在 `test_plans.json` 文件中
5. **历史查看和清理** - 支持查看测试计划历史记录和清空历史

### 使用示例

#### 交互式测试计划管理

在运行脚本中，选择任意测试运行选项后，系统会提示输入测试计划名称：

```
==================================================
自动化测试运行器
==================================================
📁 当前测试目录: tests/
📊 测试计划: default_plan
==================================================
1. 运行所有测试
2. 运行冒烟测试
3. 运行单元功能测试
4. 运行异常场景测试
5. 自定义测试标记
6. 查看测试计划历史
7. 清空测试计划历史
8. 打开Allure报告
0. 退出
==================================================
请选择操作 (0-8): 1

请输入测试计划名称 [default_plan]: my_smoke_test_001
```

#### 查看测试计划历史

选择选项 "6. 查看测试计划历史" 可以查看所有历史测试计划记录：

```
==================================================
测试计划历史记录
==================================================
1. default_plan
   - 路径: tests/
   - 标记: all
   - 报告: allure-reports/default_plan
   - 时间: 2024-01-15 10:30:25

2. my_smoke_test_001
   - 路径: tests/
   - 标记: smoke
   - 报告: allure-reports/my_smoke_test_001
   - 时间: 2024-01-15 11:15:42

3. regression_test_2024
   - 路径: tests/
   - 标记: regression
   - 报告: allure-reports/regression_test_2024
   - 时间: 2024-01-15 14:20:18
```

#### 清空测试计划历史

选择选项 "7. 清空测试计划历史" 可以清空所有历史记录：

```
==================================================
清空测试计划历史
==================================================
⚠️  警告：此操作将清空所有测试计划历史记录，且无法恢复！
是否继续？(y/N): y
✅ 测试计划历史记录已清空
```

### 程序化使用

#### 使用测试计划名称运行测试

```python
from run_tests import TestRunner

# 创建运行器
runner = TestRunner()

# 运行所有测试并指定测试计划名称
result = runner.run_all_tests(test_plan_name="regression_test_2024")

# 运行冒烟测试并指定测试计划名称
result = runner.run_smoke_tests(test_plan_name="daily_smoke")

# 运行自定义测试并指定测试计划名称
result = runner.run_custom_tests(['tests/'], ['critical'], test_plan_name="critical_features")
```

#### 测试计划历史管理

```python
# 查看测试计划历史
history = runner.list_test_plans()

# 清空测试计划历史
runner.clear_test_plans()
```

### 测试计划数据结构

每个测试计划记录包含以下信息：

```python
{
    "name": "test_plan_name",           # 测试计划名称
    "test_paths": ["tests/"],           # 测试路径列表
    "markers": ["smoke"],               # 测试标记列表
    "report_path": "allure-reports/test_plan_name",  # 报告路径
    "timestamp": "2024-01-15 10:30:25"  # 时间戳
}
```

### 持久化存储

测试计划历史记录自动保存在项目根目录的 `test_plans.json` 文件中：

```json
[
    {
        "name": "default_plan",
        "test_paths": ["tests/"],
        "markers": ["all"],
        "report_path": "allure-reports/default_plan",
        "timestamp": "2024-01-15 10:30:25"
    },
    {
        "name": "my_smoke_test_001",
        "test_paths": ["tests/"],
        "markers": ["smoke"],
        "report_path": "allure-reports/my_smoke_test_001",
        "timestamp": "2024-01-15 11:15:42"
    }
]
```

## 扩展开发

### 添加新的业务服务

1. 在 `services/` 目录下创建新的服务文件
2. 实现业务逻辑
3. 在测试用例中导入并使用

### 添加新的测试类型

1. 在 `config/config.py` 中添加新的测试标记
2. 在 `utils/test_utils.py` 中添加对应的装饰器
3. 创建对应的YAML数据文件
4. 编写测试用例

### 自定义断言工具

在 `utils/test_utils.py` 的 `AssertionUtils` 类中添加新的断言方法。

## 故障排除

### 常见问题

1. **依赖安装失败**
   - 检查Python版本（需要Python 3.7+）
   - 使用国内镜像源：`pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple`

2. **Allure报告无法生成**
   - 确保已安装Allure命令行工具
   - 检查 `allure-results` 目录是否存在

3. **测试数据加载失败**
   - 检查YAML文件格式是否正确
   - 确认文件路径配置正确

4. **PytestRunner运行失败**
   - 检查Python路径是否正确导入
   - 确认 `pytest` 模块已正确安装
   - 查看日志文件获取详细错误信息

5. **测试标记警告**
   - 如果看到 `Unknown pytest.mark` 警告，这是正常的
   - 测试标记已在 `pytest.ini` 中定义，警告不影响测试运行

### 调试模式

启用调试日志：

```python
# 在 config/config.py 中修改
LOG_CONFIG["level"] = "DEBUG"
```

### PytestRunner调试

如果PytestRunner遇到问题，可以启用详细日志：

```python
from utils.logger import get_logger
import logging

# 设置日志级别为DEBUG
logger = get_logger(__name__)
logger.setLevel(logging.DEBUG)

# 运行测试并查看详细日志
from utils.pytest_runner import PytestRunner
runner = PytestRunner()
result = runner.run_all_tests(generate_allure=False)
```

## 贡献指南

1. Fork 本项目
2. 创建特性分支
3. 提交更改
4. 推送到分支
5. 创建Pull Request

## 许可证

本项目采用 MIT 许可证。