<!--
  Release body - v0.1.6-dev.1
  复制自 release-body-template.md, 填写 0.1.6-dev.1 的实际值。
  用法: 运行 publish-release.ps1 -Version 0.1.6-dev.1, 随后 patch-body.ps1 -Version 0.1.6-dev.1
-->

# XKAutoTester v0.1.6-dev.1

**发布日期**: 2026-08-28

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
