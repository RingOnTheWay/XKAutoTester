/**
 * LifecycleCleanup - 退出清理链注册表 (R26 候选⑤, 自 ElectronApp 拆出)
 *
 * 职责: before-quit / will-quit 两阶段清理, 声明式注册。
 * 每步独立 try/catch + console.error 可观测性 (P3-3: 静默吞异常致资源泄漏不可排查),
 * 单步失败不阻断后续清理。
 *
 * 语义 (与原 ElectronApp 内联链一致, P3-3 已合并为单一 before-quit):
 * - before-quit: 持有子进程/会话的 service 同步释放 (allureWindow/scheduler/scrcpy/
 *   python/inspector/powerSaveBlocker)
 * - will-quit: allureService.cleanupSync + 持久日志流 Logger.close (P3-2 防尾日志丢失)
 */
class LifecycleCleanup {
  /** @type {Array<{name: string, run: () => void}>} */
  #beforeQuitSteps = [];
  /** @type {Array<{name: string, run: () => void}>} */
  #willQuitSteps = [];

  /**
   * 注册 before-quit 清理步 (同步释放)
   * @param {string} name - 步骤名 (错误日志定位用)
   * @param {() => void} run
   */
  onBeforeQuit(name, run) {
    this.#beforeQuitSteps.push({ name, run });
  }

  /**
   * 注册 will-quit 清理步
   * @param {string} name
   * @param {() => void} run
   */
  onWillQuit(name, run) {
    this.#willQuitSteps.push({ name, run });
  }

  /** 执行全部 before-quit 步骤 (单步失败不阻断) */
  runBeforeQuit() {
    for (const { name, run } of this.#beforeQuitSteps) {
      try {
        run();
      } catch (e) {
        console.error(`[before-quit] ${name} failed:`, e);
      }
    }
  }

  /** 执行全部 will-quit 步骤 (单步失败不阻断) */
  runWillQuit() {
    for (const { name, run } of this.#willQuitSteps) {
      try {
        run();
      } catch (e) {
        console.error(`[will-quit] ${name} failed:`, e);
      }
    }
  }

  /**
   * 便捷: 按 P3-3 语义注册标准清理链 (持有子进程/会话的 service 同步释放)
   * @param {object} deps - { getAllureWindow, clearAllureWindow, services }
   */
  registerStandardChain({ getAllureWindow, clearAllureWindow, services = {} }) {
    this.onBeforeQuit('allureWindow.destroy', () => {
      const w = getAllureWindow();
      if (w && !w.isDestroyed()) {
        w.destroy();
      }
      clearAllureWindow();
    });
    this.onBeforeQuit('schedulerService.destroy', () => {
      services.schedulerService && services.schedulerService.destroy();
    });
    this.onBeforeQuit('scrcpyService.stopScrcpy', () => {
      services.scrcpyService && services.scrcpyService.stopScrcpy();
    });
    this.onBeforeQuit('pythonTestService.stop', () => {
      services.pythonTestService && services.pythonTestService.stop();
    });
    this.onBeforeQuit('inspectorService.dispose', () => {
      services.inspectorService && services.inspectorService.dispose();
    });
    // P3-3: 退出链补 stopPreventSleep — 释放 powerSaveBlocker (restorePreventSleepSetting
    // 启动时可能已 start, 若不停止, 防睡眠锁残留到下次会话)
    this.onBeforeQuit('stopPreventSleep', () => {
      const { stopPreventSleep } = require('../handlers/powerHandlers');
      stopPreventSleep();
    });

    this.onWillQuit('allureService.cleanupSync', () => {
      if (services.allureService) {
        services.allureService.cleanupSync();
      }
    });
    // R24 P3-2: 退出前关闭持久日志流 (Logger.close), 防止尾日志丢失
    this.onWillQuit('logger.close', () => {
      services.allureService?.logger?.close?.();
      services.pythonTestService?.logger?.close?.();
    });
  }
}

module.exports = { LifecycleCleanup };
