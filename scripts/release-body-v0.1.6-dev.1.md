<!--
  Release body - v0.1.6-dev.1
  复制自 release-body-template.md, 填写 0.1.6-dev.1 的实际值。
  用法: 运行 publish-release.ps1 -Version 0.1.6-dev.1, 随后 patch-body.ps1 -Version 0.1.6-dev.1
-->

# XKAutoTester v0.1.6-dev.1

**发布日期**: 2026-09-03

## 📦 下载

| 安装包                                        | 大小      | 说明                                                             |
| ------------------------------------------ | ------- | -------------------------------------------------------------- |
| `XKAutoTester.Setup.v0.1.6-dev.1.exe`      | 378.6 MB | **完整版**：内置 Python 3.12 + Android SDK + scrcpy + CP210x 驱动，开箱即用 |
| `XKAutoTester.Lite.Setup.v0.1.6-dev.1.exe` | 126.8 MB | **精简版**：不含内置环境，适合已自备 Python/JDK/ADB 的用户                        |

## 🔐 完整性校验（在线更新依赖，安装前请核对）

**XKAutoTester.Setup.v0.1.6-dev.1.exe**
SHA256: （待版本定稿后填写）

**XKAutoTester.Lite.Setup.v0.1.6-dev.1.exe**
SHA256: （待版本定稿后填写）

## ✨ 新增

- **文件选择器记住上次选择路径**：选择测试目录 / 选择文件 / 文件上传 / 选择 APK / 配置导入 / 配置导出共 6 个选择器，默认定位到上次选择的路径（目录→自身，文件→父目录，路径已删除自动回退），持久化到 config.json，跨会话生效。
- **全量代码审查修复收尾**：对主进程 / 渲染层 / Python 核心进行全量代码审查，完成 P1×8 + P2×11 + P3×16 全部整改，并补齐工程化基建（详见下方修复与优化）。
- **R24 第二轮全量审查 + 五轮整改闭环**：在 0.1.6-dev.1 修复基线上再次全仓审查（P1×6 / P2×11 / P3×10），并分五轮全部落地：multi 元素步骤字段收敛、ADB 系统路径防护、生成器路径清洗、pytest 看门狗修复、confirm 弹窗全仓唯一收敛、i18n key 补齐与完整性测试、CI 强制化、view.js 步骤渲染域拆分等（详见下方修复与优化）。

## 🐛 修复

- **编辑测试计划弹窗选择框选中色修复**：测试文件 / 测试类型选择框勾选时固定显示浏览器默认蓝色，现改为跟随程序主题色（checkbox `accent-color` + 选中项 `.selected` 背景）。
- **设备管理窗口 adb daemon 未运行修复**：打开设备窗口时若 adb server 未运行，自动执行 `adb start-server` 并轮询重试，首次进入即可搜到设备，无需手动 `adb start-server`。
- **adb server 半死 (protocol fault) 自愈**：因超时中断产生的半死 server 持续占用 5037 导致所有 adb 命令报 `protocol fault / connection reset`（连外部控制台都受影响、只能重启程序恢复）。现检测到协议类错误时自动 `kill-server` 清理坏 server 并重建。
- **封装 tab「从设备识别」取消后不启动修复**：选择启动模式弹窗点取消后直接无响应（Promise 永不 resolve），现取消/遮罩/Esc 均以「不清除数据」状态继续启动 Inspector。
- **关闭 Inspector 再进入报端口占用修复**：关闭窗口时 stop-session 仅 3s 超时导致 Python 被强杀、Appium 子进程孤儿残留占用 4725 端口。现 stop-session 串行化 + 超时放宽至 30s，且端口占用时自动清理残留进程。
- **元素检查器预览画面挤压上移修复**：选中元素后底部定位方式面板展开，预览画面由「缩小居中」恢复为「被挤压贴顶」，与预期视觉一致。
- **封装新增元素实时可用修复**：页面封装中新增的元素，此前需重启程序才能在测试用例编辑器的步骤下拉中使用；现应用列表刷新时同步选中应用引用并重渲染步骤卡片，新元素立即可选。
- **Inspector 添加元素 Toast 位置修复**：添加元素成功的提示此前被 Inspector 遮罩盖住显示在主窗口；现 Toast 挂在 Inspector 弹窗容器内。
- **新建测试计划弹窗测试类型区不刷新修复**：选中测试文件后测试类型区一直提示「请先选择测试文件」。根因是 change 回调引用不存在的 `file` 变量（重构漏改）导致 `ReferenceError`，现已修复并补充防御性处理。
- **蓝牙设备级联选择默认高亮修复**：打开「蓝牙操作-选择设备」时厂商级首项默认带主题色高亮背景（键盘导航的 `.active` 类），未点击即误显选中态；现打开时不再默认高亮，仅点击或键盘操作后出现。
- **测试用例步骤「点击次数」配置失效**：导航步骤的点击次数此前误写入 `operationType` 字段，导致次数永不生效且操作类型被数字覆盖渲染空白；现独立为 `clickCount` 字段，写入/读取/渲染全链路打通。
- **Inspector 元素高亮失效**：混入类中 `_updateHighlighterHover` 重复定义（空实现覆盖功能实现），导致检查器悬停高亮失效；已删除空实现恢复功能。
- **设备管理窗口偶发报错**：混入类中变量声明位置错误（跨函数引用），关闭设备窗口路径可能触发 `ReferenceError`；已收敛为使用处声明。
- **测试用例保存校验顺序不一致**：保存时文件名 `test_` 前缀校验先于目录/应用选择校验，与界面提示不符；测试断言已同步实现语义。
- **文件管理器删除/重命名安全通道**：此前删除/重命名经通用命令通道 shell 拼接执行，存在注入面；现拆分为专用 IPC 通道（`deleteRemoteFile`/`renameRemoteFile`），路径清洗 + 参数数组化，`rm`/`mv` 全面列入黑名单兜底。
- **scrcpy 启动参数注入面收敛**：Windows 分支不再经 `cmd.exe /c` 拼接渲染进程参数，改为参数数组直传，消除注入风险。
- **测试用例文件读取/删除路径清洗**：`getTestCase`/`deleteTestCase` 增加路径白名单校验，防止越权读写任意 JSON 文件。
- **进度显示单位不一致**：文件传输进度小文件（如 1000 B）不再显示为 `0.00 MB`，统一按 B/KB/MB 智能格式化。
- **多选元素步骤输入配置保存后失效**：input 类型 / Faker 等配置在写、渲染、收集三处字段路径不一致（写 `selectedElements[i].fakerLocale`、渲染读 `operationValue.fakerConfig`、收集写 `elem.fakerConfig`），保存后配置不回显、生成脚本读不到。现已统一收敛到 `operationValue` 下单一 schema，读写渲染全链路一致。
- **设备文件删除/重命名可删系统路径**：专用通道路径校验只挡 shell 元字符，`rm -rf /sdcard` 等系统路径可执行；现补路径规范化 + 系统分区（data/system 整分区、sdcard/storage 裸根）拒绝，rename 拒绝 `..`/`.`。
- **Python 生成文件越权写入**：`TEST_CASE_GENERATE_PYTHON` 通道的 outputDir/fileName 未清洗可写任意 .py（含 Python 环境包）；现生成入口统一清洗（basename 剥离路径 + 非法字符替换）+ 输出目录绝对路径校验 + handler 入参类型预检。
- **pytest 死锁用例看门狗失效**：超时检查位于 stdout 阻塞读循环之后，死锁用例（存活且无输出）让 `wait(timeout)` 永不执行、整链路永久挂起；现超时检查移入读循环，超时即强制终止并返回 `exit_code=-1`，并补卡死进程回归测试。
- **确认弹窗四套实现收敛 + 并发挂起**：test-case / test-execution / settings / page-package 各持回调版 `showConfirmModal` 写同一全局回调，与 Promise 版混用时并发弹窗回调被覆盖、前者 Promise 永不 resolve；现全仓收敛为唯一 `core/utils/confirmModal.js` Promise 实现，并加单弹窗串行化 + Esc 关闭补全。
- **下载超时后仍报成功（矛盾事件）**：下载路径 close 回调缺 settled 短路，超时 resolve 后 close 仍继续打包 zip 并 emit 成功；现下载/上传统一短路，超时后不再 emit。
- **长用例看门狗脱离监控**：执行超时触发且渲染进程存活时仅告警不重启，此后该计划永无监控；现告警后重新武装看门狗，周期检查。
- **生成脚本含布尔/null 运行即崩**：`operationValue` 经 `JSON.stringify` 直嵌 Python，布尔/null 生成 `true/false/null` 致 `NameError`；现递归转 Python 字面量（`True/False/None`）+ 字符串/key 转义。
- **中文 Windows 端口清理失效**：netstat 状态列硬编码 `LISTENING`，中文系统（"正在侦听"）下 Appium 残留进程端口占用无法清理；现中英文状态双匹配。
- **i18n 缺失 10 个 key**：`inspector.noElements` 等无 fallback 直接显示 key 原文，`environment.preparing` 整段缺失；现已补齐并新增 key 完整性测试（zh/en 集合一致 + 渲染层静态引用全覆盖）。

## 🔧 优化

- **工程化：ESLint 全量清零**：20 个 lint 问题（含 2 个真实缺陷）全部修复，`npm run lint` 0 违规。
- **工程化：代码格式化统一**：前端 133 个 JS 文件 Prettier 格式化、Python 51 个文件 ruff format，全库风格一致（ESLint + Prettier + ruff 配置已入库）。
- **工程化：构建链升级**：vite 5.4 → 7.3、electron-vite 2.3 → 5.0，`electron-vite build` 三阶段构建验证通过。
- **工程化：CI 工作流就绪**：GitHub Actions 集成 lint/format 检查与测试，后续提交自动校验。
- **测试基建**：新增 E127B 温度计协议、字段映射路由、环境启动服务等单元测试；scrcpy 等测试改用 fake timers 提速；全量 Electron 1092 pass + Python 218 pass。
- 设备管理窗口首次扫描超时由 5s 放宽至 10s，减少 daemon 冷启动被中断的概率（配合 kill-server 自愈机制）。
- **工程化：CI 强制化**：修复 lint script 路径错误（原 `electron/tests` 不存在导致 lint 一直失败被 continue-on-error 掩盖），`--max-warnings 0` 收严；CI 改 `npm ci`、加 `timeout-minutes: 30`、uv 缓存、失败上传 allure-results，lint/ruff 移除降级标记违规即失败。
- **工程化：依赖锁 registry 统一**：package-lock 混合 npmjs/npmmirror 两 registry（81 条），统一为 npmjs，CI 可复现。
- **可维护性：test-case view 拆分**：`view.js` 2741 → 1958 行，步骤渲染域 12 方法拆至 `modules/stepsRenderer.js`（Object.assign 挂 prototype，行为零变化）。
- **可维护性：flaky 测试改造**：4 个测试文件的固定 `setTimeout` 等待改条件等待（正向断言轮询等待，负向保留短等待+注释），消除 CI 慢机器超时风险。
- **测试基建扩容**：新增 8 个测试文件共 34 用例（captcha_recognizer / paths / logger / scheduler_effects / confirm_modal / appium_port / i18n_keys / pytest_process 超时），覆盖此前零测试模块；全量 Electron **1125 pass**、Python 相关 51 pass。
- **文档同步**：AGENTS.md 版本/技术栈/新模块记录更新至当前（0.1.6-dev.1 / Vite 7.3.6 / electron-vite 5.0.0）。

---

## 🐛 修复（R25–R28 收尾 + 真机回归批次）

> 本段为 2026-08-29 起的 R25–R28 多轮 hardening（P1×4 + P2×13 + P3×17 + CI 漏洞扫描 + axios 链替代 = 36 项闭环）与 9 月真机回归修复的发布说明汇总。逐轮细节见 `dev-records/`。

### 进程与超时
- **pytest 卡死用例看门狗（多次假绿后根治）**：stdout 读取移入独立线程、管道改真实阻塞语义（原 `readline()` 主线程阻塞使超时检查永不可达、Fake 假绿），卡死用例超时强制终止且保留超时前输出。
- **spawn/编译错误态锁死根治**：`pythonProcess.on('error')` / 编译异常原只置 `_state='error'` 不清理，测试功能永久不可用（只能重启）；现统一清理复位回 idle，4 处同类锁死一并收敛。
- **环境探测统一 15s 超时**：损坏/挂起的 python.exe 会使 splash 环境检查永久阻塞；所有 `_cmd` 探测默认注入超时，超时返回不卡界面。
- **钉钉请求 10s 超时**：NotificationService 原 axios 无超时，API 不响应时回调链永久 pending；现超时异常归一为失败结果。

### 更新与版本
- **dev 版收不到同号正式 release 修复**：semver 比较把 `dev.1` 拆成数字段误判 dev 版更新；现剥离 prerelease 段比较 + `release > prerelease` 权重，dev 用户可正常升级同号正式版。

### 安全加固
- **.py 生成目录越权写入根治**：生成入口补系统保护目录黑名单（Windows system32/syswow64 等 / POSIX etc/boot/usr/bin 等），同时不破坏用户自选测试目录功能。
- **Allure 报告越界拦截**：`OPEN_REPORT_BY_PATH` 的 reportPath 现校验必须位于 allure-reports 根内，杜绝任意目录托管。
- **驱动安装入口白名单**：installerPath 必须位于受控目录，防渲染层启动任意 exe。
- **渲染层注入/XSS 面收敛**：文件列表字段 `escapeHtml`、属性选择器 `CSS.escape()`、设备路径 shell 元字符清洗等 P3 安全项全量落地。
- **runTests 防重入守卫**：双击/校验 await 窗口可并发启动多个 pytest 进程，现守卫置位堵死窗口。

### 打包与依赖
- **打包后 undici 缺失崩溃修复**：main/preload 运行时依赖须显式入 dependencies（electron-builder 只打 production deps）；`Cannot find module undici` 不再发生。
- **axios 依赖链整体移除（CVE）**：全仓 httpClientFactory 注入改 Node 原生 fetch + undici dispatcher，allowInsecureSSL 场景同步适配。
- **allure npm 依赖恢复**：R25 移除 axios 时连带误删 `allure`（历史一直在 dependencies），导致报告生成无 CLI 回退 npx；已恢复 `allure@3.16.0`。
- **logger 方法名对齐**：主进程 Logger 方法为 `warn`，AllureService/AllureCliInvoker 误调 `logger.warning` → 任何无 CLI 回退路径即 TypeError（报告目录建好但空）；全仓 `warning→warn` 收敛。
- **依赖治理扫描**：CI 增 `npm audit` + `uv audit`，漏洞即失败；build 与 build-lite 配置分离可复现。

### 真机回归修复（2026-09-02 批次）
- **安卓文件重命名/删除 "is not a function"**：android-connection model 的 ApiBridge bind specs 漏配 `deleteRemoteFile`/`renameRemoteFile`（preload/主进程/常量均有），补映射打通。
- **删除测试用例失败**：文件扫描条目 `name` 带 `.py` 后缀且无 pyFilePath，服务端名称白名单拒绝含点 → 渲染层传基名 + py 全路径，服务端兼容剥离 `.py`。
- **删除 JSON 缺失用例失败**：JSON 缺失用例的 .py 位于用户浏览目录（配置根外），服务端 `_isPathInside(userConfigPath)` 硬约束拒绝 → 放宽为「对象显式传 pyFilePath + 基名与用例名精确匹配」即放行（文件身份钉死，任意路径删除面不打开）。
- **JSON 缺失用例应用/平台卡片未禁用**：禁用 selector 只覆盖 input/select/textarea/button，漏 div 自绘 custom-select；补 `.custom-select-wrapper` + 禁用态样式。
- **Inspector 空闲后刷新慢几十秒**：Appium 默认 `newCommandTimeout=60s`，空闲超 1 分钟会话被回收，再刷新走 appium 重启 + 驱动重连；现设 1800s 会话保活，刷新始终秒回。
- **Allure 报告空目录/历史"已删除"**：报告生成链 `logger.warning is not a function` 崩溃 + allure npm 依赖缺失 → 已修（见上"打包与依赖"），`allure generate` 正常走本地 CLI。
- **清除 Allure 数据未清 allure-results**：清除按钮原只清 `allure-reports`；现 `allure-results`（原始结果）一并清空。allure-results 是报告生成的输入源，生成成功后程序本就自动整目录清理（Python 端每轮运行前自动重建），失败时保留便于重试。

### 真机回归修复（2026-09-03 批次）
- **Lite 包依赖检查"无法检查"**：Lite 版依赖系统 Python，依赖探测脚本失败即笼统报错；现回退 `pip list --format=freeze` 通道列出真实缺失，双失败才报错且留痕 pythonPath/stderr。
- **重命名含括号/空格文件报 invalid_remote_path**：路径清洗黑名单误伤 Android 合法文件名；rm/mv 参数改 AdbPathQuoter 单引号整体包裹（设备 shell 内安全），黑名单收窄为真正危险集。
- **元素识别预览遮挡（二次进入失效）**：ResizeObserver 仅构造时注册、close 销毁后 open 不复建 → 第二次进入选中元素后面板增高不再触发 canvas 重算；现每次 open 幂等重建观察。
- **定时计划选中后"开始执行"无反应**：执行按钮只认测试计划；新增定时计划手动立即执行（逐个跑绑定测试计划，不改计划状态/下次调度）。
- **定时计划序列停止失效**：逐计划循环无判停，手动停止只停当前计划；runTests 返回 `stopped/completed` 状态，序列据此终止。
- **datetime 时间选择器选中日期背景消失**：`.today` 定义晚于 `.selected` 覆盖选中实色背景；补 `.selected.today` 复合规则。
- **手动停止测试误报"循环失败"+ 发聚合通知**：渲染层识别主进程 `stopped` 结果 → 提示"已手动停止测试"、跳过聚合信息/统计输出、不发钉钉通知、移除聚合块不等长尾线。
- **设置页构建日期联动**：构建日期原 tab.html 硬编码永不更新；现绑定 version.json `buildDate`，脚本更新版本号自动同步当日。

## 🔧 优化与测试基建（R25–R28 + 9 月批次）

- **ESLint 9 flat config 迁移项目根**：base path 覆盖 tests，`npm run lint` 全仓 `--max-warnings 0`；tests 目录豁免 `no-unused-vars`（既有测试惯用法 48 处）。
- **测试基建大幅扩容**：新增 android-connection model / test-case controller / device handlers / adb handlers / main index / electron app / execution model / version compare / sync_version / logger / paths / subprocess handle 等测试文件；修复的 bug 全部补回归用例。
- **回归基线**：Electron 全量 **1222 pass / 0 fail**、Python 相关测试通过、ESLint 0 / Ruff 全过。
- **apiBridge bind specs 全覆盖校验**：扫描 5 个 model 的 bind 映射与全部调用点交叉核对，无同类漏配。
- **shell 拼接点引号核查**：经设备 shell 的用户可控路径参数全部单引号包裹，无注入遗漏点。

