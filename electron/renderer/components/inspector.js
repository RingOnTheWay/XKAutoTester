import { Toast } from './toast.js';

export class InspectorModal {
    constructor() {
        this.screenshotImage = null;
        this.elementsTree = [];
        this.selectedElement = null;
        this.hoveredElement = null;
        this.selectedLocator = null;
        this.canvasScale = 1;
        this.deviceResolution = null;
        this._escHandler = null;
        this._allElements = [];
        this._scaleRatio = 1;
        this._loadingStepIndex = 0;
        this._loadingTimer = null;
        this._sessionParams = null;
        this._refreshing = false;
        this._stepGeneration = 0;
        this._progressUnsubscribe = null;
        this.init();
    }

    init() {
        this.overlay = document.getElementById('inspector-modal-overlay');
        if (!this.overlay) return;

        this.canvas = document.getElementById('inspector-canvas');
        this.highlighterContainer = document.getElementById('inspector-highlighter-container');
        this.canvasContainer = document.getElementById('inspector-canvas-container');
        this.treeContainer = document.getElementById('inspector-tree-container');
        this.treeSearch = document.getElementById('inspector-tree-search');
        this.loadingEl = document.getElementById('inspector-loading');
        this.locatorList = document.getElementById('inspector-locator-list');
        this.refreshBtn = document.getElementById('inspector-refresh-btn');
        this.confirmBtn = document.getElementById('inspector-confirm-btn');
        this.cancelBtn = document.getElementById('inspector-cancel-btn');
        this.closeBtn = document.getElementById('inspector-modal-close-btn');

        this.bindEvents();
        this._initResizeObserver();
    }

    bindEvents() {
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.close();
            });
        }

        if (this.cancelBtn) {
            this.cancelBtn.addEventListener('click', () => this.close());
        }

        if (this.confirmBtn) {
            this.confirmBtn.addEventListener('click', () => this.confirmSelection());
        }

        if (this.refreshBtn) {
            this.refreshBtn.addEventListener('click', () => this.refreshView());
        }

        if (this.treeSearch) {
            this.treeSearch.addEventListener('input', (e) => {
                if (this._searchTimer) clearTimeout(this._searchTimer);
                this._searchTimer = setTimeout(() => {
                    this.searchTree(e.target.value);
                }, 1000);
            });
        }

        const prevBtn = this.overlay?.querySelector('#inspector-search-prev-btn');
        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.navigateSearchResult(-1));
        }

        const nextBtn = this.overlay?.querySelector('#inspector-search-next-btn');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.navigateSearchResult(1));
        }

        this._bindHeaderDrag();
    }

    _bindHeaderDrag() {
        const header = this.overlay?.querySelector('.modal-header');
        if (!header) return;

        let isDragging = false;

        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('button') || e.target.closest('.icon-button')) return;
            isDragging = true;
            window.electronAPI?.startWindowDrag(e.screenX, e.screenY);
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            window.electronAPI?.moveWindowDrag(e.screenX, e.screenY);
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                window.electronAPI?.endWindowDrag();
            }
        });
    }

    async open(deviceName, appPackage, appActivity, noReset = true) {
        if (!this.overlay) return;

        this.resetState();
        this._sessionParams = { deviceName, appPackage, appActivity, noReset };
        this.overlay.classList.remove('hidden');
        this._addEscListener();
        this.showLoading(true);
        this._subscribeProgress();

        try {
            const result = await window.electronAPI.inspector.startSession(deviceName, appPackage, appActivity, '', noReset);
            if (!result || !result.success) {
                throw new Error(result?.error || window.i18n?.t('inspector.startFailed') || 'Failed to start inspector session');
            }
            if (result.warning) {
                Toast.warning(result.warning);
            }
            this._advanceLoadingStep(3);
            await this.refreshView({ showSteps: true, preserveSteps: true, hideLoading: false });
            await this._waitForStepQueue();
            await new Promise(resolve => setTimeout(resolve, 400));
        } catch (err) {
            Toast.error(err.message || window.i18n?.t('inspector.startFailed') || 'Failed to start inspector');
            this.close();
        } finally {
            this._unsubscribeProgress();
            this.showLoading(false);
        }
    }

    close() {
        if (!this.overlay) return;

        this._removeEscListener();
        this._unsubscribeProgress();
        this._destroyResizeObserver();
        this._removeHighlighterListeners();
        this.overlay.classList.add('hidden');
        this.removeCanvasListeners();

        if (window.electronAPI?.inspector?.stopSession) {
            window.electronAPI.inspector.stopSession().catch(() => {});
        }

        this.resetState();
    }

    resetState() {
        this.screenshotImage = null;
        this.elementsTree = [];
        this._allElements = [];
        this._highlighterElements = [];
        this.selectedElement = null;
        this.hoveredElement = null;
        this.selectedLocator = null;
        this.canvasScale = 1;
        this.deviceResolution = null;
        this._scaleRatio = 1;

        if (this.treeContainer) this.treeContainer.innerHTML = '';
        if (this.locatorList) {
            this.locatorList.innerHTML = `<div class="inspector-locator-empty" data-i18n="inspector.noLocators">${window.i18n?.t('inspector.noLocators') || '请选择一个元素查看定位方式'}</div>`;
        }
        const headerEl = this.overlay?.querySelector('#inspector-locator-header');
        if (headerEl) headerEl.style.display = 'none';
        if (this.canvas) {
            const ctx = this.canvas.getContext('2d');
            ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
        if (this.highlighterContainer) this.highlighterContainer.innerHTML = '';

        this._searchResults = [];
        this._searchResultIndex = -1;
        const countEl = this.overlay?.querySelector('#inspector-search-count');
        if (countEl) countEl.textContent = '0/0';
        const prevBtn = this.overlay?.querySelector('#inspector-search-prev-btn');
        if (prevBtn) prevBtn.disabled = true;
        const nextBtn = this.overlay?.querySelector('#inspector-search-next-btn');
        if (nextBtn) nextBtn.disabled = true;
        const hintEl = this.overlay?.querySelector('#inspector-search-hint');
        if (hintEl) hintEl.classList.add('hidden');
        if (this.confirmBtn) this.confirmBtn.disabled = true;
    }

    async refreshView(options = {}) {
        if (this._refreshing) return;
        this._refreshing = true;
        const { showSteps = false, preserveSteps = false, hideLoading = true } = options;
        this.showLoading(true, !preserveSteps, showSteps);
        try {
            let result = await window.electronAPI.inspector.refreshSession();
            if (!result || !result.success) {
                if (this._sessionParams) {
                    try {
                        await window.electronAPI.inspector.stopSession();
                    } catch (_) {}

                    this._subscribeProgress();
                    const startResult = await window.electronAPI.inspector.startSession(
                        this._sessionParams.deviceName,
                        this._sessionParams.appPackage,
                        this._sessionParams.appActivity,
                        '',
                        this._sessionParams.noReset
                    );
                    this._unsubscribeProgress();
                    if (startResult && startResult.success) {
                        this._advanceLoadingStep(3);
                        result = await window.electronAPI.inspector.refreshSession();
                    } else {
                        throw new Error(startResult?.error || window.i18n?.t('inspector.startFailed') || 'Failed to restart session');
                    }
                } else {
                    throw new Error(result?.error || window.i18n?.t('inspector.refreshFailed') || 'Failed to refresh view');
                }
            }

            if (!result || !result.success) {
                throw new Error(result?.error || window.i18n?.t('inspector.refreshFailed') || 'Failed to refresh view');
            }

            if (result.screenshot) {
                this.renderScreenshot(result.screenshot);
            }

            if (result.elements) {
                this.elementsTree = this.parsePageSource(result.elements);
                this._allElements = this.flattenElements(this.elementsTree);
                this.renderElementTree(this.elementsTree);
                this.renderHighlighterRects();
            }

            this._advanceLoadingStep(4);
        } catch (err) {
            Toast.error(err.message || window.i18n?.t('inspector.refreshFailed') || 'Failed to refresh');
        } finally {
            this._refreshing = false;
            if (hideLoading) {
                this.showLoading(false);
            }
        }
    }

    renderScreenshot(base64Data) {
        const img = new Image();
        img.onload = () => {
            this.screenshotImage = img;
            this._updateCanvasAndHighlighter();

            this.deviceResolution = { width: img.naturalWidth, height: img.naturalHeight };
            this.setupCanvasListeners();
        };
        img.onerror = () => {
            Toast.error(window.i18n?.t('inspector.screenshotFailed') || 'Failed to load screenshot');
        };
        img.src = base64Data.startsWith('data:') ? base64Data : 'data:image/png;base64,' + base64Data;
    }

    _updateCanvasAndHighlighter() {
        if (!this.screenshotImage || !this.canvasContainer || !this.canvas) return;

        const img = this.screenshotImage;
        const padding = 12;
        const containerWidth = this.canvasContainer.clientWidth;
        const containerHeight = this.canvasContainer.clientHeight;
        const contentWidth = containerWidth - padding * 2;
        const contentHeight = containerHeight - padding * 2;

        if (contentWidth <= 0 || contentHeight <= 0) return;

        const scaleByWidth = contentWidth / img.naturalWidth;
        const scaleByHeight = contentHeight / img.naturalHeight;
        const scale = Math.min(scaleByWidth, scaleByHeight);

        const displayWidth = Math.floor(img.naturalWidth * scale);
        const displayHeight = Math.floor(img.naturalHeight * scale);

        // Center position within the container
        const offsetX = Math.floor((containerWidth - displayWidth) / 2);
        const offsetY = Math.floor((containerHeight - displayHeight) / 2);

        this.canvasScale = scale;
        this.canvas.width = displayWidth;
        this.canvas.height = displayHeight;
        this.canvas.style.width = displayWidth + 'px';
        this.canvas.style.height = displayHeight + 'px';
        this.canvas.style.left = offsetX + 'px';
        this.canvas.style.top = offsetY + 'px';

        this._scaleRatio = img.naturalWidth / displayWidth;

        if (this.highlighterContainer) {
            this.highlighterContainer.style.width = displayWidth + 'px';
            this.highlighterContainer.style.height = displayHeight + 'px';
            this.highlighterContainer.style.left = offsetX + 'px';
            this.highlighterContainer.style.top = offsetY + 'px';
        }

        this.redrawCanvas();
        this.renderHighlighterRects();
    }

    setupCanvasListeners() {
        // Canvas only displays screenshot; interaction handled by highlighter overlay divs
    }

    removeCanvasListeners() {
        // No-op: canvas no longer has mouse listeners
    }

    renderElementTree(elements) {
        if (!this.treeContainer) return;
        this.treeContainer.innerHTML = '';

        if (!elements || elements.length === 0) {
            this.treeContainer.innerHTML = `<div class="inspector-tree-empty">${window.i18n?.t('inspector.noElements') || '无元素数据'}</div>`;
            return;
        }

        elements.forEach(element => {
            this.treeContainer.appendChild(this.createTreeNode(element));
        });
    }

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
        if (shortClass) html += `<span class="tree-class-name">${shortClass}</span>`;
        if (textAttr) html += `<span class="tree-text-content"> text="${textAttr}"</span>`;
        if (descAttr && descAttr !== textAttr) html += `<span class="tree-desc-content"> desc="${descAttr}"</span>`;
        label.innerHTML = html;
        label.title = [
            className && `class: ${className}`,
            element.attributes?.['resource-id'] && `resource-id: ${element.attributes['resource-id']}`,
            element.attributes?.text && `text: ${element.attributes.text}`,
            element.attributes?.['content-desc'] && `content-desc: ${element.attributes['content-desc']}`
        ].filter(Boolean).join('\n');

        content.appendChild(toggle);
        content.appendChild(label);
        node.appendChild(content);

        if (hasChildren) {
            const childContainer = document.createElement('div');
            childContainer.className = 'inspector-tree-children hidden';
            element.children.forEach(child => {
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
            this.hoveredElement = element;
            this._updateHighlighterHover();
        });

        node.addEventListener('mouseleave', (e) => {
            e.stopPropagation();
            if (this.hoveredElement === element) {
                this.hoveredElement = null;
                this._updateHighlighterHover();
            }
        });

        return node;
    }

    _expandAncestors(element) {
        const ancestors = [];
        let current = element._parent;
        while (current) {
            ancestors.unshift(current);
            current = current._parent;
        }
        ancestors.forEach(ancestor => {
            const node = this.treeContainer.querySelector(`.inspector-tree-node[data-path="${ancestor.path}"]`);
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
    }

    selectElement(element) {
        this.selectedElement = element;
        this.redrawCanvas();
        this._updateHighlighterSelection();
        this.showLocators(element);
        if (this.confirmBtn) this.confirmBtn.disabled = false;

        this._expandAncestors(element);

        this.treeContainer.querySelectorAll('.inspector-tree-node').forEach(n => {
            n.classList.remove('selected');
        });
        const targetNode = this.treeContainer.querySelector(`.inspector-tree-node[data-path="${element.path}"]`);
        if (targetNode) {
            targetNode.classList.add('selected');
            targetNode.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    highlightTreeNode(element, highlight) {
        const node = this.treeContainer.querySelector(`.inspector-tree-node[data-path="${element.path}"]`);
        if (node) {
            node.classList.toggle('hovered', highlight);
        }
    }

    deselectElement() {
        this.selectedElement = null;
        this.selectedLocator = null;
        this.redrawCanvas();
        this._updateHighlighterSelection();
        if (this.locatorList) {
            this.locatorList.innerHTML = `<div class="inspector-locator-empty" data-i18n="inspector.noLocators">${window.i18n?.t('inspector.noLocators') || '请选择一个元素查看定位方式'}</div>`;
        }
        const dHeaderEl = this.overlay?.querySelector('#inspector-locator-header');
        if (dHeaderEl) dHeaderEl.style.display = 'none';
        this.treeContainer.querySelectorAll('.inspector-tree-node').forEach(n => {
            n.classList.remove('selected');
        });
        if (this.confirmBtn) this.confirmBtn.disabled = true;
    }

    parseBounds(boundsStr) {
        if (!boundsStr) return null;
        const match = boundsStr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
        if (!match) return null;
        return {
            x1: parseInt(match[1]),
            y1: parseInt(match[2]),
            x2: parseInt(match[3]),
            y2: parseInt(match[4])
        };
    }

    parseCoordinates(element) {
        const {bounds, x, y, width, height} = element.attributes || {};
        if (bounds) {
            const boundsArray = bounds.split(/\[|\]|,/).filter(str => str !== '');
            const [x1, y1, x2, y2] = boundsArray.map(val => parseInt(val, 10));
            return {x1, y1, x2, y2};
        } else if (x !== undefined && x !== null) {
            const xInt = parseInt(x, 10);
            const yInt = parseInt(y, 10);
            const widthInt = parseInt(width, 10);
            const heightInt = parseInt(height, 10);
            return {x1: xInt, y1: yInt, x2: xInt + widthInt, y2: yInt + heightInt};
        }
        return {};
    }

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
    }

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
                }
            });
        }

        if (sourceJSON.children) {
            for (const childEl of sourceJSON.children) {
                this._buildElementsWithProps(childEl, elements);
            }
        }
    }

    renderHighlighterRects() {
        if (!this.highlighterContainer) return;
        this.highlighterContainer.innerHTML = '';

        if (!this.elementsTree || !this._scaleRatio) return;

        // Cache elements for coordinate-based lookup
        this._highlighterElements = this._getElements(this.elementsTree);

        // Remove old container listeners and add new ones
        this._removeHighlighterListeners();
        this._addHighlighterListeners();

        for (const elem of this._highlighterElements) {
            if (!elem.properties.width || !elem.properties.height) continue;

            const box = document.createElement('div');
            box.className = 'inspector-highlighter-box';
            if (this.selectedElement && this.selectedElement.path === elem.element.path) {
                box.classList.add('inspector-selected-element');
            }
            box.style.left = elem.properties.left + 'px';
            box.style.top = elem.properties.top + 'px';
            box.style.width = elem.properties.width + 'px';
            box.style.height = elem.properties.height + 'px';
            box.dataset.path = elem.element.path;
            this.highlighterContainer.appendChild(box);
        }
    }

    _addHighlighterListeners() {
        if (!this.highlighterContainer) return;

        this._highlighterClickHandler = (e) => {
            const elem = this._findElementAtPoint(e);
            if (elem) {
                if (this.selectedElement && this.selectedElement.path === elem.element.path) {
                    this.deselectElement();
                } else {
                    this.selectElement(elem.element);
                }
            }
        };

        this._highlighterMoveHandler = (e) => {
            const elem = this._findElementAtPoint(e);
            const prevHovered = this.hoveredElement;
            if (elem) {
                this.hoveredElement = elem.element;
                this._updateHighlighterHover(elem.element.path);
                if (prevHovered !== elem.element) {
                    if (prevHovered) this.highlightTreeNode(prevHovered, false);
                    this.highlightTreeNode(elem.element, true);
                }
            } else {
                this.hoveredElement = null;
                this._updateHighlighterHover(null);
                if (prevHovered) this.highlightTreeNode(prevHovered, false);
            }
        };

        this._highlighterLeaveHandler = () => {
            if (this.hoveredElement) {
                this.highlightTreeNode(this.hoveredElement, false);
                this.hoveredElement = null;
            }
            this._updateHighlighterHover(null);
        };

        this.highlighterContainer.addEventListener('click', this._highlighterClickHandler);
        this.highlighterContainer.addEventListener('mousemove', this._highlighterMoveHandler);
        this.highlighterContainer.addEventListener('mouseleave', this._highlighterLeaveHandler);
    }

    _removeHighlighterListeners() {
        if (!this.highlighterContainer) return;
        if (this._highlighterClickHandler) {
            this.highlighterContainer.removeEventListener('click', this._highlighterClickHandler);
            this._highlighterClickHandler = null;
        }
        if (this._highlighterMoveHandler) {
            this.highlighterContainer.removeEventListener('mousemove', this._highlighterMoveHandler);
            this._highlighterMoveHandler = null;
        }
        if (this._highlighterLeaveHandler) {
            this.highlighterContainer.removeEventListener('mouseleave', this._highlighterLeaveHandler);
            this._highlighterLeaveHandler = null;
        }
    }

    _findElementAtPoint(e) {
        if (!this._highlighterElements || !this.highlighterContainer) return null;

        const containerRect = this.highlighterContainer.getBoundingClientRect();
        const x = e.clientX - containerRect.left;
        const y = e.clientY - containerRect.top;

        // Find the deepest (last in tree order = most specific) element containing the point
        // Iterate in reverse to find the most specific element first
        let bestMatch = null;
        let bestArea = Infinity;

        for (let i = this._highlighterElements.length - 1; i >= 0; i--) {
            const elem = this._highlighterElements[i];
            const {left, top, width, height} = elem.properties;
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
    }

    _updateHighlighterHover(hoveredPath) {
        if (!this.highlighterContainer) return;
        this.highlighterContainer.querySelectorAll('.inspector-highlighter-box').forEach(box => {
            if (hoveredPath && box.dataset.path === hoveredPath) {
                box.style.background = 'rgba(76, 175, 80, 0.2)';
                box.style.border = '2px solid rgba(76, 175, 80, 0.6)';
            } else if (!box.classList.contains('inspector-selected-element')) {
                box.style.background = '';
                box.style.border = '';
            }
        });
    }

    _updateHighlighterSelection() {
        if (!this.highlighterContainer) return;
        this.highlighterContainer.querySelectorAll('.inspector-selected-element').forEach(el => {
            el.classList.remove('inspector-selected-element');
        });
        if (this.selectedElement) {
            const escapedPath = CSS.escape(this.selectedElement.path);
            const box = this.highlighterContainer.querySelector(`[data-path="${escapedPath}"]`);
            if (box) box.classList.add('inspector-selected-element');
        }
    }

    _updateHighlighterHover() {
        // Hover is handled directly on overlay divs; this method is for tree-node hover sync
    }

    _initResizeObserver() {
        if (!this.canvasContainer) return;
        this._resizeObserver = new ResizeObserver(() => {
            this._updateCanvasAndHighlighter();
        });
        this._resizeObserver.observe(this.canvasContainer);
    }

    _destroyResizeObserver() {
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }
    }

    redrawCanvas() {
        if (!this.screenshotImage || !this.canvas) return;

        const ctx = this.canvas.getContext('2d');
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.drawImage(this.screenshotImage, 0, 0, this.canvas.width, this.canvas.height);
        // Highlight drawing is now handled by overlay divs
    }

    async showLocators(element) {
        if (!this.locatorList) return;

        this.selectedLocator = null;

        try {
            const result = await window.electronAPI.inspector.findElementLocators(element.path);
            if (!result || !result.success || !result.locators || result.locators.length === 0) {
                this.locatorList.innerHTML = `<div class="inspector-locator-empty">${window.i18n?.t('inspector.noLocators') || '请选择一个元素查看定位方式'}</div>`;
                const header = this.overlay?.querySelector('#inspector-locator-header');
                if (header) header.style.display = 'none';
                return;
            }

            this.locatorList.innerHTML = '';

            const header = this.overlay?.querySelector('#inspector-locator-header');
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
                    this.selectedLocator = locator;
                }
                radio.addEventListener('change', () => {
                    this.selectedLocator = locator;
                });

                const typeSpan = document.createElement('span');
                typeSpan.className = 'inspector-locator-type';
                const typeDisplayMap = { 'click': 'tap_position' };
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
                    this.selectedLocator = locator;
                });

                this.locatorList.appendChild(item);
            });
        } catch (err) {
            this.locatorList.innerHTML = `<div class="inspector-locator-empty">${window.i18n?.t('inspector.noLocators') || '请选择一个元素查看定位方式'}</div>`;
        }
    }

    confirmSelection() {
        if (!this.selectedLocator) {
            Toast.warning(window.i18n?.t('inspector.selectLocatorFirst') || '请先选择一个定位方式');
            return;
        }

        const event = new CustomEvent('inspector-element-selected', {
            detail: {
                locatorType: this.selectedLocator.type,
                locatorValue: this.selectedLocator.value
            }
        });
        document.dispatchEvent(event);
    }

    searchTree(keyword) {
        if (!this.treeContainer) return;

        const hintEl = this.overlay?.querySelector('#inspector-search-hint');
        const countEl = this.overlay?.querySelector('#inspector-search-count');
        const prevBtn = this.overlay?.querySelector('#inspector-search-prev-btn');
        const nextBtn = this.overlay?.querySelector('#inspector-search-next-btn');

        const nodes = this.treeContainer.querySelectorAll('.inspector-tree-node');
        if (!keyword || keyword.trim() === '') {
            nodes.forEach(n => {
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

        this._allElements.forEach(el => {
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

        nodes.forEach(n => {
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
                hintEl.textContent = window.i18n?.t('inspector.searchNoResult') || '未找到匹配的元素';
                hintEl.classList.remove('hidden');
            }
            if (countEl) countEl.textContent = '0/0';
            if (prevBtn) prevBtn.disabled = true;
            if (nextBtn) nextBtn.disabled = true;
        }
    }

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
    }

    _updateSearchNav() {
        const countEl = this.overlay?.querySelector('#inspector-search-count');
        const prevBtn = this.overlay?.querySelector('#inspector-search-prev-btn');
        const nextBtn = this.overlay?.querySelector('#inspector-search-next-btn');

        const total = this._searchResults?.length || 0;
        const current = this._searchResultIndex + 1;

        if (countEl) {
            countEl.textContent = total > 0 ? `${current}/${total}` : '0/0';
        }
        if (prevBtn) prevBtn.disabled = total <= 1;
        if (nextBtn) nextBtn.disabled = total <= 1;
    }

    toggleNode(nodeElement) {
        const childContainer = nodeElement.querySelector(':scope > .inspector-tree-children');
        if (!childContainer) return;

        const toggle = nodeElement.querySelector(':scope > .inspector-tree-node-content > .inspector-tree-toggle');
        const isHidden = childContainer.classList.contains('hidden');
        childContainer.classList.toggle('hidden', !isHidden);
        if (toggle) {
            toggle.textContent = isHidden ? '▼' : '▶';
        }
    }

    showLoading(show, resetSteps = true, showSteps = true) {
        if (!this.loadingEl) return;

        if (show) {
            this.loadingEl.classList.remove('hidden');
            const stepsEl = this.loadingEl.querySelector('.inspector-loading-steps');
            if (stepsEl) {
                stepsEl.style.display = showSteps ? '' : 'none';
            }
            if (resetSteps) {
                this._resetLoadingSteps();
            }
            if (this.refreshBtn) this.refreshBtn.disabled = true;
        } else {
            this._stopLoadingAnimation();
            this.loadingEl.classList.add('hidden');
            const stepsEl = this.loadingEl.querySelector('.inspector-loading-steps');
            if (stepsEl) {
                stepsEl.style.display = '';
            }
            if (this.refreshBtn) this.refreshBtn.disabled = false;
        }
    }

    _resetLoadingSteps() {
        this._stepGeneration++;
        this._loadingStepIndex = 0;
        this._stepQueue = [];
        this._stepProcessing = false;
        this._lastStepTime = 0;
        const steps = this.loadingEl.querySelectorAll('.inspector-loading-step');
        if (steps.length === 0) return;
        steps.forEach(s => {
            s.classList.remove('active', 'done');
        });
        steps[0].classList.add('active');
        this._lastStepTime = Date.now();
    }

    _advanceLoadingStep(targetStep) {
        const pendingTarget = this._stepQueue.length > 0 ? this._stepQueue[this._stepQueue.length - 1] : this._loadingStepIndex;
        if (targetStep <= pendingTarget) return;
        for (let i = pendingTarget + 1; i <= targetStep; i++) {
            this._stepQueue.push(i);
        }
        this._processStepQueue();
    }

    async _processStepQueue() {
        if (this._stepProcessing) return;
        this._stepProcessing = true;
        const gen = this._stepGeneration;

        while (this._stepQueue.length > 0) {
            if (this._stepGeneration !== gen) { this._stepProcessing = false; return; }
            const nextStep = this._stepQueue.shift();
            const elapsed = Date.now() - this._lastStepTime;
            const minDelay = 600;

            if (elapsed < minDelay) {
                await new Promise(resolve => setTimeout(resolve, minDelay - elapsed));
            }

            if (this._stepGeneration !== gen) { this._stepProcessing = false; return; }

            const steps = this.loadingEl?.querySelectorAll('.inspector-loading-step');
            if (!steps || steps.length === 0) break;

            if (this._loadingStepIndex < steps.length) {
                steps[this._loadingStepIndex].classList.remove('active');
                steps[this._loadingStepIndex].classList.add('done');
            }

            if (nextStep < steps.length) {
                steps[nextStep].classList.add('active');
            } else {
                for (let i = this._loadingStepIndex + 1; i < steps.length; i++) {
                    steps[i].classList.remove('active');
                    steps[i].classList.add('done');
                }
            }

            this._loadingStepIndex = nextStep;
            this._lastStepTime = Date.now();
        }

        this._stepProcessing = false;
    }

    _subscribeProgress() {
        this._unsubscribeProgress();
        if (window.electronAPI?.inspector?.onProgress) {
            this._progressUnsubscribe = window.electronAPI.inspector.onProgress((stage) => {
                const stageMap = {
                    'appium-starting': 0,
                    'appium-started': 1,
                    'session-creating': 2,
                    'session-created': 3
                };
                const stepIndex = stageMap[stage];
                if (stepIndex !== undefined) {
                    this._advanceLoadingStep(stepIndex);
                }
            });
        }
    }

    _unsubscribeProgress() {
        if (this._progressUnsubscribe) {
            this._progressUnsubscribe();
            this._progressUnsubscribe = null;
        }
    }

    async _waitForStepQueue() {
        while (this._stepProcessing) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    _startLoadingAnimation() {
        this._resetLoadingSteps();
    }

    _stopLoadingAnimation() {
        if (this._loadingTimer) {
            clearInterval(this._loadingTimer);
            this._loadingTimer = null;
        }
    }

    _addEscListener() {
        this._escHandler = (e) => {
            if (e.key === 'Escape') {
                this.close();
            }
        };
        document.addEventListener('keydown', this._escHandler);
    }

    _removeEscListener() {
        if (this._escHandler) {
            document.removeEventListener('keydown', this._escHandler);
            this._escHandler = null;
        }
    }

    parsePageSource(pageSource) {
        if (!pageSource) return [];
        if (typeof pageSource === 'string') {
            try {
                pageSource = JSON.parse(pageSource);
            } catch (e) {
                return [];
            }
        }
        if (Array.isArray(pageSource)) return this.assignPaths(pageSource);
        if (pageSource.children) return this.assignPaths(pageSource.children);
        return [];
    }

    assignPaths(elements, parentPath = '') {
        if (!elements || !Array.isArray(elements)) return [];
        return elements.map((el, index) => {
            if (el.path === undefined || el.path === null) {
                el.path = parentPath ? `${parentPath}.${index}` : `${index}`;
            }
            if (el.children && el.children.length > 0) {
                el.children.forEach(child => {
                    child._parent = el;
                });
                this.assignPaths(el.children, el.path);
            }
            return el;
        });
    }

    flattenElements(elements) {
        if (!elements) return [];
        let result = [];
        elements.forEach(el => {
            result.push(el);
            if (el.children && el.children.length > 0) {
                result = result.concat(this.flattenElements(el.children));
            }
        });
        return result;
    }
}
