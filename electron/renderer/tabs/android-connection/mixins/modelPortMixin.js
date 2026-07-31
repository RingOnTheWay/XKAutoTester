// Port Mixin for AndroidConnectionModel
// Extracted from model.js during refactor
// Provides: serial port management modal

export const modelPortMixin = {
  // ── 蓝牙端口管理 ───────────────────────────────────────────────

  async showPortManagementModal() {
    try {
      const result = await this._api.getSerialPorts();
      this.emit('serial-ports-loaded', result);
      return result;
    } catch (error) {
      this.emit('error', { source: 'showPortManagementModal', error });
      return null;
    }
  },
};
