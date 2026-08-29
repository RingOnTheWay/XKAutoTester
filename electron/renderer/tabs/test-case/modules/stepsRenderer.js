// stepsRenderer — TestCaseView 步骤渲染域 mixin (R24 P2-10 拆分)
// 从 tabs/test-case/view.js 拆出: renderSteps → renderPageConfig 约 780 行。
// 保持方法体 / this 引用不变 (this 指向 TestCaseView 实例), 由 view.js 在类后
// Object.assign 到 TestCaseView.prototype。常量随拆分搬入。
import { DeviceCascadeSelect } from '../../../components/device-cascade-select.js';

// P3-13: 魔法数字命名常量 (原 view.js 顶部, 仅本域使用)
const DEFAULT_SWIPE_DURATION_MS = 500; // 滑动默认时长
const SWIPE_DURATION_MIN_MS = 100; // 滑动时长下限
const SWIPE_DURATION_STEP_MS = 100; // 滑动时长步进
const RANDOM_PRECISION_MAX = 5; // 随机数最大小数位

export const stepsRenderer = {
  renderSteps(steps) {
    const container = this.els.stepsList;
    if (!container) return;

    // Cleanup cascade selects and moved options (only test-case's own options)
    if (DeviceCascadeSelect && DeviceCascadeSelect.destroyAll) {
      DeviceCascadeSelect.destroyAll();
    }
    document.querySelectorAll('.custom-select__options[data-moved]').forEach((opt) => {
      // 只移除 test-case 的 options（ID 以 tc- 开头），避免误删其他 tab 的 options
      if (opt.id && opt.id.startsWith('tc-')) {
        opt.remove();
      }
    });

    container.innerHTML = '';

    const sorted = [...steps].sort((a, b) => a.order - b.order);
    sorted.forEach((step, index) => {
      // P2-4: 注入统一收敛到 injectStepContext
      this.injectStepContext(step, sorted);
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
                           value="${this.escapeHtml(step.name)}" data-step-id="${step.id}">
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

  // ═════════════════════════════════════════════════════════════════
  // ─── Steps Element Config (原 stepsElementMixin) ──────────────────
  // ═════════════════════════════════════════════════════════════════
  renderElementConfig(step) {
    const config = step.config || {};
    const app = step._app; // Controller injects app reference
    const multiSelect = config.multiSelect || false;
    const clickCount = config.multiClickCount || 1;
    const selectedElements = config.selectedElements || [];

    // Page options
    let pageOptions = [
      {
        value: '',
        label: window.i18n.t('testCase.selectPage'),
        selected: !config.pageId,
      },
    ];
    if (app && app.pages) {
      app.pages.forEach((page) => {
        pageOptions.push({
          value: page.id,
          label: page.name,
          selected: config.pageId === page.id,
        });
      });
    }

    // Element options
    let elementOptions = [
      {
        value: '',
        label: window.i18n.t('testCase.selectElement'),
        selected: true,
      },
    ];
    if (config.pageId && app) {
      const page = app.pages?.find((p) => p.id === config.pageId);
      if (page && page.elements) {
        elementOptions = [
          {
            value: '',
            label: window.i18n.t('testCase.selectElement'),
            selected: !config.elementId,
          },
        ];
        page.elements.forEach((element) => {
          elementOptions.push({
            value: element.id,
            label: element.name,
            selected: config.elementId === element.id,
          });
        });
      }
    }

    // Operation options
    const operationOptions = this.getOperationOptionsForLocator(config.locator, config.operation);

    // Multi-element list
    let multiElementsHtml = '';
    if (multiSelect && selectedElements.length > 0) {
      selectedElements.forEach((elemConfig, index) => {
        const elemId = typeof elemConfig === 'string' ? elemConfig : elemConfig.elementId;
        const elemOperation = typeof elemConfig === 'object' ? elemConfig.operation || 'click' : 'click';
        const elemOperationValue = typeof elemConfig === 'object' ? elemConfig.operationValue || {} : {};

        const elemOptions = this.getElementOptionsForPage(config.pageId, elemId, app);
        const elemLocatorType = this._getElementLocatorType(config.pageId, elemId, app);
        const elemOperationOptions = this.getOperationOptionsForLocator(elemLocatorType, elemOperation);

        multiElementsHtml += `
                    <div class="tc-multi-element-item" data-index="${index}" data-step-id="${step.id}">
                        <div class="tc-multi-element-header">
                            <span class="tc-multi-element-number">${index + 1}</span>
                            ${this.generateCustomSelect('tc-multi-element-select', elemOptions, window.i18n.t('testCase.selectElement'), step.id, index)}
                            <button type="button" class="tc-multi-element-remove-btn" data-step-id="${step.id}" data-index="${index}">
                                ${this.getIconHtml('close')}
                            </button>
                        </div>
                        <div class="tc-multi-element-body">
                            <div class="form-group">
                                <label>${window.i18n.t('testCase.operationType')}</label>
                                ${this.generateCustomSelect('tc-multi-operation-select', elemOperationOptions, window.i18n.t('testCase.selectOperation'), step.id, index)}
                            </div>
                            <div class="form-group tc-multi-operation-value-group" data-step-id="${step.id}" data-index="${index}">
                                ${this.renderMultiOperationValue(step, index, elemOperation, elemOperationValue)}
                            </div>
                        </div>
                    </div>
                `;
      });
    }

    return `
            <div class="tc-step-config tc-element-config">
                <div class="form-row">
                    <div class="form-group">
                        <label>${window.i18n.t('testCase.pageSelect')}</label>
                        ${this.generateCustomSelect('tc-page-select', pageOptions, window.i18n.t('testCase.selectPage'), step.id)}
                    </div>
                    <div class="form-group tc-element-select-group" data-step-id="${step.id}">
                        <div class="tc-element-select-header">
                            <label>${window.i18n.t('testCase.elementSelect')}</label>
                        </div>
                        <label class="tc-multi-select-toggle">
                            <input type="checkbox" class="tc-multi-select-checkbox" data-step-id="${step.id}" ${multiSelect ? 'checked' : ''}>
                            <span>${window.i18n.t('testCase.elementMulti')}</span>
                        </label>
                        <div class="tc-single-element-select ${multiSelect ? 'hidden' : ''}">
                            ${this.generateCustomSelect('tc-element-select', elementOptions, window.i18n.t('testCase.selectElement'), step.id)}
                        </div>
                        <div class="tc-multi-element-config ${multiSelect ? '' : 'hidden'}">
                            <div class="tc-multi-element-count-row">
                                <span class="tc-multi-element-count-label">${window.i18n.t('testCase.clickCountLabel')}</span>
                                <input type="number" class="glass-input tc-multi-click-count" data-step-id="${step.id}"
                                       value="${clickCount}" min="1" max="${selectedElements.length || 1}">
                                <span class="tc-multi-element-hint">${window.i18n.t('testCase.randomSelectFromElements', { count: selectedElements.length || 0 })}</span>
                            </div>
                            <div class="tc-multi-elements-list" data-step-id="${step.id}">
                                ${multiElementsHtml}
                            </div>
                            <button type="button" class="tc-add-multi-element-btn" data-step-id="${step.id}">
                                ${this.getIconHtml('add')}
                                <span>${window.i18n.t('testCase.addElement')}</span>
                            </button>
                        </div>
                    </div>
                </div>
                <div class="form-row tc-single-operation-row ${multiSelect ? 'hidden' : ''}">
                    <div class="form-group">
                        <label>${window.i18n.t('testCase.operationType')}</label>
                        ${this.generateCustomSelect('tc-operation-select', operationOptions, window.i18n.t('testCase.selectOperation'), step.id)}
                    </div>
                    <div class="form-group tc-operation-value-group" data-step-id="${step.id}">
                        ${this.renderOperationValue(step)}
                    </div>
                </div>
            </div>
        `;
  },
  renderMultiOperationValue(step, index, operation, operationValue) {
    switch (operation) {
      case 'click':
        const clickCount = operationValue.clickCount || 1;
        return `
                    <label>${window.i18n.t('testCase.clickCount')}</label>
                    <input type="number" class="glass-input tc-multi-click-count-input" data-step-id="${step.id}" data-index="${index}"
                           value="${clickCount}" min="1" max="10">
                `;

      case 'sendText':
        return this.renderSendTextConfig(step, index, operationValue);

      case 'swipeUp':
      case 'swipeDown':
        // P3-13: 命名常量 (原魔法数字 500/100)
        const swipeDuration = operationValue.swipeDuration || DEFAULT_SWIPE_DURATION_MS;
        return `
                    <label>${window.i18n.t('testCase.swipeDuration')}</label>
                    <input type="number" class="glass-input tc-multi-swipe-duration" data-step-id="${step.id}" data-index="${index}"
                           value="${swipeDuration}" min="${SWIPE_DURATION_MIN_MS}" step="${SWIPE_DURATION_STEP_MS}">
                `;

      default:
        return '';
    }
  },

  // ═════════════════════════════════════════════════════════════════
  // ─── Steps Operation Value (原 stepsOperationMixin) ───────────────
  // ═════════════════════════════════════════════════════════════════
  renderOperationValue(step) {
    const config = step.config || {};
    const operation = config.operation || 'click';

    switch (operation) {
      case 'click':
        const clickCount = config.operationValue?.clickCount || 1;
        return `
                    <label>${window.i18n.t('testCase.clickCount')}</label>
                    <input type="number" class="glass-input tc-click-count" data-step-id="${step.id}"
                           value="${clickCount}" min="1" max="10">
                `;

      case 'sendText':
        return this.renderSendTextConfig(step);

      case 'swipeUp':
      case 'swipeDown':
        const duration = config.operationValue?.swipeDuration || 500;
        return `
                    <label>${window.i18n.t('testCase.swipeDuration')}</label>
                    <input type="number" class="glass-input tc-swipe-duration" data-step-id="${step.id}"
                           value="${duration}" min="100" step="100">
                `;

      default:
        return '';
    }
  },
  renderSendTextConfig(step, index = -1, operationValue = null) {
    const isMulti = index >= 0;
    const opValue = isMulti ? operationValue || {} : step.config?.operationValue || {};
    const inputType = opValue.inputType || 'custom';
    const prefix = isMulti ? 'tc-multi' : 'tc';
    const dataIndexAttr = isMulti ? ` data-index="${index}"` : '';

    const inputTypeOptions = [
      {
        value: 'custom',
        label: window.i18n.t('testCase.bleCustomData'),
        selected: inputType === 'custom',
      },
      {
        value: 'random',
        label: window.i18n.t('testCase.inputRandom'),
        selected: inputType === 'random',
      },
      {
        value: 'faker',
        label: window.i18n.t('testCase.inputFaker'),
        selected: inputType === 'faker',
      },
    ];

    return `
            <label>${window.i18n.t('testCase.inputContent')}</label>
            <div class="tc-sendtext-config">
                <div class="tc-input-type-selector">
                    ${this.generateCustomSelect(`${prefix}-input-type-select`, inputTypeOptions, window.i18n.t('testCase.inputType'), step.id, index)}
                </div>
                <div class="tc-input-value-container" data-step-id="${step.id}"${dataIndexAttr}>
                    ${this.renderInputValueArea(step, inputType, index, opValue)}
                </div>
            </div>
        `;
  },
  renderInputValueArea(step, inputType, index = -1, operationValue = null) {
    const isMulti = index >= 0;
    const opValue = isMulti ? operationValue || {} : step.config?.operationValue || {};
    const prefix = isMulti ? 'tc-multi' : 'tc';
    const dataIndexAttr = isMulti ? ` data-index="${index}"` : '';

    switch (inputType) {
      case 'custom':
        return `
                    <input type="text" class="glass-input ${prefix}-custom-input" data-step-id="${step.id}"${dataIndexAttr}
                           value="${this.escapeHtml(opValue.inputValue || '')}" placeholder="${window.i18n.t('testCase.inputTextContent')}">
                `;

      case 'random':
        const randomConfig = opValue.randomConfig || {};
        // P3-13: 精度档位动态生成 (原 0-5 硬编码 6 组)
        const precisionOptions = Array.from({ length: RANDOM_PRECISION_MAX + 1 }, (_, n) => ({
          value: String(n),
          label: n === 0 ? window.i18n.t('testCase.integer') : window.i18n.t('testCase.decimalPlaces', { n }),
          selected: randomConfig.precision === n || (n === 0 && !randomConfig.precision),
        }));
        return `
                    <div class="tc-random-config">
                        <div class="form-row">
                            <div class="form-group">
                                <label>${window.i18n.t('testCase.minValue')}</label>
                                <input type="number" class="glass-input ${prefix}-random-min" data-step-id="${step.id}"${dataIndexAttr}
                                       value="${this.escapeHtml(randomConfig.minValue || 0)}" step="0.1">
                            </div>
                            <div class="form-group">
                                <label>${window.i18n.t('testCase.maxValue')}</label>
                                <input type="number" class="glass-input ${prefix}-random-max" data-step-id="${step.id}"${dataIndexAttr}
                                       value="${this.escapeHtml(randomConfig.maxValue || 100)}" step="0.1">
                            </div>
                            <div class="form-group">
                                <label>${window.i18n.t('testCase.precision')}</label>
                                ${this.generateCustomSelect(`${prefix}-random-precision`, precisionOptions, window.i18n.t('testCase.selectPrecision'), step.id, index)}
                            </div>
                        </div>
                    </div>
                `;

      case 'faker':
        return this.renderFakerConfig(step, index, opValue);

      default:
        return '';
    }
  },
  renderFakerConfig(step, index = -1, operationValue = null) {
    const isMulti = index >= 0;
    const opValue = isMulti ? operationValue || {} : step.config?.operationValue || {};
    const fakerConfig = opValue.fakerConfig || {};
    const prefix = isMulti ? 'tc-multi' : 'tc';

    const locales = [
      { value: 'zh_CN', label: window.i18n.t('testCase.fakerLocales.zh_CN') },
      { value: 'en_US', label: window.i18n.t('testCase.fakerLocales.en_US') },
      { value: 'ja_JP', label: window.i18n.t('testCase.fakerLocales.ja_JP') },
      { value: 'ko_KR', label: window.i18n.t('testCase.fakerLocales.ko_KR') },
    ];

    const providers = this._getFakerProviders();

    const selectedLocale = fakerConfig.locale || 'zh_CN';
    const selectedProvider = fakerConfig.provider || 'person.name';
    const currentProviders = providers[selectedLocale] || providers['zh_CN'];
    const currentProvider = currentProviders.find((p) => p.value === selectedProvider) || currentProviders[0];

    const localeOptions = locales.map((l) => ({
      value: l.value,
      label: l.label,
      selected: selectedLocale === l.value,
    }));

    const providerOptions = currentProviders.map((p) => ({
      value: p.value,
      label: p.label,
      selected: selectedProvider === p.value,
    }));

    const languageLabel = window.i18n.t('testCase.fakerLocale');
    const typeLabel = window.i18n.t('testCase.fakerType');
    const exampleLabel = window.i18n.t('testCase.fakerExample');

    return `
            <div class="tc-faker-config">
                <div class="tc-faker-row">
                    <div class="tc-faker-field">
                        <label>${languageLabel}</label>
                        ${this.generateCustomSelect(`${prefix}-faker-locale`, localeOptions, window.i18n.t('testCase.fakerLocale'), step.id, index)}
                    </div>
                    <div class="tc-faker-field">
                        <label>${typeLabel}</label>
                        ${this.generateCustomSelect(`${prefix}-faker-provider`, providerOptions, window.i18n.t('testCase.fakerType'), step.id, index)}
                    </div>
                </div>
                <div class="tc-faker-example">
                    <span class="tc-faker-example-label">${exampleLabel}:</span>
                    <span class="tc-faker-example-value">${currentProvider?.example || ''}</span>
                </div>
            </div>
        `;
  },

  // ═════════════════════════════════════════════════════════════════
  // ─── Steps Page Config (原 stepsPageMixin) ────────────────────────
  // ═════════════════════════════════════════════════════════════════
  renderPageConfig(step) {
    const config = step.config || {};
    if (!config.operationType) config.operationType = 'compare';
    const operationType = config.operationType;
    const app = step._app; // Controller injects

    const operationTypeOptions = [
      {
        value: 'compare',
        label: window.i18n.t('testCase.pageCompare'),
        selected: operationType === 'compare',
      },
      {
        value: 'search',
        label: window.i18n.t('testCase.pageSearch'),
        selected: operationType === 'search',
      },
    ];

    // Compare element page options
    let compareElementPageOptions = [
      {
        value: '',
        label: window.i18n.t('pagePackage.selectPage'),
        selected: !config.compareConfig?.pageId,
      },
    ];
    if (app && app.pages) {
      app.pages.forEach((page) => {
        compareElementPageOptions.push({
          value: page.id,
          label: page.name,
          selected: config.compareConfig?.pageId === page.id,
        });
      });
    }

    // Compare element options
    let compareElementOptions = [
      {
        value: '',
        label: window.i18n.t('pagePackage.selectElement'),
        selected: true,
      },
    ];
    if (config.compareConfig?.pageId && app) {
      const page = app.pages?.find((p) => p.id === config.compareConfig.pageId);
      if (page && page.elements) {
        compareElementOptions = [
          {
            value: '',
            label: window.i18n.t('pagePackage.selectElement'),
            selected: !config.compareConfig.elementId,
          },
        ];
        page.elements.forEach((element) => {
          compareElementOptions.push({
            value: element.id,
            label: element.name,
            selected: config.compareConfig.elementId === element.id,
          });
        });
      }
    }

    const compareConfig = config.compareConfig || {};
    if (!compareConfig.targetValueType) compareConfig.targetValueType = 'custom';
    const targetValueType = compareConfig.targetValueType;

    const allSteps = step._allSteps || []; // Controller injects
    const currentStepIndex = allSteps.findIndex((s) => s.id === step.id);
    const hasBleSteps = allSteps.some(
      (s, index) =>
        index < currentStepIndex &&
        s.type === 'ble' &&
        (s.config?.deviceConfig?.methodName === 'send_random_data' ||
          s.config?.deviceConfig?.methodName === 'send_custom_data')
    );

    const targetValueOptions = [
      {
        value: 'custom',
        label: window.i18n.t('testCase.bleCustomData'),
        selected: targetValueType === 'custom',
      },
    ];
    if (hasBleSteps) {
      targetValueOptions.push({
        value: 'ble',
        label: window.i18n.t('testCase.bleOperation'),
        selected: targetValueType === 'ble',
      });
    }

    const bleStepId = compareConfig.bleStepId || '';
    const bleStepOptions = [
      {
        value: '',
        label: window.i18n.t('testCase.selectStep'),
        selected: !bleStepId,
      },
    ];
    allSteps.forEach((s, index) => {
      if (
        index < currentStepIndex &&
        s.type === 'ble' &&
        (s.config?.deviceConfig?.methodName === 'send_random_data' ||
          s.config?.deviceConfig?.methodName === 'send_custom_data')
      ) {
        bleStepOptions.push({
          value: s.id,
          label: `${s.name} ${window.i18n.t('testCase.generatedRandomValue')}`,
          selected: bleStepId === s.id,
        });
      }
    });

    const isBleTarget = targetValueType === 'ble';
    const showCustomInput = targetValueType === 'custom';
    const showBleStepSelect = isBleTarget;
    // 仅当 targetValue 为纯数字（或空）时启用容差；非纯数字（含"阿123"等混合字符）则禁用
    const _targetVal = compareConfig.targetValue || '';
    const _isPureNumber = _targetVal !== '' && !isNaN(Number(_targetVal)) && isFinite(Number(_targetVal));
    const toleranceDisabled = !isBleTarget && _targetVal !== '' && !_isPureNumber;

    const searchConfig = config.searchConfig || {};
    if (!searchConfig.searchType) searchConfig.searchType = 'element';
    const searchType = searchConfig.searchType;
    const searchTypeOptions = [
      {
        value: 'element',
        label: window.i18n.t('testCase.searchTypeElement'),
        selected: searchType === 'element',
      },
      {
        value: 'text',
        label: window.i18n.t('testCase.searchTypeText'),
        selected: searchType === 'text',
      },
    ];
    const searchMatchType = searchConfig.matchType || 'contains';

    let searchElementPageOptions = [
      {
        value: '',
        label: window.i18n.t('pagePackage.selectPage'),
        selected: !searchConfig.pageId,
      },
    ];
    if (app && app.pages) {
      app.pages.forEach((page) => {
        searchElementPageOptions.push({
          value: page.id,
          label: page.name,
          selected: searchConfig.pageId === page.id,
        });
      });
    }

    let searchElementOptions = [
      {
        value: '',
        label: window.i18n.t('pagePackage.selectElement'),
        selected: true,
      },
    ];
    if (searchConfig.pageId && app) {
      const page = app.pages?.find((p) => p.id === searchConfig.pageId);
      if (page && page.elements) {
        searchElementOptions = [
          {
            value: '',
            label: window.i18n.t('pagePackage.selectElement'),
            selected: !searchConfig.elementId,
          },
        ];
        page.elements.forEach((element) => {
          searchElementOptions.push({
            value: element.id,
            label: element.name,
            selected: searchConfig.elementId === element.id,
          });
        });
      }
    }

    return `
            <div class="tc-step-config tc-page-config">
                <div class="form-row">
                    <div class="form-group">
                        <label>${window.i18n.t('testCase.pageOperationType')}</label>
                        ${this.generateCustomSelect('tc-page-operation-type', operationTypeOptions, window.i18n.t('testCase.selectOperationType'), step.id)}
                    </div>
                </div>
                <div class="tc-page-compare-config ${operationType === 'compare' ? '' : 'hidden'}" data-step-id="${step.id}">
                    <div class="tc-compare-group">
                        <div class="form-row">
                            <div class="form-group">
                                <label>${window.i18n.t('testCase.compareSource')}</label>
                                ${this.generateCustomSelect('tc-target-value-type', targetValueOptions, window.i18n.t('testCase.selectCompareSource'), step.id)}
                            </div>
                            <div class="form-group tc-custom-target-value-group ${showCustomInput ? '' : 'hidden'}">
                                <label>${window.i18n.t('testCase.targetValue')}</label>
                                <input type="text" class="glass-input tc-compare-target-value" data-step-id="${step.id}"
                                       value="${this.escapeHtml(compareConfig.targetValue || '')}" placeholder="${window.i18n.t('testCase.enterTargetValue')}">
                            </div>
                        </div>
                        <div class="form-row tc-ble-step-select-group ${showBleStepSelect ? '' : 'hidden'}">
                            <div class="form-group">
                                <label>${window.i18n.t('testCase.stepSelect')}</label>
                                ${this.generateCustomSelect('tc-ble-step-select', bleStepOptions, window.i18n.t('testCase.selectStep'), step.id)}
                            </div>
                        </div>
                    </div>
                    <div class="tc-compare-group">
                        <div class="form-row">
                            <div class="form-group">
                                <label>${window.i18n.t('testCase.compareElementPage')}</label>
                                ${this.generateCustomSelect('tc-compare-element-page', compareElementPageOptions, window.i18n.t('pagePackage.selectPage'), step.id)}
                            </div>
                            <div class="form-group">
                                <label>${window.i18n.t('testCase.compareElement')}</label>
                                ${this.generateCustomSelect('tc-compare-element-select', compareElementOptions, window.i18n.t('pagePackage.selectElement'), step.id)}
                            </div>
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>${window.i18n.t('testCase.pageCompareTolerance')}</label>
                            <input type="number" class="glass-input tc-compare-tolerance" data-step-id="${step.id}"
                                   value="${compareConfig.tolerance || ''}" step="0.1" min="0"
                                   placeholder="${window.i18n.t('testCase.tolerancePlaceholder')}"
                                   ${toleranceDisabled ? 'disabled' : ''}>
                        </div>
                    </div>
                </div>
                <div class="tc-page-search-config ${operationType === 'search' ? '' : 'hidden'}" data-step-id="${step.id}">
                    <div class="form-row">
                        <div class="form-group">
                            <label>${window.i18n.t('testCase.pageSearchType')}</label>
                            ${this.generateCustomSelect('tc-search-type', searchTypeOptions, window.i18n.t('testCase.selectSearchType'), step.id)}
                        </div>
                    </div>
                    <div class="tc-search-element-group ${searchType === 'element' ? '' : 'hidden'}" data-step-id="${step.id}">
                        <div class="tc-compare-group">
                            <div class="form-row">
                                <div class="form-group">
                                    <label>${window.i18n.t('testCase.searchElementPage')}</label>
                                    ${this.generateCustomSelect('tc-search-element-page', searchElementPageOptions, window.i18n.t('pagePackage.selectPage'), step.id)}
                                </div>
                                <div class="form-group">
                                    <label>${window.i18n.t('testCase.searchElement')}</label>
                                    ${this.generateCustomSelect('tc-search-element-select', searchElementOptions, window.i18n.t('pagePackage.selectElement'), step.id)}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="tc-search-text-group ${searchType === 'text' ? '' : 'hidden'}" data-step-id="${step.id}">
                        <div class="form-row">
                            <div class="form-group">
                                <label>${window.i18n.t('testCase.searchTextValue')}</label>
                                <input type="text" class="glass-input tc-search-text-value" data-step-id="${step.id}"
                                       value="${this.escapeHtml(searchConfig.textValue || '')}" placeholder="${window.i18n.t('testCase.enterSearchText')}">
                            </div>
                        </div>
                        <div class="form-row tc-search-match-type-row">
                            <div class="form-group">
                                <label>${window.i18n.t('testCase.matchType')}</label>
                                <div class="tc-radio-group" data-step-id="${step.id}">
                                    <label class="tc-radio-option">
                                        <input type="radio" name="tc-search-match-${step.id}" value="contains" ${searchMatchType === 'contains' ? 'checked' : ''} class="tc-search-match-radio">
                                        <span>${window.i18n.t('testCase.matchContains')}</span>
                                    </label>
                                    <label class="tc-radio-option">
                                        <input type="radio" name="tc-search-match-${step.id}" value="exact" ${searchMatchType === 'exact' ? 'checked' : ''} class="tc-search-match-radio">
                                        <span>${window.i18n.t('testCase.matchExact')}</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
  },

  // ═════════════════════════════════════════════════════════════════
  // ─── Steps System/BLE Config (原 stepsDeviceMixin) ────────────────
  // ═════════════════════════════════════════════════════════════════
};
