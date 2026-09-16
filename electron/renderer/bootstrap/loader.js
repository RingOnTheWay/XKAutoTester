/**
 * HtmlLoader - Tab/组件 HTML 片段与 Inspector 加载 (R26 候选③, 自 app.js 拆出)
 *
 * 职责:
 * - loadTabHtml: 5 个 tab 的 tab.html 片段注入对应 page 容器
 *   (兼容 npm start loadFile + npm run dev server 两种基址)
 * - loadComponents: confirm-modal 组件 HTML + 图标 + 翻译
 * - initInspector: inspector-modal HTML + InspectorModal 实例
 * - 图标: initializeIcons / initializeComponentIcons / getIconHtml
 *
 * 拆分动机: 加载编排是引导关注, 与 UI 机制 (窗口/下拉/穿透) 正交。
 */
import { Icons } from '../icons.js';
import { InspectorModal } from '../components/inspector.js';
import { I18nCoordinator } from './i18n.js';

const TAB_NAMES = ['test-execution', 'page-package', 'test-case', 'android-connection', 'settings'];

export class HtmlLoader {
  #i18n = new I18nCoordinator();

  /** 加载全部 Tab HTML 片段到 #<name> 容器 */
  async loadTabHtml() {
    await Promise.all(
      TAB_NAMES.map(async (name) => {
        try {
          const response = await fetch(`tabs/${name}/tab.html`);
          if (!response.ok) {
            console.error(`加载 tab HTML 失败: tabs/${name}/tab.html (${response.status})`);
            return;
          }
          const html = await response.text();
          const container = document.getElementById(name);
          if (container) {
            container.innerHTML = html;
          } else {
            console.error(`Tab container not found: ${name}`);
          }
        } catch (err) {
          console.error(`加载 tab HTML 异常: ${name}`, err);
        }
      })
    );
  }

  /** 加载 confirm-modal 组件 HTML 并初始化其图标与翻译 */
  async loadComponents() {
    try {
      const container = document.getElementById('confirm-modal-container');
      if (container) {
        const response = await fetch('components/confirm-modal.html');
        if (response.ok) {
          container.innerHTML = await response.text();
        } else {
          console.error('加载组件失败: components/confirm-modal.html');
        }
      }
      this.initializeComponentIcons();
      this.#i18n.updateComponentTranslations();
    } catch (error) {
      console.error('加载组件失败:', error);
    }
  }

  /** 加载 Inspector HTML 并创建实例 */
  async initInspector() {
    try {
      const container = document.getElementById('inspector-modal-container');
      if (container) {
        const response = await fetch('components/inspector-modal.html');
        container.innerHTML = await response.text();
        this.initializeIcons();
      }
      return new InspectorModal();
    } catch (error) {
      console.error('Failed to initialize Inspector:', error);
      return null;
    }
  }

  // ─── 图标 ───────────────────────────────────────────────────────

  /** 刷新文档内全部 .svg-icon[data-icon] 的内联 SVG */
  initializeIcons() {
    const iconElements = document.querySelectorAll('.svg-icon[data-icon]');
    iconElements.forEach((element) => {
      const iconName = element.getAttribute('data-icon');
      if (Icons[iconName]) {
        element.innerHTML = Icons[iconName];
      }
    });
  }

  /** 刷新 confirm-modal 容器内图标 */
  initializeComponentIcons() {
    document.querySelectorAll('#confirm-modal-container .svg-icon[data-icon]').forEach((element) => {
      const iconName = element.getAttribute('data-icon');
      if (Icons[iconName]) element.innerHTML = Icons[iconName];
    });
  }

  /** 生成图标 HTML 片段 (供 view 动态渲染) */
  getIconHtml(iconName, style = '') {
    if (!Icons[iconName]) return '';
    return `<span class="svg-icon" data-icon="${iconName}" style="${style}">${Icons[iconName]}</span>`;
  }
}
