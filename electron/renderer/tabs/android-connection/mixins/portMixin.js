// Port Mixin for AndroidConnectionView
// Extracted from view.js during refactor
// Provides: serial port list rendering and scanning state

export const portMixin = {
  // ─── 端口管理 ──────────────────────────────────────────────────

  renderPortList(ports, onPortClick) {
    const { portList, portModalConfirmBtn } = this.els;
    if (!portList) return;

    portList.innerHTML = '';
    portModalConfirmBtn && (portModalConfirmBtn.disabled = true);

    if (ports && ports.length > 0) {
      ports.forEach(port => {
        const item = document.createElement('div');
        item.className = 'device-item';
        item.setAttribute('data-port-id', port.deviceId);
        item.innerHTML = `
          <div style="display:flex;align-items:center;">
            ${this.getIconHtml('cable', 'margin-right:8px;')}
            <div>
              <div style="font-weight:500;">${port.deviceId}</div>
              <div style="font-size:12px;color:var(--text-secondary);">${port.name || ''}</div>
            </div>
          </div>
        `;
        item.addEventListener('click', () => {
          portList.querySelectorAll('.device-item').forEach(i => i.classList.remove('selected'));
          item.classList.add('selected');
          portModalConfirmBtn && (portModalConfirmBtn.disabled = false);
          onPortClick?.(port);
        });
        portList.appendChild(item);
      });
    } else {
      portList.innerHTML = `<div style="padding:16px;text-align:center;color:var(--text-secondary);">${
        window.i18n.t('testExecution.deviceSelection.noPortsFound') || '未找到串口设备'
      }</div>`;
    }
  },

  showPortScanning() {
    const { portScanning, portList, portModalConfirmBtn } = this.els;
    portScanning && (portScanning.style.display = 'flex');
    portList && (portList.classList.add('hidden'));
    portModalConfirmBtn && (portModalConfirmBtn.disabled = true);
  },

  hidePortScanning() {
    const { portScanning, portList } = this.els;
    portScanning && (portScanning.style.display = 'none');
    portList && (portList.classList.remove('hidden'));
  },
};
