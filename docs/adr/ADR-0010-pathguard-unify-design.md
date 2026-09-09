# ADR-0010: pathGuard 守卫统一合并 — 专项设计

- **状态**: 已接受并实现 (2026-09-09, 语义决策获确认, 已落地)
- **领域**: 路径安全守卫 / 跨服务重复
- **来源**: ADR-0009 暂缓 → 专项设计重启
- **前置决策** (AskUserQuestion 已确认):
  1. UpdateService 宽容语义 → **收紧为严格**
  2. 统一守卫 → **双端 `path.resolve` 规范化**
- **追加收口 (2026-09-09)**: 系统关键目录防护并入 pathGuard — `isSystemProtectedPath` (盘根/POSIX 根/一级受保护目录)。原 fileHandlers `sysRootRe` 与 TestCaseCodeGenerator `SYSTEM_PROTECTED_DIRS` 两处 ad-hoc 实现收归单源。`fileHandlers.CREATE_DIRECTORY` 语义微调: 额外拦截 `Program Files` 等 (安全侧收紧, 与 TestCaseCodeGenerator 对齐)。

## 决策

将 `isPathInside` 从 3 处各自实现收敛为**单一严格语义**，落点在 `electron/src/main/utils/pathGuard.js`。

## 规范语义

```js
const path = require('path');

function isPathInside(baseDir, targetPath) {
  if (typeof baseDir !== 'string' || !baseDir) return false;
  if (typeof targetPath !== 'string' || !targetPath) return false;
  const rel = path.relative(path.resolve(baseDir), path.resolve(targetPath));
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

module.exports = { isPathInside };
```

判定表：

| 场景 | 结果 |
|------|------|
| 相等路径（target === baseDir） | 拒 |
| 严格子路径 | 允 |
| `..` 段穿越 | 拒 |
| 字面 `..foo` 文件名 | 拒 |
| 绝对路径逃逸（rel 为绝对） | 拒 |
| baseDir / targetPath 非字符串或空 | 拒（防御） |

> 语义要点：
> - **收紧 UpdateService**：删相等放行、删 `..foo` 放行，回归"防任意文件删/spawn 越界"的本意。UpdateService 的 `isPathInside` 无外部 import（factories.js 仅取类），收紧安全面。
> - **双 resolve**：对齐原 TestCaseService 行为，防 `baseDir='C:/a/..'` 等非规范化输入骗过 relative。`..foo`/相等/穿越在 resolve 后仍被拒。

## 调用点变更

| 文件 | 旧 | 新 |
|------|-----|-----|
| TestPlanService L45-48 | 本地 def + L539 export | 删本地 def；L407 改 import 直调 |
| TestCaseService L122-125 | `_isPathInside` 方法 | 删方法；L383 改 util 直调 |
| UpdateService L46-49 | 本地 def + L837 export | 删本地 def + export；L762/L815 改 util 直调 |
| AllureService L16 | `import { isPathInside } from './TestPlanService'` | 改 `from '../utils/pathGuard'`（去 TestPlan 依赖，防循环依赖注意点保留） |

> L815/L762 处的 `typeof filePath !== 'string' || !filePath` 前缀保留（与 util 内守卫双保险，不必删）。

## TestPlanService 导出清理

`TestPlanService` 的 `isPathInside` 导出被以下消费：
- `AllureService` → 改 import util（见上）
- `tests/electron/test_test_plan_service.js` L237-252 纯函数单测 → **迁移到 `pathGuard.test.js`**，并从 test_test_plan_service 删除，`TestPlanService` 移除 export。原断言能过双 resolve（相对比较语义不变）。

## 测试改造

1. **新建 `tests/electron/test_path_guard.js`**：纯函数判定表全覆盖（相等/子路径/前缀目录/`..`/绝对/`..foo`/非串/空）。
2. **UpdateService 测试**：`/fake/config/updates` 等伪造 Unix 绝对路径 → 改 `path.join(os.tmpdir(), ...)` 真实平台路径，避免 resolve 在 Windows 碰撞。security-reject 用例保留，**新增相等路径与 `..foo` 拒绝断言**（对齐收紧语义）。
3. deleteTestCase/deleteUpdateFile/installUpdate 越界拒绝用例做回归基准 — 这就是上次合并崩掉的场景，本次以真实路径消除故障源。

## 迁移步骤（每步可独立跑测回滚）

1. 新建 `utils/pathGuard.js` + `test_path_guard.js`，跑测。
2. 切 TestCaseService → 跑对应测试。
3. 切 TestPlanService（删 def + export，迁纯函数单测）→ 跑测。
4. 切 AllureService import → 跑测。
5. 切 UpdateService（删 def + export，改测试为真实路径 + 新增收紧断言）→ 跑测。
6. 全量 `npm test` 回归。

## 备份

改动涉及替换/删除（services 中删 def/export、测试迁移），按项目规则先将各原文件备份到根目录 `trae-backup/`。

## 风险与回滚

- 风险集中在 Step 5（UpdateService 路径语义 + 测试重写）；该步隔离，单步失败单独回滚即可，不影响其他 4 处。
- 收紧语义只会**多拒一些原本放行的极端路径**（相等/`..foo`），均为攻击面收窄，业务无合法使用场景。