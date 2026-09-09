# ADR-0004: 编辑器「单一编辑会话」重构 — 否决

- **状态**: 已否决 (2026-09-08)
- **领域**: renderer 编辑器 (test-case / test-execution)
- **来源**: improve-codebase-architecture 候选 #4 (Speculative)

## 调查结论

**不实施重构。** 理由 (删除测试 + 状态局部性审计):

1. **状态基本单源**: `test-execution/model.js:_state` 集中持 `currentTestPlan` / `selectedTestFiles` / `currentMarkers`, 事件驱动 (`currentTestPlan-changed` / `currentMarkers-changed`) → controller → view 重渲染。`test-case` 状态经 `Model.get()` 统一代理到 FileBrowser/OptionPanel/StepEditor/TestCaseEditor 四个深模块, 已有清晰归属。
2. **历史「测试类型区不刷新」bug** 是重渲染路径里独立的 DOM 刷新 wiring bug (现修复), 非系统性多写方漂移。可选中子态 (checkbox checked) 临时存 DOM, 随每次 `displayTestTypes()` 重建, 由 model+controller 同步。
3. **删除测试**: 引入「edit-session 单一对象」不会干净集中复杂度, 只会重包 model+事件已提供的能力; 改动面大 (两 tab 高 churn UI)、收益低、回归风险高。

## 结论

未来架构审查不应再重提「为 test-case / test-execution 建单一编辑会话」。若出现真实的多写方漂移 (选中态在 controller/model/view 持久共存且可互覆), 需先以本次为准重新取证。

## 记录位置
- 调查证据: `electron/renderer/tabs/test-execution/{model,controller,view}.js`。
- 本次完整改动 (ADR-0001~0003) 见 dev-records/。