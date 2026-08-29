const pathHelper = require('../utils/pathHelper');

/**
 * SerialPortEnumerator - 枚举系统串口
 *
 * 通过 Python serial.tools.list_ports 列出串口, 返回设备信息
 */
class SerialPortEnumerator {
  /**
   * @param {Object} i18nService - 国际化服务 (需 t 方法)
   * @param {{executeCommand: Function}} spawnHelper - spawn helper
   */
  constructor(i18nService, spawnHelper) {
    this.i18nService = i18nService;
    this.executeCommand = spawnHelper.executeCommand;
  }

  /**
   * 获取系统串口列表
   *
   * 调用 pathHelper.getPythonConfig() 动态读取当前 Python 配置,
   * 执行 serial.tools.list_ports 脚本解析 JSON 结果
   *
   * @returns {Promise<{success: boolean, data?: Array, error?: string}>}
   */
  async getSerialPorts() {
    const pythonConfig = pathHelper.getPythonConfig();
    if (!pythonConfig) {
      return {
        success: false,
        error: this.i18nService.t('splash.checks.venvNotFound'),
      };
    }

    const listScript =
      'import serial.tools.list_ports; import json; ports = serial.tools.list_ports.comports(); print(json.dumps([{"deviceId": p.device, "name": p.description, "manufacturer": p.manufacturer or "", "serial_number": p.serial_number or "", "hwid": p.hwid or "", "vid": p.vid, "pid": p.pid} for p in ports]))';

    try {
      const result = await this.executeCommand(pythonConfig.pythonPath, ['-c', listScript]);
      if (result.code !== 0) {
        return {
          success: false,
          error: result.stderr || 'Failed to list serial ports',
        };
      }
      const ports = JSON.parse(result.stdout || '[]');
      return { success: true, data: ports };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = SerialPortEnumerator;
