# XKAutoTester — 领域词汇表 (Context)

> 本文件记录项目领域概念与高频词汇, 供架构审查 / 精化 / AI 导航对齐语义。
> 每次引入新的领域概念或收敛模糊术语时在此登记 (见 ADR)。

## DownloadOutcome (更新下载结局)

**定义**：更新下载的终端结局词汇。由主进程 (UpdateService) 产出权威值, 渲染层只订阅不猜测。

- `completed` — 下载完成 (含 `filePath`)
- `cancelled` — 用户/超时中止, abort 的唯一归处 (不视为失败)
- `no_active` — 调用取消时无活跃下载 (幂等成功, 不打扰 UI)

**演化**：原 `cancelled:true` 布尔 + `action:'cancelled'|'no_active'` 两套信号 + 渲染层时间窗/正则嗅探并散, 已收敛为单一 `state` —— 见 [ADR-0001](docs/adr/ADR-0001-update-download-outcome.md)。

**位置**：`electron/src/shared/constants.js` → `UPDATE_DOWNLOAD_STATE`；渲染层镜像 `UPDATE_DOWNLOAD_RESULT_STATE` (settings/model.js)。

## 通知去重 (Toast Dedup)

**定义**：Toast 通知层职责 —— 同文本同类型通知在展示期内复用单条，调用方无防重义务。

- **文本即 key**：去重键为 `类型:文本`，同 key 再发 → 复用已有通知并重置计时；异文本/异类型独立共存
- **复用而非丢弃**：连发同文本只显一条，且按最后一次发送重新计时
- **错误通知单一归口**：model 层错误一律 `emit('error')`，controller 单点渲染 toast；方法返回值只做流程控制，不做通知

**演化**：历史上双 toast 由调用方各自防御（800ms 锁 / 占锁静默 / 查 success 不 emit），已收敛为通知层能力 + 契约 —— 见 [ADR-0011](docs/adr/ADR-0011-toast-dedup-and-error-notification-contract.md)。

**位置**：`electron/renderer/components/toast.js` → `ToastManager`。

## 执行编排 (Execution Orchestration)

**定义**：测试执行 Tab 中执行流程的归属 — ExecutionModel 是编排者，`runTests`/`stopTests`/`runScheduledPlanNow` 全程内聚其中。

- **单向注入**：DevicePrecheck（设备前置检查）与输出缓冲作为能力构造注入 ExecutionModel；子模型间不反向引用、不成环
- **参数传入**：计划数据（`currentTestPlan`/`scheduledPlanInfo`）由外部取好后作参数传入，ExecutionModel 不持有计划状态
- **门面纯委托**：TestExecutionModel 门面只做转发/组装/事件上抛，不承载编排

**演化**：原 TestExecutionModel 1600 行单类混 7 子域（R10 mixin 内联未分组），2026-09-16 架构审查后拆 5 子模型 — 见 [ADR-0012](docs/adr/ADR-0012-test-execution-model-split.md)。

**位置**：`electron/renderer/tabs/test-execution/models/`（ExecutionModel/ScheduledPlanModel/TestPlanModel/DevicePrecheckModel/ReportModel）+ `model.js` 门面。

## 设备前置检查 (Device Precheck)

**定义**：测试执行前的设备侧校验闭环 — 安卓用例设备信息检查、蓝牙用例端口检查、设备选择/替换确认、设备 ID 编辑。产出 `{valid, message}` 或经事件请求 UI 决策。

**位置**：`electron/renderer/tabs/test-execution/models/DevicePrecheckModel.js`。

## Quick 参考

- 页面封装 / Inspector 等词条按需补充。