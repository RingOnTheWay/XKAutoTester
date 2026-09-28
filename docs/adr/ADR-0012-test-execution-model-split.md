# ADR-0012: TestExecutionModel 拆 5 子模型 + ExecutionModel 承载编排

- **状态**: 已接受 (2026-09-16)
- **领域**: 渲染层 MVC / 测试执行 Tab
- **来源**: improve-codebase-architecture 候选 ① (git 热点驱动: test-execution view 12 改 / controller 8 改, R26 深化轮唯一漏掉的大头)

## 背景

`TestExecutionModel` 单类 1600 行 / 58 公开方法, 混 7 个子域 (目录文件/测试计划/执行输出/设备前置检查/定时计划/标记提取/报告)。R10 曾拆 6 个 mixin 又合回, 但合回只是物理内联未按子域分组 — `runTests` 单方法 300 行跨 4 子域, 7 色方法交错共享一个 `_state`, 改任一子域需通读全类 (无 locality)。

R26 已在 settings tab 验证「子模型 + 门面」模式 (598 行 → 27 行门面 + ConfigModel/ThemeModel/UpdateModel, 1353 测试全绿), 本决策将其推广到 test-execution, 并处理 settings 未遇到的跨域编排问题。

## 决策

### 1. 拆分形状 — 5 子模型

```
models/
├── TestPlanModel        # 测试计划 CRUD/选中态
├── ScheduledPlanModel   # 定时计划 CRUD/到期处理/冲突检查
├── ExecutionModel       # 执行编排: 目录/文件选择 + 标记提取 + 输出缓冲 + runTests/stopTests/runScheduledPlanNow
├── DevicePrecheckModel  # 设备前置检查: 安卓设备/蓝牙端口校验/设备选择/设备 ID 编辑
└── ReportModel          # 报告: 弹窗/运行记录/删除/打开/钉钉通知
```

标记提取与目录/文件选择归 ExecutionModel (它们是执行的**输入状态**, 分开会造成跨模型状态同步); 不拆 7 (接口面变大) 也不粗拆 3 (RunModel 会长回 800+ 行)。

### 2. 编排归属 — ExecutionModel, 不在门面

settings 模式是「子模型互不引用, 路由只活在门面」。test-execution 的 `runTests` 跨 4 子域 (前置检查→输出→循环执行→通知), 若编排放门面, 门面膨胀回 500+ 行巨型类 — 违背深化目标。

取舍: **ExecutionModel 作编排者**, DevicePrecheckModel 与输出缓冲单向构造注入其中; 门面保持纯委托。跨域能力依赖方向固定为 `Execution → DevicePrecheck`, 单向不成环。

**修订 (2026-09-16 实施期)**: `runScheduledPlanNow`/`handleScheduledTestStart`/`_executeScheduledPlanPlans` 是跨域组合 (定时计划重载 + 测试计划选中 + 执行), 落 **facade** (对齐 settings 门面 config→theme 路由先例), 不经回调注入 — ExecutionModel 保留 `runTests(testPlan, info)`/`stopTests` 纯运行生命周期。

### 3. 计划数据参数传入

`runTests(testPlan, scheduledPlanInfo)` — 计划数据由调用方 (controller/门面) 从 TestPlanModel/ScheduledPlanModel 取好后作参数传入。ExecutionModel **不持有计划状态**, 不注入 TestPlanModel/ScheduledPlanModel 引用 (那会让接口变宽、依赖变多)。

### 4. 事件上抛 — 显式 forward 列表

复刻 settings 门面: 子模型事件显式列出逐名转发 (`sub.on(event, (...args) => this.emit(event, ...args))`), 可 grep、MVC 事件契约测试 (`controller 订阅 ⊆ model 发射面`) 天然兼容。

### 5. 迁移 — 三步渐进, facade 保活

- Step 1: 拆 DevicePrecheckModel + ReportModel (边缘域, 无跨域依赖)
- Step 2: 拆 TestPlanModel + ScheduledPlanModel (CRUD 平移)
- Step 3: 拆 ExecutionModel (核心搬家 + 注入 precheck)

门面保持原公开面, `tests/electron/test_execution_model.js` 现有测试全程不动全绿; 新增子模型单测 (重点: ExecutionModel 注入 fake precheck)。

## 否决的备选

- **门面编排**: 门面从纯委托变回巨型类 (1600 行是 settings 的 2.7 倍)
- **runTests 三段分住子模型再串联**: 流程被切散, 改动时跨文件拼图 (无 locality)
- **共享 emitter 省转发样板**: 发射面词汇散落各子模型, 契约测试需改造, 弃
- **7 全拆 / 3 粗拆**: 前者接口面变大, 后者 RunModel 800+ 行回潮

## 后果

- **正面**: 定时计划/报告/前置检查 bug 各自集中一个模块 (locality); BaseModel (set 短路 + ADR-0011 emitError) 一次接入全 tab (leverage); MVC 契约测试自动覆盖 5 个新子模型; git 热点改动半径缩小。
- **负面 / 注意**: 门面转发列表 ~30 事件名需与子模型发射面同步维护 (契约测试兜底); `runTests` 编排内聚后 ExecutionModel 仍会是最大子模型 (~500 行), 属领域固有复杂度, 非浅模块。
- **改动文件**: `renderer/tabs/test-execution/model.js` (→门面)、`renderer/tabs/test-execution/models/*.js` (新增 5)、`tests/electron/test_execution_model.js` (不动)、`tests/electron/test_execution_models_split.js` (新增)。

## 词汇

`执行编排 (Execution Orchestration)`、`设备前置检查 (Device Precheck)` — 见 CONTEXT.md。
