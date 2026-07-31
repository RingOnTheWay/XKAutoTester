// Steps Main mixin for TestCaseView
// Extracted from stepsMixin.js during sub-refactor
// Provides: renderSteps, showStepsEmpty/hideStepsEmpty, generateStepCard, renderStepConfig dispatcher

import { DeviceCascadeSelect } from '../../../components/device-cascade-select.js';

export const stepsMainMixin = {
    // ─── Steps ─────────────────────────────────────────────────────

    renderSteps(steps) {
        const container = this.els.stepsList;
        if (!container) return;

        // Cleanup cascade selects and moved options (only test-case's own options)
        if (DeviceCascadeSelect && DeviceCascadeSelect.destroyAll) {
            DeviceCascadeSelect.destroyAll();
        }
        document.querySelectorAll('.custom-select__options[data-moved]').forEach(opt => {
            // 只移除 test-case 的 options（ID 以 tc- 开头），避免误删其他 tab 的 options
            if (opt.id && opt.id.startsWith('tc-')) {
                opt.remove();
            }
        });

        container.innerHTML = '';

        const sorted = [...steps].sort((a, b) => a.order - b.order);
        sorted.forEach((step, index) => {
            // 注入关联数据供步骤卡片渲染使用
            step._app = this._currentApp || null;
            step._bleDevices = this._bleDevices || [];
            step._allSteps = sorted;
            const card = this.generateStepCard(step, index + 1);
            container.appendChild(card);
        });

        return { sorted };
    },

    showStepsEmpty() {
        const emptyDiv = this.els.stepsEmpty;
        const listDiv = this.els.stepsList;
        const bottomBtn = this.els.addStepBottomBtn;
        if (emptyDiv) emptyDiv.classList.remove('hidden');
        if (listDiv) listDiv.classList.add('hidden');
        if (bottomBtn) bottomBtn.classList.add('hidden');
    },

    hideStepsEmpty() {
        const emptyDiv = this.els.stepsEmpty;
        const listDiv = this.els.stepsList;
        const bottomBtn = this.els.addStepBottomBtn;
        if (emptyDiv) emptyDiv.classList.add('hidden');
        if (listDiv) listDiv.classList.remove('hidden');
        if (bottomBtn) bottomBtn.classList.remove('hidden');
    },

    generateStepCard(step, order) {
        const card = document.createElement('div');
        card.className = 'tc-step-card';
        card.setAttribute('data-step-id', step.id);
        card.setAttribute('data-step-order', step.order);

        card.innerHTML = `
            <div class="tc-step-drag-handle tc-step-drag-handle-top" data-drag-handle="true">
                <button type="button" class="tc-step-move-btn tc-step-move-up-btn" data-step-id="${step.id}" data-move="up" title="${window.i18n.t('common.moveUp')}">
                    ${this.getIconHtml('arrow_upward')}
                </button>
                <div class="tc-drag-grip" data-drag-grip="true">
                    <span></span><span></span><span></span>
                </div>
                <button type="button" class="tc-step-move-btn tc-step-move-down-btn" data-step-id="${step.id}" data-move="down" title="${window.i18n.t('common.moveDown')}">
                    ${this.getIconHtml('arrow_downward')}
                </button>
            </div>
            <div class="tc-step-header">
                <div class="tc-step-number">${order}</div>
                <div class="tc-step-name">
                    <input type="text" class="glass-input tc-step-name-input"
                           value="${step.name}" data-step-id="${step.id}">
                </div>
                <div class="tc-step-actions">
                    <button type="button" class="tc-step-btn tc-step-copy-btn" data-step-id="${step.id}" title="${window.i18n.t('common.copy')}">
                        ${this.getIconHtml('content_copy')}
                    </button>
                    <button type="button" class="tc-step-btn tc-step-delete-btn" data-step-id="${step.id}" title="${window.i18n.t('common.delete')}">
                        ${this.getIconHtml('delete')}
                    </button>
                </div>
            </div>
            <div class="tc-step-body">
                ${this.renderStepConfig(step)}
            </div>
            <div class="tc-step-drag-handle tc-step-drag-handle-bottom" data-drag-handle="true">
                <button type="button" class="tc-step-move-btn tc-step-move-up-btn" data-step-id="${step.id}" data-move="up" title="${window.i18n.t('common.moveUp')}">
                    ${this.getIconHtml('arrow_upward')}
                </button>
                <div class="tc-drag-grip" data-drag-grip="true">
                    <span></span><span></span><span></span>
                </div>
                <button type="button" class="tc-step-move-btn tc-step-move-down-btn" data-step-id="${step.id}" data-move="down" title="${window.i18n.t('common.moveDown')}">
                    ${this.getIconHtml('arrow_downward')}
                </button>
            </div>
        `;

        return card;
    },

    renderStepConfig(step) {
        let configHtml = `
            <div class="tc-step-type-selector">
                <label>${window.i18n.t('testCase.stepType')}</label>
                <div class="tc-type-tabs">
                    <button type="button" class="tc-type-tab ${step.type === 'element' ? 'active' : ''}" data-type="element">
                        ${this.getIconHtml('touch_app')}
                        <span>${window.i18n.t('testCase.elementOperation')}</span>
                    </button>
                    <button type="button" class="tc-type-tab ${step.type === 'page' ? 'active' : ''}" data-type="page">
                        ${this.getIconHtml('pageview')}
                        <span>${window.i18n.t('testCase.pageOperation')}</span>
                    </button>
                    <button type="button" class="tc-type-tab ${step.type === 'system' ? 'active' : ''}" data-type="system">
                        ${this.getIconHtml('smartphone')}
                        <span>${window.i18n.t('testCase.systemOperation')}</span>
                    </button>
                    <button type="button" class="tc-type-tab ${step.type === 'ble' ? 'active' : ''}" data-type="ble">
                        ${this.getIconHtml('bluetooth')}
                        <span>${window.i18n.t('testCase.bleOperation')}</span>
                    </button>
                </div>
            </div>
        `;

        switch (step.type) {
            case 'element':
                configHtml += this.renderElementConfig(step);
                break;
            case 'ble':
                configHtml += this.renderBleConfig(step);
                break;
            case 'page':
                configHtml += this.renderPageConfig(step);
                break;
            case 'system':
                configHtml += this.renderSystemConfig(step);
                break;
        }

        return configHtml;
    },
};
