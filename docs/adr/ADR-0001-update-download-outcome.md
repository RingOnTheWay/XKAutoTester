# ADR-0001: 更新下载结果收敛为单一 `state` 词汇 (DownloadOutcome)

- **状态**: 已接受 (2026-09-08)
- **领域**: 自动更新 / 下载生命周期
- **来源**: improve-codebase-architecture 候选 #1 (git 热点驱动: UpdateService 24 + settings/model 11 次变更, 双 toast 反复回归)

## 背景

「取消下载」在 main · preload · renderer 间以多套不兼容信号各自表述:

| 层 | 旧信号 | 问题 |
|----|--------|------|
| main (download 结果) | `{success:false, cancelled:true}` | 鸭型布尔 |
| main (cancelDownload 结果) | `{success:true, action:'cancelled'\|'no_active'}` | 另一套字段 |
| renderer (catch) | `#cancelWindowUntil` 时间窗 + `/abort\|cancel/i` 正则嗅探 | 拿墙钟/字符串猜因果 |

取消的因果依赖「1s 时间窗 + 正则匹配」而非明文信号 —— 这是 24+11 次修改后仍反复产出「双 toast」(取消成功 + 红色失败) 的根因。缺点在**局部性**: 同一领域概念散布多层, 无单一权威。

## 决策

将「更新下载结果」收敛为**单一 `state` 枚举 (DownloadOutcome), 由 main 产出权威结局**:

- shared/constants.js 定义 `UPDATE_DOWNLOAD_STATE = { COMPLETED, CANCELLED, NO_ACTIVE }` (冻结枚举)
- main `downloadUpdate` / `cancelDownload` 返回 `{ success, state, message?, filePath? }`
- main 保证: **abort → 必然 resolve `state:'cancelled'`**, 不 reject (writer-error 等 abort 副产物归 cancelled)
- renderer 只订阅 main 的 `state`:
  - 成功路径: `state==='cancelled'` → 复位, `state` + `filePath` → 完成
  - catch 只处理**真实失败**, 弹红 toast
  - **删除** `#cancelWindowUntil` 时间窗 + `/abort|cancel/i` 正则嗅探

### 范围

- 仅限 **update 更新下载流程**。data-transfer 的 upload/download/install 无取消通道, 不普世化 (YAGNI)。后续若新增取消, 复用 `UPDATE_DOWNLOAD_STATE` 即可。
- 保留 `success` 布尔作子系统边界校验, 新增 `state` 作语义权威; `action` 字段与 `cancelled` 布尔删除。

## 后果

- **正面**: 取消语义单一、可断言可测; 渲染层删魔法数值与正则; 接口更窄 (一个类型穷尽所有结局); 双 toast 根治。
- **负面 / 注意**: main 的「writer-error 且已 abort → 归 cancelled」分支必须守住, 否则取消会被误判为失败 —— 这是该 seam 的唯一航标, 测试要锁住。
- **改动文件**: `shared/constants.js`、`UpdateService.js`、`settings/model.js`、`settings/controller.js`、`tests/electron/test_update_service.js`。

## 实现补充 (2026-09-08 晚, 双 toast 回归修复)

初版只删渲染层时间窗/正则、纯信 main, 但两次暴露: ① main abort 竞态 (初始 fetch AbortError 直接抛 / 流错误在 abort 生效前 reject); ② **取消与下载是两个独立 IPC**, 下载错误可能先于取消落地到渲染层 → 仅靠 main 无法保证唯一权威。

**最终设计** (两层):

1. **main**: 下载策略加 `_cancelled` 旗, `cancelDownload()` 先置旗再 abort; `download()` 的初始 fetch catch / 流 catch / writer error 三处, 只要 `_cancelled || signal.aborted` 一律归 `state:'cancelled'` 返回不 reject (防 abort 竞态, 防御纵深)。
2. **renderer (协调关键)**: `settings/model.js` 加 `#cancelling` 同步取消旗——`cancelDownload()` 在 await IPC **之前**置位; `downloadUpdate()` 开头复位; catch 中 `!#cancelling` 时才 emit error。保证取消后落地的任何下载错误被静默。

**非时间窗、非正则**: 取消旗是同步、作用域于本次下载的真布尔信号 (非旧 `#cancelWindowUntil` 墙钟猜, 亦非 `/abort|cancel/i` 嗅探)。新增 2 条 main 回归测试锁死 abort 竞态; 渲染层协调无独立单测 harness, 靠真机/`npm run dev` 手测。

## 词汇

`DownloadOutcome` — 更新下载的终端结局词汇 (`completed` / `cancelled` / `no_active`), 薄 wrapper 于 `state` 字段, 见 CONTEXT.md。