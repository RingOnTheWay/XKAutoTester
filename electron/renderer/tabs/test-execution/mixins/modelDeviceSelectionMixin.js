// modelDeviceSelectionMixin for TestExecutionModel
// Extracted from model.js during refactor
// Provides: Android/蓝牙设备配置检查 + 设备选择弹窗 + 设备标识编辑 + 测试用例查询

import { AppState } from '../../../core/AppState.js';

export const modelDeviceSelectionMixin = {
  // ─── 设备选择（从 Phase 3.3 迁移） ─────────────────────────────

  /**
   * 检查测试计划是否包含Android平台的测试用例
   * @param {Object} testPlan - 测试计划对象
   * @returns {Promise<{required: boolean, cases: Array}>}
   */
  async checkAndroidDeviceRequired(testPlan) {
    if (!testPlan || !testPlan.testFiles || testPlan.testFiles.length === 0) {
      return { required: false, cases: [] };
    }

    const androidCases = [];

    for (const testFile of testPlan.testFiles) {
      try {
        let fileName = testFile.name || testFile.path;
        if (fileName.endsWith('.py')) fileName = fileName.slice(0, -3);
        if (fileName.includes('/') || fileName.includes('\\')) fileName = fileName.split(/[\\/]/).pop();

        // wrapper 已处理 IPC 失败,此处直接判断 data 字段
        const result = await this._api.testCaseGet(fileName);

        if (result && result.data) {
          const caseData = result.data;
          const platform = caseData.platform || 'android';
          if (platform.toLowerCase() === 'android') {
            androidCases.push({
              fileName,
              filePath: testFile.path,
              caseData
            });
          }
        }
      } catch (error) {
        console.warn(`检查测试文件平台失败: ${testFile.name}`, error);
      }
    }

    return {
      required: androidCases.length > 0,
      cases: androidCases
    };
  },

  /**
   * 检查Android用例的DEVICE_NAME是否为占位符或未设置
   * @param {Array} androidCases - Android测试用例数组
   * @returns {{hasPlaceholder: boolean, existingDevice: string|null}}
   */
  checkDeviceNamePlaceholder(androidCases) {
    if (!androidCases || androidCases.length === 0) {
      return { hasPlaceholder: true, existingDevice: null };
    }

    let hasPlaceholder = false;
    let existingDevice = null;

    for (const caseItem of androidCases) {
      const deviceName = caseItem.caseData?.deviceName;
      if (!deviceName || deviceName === '' || deviceName === '{{DEVICE_NAME}}') {
        hasPlaceholder = true;
      } else if (deviceName && !existingDevice) {
        existingDevice = deviceName;
      }
    }

    return { hasPlaceholder, existingDevice };
  },

  /**
   * 显示设备选择弹窗并处理设备选择
   * @param {Array} androidCases - Android测试用例数组
   * @returns {Promise<boolean>} - 是否成功选择设备
   */
  async showDeviceSelectionForTest(androidCases) {
    try {
      // MVC: model 不直接创建 UI 组件,emit 事件让 controller 调 view 显示弹窗
      const deviceId = await this._requestDeviceSelection('test');

      // 获取设备Android版本
      let platformVersion = '';
      try {
        const versionResult = await this._api.executeAdbCommand('getprop ro.build.version.release', deviceId);
        // wrapper 失败已抛错由 catch 接,此处走到即成功
        platformVersion = versionResult.output.trim() || '';
      } catch (error) {
        console.warn('获取Android版本失败:', error);
      }

      // 更新所有Android用例的DEVICE_NAME和PLATFORM_VERSION并重新生成Python文件
      if (androidCases && androidCases.length > 0) {
        for (const caseItem of androidCases) {
          try {
            if (!caseItem.caseData.deviceConfig) {
              caseItem.caseData.deviceConfig = {};
            }
            caseItem.caseData.deviceConfig.deviceName = deviceId;
            if (platformVersion) {
              caseItem.caseData.deviceConfig.platformVersion = platformVersion;
            }

            // 从文件路径中提取输出目录
            const filePath = caseItem.filePath;
            let outputDir = this._state.selectedDirectory;
            if (filePath) {
              const pathParts = filePath.split(/[\\/]/);
              outputDir = pathParts.slice(0, -1).join('/');
            }
            if (!outputDir) {
              outputDir = this._state.selectedDirectory;
            }

            // wrapper 已处理 IPC 失败,错误由外层 catch 接
            await this._api.testCaseSaveAndGenerate(caseItem.caseData, outputDir);
          } catch (error) {
            console.error(`更新测试用例设备信息失败: ${caseItem.fileName}`, error);
          }
        }
      }

      this._set('selectedDevice', deviceId, 'selectedDevice-changed');
      AppState.instance.set('selectedDevice', deviceId);
      return true;
    } catch (error) {
      if (error.message === 'cancelled') return false;
      this.emit('error', { source: 'showDeviceSelectionForTest', error });
      return false;
    }
  },

  async showReplaceDeviceConfirm(currentDevice) {
    return new Promise((resolve) => {
      this.emit('confirm-replace-device', {
        currentDevice,
        onConfirm: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
  },

  /**
   * 检查安卓用例是否已填写设备信息
   * @returns {Promise<{valid: boolean, message: string}>}
   */
  async checkAndroidDeviceConfig() {
    if (!this._state.selectedTestFiles || this._state.selectedTestFiles.length === 0) {
      return { valid: true, message: '' };
    }

    const unconfiguredFiles = [];

    for (const file of this._state.selectedTestFiles) {
      let fileName = file.name || file.path;
      if (fileName.endsWith('.py')) fileName = fileName.slice(0, -3);
      if (fileName.includes('/') || fileName.includes('\\')) fileName = fileName.split(/[\\/]/).pop();

      try {
        // wrapper 已处理 IPC 失败,此处直接判断 data 字段
        const result = await this._api.testCaseGet(fileName);
        if (result && result.data) {
          const caseData = result.data;
          const platform = caseData.platform;

          if (platform && platform.toLowerCase() === 'android') {
            const deviceName = caseData.deviceConfig?.deviceName;
            if (!deviceName || deviceName === '{{DEVICE_NAME}}' || deviceName.trim() === '') {
              unconfiguredFiles.push(file.name || file.path);
            }
          }
        }
      } catch (error) {
        // 忽略单个文件的错误
      }
    }

    if (unconfiguredFiles.length > 0) {
      const fileList = unconfiguredFiles.length > 3
        ? unconfiguredFiles.slice(0, 3).join(', ') + '...'
        : unconfiguredFiles.join(', ');
      return {
        valid: false,
        message: window.i18n.t('testExecution.deviceSelection.deviceNotConfigured', { files: fileList })
      };
    }

    return { valid: true, message: '' };
  },

  /**
   * 检查蓝牙用例是否已填写端口信息
   * @returns {Promise<{valid: boolean, message: string}>}
   */
  async checkBlePortConfig() {
    if (!this._state.selectedTestFiles || this._state.selectedTestFiles.length === 0) {
      return { valid: true, message: '' };
    }

    const unconfiguredFiles = [];

    for (const file of this._state.selectedTestFiles) {
      let fileName = file.name || file.path;
      if (fileName.endsWith('.py')) fileName = fileName.slice(0, -3);
      if (fileName.includes('/') || fileName.includes('\\')) fileName = fileName.split(/[\\/]/).pop();

      try {
        // wrapper 已处理 IPC 失败,此处直接判断 data 字段
        const result = await this._api.testCaseGet(fileName);
        if (result && result.data) {
          const caseData = result.data;
          const steps = caseData.steps || [];

          const hasBleSteps = steps.some(step => step.type === 'ble');

          if (hasBleSteps) {
            const blePort = caseData.bleDevice?.port;
            if (!blePort || blePort.trim() === '') {
              unconfiguredFiles.push(file.name || file.path);
            }
          }
        }
      } catch (error) {
        // 忽略单个文件的错误
      }
    }

    if (unconfiguredFiles.length > 0) {
      const fileList = unconfiguredFiles.length > 3
        ? unconfiguredFiles.slice(0, 3).join(', ') + '...'
        : unconfiguredFiles.join(', ');
      return {
        valid: false,
        message: window.i18n.t('testExecution.deviceSelection.blePortNotConfigured', { files: fileList })
      };
    }

    return { valid: true, message: '' };
  },

  /**
   * 显示编辑设备连接标识弹窗
   * @param {string} fileName - 测试用例文件名（不含.py）
   * @param {string} filePath - 测试用例文件完整路径
   */
  async showEditDeviceIdModal(fileName, filePath) {
    this._editDeviceIdFileName = fileName;
    this._editDeviceIdFilePath = filePath;

    let isAndroid = false;
    let hasBleSteps = false;
    let deviceName = '';
    let platformVersion = '';
    let blePort = '';

    try {
      // wrapper 已处理 IPC 失败,此处直接判断 data 字段
      const result = await this._api.testCaseGet(fileName);
      if (result && result.data) {
        deviceName = result.data.deviceConfig?.deviceName || '';
        platformVersion = result.data.deviceConfig?.platformVersion || '';
        blePort = result.data.bleDevice?.port || '';
        isAndroid = result.data.platform && result.data.platform.toLowerCase() === 'android';
        hasBleSteps = result.data.steps && result.data.steps.some(step => step.type === 'ble');
      }
    } catch (error) {
      console.error('获取测试用例设备信息失败:', error);
    }

    // 保存是否有蓝牙步骤的标记
    this._editDeviceIdHasBle = hasBleSteps;

    // 通过事件通知 View 层打开弹窗并填充数据
    this.emit('show-edit-device-id-modal', {
      fileName,
      filePath,
      deviceName: (deviceName && deviceName !== '{{DEVICE_NAME}}') ? deviceName : '',
      platformVersion: (platformVersion && platformVersion !== '{{PLATFORM_VERSION}}') ? platformVersion : '',
      blePort,
      isAndroid,
      hasBleSteps,
    });
  },

  /**
   * 确认编辑设备连接标识
   * @param {string} deviceName - 设备名称
   * @param {string} platformVersion - 平台版本
   * @param {string} blePort - 蓝牙端口
   */
  async confirmEditDeviceId(deviceName, platformVersion, blePort) {
    if (!this._editDeviceIdFileName) return;

    try {
      // wrapper 已处理 IPC 失败,此处直接判断 data 字段
      const result = await this._api.testCaseGet(this._editDeviceIdFileName);
      if (result && result.data) {
        const caseData = result.data;

        // 更新设备配置
        if (!caseData.deviceConfig) {
          caseData.deviceConfig = {};
        }
        caseData.deviceConfig.deviceName = deviceName || '{{DEVICE_NAME}}';
        caseData.deviceConfig.platformVersion = platformVersion || '{{PLATFORM_VERSION}}';

        // 更新蓝牙端口配置
        if (this._editDeviceIdHasBle) {
          if (!caseData.bleDevice) {
            caseData.bleDevice = {};
          }
          caseData.bleDevice.port = blePort || '';
        }

        // 从文件路径中提取输出目录
        let outputDir = this._state.selectedDirectory;
        if (this._editDeviceIdFilePath) {
          const pathParts = this._editDeviceIdFilePath.split(/[\\/]/);
          outputDir = pathParts.slice(0, -1).join('/');
        }
        if (!outputDir) {
          outputDir = this._state.selectedDirectory;
        }

        // wrapper 已处理 IPC 失败,错误由外层 catch 接
        await this._api.testCaseSaveAndGenerate(caseData, outputDir);
        this.emit('edit-device-id-saved', { fileName: this._editDeviceIdFileName, caseData });
      }
    } catch (error) {
      this.emit('error', { source: 'confirmEditDeviceId', error });
    }

    // 清理状态
    this._editDeviceIdFileName = null;
    this._editDeviceIdFilePath = null;
    this._editDeviceIdHasBle = false;
  },

  /**
   * 为编辑设备ID弹窗中的"设备管理"按钮选择设备后回填
   * @returns {Promise<{deviceName: string, platformVersion: string}|null>}
   */
  async selectDeviceForEdit() {
    try {
      // MVC: model 不直接创建 UI 组件,emit 事件让 controller 调 view 显示弹窗
      const deviceId = await this._requestDeviceSelection('test');

      let platformVersion = '';
      try {
        const versionResult = await this._api.executeAdbCommand('getprop ro.build.version.release', deviceId);
        // wrapper 失败已抛错由 catch 接,此处走到即成功
        platformVersion = versionResult.output.trim() || '';
      } catch (error) {
        console.warn('获取Android版本失败:', error);
      }

      return { deviceName: deviceId, platformVersion };
    } catch (error) {
      if (error.message === 'cancelled') return null;
      this.emit('error', { source: 'selectDeviceForEdit', error });
      return null;
    }
  },

  /**
   * 请求显示设备选择弹窗 (MVC: emit 事件让 controller 调 view)
   * @param {string} mode - 弹窗模式
   * @returns {Promise<string>} 用户选择的 deviceId
   */
  _requestDeviceSelection(mode) {
    return new Promise((resolve, reject) => {
      this.emit('request-device-selection', { mode, resolve, reject });
    });
  },

  /**
   * 查询测试用例数据 (MVC: model 封装 API,供 controller 调用避免 view 直接调 electronAPI)
   * @param {string} fileName - 测试用例文件名 (不含 .py 后缀)
   * @returns {Promise<Object>} API 返回结果
   */
  async getTestCase(fileName) {
    return await this._api.testCaseGet(fileName);
  },
};
