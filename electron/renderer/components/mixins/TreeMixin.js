/**
 * TreeMixin - InspectorModal element tree rendering & selection.
 *
 * Extracted from inspector.js via Object.assign prototype composition.
 * NOTE: original private fields (#xxx) were converted to public (_xxx) so
 * mixin methods (defined outside the class body) can access them.
 */

// R15: 转义 Appium page source 属性（text/content-desc/class 等被测应用可控），防止 XSS

import { escapeHtml } from '../../core/utils/html.js';

export const TreeMixin = {
  renderElementTree(elements) {
    if (!this._treeContainer) return;
    this._treeContainer.innerHTML = '';

    if (!elements || elements.length === 0) {
      this._treeContainer.innerHTML = `<div class="inspector-tree-empty">${window.i18n.t('inspector.noElements')}</div>`;
      return;
    }

    elements.forEach((element) => {
      this._treeContainer.appendChild(this.createTreeNode(element));
    });
  },

  createTreeNode(element) {
    const node = document.createElement('div');
    node.className = 'inspector-tree-node';
    node.dataset.path = element.path || '';

    const hasChildren = element.children && element.children.length > 0;

    const content = document.createElement('div');
    content.className = 'inspector-tree-node-content';

    const toggle = document.createElement('span');
    toggle.className = 'inspector-tree-toggle' + (hasChildren ? '' : ' leaf');
    if (hasChildren) {
      toggle.textContent = '▶';
    }

    const label = document.createElement('span');
    label.className = 'inspector-tree-label';
    const className = element.attributes?.class || element.attributes?.type || '';
    const shortClass = className.split('.').pop();
    const textAttr = element.attributes?.text || '';
    const descAttr = element.attributes?.['content-desc'] || '';

    let html = '';
    if (shortClass) html += `<span class="tree-class-name">${escapeHtml(shortClass)}</span>`;
    if (textAttr) html += `<span class="tree-text-content"> text="${escapeHtml(textAttr)}"</span>`;
    if (descAttr && descAttr !== textAttr)
      html += `<span class="tree-desc-content"> desc="${escapeHtml(descAttr)}"</span>`;
    label.innerHTML = html;
    label.title = [
      className && `class: ${className}`,
      element.attributes?.['resource-id'] && `resource-id: ${element.attributes['resource-id']}`,
      element.attributes?.text && `text: ${element.attributes.text}`,
      element.attributes?.['content-desc'] && `content-desc: ${element.attributes['content-desc']}`,
    ]
      .filter(Boolean)
      .join('\n');

    content.appendChild(toggle);
    content.appendChild(label);
    node.appendChild(content);

    if (hasChildren) {
      const childContainer = document.createElement('div');
      childContainer.className = 'inspector-tree-children hidden';
      element.children.forEach((child) => {
        childContainer.appendChild(this.createTreeNode(child));
      });
      node.appendChild(childContainer);
    }

    node.addEventListener('click', (e) => {
      e.stopPropagation();
      this.selectElement(element);
      if (hasChildren) {
        this.toggleNode(node);
      }
    });

    node.addEventListener('mouseenter', (e) => {
      e.stopPropagation();
      this._hoveredElement = element;
      this._updateHighlighterHover();
    });

    node.addEventListener('mouseleave', (e) => {
      e.stopPropagation();
      if (this._hoveredElement === element) {
        this._hoveredElement = null;
        this._updateHighlighterHover();
      }
    });

    return node;
  },

  _expandAncestors(element) {
    const ancestors = [];
    let current = element._parent;
    while (current) {
      ancestors.unshift(current);
      current = current._parent;
    }
    ancestors.forEach((ancestor) => {
      const node = this._treeContainer.querySelector(`.inspector-tree-node[data-path="${ancestor.path}"]`);
      if (node) {
        const childContainer = node.querySelector(':scope > .inspector-tree-children');
        if (childContainer && childContainer.classList.contains('hidden')) {
          childContainer.classList.remove('hidden');
          const toggle = node.querySelector(':scope > .inspector-tree-node-content > .inspector-tree-toggle');
          if (toggle) {
            toggle.textContent = '▼';
          }
        }
      }
    });
  },

  selectElement(element) {
    this._selectedElement = element;
    this.redrawCanvas();
    this._updateHighlighterSelection();
    this.showLocators(element);
    if (this._confirmBtn) this._confirmBtn.disabled = false;

    this._expandAncestors(element);

    this._treeContainer.querySelectorAll('.inspector-tree-node').forEach((n) => {
      n.classList.remove('selected');
    });
    const targetNode = this._treeContainer.querySelector(`.inspector-tree-node[data-path="${element.path}"]`);
    if (targetNode) {
      targetNode.classList.add('selected');
      targetNode.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  },

  highlightTreeNode(element, highlight) {
    const node = this._treeContainer.querySelector(`.inspector-tree-node[data-path="${element.path}"]`);
    if (node) {
      node.classList.toggle('hovered', highlight);
    }
  },

  deselectElement() {
    this._selectedElement = null;
    this._selectedLocator = null;
    this.redrawCanvas();
    this._updateHighlighterSelection();
    if (this._locatorList) {
      this._locatorList.innerHTML = `<div class="inspector-locator-empty" data-i18n="inspector.noLocators">${window.i18n.t('inspector.noLocators')}</div>`;
    }
    const dHeaderEl = this._overlay?.querySelector('#inspector-locator-header');
    if (dHeaderEl) dHeaderEl.style.display = 'none';
    this._treeContainer.querySelectorAll('.inspector-tree-node').forEach((n) => {
      n.classList.remove('selected');
    });
    if (this._confirmBtn) this._confirmBtn.disabled = true;
  },

  toggleNode(nodeElement) {
    const childContainer = nodeElement.querySelector(':scope > .inspector-tree-children');
    if (!childContainer) return;

    const toggle = nodeElement.querySelector(':scope > .inspector-tree-node-content > .inspector-tree-toggle');
    const isHidden = childContainer.classList.contains('hidden');
    childContainer.classList.toggle('hidden', !isHidden);
    if (toggle) {
      toggle.textContent = isHidden ? '▼' : '▶';
    }
  },
};
