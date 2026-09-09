# ADR-0007: handler i18n fallback `t` 闭包收敛到共享 helper

- **状态**: 已接受 (2026-09-09)
- **领域**: 主进程 handlers 横切面 / DRY
- **来源**: 架构探索轮三 (跨 handler 重复逻辑扫描)

## 背景

7 个 handler 文件复制了同一份 i18n fallback 闭包:

```js
const t = (key, fallback) =>
  i18nService && typeof i18nService.t === 'function' ? i18nService.t(key, { defaultValue: fallback }) : fallback;
```

(apk/update/report/file/config/adb/scheduledPlan; scheduledPlan 例外命名 `tr`。) 规则漂移、难统一改。

## 决策

将闭包收敛为 **`makeI18nFallback(i18nService)`** 放 `handlers/base/handlerUtils.js`, 各 handler 改 `const t = makeI18nFallback(i18nService);` (scheduledPlan 保留 `tr` 名)。

## 后果

- **正面**: 单一实现, 消除 7 处复制; 改动仅机械替换, 全量测试兜底。
- **负面 / 注意**: scheduledPlanHandlers 原变量名是 `tr` (非 `t`), 替换时保留其命名 (避免误改引用)。
- **测试**: 全量 1240/1240 过, ESLint `--max-warnings 0` clean。

- **改动文件**: `handlers/base/handlerUtils.js` + 7 个 handler (`apk/update/report/file/config/adb/scheduledPlan`)。