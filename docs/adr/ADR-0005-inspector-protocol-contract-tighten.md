# ADR-0005: Inspector 协议契约测试收紧 — 消除 Python 侧漂移盲区

- **状态**: 已接受 (2026-09-09)
- **领域**: Inspector stdio 协议 / 跨 JS-Python seam
- **来源**: 架构探索 tier-2 候选 A (协议三处手写同步的漂移风险)

## 背景

`electron/src/shared/inspector-constant.json` (inspector-protocol.json) 是协议 SSOT, `inspectorConstants.js` 与 `src/main/core/inspector_constants.py` 镜像它。既有契约测试 `test_inspector_protocol_contract.js` 已覆盖大部分, 但有两个盲区:

1. **Python 命令测试硬编码**: 旧测试用硬编码 6 命令列表, 只查"这些在 Python 源码里", 不查"Python 是否新增/删除了命令"→ Python 扩命令而 schema/JS 未跟时**不 fail**。
2. **Python FRAME_KINDS 无 schema 校验**: 只有 JS 侧比, Python 侧 `FRAME_KINDS` 漂移无测试兜底。

## 决策

把契约测试改为**从 Python 源码解析实际集合**, 消除硬编码与盲区:

- 新增辅助 `extractPythonCommands` (经 `INSPECTOR_COMMANDS` 元组 + 具名常量解析真实命令集合) 与 `extractPythonStringTuple` (解析字面量元组)。
- Python 命令测试改用 `extractPythonCommands` 与 schema 深比较 → Python 增删命令即 fail。
- 新增 `Python FRAME_KINDS ↔ schema kind.const` 测试。

## 后果

- **正面**: 协议三方 (schema / JS / Python) 契约真正 airtight —— 任一端增删命令/帧类型/通知类型, 单测即红, 消除"手改三处漏一处"的漂移隐患。
- **负面 / 注意**: 测试依赖 Python 源码文本结构 (`元组字面量`、`具名常量=字符串`); 若重构 Python 常量写法需同步改解析器。

- **改动文件**: `tests/electron/test_inspector_protocol_contract.js` (19 tests 全过, lint clean)。