# ADR-0003: 版本 tag 归一化收敛到单一权威 (normalizeVersionTag)

- **状态**: 已接受 (2026-09-08)
- **领域**: 语义化版本 / 自动更新
- **来源**: improve-codebase-architecture 候选 #3 (git 历史: 版本显示/比较多次因 v 前缀与 prerelease 段回归)

## 背景

版本 tag 的 `v` 前缀剥离规则散置且口径不一致:

| 位置 | 规则 | 问题 |
|------|------|------|
| `UpdateService.checkForUpdate` | `.replace(/^v/, '')` | 大小写敏感 (仅剥小写 v) |
| `versionCompare.compareVersions` 内部 | `.replace(/^v/i, '')` | 大小写不敏感 |

同一规则两处实现形式漂移; 版本解析/比较/展示语义隐含在业务流程, 无单一入口。曾多次因 v 前缀剥除与 prerelease 段解析在「更新误判」(hasUpdate 恒 false) 上回归。

## 决策

把「版本 tag 归一化」收敛为 **`normalizeVersionTag(tag)`**, 放 `utils/versionCompare.js`:

- `normalizeVersionTag(tag) = String(tag).replace(/^v/i, '')` (大小写不敏感剥 v)
- `compareVersions` 内部复用该助手 (norm + prerelease 段提取均走它)
- `UpdateService.checkForUpdate` 弃用内联 `/^v/`, 改调 `normalizeVersionTag`
- 导出 `{ compareVersions, normalizeVersionTag }`

语义保持一致 (发布 tag 均为小写 v, 无行为变化), 仅收敛规则统一大小写口径。

## 后果

- **正面**: 单一权威消除 /^v/ vs /^v/i 漂移; 解析与比较口径一致可测; 新增测试覆盖大写 V / 无前缀 / 口径一致性。
- **负面 / 注意**: 显式 `latestVersion` (比较用, 剥 v) 与 `latestVersionDisplay` (展示用, 保 v) 的二义性仍靠调用方自觉区分 —— 若后续再乱, 可进一步收敛为「一个 tag → {compare, display}」双字段助手。
- **改动文件**: `utils/versionCompare.js`、`services/UpdateService.js`、`tests/electron/test_version_compare.js`。
- **测试**: `node --test tests/electron/test_version_compare.js` 本地 10/10 通过。

## 词汇

`normalizeVersionTag` — 版本 tag 剥 (大小写) v 前缀的归一化入口。