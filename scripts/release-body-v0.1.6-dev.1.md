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

## 🔧 优化

- **工程化：ESLint 全量清零**：20 个 lint 问题（含 2 个真实缺陷）全部修复，`npm run lint` 0 违规。
- **工程化：代码格式化统一**：前端 133 个 JS 文件 Prettier 格式化、Python 51 个文件 ruff format，全库风格一致（ESLint + Prettier + ruff 配置已入库）。
- **工程化：构建链升级**：vite 5.4 → 7.3、electron-vite 2.3 → 5.0，`electron-vite build` 三阶段构建验证通过。
- **工程化：CI 工作流就绪**：GitHub Actions 集成 lint/format 检查与测试，后续提交自动校验。
- **测试基建**：新增 E127B 温度计协议、字段映射路由、环境启动服务等单元测试；scrcpy 等测试改用 fake timers 提速；全量 Electron 1092 pass + Python 218 pass。
- 设备管理窗口首次扫描超时由 5s 放宽至 10s，减少 daemon 冷启动被中断的概率（配合 kill-server 自愈机制）。
