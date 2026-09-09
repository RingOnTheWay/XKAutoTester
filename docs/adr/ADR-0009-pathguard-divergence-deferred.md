# ADR-0009: isPathInside 守卫重复 — 审计判暂缓合并

- **状态**: 已接受 (2026-09-09, 审计判暂缓)
- **领域**: 路径安全守卫 / 跨服务重复
- **来源**: 架构探索 (跨服务安全常重复扫描)

## 发现

`isPathInside`(baseDir, targetPath) — 防目录穿越的安全守卫 — 在 **3 处各自实现且语义分歧**:

| 实现 | 语义 |
|------|------|
| TestPlanService | 原始 relative; 拒等于/拒 `..` 前缀/拒绝对 |
| TestCaseService `_isPathInside` | resolve 后比较; 同 TestPlan 语义 |
| UpdateService | 原始 relative; **允许等于** (rel===''→true); 仅拒字面 `..`/`../` (允许 `..foo`) |

分歧点: 相等是否算内 / `..foo` 是否拒绝 / 是否 resolve。

## 尝试与回退

抽 `utils/pathGuard.js` 单一规范实现 (resolve 双 input + 拒等于 + 拒 `..`/`../`) 统一 3 处。**security-reject 测试崩了** (deleteTestCase/deleteUpdateFile/installUpdate 目录外拒绝): Windows 下 resolve/normalization 差异 + traversal 判定不同, 统一版本把"应拒绝的越界路径"接受了。

→ **回退**: 恢复 3 处原始实现, 删 util。原因: 安全守卫语义分歧不能盲目合并; 强行调成测试通过 = 改守卫行为, 风险大于收益。

## 结论
- 这是**真实的重复 + 行为分歧**, 值得未来谨慎处理, 但需**逐调用方判定期望语义**后统一, 属高风险、需专门设计的任务, 非顺手可做。
- 暂缓。不重提"直接抽 util 合并", 除非先明确各调用方容错语义 (尤其 UpdateService 允许相等是否有意为之)。