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

## Quick 参考

- 测试执行 / 定时计划 / 页面封装 / Inspector 等其它词条按需补充。