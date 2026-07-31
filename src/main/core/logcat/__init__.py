"""logcat 子包 — 实时监控的纯域组件。

模块:
- logcat_parser: 纯函数,解析 + 过滤 logcat 行
- crash_detector: 纯函数,崩溃模式检测 + 分类
- log_ring_buffer: 纯数据结构,ring buffer + 崩溃上下文提取
- logcat_process: subprocess 边界,封装 Popen 生命周期

设计:
- 纯域 (parser/detector/buffer) 无 IO/线程/i18n,完全可测
- logcat_process 是 subprocess 边界,注入 AdbCommandPort 测试
- LogcatMonitor (facade) 在父包 logcat_monitor.py 编排
"""
