# ADR-0006: 本轮审计判保留 — TestCaseCodeGenerator 单体 & 定时计划状态词

- **状态**: 已接受 (2026-09-09, 审计结论: 均保留现状)
- **领域**: renderer/main 边界
- **来源**: 架构探索 tier-2 候选 B / C

## B: TestCaseCodeGenerator (1102 行) — 判保留

**不拆分。** 理由 (删除测试 + 结构审计):
- 文件虽大, 但**内部已按职责细分解**: 安全转义函数族 / 入口 / helpers / template-config / code-builders / test-methods / 各步骤类型 (element / multi-element / ble / system / page) 各自方法。方法小而专注, 非"巨型 if-else 字符串拼"浅单体。
- 删除测试: 拆成多文件只加 seam, 复杂度仍要在主入口按 step type 派发, 属"挪位"而非"集中"。
- 已有 `test_test_case_code_generator.js` 覆盖, 拆分风险高 (矩阵: ble/android/web × 步骤类型)。

## C: 定时计划状态词 — 判保留

**不收敛为共享枚举。** 理由:
- 渲染层展示逻辑**已单源** (renderer/core/utils/scheduledPlanStatus.js, 原 view/model 双份已 P2-2 收敛)。
- 状态值 ('pending'/'running'/'completed'/'failed'/'cancelled'/'expired') 是**持久化到 scheduled_plans.json 的数据**, main 侧写 (smartScheduler/ScheduledPlanService), renderer 读。跨层读写, 值必须对历史文件保持稳定 → 共享枚举只加映射、不防抖, 收益低。

## 结论
A (协议契约测试收紧) 已落地见 ADR-0005。B/C 未来架构审查不应重提拆分/收敛, 除非出现真实的重复多写方漂移。