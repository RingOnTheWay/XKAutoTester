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
        this._boundCanvasMouseMove = this.handleCanvasMouseMove.bind(this);
        this._boundCanvasClick = this.handleCanvasClick.bind(this);
        this._boundCanvasMouseLeave = this.handleCanvasMouseLeave.bind(this);
        this._allElements = [];
        this._loadingStepIndex = 0;
        this._loadingTimer = null;
        this._sessionParams = null;
        this._progressUnsubscribe = null;
        this.init();
    }

    init() {
        this.overlay = document.getElementById('inspector-modal-overlay');
        if (!this.overlay) return;

        this.canvas = document.getElementById('inspector-canvas');
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
        this.selectedElement = null;
        this.hoveredElement = null;
        this.selectedLocator = null;
        this.canvasScale = 1;
        this.deviceResolution = null;

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
                        this._sessionParams.appActivity
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
            }

            this._advanceLoadingStep(4);
        } catch (err) {
            Toast.error(err.message || window.i18n?.t('inspector.refreshFailed') || 'Failed to refresh');
        } finally {
            if (hideLoading) {
                this.showLoading(false);
            }
        }
    }

    renderScreenshot(base64Data) {
        const img = new Image();
        img.onload = () => {
            this.screenshotImage = img;

            const containerWidth = this.canvasContainer.clientWidth;
            const containerHeight = this.canvasContainer.clientHeight;

            this.canvasScale = containerWidth / img.naturalWidth;
            const displayWidth = containerWidth;
            const displayHeight = img.naturalHeight * this.canvasScale;

            this.canvas.width = displayWidth;
            this.canvas.height = displayHeight;
            this.canvas.style.width = displayWidth + 'px';
            this.canvas.style.height = displayHeight + 'px';

            this.redrawCanvas();

            this.deviceResolution = { width: img.naturalWidth, height: img.naturalHeight };
            this.setupCanvasListeners();
        };
        img.onerror = () => {
            Toast.error(window.i18n?.t('inspector.screenshotFailed') || 'Failed to load screenshot');
        };
        img.src = base64Data.startsWith('data:') ? base64Data : 'data:image/png;base64,' + base64Data;
    }

    setupCanvasListeners() {
        this.removeCanvasListeners();
        this.canvas.addEventListener('mousemove', this._boundCanvasMouseMove);
        this.canvas.addEventListener('click', this._boundCanvasClick);
        this.canvas.addEventListener('mouseleave', this._boundCanvasMouseLeave);
    }

    removeCanvasListeners() {
        if (!this.canvas) return;
        this.canvas.removeEventListener('mousemove', this._boundCanvasMouseMove);
        this.canvas.removeEventListener('click', this._boundCanvasClick);
        this.canvas.removeEventListener('mouseleave', this._boundCanvasMouseLeave);
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
            this.redrawCanvas();
        });

        node.addEventListener('mouseleave', (e) => {
            e.stopPropagation();
            if (this.hoveredElement === element) {
                this.hoveredElement = null;
                this.redrawCanvas();
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

    handleCanvasMouseMove(event) {
        const coords = this.getCanvasCoords(event);
        if (!coords) return;

        const element = this.findElementAtPoint(coords.x, coords.y, this.elementsTree);
        if (element !== this.hoveredElement) {
            this.hoveredElement = element;
            this.redrawCanvas();

            this.treeContainer.querySelectorAll('.inspector-tree-node.hovered').forEach(n => n.classList.remove('hovered'));
            if (element) {
                this.highlightTreeNode(element, true);
            }
        }
    }

    handleCanvasClick(event) {
        const coords = this.getCanvasCoords(event);
        if (!coords) return;

        const element = this.findElementAtPoint(coords.x, coords.y, this.elementsTree);
        if (element === this.selectedElement) {
            this.deselectElement();
        } else if (element) {
            this.selectElement(element);
        }
    }

    deselectElement() {
        this.selectedElement = null;
        this.selectedLocator = null;
        this.redrawCanvas();
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

    handleCanvasMouseLeave() {
        if (this.hoveredElement) {
            this.hoveredElement = null;
            this.redrawCanvas();
            this.treeContainer.querySelectorAll('.inspector-tree-node.hovered').forEach(n => n.classList.remove('hovered'));
        }
    }

    getCanvasCoords(event) {
        if (!this.canvas) return null;
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;
        const deviceX = mouseX / this.canvasScale;
        const deviceY = mouseY / this.canvasScale;
        return { x: deviceX, y: deviceY };
    }

    findElementAtPoint(x, y, elements) {
        if (!elements || elements.length === 0) return null;

        const matches = [];
        this._collectElementsAtPoint(x, y, elements, matches);

        if (matches.length === 0) return null;

        matches.sort((a, b) => {
            const areaA = (a.bounds.x2 - a.bounds.x1) * (a.bounds.y2 - a.bounds.y1);
            const areaB = (b.bounds.x2 - b.bounds.x1) * (b.bounds.y2 - b.bounds.y1);
            return areaA - areaB;
        });

        return matches[0].element;
    }

    _collectElementsAtPoint(x, y, elements, matches) {
        if (!elements || elements.length === 0) return;

        for (const element of elements) {
            const bounds = this.parseBounds(element.attributes?.bounds);
            if (!bounds) continue;

            if (x >= bounds.x1 && x <= bounds.x2 && y >= bounds.y1 && y <= bounds.y2) {
                matches.push({ element, bounds });
                this._collectElementsAtPoint(x, y, element.children, matches);
            }
        }
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

    redrawCanvas() {
        if (!this.screenshotImage || !this.canvas) return;

        const ctx = this.canvas.getContext('2d');
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.drawImage(this.screenshotImage, 0, 0, this.canvas.width, this.canvas.height);

        if (this.hoveredElement) {
            this.drawHighlight(this.hoveredElement, 'hover');
        }
        if (this.selectedElement) {
            this.drawHighlight(this.selectedElement, 'selected');
        }
    }

    drawHighlight(element, type) {
        if (!this.canvas) return;
        const bounds = this.parseBounds(element.attributes?.bounds);
        if (!bounds) return;

        const ctx = this.canvas.getContext('2d');
        const x1 = bounds.x1 * this.canvasScale;
        const y1 = bounds.y1 * this.canvasScale;
        const x2 = bounds.x2 * this.canvasScale;
        const y2 = bounds.y2 * this.canvasScale;
        const width = x2 - x1;
        const height = y2 - y1;

        if (type === 'hover') {
            ctx.fillStyle = 'rgba(76, 175, 80, 0.25)';
            ctx.fillRect(x1, y1, width, height);
            ctx.strokeStyle = 'rgba(76, 175, 80, 0.8)';
            ctx.lineWidth = 2;
            ctx.strokeRect(x1, y1, width, height);
        } else if (type === 'selected') {
            ctx.strokeStyle = '#4CAF50';
            ctx.lineWidth = 3;
            ctx.strokeRect(x1, y1, width, height);
            ctx.fillStyle = 'rgba(76, 175, 80, 0.1)';
            ctx.fillRect(x1, y1, width, height);
        }
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

        while (this._stepQueue.length > 0) {
            const nextStep = this._stepQueue.shift();
            const elapsed = Date.now() - this._lastStepTime;
            const minDelay = 600;

            if (elapsed < minDelay) {
                await new Promise(resolve => setTimeout(resolve, minDelay - elapsed));
            }

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
