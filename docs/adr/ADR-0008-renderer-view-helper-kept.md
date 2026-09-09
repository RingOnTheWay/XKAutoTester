# ADR-0008: renderer 视图 HTML/DOM helper — 判保留 (已统一)

- **状态**: 已接受 (2026-09-09, 审计判保留)
- **领域**: renderer 视图横切面
- **来源**: 架构探索轮三 (推荐方向: renderer DOM 辅助重复)

## 结论

**不重构。** renderer 的 HTML 辅助已统一过 (R19/P2-5):

- 唯一实现 `renderer/core/utils/html.js` (escapeHtml, null/undefined→'' 等 5 字符转义)。
- 各 tab view 的实例 `escapeHtml(str)` / `getIconHtml(...)` 是**薄委托**到共享工具 / `window.__XKAT_APP__`, 非重复逻辑。

删除测试: 这些薄适配器是 pass-through; 直连共享工具只是删薄间接层, 需跨大量 `this.xxx()` 调用点改动, 收益低、噪音大、风险不小 → 判保留。属"one adapter" (假设 seam), 不符"two adapters"才真实 seam 的原则。

## 结论
未来不建议大规模改 renderer view helper；除非出现真正的多实现漂移 (各自 body 与 html.js 不一致)。