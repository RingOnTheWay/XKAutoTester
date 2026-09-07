/**
 * HighlighterMixin - InspectorModal element highlighter overlay & coordinate math.
 *
 * Extracted from inspector.js via Object.assign prototype composition.
 * NOTE: original private fields (#xxx) were converted to public (_xxx) so
 * mixin methods (defined outside the class body) can access them.
 * R22-5: 原 _updateHighlighterHover 重复定义 (后置 no-op 覆盖功能实现, hover 高亮失效),
 * no-op 版本已删除, 保留带 hoveredPath 的实现。
 */
export const HighlighterMixin = {
  parseBounds(boundsStr) {
    if (!boundsStr) return null;
    const match = boundsStr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    if (!match) return null;
    return {
      x1: parseInt(match[1]),
      y1: parseInt(match[2]),
      x2: parseInt(match[3]),
      y2: parseInt(match[4]),
    };
  },

  parseCoordinates(element) {
    const { bounds, x, y, width, height } = element.attributes || {};
    if (bounds) {
      const boundsArray = bounds.split(/\[|\]|,/).filter((str) => str !== '');
      const [x1, y1, x2, y2] = boundsArray.map((val) => parseInt(val, 10));
      return { x1, y1, x2, y2 };
    } else if (x !== undefined && x !== null) {
      const xInt = parseInt(x, 10);
      const yInt = parseInt(y, 10);
      const widthInt = parseInt(width, 10);
      const heightInt = parseInt(height, 10);
      return { x1: xInt, y1: yInt, x2: xInt + widthInt, y2: yInt + heightInt };
    }
    return {};
  },

  _getElements(sourceJSON) {
    const elementsList = [];

    if (Array.isArray(sourceJSON)) {
      for (const el of sourceJSON) {
        this._buildElementsWithProps(el, elementsList);
      }
    } else if (sourceJSON) {
      this._buildElementsWithProps(sourceJSON, elementsList);
    }

    return elementsList;
  },

  _buildElementsWithProps(sourceJSON, elements) {
    if (!sourceJSON) return;
    const coords = this.parseCoordinates(sourceJSON);
    const scaleRatio = this._scaleRatio;

    if (coords && (coords.x1 || coords.x1 === 0)) {
      elements.push({
        element: sourceJSON,
        properties: {
          left: coords.x1 / scaleRatio,
          top: coords.y1 / scaleRatio,
          width: (coords.x2 - coords.x1) / scaleRatio,
          height: (coords.y2 - coords.y1) / scaleRatio,
          path: sourceJSON.path,
        },
      });
    }

    if (sourceJSON.children) {
      for (const childEl of sourceJSON.children) {
        this._buildElementsWithProps(childEl, elements);
      }
    }
  },

  renderHighlighterRects() {
    if (!this._highlighterContainer) return;
    this._highlighterContainer.innerHTML = '';

    if (!this._elementsTree || !this._scaleRatio) return;

    // Cache elements for coordinate-based lookup
    this._highlighterElements = this._getElements(this._elementsTree);

    // Remove old container listeners and add new ones
    this._removeHighlighterListeners();
    this._addHighlighterListeners();

    for (const elem of this._highlighterElements) {
      if (!elem.properties.width || !elem.properties.height) continue;

      const box = document.createElement('div');
      box.className = 'inspector-highlighter-box';
      if (this._selectedElement && this._selectedElement.path === elem.element.path) {
        box.classList.add('inspector-selected-element');
      }
      box.style.left = elem.properties.left + 'px';
      box.style.top = elem.properties.top + 'px';
      box.style.width = elem.properties.width + 'px';
      box.style.height = elem.properties.height + 'px';
      box.dataset.path = elem.element.path;
      this._highlighterContainer.appendChild(box);
    }
  },

  _addHighlighterListeners() {
    if (!this._highlighterContainer) return;

    this._highlighterClickHandler = (e) => {
      const elem = this._findElementAtPoint(e);
      if (elem) {
        if (this._selectedElement && this._selectedElement.path === elem.element.path) {
          this.deselectElement();
        } else {
          this.selectElement(elem.element);
        }
      }
    };

    this._highlighterMoveHandler = (e) => {
      const elem = this._findElementAtPoint(e);
      const prevHovered = this._hoveredElement;
      if (elem) {
        this._hoveredElement = elem.element;
        this._updateHighlighterHover(elem.element.path);
        if (prevHovered !== elem.element) {
          if (prevHovered) this.highlightTreeNode(prevHovered, false);
          this.highlightTreeNode(elem.element, true);
        }
      } else {
        this._hoveredElement = null;
        this._updateHighlighterHover(null);
        if (prevHovered) this.highlightTreeNode(prevHovered, false);
      }
    };

    this._highlighterLeaveHandler = () => {
      if (this._hoveredElement) {
        this.highlightTreeNode(this._hoveredElement, false);
        this._hoveredElement = null;
      }
      this._updateHighlighterHover(null);
    };

    this._highlighterContainer.addEventListener('click', this._highlighterClickHandler);
    this._highlighterContainer.addEventListener('mousemove', this._highlighterMoveHandler);
    this._highlighterContainer.addEventListener('mouseleave', this._highlighterLeaveHandler);
  },

  _removeHighlighterListeners() {
    if (!this._highlighterContainer) return;
    if (this._highlighterClickHandler) {
      this._highlighterContainer.removeEventListener('click', this._highlighterClickHandler);
      this._highlighterClickHandler = null;
    }
    if (this._highlighterMoveHandler) {
      this._highlighterContainer.removeEventListener('mousemove', this._highlighterMoveHandler);
      this._highlighterMoveHandler = null;
    }
    if (this._highlighterLeaveHandler) {
      this._highlighterContainer.removeEventListener('mouseleave', this._highlighterLeaveHandler);
      this._highlighterLeaveHandler = null;
    }
  },

  _findElementAtPoint(e) {
    if (!this._highlighterElements || !this._highlighterContainer) return null;

    const containerRect = this._highlighterContainer.getBoundingClientRect();
    const x = e.clientX - containerRect.left;
    const y = e.clientY - containerRect.top;

    // Find the deepest (last in tree order = most specific) element containing the point
    // Iterate in reverse to find the most specific element first
    let bestMatch = null;
    let bestArea = Infinity;

    for (let i = this._highlighterElements.length - 1; i >= 0; i--) {
      const elem = this._highlighterElements[i];
      const { left, top, width, height } = elem.properties;
      if (x >= left && x <= left + width && y >= top && y <= top + height) {
        const area = width * height;
        // Prefer smaller elements (more specific) at the same depth
        if (area < bestArea) {
          bestArea = area;
          bestMatch = elem;
        }
      }
    }

    return bestMatch;
  },

  _updateHighlighterHover(hoveredPath) {
    if (!this._highlighterContainer) return;
    this._highlighterContainer.querySelectorAll('.inspector-highlighter-box').forEach((box) => {
      if (hoveredPath && box.dataset.path === hoveredPath) {
        box.style.background = 'rgba(76, 175, 80, 0.2)';
        box.style.border = '2px solid rgba(76, 175, 80, 0.6)';
      } else if (!box.classList.contains('inspector-selected-element')) {
        box.style.background = '';
        box.style.border = '';
      }
    });
  },

  _updateHighlighterSelection() {
    if (!this._highlighterContainer) return;
    this._highlighterContainer.querySelectorAll('.inspector-selected-element').forEach((el) => {
      el.classList.remove('inspector-selected-element');
    });
    if (this._selectedElement) {
      const escapedPath = CSS.escape(this._selectedElement.path);
      const box = this._highlighterContainer.querySelector(`[data-path="${escapedPath}"]`);
      if (box) box.classList.add('inspector-selected-element');
    }
  },
};
