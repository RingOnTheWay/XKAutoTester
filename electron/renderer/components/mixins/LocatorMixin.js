/**
 * LocatorMixin - InspectorModal locator list, selection confirmation & tree search.
 *
 * Extracted from inspector.js via Object.assign prototype composition.
 * NOTE: original private fields (#xxx) were converted to public (_xxx) so
 * mixin methods (defined outside the class body) can access them.
 */
import { Toast } from '../toast.js';

export const LocatorMixin = {
  async showLocators(element) {
    if (!this._locatorList) return;

    this._selectedLocator = null;

    try {
      const result = await window.electronAPI.inspector.findElementLocators(element.path);
      // wrapper 已在 success=false 时抛错，此处只判断 locators 字段
      if (!result.locators || result.locators.length === 0) {
        this._locatorList.innerHTML = `<div class="inspector-locator-empty">${window.i18n.t('inspector.noLocators')}</div>`;
        const header = this._overlay?.querySelector('#inspector-locator-header');
        if (header) header.style.display = 'none';
        return;
      }

      this._locatorList.innerHTML = '';

      const header = this._overlay?.querySelector('#inspector-locator-header');
      if (header) header.style.display = '';

      result.locators.forEach((locator, index) => {
        const item = document.createElement('div');
        item.className = 'inspector-locator-item';

        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'inspector-locator';
        radio.className = 'inspector-locator-radio';
        radio.value = index;
        if (index === 0) {
          radio.checked = true;
          this._selectedLocator = locator;
        }
        radio.addEventListener('change', () => {
          this._selectedLocator = locator;
        });

        const typeSpan = document.createElement('span');
        typeSpan.className = 'inspector-locator-type';
        const typeDisplayMap = { click: 'tap_position' };
        typeSpan.textContent = typeDisplayMap[locator.type] || locator.type || '';

        const valueSpan = document.createElement('span');
        valueSpan.className = 'inspector-locator-value';
        valueSpan.textContent = locator.value || '';
        valueSpan.title = locator.value || '';

        item.appendChild(radio);
        item.appendChild(typeSpan);
        item.appendChild(valueSpan);

        item.addEventListener('click', () => {
          radio.checked = true;
          this._selectedLocator = locator;
        });

        this._locatorList.appendChild(item);
      });
    } catch (err) {
      this._locatorList.innerHTML = `<div class="inspector-locator-empty">${window.i18n.t('inspector.noLocators')}</div>`;
    }
  },

  confirmSelection() {
    if (!this._selectedLocator) {
      Toast.warning(window.i18n.t('inspector.selectLocatorFirst'));
      return;
    }

    const event = new CustomEvent('inspector-element-selected', {
      detail: {
        locatorType: this._selectedLocator.type,
        locatorValue: this._selectedLocator.value,
      },
    });
    document.dispatchEvent(event);
  },

  searchTree(keyword) {
    if (!this._treeContainer) return;

    const hintEl = this._overlay?.querySelector('#inspector-search-hint');
    const countEl = this._overlay?.querySelector('#inspector-search-count');
    const prevBtn = this._overlay?.querySelector('#inspector-search-prev-btn');
    const nextBtn = this._overlay?.querySelector('#inspector-search-next-btn');

    const nodes = this._treeContainer.querySelectorAll('.inspector-tree-node');
    if (!keyword || keyword.trim() === '') {
      nodes.forEach((n) => {
        n.classList.remove('search-hidden');
      });
      this._searchResults = [];
      this._searchResultIndex = -1;
      if (hintEl) hintEl.classList.add('hidden');
      if (countEl) countEl.textContent = '0/0';
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
      return;
    }

    const lowerKeyword = keyword.toLowerCase();
    const matchedPaths = new Set();
    const matchedElements = [];

    this._allElements.forEach((el) => {
      const text = el.attributes?.text || '';
      const contentDesc = el.attributes?.['content-desc'] || '';
      const searchable = [text, contentDesc].join(' ').toLowerCase();

      if (searchable.includes(lowerKeyword)) {
        matchedElements.push(el);
        let current = el;
        while (current) {
          matchedPaths.add(current.path);
          current = current._parent;
        }
      }
    });

    nodes.forEach((n) => {
      const path = n.dataset.path;
      if (matchedPaths.has(path)) {
        n.classList.remove('search-hidden');
        const parentChildren = n.parentElement;
        if (parentChildren && parentChildren.classList.contains('inspector-tree-children')) {
          parentChildren.classList.remove('hidden');
          const parentNode = parentChildren.previousElementSibling;
          if (parentNode) {
            const toggle = parentNode.querySelector(':scope > .inspector-tree-node-content > .inspector-tree-toggle');
            if (toggle) toggle.textContent = '▼';
          }
        }
      } else {
        n.classList.add('search-hidden');
      }
    });

    this._searchResults = matchedElements;
    this._searchResultIndex = -1;

    if (matchedElements.length > 0) {
      if (hintEl) hintEl.classList.add('hidden');
      this._searchResultIndex = 0;
      this.selectElement(matchedElements[0]);
      this._updateSearchNav();
    } else {
      if (hintEl) {
        hintEl.textContent = window.i18n.t('inspector.searchNoResult');
        hintEl.classList.remove('hidden');
      }
      if (countEl) countEl.textContent = '0/0';
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
    }
  },

  navigateSearchResult(direction) {
    if (!this._searchResults || this._searchResults.length === 0) return;

    this._searchResultIndex += direction;
    if (this._searchResultIndex >= this._searchResults.length) {
      this._searchResultIndex = 0;
    } else if (this._searchResultIndex < 0) {
      this._searchResultIndex = this._searchResults.length - 1;
    }

    this.selectElement(this._searchResults[this._searchResultIndex]);
    this._updateSearchNav();
  },

  _updateSearchNav() {
    const countEl = this._overlay?.querySelector('#inspector-search-count');
    const prevBtn = this._overlay?.querySelector('#inspector-search-prev-btn');
    const nextBtn = this._overlay?.querySelector('#inspector-search-next-btn');

    const total = this._searchResults?.length || 0;
    const current = this._searchResultIndex + 1;

    if (countEl) {
      countEl.textContent = total > 0 ? `${current}/${total}` : '0/0';
    }
    if (prevBtn) prevBtn.disabled = total <= 1;
    if (nextBtn) nextBtn.disabled = total <= 1;
  },
};
