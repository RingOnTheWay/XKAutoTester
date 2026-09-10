# ADR-0011: Toast 通知去重 (文本即 key) + 错误通知单一归口

- **状态**: 已接受 (2026-09-10)
- **领域**: 渲染层通知 (Toast) / MVC 错误契约
- **来源**: improve-codebase-architecture 候选 #1 (git 热点驱动: 双 toast 历史上 6 个 commit 症状治疗)

## 背景

「双 toast」(同一错误弹两次 / 取消成功+红色失败并存) 历经 6 个 commit 修复, 全部在**调用方**打补丁: 800ms 去重锁、三重保险 (占锁+静默取消+组件防重)、R27 P2-6 的「model 刻意不 emit, controller 查 success 弹错」。两个结构性根因:

1. **组件浅**: `ToastManager.show()` 无去重能力 —— 同一消息连发两次就是两条 toast。每个新调用方都要重新发明防重逻辑。
2. **错误通知契约不统一**: settings model 的 22 个方法 emit('error') 由 controller 单点 toast, 但 `exportConfig`/`exportLogs` 两处刻意「不 emit」改由 controller 查 `result.success` 弹错, `importConfig` 则两种方式并存 —— 调用方被迫记住「哪个方法会弹 toast、哪个不会」, 接口复杂度 ≈ 实现复杂度 (浅接口)。

## 决策

### 1. Toast 文本去重 (组件层)

- 去重键 = `类型:文本` (dedupKey), **文本即 key**, 无需调用方显式传 key
- 同 key 且 toast 展示中 (非 fade-out 退场) → **复用**: 清旧计时 + 重置新计时, 返回同一元素
- 异文本 / 同文本异类型 → 独立 toast 共存
- toast 移除 / `clearAll()` 时同步清理 key 索引 (防 ghost 复用)

**选择文本即 key 而非显式 key opt-in 的理由**: 历史双 toast bug 均为同一 message 重复 emit, 文本 key 零调用方改动全局根治; 显式 key 需逐点改造, 存量风险点仍要人工排查。已知取舍: 两条同名不同事的 toast 会被合并 (现实中未见此用例)。

### 2. 错误通知单一归口 (契约层)

- **model 层错误一律 `emit('error')`** (含 IPC reject 与 IPC resolve `success:false` 两种形态, 后者在 model 内归入 emit 路径)
- **controller 单点** `error` 事件 → toast
- **返回值只做流程控制** (如 `needRestart` 判断), 不做通知

`exportConfig`/`exportLogs`/`importConfig` 由「调用方查 success 弹错」改回统一 emit; controller 删除 else 弹错分支。

## 范围

- 仅 settings tab 落地契约统一 (最热区); 其他 tab 的 model 本就统一 emit, 无需改动。
- 不动更新下载取消链路 (`#cancelling` 旗是 ADR-0001 实现补充记录的协调设计, 保留)。

## 后果

- **正面**: 双 toast 防御从 N 个调用方集中到 1 处 (locality); 新调用方零防重负担; 组件接口即测试面 (6 条单测锁死去重语义)。
- **负面 / 注意**: 进度类 toast 文本含变动数值 (如 `${percent}%`) 时 key 不同仍会堆叠 —— 属既有行为, 不在本 ADR 范围。
- **改动文件**: `renderer/components/toast.js`、`renderer/tabs/settings/model.js`、`renderer/tabs/settings/controller.js`、`tests/electron/test_toast_dedup.js`。

## 词汇

`Toast Dedup (通知去重)` — 见 CONTEXT.md。
