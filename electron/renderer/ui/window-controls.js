/**
 * WindowControls - 窗口控制与透明区域点击穿透 (R26 候选③, 自 app.js 拆出)
 *
 * 职责:
 * - setupWindowControls: 最小化/最大化/关闭按钮 + 最大化状态图标同步
 * - setupTransparentAreaClickThrough: 透明区域 setIgnoreMouseEvents 穿透
 *   + 导航栏拖拽 (startWindowDrag/moveWindowDrag/endWindowDrag)
 *   P1-10: mousemove 用 rAF 节流 (原每次移动 getBoundingClientRect + IPC 往返密集)
 *
 * 拆分动机: 窗口机制与业务引导正交; onCloseWindow 回调注入关闭前的
 * 副作用 (关 InspectorModal), 不反向依赖。
 */

export class WindowControls {
  /**
   * @param {(onCloseWindow: () => void)} callbacks - { onCloseWindow } 关闭前副作用钩子
   */
  constructor({ onCloseWindow } = {}) {
    this.#onCloseWindow = onCloseWindow;
  }

  #onCloseWindow = null;

  setup() {
    this.#setupWindowControls();
    this.#setupTransparentAreaClickThrough();
  }

  #setupWindowControls() {
    const minimizeBtn = document.getElementById('window-minimize');
    const maximizeBtn = document.getElementById('window-maximize');
    const closeBtn = document.getElementById('window-close');

    const updateMaximizeButton = (isMaximized) => {
      if (maximizeBtn) {
        if (isMaximized) {
          maximizeBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="8" y="8" width="12" height="12" rx="2"/>
              <path d="M4 16V6a2 2 0 0 1 2-2h10"/>
            </svg>
          `;
          maximizeBtn.title = (window.i18n && window.i18n.t('windowControls.restore')) || '还原';
          document.body.classList.add('window-maximized');
        } else {
          maximizeBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="4" y="4" width="16" height="16" rx="2"/>
            </svg>
          `;
          maximizeBtn.title = (window.i18n && window.i18n.t('windowControls.maximize')) || '最大化';
          document.body.classList.remove('window-maximized');
        }
      }
    };

    if (minimizeBtn) {
      minimizeBtn.addEventListener('click', () => {
        window.electronAPI.minimizeWindow();
      });
    }

    if (maximizeBtn) {
      maximizeBtn.addEventListener('click', async () => {
        const isMaximized = await window.electronAPI.maximizeWindow();
        updateMaximizeButton(isMaximized);
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        // 关闭前副作用 (如关 InspectorModal) 由回调注入
        if (typeof this.#onCloseWindow === 'function') {
          this.#onCloseWindow();
        }
        window.electronAPI.closeWindow();
      });
    }

    window.electronAPI
      .isWindowMaximized()
      .then((isMaximized) => {
        updateMaximizeButton(isMaximized);
      })
      .catch((error) => {
        console.error('获取窗口最大化状态失败:', error);
      });

    window.electronAPI.onWindowMaximized((isMaximized) => {
      updateMaximizeButton(isMaximized);
    });
  }

  #setupTransparentAreaClickThrough() {
    let isIgnoringMouseEvents = false;
    let isDragging = false;
    const appElement = document.getElementById('app');
    const appNav = document.querySelector('.app-nav');

    if (!appElement) {
      console.error('找不到 #app 元素');
      return;
    }

    const isInTransparentArea = (x, y) => {
      const rect = appElement.getBoundingClientRect();
      return x < rect.left || x > rect.right || y < rect.top || y > rect.bottom;
    };

    const isInDraggableArea = (x, y) => {
      if (!appNav) return false;

      const navRect = appNav.getBoundingClientRect();
      if (x < navRect.left || x > navRect.right || y < navRect.top || y > navRect.bottom) {
        return false;
      }

      const noDragElements = appNav.querySelectorAll('.nav-left, .nav-tabs, .nav-right');
      for (const el of noDragElements) {
        const elRect = el.getBoundingClientRect();
        if (x >= elRect.left && x <= elRect.right && y >= elRect.top && y <= elRect.bottom) {
          return false;
        }
      }

      return true;
    };

    // P1-10: mousemove 用 rAF 节流 — 原实现每次鼠标移动都执行 getBoundingClientRect
    // + 可能的 IPC (setIgnoreMouseEvents/moveWindowDrag), 透明区域高频移动时 IPC 往返密集。
    let rafPending = false;
    let lastMouseX = 0;
    let lastMouseY = 0;
    let lastScreenX = 0;
    let lastScreenY = 0;

    const checkMousePosition = (e) => {
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      lastScreenX = e.screenX;
      lastScreenY = e.screenY;
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        const x = lastMouseX;
        const y = lastMouseY;
        const inTransparent = isInTransparentArea(x, y);

        if (inTransparent && !isIgnoringMouseEvents) {
          isIgnoringMouseEvents = true;
          window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
        } else if (!inTransparent && isIgnoringMouseEvents) {
          isIgnoringMouseEvents = false;
          window.electronAPI.setIgnoreMouseEvents(false);
        }

        if (isDragging) {
          window.electronAPI.moveWindowDrag(lastScreenX, lastScreenY);
        }
      });
    };

    document.addEventListener('mousemove', checkMousePosition);

    document.addEventListener('mousedown', (e) => {
      if (isInDraggableArea(e.clientX, e.clientY)) {
        isDragging = true;
        window.electronAPI.startWindowDrag(e.screenX, e.screenY);
        e.preventDefault();
      }
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        window.electronAPI.endWindowDrag();
      }
    });

    document.addEventListener('mouseleave', () => {
      if (!isIgnoringMouseEvents) {
        isIgnoringMouseEvents = true;
        window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
      }
    });

    document.addEventListener('mouseenter', (e) => {
      if (isIgnoringMouseEvents && !isInTransparentArea(e.clientX, e.clientY)) {
        isIgnoringMouseEvents = false;
        window.electronAPI.setIgnoreMouseEvents(false);
      }
    });
  }
}
