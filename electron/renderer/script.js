class XKAutoTesterApp {
    constructor() {
        this.selectedDirectory = null;
        this.selectedTestFiles = [];
        this.testPlans = [];
        this.currentTestPlan = null;
        this.scheduledPlans = [];
        this.currentScheduledPlan = null;
        this.isRunning = false;
        this.runningTestPlanName = null; // 正在执行的测试计划名称
        this.runningScheduledPlanId = null; // 正在执行的定时计划ID
        this.isInitializing = false;
        this.initialized = false; // 添加初始化完成标志
        this.selectedDevice = null; // 添加设备管理相关属性
        this.currentMarkers = []; // 保存当前的测试类型标记
        this.selectedReportRun = null; // 选中的报告运行记录
        
        // 测试用例相关属性
        this.tcSelectedDirectory = null;
        this.tcSelectedFile = null;
        this.tcIsEditing = false;
        this.tcHasUnsavedChanges = false;
        this.tcTestFiles = [];
        this.tcSteps = [];  // 测试步骤列表
        this.tcDraggedStep = null;  // 拖拽中的步骤
        this.tcSelectedApp = null;  // 选中的目标应用
        this.tcApps = [];  // 应用列表
        this.tcSelectedPlatform = 'android';  // 选中的应用平台，默认Android
        this.tcBleDevices = [];  // 蓝牙设备列表（用于测试步骤中的蓝牙操作）
        this.tcMarkers = [];  // Markers列表
        this.tcSelectedMarkers = [];  // 选中的Markers
        this.tcLoadedDeviceConfig = null;
        this.tcLoadedBleDevice = null;
        this.tcSearchDebounceTimer = null;
        this.tcJsonExistsMap = {};
        this.tcSearchQuery = '';
        
        // 页面封装相关属性
        this.ppSelectedApp = null;
        this.ppSelectedPage = null;
        this.ppSelectedElement = null;
        this.ppApps = [];
        this.ppPages = [];
        this.ppElements = [];
        this.ppIsEditing = false;
        this.ppEditingType = null;
        this.ppInitialized = false;
        this.inspectorModal = null;
        this._ppElementModalNeedsReopen = false;
        
        // 文件管理器相关属性
        this.currentPath = '/storage/emulated/0'; // 默认路径
        this.selectedFiles = []; // 选中的文件列表
        this.fileList = []; // 当前目录的文件列表
        this.contextMenu = null; // 上下文菜单引用
        this.contextMenuTarget = null; // 上下文菜单的目标元素
        
        // 进度指示器
        this.progressIndicator = null;
        
        // 测试输出批量渲染缓冲区
        this._outputBuffer = [];
        this._outputRafId = null;
        
        // 预绑定方法，避免重复创建函数引用
        this.boundOpenPort5555 = this.openPort5555.bind(this);
        
        // 延迟初始化，确保DOM完全加载
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.initializeApp();
            });
        } else {
            this.initializeApp();
        }
    }

    async initializeApp() {
        // 防止重复初始化
        if (this.isInitializing || this.initialized) {

            return;
        }
        this.isInitializing = true;
        
        // 初始化i18next
        await this.initializeI18next();

        // 加载HTML组件
        await this.loadComponents();

        // 初始化模态框组件
        this.initModals();

        this.initInspector();

        this.progressIndicator = new ProgressIndicator();

        // 初始化SVG图标
        this.initializeIcons();
        
        // 初始化自定义下拉框（包括 index.html 中的）
        this.initializeCustomSelects();

        // 初始化事件监听
        this.setupEventListeners();
        
        // 初始化设备显示和屏幕控制按钮状态
        this.updateSelectedDeviceDisplay();
        
        // 只在应用启动时显示一次占位符
        this.initializePlaceholders();
        
        // 加载项目信息（不触发scanTestFiles）
        await this.loadProjectInfo();
        
        // 加载配置文件
        await this.loadConfig();
        
        // 加载版本信息
        await this.loadVersionInfo();
        
        // 初始化文件管理器状态（在加载配置后调用，确保使用正确的语言）
        this.toggleFileManagerEnabled(false);
        
        // 页面加载时就显示测试计划区域并加载测试计划
        const testPlanSection = document.getElementById('test-plan-section');
        testPlanSection.classList.remove('hidden');
        
        // 并行加载测试计划、定时计划、页面封装（互不依赖）
        await Promise.all([
            this.loadTestPlans(),
            this.loadScheduledPlans(),
            this.initPagePackage()
        ]);
        
        // 初始化运行按钮状态
        this.updateRunButtonState();
        
        // 初始化计划按钮状态
        this.updatePlanButtons();
        
        // 添加滚动调试监听器
        this.addScrollDebugListeners();

        // 初始化查看报告模态框事件
        this.initReportModalEvents();


        this.isInitializing = false;
        this.initialized = true;
        this.deviceStatusSaved = false;

        this.autoCheckForUpdate();
        
        // 强制显示占位符，确保它们被显示
        setTimeout(() => {

            this.forceDisplayPlaceholders();
        }, 1000);
    }
    
    // 初始化i18next
    async initializeI18next() {
        try {
            // 检查electronAPI是否可用
            if (window.electronAPI && window.electronAPI.i18n) {
                // 使用preload.js中暴露的i18n实例
                window.i18n = window.electronAPI.i18n;
            } else {
                throw new Error('electronAPI.i18n未定义');
            }
            
            // 从配置中获取保存的语言设置
            // 暂时使用默认值，因为this.config还没有初始化
            const savedLanguage = 'zh-CN';
            
            // 设置为保存的语言
            if (window.i18n) {
                await window.i18n.changeLanguage(savedLanguage);
                // 测试翻译
            }
        } catch (error) {
            console.error('初始化i18next失败:', error);
        }
    }

    async loadComponents() {
        try {
            const components = [
                { container: 'confirm-modal-container', path: 'components/confirm-modal.html' }
            ];

            for (const component of components) {
                const container = document.getElementById(component.container);
                if (container) {
                    const response = await fetch(component.path);
                    if (response.ok) {
                        const html = await response.text();
                        container.innerHTML = html;
                    } else {
                        console.error(`加载组件失败: ${component.path}`);
                    }
                }
            }

            await this.loadScript('components/modal.js');
            await this.loadScript('components/custom-select.js');
            await this.loadScript('components/cascade-select.js');
            await this.loadScript('components/device-cascade-select.js');
            await this.loadScript('components/inspector.js');
            
            this.initializeComponentIcons();
            this.updateComponentTranslations();
        } catch (error) {
            console.error('加载组件失败:', error);
        }
    }

    loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    initModals() {
        this.modals = {
            plan: new Modal({ id: 'modal-overlay', onOpen: () => this.onPlanModalOpen?.(), onClose: () => this.onPlanModalClose?.() }),
            rename: new Modal({ id: 'rename-modal-overlay' }),
            device: new Modal({ id: 'device-modal-overlay', onOpen: () => this.onDeviceModalOpen?.(), onClose: () => this.onDeviceModalClose?.() }),
            editDeviceId: new Modal({ id: 'edit-device-id-modal-overlay' }),
            port: new Modal({ id: 'port-modal-overlay' }),
            confirm: new Modal({ id: 'confirm-modal-overlay' }),
            saveConfirm: new Modal({ id: 'save-confirm-modal-overlay' }),
            update: new Modal({ id: 'update-modal-overlay' }),
            ppApp: new Modal({ id: 'pp-app-modal-overlay' }),
            ppPage: new Modal({ id: 'pp-page-modal-overlay' }),
            ppElement: new Modal({ id: 'pp-element-modal-overlay' }),
            report: new Modal({ id: 'report-modal-overlay' }),
            controlParams: new Modal({ id: 'control-params-overlay' }),
            scheduledPlan: new Modal({ id: 'scheduled-plan-modal-overlay', onOpen: () => this.onScheduledPlanModalOpen?.(), onClose: () => this.onScheduledPlanModalClose?.() })
        };
    }

    async initInspector() {
        try {
            const container = document.getElementById('inspector-modal-container');
            if (container) {
                const response = await fetch('components/inspector-modal.html');
                const html = await response.text();
                container.innerHTML = html;
                this.initializeIcons();
            }
            this.inspectorModal = new InspectorModal();

            document.addEventListener('inspector-element-selected', (event) => {
                const { locatorType, locatorValue } = event.detail;
                this.ppFillLocatorFromInspector(locatorType, locatorValue);
            });

            document.addEventListener('inspector-closed', () => {
                this._reopenElementModalIfNeeded();
            });
        } catch (error) {
            console.error('Failed to initialize Inspector:', error);
        }
    }

    initializeCustomSelects() {
        const selectWrappers = document.querySelectorAll('.custom-select-wrapper[data-options]');
        
        selectWrappers.forEach(wrapper => {
            // 跳过已经初始化的下拉框
            if (wrapper.querySelector('.custom-select')) return;
            
            const optionsData = wrapper.getAttribute('data-options');
            if (!optionsData) return;
            
            try {
                const options = JSON.parse(optionsData);
                const selectId = wrapper.id;
                
                const selectHtml = `
                    <div class="custom-select" id="${selectId}-select">
                        <div class="custom-select__selected" id="${selectId}-selected">
                            <span class="custom-select__text"></span>
                        </div>
                        <div class="custom-select__options" id="${selectId}-options">
                            ${options.map(opt => `
                                <div class="custom-select__option${opt.default ? ' selected' : ''}" data-value="${opt.value}">
                                    <span data-i18n="${opt.label}">${window.i18n.t(opt.label)}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
                
                wrapper.innerHTML = selectHtml;
                
                const selectedSpan = wrapper.querySelector('.custom-select__text');
                const defaultOption = options.find(opt => opt.default);
                if (selectedSpan && defaultOption) {
                    selectedSpan.textContent = window.i18n.t(defaultOption.label);
                    selectedSpan.setAttribute('data-i18n', defaultOption.label);
                }
                
                this.initCustomSelect(`${selectId}-select`);
            } catch (e) {
                console.error('解析下拉框选项失败:', e);
            }
        });
    }

    initializeComponentIcons() {
        if (typeof window.Icons === 'undefined') return;
        
        const containers = document.querySelectorAll('#confirm-modal-container');
        containers.forEach(container => {
            const iconElements = container.querySelectorAll('.svg-icon[data-icon]');
            iconElements.forEach(element => {
                const iconName = element.getAttribute('data-icon');
                if (window.Icons[iconName]) {
                    element.innerHTML = window.Icons[iconName];
                }
            });
        });
    }

    updateComponentTranslations() {
        if (!window.i18n) return;
        
        const containers = document.querySelectorAll('#confirm-modal-container');
        containers.forEach(container => {
            const elements = container.querySelectorAll('[data-i18n]');
            elements.forEach(element => {
                const key = element.getAttribute('data-i18n');
                if (key) {
                    const translation = window.i18n.t(key);
                    if (translation) {
                        element.textContent = translation;
                    }
                }
            });
        });
    }
    
    // 初始化SVG图标
    initializeIcons() {
        if (typeof window.Icons === 'undefined') {
            console.error('Icons对象未定义，请确保icons.js已正确加载');
            return;
        }
        
        const iconElements = document.querySelectorAll('.svg-icon[data-icon]');
        iconElements.forEach(element => {
            const iconName = element.getAttribute('data-icon');
            if (window.Icons[iconName]) {
                element.innerHTML = window.Icons[iconName];
            } else {
                console.warn(`图标 "${iconName}" 未找到`);
            }
        });
    }
    
    // 获取SVG图标HTML
    getIconHtml(iconName, style = '') {
        if (typeof window.Icons === 'undefined' || !window.Icons[iconName]) {
            console.warn(`图标 "${iconName}" 未找到`);
            return '';
        }
        return `<span class="svg-icon" data-icon="${iconName}" style="${style}">${window.Icons[iconName]}</span>`;
    }
    
    // 切换语言
    changeLanguage(language) {
        if (window.i18n) {
            window.i18n.changeLanguage(language).then(() => {
                this.updateUIText();
                this.updateComponentTranslations();
                this.displayTestPlans();
                this.refreshTestTypes();
                this.updateLanguageSelectorText(language);
            }).catch(error => {
                console.error('语言切换失败:', error);
            });
        } else {
            console.error('i18n实例不存在，无法切换语言');
        }
    }
    
    // 更新语言选择器显示文本
    updateLanguageSelectorText(language) {
        const selectedSpan = document.querySelector('#custom-language-selected .custom-select__text');
        if (selectedSpan) {
            const languageNames = {
                'zh-CN': '简体中文',
                'en-US': 'English'
            };
            selectedSpan.textContent = languageNames[language] || language;
        }
    }
    
    refreshTestTypes() {
        if (this.currentMarkers && this.currentMarkers.length > 0) {
            const translatedMarkers = this.currentMarkers.map(marker => ({
                name: marker.name,
                description: window.i18n.t(`testTypes.${marker.name}`)
            }));
            this.displayTestTypes(translatedMarkers, null, true);
        } else {
            // 如果没有 markers，检查是否需要更新占位符
            const container = document.getElementById('test-type-selector');
            if (container) {
                // 只选择文本 span，排除图标 span
                const placeholderElement = container.querySelector('.placeholder-message > span:last-child');
                if (placeholderElement && window.i18n) {
                    placeholderElement.textContent = window.i18n.t('testExecution.selectTestDirectoryFirst');
                }
            }
        }
        
        // 更新测试计划占位符
        const testPlansContainer = document.getElementById('test-plans-list');
        if (testPlansContainer) {
            // 只选择文本 span，排除图标 span
            const plansPlaceholder = testPlansContainer.querySelector('.placeholder-message > span:last-child');
            if (plansPlaceholder && window.i18n) {
                plansPlaceholder.textContent = window.i18n.t('testExecution.noTestPlans');
            }
        }
        
        // 更新文件管理器占位符
        this.refreshFileManagerPlaceholders();
    }
    
    // 更新文件管理器的动态文本
    refreshFileManagerPlaceholders() {
        if (!window.i18n) return;
        
        const fileList = document.getElementById('file-list');
        if (fileList) {
            // 选择文件列表中的文本 span（排除图标 span）
            const fileTextSpan = fileList.querySelector('td > div > span:last-child');
            if (fileTextSpan) {
                // 根据当前显示的文本类型更新
                const currentText = fileTextSpan.textContent;
                if (currentText.includes('select') || currentText.includes('选择') || currentText.includes('device') || currentText.includes('设备')) {
                    fileTextSpan.textContent = window.i18n.t('fileManager.selectDeviceFirst');
                } else if (currentText.includes('Loading') || currentText.includes('加载')) {
                    fileTextSpan.textContent = window.i18n.t('fileManager.loadingFiles');
                } else if (currentText.includes('Empty') || currentText.includes('空')) {
                    fileTextSpan.textContent = window.i18n.t('fileManager.emptyDirectory');
                }
            }
        }
        
        // 更新模态框中的测试文件占位符
        const modalTestFiles = document.getElementById('modal-test-files');
        if (modalTestFiles) {
            const noFilesElement = modalTestFiles.querySelector('.no-files');
            if (noFilesElement) {
                const currentText = noFilesElement.textContent;
                if (currentText.includes('select') || currentText.includes('选择') || currentText.includes('directory') || currentText.includes('目录')) {
                    noFilesElement.textContent = window.i18n.t('testExecution.selectTestDirectoryFirst');
                } else if (currentText.includes('no') || currentText.includes('没有') || currentText.includes('No test files')) {
                    noFilesElement.textContent = window.i18n.t('testExecution.noTestFilesInDir');
                }
            }
        }
        
        // 更新欢迎消息
        const welcomeMessage = document.querySelector('.welcome-message');
        if (welcomeMessage) {
            const welcomeText = welcomeMessage.querySelector('.welcome-text');
            const welcomeDesc = welcomeMessage.querySelector('p');
            if (welcomeText) {
                welcomeText.textContent = window.i18n.t('testExecution.welcome');
            }
            if (welcomeDesc) {
                welcomeDesc.textContent = window.i18n.t('testExecution.createTestPlan');
            }
        }
    }
    
    // 更新UI文本
    updateUIText() {
        if (!window.i18n) return;
        
        // 通用方法：根据data-i18n属性更新文本
        const updateElementsByI18nAttribute = () => {
            const elements = document.querySelectorAll('[data-i18n]');
            elements.forEach(element => {
                const key = element.getAttribute('data-i18n');
                if (key) {
                    const translation = window.i18n.t(key);
                    if (translation) {
                        element.textContent = translation;
                    }
                }
            });
        };
        
        // 通用方法：根据data-i18n-placeholder属性更新占位符
        const updatePlaceholdersByI18nAttribute = () => {
            const elements = document.querySelectorAll('[data-i18n-placeholder]');
            elements.forEach(element => {
                const key = element.getAttribute('data-i18n-placeholder');
                if (key) {
                    const translation = window.i18n.t(key);
                    if (translation) {
                        element.placeholder = translation;
                    }
                }
            });
        };
        
        // 调用通用方法更新文本
        updateElementsByI18nAttribute();
        updatePlaceholdersByI18nAttribute();
        
        // 更新标签页文本
        const testExecutionTab = document.querySelector('[data-tab="test-execution"] span:last-child');
        if (testExecutionTab) {
            testExecutionTab.textContent = window.i18n.t('tabs.testExecution');
        }
        
        // 更新页面封装页面文本
        const pagePackageTab = document.querySelector('[data-tab="page-package"] span:last-child');
        if (pagePackageTab) {
            pagePackageTab.textContent = window.i18n.t('tabs.pagePackage');
        }
        
        const androidConnectionTab = document.querySelector('[data-tab="android-connection"] span:last-child');
        if (androidConnectionTab) {
            androidConnectionTab.textContent = window.i18n.t('tabs.androidConnection');
        }
        
        const settingsTab = document.querySelector('[data-tab="settings"] span:last-child');
        if (settingsTab) {
            settingsTab.textContent = window.i18n.t('tabs.settings');
        }
        
        // 更新测试用例页面文本
        const testCaseTab = document.querySelector('[data-tab="test-case"] span:last-child');
        if (testCaseTab) {
            testCaseTab.textContent = window.i18n.t('tabs.testCase');
        }
        
        // 更新设置页面文本
        const displayCard = document.querySelector('#settings .material-card[data-card-type="display"] .card-header h3');
        if (displayCard) {
            displayCard.textContent = window.i18n.t('settings.display');
        }
        
        const directoryCard = document.querySelector('#settings .material-card[data-card-type="directory"] .card-header h3');
        if (directoryCard) {
            directoryCard.textContent = window.i18n.t('settings.directory');
        }
        
        const notificationCard = document.querySelector('#settings .material-card[data-card-type="notification"] .card-header h3');
        if (notificationCard) {
            notificationCard.textContent = window.i18n.t('settings.notification');
        }
        
        const versionCard = document.querySelector('#settings .material-card[data-card-type="version"] .card-header h3');
        if (versionCard) {
            versionCard.textContent = window.i18n.t('settings.version');
        }
        
        const dataCard = document.querySelector('#settings .material-card[data-card-type="data"] .card-header h3');
        if (dataCard) {
            dataCard.textContent = window.i18n.t('settings.data');
        }

        const updateCard = document.querySelector('#settings .material-card[data-card-type="update"] .card-header h3');
        if (updateCard) {
            updateCard.textContent = window.i18n.t('settings.update');
        }

        const runCard = document.querySelector('#settings .material-card[data-card-type="run"] .card-header h3');
        if (runCard) {
            runCard.textContent = window.i18n.t('settings.run');
        }

        const preventSleepLabel = document.querySelector('#settings .material-card[data-card-type="run"] .setting-label span:last-child');
        if (preventSleepLabel) {
            preventSleepLabel.textContent = window.i18n.t('settings.preventSleep');
        }

        const autoCheckUpdateLabel = document.querySelector('#settings .material-card[data-card-type="update"] .setting-item:nth-child(1) .setting-label span:last-child');
        if (autoCheckUpdateLabel) {
            autoCheckUpdateLabel.textContent = window.i18n.t('settings.autoCheckUpdate');
        }

        const checkUpdateNowLabel = document.querySelector('#settings .material-card[data-card-type="update"] .setting-item:nth-child(2) .setting-label span:last-child');
        if (checkUpdateNowLabel) {
            checkUpdateNowLabel.textContent = window.i18n.t('settings.checkUpdateNow');
        }

        const checkUpdateBtn = document.getElementById('check-update-btn');
        if (checkUpdateBtn) {
            checkUpdateBtn.textContent = window.i18n.t('settings.checkNow');
        }
        
        // 更新设置项文本
        const darkModeLabel = document.querySelector('#settings .material-card[data-card-type="display"] .setting-item:nth-child(1) .setting-label span:last-child');
        if (darkModeLabel) {
            darkModeLabel.textContent = window.i18n.t('settings.darkMode');
        }
        
        const themeColorLabel = document.querySelector('#settings .material-card[data-card-type="display"] .setting-item:nth-child(2) .setting-label span:last-child');
        if (themeColorLabel) {
            themeColorLabel.textContent = window.i18n.t('settings.themeColor');
        }
        
        const languageLabel = document.querySelector('#settings .material-card[data-card-type="display"] .setting-item:nth-child(3) .setting-label span:last-child');
        if (languageLabel) {
            languageLabel.textContent = window.i18n.t('settings.language');
        }
        
        const defaultDownloadPathLabel = document.querySelector('#settings .material-card[data-card-type="directory"] .setting-label span:last-child');
        if (defaultDownloadPathLabel) {
            defaultDownloadPathLabel.textContent = window.i18n.t('settings.defaultDownloadPath');
        }
        
        // 更新默认下载路径的占位符文本
        const defaultTestDirectoryInput = document.getElementById('default-test-directory');
        if (defaultTestDirectoryInput) {
            defaultTestDirectoryInput.placeholder = window.i18n.t('placeholders.defaultDownloadPath');
        }
        
        // 更新版本信息卡片中的标签
        const versionLabels = document.querySelectorAll('#settings .material-card[data-card-type="version"] .version-label');
        if (versionLabels.length >= 3) {
            versionLabels[0].textContent = window.i18n.t('labels.version');
            versionLabels[1].textContent = window.i18n.t('labels.buildDate');
            versionLabels[2].textContent = window.i18n.t('labels.copyright');
        }
        
        // 更新安卓连接页面文本
        
        // 设备选择卡片标题
        const deviceSelectionCard = document.querySelector('#android-connection .left-panel .material-card:nth-child(1) .card-header h3');
        if (deviceSelectionCard) {
            deviceSelectionCard.textContent = window.i18n.t('android.deviceSelection');
        }
        
        // 设备管理按钮
        const deviceManagementBtn = document.querySelector('#device-management-btn span:last-child');
        if (deviceManagementBtn) {
            deviceManagementBtn.textContent = window.i18n.t('android.deviceManagement');
        }
        
        // 未选择设备文本
        const noDeviceSelected = document.getElementById('selected-device-name');
        if (noDeviceSelected) {
            noDeviceSelected.textContent = window.i18n.t('android.noDeviceSelected');
        }
        
        // 屏幕控制按钮
        const screenControlBtn = document.querySelector('#screen-control-btn span:last-child');
        if (screenControlBtn) {
            screenControlBtn.textContent = window.i18n.t('android.screenControl');
        }
        
        // 控制参数按钮
        const controlParamsBtn = document.querySelector('#control-params-btn span:last-child');
        if (controlParamsBtn) {
            controlParamsBtn.textContent = window.i18n.t('android.controlParams');
        }
        
        // 设备信息卡片标题
        const deviceInfoCard = document.querySelector('#device-info-card .card-header h3');
        if (deviceInfoCard) {
            deviceInfoCard.textContent = window.i18n.t('android.deviceInfo');
        }
        
        // 设备信息标签
        const deviceInfoLabels = document.querySelectorAll('#device-info-content .status-item-label');
        if (deviceInfoLabels.length >= 7) {
            deviceInfoLabels[0].textContent = window.i18n.t('android.manufacturer');
            deviceInfoLabels[1].textContent = window.i18n.t('android.model');
            deviceInfoLabels[2].textContent = window.i18n.t('android.androidVersion');
            deviceInfoLabels[3].textContent = window.i18n.t('android.connectedWifi');
            deviceInfoLabels[4].textContent = window.i18n.t('android.batteryLevel');
            deviceInfoLabels[5].textContent = window.i18n.t('android.storageUsage');
            deviceInfoLabels[6].textContent = window.i18n.t('android.memoryUsage');
        }
        
        // 更新文件管理器文本
        
        // 文件管理器标题
        const fileManagerTitle = document.querySelector('#android-connection .right-panel .material-card .card-header h3');
        if (fileManagerTitle) {
            fileManagerTitle.textContent = window.i18n.t('fileManager.title');
        }
        
        // 文件管理器按钮
        const fileManagerBtns = document.querySelectorAll('.file-manager-btn .btn-text');
        if (fileManagerBtns.length >= 5) {
            fileManagerBtns[0].textContent = window.i18n.t('fileManager.back');
            fileManagerBtns[1].textContent = window.i18n.t('fileManager.refresh');
            fileManagerBtns[2].textContent = window.i18n.t('fileManager.delete');
            fileManagerBtns[3].textContent = window.i18n.t('fileManager.upload');
            fileManagerBtns[4].textContent = window.i18n.t('fileManager.download');
        }
        
        // 文件管理器表格标题
        const fileTableHeaders = document.querySelectorAll('.file-list-table th');
        if (fileTableHeaders.length >= 6) {
            fileTableHeaders[1].textContent = window.i18n.t('fileManager.name');
            fileTableHeaders[2].textContent = window.i18n.t('fileManager.size');
            fileTableHeaders[3].textContent = window.i18n.t('fileManager.modifyTime');
            fileTableHeaders[4].textContent = window.i18n.t('fileManager.createTime');
            fileTableHeaders[5].textContent = window.i18n.t('fileManager.actions');
        }
        
        // 下载进度条文本
        const downloadingText = document.getElementById('download-filename');
        if (downloadingText) {
            downloadingText.textContent = window.i18n.t('fileManager.downloading');
        }
        
        const autoCloseText = document.getElementById('download-countdown');
        if (autoCloseText) {
            autoCloseText.textContent = window.i18n.t('fileManager.autoCloseIn');
        }
        
        const downloadFailedText = document.querySelector('.error-title');
        if (downloadFailedText) {
            downloadFailedText.textContent = window.i18n.t('fileManager.downloadFailed');
        }
        
        // 上下文菜单文本
        const contextMenuItems = document.querySelectorAll('.context-menu-item span:last-child');
        if (contextMenuItems.length >= 3) {
            contextMenuItems[0].textContent = window.i18n.t('fileManager.download');
            contextMenuItems[1].textContent = window.i18n.t('fileManager.rename');
            contextMenuItems[2].textContent = window.i18n.t('fileManager.delete');
        }
        
        // 更新设备管理弹窗文本
        
        // 弹窗标题
        const deviceModalTitle = document.getElementById('device-modal-title');
        if (deviceModalTitle) {
            deviceModalTitle.textContent = window.i18n.t('deviceModal.title');
        }
        
        // 扫描设备文本
        const scanningText = document.querySelector('#device-scanning span:last-child');
        if (scanningText) {
            scanningText.textContent = window.i18n.t('deviceModal.scanning');
        }
        
        // 按IP新增设备文本
        const addDeviceText = document.querySelector('#add-device-btn span:last-child');
        if (addDeviceText) {
            addDeviceText.textContent = window.i18n.t('deviceModal.addDevice');
        }
        
        // IP输入框占位符
        const ipInput = document.getElementById('add-device-input');
        if (ipInput) {
            ipInput.placeholder = window.i18n.t('deviceModal.ipPlaceholder');
        }
        
        // 开放5555端口按钮
        const openPortBtn = document.getElementById('open-port-btn');
        if (openPortBtn) {
            openPortBtn.textContent = window.i18n.t('deviceModal.openPort');
        }
        
        // 确认选择按钮
        const confirmSelectBtn = document.getElementById('device-modal-confirm-btn');
        if (confirmSelectBtn) {
            confirmSelectBtn.textContent = window.i18n.t('deviceModal.confirmSelect');
        }
        
        // 取消按钮
        const cancelBtn = document.getElementById('device-modal-cancel-btn');
        if (cancelBtn) {
            cancelBtn.textContent = window.i18n.t('deviceModal.cancel');
        }
        
        // 设备管理弹窗的设备信息卡片
        const deviceInfoTitle = document.querySelector('#modal-device-status-card .device-status-title');
        if (deviceInfoTitle) {
            deviceInfoTitle.textContent = window.i18n.t('deviceModal.deviceInfo');
        }
        
        // 设备信息标签
        const modalDeviceInfoLabels = document.querySelectorAll('#modal-device-info-content .status-item-label');
        if (modalDeviceInfoLabels.length >= 3) {
            modalDeviceInfoLabels[0].textContent = window.i18n.t('deviceModal.manufacturer');
            modalDeviceInfoLabels[1].textContent = window.i18n.t('deviceModal.model');
            modalDeviceInfoLabels[2].textContent = window.i18n.t('deviceModal.androidVersion');
        }
        
        // 控制参数弹窗
        const controlParamsTitle = document.querySelector('#control-params-overlay .modal-header h3');
        if (controlParamsTitle) {
            controlParamsTitle.textContent = window.i18n.t('controlParams.title');
        }
        
        // 控制参数弹窗的保存和取消按钮
        const controlParamsSaveBtn = document.querySelector('#control-params-overlay .modal-footer button.primary');
        if (controlParamsSaveBtn) {
            controlParamsSaveBtn.textContent = window.i18n.t('controlParams.saveParams');
        }
        
        const controlParamsCancelBtn = document.querySelector('#control-params-overlay .modal-footer button.outlined');
        if (controlParamsCancelBtn) {
            controlParamsCancelBtn.textContent = window.i18n.t('controlParams.cancel');
        }
        
        // 控制参数弹窗的表单标签
        const maxResolutionLabel = document.querySelector('#control-params-form label[for="max-size"]');
        if (maxResolutionLabel) {
            maxResolutionLabel.textContent = window.i18n.t('controlParams.maxResolution');
        }
        
        const videoBitRateLabel = document.querySelector('#control-params-form label[for="video-bit-rate"]');
        if (videoBitRateLabel) {
            videoBitRateLabel.textContent = window.i18n.t('controlParams.videoBitRate');
        }
        
        const mbpsUnit = document.querySelector('#control-params-form small');
        if (mbpsUnit) {
            mbpsUnit.textContent = window.i18n.t('controlParams.mbps');
        }
        
        const maxFpsLabel = document.querySelector('#control-params-form label[for="max-fps"]');
        if (maxFpsLabel) {
            maxFpsLabel.textContent = window.i18n.t('controlParams.maxFps');
        }
        
        const videoCodecLabel = document.querySelector('#control-params-form label[for="video-codec"]');
        if (videoCodecLabel) {
            videoCodecLabel.textContent = window.i18n.t('controlParams.videoCodec');
        }
        
        const alwaysOnTopLabel = document.querySelector('#control-params-form label[for="always-on-top"]');
        if (alwaysOnTopLabel) {
            alwaysOnTopLabel.textContent = window.i18n.t('controlParams.alwaysOnTop');
        }
        
        // 视频编解码器选项
        const videoCodecOptions = document.querySelectorAll('#video-codec-options .custom-select__option span');
        if (videoCodecOptions.length >= 3) {
            videoCodecOptions[0].textContent = window.i18n.t('controlParams.h264');
            videoCodecOptions[1].textContent = window.i18n.t('controlParams.h265');
            videoCodecOptions[2].textContent = window.i18n.t('controlParams.av1');
        }
        
        // 更新选中的显示文本
        const videoCodecSelected = document.querySelector('#video-codec-selected .custom-select__text');
        const selectedVideoOption = document.querySelector('#video-codec-options .custom-select__option.selected');
        if (videoCodecSelected && selectedVideoOption) {
            videoCodecSelected.textContent = selectedVideoOption.querySelector('span')?.textContent || videoCodecSelected.textContent;
        }
        
        // 更新测试执行页面文本
        const testDirectoryTitle = document.querySelector('#test-execution .left-panel .material-card:nth-child(1) .card-header h3');
        if (testDirectoryTitle) {
            testDirectoryTitle.textContent = window.i18n.t('testExecution.testDirectory');
        }
        
        const selectDirectoryBtn = document.querySelector('#select-directory-btn span:last-child');
        if (selectDirectoryBtn) {
            selectDirectoryBtn.textContent = window.i18n.t('testExecution.selectTestDirectory');
        }
        
        const noDirectorySelected = document.getElementById('selected-directory');
        if (noDirectorySelected && !this.selectedDirectory) {
            noDirectorySelected.textContent = window.i18n.t('testExecution.noDirectorySelected');
        }
        
        const testPlanTitle = document.querySelector('#test-plan-section .card-header h3');
        if (testPlanTitle) {
            testPlanTitle.textContent = window.i18n.t('testExecution.testPlan');
        }
        
        const newPlanBtn = document.querySelector('#new-plan-btn span:last-child');
        if (newPlanBtn) {
            newPlanBtn.textContent = window.i18n.t('testExecution.newPlan');
        }
        
        const editPlanBtn = document.querySelector('#edit-plan-btn span:last-child');
        if (editPlanBtn) {
            editPlanBtn.textContent = window.i18n.t('testExecution.editPlan');
        }
        
        const deletePlanBtn = document.querySelector('#delete-plan-btn span:last-child');
        if (deletePlanBtn) {
            deletePlanBtn.textContent = window.i18n.t('testExecution.deletePlan');
        }
        
        const testTypeTitle = document.querySelector('#test-execution .left-panel .material-card:nth-child(3) .card-header h3');
        if (testTypeTitle) {
            testTypeTitle.textContent = window.i18n.t('testExecution.testType');
        }
        
        const testOutputTitle = document.querySelector('#test-execution .right-panel .material-card:nth-child(1) .card-header h3');
        if (testOutputTitle) {
            testOutputTitle.textContent = window.i18n.t('testExecution.testOutput');
        }
        
        const progressStatus = document.getElementById('progress-status');
        if (progressStatus && progressStatus.textContent === '准备就绪') {
            progressStatus.textContent = window.i18n.t('testExecution.ready');
        }
        
        const runTestsBtn = document.querySelector('#run-tests-btn span:last-child');
        if (runTestsBtn) {
            runTestsBtn.textContent = window.i18n.t('testExecution.runTests');
        }
        
        const stopTestsBtn = document.querySelector('#stop-tests-btn span:last-child');
        if (stopTestsBtn) {
            stopTestsBtn.textContent = window.i18n.t('testExecution.stopTests');
        }
        
        const viewReportBtn = document.querySelector('#view-report-btn span:last-child');
        if (viewReportBtn) {
            viewReportBtn.textContent = window.i18n.t('testExecution.viewReport');
        }
        
        // 更新模态框文本
        const modalTitle = document.getElementById('modal-title');
        if (modalTitle && modalTitle.textContent === '新建测试计划') {
            modalTitle.textContent = window.i18n.t('modal.newTestPlan');
        }
        
        const planNameLabel = document.querySelector('#test-plan-form label[for="plan-name"]');
        if (planNameLabel) {
            planNameLabel.textContent = window.i18n.t('modal.planName');
        }
        
        const planDescriptionLabel = document.querySelector('#test-plan-form label[for="plan-description"]');
        if (planDescriptionLabel) {
            planDescriptionLabel.textContent = window.i18n.t('modal.planDescription');
        }
        
        const modalCancelBtn = document.getElementById('modal-cancel-btn');
        if (modalCancelBtn) {
            modalCancelBtn.textContent = window.i18n.t('modal.cancel');
        }
        
        const savePlanBtn = document.getElementById('save-plan-btn');
        if (savePlanBtn) {
            savePlanBtn.textContent = window.i18n.t('modal.save');
        }
        
        const updatePlanBtn = document.getElementById('update-plan-btn');
        if (updatePlanBtn) {
            updatePlanBtn.textContent = window.i18n.t('modal.updatePlan');
        }
        
        const renameModalTitle = document.getElementById('rename-modal-title');
        if (renameModalTitle) {
            renameModalTitle.textContent = window.i18n.t('modal.rename');
        }
        
        const renameLabel = document.querySelector('#rename-modal-form label[for="rename-input"]');
        if (renameLabel) {
            renameLabel.textContent = window.i18n.t('modal.name');
        }
        
        const renameInput = document.getElementById('rename-input');
        if (renameInput) {
            renameInput.placeholder = window.i18n.t('modal.enterNewName');
        }
        
        const renameModalCancelBtn = document.getElementById('rename-modal-cancel-btn');
        if (renameModalCancelBtn) {
            renameModalCancelBtn.textContent = window.i18n.t('modal.cancel');
        }
        
        const renameModalSaveBtn = document.getElementById('rename-modal-save-btn');
        if (renameModalSaveBtn) {
            renameModalSaveBtn.textContent = window.i18n.t('modal.save');
        }
    }

    setupEventListeners() {
        this.setupTransparentAreaClickThrough();
        
        // 阻止滚动的处理函数
        this.preventScroll = (e) => {
            const mainContent = document.querySelector('.main-content');
            if (mainContent && mainContent.classList.contains('dropdown-open')) {
                e.preventDefault();
            }
        };
        
        // 全局点击事件 - 关闭所有下拉框
        document.addEventListener('click', () => {
            const hadOpenDropdowns = document.querySelectorAll('.custom-select__options.show').length > 0;
            document.querySelectorAll('.custom-select__options.show').forEach(opt => {
                opt.classList.remove('show');
            });
            if (hadOpenDropdowns) {
                const mainContent = document.querySelector('.main-content');
                if (mainContent) {
                    mainContent.classList.remove('dropdown-open');
                    mainContent.removeEventListener('wheel', this.preventScroll, { passive: false });
                }
            }
        });
        
        // 导航标签切换
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.switchTab(tab);
            });
        });
        
        // 目录选择
        document.getElementById('select-directory-btn').addEventListener('click', () => {
            this.selectDirectory();
        });

        // 测试运行控制
        document.getElementById('run-tests-btn').addEventListener('click', () => {
            this.runTests();
        });

        document.getElementById('stop-tests-btn').addEventListener('click', () => {
            this.stopTests();
        });

        document.getElementById('view-report-btn').addEventListener('click', () => {
            this.viewReport();
        });

        // 输出清除
        document.getElementById('clear-output-btn').addEventListener('click', () => {
            this.clearOutput();
        });

        // 测试计划管理
        document.getElementById('new-plan-btn').addEventListener('click', async () => {
            await this.showNewPlanModal();
        });
        
        document.getElementById('edit-plan-btn').addEventListener('click', () => {
            this.editTestPlan();
        });
        
        document.getElementById('delete-plan-btn').addEventListener('click', () => {
            this.deleteTestPlan();
        });

        // 模态框控制
        document.getElementById('modal-close-btn').addEventListener('click', () => {
            this.hideModal();
        });

        document.getElementById('modal-cancel-btn').addEventListener('click', () => {
            this.hideModal();
        });

        document.getElementById('test-plan-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveTestPlan();
        });
        
        document.getElementById('update-plan-btn').addEventListener('click', () => {
            this.updateTestPlan();
        });

        // 设备管理
        const deviceManagementBtn = document.getElementById('device-management-btn');
        if (deviceManagementBtn) {
            deviceManagementBtn.addEventListener('click', () => {
                this.showDeviceManagementModal();
            });
        }

        // 设备管理模态框控制
        const deviceModalCloseBtn = document.getElementById('device-modal-close-btn');
        if (deviceModalCloseBtn) {
            deviceModalCloseBtn.addEventListener('click', () => {
                this.hideDeviceModal();
            });
        }

        const deviceModalCancelBtn = document.getElementById('device-modal-cancel-btn');
        if (deviceModalCancelBtn) {
            deviceModalCancelBtn.addEventListener('click', () => {
                // 检查当前是否显示输入IP页面
                const addDeviceInputContainer = document.getElementById('add-device-input-container');
                const deviceListElement = document.getElementById('device-list');
                
                if (addDeviceInputContainer && !addDeviceInputContainer.classList.contains('hidden')) {
                    // 当前在输入IP页面，返回设备列表
                    this.hideAddDeviceInput();
                } else if (deviceListElement && !deviceListElement.classList.contains('hidden')) {
                    // 当前在设备列表页面，关闭弹窗
                    this.hideDeviceModal();
                } else {
                    // 默认关闭弹窗
                    this.hideDeviceModal();
                }
            });
        }

        const deviceModalConfirmBtn = document.getElementById('device-modal-confirm-btn');
        if (deviceModalConfirmBtn) {
            deviceModalConfirmBtn.addEventListener('click', () => {
                this.confirmDeviceSelection();
            });
        }

        // 编辑安卓设备连接标识弹窗控制
        const editDeviceIdCloseBtn = document.getElementById('edit-device-id-modal-close-btn');
        if (editDeviceIdCloseBtn) {
            editDeviceIdCloseBtn.addEventListener('click', () => {
                this.hideEditDeviceIdModal();
            });
        }

        const editDeviceIdCancelBtn = document.getElementById('edit-device-id-cancel-btn');
        if (editDeviceIdCancelBtn) {
            editDeviceIdCancelBtn.addEventListener('click', () => {
                this.hideEditDeviceIdModal();
            });
        }

        const editDeviceIdConfirmBtn = document.getElementById('edit-device-id-confirm-btn');
        if (editDeviceIdConfirmBtn) {
            editDeviceIdConfirmBtn.addEventListener('click', () => {
                this.confirmEditDeviceId();
            });
        }

        const editDeviceIdManageBtn = document.getElementById('edit-device-id-manage-btn');
        if (editDeviceIdManageBtn) {
            editDeviceIdManageBtn.addEventListener('click', () => {
                this.showDeviceManagementModalForEdit();
            });
        }

        // 端口管理按钮
        const editPortManageBtn = document.getElementById('edit-port-manage-btn');
        if (editPortManageBtn) {
            editPortManageBtn.addEventListener('click', () => {
                this.showPortManagementModal();
            });
        }

        // 蓝牙端口输入框验证 - 只允许COM+数字格式
        const blePortInput = document.getElementById('edit-ble-port-input');
        if (blePortInput) {
            blePortInput.addEventListener('input', (e) => {
                let value = e.target.value.toUpperCase();
                if (value.length > 0) {
                    if (/^COM\d*$/.test(value)) {
                        e.target.value = value;
                    } else if (/^C(O(M)?)?$/.test(value)) {
                        e.target.value = value;
                    } else {
                        const digits = value.replace(/\D/g, '');
                        if (digits) {
                            e.target.value = 'COM' + digits;
                        } else {
                            e.target.value = value;
                        }
                    }
                }
            });
            blePortInput.addEventListener('blur', (e) => {
                let value = e.target.value.toUpperCase();
                if (value.length > 0 && !/^COM\d+$/.test(value)) {
                    const digits = value.replace(/\D/g, '');
                    e.target.value = digits ? 'COM' + digits : '';
                }
            });
        }

        // 端口管理弹窗控制
        const portModalCloseBtn = document.getElementById('port-modal-close-btn');
        if (portModalCloseBtn) {
            portModalCloseBtn.addEventListener('click', () => {
                this.hidePortManagementModal();
            });
        }

        const portModalCancelBtn = document.getElementById('port-modal-cancel-btn');
        if (portModalCancelBtn) {
            portModalCancelBtn.addEventListener('click', () => {
                this.hidePortManagementModal();
            });
        }

        const portModalConfirmBtn = document.getElementById('port-modal-confirm-btn');
        if (portModalConfirmBtn) {
            portModalConfirmBtn.addEventListener('click', () => {
                this.confirmPortSelection();
            });
        }

        // 控制参数
        const controlParamsBtn = document.getElementById('control-params-btn');
        if (controlParamsBtn) {
            controlParamsBtn.addEventListener('click', () => {
                this.showControlParamsModal();
            });
        }

        // 控制参数模态框控制
        const controlParamsCloseBtn = document.getElementById('control-params-close-btn');
        if (controlParamsCloseBtn) {
            controlParamsCloseBtn.addEventListener('click', () => {
                this.hideControlParamsModal();
            });
        }

        const controlParamsCancelBtn = document.getElementById('control-params-cancel-btn');
        if (controlParamsCancelBtn) {
            controlParamsCancelBtn.addEventListener('click', () => {
                this.hideControlParamsModal();
            });
        }

        const controlParamsSaveBtn = document.getElementById('control-params-save-btn');
        if (controlParamsSaveBtn) {
            controlParamsSaveBtn.addEventListener('click', () => {
                this.saveControlParams();
            });
        }

        // 确认弹窗控制
        const confirmModalCancelBtn = document.getElementById('confirm-modal-cancel-btn');
        if (confirmModalCancelBtn) {
            confirmModalCancelBtn.addEventListener('click', () => {
                this.hideConfirmModal();
            });
        }

        const confirmModalConfirmBtn = document.getElementById('confirm-modal-confirm-btn');
        if (confirmModalConfirmBtn) {
            confirmModalConfirmBtn.addEventListener('click', () => {
                this.executeConfirmAction();
            });
        }

        const saveConfirmCancelBtn = document.getElementById('save-confirm-cancel-btn');
        if (saveConfirmCancelBtn) {
            saveConfirmCancelBtn.addEventListener('click', () => {
                this.hideSaveConfirmModal();
            });
        }

        const saveConfirmDiscardBtn = document.getElementById('save-confirm-discard-btn');
        if (saveConfirmDiscardBtn) {
            saveConfirmDiscardBtn.addEventListener('click', () => {
                this.executeSaveConfirmDiscard();
            });
        }

        const saveConfirmSaveBtn = document.getElementById('save-confirm-save-btn');
        if (saveConfirmSaveBtn) {
            saveConfirmSaveBtn.addEventListener('click', () => {
                this.executeSaveConfirmSave();
            });
        }

        // 屏幕控制
        const screenControlBtn = document.getElementById('screen-control-btn');
        if (screenControlBtn) {
            screenControlBtn.addEventListener('click', () => {
                this.startScreenControl();
            });
        }

        // scrcpy 进程错误监听
        if (window.electronAPI && window.electronAPI.onScrcpyError) {
            window.electronAPI.onScrcpyError((data) => {
                if (data.error === 'crash') {
                    Toast.error(window.i18n.t('screenControl.crashError'));
                } else {
                    Toast.error(`${window.i18n.t('screenControl.startFailed')}: ${data.error}`);
                }
            });
        }

        // 设置页面控件事件监听
        this.setupSettingsEventListeners();

        // 测试输出监听
        window.electronAPI.onTestOutput((event, data) => {
            this.appendOutput(data);
        });

        window.electronAPI.onTestError((event, data) => {
            this.appendError(data);
        });
        
        // 文件管理器事件监听
        this.setupFileManagerEventListeners();

        // 定时计划管理
        document.getElementById('new-scheduled-plan-btn').addEventListener('click', async () => {
            await this.showNewScheduledPlanModal();
        });

        document.getElementById('edit-scheduled-plan-btn').addEventListener('click', () => {
            this.editScheduledPlan();
        });

        document.getElementById('delete-scheduled-plan-btn').addEventListener('click', () => {
            this.deleteScheduledPlan();
        });

        // 定时计划模态框控制
        document.getElementById('scheduled-plan-modal-close-btn').addEventListener('click', () => {
            this.hideScheduledPlanModal();
        });

        document.getElementById('scheduled-plan-cancel-btn').addEventListener('click', () => {
            this.hideScheduledPlanModal();
        });

        document.getElementById('scheduled-plan-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveScheduledPlan();
        });

        document.getElementById('update-scheduled-plan-btn').addEventListener('click', () => {
            this.updateScheduledPlan();
        });

        // 定时执行事件监听
        if (window.electronAPI && window.electronAPI.onScheduledTestStart) {
            window.electronAPI.onScheduledTestStart((event, data) => {
                this.handleScheduledTestStart(data);
            });
        }
        
        // 定时计划过期事件监听
        if (window.electronAPI && window.electronAPI.onScheduledPlanExpired) {
            window.electronAPI.onScheduledPlanExpired((event, data) => {
                this.handleScheduledPlanExpired(data);
            });
        }
        
        // 测试用例页面事件
        this.setupTestCaseEvents();
    }

    setupTestCaseEvents() {
        const selectDirBtn = document.getElementById('tc-select-directory-btn');
        if (selectDirBtn) {
            selectDirBtn.addEventListener('click', () => this.tcSelectDirectory());
        }

        const searchInput = document.getElementById('tc-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                const query = searchInput.value.trim();
                this.tcSearchQuery = query;
                const clearBtn = document.getElementById('tc-search-clear');
                if (clearBtn) {
                    clearBtn.classList.toggle('hidden', !query);
                }
                clearTimeout(this.tcSearchDebounceTimer);
                if (!query) {
                    this.tcDisplayTestFiles();
                    return;
                }
                const spinner = document.getElementById('tc-search-spinner');
                if (spinner) spinner.classList.remove('hidden');
                this.tcSearchDebounceTimer = setTimeout(() => {
                    this.tcPerformSearch(query);
                }, 1000);
            });
        }

        const searchClearBtn = document.getElementById('tc-search-clear');
        if (searchClearBtn) {
            searchClearBtn.addEventListener('click', () => {
                const input = document.getElementById('tc-search-input');
                if (input) input.value = '';
                this.tcSearchQuery = '';
                searchClearBtn.classList.add('hidden');
                clearTimeout(this.tcSearchDebounceTimer);
                this.tcDisplayTestFiles();
            });
        }

        // 添加新用例按钮
        const addNewBtn = document.getElementById('tc-add-new-btn');
        if (addNewBtn) {
            addNewBtn.addEventListener('click', () => {
                if (addNewBtn.hasAttribute('disabled') || addNewBtn.classList.contains('disabled')) {
                    return;
                }
                this.tcShowEditor();
                // 初始化编辑器
                this.tcInitEditor();
            });
        }

        // 添加步骤按钮
        const addStepBtn = document.getElementById('tc-add-step-btn');
        if (addStepBtn) {
            addStepBtn.addEventListener('click', () => this.tcAddStep());
        }

        // 底部添加步骤按钮
        const addStepBottomBtn = document.getElementById('tc-add-step-bottom-btn');
        if (addStepBottomBtn) {
            addStepBottomBtn.addEventListener('click', () => this.tcAddStep());
        }

        // 取消编辑按钮
        const cancelBtn = document.getElementById('tc-cancel-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.tcCancelEdit();
                this.tcResetEditor();
            });
        }

        // 保存按钮
        const saveBtn = document.getElementById('tc-save-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.tcSaveCase());
        }

        // 删除按钮
        const deleteBtn = document.getElementById('tc-delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => this.tcDeleteCase());
        }
    }

    async tcSelectDirectory() {
        try {
            const result = await window.electronAPI.selectDirectory();
            if (result && !result.canceled && result.filePaths.length > 0) {
                this.tcSelectedDirectory = result.filePaths[0];
                const selectedDirElement = document.getElementById('tc-selected-directory');
                if (selectedDirElement) {
                    const folderName = this.tcSelectedDirectory.split(/[\\/]/).pop();
                    selectedDirElement.textContent = folderName;
                    selectedDirElement.setAttribute('title', this.tcSelectedDirectory);
                }
                await this.tcScanTestFiles();
                this.tcUpdateAddButtonState(true);
                const searchInput = document.getElementById('tc-search-input');
                if (searchInput) {
                    searchInput.disabled = false;
                    searchInput.closest('.tc-search-input-wrapper').classList.remove('disabled');
                }
            }
        } catch (error) {
            console.error('选择目录失败:', error);
        }
    }

    tcUpdateAddButtonState(enabled) {
        const addBtn = document.getElementById('tc-add-new-btn');
        if (addBtn) {
            if (enabled) {
                addBtn.removeAttribute('disabled');
                addBtn.classList.remove('disabled');
            } else {
                addBtn.setAttribute('disabled', 'true');
                addBtn.classList.add('disabled');
            }
        }
    }

    async tcScanTestFiles() {
        if (!this.tcSelectedDirectory) return;
        
        try {
            const files = await window.electronAPI.scanTestFiles(this.tcSelectedDirectory);
            this.tcTestFiles = files || [];
            await this.tcBatchCheckJsonExists();
            const searchInput = document.getElementById('tc-search-input');
            if (searchInput) {
                searchInput.value = '';
                this.tcSearchQuery = '';
            }
            const clearBtn = document.getElementById('tc-search-clear');
            if (clearBtn) clearBtn.classList.add('hidden');
            this.tcDisplayTestFiles();
        } catch (error) {
            console.error('扫描测试文件失败:', error);
        }
    }

    async tcBatchCheckJsonExists() {
        if (!this.tcTestFiles || this.tcTestFiles.length === 0) {
            this.tcJsonExistsMap = {};
            return;
        }
        const fileNames = this.tcTestFiles.map(f => f.name.replace(/\.[^/.]+$/, ''));
        try {
            const result = await window.electronAPI.testCase.batchCheckJsonExists(fileNames);
            if (result.success && result.data) {
                this.tcJsonExistsMap = result.data;
            } else {
                this.tcJsonExistsMap = {};
            }
        } catch (error) {
            console.error('批量检查JSON存在性失败:', error);
            this.tcJsonExistsMap = {};
        }
    }

    async tcPerformSearch(query) {
        const startTime = Date.now();
        const MIN_SPINNER_MS = 500;

        this.tcDisplayTestFiles();

        const elapsed = Date.now() - startTime;
        const remainingDelay = Math.max(0, MIN_SPINNER_MS - elapsed);

        if (remainingDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, remainingDelay));
        }

        const spinner = document.getElementById('tc-search-spinner');
        if (spinner) spinner.classList.add('hidden');
    }

    tcDisplayTestFiles() {
        const container = document.getElementById('tc-test-files-list');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (!this.tcTestFiles || this.tcTestFiles.length === 0) {
            container.innerHTML = `
                <div class="placeholder-message">
                    <span class="svg-icon" data-icon="info"></span>
                    <span data-i18n="testCase.noTestFiles">${window.i18n.t('testCase.noTestFiles')}</span>
                </div>
            `;
            this.initializeIcons();
            return;
        }

        let filesToDisplay = this.tcTestFiles;
        if (this.tcSearchQuery) {
            const query = this.tcSearchQuery.toLowerCase();
            filesToDisplay = this.tcTestFiles.filter(file =>
                file.name.toLowerCase().includes(query)
            );
        }

        if (filesToDisplay.length === 0) {
            container.innerHTML = `
                <div class="tc-no-search-results">
                    <span class="svg-icon" data-icon="search_x"></span>
                    <span data-i18n="testCase.noSearchResults">${window.i18n.t('testCase.noSearchResults')}</span>
                </div>
            `;
            this.initializeIcons();
            return;
        }
        
        const fragment = document.createDocumentFragment();
        filesToDisplay.forEach(file => {
            const fileName = file.name.replace(/\.[^/.]+$/, '');
            const jsonMissing = this.tcJsonExistsMap[fileName] === false;
            const fileElement = document.createElement('div');
            fileElement.className = 'test-case-file-item' + (jsonMissing ? ' json-missing' : '');
            fileElement.setAttribute('data-path', file.path);
            fileElement.innerHTML = `
                ${jsonMissing ? this.getIconHtml('alert_triangle') : this.getIconHtml('description')}
                <span>${file.name}</span>
                ${jsonMissing ? '<span class="tc-json-missing-badge" data-i18n="testCase.jsonMissing">' + window.i18n.t('testCase.jsonMissing') + '</span>' : ''}
            `;
            
            fileElement.addEventListener('click', () => this.tcSelectFile(file, fileElement));
            fragment.appendChild(fileElement);
        });
        container.appendChild(fragment);
    }

    tcSelectFile(file, element) {
        if (element.classList.contains('selected')) {
            if (this.tcHasUnsavedChanges) {
                this.showSaveConfirmModal(
                    window.i18n.t('testCase.unsavedChangesTitle') || '未保存的更改',
                    window.i18n.t('testCase.unsavedChangesMessage') || '当前编辑有未保存的更改，是否保存？',
                    () => {
                        this.tcSaveCase().then(() => {
                            this.tcDoDeselectFile(element);
                        });
                    },
                    () => {
                        this.tcDoDeselectFile(element);
                    }
                );
                return;
            }
            this.tcDoDeselectFile(element);
            return;
        }

        const doSelectFile = () => {
            document.querySelectorAll('.test-case-file-item.selected').forEach(item => {
                item.classList.remove('selected');
            });
            element.classList.add('selected');
            this.tcSelectedFile = file;
            this.tcHasUnsavedChanges = false;
            this.tcShowEditor(file);
        };

        if (this.tcHasUnsavedChanges) {
            this.showSaveConfirmModal(
                window.i18n.t('testCase.unsavedChangesTitle') || '未保存的更改',
                window.i18n.t('testCase.unsavedChangesMessage') || '当前编辑有未保存的更改，是否保存？',
                () => {
                    this.tcSaveCase().then(() => {
                        doSelectFile();
                    });
                },
                () => {
                    doSelectFile();
                }
            );
            return;
        }

        doSelectFile();
    }

    tcDoDeselectFile(element) {
        element.classList.remove('selected');
        this.tcSelectedFile = null;
        this.tcLoadedDeviceConfig = null;
        this.tcLoadedBleDevice = null;
        this.tcHasUnsavedChanges = false;

        const emptyState = document.getElementById('tc-editor-empty');
        const editorForm = document.getElementById('tc-editor-form');
        if (editorForm) editorForm.classList.add('hidden');
        if (emptyState) emptyState.classList.remove('hidden');

        const fileNameInput = document.getElementById('tc-file-name');
        if (fileNameInput) fileNameInput.value = '';
    }

    async tcShowEditor(file = null) {
        const emptyState = document.getElementById('tc-editor-empty');
        const editorForm = document.getElementById('tc-editor-form');
        const titleElement = document.querySelector('#tc-editor-form .card-header h3');
        const deleteBtn = document.getElementById('tc-delete-btn');
        const saveBtn = document.getElementById('tc-save-btn');

        if (file) {
            const fileName = file.name.replace(/\.[^/.]+$/, '');
            const jsonCheck = await window.electronAPI.testCase.checkJsonExists(fileName);

            if (!jsonCheck.exists) {
                this.tcIsEditing = false;
                this.tcResetEditor();

                if (titleElement) {
                    titleElement.setAttribute('data-i18n', 'testCase.editCase');
                    titleElement.textContent = window.i18n.t('testCase.editCase');
                }
                const fileNameInput = document.getElementById('tc-file-name');
                if (fileNameInput) {
                    fileNameInput.value = fileName;
                    fileNameInput.disabled = true;
                }
                if (deleteBtn) {
                    deleteBtn.classList.remove('hidden');
                }
                if (saveBtn) {
                    saveBtn.disabled = true;
                    saveBtn.classList.add('disabled');
                }
                if (emptyState) emptyState.classList.add('hidden');
                if (editorForm) editorForm.classList.remove('hidden');

                const editorContentNoJson = document.querySelector('.tc-editor-content');
                if (editorContentNoJson) {
                    editorContentNoJson.scrollTop = 0;
                }

                await this.tcInitEditor();

                const formInputs = editorForm.querySelectorAll('input, select, textarea, button:not(#tc-delete-btn):not(#tc-cancel-btn)');
                formInputs.forEach(el => {
                    el.disabled = true;
                    el.classList.add('disabled');
                });

                this.tcShowJsonMissingWarning(fileName);
                return;
            }

            this.tcIsEditing = true;
            if (titleElement) {
                titleElement.setAttribute('data-i18n', 'testCase.editCase');
                titleElement.textContent = window.i18n.t('testCase.editCase');
            }
            const fileNameInput = document.getElementById('tc-file-name');
            if (fileNameInput) {
                fileNameInput.value = fileName;
                fileNameInput.disabled = false;
            }
            if (deleteBtn) {
                deleteBtn.classList.remove('hidden');
            }
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.classList.remove('disabled');
            }

            const existingWarning = document.getElementById('tc-json-missing-warning');
            if (existingWarning) existingWarning.remove();

            const formInputs = editorForm.querySelectorAll('input, select, textarea, button');
            formInputs.forEach(el => {
                el.disabled = false;
                el.classList.remove('disabled');
            });
        } else {
            this.tcIsEditing = false;
            if (titleElement) {
                titleElement.setAttribute('data-i18n', 'testCase.newCase');
                titleElement.textContent = window.i18n.t('testCase.newCase');
            }
            const fileNameInput = document.getElementById('tc-file-name');
            if (fileNameInput) {
                fileNameInput.value = '';
                fileNameInput.disabled = false;
            }
            if (deleteBtn) {
                deleteBtn.classList.add('hidden');
            }
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.classList.remove('disabled');
            }

            const existingWarning = document.getElementById('tc-json-missing-warning');
            if (existingWarning) existingWarning.remove();

            const formInputs = editorForm.querySelectorAll('input, select, textarea, button');
            formInputs.forEach(el => {
                el.disabled = false;
                el.classList.remove('disabled');
            });

            this.tcResetEditor();
        }

        if (emptyState) emptyState.classList.add('hidden');
        if (editorForm) editorForm.classList.remove('hidden');

        const editorContent = document.querySelector('.tc-editor-content');
        if (editorContent) {
            editorContent.scrollTop = 0;
        }

        await this.tcInitEditor();

        if (file) {
            await this.tcLoadCaseData(file.name.replace(/\.[^/.]+$/, ''));
        }

        this.tcHideError();
    }

    tcShowJsonMissingWarning(fileName) {
        const existingWarning = document.getElementById('tc-json-missing-warning');
        if (existingWarning) existingWarning.remove();

        const editorContent = document.querySelector('.tc-editor-content');
        if (!editorContent) return;

        const warningDiv = document.createElement('div');
        warningDiv.id = 'tc-json-missing-warning';
        warningDiv.className = 'tc-json-missing-warning';
        warningDiv.innerHTML = `
            <span class="svg-icon" data-icon="warning"></span>
            <span>${window.i18n.t('testCase.jsonMissingWarning', { fileName })}</span>
        `;
        editorContent.insertBefore(warningDiv, editorContent.firstChild);
        this.initializeIcons();
    }

    /**
     * 加载测试用例数据并填充表单
     */
    async tcLoadCaseData(fileName) {
        try {
            const result = await window.electronAPI.testCase.get(fileName);
            if (!result.success) {
                console.error('加载测试用例数据失败:', result.error);
                return;
            }

            const caseData = result.data;
            
            // 填充用例名称
            const caseNameInput = document.getElementById('tc-case-name');
            if (caseNameInput) {
                caseNameInput.value = caseData.name || '';
            }

            // 填充描述
            const descriptionInput = document.getElementById('tc-description');
            if (descriptionInput) {
                descriptionInput.value = caseData.description || '';
            }

            // 填充Allure配置
            const allureConfig = caseData.allureConfig || {};
            const epicInput = document.getElementById('tc-allure-epic');
            const featureInput = document.getElementById('tc-allure-feature');
            const storyInput = document.getElementById('tc-allure-story');

            if (epicInput) epicInput.value = allureConfig.epic || '';
            if (featureInput) featureInput.value = allureConfig.feature || '';
            if (storyInput) storyInput.value = allureConfig.story || '';

            // 填充等待时间配置
            const waitTimeConfig = caseData.waitTimeConfig || {};
            const appLoadWaitTimeInput = document.getElementById('tc-app-load-wait-time');
            const elementWaitTimeoutInput = document.getElementById('tc-element-wait-timeout');
            const stepIntervalInput = document.getElementById('tc-step-interval');
            const appCloseWaitTimeInput = document.getElementById('tc-app-close-wait-time');
            if (appLoadWaitTimeInput) appLoadWaitTimeInput.value = waitTimeConfig.appLoadWaitTime ?? 10;
            if (elementWaitTimeoutInput) elementWaitTimeoutInput.value = waitTimeConfig.elementWaitTimeout ?? 30;
            if (stepIntervalInput) stepIntervalInput.value = waitTimeConfig.stepInterval ?? 2;
            if (appCloseWaitTimeInput) appCloseWaitTimeInput.value = waitTimeConfig.appCloseWaitTime ?? 2;

            // 设置选中的Markers
            const savedMarkers = allureConfig.markers || [];
            this.tcSelectedMarkers = savedMarkers;
            
            // 更新Markers选项选中状态
            const markersOptionsContainer = document.getElementById('tc-markers-options');
            if (markersOptionsContainer) {
                markersOptionsContainer.querySelectorAll('.custom-select__option').forEach(opt => {
                    opt.classList.toggle('selected', savedMarkers.includes(opt.dataset.value));
                });
            }

            // 更新Markers显示（徽章形式）
            this.tcUpdateMarkersDisplay();

            // 设置选中的应用
            if (caseData.targetApp && caseData.targetApp.id) {
                this.tcSelectedApp = caseData.targetApp;
                // 更新应用选择下拉框显示
                const selectedSpan = document.querySelector('#tc-app-selected .custom-select__text');
                if (selectedSpan) {
                    selectedSpan.textContent = caseData.targetApp.name || '';
                }
                // 更新选项选中状态
                const optionsContainer = document.getElementById('tc-app-options');
                if (optionsContainer) {
                    optionsContainer.querySelectorAll('.custom-select__option').forEach(opt => {
                        opt.classList.toggle('selected', opt.dataset.value === caseData.targetApp.id);
                    });
                }
                // 启用测试步骤卡片
                this.tcUpdateStepsSectionState(true);
            }

            // 加载步骤
            if (caseData.steps && caseData.steps.length > 0) {
                this.tcSteps = caseData.steps;
                this.tcRenderSteps();
                this.tcHideStepsEmpty();
            } else {
                this.tcSteps = [];
                const container = document.getElementById('tc-steps-list');
                if (container) container.innerHTML = '';
                this.tcShowStepsEmpty();
            }

            // 加载设备配置和蓝牙设备配置（编辑时保留）
            this.tcLoadedDeviceConfig = caseData.deviceConfig || null;
            this.tcLoadedBleDevice = caseData.bleDevice || null;

        } catch (error) {
            console.error('加载测试用例数据失败:', error);
        }
    }

    tcCancelEdit() {
        if (this.tcHasUnsavedChanges) {
            this.showSaveConfirmModal(
                window.i18n.t('testCase.unsavedChangesTitle') || '未保存的更改',
                window.i18n.t('testCase.unsavedChangesMessage') || '当前编辑有未保存的更改，是否保存？',
                () => {
                    this.tcSaveCase().then(() => {
                        this.tcDoCancelEdit();
                    });
                },
                () => {
                    this.tcDoCancelEdit();
                }
            );
            return;
        }
        this.tcDoCancelEdit();
    }

    tcDoCancelEdit() {
        const emptyState = document.getElementById('tc-editor-empty');
        const editorForm = document.getElementById('tc-editor-form');
        
        if (editorForm) editorForm.classList.add('hidden');
        if (emptyState) emptyState.classList.remove('hidden');
        
        const fileNameInput = document.getElementById('tc-file-name');
        if (fileNameInput) {
            fileNameInput.value = '';
            fileNameInput.disabled = false;
        }

        const saveBtn = document.getElementById('tc-save-btn');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.classList.remove('disabled');
        }

        const formInputs = editorForm.querySelectorAll('input, select, textarea, button');
        formInputs.forEach(el => {
            el.disabled = false;
            el.classList.remove('disabled');
        });

        const existingWarning = document.getElementById('tc-json-missing-warning');
        if (existingWarning) existingWarning.remove();
        
        document.querySelectorAll('.test-case-file-item.selected').forEach(item => {
            item.classList.remove('selected');
        });
        this.tcSelectedFile = null;
        this.tcIsEditing = false;
        this.tcHasUnsavedChanges = false;
        this.tcLoadedDeviceConfig = null;
        this.tcLoadedBleDevice = null;
        
        this.tcHideError();
    }

    async tcSaveCase() {
        const fileNameInput = document.getElementById('tc-file-name');
        let fileName = fileNameInput ? fileNameInput.value.trim() : '';

        if (!fileName) {
            Toast.error(window.i18n.t('testCase.fileNameRequired'));
            return;
        }

        const validPattern = /^[a-zA-Z0-9_]+$/;
        if (!validPattern.test(fileName)) {
            Toast.error(window.i18n.t('testCase.fileNameInvalidChars'));
            return;
        }

        if (!this.tcSelectedDirectory) {
            Toast.error(window.i18n.t('testCase.selectCaseFirst'));
            return;
        }

        // 检查是否选择了目标应用
        if (!this.tcSelectedApp) {
            Toast.error(window.i18n.t('testCase.selectAppFirst'));
            return;
        }

        // 收集表单数据
        const caseData = this.tcCollectFormData();

        try {
            // 使用新的API保存并生成Python文件
            const result = await window.electronAPI.testCase.saveAndGenerate(caseData, this.tcSelectedDirectory);

            if (result && result.success) {
                Toast.success(window.i18n.t('testCase.saveSuccess'));

                await this.tcScanTestFiles();

                this.tcHasUnsavedChanges = false;
                this.tcCancelEdit();
            } else {
                Toast.error(result?.error || (window.i18n.t('testCase.saveFailed')));
            }
        } catch (error) {
            console.error('保存测试用例失败:', error);
            Toast.error(window.i18n.t('testCase.saveFailed'));
        }
    }

    tcShowError(messageKey) {
        const errorElement = document.getElementById('tc-file-name-error');
        const messageSpan = errorElement ? errorElement.querySelector('span:last-child') : null;
        
        if (errorElement && messageSpan) {
            messageSpan.setAttribute('data-i18n', messageKey);
            messageSpan.textContent = window.i18n.t(messageKey);
            errorElement.classList.remove('error-hidden');
        }
    }

    tcHideError() {
        const errorElement = document.getElementById('tc-file-name-error');
        if (errorElement) {
            errorElement.classList.add('error-hidden');
        }
    }

    async tcDeleteCase() {
        if (!this.tcSelectedFile) {
            Toast.error(window.i18n.t('testCase.noFileSelected'));
            return;
        }
        
        const title = window.i18n.t('testCase.deleteConfirmTitle');
        const message = window.i18n.t('testCase.deleteConfirmMessage', { name: this.tcSelectedFile.name });
        
        this.showConfirmModal(title, message, async () => {
            try {
                const pyFileName = this.tcSelectedFile.name;
                const fileName = pyFileName.replace('.py', '');
                const pyFilePath = this.tcSelectedFile.path;
                const result = await window.electronAPI.testCase.delete({ fileName, pyFilePath });
                
                if (result && result.success) {
                    Toast.success(window.i18n.t('testCase.deleteSuccess'));
                    
                    await this.tcScanTestFiles();
                    
                    this.tcCancelEdit();
                } else {
                    Toast.error(result?.error || (window.i18n.t('testCase.deleteFailed')));
                }
            } catch (error) {
                console.error('删除测试用例失败:', error);
                Toast.error(window.i18n.t('testCase.deleteFailed'));
            }
        });
    }

    async loadProjectInfo() {
        try {
            // 安全检查：确保electronAPI已加载
            if (!window.electronAPI || !window.electronAPI.getProjectInfo) {
                console.error('electronAPI未定义，无法加载项目信息:', window.electronAPI);
                return;
            }
            
            const info = await window.electronAPI.getProjectInfo();

        } catch (error) {
            console.error('加载项目信息失败:', error);
        }
    }

    async loadConfig() {
        try {
            // 安全检查：确保electronAPI已加载
            if (!window.electronAPI || !window.electronAPI.getConfig) {
                console.error('electronAPI未定义，无法加载配置:', window.electronAPI);
                return;
            }
            
            const config = await window.electronAPI.getConfig();
            if (config && config.APP_SETTINGS) {
                // 更新黑暗模式开关状态
                const darkModeToggle = document.getElementById('dark-mode-toggle');
                if (darkModeToggle) {
                    darkModeToggle.checked = config.APP_SETTINGS.dark_mode || false;
                }
                
                // 更新默认下载路径
                const defaultTestDirectory = document.getElementById('default-test-directory');
                if (defaultTestDirectory) {
                    defaultTestDirectory.value = config.APP_SETTINGS.default_download_directory || '';
                    // 更新悬浮提示内容
                    const directoryTooltip = document.querySelector('.directory-tooltip');
                    if (directoryTooltip) {
                        directoryTooltip.textContent = defaultTestDirectory.value;
                    }
                }
                
                // 更新主题色预览
                const themeColorPreview = document.getElementById('theme-color-preview');
                if (themeColorPreview) {
                    const themeColor = config.APP_SETTINGS.theme_color || '#4CAF50';
                    themeColorPreview.style.backgroundColor = themeColor;
                }
                
                // 更新主题色HEX输入框
                const themeColorHex = document.getElementById('theme-color-hex');
                if (themeColorHex) {
                    const themeColor = config.APP_SETTINGS.theme_color || '#4CAF50';
                    themeColorHex.value = themeColor.toUpperCase();
                }
                
                // 更新主题色选项的选中状态
                const themeColorOptions = document.querySelectorAll('.theme-color-option');
                const selectedColor = config.APP_SETTINGS.theme_color || '#4CAF50';
                themeColorOptions.forEach(option => {
                    if (option.dataset.color === selectedColor) {
                        option.classList.add('selected');
                    } else {
                        option.classList.remove('selected');
                    }
                });
                
                // 更新自定义语言选择器
                const languageValue = config.APP_SETTINGS.language || 'zh-CN';
                const customLanguageSelected = document.getElementById('custom-language-selected');
                const customLanguageOptions = document.getElementById('custom-language-options');
                
                if (customLanguageSelected && customLanguageOptions) {
                    const languageNames = {
                        'zh-CN': '简体中文',
                        'en-US': 'English'
                    };
                    const displayText = languageNames[languageValue] || '简体中文';
                    
                    // 更新选中显示的文本
                    const selectedSpan = customLanguageSelected.querySelector('.custom-select__text');
                    if (selectedSpan) {
                        selectedSpan.textContent = displayText;
                    }
                    
                    // 标记选中的选项
                    const options = customLanguageOptions.querySelectorAll('.custom-select__option');
                    options.forEach(option => {
                        if (option.dataset.value === languageValue) {
                            option.classList.add('selected');
                        } else {
                            option.classList.remove('selected');
                        }
                    });
                }
                
                // 应用黑暗模式
                this.applyDarkMode(config.APP_SETTINGS.dark_mode || false);
                
                // 应用主题色
                const themeColor = config.APP_SETTINGS.theme_color || '#4CAF50';
                this.applyThemeColor(themeColor);
                
                // 应用语言设置
                this.changeLanguage(languageValue);
                
                // 加载通知配置
                this.loadNotificationConfig(config.APP_SETTINGS.notification);

                // 更新自动检查更新开关
                const autoCheckUpdateToggle = document.getElementById('auto-check-update-toggle');
                if (autoCheckUpdateToggle) {
                    autoCheckUpdateToggle.checked = config.APP_SETTINGS.autoCheckUpdate === true;
                }

                const preventSleepToggle = document.getElementById('prevent-sleep-toggle');
                if (preventSleepToggle) {
                    preventSleepToggle.checked = config.APP_SETTINGS.preventSleep || false;
                }
            }
        } catch (error) {
            console.error('加载配置失败:', error);
        }
    }
    
    async loadVersionInfo() {
        try {
            if (!window.electronAPI || !window.electronAPI.getVersionInfo) {
                console.error('electronAPI未定义，无法加载版本信息');
                return;
            }
            
            const result = await window.electronAPI.getVersionInfo();
            if (result && result.success && result.data) {
                const versionInfo = result.data;
                
                const versionElement = document.getElementById('app-version-info');
                if (versionElement) {
                    versionElement.textContent = versionInfo.fullVersion 
                        ? `v${versionInfo.fullVersion}` 
                        : `v${versionInfo.version || '0.0.0'}`;
                }
                
                const buildDateElement = document.querySelector('.version-item:nth-child(2) .version-value');
                if (buildDateElement && versionInfo.buildDate) {
                    buildDateElement.textContent = versionInfo.buildDate;
                }
            }
        } catch (error) {
            console.error('加载版本信息失败:', error);
        }
    }
    
    loadNotificationConfig(notificationConfig) {
        if (!notificationConfig) {
            notificationConfig = {
                platform: 'none',
                dingtalk: {
                    access_token: '',
                    secret: ''
                }
            };
        }
        
        const platform = notificationConfig.platform || 'none';
        
        const notificationPlatformSelected = document.getElementById('custom-notification-platform-selected');
        const notificationPlatformOptions = document.getElementById('custom-notification-platform-options');
        
        if (notificationPlatformSelected && notificationPlatformOptions) {
            const platformI18nKeys = {
                'none': 'settings.none',
                'dingtalk': 'settings.dingtalk'
            };
            const platformNames = {
                'none': window.i18n.t('settings.none'),
                'dingtalk': window.i18n.t('settings.dingtalk')
            };
            const displayText = platformNames[platform] || platformNames['none'];
            const i18nKey = platformI18nKeys[platform] || platformI18nKeys['none'];
            
            const selectedSpan = notificationPlatformSelected.querySelector('.custom-select__text');
            if (selectedSpan) {
                selectedSpan.textContent = displayText;
                selectedSpan.setAttribute('data-i18n', i18nKey);
            }
            
            const options = notificationPlatformOptions.querySelectorAll('.custom-select__option');
            options.forEach(option => {
                if (option.dataset.value === platform) {
                    option.classList.add('selected');
                } else {
                    option.classList.remove('selected');
                }
            });
        }
        
        const accessTokenInput = document.getElementById('notification-access-token');
        const secretInput = document.getElementById('notification-secret');
        const accessTokenItem = document.getElementById('notification-access-token-item');
        const secretItem = document.getElementById('notification-secret-item');
        
        if (notificationConfig.dingtalk) {
            if (accessTokenInput) {
                accessTokenInput.value = notificationConfig.dingtalk.access_token || '';
            }
            if (secretInput) {
                secretInput.value = notificationConfig.dingtalk.secret || '';
            }
        }
        
        if (platform === 'dingtalk') {
            if (accessTokenItem) accessTokenItem.classList.remove('hidden');
            if (secretItem) secretItem.classList.remove('hidden');
        } else {
            if (accessTokenItem) accessTokenItem.classList.add('hidden');
            if (secretItem) secretItem.classList.add('hidden');
        }
    }

    // 应用黑暗模式
    applyDarkMode(isDark) {
        if (isDark) {
            document.body.classList.add('dark-theme');
        } else {
            document.body.classList.remove('dark-theme');
        }
    }
    
    // HEX颜色转RGB
    hexToRgb(hex) {
        hex = hex.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return `${r}, ${g}, ${b}`;
    }
    
    // 应用主题色到UI元素
    applyThemeColor(color) {
        // 转换颜色为RGB格式
        const rgb = this.hexToRgb(color);
        
        // 应用到CSS变量
        document.documentElement.style.setProperty('--primary', color);
        document.documentElement.style.setProperty('--primary-dark', this.darkenColor(color, 0.1));
        document.documentElement.style.setProperty('--primary-light', this.lightenColor(color, 0.4));
        document.documentElement.style.setProperty('--primary-rgb', rgb);
        
        // 应用到按钮
        const primaryButtons = document.querySelectorAll('.material-button.primary');
        primaryButtons.forEach(button => {
            button.style.backgroundColor = color;
        });
        
        // 应用到进度条
        const progressBars = document.querySelectorAll('.progress-fill, .download-progress-bar');
        progressBars.forEach(bar => {
            bar.style.backgroundColor = color;
        });
        
        // 应用到欢迎信息中的XKAutoTester字样
        const welcomeAppName = document.querySelector('.welcome-app-name');
        if (welcomeAppName) {
            welcomeAppName.style.color = color;
        }
        
        // 重置导航标签样式，让CSS类生效
        const navTabs = document.querySelectorAll('.nav-tab');
        navTabs.forEach(tab => {
            tab.style.backgroundColor = '';
        });
        
        // 应用到主题色预览框
        const themeColorPreview = document.getElementById('theme-color-preview');
        if (themeColorPreview) {
            themeColorPreview.style.backgroundColor = color;
        }
        
        // 应用到主题色HEX输入框
        const themeColorHex = document.getElementById('theme-color-hex');
        if (themeColorHex) {
            themeColorHex.value = color.toUpperCase();
        }
    }
    
    // 变暗颜色
    darkenColor(color, amount) {
        const hex = color.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        
        const darkenR = Math.floor(r * (1 - amount));
        const darkenG = Math.floor(g * (1 - amount));
        const darkenB = Math.floor(b * (1 - amount));
        
        return `#${darkenR.toString(16).padStart(2, '0')}${darkenG.toString(16).padStart(2, '0')}${darkenB.toString(16).padStart(2, '0')}`;
    }
    
    // 变亮颜色
    lightenColor(color, amount) {
        const hex = color.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        
        const lightenR = Math.min(255, Math.floor(r + (255 - r) * amount));
        const lightenG = Math.min(255, Math.floor(g + (255 - g) * amount));
        const lightenB = Math.min(255, Math.floor(b + (255 - b) * amount));
        
        return `#${lightenR.toString(16).padStart(2, '0')}${lightenG.toString(16).padStart(2, '0')}${lightenB.toString(16).padStart(2, '0')}`;
    }

    // 将RGB颜色转换为HEX格式
    rgbToHex(rgb) {
        // 处理RGB格式：rgb(r, g, b)
        if (rgb.startsWith('rgb')) {
            const match = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
            if (match) {
                const r = parseInt(match[1]);
                const g = parseInt(match[2]);
                const b = parseInt(match[3]);
                return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
            }
        }
        // 如果已经是HEX格式或其他格式，直接返回
        return rgb;
    }

    // 显示Toast提示
    setupSettingsEventListeners() {
        // 黑暗模式开关事件监听
        const darkModeToggle = document.getElementById('dark-mode-toggle');
        if (darkModeToggle) {
            darkModeToggle.addEventListener('change', (e) => {
                const isDark = e.target.checked;
                // 立即应用黑暗模式
                this.applyDarkMode(isDark);
                // 保存配置
                this.saveConfig({
                    dark_mode: isDark
                });
            });
        }
        
        // 主题色选择器交互
        const themeColorPreview = document.getElementById('theme-color-preview');
        const themeColorOptions = document.getElementById('theme-color-options');
        
        if (themeColorPreview) {
            // 点击预览显示/隐藏颜色选项
            themeColorPreview.addEventListener('click', (e) => {
                e.stopPropagation();
                
                // 确保HEX输入框显示当前颜色值
                const themeColorHex = document.getElementById('theme-color-hex');
                if (themeColorHex) {
                    const currentColor = themeColorPreview.style.backgroundColor;
                    // 将RGB颜色转换为HEX格式
                    const hexColor = this.rgbToHex(currentColor);
                    themeColorHex.value = hexColor.toUpperCase();
                }
                
                const isShowing = themeColorOptions.classList.toggle('show');
                const mainContent = document.querySelector('.main-content');
                if (isShowing) {
                    if (mainContent) {
                        mainContent.classList.add('dropdown-open');
                        mainContent.addEventListener('wheel', this.preventScroll, { passive: false });
                    }
                } else {
                    if (mainContent) {
                        mainContent.classList.remove('dropdown-open');
                        mainContent.removeEventListener('wheel', this.preventScroll, { passive: false });
                    }
                }
            });
            
            // 点击颜色选项选择颜色
            document.querySelectorAll('.theme-color-option').forEach(option => {
                option.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const themeColor = option.dataset.color;
                    
                    // 更新预览颜色
                    themeColorPreview.style.backgroundColor = themeColor;
                    
                    // 更新HEX输入框
                    const themeColorHex = document.getElementById('theme-color-hex');
                    if (themeColorHex) {
                        themeColorHex.value = themeColor.toUpperCase();
                    }
                    
                    // 更新选中状态
                    document.querySelectorAll('.theme-color-option').forEach(opt => {
                        opt.classList.remove('selected');
                    });
                    option.classList.add('selected');
                    
                    // 应用主题色到UI元素
                    this.applyThemeColor(themeColor);
                    
                    // 隐藏选项
                    themeColorOptions.classList.remove('show');
                    const mainContent = document.querySelector('.main-content');
                    if (mainContent) {
                        mainContent.classList.remove('dropdown-open');
                        mainContent.removeEventListener('wheel', this.preventScroll, { passive: false });
                    }
                    
                    // 保存配置
                    this.saveConfig({
                        theme_color: themeColor
                    });
                });
            });
            
            // HEX值输入框事件监听
            const themeColorHex = document.getElementById('theme-color-hex');
            if (themeColorHex) {
                // 实时转换为大写
                themeColorHex.addEventListener('input', (e) => {
                    e.target.value = e.target.value.toUpperCase();
                });
                
                themeColorHex.addEventListener('change', (e) => {
                    let hexValue = e.target.value.trim();
                    
                    // 验证HEX颜色格式
                    const hexRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
                    if (hexRegex.test(hexValue)) {
                        // 确保格式正确（转换为6位格式）
                        if (hexValue.length === 4) {
                            hexValue = '#' + hexValue[1] + hexValue[1] + hexValue[2] + hexValue[2] + hexValue[3] + hexValue[3];
                        }
                        
                        // 转换为大写
                        hexValue = hexValue.toUpperCase();
                        
                        // 更新预览颜色
                        themeColorPreview.style.backgroundColor = hexValue;
                        
                        // 更新选中状态（移除所有选中状态）
                        document.querySelectorAll('.theme-color-option').forEach(option => {
                            option.classList.remove('selected');
                        });
                        
                        // 应用主题色到UI元素
                        this.applyThemeColor(hexValue);
                        
                        // 保存配置
                        this.saveConfig({
                            theme_color: hexValue
                        });
                    } else {
                        // 显示错误提示
                        Toast.error('请输入有效的HEX颜色格式，如 #4CAF50');
                        
                        // 恢复原来的颜色值
                        const currentColor = themeColorPreview.style.backgroundColor;
                        const hexColor = this.rgbToHex(currentColor);
                        themeColorHex.value = hexColor.toUpperCase();
                    }
                });
            }
            
            // 点击页面其他地方隐藏颜色选项
            document.addEventListener('click', () => {
                if (themeColorOptions.classList.contains('show')) {
                    themeColorOptions.classList.remove('show');
                    const mainContent = document.querySelector('.main-content');
                    if (mainContent) {
                        mainContent.classList.remove('dropdown-open');
                        mainContent.removeEventListener('wheel', this.preventScroll, { passive: false });
                    }
                }
            });
            
            // 阻止选项内部点击事件冒泡
            themeColorOptions.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }
        
        // 更新目录输入框悬浮提示
        const updateDirectoryTooltip = () => {
            const defaultTestDirectory = document.getElementById('default-test-directory');
            const directoryTooltip = document.querySelector('.directory-tooltip');
            if (defaultTestDirectory && directoryTooltip) {
                const value = defaultTestDirectory.value;
                directoryTooltip.textContent = value;
                if (value && value.trim()) {
                    directoryTooltip.classList.remove('empty');
                } else {
                    directoryTooltip.classList.add('empty');
                }
            }
        };

        // 默认下载路径输入框事件监听
        const defaultTestDirectory = document.getElementById('default-test-directory');
        if (defaultTestDirectory) {
            defaultTestDirectory.addEventListener('change', (e) => {
                this.saveConfig({
                    default_download_directory: e.target.value
                });
                updateDirectoryTooltip();
            });
            
            // 初始化悬浮提示内容
            updateDirectoryTooltip();
        }
        
        // 浏览默认测试目录按钮事件监听
        const browseDefaultDirectoryBtn = document.getElementById('browse-default-directory');
        if (browseDefaultDirectoryBtn) {
            browseDefaultDirectoryBtn.addEventListener('click', async () => {
                try {
                    if (!window.electronAPI || !window.electronAPI.selectDirectory) {
                        console.error('electronAPI未定义，无法选择目录:', window.electronAPI);
                        return;
                    }
                    
                    const result = await window.electronAPI.selectDirectory();
                    if (!result.canceled && result.filePaths.length > 0) {
                        const directoryPath = result.filePaths[0];
                        const defaultTestDirectory = document.getElementById('default-test-directory');
                        if (defaultTestDirectory) {
                            defaultTestDirectory.value = directoryPath;
                            this.saveConfig({
                                default_download_directory: directoryPath
                            });
                            updateDirectoryTooltip();
                        }
                    }
                } catch (error) {
                    console.error('选择目录失败:', error);
                }
            });
        }
        
        // 清空默认下载路径按钮事件监听
        const clearDefaultDirectoryBtn = document.getElementById('clear-default-directory');
        if (clearDefaultDirectoryBtn) {
            clearDefaultDirectoryBtn.addEventListener('click', () => {
                const defaultTestDirectory = document.getElementById('default-test-directory');
                if (defaultTestDirectory) {
                    defaultTestDirectory.value = '';
                    this.saveConfig({
                        default_download_directory: ''
                    });
                    updateDirectoryTooltip();
                }
            });
        }
        
        // 配置存放位置 - 初始化
        const initConfigStoragePath = async () => {
            const configStorageInput = document.getElementById('config-storage-path');
            const configStorageTooltip = document.getElementById('config-storage-tooltip');
            if (!configStorageInput) return;
            
            try {
                const dataPathInfo = await window.electronAPI.getDataPath();
                if (dataPathInfo && dataPathInfo.currentPath) {
                    configStorageInput.value = dataPathInfo.currentPath;
                    if (configStorageTooltip) {
                        configStorageTooltip.textContent = dataPathInfo.currentPath;
                        configStorageTooltip.classList.remove('empty');
                    }
                }
            } catch (error) {
                console.error('获取配置路径失败:', error);
            }
        };
        initConfigStoragePath();
        
        const showConfigConfirmDialog = (title, message, confirmText, cancelText) => {
            return new Promise((resolve) => {
                const modal = document.getElementById('confirm-modal-overlay');
                const titleEl = document.getElementById('confirm-modal-title');
                const messageEl = document.getElementById('confirm-modal-message');
                const confirmBtn = document.getElementById('confirm-modal-confirm-btn');
                const cancelBtn = document.getElementById('confirm-modal-cancel-btn');

                if (!modal || !confirmBtn || !cancelBtn) {
                    console.error('确认弹窗元素未找到');
                    resolve(false);
                    return;
                }

                if (titleEl) titleEl.textContent = title;
                if (messageEl) messageEl.textContent = message;
                confirmBtn.textContent = confirmText;
                cancelBtn.textContent = cancelText;

                modal.classList.remove('hidden');

                const handleConfirm = () => {
                    modal.classList.add('hidden');
                    confirmBtn.removeEventListener('click', handleConfirm);
                    cancelBtn.removeEventListener('click', handleCancel);
                    resolve(true);
                };

                const handleCancel = () => {
                    modal.classList.add('hidden');
                    confirmBtn.removeEventListener('click', handleConfirm);
                    cancelBtn.removeEventListener('click', handleCancel);
                    resolve(false);
                };

                confirmBtn.addEventListener('click', handleConfirm);
                cancelBtn.addEventListener('click', handleCancel);
            });
        };
        
        // 配置存放位置 - 浏览按钮
        const browseConfigStorageBtn = document.getElementById('browse-config-storage');
        if (browseConfigStorageBtn) {
            browseConfigStorageBtn.addEventListener('click', async () => {
                try {
                    if (!window.electronAPI || !window.electronAPI.selectDirectory) return;
                    
                    const result = await window.electronAPI.selectDirectory();
                    if (!result.canceled && result.filePaths.length > 0) {
                        let newPath = result.filePaths[0];
                        
                        const lastPart = newPath.split(/[/\\]/).pop();
                        if (lastPart !== 'Xkautotester') {
                            newPath = newPath + (newPath.includes('\\') ? '\\' : '/') + 'Xkautotester';
                        }
                        
                        const configStorageInput = document.getElementById('config-storage-path');
                        const configStorageTooltip = document.getElementById('config-storage-tooltip');
                        
                        const changeResult = await window.electronAPI.changeDataPath(newPath);
                        if (changeResult.success) {
                            if (configStorageInput) configStorageInput.value = newPath;
                            if (configStorageTooltip) {
                                configStorageTooltip.textContent = newPath;
                                configStorageTooltip.classList.remove('empty');
                            }
                            
                            const restartConfirmed = await showConfigConfirmDialog(
                                window.i18n.t('settings.restartRequired'),
                                window.i18n.t('settings.changeAndRestartMessage'),
                                window.i18n.t('settings.restartNow'),
                                window.i18n.t('settings.restartLater')
                            );
                            
                            if (restartConfirmed) {
                                await window.electronAPI.relaunchApp();
                            }
                        } else {
                            await showConfigConfirmDialog(
                                window.i18n.t('common.error'),
                                changeResult.error || (window.i18n.t('settings.changeConfigPathFailed')),
                                window.i18n.t('common.confirm'),
                                window.i18n.t('common.cancel')
                            );
                        }
                    }
                } catch (error) {
                    console.error('更改配置路径失败:', error);
                }
            });
        }
        
        // 配置存放位置 - 重置按钮
        const resetConfigStorageBtn = document.getElementById('reset-config-storage');
        if (resetConfigStorageBtn) {
            resetConfigStorageBtn.addEventListener('click', async () => {
                try {
                    const resetResult = await window.electronAPI.resetDataPath();
                    if (resetResult.success) {
                        const dataPathInfo = await window.electronAPI.getDataPath();
                        const configStorageInput = document.getElementById('config-storage-path');
                        const configStorageTooltip = document.getElementById('config-storage-tooltip');
                        
                        if (configStorageInput) configStorageInput.value = dataPathInfo.defaultPath;
                        if (configStorageTooltip) {
                            configStorageTooltip.textContent = dataPathInfo.defaultPath;
                            configStorageTooltip.classList.remove('empty');
                        }
                        
                        const restartConfirmed = await showConfigConfirmDialog(
                            window.i18n.t('settings.restartRequired'),
                            window.i18n.t('settings.resetAndRestartMessage'),
                            window.i18n.t('settings.restartNow'),
                            window.i18n.t('settings.restartLater')
                        );
                        
                        if (restartConfirmed) {
                            await window.electronAPI.relaunchApp();
                        }
                    }
                } catch (error) {
                    console.error('重置配置路径失败:', error);
                }
            });
        }
        
        // 自定义语言选择器事件监听
        const customLanguageSelect = document.getElementById('custom-language-select');
        const customLanguageSelected = document.getElementById('custom-language-selected');
        const customLanguageOptions = document.getElementById('custom-language-options');
        
        // 通知平台选择器事件监听
        const notificationPlatformSelect = document.getElementById('custom-notification-platform-select');
        const notificationPlatformSelected = document.getElementById('custom-notification-platform-selected');
        const notificationPlatformOptions = document.getElementById('custom-notification-platform-options');
        
        if (customLanguageSelect && customLanguageSelected && customLanguageOptions) {
            // 将下拉框选项移到 body 下，避免被 modal 的 backdrop-filter 影响
            document.body.appendChild(customLanguageOptions);
            
            // 点击选中区域切换下拉框显示/隐藏
            customLanguageSelected.addEventListener('click', (e) => {
                e.stopPropagation();
                const isShowing = customLanguageOptions.classList.contains('show');
                const mainContent = document.querySelector('.main-content');
                if (!isShowing) {
                    // 关闭其他下拉框
                    if (notificationPlatformOptions) {
                        notificationPlatformOptions.classList.remove('show');
                    }
                    this.positionDropdown(customLanguageSelected, customLanguageOptions);
                    customLanguageOptions.classList.add('show');
                    if (mainContent) {
                        mainContent.classList.add('dropdown-open');
                        mainContent.addEventListener('wheel', this.preventScroll, { passive: false });
                    }
                } else {
                    customLanguageOptions.classList.remove('show');
                    if (mainContent) {
                        mainContent.classList.remove('dropdown-open');
                        mainContent.removeEventListener('wheel', this.preventScroll, { passive: false });
                    }
                }
            });
            
            // 点击选项选择语言
            const options = customLanguageOptions.querySelectorAll('.custom-select__option');
            options.forEach(option => {
                option.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const selectedLanguage = option.dataset.value;
                    const displayText = option.querySelector('span')?.textContent || option.textContent;
                    
                    // 更新选中显示
                    const selectedSpan = customLanguageSelected.querySelector('.custom-select__text');
                    if (selectedSpan) {
                        selectedSpan.textContent = displayText;
                    }
                    
                    // 更新选中状态
                    options.forEach(opt => opt.classList.remove('selected'));
                    option.classList.add('selected');
                    
                    // 隐藏下拉框
                    customLanguageOptions.classList.remove('show');
                    const mainContent = document.querySelector('.main-content');
                    if (mainContent) {
                        mainContent.classList.remove('dropdown-open');
                        mainContent.removeEventListener('wheel', this.preventScroll, { passive: false });
                    }
                    
                    // 保存语言设置
                    this.saveConfig({
                        language: selectedLanguage
                    });
                    
                    // 切换语言
                    this.changeLanguage(selectedLanguage);
                });
            });
        }
        
        if (notificationPlatformSelect && notificationPlatformSelected && notificationPlatformOptions) {
            document.body.appendChild(notificationPlatformOptions);
            
            notificationPlatformSelected.addEventListener('click', (e) => {
                e.stopPropagation();
                const isShowing = notificationPlatformOptions.classList.contains('show');
                const mainContent = document.querySelector('.main-content');
                if (!isShowing) {
                    // 关闭其他下拉框
                    if (customLanguageOptions) {
                        customLanguageOptions.classList.remove('show');
                    }
                    this.positionDropdown(notificationPlatformSelected, notificationPlatformOptions);
                    notificationPlatformOptions.classList.add('show');
                    if (mainContent) {
                        mainContent.classList.add('dropdown-open');
                        mainContent.addEventListener('wheel', this.preventScroll, { passive: false });
                    }
                } else {
                    notificationPlatformOptions.classList.remove('show');
                    if (mainContent) {
                        mainContent.classList.remove('dropdown-open');
                        mainContent.removeEventListener('wheel', this.preventScroll, { passive: false });
                    }
                }
            });
            
            const options = notificationPlatformOptions.querySelectorAll('.custom-select__option');
            options.forEach(option => {
                option.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const selectedPlatform = option.dataset.value;
                    const optionSpan = option.querySelector('span');
                    const displayText = optionSpan?.textContent || option.textContent;
                    const optionI18nKey = optionSpan?.getAttribute('data-i18n');
                    
                    const selectedSpan = notificationPlatformSelected.querySelector('.custom-select__text');
                    if (selectedSpan) {
                        selectedSpan.textContent = displayText;
                        if (optionI18nKey) {
                            selectedSpan.setAttribute('data-i18n', optionI18nKey);
                        }
                    }
                    
                    options.forEach(opt => opt.classList.remove('selected'));
                    option.classList.add('selected');
                    
                    notificationPlatformOptions.classList.remove('show');
                    const mainContent = document.querySelector('.main-content');
                    if (mainContent) {
                        mainContent.classList.remove('dropdown-open');
                        mainContent.removeEventListener('wheel', this.preventScroll, { passive: false });
                    }
                    
                    const accessTokenItem = document.getElementById('notification-access-token-item');
                    const secretItem = document.getElementById('notification-secret-item');
                    
                    if (selectedPlatform === 'dingtalk') {
                        if (accessTokenItem) accessTokenItem.classList.remove('hidden');
                        if (secretItem) secretItem.classList.remove('hidden');
                    } else {
                        if (accessTokenItem) accessTokenItem.classList.add('hidden');
                        if (secretItem) secretItem.classList.add('hidden');
                    }
                    
                    this.saveNotificationConfig();
                });
            });
        }
        
        // 通知配置输入框事件监听
        const notificationAccessToken = document.getElementById('notification-access-token');
        const notificationSecret = document.getElementById('notification-secret');
        
        if (notificationAccessToken) {
            notificationAccessToken.addEventListener('blur', () => {
                this.saveNotificationConfig();
            });
        }
        
        if (notificationSecret) {
            notificationSecret.addEventListener('blur', () => {
                this.saveNotificationConfig();
            });
        }
        
        // 清空Allure报告数据按钮事件监听
        const clearAllureReportsBtn = document.getElementById('clear-allure-reports-btn');
        if (clearAllureReportsBtn) {
            clearAllureReportsBtn.addEventListener('click', () => {
                const title = window.i18n.t('settings.clearAllureReports');
                const message = window.i18n.t('settings.clearAllureReportsConfirm');
                
                this.showConfirmModal(title, message, async () => {
                    try {
                        clearAllureReportsBtn.disabled = true;
                        const result = await window.electronAPI.clearAllureReports();
                        
                        if (result.success) {
                            Toast.success(window.i18n.t('settings.clearAllureReportsSuccess'));
                        } else {
                            Toast.error(window.i18n.t('settings.clearAllureReportsFailed') + ': ' + result.error);
                        }
                    } catch (error) {
                        console.error('清空Allure报告数据失败:', error);
                        Toast.error(window.i18n.t('settings.clearAllureReportsFailed'));
                    } finally {
                        clearAllureReportsBtn.disabled = false;
                    }
                });
            });
        }
        
        // 清除所有日志数据按钮事件监听
        const clearAllLogsBtn = document.getElementById('clear-all-logs-btn');
        if (clearAllLogsBtn) {
            clearAllLogsBtn.addEventListener('click', () => {
                const title = window.i18n.t('settings.clearAllLogs');
                const message = window.i18n.t('settings.clearAllLogsConfirm');
                
                this.showConfirmModal(title, message, async () => {
                    try {
                        clearAllLogsBtn.disabled = true;
                        const result = await window.electronAPI.clearAllLogs();
                        
                        if (result.success) {
                            Toast.success(window.i18n.t('settings.clearAllLogsSuccess'));
                        } else {
                            Toast.error(window.i18n.t('settings.clearAllLogsFailed') + ': ' + result.error);
                        }
                    } catch (error) {
                        console.error('清除日志数据失败:', error);
                        Toast.error(window.i18n.t('settings.clearAllLogsFailed'));
                    } finally {
                        clearAllLogsBtn.disabled = false;
                    }
                });
            });
        }

        this._initDataTransferButtons();

        // 自动检查更新开关
        const autoCheckUpdateToggle = document.getElementById('auto-check-update-toggle');
        if (autoCheckUpdateToggle) {
            autoCheckUpdateToggle.addEventListener('change', () => {
                this.saveConfig({ autoCheckUpdate: autoCheckUpdateToggle.checked });
            });
        }

        const preventSleepToggle = document.getElementById('prevent-sleep-toggle');
        if (preventSleepToggle) {
            preventSleepToggle.addEventListener('change', () => {
                this.saveConfig({ preventSleep: preventSleepToggle.checked });
                if (window.electronAPI && window.electronAPI.setPreventSleep) {
                    window.electronAPI.setPreventSleep(preventSleepToggle.checked);
                }
            });
        }

        // 检查更新按钮
        const checkUpdateBtn = document.getElementById('check-update-btn');
        if (checkUpdateBtn) {
            checkUpdateBtn.addEventListener('click', () => {
                this.checkForUpdate();
            });
        }

        // 更新弹窗事件
        const updateModalCloseBtn = document.getElementById('update-modal-close-btn');
        if (updateModalCloseBtn) {
            updateModalCloseBtn.addEventListener('click', () => this.hideUpdateModal());
        }

        const updateCancelBtn = document.getElementById('update-cancel-btn');
        if (updateCancelBtn) {
            updateCancelBtn.addEventListener('click', () => this.hideUpdateModal());
        }

        const updateDownloadBtn = document.getElementById('update-download-btn');
        if (updateDownloadBtn) {
            updateDownloadBtn.addEventListener('click', () => {
                if (this.updatePendingFilePath) {
                    this.installUpdate(this.updatePendingFilePath);
                } else {
                    this.downloadUpdate();
                }
            });
        }

        const updateModalOverlay = document.getElementById('update-modal-overlay');
        if (updateModalOverlay) {
            updateModalOverlay.addEventListener('click', (e) => {
                if (e.target === updateModalOverlay) {
                    this.hideUpdateModal();
                }
            });
        }
    }
    
    // 初始化自定义下拉框
    initCustomSelect(selectId) {
        const select = document.getElementById(selectId);
        if (!select) return;
        
        // 跳过已初始化的下拉框
        if (select.dataset.initialized === 'true') return;
        select.dataset.initialized = 'true';
        
        const selected = select.querySelector('.custom-select__selected');
        const options = select.querySelector('.custom-select__options');
        
        if (!selected || !options) return;
        
        // 将下拉框选项移到 body 下，避免被 modal 的 backdrop-filter 影响
        document.body.appendChild(options);
        
        const self = this;
        
        // 点击选中区域切换下拉框显示/隐藏
        selected.addEventListener('click', (e) => {
            e.stopPropagation();
            // 关闭其他下拉框
            document.querySelectorAll('.custom-select__options.show').forEach(opt => {
                if (opt !== options) {
                    opt.classList.remove('show');
                }
            });
            
            const mainContent = document.querySelector('.main-content');
            const isShowing = options.classList.contains('show');
            if (!isShowing) {
                self.positionDropdown(selected, options);
                options.classList.add('show');
                if (mainContent) {
                    mainContent.classList.add('dropdown-open');
                    mainContent.addEventListener('wheel', self.preventScroll, { passive: false });
                }
            } else {
                options.classList.remove('show');
                if (mainContent) {
                    mainContent.classList.remove('dropdown-open');
                    mainContent.removeEventListener('wheel', self.preventScroll, { passive: false });
                }
            }
        });
        
        // 点击选项选择
        const optionItems = options.querySelectorAll('.custom-select__option');
        optionItems.forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const displayText = option.querySelector('span')?.textContent || option.textContent;
                
                // 更新选中显示
                const selectedSpan = selected.querySelector('.custom-select__text');
                if (selectedSpan) {
                    selectedSpan.textContent = displayText;
                }
                
                // 更新选中状态
                optionItems.forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
                
                // 隐藏下拉框
                options.classList.remove('show');
                const mainContent = document.querySelector('.main-content');
                if (mainContent) {
                    mainContent.classList.remove('dropdown-open');
                    mainContent.removeEventListener('wheel', self.preventScroll, { passive: false });
                }
            });
        });
    }
    
    // 定位下拉框选项
    positionDropdown(selected, options) {
        const rect = selected.getBoundingClientRect();
        
        if (rect.width === 0 && rect.height === 0) {
            options.style.top = '50%';
            options.style.left = '50%';
            options.style.width = '200px';
            options.style.transform = 'translate(-50%, -50%)';
            return;
        }
        
        const viewportHeight = window.innerHeight;
        options.classList.add('show');
        const actualOptionsHeight = options.offsetHeight || 200;
        
        const gap = 4;
        const threshold = 2;
        let top;
        
        const spaceBelow = viewportHeight - rect.bottom - gap;
        const spaceAbove = rect.top - gap;
        const requiredSpaceBelow = actualOptionsHeight * threshold;
        
        if (spaceAbove >= actualOptionsHeight && spaceBelow < requiredSpaceBelow) {
            top = rect.top - actualOptionsHeight - gap;
        } else if (spaceBelow >= actualOptionsHeight) {
            top = rect.bottom + gap;
        } else if (spaceAbove >= actualOptionsHeight) {
            top = rect.top - actualOptionsHeight - gap;
        } else {
            if (spaceBelow >= spaceAbove) {
                top = rect.bottom + gap;
            } else {
                top = Math.max(10, rect.top - actualOptionsHeight - gap);
            }
        }
        
        options.style.top = `${top}px`;
        options.style.left = `${rect.left}px`;
        options.style.width = `${rect.width}px`;
        options.style.transform = 'none';
    }

    async saveConfig(settings) {
        try {
            // 安全检查：确保electronAPI已加载
            if (!window.electronAPI || !window.electronAPI.getConfig || !window.electronAPI.saveConfig) {
                console.error('electronAPI未定义，无法保存配置:', window.electronAPI);
                return;
            }
            
            // 先加载现有的配置
            const existingConfig = await window.electronAPI.getConfig();
            
            // 合并新的设置到现有的APP_SETTINGS中
            const mergedAppSettings = {
                ...(existingConfig?.APP_SETTINGS || {}),
                ...settings
            };
            
            // 构建完整的配置对象
            const config = {
                ...existingConfig,
                APP_SETTINGS: mergedAppSettings
            };
            
            await window.electronAPI.saveConfig(config);
        } catch (error) {
            console.error('保存配置失败:', error);
        }
    }
    
    async saveNotificationConfig() {
        try {
            const notificationPlatformSelected = document.getElementById('custom-notification-platform-selected');
            const accessTokenInput = document.getElementById('notification-access-token');
            const secretInput = document.getElementById('notification-secret');
            
            let platform = 'none';
            if (notificationPlatformSelected) {
                const selectedOption = document.querySelector('#custom-notification-platform-options .custom-select__option.selected');
                if (selectedOption) {
                    platform = selectedOption.dataset.value || 'none';
                }
            }
            
            const notificationConfig = {
                platform: platform,
                dingtalk: {
                    access_token: accessTokenInput ? accessTokenInput.value : '',
                    secret: secretInput ? secretInput.value : ''
                }
            };
            
            await this.saveConfig({
                notification: notificationConfig
            });
        } catch (error) {
            console.error('保存通知配置失败:', error);
        }
    }

    async selectDirectory() {
        try {
            // 安全检查：确保electronAPI已加载
            if (!window.electronAPI || !window.electronAPI.selectDirectory) {
                this.showError('Electron API未正确加载，请重启应用');
                console.error('electronAPI未定义:', window.electronAPI);
                return;
            }
            
            const result = await window.electronAPI.selectDirectory();
            if (!result.canceled && result.filePaths.length > 0) {
                this.selectedDirectory = result.filePaths[0];
                this.updateSelectedDirectory();
                await this.scanTestFiles();
                // 更新计划按钮状态
                this.updatePlanButtons();
                
                // 确保文件列表和测试类型列表可以滚动
                this.ensureScrollable();
            }
        } catch (error) {
            console.error('选择目录失败:', error);
            this.showError('选择目录失败: ' + error.message);
        }
    }

    updateSelectedDirectory() {
        const element = document.getElementById('selected-directory');
        if (this.selectedDirectory) {
            // 如果有测试计划选中，使用从测试计划中提取的文件夹名称
            // 否则使用完整路径的最后一个部分作为文件夹名称
            let folderName;
            if (this.currentTestPlan && this.selectedDirectoryDisplayName) {
                folderName = this.selectedDirectoryDisplayName;
            } else {
                folderName = this.selectedDirectory.split(/[\\/]/).pop();
            }
            element.textContent = folderName;
            element.style.color = 'var(--text-primary)';
            element.title = this.selectedDirectory; // 鼠标悬停时显示完整路径
        } else {
            element.textContent = '未选择目录';
            element.style.color = 'var(--text-secondary)';
            element.title = '';
        }
    }

    getAbsolutePath(relativePath) {
        // 如果已经是绝对路径，直接返回
        if (relativePath.startsWith('/') || relativePath.match(/^[a-zA-Z]:[\\/]/)) {
            return relativePath;
        }
        
        // 对于相对路径，假设项目根目录是Electron应用所在目录的父目录
        // 由于在渲染进程中无法直接获取文件系统路径，我们使用已知的项目结构
        // 项目根目录是electron目录的父目录
        const projectRoot = 'D:\\WorkSpaces\\Pycharm Space\\XKAutoTester';
        
        // 如果相对路径是当前目录，直接返回项目根目录
        if (relativePath === '.') {
            return projectRoot;
        }
        
        // 否则，将相对路径与项目根目录组合
        const path = require('path');
        return path.join(projectRoot, relativePath);
    }

    async scanTestFiles() {
        // 始终显示测试计划区域，不需要先选择测试目录
        const testPlanSection = document.getElementById('test-plan-section');
        testPlanSection.classList.remove('hidden');

        if (!this.selectedDirectory) {
            // 未选择目录时，显示测试计划但显示占位符
            this.displayTestTypes([], window.i18n.t('testExecution.selectTestDirectoryFirst'));
            this.displayTestPlansPlaceholder(window.i18n.t('testExecution.noTestPlans'));
            // 更新计划按钮状态
            this.updatePlanButtons();
            return;
        }

        try {
            // 安全检查：确保electronAPI已加载
            if (!window.electronAPI || !window.electronAPI.scanTestFiles) {
                this.showError(window.i18n.t('testExecution.electronApiNotLoaded'));
                console.error('electronAPI未定义:', window.electronAPI);
                return;
            }
            
            // 调用后端API实时扫描tests文件夹
            const testFiles = await window.electronAPI.scanTestFiles(this.selectedDirectory);

            if (testFiles.length === 0) {
                this.showError(window.i18n.t('testExecution.noTestFilesFound'));
                // 没有找到文件时，显示请选择文件的提示
                this.displayTestTypes([], window.i18n.t('testExecution.selectTestFile'));
                // 只有在没有测试计划时才显示占位符
                if (!this.testPlans || this.testPlans.length === 0) {
                    this.displayTestPlansPlaceholder(window.i18n.t('testExecution.noTestPlans'));
                }
                return;
            }

            this.displayTestFiles(testFiles);
            
            // 扫描到文件后，显示请选择文件的提示
            this.displayTestTypes([], window.i18n.t('testExecution.selectTestFile'));
            // 只有在没有测试计划时才显示占位符
            if (!this.testPlans || this.testPlans.length === 0) {
                this.displayTestPlansPlaceholder(window.i18n.t('testExecution.noTestPlans'));
            }
        } catch (error) {
            console.error('扫描测试文件失败:', error);
            this.showError(window.i18n.t('testExecution.scanTestFilesFailed') + ': ' + error.message);
        }
    }

    // 初始化应用时设置占位符显示
    initializePlaceholders() {

        
        // 直接设置占位符，因为initializeApp已经在DOMContentLoaded之后执行
        this.setupPlaceholders();
        
        // 强制显示初始占位符
        this.displayTestTypes([], window.i18n.t('testExecution.selectTestDirectoryFirst'));
    }
    
    // 实际设置占位符的逻辑
    setupPlaceholders() {

        
        // 检查是否已经有占位符，如果没有才设置
        const testTypeContainer = document.getElementById('test-type-selector');
        const testPlansContainer = document.getElementById('test-plans-list');
        
        // 如果测试类型容器没有占位符，才设置
        if (testTypeContainer && !testTypeContainer.querySelector('.placeholder-message')) {

            this.displayTestTypes([], window.i18n.t('testExecution.selectTestDirectoryFirst'));
        }
        
        // 如果测试计划容器没有占位符，才设置
        if (testPlansContainer && !testPlansContainer.querySelector('.placeholder-message')) {

            this.displayTestPlansPlaceholder(window.i18n.t('testExecution.noTestPlans'));
        }
    }

    forceDisplayPlaceholders() {

        
        // 强制清空测试类型选择器并显示占位符
        const container = document.getElementById('test-type-selector');
        if (container) {

            container.innerHTML = '';
            
            // 使用与测试计划一致的占位符样式
            const placeholderElement = document.createElement('div');
            placeholderElement.className = 'placeholder-message';
            placeholderElement.innerHTML = `
                ${this.getIconHtml('info')}
                <span>${window.i18n.t('testExecution.selectTestDirectoryFirst')}</span>
            `;
            container.appendChild(placeholderElement);
            

        }
        
        // 只有在没有测试计划时才显示测试计划占位符
        if (this.testPlans && this.testPlans.length === 0) {

            this.displayTestPlansPlaceholder(window.i18n.t('testExecution.noTestPlans'));
        } else {

        }
        

    }
    
    setupTransparentAreaClickThrough() {
        let isIgnoringMouseEvents = false;
        let isDragging = false;
        const appElement = document.getElementById('app');
        const appNav = document.querySelector('.app-nav');
        
        if (!appElement) {
            console.error('找不到 #app 元素');
            return;
        }
        
        // 检查坐标是否在透明区域（#app 边界外）
        const isInTransparentArea = (x, y) => {
            const rect = appElement.getBoundingClientRect();
            return x < rect.left || x > rect.right || y < rect.top || y > rect.bottom;
        };
        
        // 检查坐标是否在拖拽区域（app-nav 内但不在 no-drag 区域）
        const isInDraggableArea = (x, y) => {
            if (!appNav) return false;
            
            const navRect = appNav.getBoundingClientRect();
            // 不在 app-nav 范围内
            if (x < navRect.left || x > navRect.right || y < navRect.top || y > navRect.bottom) {
                return false;
            }
            
            // 检查是否在 no-drag 区域内
            const noDragElements = appNav.querySelectorAll('.nav-left, .nav-tabs, .nav-right');
            for (const el of noDragElements) {
                const elRect = el.getBoundingClientRect();
                if (x >= elRect.left && x <= elRect.right && y >= elRect.top && y <= elRect.bottom) {
                    return false;
                }
            }
            
            return true;
        };
        
        // 使用 mousemove 来精确检测鼠标位置
        const checkMousePosition = (e) => {
            const x = e.clientX;
            const y = e.clientY;
            const inTransparent = isInTransparentArea(x, y);
            
            if (inTransparent && !isIgnoringMouseEvents) {
                // 鼠标在透明区域，启用点击穿透
                isIgnoringMouseEvents = true;
                window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
            } else if (!inTransparent && isIgnoringMouseEvents) {
                // 鼠标在 #app 内部，禁用点击穿透
                isIgnoringMouseEvents = false;
                window.electronAPI.setIgnoreMouseEvents(false);
            }
            
            // 处理窗口拖拽
            if (isDragging) {
                // 使用屏幕坐标进行窗口移动
                window.electronAPI.moveWindowDrag(e.screenX, e.screenY);
            }
        };
        
        // 监听 mousemove 事件
        document.addEventListener('mousemove', checkMousePosition);
        
        // 自定义窗口拖拽 - mousedown
        document.addEventListener('mousedown', (e) => {
            if (isInDraggableArea(e.clientX, e.clientY)) {
                isDragging = true;
                // 传递屏幕坐标
                window.electronAPI.startWindowDrag(e.screenX, e.screenY);
                e.preventDefault();
            }
        });
        
        // 自定义窗口拖拽 - mouseup
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                window.electronAPI.endWindowDrag();
            }
        });
        
        // 当鼠标离开整个文档时，启用点击穿透
        document.addEventListener('mouseleave', () => {
            if (!isIgnoringMouseEvents) {
                isIgnoringMouseEvents = true;
                window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
            }
        });
        
        // 当鼠标进入文档时，检查位置
        document.addEventListener('mouseenter', (e) => {
            if (isIgnoringMouseEvents && !isInTransparentArea(e.clientX, e.clientY)) {
                isIgnoringMouseEvents = false;
                window.electronAPI.setIgnoreMouseEvents(false);
            }
        });
    }
    
    // 切换导航标签
    switchTab(tab) {
        // 获取目标页面ID
        const targetPage = tab.getAttribute('data-tab');
        
        // 移除所有导航标签的active类
        document.querySelectorAll('.nav-tab').forEach(t => {
            t.classList.remove('active');
        });
        
        // 为当前标签添加active类
        tab.classList.add('active');
        
        // 移除所有页面的active类
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });
        
        // 为目标页面添加active类
        const pageElement = document.getElementById(targetPage);
        if (pageElement) {
            pageElement.classList.add('active');
        }
        
        // 处理页面封装页面切换
        if (targetPage === 'page-package') {
            if (!this.ppApps || this.ppApps.length === 0) {
                this.initPagePackage();
            } else {
                this.ppUpdateBadge('app', this.ppApps.length);
            }
        } else {
            // 切换到其他页面时，重置页面封装状态
            this.ppResetState();
        }
    }

    displayTestFiles(files) {
        const container = document.getElementById('test-files-list');
        container.innerHTML = '';

        const fragment = document.createDocumentFragment();
        files.forEach(file => {
            const fileElement = document.createElement('div');
            fileElement.className = 'test-file-item';
            fileElement.setAttribute('data-path', file.path);
            fileElement.innerHTML = `
                ${this.getIconHtml('description')}
                <span>${file.name}</span>
            `;

            fragment.appendChild(fileElement);
        });
        container.appendChild(fragment);
    }

    findTestFileItemByPath(filePath) {
        // 尝试多种路径匹配方式，确保能找到对应的文件
        
        // 1. 直接匹配完整路径
        let fileItem = document.querySelector(`.test-file-item[data-path="${filePath}"]`);
        if (fileItem) return fileItem;
        
        // 2. 尝试匹配标准化路径（处理路径分隔符差异）
        const normalizedPath = filePath.replace(/\\/g, '/');
        fileItem = document.querySelector(`.test-file-item[data-path="${normalizedPath}"]`);
        if (fileItem) return fileItem;
        
        // 3. 尝试匹配反斜杠路径
        const backslashPath = filePath.replace(/\//g, '\\');
        fileItem = document.querySelector(`.test-file-item[data-path="${backslashPath}"]`);
        if (fileItem) return fileItem;
        
        // 4. 尝试通过文件名匹配（作为最后的手段）
        const fileName = filePath.split(/[\\/]/).pop();
        const allFileItems = document.querySelectorAll('.test-file-item');
        for (const item of allFileItems) {
            const itemPath = item.getAttribute('data-path');
            if (itemPath && itemPath.endsWith(fileName)) {
                return item;
            }
        }
        
        return null;
    }

    updateRunButtonState() {
        const runButton = document.getElementById('run-tests-btn');
        const canRun = this.currentTestPlan && !this.isRunning;
        runButton.disabled = !canRun;
    }

    async updatePlanButtons() {
        const newPlanButton = document.getElementById('new-plan-btn');
        const editPlanButton = document.getElementById('edit-plan-btn');
        const deletePlanButton = document.getElementById('delete-plan-btn');
        const viewReportButton = document.getElementById('view-report-btn');
        const hasDirectory = !!this.selectedDirectory;
        const hasTestPlans = this.testPlans && this.testPlans.length > 0;
        const hasSelectedPlan = !!this.currentTestPlan;
        
        // 判断是否应该禁用编辑和删除按钮
        let shouldDisableEditDelete = !hasSelectedPlan;
        
        // 如果测试正在运行，且选中的是正在执行的测试计划，则禁用编辑和删除按钮
        if (this.isRunning && hasSelectedPlan && this.runningTestPlanName === this.currentTestPlan.name) {
            shouldDisableEditDelete = true;
        }
        
        newPlanButton.disabled = !hasDirectory;
        editPlanButton.disabled = shouldDisableEditDelete;
        deletePlanButton.disabled = shouldDisableEditDelete;
        
        // 更新查看报告按钮状态
        if (hasSelectedPlan) {

            await this.enableViewReportButton();
        } else {

            viewReportButton.disabled = true;
        }
    }

    // 显示设备管理模态框
    async showDeviceManagementModal() {
        Toast.clearAll();
        
        this.modals.device.open();

        this.showDeviceScanningState();

        await this.scanDevices();
        
        if (this.deviceStatusSaved && this.selectedDevice) {
            setTimeout(() => {
                const deviceToSelect = document.querySelector(`.device-item[data-device-id="${this.selectedDevice}"]`);
                if (deviceToSelect) {
                    deviceToSelect.click();
                }
            }, 100);
        }
        
        const openPortBtn = document.getElementById('open-port-btn');
        if (openPortBtn) {
            openPortBtn.removeEventListener('click', this.boundOpenPort5555);
            openPortBtn.addEventListener('click', this.boundOpenPort5555);
        }
    }
    
    // 开放5555端口
    async openPort5555() {
        // 获取设备管理弹窗容器
        const modalContainer = document.querySelector('#device-modal-overlay .modal-container');
        
        // 获取选中的USB设备
        const selectedDeviceElement = document.querySelector('.device-item.selected');
        if (!selectedDeviceElement) {
            Toast.error(window.i18n.t('deviceModal.selectUsbDevice'), { container: modalContainer });
            return;
        }
        
        const deviceId = selectedDeviceElement.getAttribute('data-device-id');
        if (!deviceId || deviceId.includes(':')) {
            Toast.error(window.i18n.t('deviceModal.selectUsbDevice'), { container: modalContainer });
            return;
        }
        
        try {
            // 显示操作中提示
            Toast.info(window.i18n.t('deviceModal.openingPort'), { container: modalContainer });
            
            // 执行adb命令开放5555端口
            // 使用tcpip命令开启TCP/IP模式
            const result = await this.executeAdbCommand('tcpip 5555', deviceId);
            
            // 检查结果
            if (result.success) {
                Toast.success(window.i18n.t('deviceModal.portOpenSuccess'), { container: modalContainer });
                
                // 重新扫描设备，查看是否出现IP连接
                setTimeout(async () => {
                    await this.scanDevices();
                }, 1000);
            } else {
                Toast.error(`${window.i18n.t('deviceModal.portOpenFailed')}: ${result.error}`, { container: modalContainer });
            }
        } catch (error) {
            Toast.error(`${window.i18n.t('deviceModal.portOpenFailed')}: ${error.message}`, { container: modalContainer });
        }
    }

    // 隐藏设备管理模态框
    hideDeviceModal() {
        this.modals.device.close();
        
        this.hideAddDeviceInput();
        
        const deviceListElement = document.getElementById('device-list');
        if (deviceListElement) {
            const selectedDeviceElement = deviceListElement.querySelector('.device-item.selected');
            if (selectedDeviceElement) {
                selectedDeviceElement.classList.remove('selected');
                selectedDeviceElement.style.backgroundColor = '';
            }
        }
    }

    // 显示编辑设备连接标识弹窗
    async showEditDeviceIdModal(fileName, filePath) {
        this._editDeviceIdFileName = fileName;
        this._editDeviceIdFilePath = filePath;
        
        const modalOverlay = document.getElementById('edit-device-id-modal-overlay');
        const deviceIdInput = document.getElementById('edit-device-id-input');
        const androidVersionInput = document.getElementById('edit-android-version-input');
        const blePortInput = document.getElementById('edit-ble-port-input');
        const blePortGroup = document.getElementById('ble-mock-port-group');
        const portManageBtn = document.getElementById('edit-port-manage-btn');
        
        // 获取当前设备ID、安卓版本和蓝牙端口
        let isAndroid = false;
        let hasBleSteps = false;
        
        try {
            const result = await window.electronAPI.testCase.get(fileName);
            if (result && result.success && result.data) {
                const deviceName = result.data.deviceConfig?.deviceName || '';
                const platformVersion = result.data.deviceConfig?.platformVersion || '';
                const blePort = result.data.bleDevice?.port || '';
                isAndroid = result.data.platform && result.data.platform.toLowerCase() === 'android';
                hasBleSteps = result.data.steps && result.data.steps.some(step => step.type === 'ble');
                
                if (deviceIdInput) {
                    deviceIdInput.value = (deviceName && deviceName !== '{{DEVICE_NAME}}') ? deviceName : '';
                }
                
                if (androidVersionInput) {
                    androidVersionInput.value = (platformVersion && platformVersion !== '{{PLATFORM_VERSION}}') ? platformVersion : '';
                }
                
                if (blePortInput) {
                    blePortInput.value = blePort || '';
                }
            }
        } catch (error) {
            console.error('获取测试用例设备信息失败:', error);
            if (deviceIdInput) {
                deviceIdInput.value = '';
            }
            if (androidVersionInput) {
                androidVersionInput.value = '';
            }
            if (blePortInput) {
                blePortInput.value = '';
            }
        }
        
        // 根据条件显示/隐藏蓝牙端口输入框和端口管理按钮
        if (blePortGroup) {
            blePortGroup.style.display = hasBleSteps ? 'block' : 'none';
        }
        if (portManageBtn) {
            portManageBtn.style.display = hasBleSteps ? 'inline-flex' : 'none';
        }
        
        // 保存是否有蓝牙步骤的标记
        this._editDeviceIdHasBle = hasBleSteps;
        
        this.modals.editDeviceId.open();
    }

    // 隐藏编辑设备连接标识弹窗
    hideEditDeviceIdModal() {
        this.modals.editDeviceId.close();
        this._editDeviceIdFileName = null;
        this._editDeviceIdFilePath = null;
        this._editDeviceIdHasBle = false;
    }

    // 为编辑设备ID显示设备管理弹窗
    async showDeviceManagementModalForEdit() {
        // 先隐藏编辑设备ID弹窗
        const editModalOverlay = document.getElementById('edit-device-id-modal-overlay');
        if (editModalOverlay) {
            editModalOverlay.classList.add('hidden');
        }
        
        // 显示设备管理弹窗
        await this.showDeviceManagementModal();
        
        // 修改确认按钮的行为
        const confirmBtn = document.getElementById('device-modal-confirm-btn');
        if (confirmBtn) {
            // 移除原有事件监听
            const newConfirmBtn = confirmBtn.cloneNode(true);
            confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
            
            // 添加新的事件监听
            newConfirmBtn.addEventListener('click', () => {
                this.onDeviceIdSelectionConfirm();
            });
        }
    }

    // 设备ID选择确认处理
    onDeviceIdSelectionConfirm() {
        const selectedDeviceElement = document.querySelector('.device-item.selected');
        
        if (!selectedDeviceElement) {
            const modalContainer = document.querySelector('#device-modal-overlay .modal-container');
            Toast.error(window.i18n.t('testExecution.deviceSelection.deviceRequired'), { container: modalContainer });
            return;
        }

        const deviceId = selectedDeviceElement.getAttribute('data-device-id');
        
        if (!deviceId) {
            const modalContainer = document.querySelector('#device-modal-overlay .modal-container');
            Toast.error(window.i18n.t('testExecution.deviceSelection.deviceRequired'), { container: modalContainer });
            return;
        }

        // 获取安卓版本
        const androidVersionElement = document.getElementById('modal-device-android-version');
        const androidVersion = androidVersionElement ? androidVersionElement.textContent.trim() : '';
        
        // 隐藏设备管理弹窗
        this.hideDeviceModal();
        
        // 显示编辑设备ID弹窗并填入设备ID和安卓版本
        const editModalOverlay = document.getElementById('edit-device-id-modal-overlay');
        const deviceIdInput = document.getElementById('edit-device-id-input');
        const androidVersionInput = document.getElementById('edit-android-version-input');
        
        if (deviceIdInput) {
            deviceIdInput.value = deviceId;
        }
        
        if (androidVersionInput && androidVersion && androidVersion !== '-') {
            androidVersionInput.value = androidVersion;
        }
        
        if (editModalOverlay) {
            editModalOverlay.classList.remove('hidden');
        }
    }

    // 确认编辑设备连接标识
    async confirmEditDeviceId() {
        const deviceIdInput = document.getElementById('edit-device-id-input');
        const androidVersionInput = document.getElementById('edit-android-version-input');
        const blePortInput = document.getElementById('edit-ble-port-input');
        const deviceId = deviceIdInput ? deviceIdInput.value.trim() : '';
        const androidVersion = androidVersionInput ? androidVersionInput.value.trim() : '';
        const blePort = blePortInput ? blePortInput.value.trim() : '';
        
        if (!this._editDeviceIdFileName) {
            return;
        }
        
        try {
            // 获取测试用例数据
            const result = await window.electronAPI.testCase.get(this._editDeviceIdFileName);
            if (result && result.success && result.data) {
                const caseData = result.data;
                
                // 更新设备配置
                if (!caseData.deviceConfig) {
                    caseData.deviceConfig = {};
                }
                caseData.deviceConfig.deviceName = deviceId || '{{DEVICE_NAME}}';
                caseData.deviceConfig.platformVersion = androidVersion || '{{PLATFORM_VERSION}}';
                
                // 更新蓝牙端口配置
                if (this._editDeviceIdHasBle) {
                    if (!caseData.bleDevice) {
                        caseData.bleDevice = {};
                    }
                    caseData.bleDevice.port = blePort || '';
                }
                
                // 从文件路径中提取输出目录
                let outputDir = this.selectedDirectory;
                if (this._editDeviceIdFilePath) {
                    const pathParts = this._editDeviceIdFilePath.split(/[\\/]/);
                    outputDir = pathParts.slice(0, -1).join('/');
                }
                
                // 保存并重新生成Python文件
                const saveResult = await window.electronAPI.testCase.saveAndGenerate(caseData, outputDir);
                
                if (saveResult.success) {
                    // 更新UI显示 - 设备ID
                    const deviceInfoElement = document.querySelector(`.test-file-device-info[data-file-name="${this._editDeviceIdFileName}"][data-type="device"]`);
                    if (deviceInfoElement) {
                        const deviceNameDisplay = deviceInfoElement.querySelector('.device-name-display');
                        if (deviceNameDisplay) {
                            if (deviceId) {
                                deviceNameDisplay.textContent = deviceId;
                                deviceInfoElement.classList.remove('device-not-set');
                                deviceInfoElement.classList.add('device-set');
                            } else {
                                deviceNameDisplay.textContent = window.i18n.t('testExecution.deviceSelection.notSet');
                                deviceInfoElement.classList.remove('device-set');
                                deviceInfoElement.classList.add('device-not-set');
                            }
                        }
                    }
                    
                    // 更新UI显示 - 蓝牙端口
                    const blePortElement = document.querySelector(`.test-file-device-info[data-file-name="${this._editDeviceIdFileName}"][data-type="ble-port"]`);
                    if (blePortElement) {
                        const blePortDisplay = blePortElement.querySelector('.ble-port-display');
                        if (blePortDisplay) {
                            if (blePort) {
                                blePortDisplay.textContent = blePort;
                                blePortElement.classList.remove('device-not-set');
                                blePortElement.classList.add('device-set');
                            } else {
                                blePortDisplay.textContent = window.i18n.t('testExecution.deviceSelection.notSet');
                                blePortElement.classList.remove('device-set');
                                blePortElement.classList.add('device-not-set');
                            }
                        }
                    }
                    
                    // 隐藏弹窗
                    this.hideEditDeviceIdModal();
                    
                    // 显示成功提示
                    Toast.success(window.i18n.t('testExecution.deviceSelection.updateSuccess'));
                } else {
                    Toast.error(window.i18n.t('testExecution.deviceSelection.updateFailed') + ': ' + saveResult.error);
                }
            }
        } catch (error) {
            console.error('更新设备连接标识失败:', error);
            Toast.error(window.i18n.t('testExecution.deviceSelection.updateFailed') + ': ' + error.message);
        }
    }

    // 从设备管理弹窗选择设备后回调
    onDeviceIdSelectionFromManagement(deviceId) {
        const deviceIdInput = document.getElementById('edit-device-id-input');
        if (deviceIdInput) {
            deviceIdInput.value = deviceId;
        }
    }

    // 显示端口管理弹窗
    async showPortManagementModal() {
        const scanningElement = document.getElementById('port-scanning');
        const portListElement = document.getElementById('port-list');
        const confirmBtn = document.getElementById('port-modal-confirm-btn');
        
        this.modals.port.open();
        
        if (scanningElement) scanningElement.style.display = 'flex';
        if (portListElement) portListElement.classList.add('hidden');
        if (confirmBtn) confirmBtn.disabled = true;
        
        try {
            // 调用后端获取串口列表
            const result = await window.electronAPI.getSerialPorts();
            
            if (scanningElement) scanningElement.style.display = 'none';
            if (portListElement) portListElement.classList.remove('hidden');
            
            if (result && result.success && result.data && result.data.length > 0) {
                // 渲染端口列表
                portListElement.innerHTML = '';
                result.data.forEach(port => {
                    const portItem = document.createElement('div');
                    portItem.className = 'device-item';
                    portItem.setAttribute('data-port-id', port.deviceId);
                    portItem.innerHTML = `
                        <div style="display: flex; align-items: center;">
                            ${this.getIconHtml('cable', 'margin-right: 8px;')}
                            <div>
                                <div style="font-weight: 500;">${port.deviceId}</div>
                                <div style="font-size: 12px; color: var(--text-secondary);">${port.name || ''}</div>
                            </div>
                        </div>
                    `;
                    
                    portItem.addEventListener('click', () => {
                        // 移除其他选中状态
                        portListElement.querySelectorAll('.device-item').forEach(item => {
                            item.classList.remove('selected');
                        });
                        // 添加选中状态
                        portItem.classList.add('selected');
                        if (confirmBtn) confirmBtn.disabled = false;
                    });
                    
                    portListElement.appendChild(portItem);
                });
            } else {
                portListElement.innerHTML = `
                    <div style="padding: 16px; text-align: center; color: var(--text-secondary);">
                        ${window.i18n.t('testExecution.deviceSelection.noPortsFound') || '未找到串口设备'}
                    </div>
                `;
            }
        } catch (error) {
            console.error('获取串口列表失败:', error);
            if (scanningElement) scanningElement.style.display = 'none';
            if (portListElement) {
                portListElement.classList.remove('hidden');
                portListElement.innerHTML = `
                    <div style="padding: 16px; text-align: center; color: var(--text-secondary);">
                        ${window.i18n.t('testExecution.deviceSelection.scanPortsFailed') || '获取串口列表失败'}
                    </div>
                `;
            }
        }
    }

    // 隐藏端口管理弹窗
    hidePortManagementModal() {
        this.modals.port.close();
    }

    // 确认端口选择
    confirmPortSelection() {
        const selectedPortElement = document.querySelector('#port-list .device-item.selected');
        
        if (!selectedPortElement) {
            const modalContainer = document.querySelector('#port-modal-overlay .modal-container');
            Toast.error(window.i18n.t('testExecution.deviceSelection.portRequired') || '请选择一个端口', { container: modalContainer });
            return;
        }

        const portId = selectedPortElement.getAttribute('data-port-id');
        
        // 隐藏端口管理弹窗
        this.hidePortManagementModal();
        
        // 填入蓝牙端口输入框
        const blePortInput = document.getElementById('edit-ble-port-input');
        if (blePortInput && portId) {
            blePortInput.value = portId;
        }
    }

    // 显示设备扫描状态
    showDeviceScanningState() {
        const scanningElement = document.getElementById('device-scanning');
        const deviceListElement = document.getElementById('device-list');
        const noDevicesElement = document.getElementById('no-devices');
        const confirmButton = document.getElementById('device-modal-confirm-btn');
        const openPortBtn = document.getElementById('open-port-btn');
        const addDeviceInputContainer = document.getElementById('add-device-input-container');
        const deviceStatusCard = document.getElementById('modal-device-status-card');

        if (scanningElement) scanningElement.classList.remove('hidden');
        if (deviceListElement) deviceListElement.classList.add('hidden');
        if (noDevicesElement) noDevicesElement.classList.add('hidden');
        if (addDeviceInputContainer) addDeviceInputContainer.classList.add('hidden');
        if (deviceStatusCard) deviceStatusCard.classList.add('hidden');
        if (confirmButton) confirmButton.disabled = true;
        if (openPortBtn) openPortBtn.disabled = true;
    }

    // 显示设备列表
    displayDevices(devices) {
        const scanningElement = document.getElementById('device-scanning');
        const deviceListElement = document.getElementById('device-list');
        const noDevicesElement = document.getElementById('no-devices');
        const confirmButton = document.getElementById('device-modal-confirm-btn');
        const openPortBtn = document.getElementById('open-port-btn');
        const addDeviceInputContainer = document.getElementById('add-device-input-container');
        const deviceStatusCard = document.getElementById('modal-device-status-card');

        if (scanningElement) scanningElement.classList.add('hidden');
        if (addDeviceInputContainer) addDeviceInputContainer.classList.add('hidden');
        // 隐藏设备信息卡片
        if (deviceStatusCard) deviceStatusCard.classList.add('hidden');
        
        // 初始禁用确认按钮和开放5555端口按钮
        if (confirmButton) {
            confirmButton.disabled = true;
        }
        if (openPortBtn) {
            openPortBtn.disabled = true;
        }

        // 总是显示设备列表，包括新增设备按钮
        if (deviceListElement) {
            deviceListElement.classList.remove('hidden');
            
            // 保存当前选中的设备ID（只有当设备状态已保存时才保存）
            const selectedDeviceId = this.deviceStatusSaved ? this.selectedDevice : null;
            
            // 清空设备列表
            deviceListElement.innerHTML = '';

            devices.forEach((device, index) => {
                const deviceElement = document.createElement('div');
                deviceElement.className = 'device-item';
                deviceElement.setAttribute('data-device-id', device);
                deviceElement.style.padding = '8px 12px';
                deviceElement.style.borderRadius = '4px';
                deviceElement.style.cursor = 'pointer';
                deviceElement.style.transition = 'background-color 0.2s';
                deviceElement.style.display = 'flex';
                deviceElement.style.alignItems = 'flex-start';
                
                // 判断设备连接类型并使用不同图标
                let icon = 'device_hub'; // 默认图标
                if (device.includes(':')) {
                    // IP连接的设备，格式通常为 IP:端口
                    icon = 'wifi';
                } else {
                    // USB连接的设备，通常是序列号
                    icon = 'usb';
                }
                
                deviceElement.innerHTML = `
                    ${this.getIconHtml(icon, 'vertical-align: top; margin-right: 8px; flex-shrink: 0; margin-top: 2px;')}
                    <span style="vertical-align: top; flex: 1; min-width: 0; word-wrap: break-word; overflow-wrap: break-word; white-space: normal;">${device}</span>
                `;
                
                // 添加悬停效果
                deviceElement.addEventListener('mouseenter', () => {
                    if (!deviceElement.classList.contains('selected')) {
                        deviceElement.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
                    }
                });
                
                deviceElement.addEventListener('mouseleave', () => {
                    if (!deviceElement.classList.contains('selected')) {
                        deviceElement.style.backgroundColor = '';
                    }
                });

                // 添加点击事件
                deviceElement.addEventListener('click', () => {
                    // 移除其他设备的选中状态
                    document.querySelectorAll('.device-item.selected').forEach(item => {
                        item.classList.remove('selected');
                        item.style.backgroundColor = '';
                    });
                    
                    // 选中当前设备
                    deviceElement.classList.add('selected');
                    // 使用主题色作为背景颜色
                    const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
                    deviceElement.style.backgroundColor = `${primaryColor}20`;
                    
                    // 启用确认按钮（直接获取最新引用）
                    const currentConfirmBtn = document.getElementById('device-modal-confirm-btn');
                    if (currentConfirmBtn) {
                        currentConfirmBtn.disabled = false;
                    }
                    
                    // 控制开放5555端口按钮状态
                    const openPortBtn = document.getElementById('open-port-btn');
                    if (openPortBtn) {
                        // 只有USB设备（不包含冒号）才能开放端口
                        if (!device.includes(':')) {
                            openPortBtn.disabled = false;
                        } else {
                            openPortBtn.disabled = true;
                        }
                    }
                    
                    // 显示设备状态卡片并获取设备信息
                    const deviceStatusCard = document.getElementById('modal-device-status-card');
                    if (deviceStatusCard) {
                        deviceStatusCard.classList.remove('hidden');
                    }
                    
                    // 获取设备详细信息
                    this.getDeviceInfo(device, true);
                });

                deviceListElement.appendChild(deviceElement);
            });

            // 添加新增设备按钮
            const addDeviceButton = document.createElement('div');
            addDeviceButton.id = 'add-device-btn';
            addDeviceButton.className = 'device-item add-device-btn';
            addDeviceButton.style.padding = '8px 12px';
            addDeviceButton.style.borderRadius = '4px';
            addDeviceButton.style.cursor = 'pointer';
            addDeviceButton.style.transition = 'background-color 0.2s';
            addDeviceButton.style.display = 'flex';
            addDeviceButton.style.alignItems = 'center';
            addDeviceButton.style.justifyContent = 'space-between';
            addDeviceButton.innerHTML = `
                <div style="display: flex; align-items: center;">
                    ${this.getIconHtml('add', 'vertical-align: middle; margin-right: 8px;')}
                    <span style="vertical-align: middle;">${window.i18n.t('deviceModal.addDevice')}</span>
                </div>
                ${this.getIconHtml('keyboard_arrow_right', 'vertical-align: middle;')}
            `;

            // 添加悬停效果
            addDeviceButton.addEventListener('mouseenter', () => {
                addDeviceButton.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
            });
            
            addDeviceButton.addEventListener('mouseleave', () => {
                addDeviceButton.style.backgroundColor = '';
            });

            // 添加点击事件
            addDeviceButton.addEventListener('click', () => {
                this.showAddDeviceInput();
            });

            deviceListElement.appendChild(addDeviceButton);

            // 恢复选中状态
            if (selectedDeviceId) {
                const deviceToSelect = document.querySelector(`.device-item[data-device-id="${selectedDeviceId}"]`);
                if (deviceToSelect) {
                    deviceToSelect.classList.add('selected');
                    // 使用主题色作为背景颜色
                    const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
                    deviceToSelect.style.backgroundColor = `${primaryColor}20`;
                    
                    // 启用确认按钮
                    if (confirmButton) {
                        confirmButton.disabled = false;
                    }
                    
                    // 控制开放5555端口按钮状态
                    const openPortBtn = document.getElementById('open-port-btn');
                    if (openPortBtn) {
                        // 只有USB设备（不包含冒号）才能开放端口
                        if (!selectedDeviceId.includes(':')) {
                            openPortBtn.disabled = false;
                        } else {
                            openPortBtn.disabled = true;
                        }
                    }
                    
                    // 如果设备状态已保存，自动显示设备信息卡片
                    if (this.deviceStatusSaved) {
                        const deviceStatusCard = document.getElementById('modal-device-status-card');
                        if (deviceStatusCard) {
                            deviceStatusCard.classList.remove('hidden');
                        }
                        // 获取设备详细信息
                        this.getDeviceInfo(selectedDeviceId, true);
                    }
                }
            }
        }

        // 隐藏无设备提示
        if (noDevicesElement) noDevicesElement.classList.add('hidden');
    }

    // 显示新增设备输入框
    showAddDeviceInput() {
        // 清除设备选择
        document.querySelectorAll('.device-item.selected').forEach(item => {
            item.classList.remove('selected');
            item.style.backgroundColor = '';
        });
        
        // 禁用确认按钮和开放端口按钮
        const confirmButton = document.getElementById('device-modal-confirm-btn');
        const openPortBtn = document.getElementById('open-port-btn');
        if (confirmButton) {
            confirmButton.disabled = true;
        }
        if (openPortBtn) {
            openPortBtn.disabled = true;
        }

        // 隐藏设备状态卡片
        const deviceStatusCard = document.getElementById('modal-device-status-card');
        if (deviceStatusCard) {
            deviceStatusCard.classList.add('hidden');
        }

        const deviceListElement = document.getElementById('device-list');
        const addDeviceInputContainer = document.getElementById('add-device-input-container');

        if (deviceListElement) deviceListElement.classList.add('hidden');
        if (addDeviceInputContainer) addDeviceInputContainer.classList.remove('hidden');

        // 添加取消按钮事件
        const addDeviceCancelBtn = document.getElementById('add-device-cancel-btn');
        if (addDeviceCancelBtn) {
            addDeviceCancelBtn.addEventListener('click', () => {
                this.hideAddDeviceInput();
            });
        }

        // 添加确认按钮事件
        const addDeviceConfirmBtn = document.getElementById('add-device-confirm-btn');
        if (addDeviceConfirmBtn) {
            addDeviceConfirmBtn.addEventListener('click', () => {
                this.addDeviceByIp();
            });
        }

        // 添加输入框回车事件
        const addDeviceInput = document.getElementById('add-device-input');
        if (addDeviceInput) {
            addDeviceInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.addDeviceByIp();
                }
            });
        }
    }

    // 隐藏新增设备输入框
    hideAddDeviceInput() {
        const deviceListElement = document.getElementById('device-list');
        const addDeviceInputContainer = document.getElementById('add-device-input-container');
        const addDeviceInput = document.getElementById('add-device-input');
        const addDeviceResult = document.getElementById('add-device-result');

        if (deviceListElement) deviceListElement.classList.remove('hidden');
        if (addDeviceInputContainer) addDeviceInputContainer.classList.add('hidden');
        if (addDeviceInput) addDeviceInput.value = '';
        if (addDeviceResult) addDeviceResult.classList.add('hidden');
        
        // 检查是否有设备被选中
        const selectedDevice = document.querySelector('.device-item.selected');
        const deviceStatusCard = document.getElementById('device-status-card');
        
        if (selectedDevice && deviceStatusCard) {
            // 如果有设备被选中，保持状态卡片显示
            deviceStatusCard.classList.remove('hidden');
        } else if (deviceStatusCard) {
            // 否则隐藏状态卡片
            deviceStatusCard.classList.add('hidden');
        }
    }

    // 按IP新增设备
    async addDeviceByIp() {
        const addDeviceInput = document.getElementById('add-device-input');
        const addDeviceResult = document.getElementById('add-device-result');

        if (!addDeviceInput || !addDeviceResult) return;

        const input = addDeviceInput.value.trim();
        if (!input) {
            this.showAddDeviceResult(window.i18n.t('deviceModal.enterIp'), 'error');
            return;
        }

        // 校验IP格式
        let ipAddress, port = 5555;
        if (input.includes(':')) {
            const parts = input.split(':');
            ipAddress = parts[0];
            port = parseInt(parts[1]);
            if (isNaN(port)) {
                this.showAddDeviceResult(window.i18n.t('deviceModal.portFormatError'), 'error');
                return;
            }
        } else {
            ipAddress = input;
        }

        // 校验IP地址格式
        const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        if (!ipRegex.test(ipAddress)) {
            this.showAddDeviceResult(window.i18n.t('deviceModal.ipFormatError'), 'error');
            return;
        }

        // 执行adb connect命令
        try {
            this.showAddDeviceResult(window.i18n.t('deviceModal.connecting'), 'info');
            const deviceAddress = `${ipAddress}:${port}`;
            const result = await this.executeAdbCommand(`connect ${deviceAddress}`);
            
            if (result.success) {
                this.showAddDeviceResult(`${window.i18n.t('deviceModal.connectSuccess')}: ${deviceAddress}`, 'success');
                // 重新扫描设备
                setTimeout(async () => {
                    await this.scanDevices();
                }, 1000);
            } else {
                this.showAddDeviceResult(`${window.i18n.t('deviceModal.connectFailed')}: ${result.error}`, 'error');
            }
        } catch (error) {
            this.showAddDeviceResult(`${window.i18n.t('deviceModal.connectFailed')}: ${error.message}`, 'error');
        }
    }

    // 显示新增设备结果
    showAddDeviceResult(message, type) {
        const addDeviceResult = document.getElementById('add-device-result');
        if (!addDeviceResult) return;

        addDeviceResult.textContent = message;
        addDeviceResult.classList.remove('hidden', 'error', 'success', 'info');
        addDeviceResult.style.backgroundColor = '';
        addDeviceResult.style.color = '';
        addDeviceResult.style.border = '';
        
        if (type) {
            addDeviceResult.classList.add(type);
        }

        addDeviceResult.classList.remove('hidden');
    }
    
    // 显示悬浮提示
    showFloatingTooltip(element, message, type = 'info', duration = 3000) {
        // 移除已存在的提示
        const existingTooltip = document.querySelector('.floating-tooltip');
        if (existingTooltip) {
            existingTooltip.remove();
        }
        
        // 创建提示元素
        const tooltip = document.createElement('div');
        tooltip.className = 'floating-tooltip';
        tooltip.textContent = message;
        
        // 设置样式
        tooltip.style.position = 'absolute';
        tooltip.style.zIndex = '1000';
        tooltip.style.padding = '8px 12px';
        tooltip.style.borderRadius = '4px';
        tooltip.style.fontSize = '12px';
        tooltip.style.whiteSpace = 'nowrap';
        tooltip.style.opacity = '0';
        tooltip.style.transform = 'translateY(10px)';
        tooltip.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        
        // 根据类型设置颜色
        switch (type) {
            case 'error':
                tooltip.style.backgroundColor = '#ffebee';
                tooltip.style.color = '#c62828';
                tooltip.style.border = '1px solid #ef5350';
                break;
            case 'success':
                tooltip.style.backgroundColor = '#e8f5e8';
                tooltip.style.color = '#2e7d32';
                tooltip.style.border = '1px solid #4caf50';
                break;
            case 'info':
                tooltip.style.backgroundColor = '#e3f2fd';
                tooltip.style.color = '#1565c0';
                tooltip.style.border = '1px solid #2196f3';
                break;
        }
        
        // 添加到文档
        document.body.appendChild(tooltip);
        
        // 计算位置
        const elementRect = element.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        
        tooltip.style.left = `${elementRect.left + (elementRect.width - tooltipRect.width) / 2}px`;
        tooltip.style.top = `${elementRect.bottom + 8}px`;
        
        // 显示提示
        setTimeout(() => {
            tooltip.style.opacity = '1';
            tooltip.style.transform = 'translateY(0)';
        }, 10);
        
        // 自动隐藏
        setTimeout(() => {
            tooltip.style.opacity = '0';
            tooltip.style.transform = 'translateY(10px)';
            
            // 动画结束后移除
            setTimeout(() => {
                if (document.body.contains(tooltip)) {
                    tooltip.remove();
                }
            }, 300);
        }, duration);
        
        return tooltip;
    }
    
    // 获取设备详细信息
    async getDeviceInfo(deviceId, isModal = false) {
        try {
            // 显示加载动画，隐藏内容
            if (isModal) {
                const loadingElement = document.getElementById('modal-device-loading');
                const contentElement = document.getElementById('modal-device-info-content');
                if (loadingElement) loadingElement.style.display = 'flex';
                if (contentElement) contentElement.style.display = 'none';
            } else {
                const loadingElement = document.getElementById('device-loading');
                const contentElement = document.getElementById('device-info-content');
                if (loadingElement) loadingElement.style.display = 'flex';
                if (contentElement) contentElement.style.display = 'none';
            }
            
            // 重置状态卡片显示
            this.resetDeviceStatusCard(isModal);
            
            // 制造商
            const manufacturerResult = await this.executeAdbCommand('getprop ro.product.manufacturer', deviceId);
            let manufacturer = '-';
            if (manufacturerResult.success) {
                manufacturer = manufacturerResult.output.trim() || '-';
            }
            
            // 型号
            const modelResult = await this.executeAdbCommand('getprop ro.product.model', deviceId);
            let model = '-';
            if (modelResult.success) {
                model = modelResult.output.trim() || '-';
            }
            
            // Android版本
            const androidVersionResult = await this.executeAdbCommand('getprop ro.build.version.release', deviceId);
            let androidVersion = '-';
            if (androidVersionResult.success) {
                androidVersion = androidVersionResult.output.trim() || '-';
            }
            
            // 只有在外面的设备信息卡片中才获取WiFi、电池、存储和内存信息
            let wifi = '-';
            let battery = '-';
            let storage = '-';
            let memory = '-';
            
            if (!isModal) {
                // WiFi连接 - 尝试多种方法获取SSID
                // 方法1: dumpsys wifi (适用于大多数Android版本)
                const wifiResult = await this.executeAdbCommand('dumpsys wifi', deviceId);
                if (wifiResult.success) {
                    const wifiInfo = wifiResult.output.trim();
                    if (wifiInfo) {
                        // 尝试匹配 SSID: "xxx" 格式
                        const ssidMatch1 = wifiInfo.match(/SSID:\s*"([^"]+)"/i);
                        if (ssidMatch1) {
                            wifi = ssidMatch1[1];
                        }
                        
                        // 尝试匹配 ssid: "xxx" 或 ssid=xxx 格式
                        if (wifi === '-') {
                            const ssidMatch2 = wifiInfo.match(/ssid[=:\s]+"?([^"\n]+)"?/i);
                            if (ssidMatch2) {
                                wifi = ssidMatch2[1].replace(/"/g, '');
                            }
                        }
                        
                        // 尝试匹配 mWifiInfo 中的 SSID (Android 9+)
                        if (wifi === '-') {
                            const ssidMatch3 = wifiInfo.match(/mWifiInfo\s*\{[^}]*SSID:\s*"?([^",}\n]+)"?/i);
                            if (ssidMatch3) {
                                wifi = ssidMatch3[1].replace(/"/g, '');
                            }
                        }
                    }
                }
                
                // 方法2: dumpsys connectivity (适用于Android 8+)
                if (wifi === '-') {
                    const connectivityResult = await this.executeAdbCommand('dumpsys connectivity', deviceId);
                    if (connectivityResult.success) {
                        const connectivityInfo = connectivityResult.output.trim();
                        if (connectivityInfo) {
                            // 匹配 NetworkAgentInfo 中的 SSID
                            const ssidMatch = connectivityInfo.match(/NetworkAgentInfo[^}]*ssid[=:\s]+"?([^",}\n]+)"?/i);
                            if (ssidMatch) {
                                wifi = ssidMatch[1].replace(/"/g, '').replace(/\s*$/, '');
                            }
                        }
                    }
                }
                
                // 方法3: 使用 cmd wifi (Android 7+)
                if (wifi === '-') {
                    const cmdWifiResult = await this.executeAdbCommand('cmd wifi list-connections', deviceId);
                    if (cmdWifiResult.success && cmdWifiResult.output.trim()) {
                        const lines = cmdWifiResult.output.trim().split('\n');
                        for (const line of lines) {
                            if (line.includes('connected') || line.includes('COMPLETED')) {
                                const ssidMatch = line.match(/(\S+)\s+(?:connected|COMPLETED)/i);
                                if (ssidMatch) {
                                    wifi = ssidMatch[1];
                                    break;
                                }
                            }
                        }
                    }
                }
                
                // 方法4: 使用 iwconfig (需要 root 或特定权限)
                if (wifi === '-') {
                    const wifiResult2 = await this.executeAdbCommand('iwconfig wlan0', deviceId);
                    if (wifiResult2.success) {
                        const wifiInfo2 = wifiResult2.output.trim();
                        if (wifiInfo2) {
                            const ssidMatch2 = wifiInfo2.match(/ESSID:"([^"]+)"/);
                            if (ssidMatch2) {
                                wifi = ssidMatch2[1];
                            }
                        }
                    }
                }
                
                // 方法5: 读取 /proc/net/wireless (获取信号强度，间接确认WiFi连接)
                if (wifi === '-') {
                    const wirelessResult = await this.executeAdbCommand('cat /proc/net/wireless', deviceId);
                    if (wirelessResult.success && wirelessResult.output.includes('wlan0')) {
                        // WiFi已连接但无法获取SSID
                        wifi = '(已连接)';
                    }
                }
                
                // 电池电量
                const batteryResult = await this.executeAdbCommand('dumpsys battery | grep "level"', deviceId);
                if (batteryResult.success) {
                    const batteryInfo = batteryResult.output.trim();
                    if (batteryInfo) {
                        // 提取电量
                        const levelMatch = batteryInfo.match(/level:\s*(\d+)/);
                        if (levelMatch) {
                            battery = `${levelMatch[1]}%`;
                        }
                    }
                }
                
                // 存储使用 - 使用 df /sdcard 获取更准确的数据
                const storageResult = await this.executeAdbCommand('df /sdcard', deviceId);
                if (storageResult.success) {
                    const storageInfo = storageResult.output.trim();
                    if (storageInfo) {
                        // 提取存储信息
                        const lines = storageInfo.split('\n');
                        if (lines.length > 1) {
                            const dataLine = lines[1];
                            const parts = dataLine.split(/\s+/).filter(part => part);
                            if (parts.length >= 5) {
                                const totalKB = parseInt(parts[1]); // 单位：1KB块
                                const usedKB = parseInt(parts[2]);  // 单位：1KB块
                                
                                if (totalKB > 0) {
                                    // 转换为GB并保留两位小数
                                    const totalGB = (totalKB / (1024 * 1024)).toFixed(2);
                                    const usedGB = (usedKB / (1024 * 1024)).toFixed(2);
                                    storage = `${usedGB} GB/${totalGB} GB`;
                                }
                            }
                        }
                    }
                }
                
                // 内存使用 - 使用 /proc/meminfo 获取更准确的数据
                const memoryResult = await this.executeAdbCommand('cat /proc/meminfo', deviceId);
                if (memoryResult.success) {
                    const memoryInfo = memoryResult.output.trim();
                    if (memoryInfo) {
                        // 提取 MemTotal 和 MemFree
                        const lines = memoryInfo.split('\n');
                        let memTotal = 0;
                        let memFree = 0;
                        
                        for (const line of lines) {
                            if (line.startsWith('MemTotal:')) {
                                const parts = line.split(/\s+/).filter(part => part);
                                if (parts.length >= 2) {
                                    memTotal = parseInt(parts[1]); // 单位：kB
                                }
                            } else if (line.startsWith('MemFree:')) {
                                const parts = line.split(/\s+/).filter(part => part);
                                if (parts.length >= 2) {
                                    memFree = parseInt(parts[1]); // 单位：kB
                                }
                            }
                        }
                        
                        if (memTotal > 0) {
                            // 计算已使用内存
                            const memUsed = memTotal - memFree;
                            
                            // 转换为GB并保留两位小数
                            const totalGB = (memTotal / (1024 * 1024)).toFixed(2);
                            const usedGB = (memUsed / (1024 * 1024)).toFixed(2);
                            memory = `${usedGB} GB/${totalGB} GB`;
                        }
                    }
                }
            }
            
            // 获取完所有信息后，一次性更新UI
            // 制造商
            const manufacturerId = isModal ? 'modal-device-manufacturer' : 'device-manufacturer';
            const manufacturerElement = document.getElementById(manufacturerId);
            if (manufacturerElement) {
                manufacturerElement.textContent = manufacturer;
            }
            
            // 型号
            const modelId = isModal ? 'modal-device-model' : 'device-model';
            const modelElement = document.getElementById(modelId);
            if (modelElement) {
                modelElement.textContent = model;
            }
            
            // Android版本
            const androidVersionId = isModal ? 'modal-device-android-version' : 'device-android-version';
            const androidVersionElement = document.getElementById(androidVersionId);
            if (androidVersionElement) {
                androidVersionElement.textContent = androidVersion;
            }
            
            // 只有在外面的设备信息卡片中才更新WiFi、电池、存储和内存信息
            if (!isModal) {
                // WiFi
                const wifiElement = document.getElementById('device-wifi');
                if (wifiElement) {
                    wifiElement.textContent = wifi;
                }
                
                // 电池
                const batteryElement = document.getElementById('device-battery');
                if (batteryElement) {
                    batteryElement.textContent = battery;
                }
                
                // 存储
                const storageElement = document.getElementById('device-storage');
                if (storageElement) {
                    storageElement.textContent = storage;
                }
                
                // 内存
                const memoryElement = document.getElementById('device-memory');
                if (memoryElement) {
                    memoryElement.textContent = memory;
                }
            }
            
            // 隐藏加载动画，显示内容
            if (isModal) {
                const loadingElement = document.getElementById('modal-device-loading');
                const contentElement = document.getElementById('modal-device-info-content');
                if (loadingElement) loadingElement.style.display = 'none';
                if (contentElement) contentElement.style.display = 'flex';
            } else {
                const loadingElement = document.getElementById('device-loading');
                const contentElement = document.getElementById('device-info-content');
                if (loadingElement) loadingElement.style.display = 'none';
                if (contentElement) contentElement.style.display = 'grid';
            }
        } catch (error) {
            console.error('获取设备信息失败:', error);
            
            // 出错时也隐藏加载动画，显示内容
            if (isModal) {
                const loadingElement = document.getElementById('modal-device-loading');
                const contentElement = document.getElementById('modal-device-info-content');
                if (loadingElement) loadingElement.style.display = 'none';
                if (contentElement) contentElement.style.display = 'flex';
            } else {
                const loadingElement = document.getElementById('device-loading');
                const contentElement = document.getElementById('device-info-content');
                if (loadingElement) loadingElement.style.display = 'none';
                if (contentElement) contentElement.style.display = 'grid';
            }
        }
    }
    
    // 重置设备状态卡片
    resetDeviceStatusCard(isModal = false) {
        const prefix = isModal ? 'modal-' : '';
        let statusElements = [
            `${prefix}device-manufacturer`,
            `${prefix}device-model`,
            `${prefix}device-android-version`
        ];
        
        // 只有在外面的设备信息卡片中才重置WiFi、电池、存储和内存信息
        if (!isModal) {
            statusElements = statusElements.concat([
                'device-wifi',
                'device-battery',
                'device-storage',
                'device-memory'
            ]);
        }
        
        statusElements.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = '-';
            }
        });
    }

    // 扫描设备
    async scanDevices() {
        try {
            // 调用后端API扫描设备
            // 这里需要在electron/main.js中添加对应的API
            // 暂时使用模拟数据
            const devices = await this.getConnectedDevices();
            this.displayDevices(devices);
        } catch (error) {
            console.error('扫描设备失败:', error);
            this.displayDevices([]);
        }
    }

    // 获取连接的设备列表
    async getConnectedDevices() {
        try {
            // 检查electronAPI是否可用
            if (window.electronAPI && window.electronAPI.getConnectedDevices) {
                return await window.electronAPI.getConnectedDevices();
            }
        } catch (error) {
            console.error('获取设备列表失败:', error);
            return [];
        }
    }

    // 确认设备选择
    confirmDeviceSelection() {
        // 获取选中的设备
        const selectedDeviceElement = document.querySelector('.device-item.selected');
        if (selectedDeviceElement) {
            const deviceName = selectedDeviceElement.getAttribute('data-device-id');
            this.selectedDevice = deviceName;
            this.deviceStatusSaved = true; // 标记设备状态已保存
            this.updateSelectedDeviceDisplay();
            
            // 显示设备信息卡片并获取设备信息
            const deviceInfoCard = document.getElementById('device-info-card');
            if (deviceInfoCard) {
                deviceInfoCard.classList.remove('hidden');
            }
            
            // 获取设备详细信息
            this.getDeviceInfo(deviceName);
            
            // 自动加载文件列表
            this.loadFileList();
        }
        this.hideDeviceModal();
    }

    // 更新选中设备的显示
    updateSelectedDeviceDisplay() {
        const deviceNameElement = document.getElementById('selected-device-name');
        const screenControlBtn = document.getElementById('screen-control-btn');
        const deviceInfoCard = document.getElementById('device-info-card');
        
        if (deviceNameElement) {
            if (this.selectedDevice) {
                deviceNameElement.textContent = this.truncateDeviceName(this.selectedDevice);
                deviceNameElement.title = this.selectedDevice; // 鼠标悬浮时显示完整名称
                deviceNameElement.style.color = 'var(--text-primary)';
                
                // 启用屏幕控制按钮
                if (screenControlBtn) {
                    screenControlBtn.disabled = false;
                }
                
                // 显示设备信息卡片
                if (deviceInfoCard) {
                    deviceInfoCard.classList.remove('hidden');
                }
                
                // 启用文件管理器
                this.toggleFileManagerEnabled(true);
            } else {
                deviceNameElement.textContent = window.i18n.t('android.noDeviceSelected');
                deviceNameElement.title = '';
                deviceNameElement.style.color = 'var(--text-secondary)';
                
                // 禁用屏幕控制按钮
                if (screenControlBtn) {
                    screenControlBtn.disabled = true;
                }
                
                // 隐藏设备信息卡片
                if (deviceInfoCard) {
                    deviceInfoCard.classList.add('hidden');
                }
                
                // 禁用文件管理器
                this.toggleFileManagerEnabled(false);
            }
        }
    }
    
    // 切换文件管理器的启用/禁用状态
    toggleFileManagerEnabled(enabled) {
        // 禁用/启用操作按钮
        const fileManagerActions = document.querySelector('.file-manager-actions');
        if (fileManagerActions) {
            if (enabled) {
                fileManagerActions.classList.remove('disabled');
                // 启用所有按钮
                const buttons = fileManagerActions.querySelectorAll('button');
                buttons.forEach(btn => {
                    btn.disabled = false;
                });
            } else {
                fileManagerActions.classList.add('disabled');
                // 禁用所有按钮
                const buttons = fileManagerActions.querySelectorAll('button');
                buttons.forEach(btn => {
                    btn.disabled = true;
                });
            }
        }
        
        // 禁用/启用当前路径显示
        const currentPath = document.getElementById('current-path');
        if (currentPath) {
            if (enabled) {
                currentPath.classList.remove('disabled');
            } else {
                currentPath.classList.add('disabled');
            }
        }
        
        // 禁用/启用文件列表内容
        const fileManagerContent = document.querySelector('.file-manager-content');
        if (fileManagerContent) {
            if (enabled) {
                fileManagerContent.classList.remove('disabled');
            } else {
                fileManagerContent.classList.add('disabled');
            }
        }
        
        // 如果启用且当前路径有效，加载文件列表
        if (enabled) {
            this.loadFileList();
        } else {
            // 清空文件列表
            const fileList = document.getElementById('file-list');
            if (fileList) {
                fileList.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;"><div style="display: flex; align-items: center; justify-content: center; gap: 8px;">' + this.getIconHtml('info', 'vertical-align: middle;') + '<span style="vertical-align: middle;">' + window.i18n.t('fileManager.selectDeviceFirst') + '</span></div></td></tr>';
            }
        }
    }

    // 截断设备名称
    truncateDeviceName(deviceName, maxLength = 20) {
        if (deviceName.length <= maxLength) {
            return deviceName;
        }
        return deviceName.substring(0, maxLength - 3) + '...';
    }

    async updateTestTypesFromSelectedFiles() {
        if (this.selectedTestFiles.length === 0) {
            // 没有选中文件时，显示占位提示
            this.displayTestTypes([], window.i18n.t('testExecution.selectTestFileFirst'));
            return;
        }

        try {
            // 从选中的文件中提取pytest标记
            const markers = await this.extractMarkersFromSelectedFiles();
            
            if (markers.length === 0) {
                // 选中的文件没有标记时，显示占位提示
                this.displayTestTypes([], '选中的文件没有pytest标记，将执行所有测试');
            } else {
                // 显示从文件中提取的标记
                this.displayTestTypes(markers);
            }
        } catch (error) {
            console.error('提取标记失败:', error);
            this.displayTestTypes([], '提取标记失败，将执行所有测试');
        }
    }

    async extractMarkersFromSelectedFiles() {
        // 防重复调用机制：如果正在提取标记，等待完成
        if (this.extractingMarkers) {

            return await this.extractingMarkers;
        }
        
        // 调用后端API来扫描选中的文件并提取pytest标记
        try {

            
            // 设置提取状态
            this.extractingMarkers = window.electronAPI.extractPytestMarkers(this.selectedTestFiles.map(f => f.path));
            const markers = await this.extractingMarkers;
            

            return markers;
        } catch (error) {
            console.error('提取pytest标记失败:', error);
            // 如果后端API调用失败，返回空数组（不添加任何默认标记）
            return [];
        } finally {
            // 清除提取状态
            this.extractingMarkers = null;
        }
    }

    async extractMarkersFromModalSelectedFiles(selectedFiles) {
        try {
            // 调用后端API来提取实际的pytest标记
            const filePaths = selectedFiles.map(file => file.path);
            const markers = await window.electronAPI.extractPytestMarkers(filePaths);
            
            if (markers && markers.length > 0) {
                return markers;
            } else {
                // 如果没有找到标记，返回空数组
                return [];
            }
        } catch (error) {
            console.error('提取pytest标记失败:', error);
            // 出错时返回空数组
            return [];
        }
    }

    /**
     * 检查测试计划是否包含Android平台的测试用例
     * @param {Object} testPlan - 测试计划对象
     * @returns {Promise<{required: boolean, cases: Array}>}
     */
    async checkAndroidDeviceRequired(testPlan) {
        if (!testPlan || !testPlan.testFiles || testPlan.testFiles.length === 0) {
            return { required: false, cases: [] };
        }

        const androidCases = [];
        
        for (const testFile of testPlan.testFiles) {
            try {
                // 获取测试文件对应的JSON用例数据
                // testFile.name 包含 .py 扩展名，需要移除
                let fileName = testFile.name || testFile.path;
                // 移除 .py 扩展名
                if (fileName.endsWith('.py')) {
                    fileName = fileName.slice(0, -3);
                }
                // 如果是完整路径，只取文件名
                if (fileName.includes('/') || fileName.includes('\\')) {
                    fileName = fileName.split(/[\\/]/).pop();
                }
                
                const result = await window.electronAPI.testCase.get(fileName);
                
                if (result && result.success && result.data) {
                    const caseData = result.data;
                    // 检查平台是否为Android或未设置(默认为Android)
                    const platform = caseData.platform || 'android';
                    if (platform.toLowerCase() === 'android') {
                        androidCases.push({
                            fileName: fileName,
                            filePath: testFile.path,  // 保存完整文件路径
                            caseData: caseData
                        });
                    }
                }
            } catch (error) {
                console.warn(`检查测试文件平台失败: ${testFile.name}`, error);
            }
        }

        return {
            required: androidCases.length > 0,
            cases: androidCases
        };
    }

    /**
     * 检查Android用例的DEVICE_NAME是否为占位符或未设置
     * @param {Array} androidCases - Android测试用例数组
     * @returns {{hasPlaceholder: boolean, existingDevice: string|null}}
     */
    checkDeviceNamePlaceholder(androidCases) {
        if (!androidCases || androidCases.length === 0) {
            return { hasPlaceholder: true, existingDevice: null };
        }

        let hasPlaceholder = false;
        let existingDevice = null;

        for (const caseItem of androidCases) {
            const deviceName = caseItem.caseData?.deviceConfig?.deviceName;
            
            if (!deviceName || deviceName === '' || deviceName === '{{DEVICE_NAME}}') {
                hasPlaceholder = true;
            } else if (deviceName && !existingDevice) {
                existingDevice = deviceName;
            }
        }

        return { hasPlaceholder, existingDevice };
    }

    /**
     * 显示设备选择弹窗并处理设备选择
     * @param {Array} androidCases - Android测试用例数组
     * @returns {Promise<boolean>} - 是否成功选择设备
     */
    async showDeviceSelectionForTest(androidCases) {
        return new Promise((resolve) => {
            // 保存回调引用
            this._deviceSelectionResolve = resolve;
            this._pendingAndroidCases = androidCases;
            
            // 显示设备管理弹窗
            this.showDeviceManagementModal();
            
            // 修改确认按钮的行为
            const confirmBtn = document.getElementById('device-modal-confirm-btn');
            if (confirmBtn) {
                // 移除原有事件监听
                const newConfirmBtn = confirmBtn.cloneNode(true);
                confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
                
                // 添加新的事件监听
                newConfirmBtn.addEventListener('click', () => {
                    this.onDeviceSelectionConfirm();
                });
            }
        });
    }

    /**
     * 设备选择确认处理
     */
    async onDeviceSelectionConfirm() {
        const selectedDeviceElement = document.querySelector('.device-item.selected');
        
        if (!selectedDeviceElement) {
            const modalContainer = document.querySelector('#device-modal-overlay .modal-container');
            Toast.error(window.i18n.t('testExecution.deviceSelection.deviceRequired'), { container: modalContainer });
            return;
        }

        const deviceId = selectedDeviceElement.getAttribute('data-device-id');
        
        if (!deviceId) {
            const modalContainer = document.querySelector('#device-modal-overlay .modal-container');
            Toast.error(window.i18n.t('testExecution.deviceSelection.deviceRequired'), { container: modalContainer });
            return;
        }

        // 获取设备的Android版本
        let platformVersion = '';
        try {
            const androidVersionResult = await this.executeAdbCommand('getprop ro.build.version.release', deviceId);
            if (androidVersionResult.success) {
                platformVersion = androidVersionResult.output.trim() || '';
            }
        } catch (error) {
            console.warn('获取Android版本失败:', error);
        }

        // 更新所有Android用例的DEVICE_NAME和PLATFORM_VERSION并重新生成Python文件
        if (this._pendingAndroidCases && this._pendingAndroidCases.length > 0) {
            for (const caseItem of this._pendingAndroidCases) {
                try {
                    // 更新用例数据
                    if (!caseItem.caseData.deviceConfig) {
                        caseItem.caseData.deviceConfig = {};
                    }
                    caseItem.caseData.deviceConfig.deviceName = deviceId;
                    if (platformVersion) {
                        caseItem.caseData.deviceConfig.platformVersion = platformVersion;
                    }
                    
                    // 从测试文件路径中提取输出目录
                    const filePath = caseItem.filePath;
                    let outputDir = this.selectedDirectory;
                    
                    // 如果有文件路径，从中提取目录
                    if (filePath) {
                        const pathParts = filePath.split(/[\\/]/);
                        outputDir = pathParts.slice(0, -1).join('/');
                    }
                    
                    // 如果没有找到目录，使用当前选中的测试目录
                    if (!outputDir) {
                        outputDir = this.selectedDirectory;
                    }
                    
                    // 保存并重新生成Python文件
                    const result = await window.electronAPI.testCase.saveAndGenerate(caseItem.caseData, outputDir);
                    
                    if (!result.success) {
                        console.error(`保存并生成测试用例失败: ${caseItem.fileName}`, result.error);
                    }
                } catch (error) {
                    console.error(`更新测试用例设备信息失败: ${caseItem.fileName}`, error);
                }
            }
        }

        // 隐藏弹窗
        this.hideDeviceModal();

        // 解析Promise
        if (this._deviceSelectionResolve) {
            this._deviceSelectionResolve(true);
            this._deviceSelectionResolve = null;
            this._pendingAndroidCases = null;
        }
    }

    _restoreInspectorDeviceZIndex() {
        const overlay = document.getElementById('device-modal-overlay');
        if (overlay) {
            overlay.style.zIndex = '';
        }
    }

    async showDeviceSelectionForInspector() {
        return new Promise((resolve, reject) => {
            this._inspectorDeviceResolve = resolve;
            this._inspectorDeviceReject = reject;

            const overlay = document.getElementById('device-modal-overlay');
            if (overlay) {
                overlay.style.zIndex = '1500';
            }

            this.showDeviceManagementModal();

            const confirmBtn = document.getElementById('device-modal-confirm-btn');
            if (confirmBtn) {
                const newConfirmBtn = confirmBtn.cloneNode(true);
                confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
                newConfirmBtn.addEventListener('click', () => {
                    this.onInspectorDeviceConfirm();
                });
            }

            const closeBtn = document.getElementById('device-modal-close-btn');
            if (closeBtn) {
                const newCloseBtn = closeBtn.cloneNode(true);
                closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
                newCloseBtn.addEventListener('click', () => {
                    this._restoreInspectorDeviceZIndex();
                    this.hideDeviceModal();
                    if (this._inspectorDeviceReject) {
                        this._inspectorDeviceReject(new Error('cancelled'));
                        this._inspectorDeviceResolve = null;
                        this._inspectorDeviceReject = null;
                    }
                });
            }

            const cancelBtn = document.getElementById('device-modal-cancel-btn');
            if (cancelBtn) {
                const newCancelBtn = cancelBtn.cloneNode(true);
                cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
                newCancelBtn.addEventListener('click', () => {
                    const addDeviceInputContainer = document.getElementById('add-device-input-container');
                    if (addDeviceInputContainer && !addDeviceInputContainer.classList.contains('hidden')) {
                        this.hideAddDeviceInput();
                    } else {
                        this._restoreInspectorDeviceZIndex();
                        this.hideDeviceModal();
                        if (this._inspectorDeviceReject) {
                            this._inspectorDeviceReject(new Error('cancelled'));
                            this._inspectorDeviceResolve = null;
                            this._inspectorDeviceReject = null;
                        }
                    }
                });
            }
        });
    }

    onInspectorDeviceConfirm() {
        const selectedDeviceElement = document.querySelector('.device-item.selected');

        if (!selectedDeviceElement) {
            const modalContainer = document.querySelector('#device-modal-overlay .modal-container');
            Toast.error(window.i18n.t('testExecution.deviceSelection.deviceRequired'), { container: modalContainer });
            return;
        }

        const deviceId = selectedDeviceElement.getAttribute('data-device-id');

        if (!deviceId) {
            const modalContainer = document.querySelector('#device-modal-overlay .modal-container');
            Toast.error(window.i18n.t('testExecution.deviceSelection.deviceRequired'), { container: modalContainer });
            return;
        }

        this._restoreInspectorDeviceZIndex();
        this.hideDeviceModal();

        if (this._inspectorDeviceResolve) {
            this._inspectorDeviceResolve(deviceId);
            this._inspectorDeviceResolve = null;
            this._inspectorDeviceReject = null;
        }
    }

    /**
     * 显示替换设备确认弹窗
     * @param {string} currentDevice - 当前设备名称
     * @returns {Promise<boolean>} - 是否要替换设备
     */
    async showReplaceDeviceConfirm(currentDevice) {
        return new Promise((resolve) => {
            const modal = document.getElementById('confirm-modal-overlay');
            const titleEl = document.getElementById('confirm-modal-title');
            const messageEl = document.getElementById('confirm-modal-message');
            const confirmBtn = document.getElementById('confirm-modal-confirm-btn');
            const cancelBtn = document.getElementById('confirm-modal-cancel-btn');

            if (!modal || !confirmBtn || !cancelBtn) {
                console.error('确认弹窗元素未找到');
                resolve(false);
                return;
            }

            if (titleEl) {
                titleEl.textContent = window.i18n.t('testExecution.deviceSelection.replaceConfirmTitle');
            }
            if (messageEl) {
                messageEl.textContent = window.i18n.t('testExecution.deviceSelection.replaceConfirmMessage', { device: currentDevice });
            }
            confirmBtn.textContent = window.i18n.t('testExecution.deviceSelection.replaceDevice');
            cancelBtn.textContent = window.i18n.t('testExecution.deviceSelection.keepCurrent');

            // 显示弹窗
            modal.classList.remove('hidden');

            // 处理确认按钮
            const handleConfirm = () => {
                modal.classList.add('hidden');
                confirmBtn.removeEventListener('click', handleConfirm);
                cancelBtn.removeEventListener('click', handleCancel);
                resolve(true);
            };

            // 处理取消按钮
            const handleCancel = () => {
                modal.classList.add('hidden');
                confirmBtn.removeEventListener('click', handleConfirm);
                cancelBtn.removeEventListener('click', handleCancel);
                resolve(false);
            };

            confirmBtn.addEventListener('click', handleConfirm);
            cancelBtn.addEventListener('click', handleCancel);
        });
    }

    /**
     * 检查安卓用例是否已填写设备信息
     * @returns {Promise<{valid: boolean, message: string}>}
     */
    async checkAndroidDeviceConfig() {
        if (!this.selectedTestFiles || this.selectedTestFiles.length === 0) {
            return { valid: true, message: '' };
        }

        const unconfiguredFiles = [];

        for (const file of this.selectedTestFiles) {
            let fileName = file.name || file.path;
            if (fileName.endsWith('.py')) {
                fileName = fileName.slice(0, -3);
            }
            if (fileName.includes('/') || fileName.includes('\\')) {
                fileName = fileName.split(/[\\/]/).pop();
            }

            try {
                const result = await window.electronAPI.testCase.get(fileName);
                if (result && result.success && result.data) {
                    const caseData = result.data;
                    const platform = caseData.platform;
                    
                    // 只检查安卓平台用例
                    if (platform && platform.toLowerCase() === 'android') {
                        const deviceName = caseData.deviceConfig?.deviceName;
                        // 检查设备名称是否为空或占位符
                        if (!deviceName || deviceName === '{{DEVICE_NAME}}' || deviceName.trim() === '') {
                            unconfiguredFiles.push(file.name || file.path);
                        }
                    }
                }
            } catch (error) {
                // 忽略单个文件的错误
            }
        }

        if (unconfiguredFiles.length > 0) {
            const fileList = unconfiguredFiles.length > 3 
                ? unconfiguredFiles.slice(0, 3).join(', ') + '...'
                : unconfiguredFiles.join(', ');
            return {
                valid: false,
                message: window.i18n.t('testExecution.deviceSelection.deviceNotConfigured', { files: fileList })
            };
        }

        return { valid: true, message: '' };
    }

    /**
     * 检查蓝牙用例是否已填写端口信息
     * @returns {Promise<{valid: boolean, message: string}>}
     */
    async checkBlePortConfig() {
        if (!this.selectedTestFiles || this.selectedTestFiles.length === 0) {
            return { valid: true, message: '' };
        }

        const unconfiguredFiles = [];

        for (const file of this.selectedTestFiles) {
            let fileName = file.name || file.path;
            if (fileName.endsWith('.py')) {
                fileName = fileName.slice(0, -3);
            }
            if (fileName.includes('/') || fileName.includes('\\')) {
                fileName = fileName.split(/[\\/]/).pop();
            }

            try {
                const result = await window.electronAPI.testCase.get(fileName);
                if (result && result.success && result.data) {
                    const caseData = result.data;
                    const steps = caseData.steps || [];
                    
                    // 检查是否有蓝牙步骤
                    const hasBleSteps = steps.some(step => step.type === 'ble');
                    
                    if (hasBleSteps) {
                        const blePort = caseData.bleDevice?.port;
                        // 检查蓝牙端口是否为空
                        if (!blePort || blePort.trim() === '') {
                            unconfiguredFiles.push(file.name || file.path);
                        }
                    }
                }
            } catch (error) {
                // 忽略单个文件的错误
            }
        }

        if (unconfiguredFiles.length > 0) {
            const fileList = unconfiguredFiles.length > 3 
                ? unconfiguredFiles.slice(0, 3).join(', ') + '...'
                : unconfiguredFiles.join(', ');
            return {
                valid: false,
                message: window.i18n.t('testExecution.deviceSelection.blePortNotConfigured', { files: fileList })
            };
        }

        return { valid: true, message: '' };
    }

    async runTests(scheduledPlanInfo = null) {
        if (this.isRunning || !this.currentTestPlan) {
            if (!this.currentTestPlan) {
                this.showError(window.i18n.t('testExecution.selectTestPlanFirst'));
            }
            return;
        }

        // 检查安卓用例是否已填写设备信息
        const deviceCheckResult = await this.checkAndroidDeviceConfig();
        if (!deviceCheckResult.valid) {
            Toast.warning(deviceCheckResult.message);
            return;
        }

        // 检查蓝牙用例是否已填写端口信息
        const blePortCheckResult = await this.checkBlePortConfig();
        if (!blePortCheckResult.valid) {
            Toast.warning(blePortCheckResult.message);
            return;
        }

        this.isRunning = true;
        this.runningTestPlanName = this.currentTestPlan.name; // 保存正在执行的测试计划名称
        if (scheduledPlanInfo && scheduledPlanInfo.planId) {
            this.runningScheduledPlanId = scheduledPlanInfo.planId; // 保存正在执行的定时计划ID
        }
        this.updateUIForRunning();

        const loopCount = this.currentTestPlan.loopCount || 1;
        const continueOnFailure = this.currentTestPlan.continueOnFailure !== false;
        let hasFailure = false;
        let stoppedEarly = false;
        const loopResults = [];
        const aggregatedStats = { passed: 0, failed: 0, skipped: 0, broken: 0, total: 0 };

        this.appendOutput('\n>>> ========== ' + window.i18n.t('testExecution.testPlanDetails') + ' ==========');
        this.appendOutput('>>> ' + window.i18n.t('testExecution.planName') + ': ' + (this.currentTestPlan.name || ''));
        this.appendOutput('>>> ' + window.i18n.t('testExecution.planDescription') + ': ' + (this.currentTestPlan.description || window.i18n.t('common.none')));
        const testFileNames = this.selectedTestFiles.map(f => f.name || f.path).join(', ');
        this.appendOutput('>>> ' + window.i18n.t('testExecution.testFiles') + ': ' + (testFileNames || window.i18n.t('common.none')));
        const testTypes = this.getSelectedTestTypes().join(', ');
        this.appendOutput('>>> ' + window.i18n.t('testExecution.testTypes') + ': ' + (testTypes || window.i18n.t('testExecution.allTypes')));
        this.appendOutput('>>> ' + window.i18n.t('testExecution.loopSettings') + ': ' + window.i18n.t('testExecution.loopCount') + ' ' + loopCount + ', ' + window.i18n.t('testExecution.continueOnFailure') + ': ' + (continueOnFailure ? window.i18n.t('common.yes') : window.i18n.t('common.no')));

        if (scheduledPlanInfo) {
            this.appendOutput('>>> ---------- ' + window.i18n.t('testExecution.scheduledPlanInfo') + ' ----------');
            this.appendOutput('>>> ' + window.i18n.t('testExecution.scheduledPlanName') + ': ' + (scheduledPlanInfo.name || ''));
            this.appendOutput('>>> ' + window.i18n.t('testExecution.executionTime') + ': ' + (scheduledPlanInfo.executionTime || new Date().toLocaleString()));
        }

        this.appendOutput('>>> ==================================\n');

        try {
            for (let i = 1; i <= loopCount; i++) {
                if (!this.isRunning) {
                    stoppedEarly = true;
                    break;
                }

                this.updateLoopProgress(i, loopCount);

                const testConfig = {
                    testPaths: this.selectedTestFiles.map(f => f.path),
                    markers: this.getSelectedTestTypes(),
                    testPlanName: this.currentTestPlan?.name || null,
                    loopIndex: i,
                    totalLoops: loopCount
                };

                this.appendOutput(`\n>>> ${window.i18n.t('testExecution.loopProgress', { current: i, total: loopCount })}`);

                const result = await window.electronAPI.runPythonTests(testConfig);

                if (!result.success) {
                    hasFailure = true;
                    loopResults.push({ loop: i, success: false, testStats: result.testStats || null });
                    if (!continueOnFailure) {
                        this.appendError(`>>> ${window.i18n.t('testExecution.loopStopped', { current: i })}`);
                        break;
                    }
                    this.appendError(`>>> ${window.i18n.t('testExecution.loopFailed', { current: i })}`);
                } else {
                    loopResults.push({ loop: i, success: true, testStats: result.testStats || null });
                    this.appendOutput(`>>> ${window.i18n.t('testExecution.loopCompleted', { current: i })}`);
                }

                if (result.testStats) {
                    aggregatedStats.passed += result.testStats.passed || 0;
                    aggregatedStats.failed += result.testStats.failed || 0;
                    aggregatedStats.skipped += result.testStats.skipped || 0;
                    aggregatedStats.broken += result.testStats.broken || 0;
                    aggregatedStats.total += result.testStats.total || 0;
                }

                if (!this.isRunning) {
                    stoppedEarly = true;
                    break;
                }
            }

            if (!stoppedEarly) {
                if (!hasFailure || continueOnFailure) {
                    this.appendOutput('\n>>> ' + window.i18n.t('testExecution.allLoopsCompleted'));
                }
                this.enableViewReportButton();
            }
        } catch (error) {
            console.error('运行测试失败:', error);
            this.appendError(`>>> ${window.i18n.t('testExecution.testRunFailed')}: ${error.message}`);
        } finally {
            this.isRunning = false;
            this.updateUIForStopped();

            this.appendOutput('\n>>> ========== ' + window.i18n.t('testExecution.summaryInfo') + ' ==========');
            let passRate = '0.00';
            let passedLoops = 0;
            if (loopCount > 1) {
                passedLoops = loopResults.filter(r => r.success).length;
                passRate = loopResults.length > 0 ? ((passedLoops / loopResults.length) * 100).toFixed(2) : '0.00';
                this.appendOutput('>>> ' + window.i18n.t('testExecution.totalLoops') + ': ' + loopResults.length);
                this.appendOutput('>>> ' + window.i18n.t('testExecution.passedLoops') + ': ' + passedLoops);
                this.appendOutput('>>> ' + window.i18n.t('testExecution.passRate') + ': ' + passRate + '%');
            } else {
                const lastResult = loopResults[loopResults.length - 1];
                if (lastResult && lastResult.success) {
                    passedLoops = 1;
                    passRate = '100.00';
                }
            }
            
            // 用例级统计
            let casePassRate = '0.00';
            const effectiveTotal = aggregatedStats.passed + aggregatedStats.failed + aggregatedStats.broken;
            if (effectiveTotal > 0) {
                casePassRate = ((aggregatedStats.passed / effectiveTotal) * 100).toFixed(2);
            }
            if (aggregatedStats.total > 0) {
                this.appendOutput('>>> ' + window.i18n.t('testExecution.caseStats') + ': ' +
                    window.i18n.t('testExecution.casePassed') + ' ' + aggregatedStats.passed + ', ' +
                    window.i18n.t('testExecution.caseFailed') + ' ' + aggregatedStats.failed + ', ' +
                    window.i18n.t('testExecution.caseSkipped') + ' ' + aggregatedStats.skipped + ', ' +
                    window.i18n.t('testExecution.caseBroken') + ' ' + aggregatedStats.broken + ', ' +
                    window.i18n.t('testExecution.caseTotal') + ' ' + aggregatedStats.total);
                this.appendOutput('>>> ' + window.i18n.t('testExecution.casePassRate') + ': ' + casePassRate + '% (' + window.i18n.t('testExecution.excludingSkipped') + ')');
            }
            
            // 判断测试结果状态：通过/失败/跳过/部分通过/无测试用例
            let testStatus = 'passed';
            if (aggregatedStats.total === 0) {
                testStatus = 'noTests';
            } else if (aggregatedStats.failed > 0 || aggregatedStats.broken > 0) {
                if (aggregatedStats.passed > 0) {
                    testStatus = 'partialPassed';
                } else {
                    testStatus = 'failed';
                }
            } else if (aggregatedStats.skipped > 0 && aggregatedStats.passed === 0) {
                testStatus = 'skipped';
            } else if (aggregatedStats.skipped > 0 && aggregatedStats.passed > 0) {
                testStatus = 'partialPassed';
            } else {
                testStatus = 'passed';
            }
            
            // 退出码5特殊处理：未收集到测试用例
            const lastLoopResult = loopResults[loopResults.length - 1];
            if (lastLoopResult && !lastLoopResult.success && aggregatedStats.total === 0) {
                testStatus = 'noTests';
            }

            const statusMessages = {
                passed: window.i18n.t('testExecution.testPassed'),
                failed: window.i18n.t('testExecution.testFailed'),
                skipped: window.i18n.t('testExecution.testSkipped'),
                partialPassed: window.i18n.t('testExecution.testPartialPassed'),
                noTests: window.i18n.t('testExecution.testNoTests')
            };
            this.appendOutput('>>> ' + (statusMessages[testStatus] || window.i18n.t('testExecution.testFailed')));
            
            // 更新 hasFailure 变量以保持与通知一致
            hasFailure = (testStatus === 'failed' || testStatus === 'partialPassed');
            this.appendOutput('>>> ============================\n');

            const notificationInfo = {
                testPlanName: this.currentTestPlan?.name || '',
                testFileNames: testFileNames,
                testTypes: testTypes,
                loopCount: loopCount,
                totalLoops: loopResults.length,
                passRate: passRate,
                hasFailure: hasFailure,
                stoppedEarly: stoppedEarly,
                testStatus: testStatus,
                aggregatedStats: aggregatedStats,
                casePassRate: casePassRate
            };
            
            if (scheduledPlanInfo) {
                notificationInfo.scheduledPlanName = scheduledPlanInfo.name;
                notificationInfo.scheduledPlanExecutionTime = scheduledPlanInfo.executionTime;
            }
            
            await this.sendDingTalkNotificationAfterTest(notificationInfo);
        }
    }

    async sendDingTalkNotificationAfterTest(testInfo) {
        try {
            const config = await window.electronAPI.getConfig();
            
            const notificationConfig = config.APP_SETTINGS?.notification;
            if (!notificationConfig || notificationConfig.platform !== 'dingtalk') {
                return;
            }
            
            const dingtalkConfig = notificationConfig.dingtalk;
            if (!dingtalkConfig || !dingtalkConfig.access_token || !dingtalkConfig.secret) {
                return;
            }

            const statusLabels = {
                passed: '✅ 通过',
                failed: '❌ 失败',
                skipped: '⏭️ 跳过',
                partialPassed: '⚠️ 部分通过',
                noTests: '⚠️ 无测试用例'
            };
            const testResult = statusLabels[testInfo.testStatus] || (testInfo.hasFailure ? '❌ 失败' : '✅ 通过');
            
            let message = `【XKAutoTester 测试结果通知】\n`;
            
            if (testInfo.scheduledPlanName) {
                message += `\n定时计划: ${testInfo.scheduledPlanName}\n`;
                message += `执行时间: ${testInfo.scheduledPlanExecutionTime || new Date().toLocaleString()}\n`;
            }
            
            message += `\n测试计划: ${testInfo.testPlanName}\n`;
            message += `测试文件: ${testInfo.testFileNames || '无'}\n`;
            message += `测试类型: ${testInfo.testTypes || '全部'}\n`;
            message += `循环次数: ${testInfo.loopCount}\n`;
            message += `\n轮次信息:\n`;
            message += `总轮次: ${testInfo.totalLoops}\n`;
            if (testInfo.loopCount > 1) {
                message += `通过率: ${testInfo.passRate}%\n`;
            }
            
            if (testInfo.aggregatedStats && testInfo.aggregatedStats.total > 0) {
                const stats = testInfo.aggregatedStats;
                message += `\n用例统计:\n`;
                message += `通过: ${stats.passed}, 失败: ${stats.failed}, 跳过: ${stats.skipped}, 异常: ${stats.broken}, 总计: ${stats.total}\n`;
                message += `用例通过率: ${testInfo.casePassRate}% (排除跳过)\n`;
            }
            
            message += `\n测试结果: ${testResult}`;

            const notificationData = {
                accessToken: dingtalkConfig.access_token,
                secret: dingtalkConfig.secret,
                message: message
            };

            this.appendOutput('\n>>> ' + window.i18n.t('testExecution.sendingNotification') + '...');
            const result = await window.electronAPI.sendDingTalkNotification(notificationData);
            
            if (result.success) {
                this.appendOutput('>>> ' + window.i18n.t('testExecution.notificationSent'));
            } else {
                this.appendError('>>> ' + window.i18n.t('testExecution.notificationFailed') + ': ' + (result.error || ''));
            }
        } catch (error) {
            console.error('发送钉钉通知失败:', error);
            this.appendError('>>> ' + window.i18n.t('testExecution.notificationFailed') + ': ' + error.message);
        }
    }

    updateLoopProgress(current, total) {
        const progressStatus = document.getElementById('progress-status');
        if (total > 1) {
            progressStatus.textContent = window.i18n.t('testExecution.loopProgress', { current, total });
        }
    }

    async stopTests() {
        try {
            // 调用Electron主进程的停止测试功能
            const result = await window.electronAPI.stopPythonTests();
            
            if (result.success) {
                this.isRunning = false;
                this.updateUIForStopped();
                this.appendOutput('>>> ' + result.message);
            } else {
                this.appendError('>>> ' + result.message);
            }
        } catch (error) {
            console.error('停止测试失败:', error);
            this.appendError('>>> ' + window.i18n.t('testExecution.stopTestFailed') + ': ' + error.message);
        }
    }

    updateUIForRunning() {
        document.getElementById('run-tests-btn').disabled = true;
        document.getElementById('stop-tests-btn').disabled = false;
        document.getElementById('view-report-btn').disabled = true;
        
        this.updateProgress('测试运行中...', 0);
        
        // 清除欢迎消息
        const output = document.getElementById('test-output');
        if (output.querySelector('.welcome-message')) {
            output.innerHTML = '';
        }
        
        // 为正在执行的测试计划添加running类
        if (this.runningTestPlanName) {
            document.querySelectorAll('.test-plan-item').forEach(item => {
                if (item.getAttribute('data-plan-name') === this.runningTestPlanName) {
                    item.classList.add('running');
                }
            });
        }
        
        // 为正在执行的定时计划添加running类
        if (this.runningScheduledPlanId) {
            document.querySelectorAll('.scheduled-plan-item').forEach(item => {
                const planId = item.getAttribute('data-plan-id');
                if (planId === this.runningScheduledPlanId) {
                    item.classList.add('running');
                }
            });
        }
        
        // 更新测试计划和定时计划的按钮状态（根据是否是正在执行的计划来决定是否禁用）
        this.updatePlanButtons();
        this.updateScheduledPlanButtons();
    }

    updateUIForStopped() {
        document.getElementById('run-tests-btn').disabled = false;
        document.getElementById('stop-tests-btn').disabled = true;
        
        this.updateProgress('准备就绪', 100);
        
        // 移除所有running类
        document.querySelectorAll('.test-plan-item.running').forEach(item => {
            item.classList.remove('running');
        });
        document.querySelectorAll('.scheduled-plan-item.running').forEach(item => {
            item.classList.remove('running');
        });
        
        // 清除正在执行的计划信息
        this.runningTestPlanName = null;
        this.runningScheduledPlanId = null;
        
        // 恢复测试计划和定时计划的按钮状态
        this.updatePlanButtons();
        this.updateScheduledPlanButtons();
    }

    updateProgress(status, percentage) {
        document.getElementById('progress-status').textContent = status;
        document.getElementById('progress-percentage').textContent = percentage + '%';
        
        const progressFill = document.querySelector('.progress-fill');
        progressFill.style.width = percentage + '%';
    }

    getSelectedTestTypes() {
        const types = [];
        const checkboxes = document.querySelectorAll('#test-type-selector input[type="checkbox"]');
        
        // 检查是否显示占位提示（没有可选的测试类型）
        const placeholder = document.querySelector('#test-type-selector .placeholder-message');
        if (placeholder) {
            // 显示占位提示时，返回空数组表示执行所有测试
            return [];
        }
        
        checkboxes.forEach(checkbox => {
            if (checkbox.checked) {
                // 从checkbox的id中提取标记名称（去掉'-tests'后缀）
                const markerName = checkbox.id.replace('-tests', '');
                types.push(markerName);
            }
        });
        
        return types;
    }

    appendOutput(text) {
        this._outputBuffer.push({ text, isError: false });
        this._scheduleOutputFlush();
    }

    appendError(text) {
        this._outputBuffer.push({ text, isError: true });
        this._scheduleOutputFlush();
    }

    _scheduleOutputFlush() {
        if (this._outputRafId) return;
        this._outputRafId = requestAnimationFrame(() => {
            this._flushOutputBuffer();
            this._outputRafId = null;
        });
    }

    _flushOutputBuffer() {
        if (this._outputBuffer.length === 0) return;
        
        const output = document.getElementById('test-output');
        if (!output) { this._outputBuffer.length = 0; return; }
        
        if (output.querySelector('.welcome-message')) {
            output.innerHTML = '';
        }
        output.classList.add('has-content');
        
        const fragment = document.createDocumentFragment();
        const buffer = this._outputBuffer.splice(0);
        
        for (const item of buffer) {
            const line = document.createElement('div');
            line.textContent = item.text;
            line.className = 'output-line' + (item.isError ? ' error' : '');
            if (item.isError) line.style.color = 'var(--error)';
            fragment.appendChild(line);
        }
        
        output.appendChild(fragment);
        output.scrollTop = output.scrollHeight;
    }

    clearOutput() {
        const output = document.getElementById('test-output');
        output.innerHTML = `<div class="welcome-message"><div class="welcome-text-container"><span class="welcome-text">${window.i18n.t('testExecution.welcome')}</span><span class="welcome-app-name">XKAutoTester</span></div><p>${window.i18n.t('testExecution.createTestPlan')}</p></div>`;
        // 移除有内容时的滚动条样式
        output.classList.remove('has-content');
        
        // 重新应用主题色到新创建的welcome-app-name元素
        const welcomeAppName = document.querySelector('.welcome-app-name');
        if (welcomeAppName) {
            // 获取当前主题色
            const style = getComputedStyle(document.documentElement);
            const primaryColor = style.getPropertyValue('--primary');
            welcomeAppName.style.color = primaryColor;
        }
    }

    async loadPytestMarkers() {
        try {
            // 从pytest.ini文件中读取标记定义
            const markers = await window.electronAPI.getPytestMarkers();
            this.displayTestTypes(markers);
        } catch (error) {
            console.error('加载pytest标记失败:', error);
            // 如果加载失败，使用默认标记
            const defaultMarkers = [
                { name: 'smoke', description: window.i18n.t('testTypes.smoke') },
                { name: 'unit', description: window.i18n.t('testTypes.unit') },
                { name: 'exception', description: window.i18n.t('testTypes.exception') },
                { name: 'critical', description: window.i18n.t('testTypes.critical') },
                { name: 'appium', description: window.i18n.t('testTypes.appium') }
            ];
            this.displayTestTypes(defaultMarkers);
        }
    }

    displayTestTypes(markers, placeholder = null, forceRender = false) {

        
        const container = document.getElementById('test-type-selector');
        if (!container) {

            return;
        }
        
        // 保存当前的 markers（用于语言切换时重新渲染）
        if (markers && markers.length > 0) {
            this.currentMarkers = markers;
        }
        
        // 添加调试日志

        
        // 如果有占位符，强制重新渲染
        if (placeholder) {

            container.innerHTML = '';
        } else if (forceRender) {
            // 强制重新渲染（用于语言切换）
            container.innerHTML = '';
        } else {
            // 检查是否已经有相同的内容，避免重复渲染
            const currentMarkers = Array.from(container.querySelectorAll('input[type="checkbox"]')).map(cb => cb.id.replace('-tests', ''));
            const newMarkers = markers.map(m => m.name);
            
            // 如果内容相同，不重新渲染
            if (currentMarkers.length === newMarkers.length && 
                currentMarkers.every(marker => newMarkers.includes(marker))) {

                return;
            }
            
            container.innerHTML = '';
        }

        if (placeholder) {
            // 显示占位提示 - 使用与测试计划一致的样式
            const placeholderElement = document.createElement('div');
            placeholderElement.className = 'placeholder-message';
            placeholderElement.innerHTML = `
                ${this.getIconHtml('info')}
                <span>${placeholder}</span>
            `;
            container.appendChild(placeholderElement);
            return;
        }

        if (markers.length === 0) {
            // 没有标记时显示提示 - 使用与测试计划一致的样式
            const placeholderElement = document.createElement('div');
            placeholderElement.className = 'placeholder-message';
            placeholderElement.innerHTML = `
                ${this.getIconHtml('info')}
                <span>${window.i18n.t('testExecution.noMarkers')}</span>
            `;
            container.appendChild(placeholderElement);
            return;
        }

        // 前端去重：使用Set确保标记名称唯一
        const uniqueMarkers = [];
        const seenNames = new Set();
        
        markers.forEach(marker => {
            if (!seenNames.has(marker.name)) {
                seenNames.add(marker.name);
                uniqueMarkers.push(marker);
            }
        });



        const fragment = document.createDocumentFragment();
        uniqueMarkers.forEach(marker => {
            const label = document.createElement('label');
            label.className = 'checkbox-container';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `${marker.name}-tests`;
            checkbox.checked = true;
            
            const checkmark = document.createElement('span');
            checkmark.className = 'checkmark';
            
            const text = document.createTextNode(marker.description || marker.name);
            
            label.appendChild(checkbox);
            label.appendChild(checkmark);
            label.appendChild(text);
            
            fragment.appendChild(label);
        });
        container.appendChild(fragment);
        

    }

    async loadTestPlans() {
        try {
            this.testPlans = await window.electronAPI.getTestPlans();
            this.displayTestPlans();
        } catch (error) {
            console.error('加载测试计划失败:', error);
        }
    }

    displayTestPlans() {

        const container = document.getElementById('test-plans-list');

        container.innerHTML = '';

        if (this.testPlans.length === 0) {
            // 没有测试计划时显示占位符，但测试计划区域仍然显示

            this.displayTestPlansPlaceholder(window.i18n.t('testExecution.noTestPlansYet'));
            return;
        }


        const fragment = document.createDocumentFragment();
        this.testPlans.forEach(plan => {
            const planElement = document.createElement('div');
            planElement.className = 'test-plan-item';
            planElement.setAttribute('data-plan-name', plan.name);
            
            // 检查是否是当前选中的计划，如果是则添加selected类
            if (this.currentTestPlan && this.currentTestPlan.id === plan.id) {
                planElement.classList.add('selected');
            }
            
            // 构建测试计划详细信息
            const fileCount = plan.testFiles ? plan.testFiles.length : 0;
            const typeCount = plan.testTypes ? plan.testTypes.length : 0;
            const fileInfo = fileCount > 0 ? `${fileCount} ${window.i18n.t('testExecution.files')}` : window.i18n.t('testExecution.noFiles');
            const typeInfo = typeCount > 0 ? `${typeCount} ${window.i18n.t('testExecution.types')}` : window.i18n.t('testExecution.allTypes');
            
            // 循环设置信息
            const loopCount = plan.loopCount || 1;
            const continueOnFailure = plan.continueOnFailure !== false;
            const loopInfo = window.i18n.t('testExecution.loopInfo', { count: loopCount });
            const continueInfo = !continueOnFailure ? `<span class="continue-info">${this.getIconHtml('warning')}<span>${window.i18n.t('testExecution.stopOnFailure')}</span></span>` : '';
            
            const descriptionHtml = plan.description ? `<div style="font-size: 12px; color: var(--text-secondary); margin-left: 1px;">${plan.description}</div>` : '';
            
            planElement.innerHTML = `
                ${this.getIconHtml('assignment')}
                <div class="test-plan-content">
                    <div class="test-plan-header">
                        <div style="font-weight: 500;">${plan.name}</div>
                    </div>
                    ${descriptionHtml}
                    <div class="test-plan-meta">
                        <span class="meta-item">${this.getIconHtml('description')}<span>${fileInfo}</span></span>
                        <span class="meta-item">${this.getIconHtml('category')}<span>${typeInfo}</span></span>
                    </div>
                    <div class="test-plan-meta">
                        <span class="loop-info">${this.getIconHtml('repeat')}<span>${loopInfo}</span></span>
                        ${continueInfo}
                    </div>
                </div>
            `;

            planElement.addEventListener('click', () => {
                this.selectTestPlan(plan, planElement);
            });

            fragment.appendChild(planElement);
        });
        container.appendChild(fragment);
    }

    displayTestPlansPlaceholder(message) {
        const container = document.getElementById('test-plans-list');
        container.innerHTML = '';

        const placeholderElement = document.createElement('div');
        placeholderElement.className = 'placeholder-message';
        placeholderElement.innerHTML = `
            ${this.getIconHtml('info')}
            <span>${message}</span>
        `;
        container.appendChild(placeholderElement);
    }

    selectTestPlanFiles(testFiles) {
        // 设置标志，表示正在通过测试计划选择文件
        this.selectingFromPlan = true;
        
        // 清空当前选中的测试文件
        this.selectedTestFiles = [];
        

        
        // 先移除所有文件的选中状态
        document.querySelectorAll('.test-file-item.selected').forEach(item => {
            item.classList.remove('selected');
        });
        
        // 根据测试计划中的文件路径自动勾选对应的测试文件
        testFiles.forEach(planFile => {
            // 尝试多种路径匹配方式，确保能找到对应的文件
            const fileItem = this.findTestFileItemByPath(planFile.path);

            if (fileItem) {
                fileItem.classList.add('selected');
                this.selectedTestFiles.push(planFile);

            }
        });
        

        
        // 更新运行按钮状态
        this.updateRunButtonState();
        
        // 清除标志
        setTimeout(() => {
            this.selectingFromPlan = false;
        }, 100);
    }

    selectTestPlanDirectory(testFiles) {
        // 根据测试计划中的文件路径设置测试目录
        if (testFiles.length === 0) {
            return;
        }
        
        // 使用第一个文件的路径设置测试目录
        const firstFile = testFiles[0];
        if (firstFile && firstFile.path) {
            // 获取文件所在目录（去掉文件名部分）
            const pathParts = firstFile.path.split(/[\\/]/);
            const directoryPath = pathParts.slice(0, -1).join('/');
            
            // 设置目录路径
            this.selectedDirectory = directoryPath;
            
            // 使用目录名称作为显示名称
            this.selectedDirectoryDisplayName = pathParts[pathParts.length - 2] || directoryPath.split(/[\\/]/).pop() || directoryPath;
            
            this.updateSelectedDirectory();

            

        }
    }

    selectTestPlanTypes(testTypes) {
        // 根据测试计划中的测试类型自动勾选对应的测试类型
        const container = document.getElementById('test-type-selector');
        const checkboxes = container.querySelectorAll('input[type="checkbox"]');
        

        
        // 测试类型映射，使用 i18n 翻译
        const markerDescriptions = {
            'smoke': window.i18n.t('testTypes.smoke'),
            'critical': window.i18n.t('testTypes.critical'),
            'exception': window.i18n.t('testTypes.exception')
        };
        
        // 如果没有复选框，或者需要更新显示文本，重新创建测试类型显示
        if (checkboxes.length === 0 || testTypes.length > 0) {

            // 创建测试类型显示，使用中文映射
            const defaultMarkers = testTypes.map(type => ({
                name: type,
                description: markerDescriptions[type] || type
            }));
            this.displayTestTypes(defaultMarkers);
            
            // 重新获取复选框并设置选中状态
            const newCheckboxes = container.querySelectorAll('input[type="checkbox"]');
            newCheckboxes.forEach(checkbox => {
                const markerName = checkbox.id.replace('-tests', '');
                checkbox.checked = testTypes.includes(markerName);
            });
        } else {
            // 如果已经有复选框，确保显示文本正确
            checkboxes.forEach(checkbox => {
                const markerName = checkbox.id.replace('-tests', '');
                checkbox.checked = testTypes.includes(markerName);
                
                // 更新显示文本为中文
                const label = checkbox.parentElement;
                const textNode = Array.from(label.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
                if (textNode) {
                    textNode.textContent = markerDescriptions[markerName] || markerName;
                }
            });
        }
    }

    disableTestDirectoryTab() {
        // 禁用测试目录选项卡
        const directoryCard = document.querySelector('.left-panel .material-card:nth-child(1)'); // 现在测试目录是第1个卡片
        const selectButton = document.getElementById('select-directory-btn');
        const testFilesList = document.getElementById('test-files-list');
        
        if (directoryCard) {
            directoryCard.style.opacity = '0.6';
            directoryCard.style.pointerEvents = 'none';
        }
        
        if (selectButton) {
            selectButton.disabled = true;
        }
        
        if (testFilesList) {
            // 只禁用文件项的点击事件，但保持列表的滚动功能
            testFilesList.style.overflow = 'auto'; // 确保可以滚动
            
            // 禁用所有文件项的点击事件，但不影响容器本身的滚动
            const fileItems = testFilesList.querySelectorAll('.test-file-item');
            fileItems.forEach(item => {
                item.style.pointerEvents = 'none';
            });
        }
    }

    enableTestDirectoryTab() {
        // 启用测试目录选项卡
        const directoryCard = document.querySelector('.left-panel .material-card:nth-child(1)'); // 现在测试目录是第1个卡片
        const selectButton = document.getElementById('select-directory-btn');
        const testFilesList = document.getElementById('test-files-list');
        
        if (directoryCard) {
            directoryCard.style.opacity = '1';
            directoryCard.style.pointerEvents = 'auto';
        }
        
        if (selectButton) {
            selectButton.disabled = false;
        }
        
        if (testFilesList) {
            testFilesList.style.pointerEvents = 'auto';
            testFilesList.style.overflow = 'auto'; // 确保滚动功能正常
            
            // 启用所有文件项的点击事件
            const fileItems = testFilesList.querySelectorAll('.test-file-item');
            fileItems.forEach(item => {
                item.style.pointerEvents = 'auto';
            });
        }
    }

    disableTestTypeTab() {
        // 禁用测试类型选项卡
        const typeCard = document.querySelector('.left-panel .material-card:nth-child(3)'); // 现在测试类型是第3个卡片
        const testTypeSelector = document.getElementById('test-type-selector');
        
        if (typeCard) {
            typeCard.style.opacity = '0.6';
            typeCard.style.pointerEvents = 'none';
        }
        
        if (testTypeSelector) {
            // 只禁用复选框的交互，但保持列表的滚动功能
            testTypeSelector.style.overflow = 'auto'; // 确保可以滚动
            testTypeSelector.style.pointerEvents = 'auto'; // 保持滚动功能
            
            // 禁用所有复选框
            const checkboxes = testTypeSelector.querySelectorAll('input[type="checkbox"]');
            checkboxes.forEach(checkbox => {
                checkbox.disabled = true;
                checkbox.style.pointerEvents = 'none';
            });
            
            // 禁用所有标签的点击事件
            const labels = testTypeSelector.querySelectorAll('label');
            labels.forEach(label => {
                label.style.pointerEvents = 'none';
            });
        }
    }

    enableTestTypeTab() {
        // 启用测试类型选项卡
        const typeCard = document.querySelector('.left-panel .material-card:nth-child(3)'); // 现在测试类型是第3个卡片
        const testTypeSelector = document.getElementById('test-type-selector');
        
        if (typeCard) {
            typeCard.style.opacity = '1';
            typeCard.style.pointerEvents = 'auto';
        }
        
        if (testTypeSelector) {
            testTypeSelector.style.pointerEvents = 'auto';
            testTypeSelector.style.overflow = 'auto'; // 确保滚动功能正常
            
            // 启用所有复选框
            const checkboxes = testTypeSelector.querySelectorAll('input[type="checkbox"]');
            checkboxes.forEach(checkbox => {
                checkbox.disabled = false;
                checkbox.style.pointerEvents = 'auto';
            });
            
            // 启用所有标签的点击事件
            const labels = testTypeSelector.querySelectorAll('label');
            labels.forEach(label => {
                label.style.pointerEvents = 'auto';
            });
        }
    }

    ensureScrollable() {
        // 确保文件列表和测试类型列表可以滚动
        const testFilesList = document.getElementById('test-files-list');
        const testTypeSelector = document.getElementById('test-type-selector');
        
        if (testFilesList) {
            testFilesList.style.overflow = 'auto';
            testFilesList.style.pointerEvents = 'auto';
        }
        
        if (testTypeSelector) {
            testTypeSelector.style.overflow = 'auto';
        }
    }

    // 设置文件管理器事件监听器
    setupFileManagerEventListeners() {
        // 返回上一级按钮
        const backBtn = document.getElementById('back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', async () => await this.navigateBack());
        }
        
        // 刷新按钮
        const refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshFileList());
        }
        
        // 删除按钮
        const deleteBtn = document.getElementById('delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => this.deleteSelectedFiles());
        }
        
        // 上传文件按钮
        const uploadBtn = document.getElementById('upload-btn');
        if (uploadBtn) {
            uploadBtn.addEventListener('click', () => this.uploadFiles());
        }
        
        // 下载按钮
        const downloadBtn = document.getElementById('download-btn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => this.downloadSelectedFiles());
        }
        
        // 安装APK按钮
        const installApkBtn = document.getElementById('install-apk-btn');
        if (installApkBtn) {
            installApkBtn.addEventListener('click', () => this.installApk());
        }
        
        // 全选复选框
        const selectAllCheckbox = document.getElementById('select-all');
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', (e) => this.toggleSelectAll(e.target.checked));
        }
        
        // 上下文菜单
        this.contextMenu = document.getElementById('context-menu');
        if (this.contextMenu) {
            // 点击菜单外部关闭上下文菜单
            document.addEventListener('click', (e) => {
                if (!this.contextMenu.contains(e.target) && !e.target.closest('.file-actions-btn')) {
                    this.hideContextMenu();
                }
            });
            
            // 上下文菜单项点击事件
            this.contextMenu.addEventListener('click', (e) => {
                if (e.target.closest('.context-menu-item')) {
                    const menuItem = e.target.closest('.context-menu-item');
                    const action = menuItem.getAttribute('data-action');
                    this.handleContextMenuAction(action);
                    this.hideContextMenu();
                }
            });
        }
        
        // 监听导航标签切换，当切换到安卓连接标签时加载文件列表
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                if (tab.getAttribute('data-tab') === 'android-connection' && this.selectedDevice) {
                    this.loadFileList();
                }
            });
        });
        
        // 添加下载进度事件监听
        if (window.electronAPI && window.electronAPI.onDownloadProgress) {
            window.electronAPI.onDownloadProgress((event, progress) => {
                this.progressIndicator.update(progress);
            });
        }
    }
    
    // 执行ADB命令
    async executeAdbCommand(cmd, deviceId = null) {
        try {
            if (!window.electronAPI || !window.electronAPI.executeAdbCommand) {
                return { success: false, error: 'Electron API未正确加载' };
            }
            
            const result = await window.electronAPI.executeAdbCommand(cmd, deviceId);
            return result;
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    
    // 解析ADB文件列表输出
    parseAdbFileList(output) {
        const files = [];
        if (!output || typeof output !== 'string') {
            return files;
        }
        
        const lines = output.split('\n').filter(line => line.trim());
        
        // 跳过标题行（如果有的话）
        let startIndex = 0;
        if (lines.length > 0 && (lines[0].includes('total') || lines[0].includes('total:'))) {
            startIndex = 1;
        }
        
        for (let i = startIndex; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            // 尝试不同的正则表达式模式来匹配ADB输出
            let match;
            
            // 模式1: 标准格式 "drwxrwx---   2 u0_a234  u0_a234       4096 2023-01-01 12:00 DCIM"
            match = line.match(/^(d|-)([rwxst-]{9})\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(.+)$/);
            if (match) {
                const [, isDir, , size, modDate, modTime, name] = match;
                // 跳过.和..目录
                if (name === '.' || name === '..') continue;
                
                const file = {
                    name: name,
                    path: `${this.currentPath}/${name}`,
                    isDirectory: isDir === 'd',
                    size: parseInt(size),
                    modifiedTime: `${modDate} ${modTime}`,
                    createdAt: `${modDate} ${modTime}` // ADB ls -l 不显示创建时间，暂时使用修改时间
                };
                files.push(file);
                continue;
            }
            
            // 模式2: 简化格式 "drwxrwx---  2 u0_a234 u0_a234 4096 Jan  1 12:00 DCIM"
            match = line.match(/^(d|-)([rwxst-]{9})\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(\w{3})\s+(\d{1,2})\s+(\d{2}:\d{2})\s+(.+)$/);
            if (match) {
                const [, isDir, , size, month, day, time, name] = match;
                // 跳过.和..目录
                if (name === '.' || name === '..') continue;
                
                // 将月份缩写转换为数字
                const monthMap = {
                    'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
                    'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
                    'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
                };
                const modDate = `${new Date().getFullYear()}-${monthMap[month]}-${day.padStart(2, '0')}`;
                const file = {
                    name: name,
                    path: `${this.currentPath}/${name}`,
                    isDirectory: isDir === 'd',
                    size: parseInt(size),
                    modifiedTime: `${modDate} ${time}`,
                    createdAt: `${modDate} ${time}`
                };
                files.push(file);
                continue;
            }
            
            // 模式3: 如果行以d或-开头，但格式不匹配，尝试提取文件名
            if (line.startsWith('d') || line.startsWith('-')) {
                // 尝试直接提取文件名（最后一个空格后的内容）
                const parts = line.split(/\s+/);
                const name = parts[parts.length - 1];
                // 跳过.和..目录
                if (name === '.' || name === '..') continue;
                
                const isDir = line.startsWith('d');
                const file = {
                    name: name,
                    path: `${this.currentPath}/${name}`,
                    isDirectory: isDir,
                    size: 0,
                    modifiedTime: new Date().toISOString().slice(0, 19).replace('T', ' '),
                    createdAt: new Date().toISOString().slice(0, 19).replace('T', ' ')
                };
                files.push(file);
            }
        }
        
        // 排序：文件夹优先显示，然后按名称排序
        files.sort((a, b) => {
            // 文件夹排在前面
            if (a.isDirectory && !b.isDirectory) {
                return -1;
            }
            if (!a.isDirectory && b.isDirectory) {
                return 1;
            }
            // 相同类型按名称排序
            return a.name.localeCompare(b.name, 'zh-CN');
        });
        
        return files;
    }
    
    // 格式化相对时间
    formatRelativeTime(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;
        
        // 转换为毫秒
        const minute = 60 * 1000;
        const hour = 60 * minute;
        const day = 24 * hour;
        const week = 7 * day;
        const month = 30 * day;
        const year = 365 * day;
        
        if (isNaN(diff)) {
            return dateString;
        }
        
        if (diff < minute) {
            return window.i18n.t('fileManager.justNow');
        } else if (diff < hour) {
            const minutes = Math.floor(diff / minute);
            return `${minutes} ${window.i18n.t('fileManager.minutesAgo')}`;
        } else if (diff < day) {
            const hours = Math.floor(diff / hour);
            return `${hours} ${window.i18n.t('fileManager.hoursAgo')}`;
        } else if (diff < week) {
            const days = Math.floor(diff / day);
            return `${days} ${window.i18n.t('fileManager.daysAgo')}`;
        } else if (diff < month) {
            const weeks = Math.floor(diff / week);
            return `${weeks} ${window.i18n.t('fileManager.weeksAgo')}`;
        } else if (diff < year) {
            const months = Math.floor(diff / month);
            return `${months} ${window.i18n.t('fileManager.monthsAgo')}`;
        } else {
            // 时间太久远，直接显示日期
            return dateString.slice(0, 16);
        }
    }
    
    // 加载文件列表
    async loadFileList() {
        if (!this.selectedDevice) {
            return;
        }
        
        try {
            // 显示加载状态
            this.showFileListLoading();
            
            // 执行ADB命令获取文件列表
            const cmd = `ls -la ${this.currentPath}`;
            const result = await this.executeAdbCommand(cmd, this.selectedDevice);
            
            if (result.success) {
                this.fileList = this.parseAdbFileList(result.output);
                this.selectedFiles = []; // 清空选中的文件，确保进入新目录时选择状态被重置
                this.displayFileList();
                this.updatePathDisplay();
            } else {
                this.displayFileError(`获取文件列表失败: ${result.error || '未知错误'}`);
            }
        } catch (error) {
            this.displayFileError(`加载文件列表失败: ${error.message}`);
        } finally {
            // 隐藏加载状态已在displayFileList或displayFileError中处理
        }
    }
    
    // 显示文件列表加载状态
    showFileListLoading() {
        const fileList = document.getElementById('file-list');
        if (fileList) {
            fileList.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;"><div style="display: flex; align-items: center; justify-content: center; gap: 8px;">' + this.getIconHtml('sync', 'vertical-align: middle;') + '<span style="vertical-align: middle;">' + window.i18n.t('fileManager.loadingFiles') + '</span></div></td></tr>';
        }
    }
    
    // 显示文件列表错误信息
    displayFileError(message) {
        const fileList = document.getElementById('file-list');
        if (fileList) {
            fileList.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;"><div style="display: flex; align-items: center; justify-content: center; gap: 8px;">' + this.getIconHtml('error', 'vertical-align: middle; color: var(--error);') + '<span style="vertical-align: middle; color: var(--error);">' + message + '</span></div></td></tr>';
        }
    }
    
    // 隐藏文件列表加载状态
    hideFileListLoading() {
        // 实际的加载状态隐藏在displayFileList或displayFileError方法中处理
    }
    
    // 显示文件列表
    displayFileList() {
        const fileList = document.getElementById('file-list');
        if (!fileList) return;
        
        fileList.innerHTML = '';
        
        // 如果文件列表为空
        if (this.fileList.length === 0) {
            const emptyItem = document.createElement('tr');
            emptyItem.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px;"><div style="display: flex; align-items: center; justify-content: center; gap: 8px;">' + this.getIconHtml('folder_open', 'vertical-align: middle;') + '<span style="vertical-align: middle;">' + window.i18n.t('fileManager.emptyDirectory') + '</span></div></td></tr>';
            fileList.appendChild(emptyItem);
            return;
        }
        
        // 显示文件和目录
        this.fileList.forEach(file => {
            // 跳过.和..目录
            if (file.name === '.' || file.name === '..') {
                return;
            }
            
            const fileItem = document.createElement('tr');
            fileItem.className = 'file-item';
            fileItem.setAttribute('data-path', file.path);
            fileItem.setAttribute('data-is-directory', file.isDirectory);
            
            // 检查文件是否被选中
            const isSelected = this.selectedFiles.some(f => f.path === file.path);
            
            // 文件夹不显示大小
            const sizeDisplay = file.isDirectory ? '' : this.formatFileSize(file.size);
            
            fileItem.innerHTML = `
                <td>
                    <input type="checkbox" class="file-checkbox" ${isSelected ? 'checked' : ''} data-path="${file.path}">
                </td>
                <td>
                    <div class="file-item-name ${file.isDirectory ? 'directory' : 'file'}">
                        ${this.getIconHtml(file.isDirectory ? 'folder' : 'description')}
                        <span>${file.name}</span>
                    </div>
                </td>
                <td class="file-size">${sizeDisplay}</td>
                <td class="file-date">${this.formatRelativeTime(file.modifiedTime)}</td>
                <td class="file-date">${this.formatRelativeTime(file.createdAt)}</td>
                <td class="file-actions">
                    <button class="file-actions-btn" data-path="${file.path}">
                        ${this.getIconHtml('more_vert')}
                    </button>
                </td>
            `;
            
            // 文件名点击事件
            const fileNameElement = fileItem.querySelector('.file-item-name');
            if (fileNameElement) {
                fileNameElement.addEventListener('click', async () => {
                    if (file.isDirectory) {
                        await this.navigateToDirectory(file.path);
                    }
                });
            }
            
            // 复选框点击事件
            const checkbox = fileItem.querySelector('.file-checkbox');
            if (checkbox) {
                checkbox.addEventListener('change', (e) => {
                    this.toggleFileSelection(file, e.target.checked);
                });
            }
            
            // 文件操作按钮点击事件
            const actionsBtn = fileItem.querySelector('.file-actions-btn');
            if (actionsBtn) {
                actionsBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    // 如果菜单已显示且当前目标是同一个文件，则关闭菜单
                    if (!this.contextMenu.classList.contains('hidden') && 
                        this.contextMenuTarget && 
                        this.contextMenuTarget.path === file.path) {
                        this.hideContextMenu();
                    } else {
                        this.showContextMenu(e, file, actionsBtn);
                    }
                });
            }
            
            // 行点击事件：整个行区域都能识别点击
            fileItem.addEventListener('click', (e) => {
                // 如果点击的是文件操作按钮或复选框，不处理
                if (e.target.closest('.file-actions-btn') || e.target.closest('.file-checkbox')) {
                    return;
                }
                
                // 整个行区域点击，如果是文件夹，就进入文件夹
                if (file.isDirectory) {
                    this.navigateToDirectory(file.path);
                }
                // 点击文件行没有反应
            });
            
            fileList.appendChild(fileItem);
        });
        
        // 更新全选复选框状态
        this.updateSelectAllCheckbox();
    }
    
    // 格式化文件大小
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    // 更新路径显示
    updatePathDisplay() {
        const pathDisplay = document.getElementById('path-display');
        if (!pathDisplay) return;
        
        // 清空当前路径显示
        pathDisplay.innerHTML = '';
        
        // 目录名称映射
        const pathMap = {
            '/storage/emulated/0': '内部共享存储空间'
        };
        
        // 根路径
        const rootPath = '/storage/emulated/0';
        
        // 处理当前路径
        let displayPath = this.currentPath;
        
        // 路径片段数组
        let pathSegments = [];
        
        if (displayPath === rootPath) {
            // 根目录
            pathSegments = [{ path: rootPath, displayName: pathMap[rootPath] || rootPath }];
        } else {
            // 非根目录，分割路径
            const segments = displayPath.replace(rootPath, '').split('/').filter(segment => segment);
            let currentPath = rootPath;
            
            // 添加根目录
            pathSegments.push({ path: rootPath, displayName: pathMap[rootPath] || rootPath });
            
            // 添加其他路径片段
            segments.forEach(segment => {
                currentPath = `${currentPath}/${segment}`;
                pathSegments.push({ path: currentPath, displayName: segment });
            });
        }
        
        // 创建路径片段容器
        const segmentsContainer = document.createElement('div');
        segmentsContainer.className = 'path-segments';
        pathDisplay.appendChild(segmentsContainer);
        
        // 先渲染所有片段
        this.renderPathSegments(segmentsContainer, pathSegments, 0, pathSegments.length);
        
        // 使用setTimeout确保DOM渲染后检查溢出
        setTimeout(() => {
            this.checkAndApplyEllipsis(pathDisplay, segmentsContainer, pathSegments, pathMap);
        }, 0);
        
        // 更新返回按钮状态
        this.updateBackButtonState();
        
        // 更新删除和下载按钮状态
        this.updateActionButtonsState();
    }
    
    // 检查并应用省略号
    checkAndApplyEllipsis(pathDisplay, segmentsContainer, allSegments, pathMap) {
        // 移除所有省略号
        const existingEllipsis = segmentsContainer.querySelector('.path-ellipsis');
        if (existingEllipsis) {
            existingEllipsis.remove();
        }
        
        // 移除所有片段，重新渲染
        segmentsContainer.innerHTML = '';
        
        // 获取导航栏的可视宽度
        const containerWidth = pathDisplay.clientWidth;
        
        // 创建一个临时元素用于测量文本宽度
        const tempElement = document.createElement('span');
        tempElement.style.visibility = 'hidden';
        tempElement.style.position = 'absolute';
        tempElement.style.whiteSpace = 'nowrap';
        tempElement.style.fontSize = '14px'; // 与实际路径字体大小一致
        document.body.appendChild(tempElement);
        
        let totalWidth = 0;
        const segmentWidths = [];
        
        // 计算每个路径片段的宽度
        allSegments.forEach((segment, index) => {
            let width = 0;
            
            // 计算路径分隔符宽度（除了第一个）
            if (index > 0) {
                tempElement.textContent = '/';
                width += tempElement.clientWidth + 8; // 加上分隔符左右间距
            }
            
            // 计算路径片段宽度
            tempElement.textContent = segment.displayName;
            width += tempElement.clientWidth + 12; // 加上片段左右内边距
            
            segmentWidths.push(width);
            totalWidth += width;
        });
        
        // 移除临时元素
        document.body.removeChild(tempElement);
        
        // 如果总宽度不超过容器宽度，全部显示
        if (totalWidth <= containerWidth) {
            this.renderPathSegments(segmentsContainer, allSegments, 0, allSegments.length);
            return;
        }
        
        // 从最后一个片段开始，向前计算可以显示的片段
        let visibleWidth = 0;
        let startIndex = allSegments.length - 1;
        
        // 先计算省略号的宽度
        tempElement.textContent = '...';
        tempElement.style.fontSize = '16px';
        tempElement.style.padding = '0 4px';
        document.body.appendChild(tempElement);
        const ellipsisWidth = tempElement.clientWidth + 8; // 加上省略号左右间距
        document.body.removeChild(tempElement);
        
        // 从最后一个片段开始向前累加，直到加上省略号后超过容器宽度
        visibleWidth += segmentWidths[startIndex];
        startIndex--;
        
        while (startIndex >= 0) {
            const newWidth = visibleWidth + segmentWidths[startIndex];
            if (newWidth + ellipsisWidth <= containerWidth) {
                visibleWidth = newWidth;
                startIndex--;
            } else {
                break;
            }
        }
        
        // 显示省略号和可见片段
        const hiddenSegments = allSegments.slice(0, startIndex + 1);
        this.renderEllipsis(segmentsContainer, hiddenSegments, pathMap);
        this.renderPathSegments(segmentsContainer, allSegments, startIndex + 1, allSegments.length);
    }
    
    // 渲染省略号
    renderEllipsis(container, hiddenSegments, pathMap) {
        // 创建省略号元素
        const ellipsisElement = document.createElement('span');
        ellipsisElement.className = 'path-ellipsis';
        ellipsisElement.textContent = '...';
        ellipsisElement.title = '点击查看更多路径';
        ellipsisElement.style.cursor = 'pointer';
        ellipsisElement.style.fontSize = '16px';
        ellipsisElement.style.margin = '0 4px';
        ellipsisElement.style.color = 'var(--primary)';
        ellipsisElement.style.display = 'inline-flex';
        ellipsisElement.style.alignItems = 'center';
        ellipsisElement.style.justifyContent = 'center';
        ellipsisElement.style.width = '24px';
        ellipsisElement.style.height = '24px';
        
        // 直接添加到容器
        container.appendChild(ellipsisElement);
        
        // 获取静态下拉菜单元素
        const dropdown = document.getElementById('ellipsis-dropdown');
        dropdown.innerHTML = '';
        
        // 渲染被省略的片段
        hiddenSegments.forEach(segment => {
            const item = document.createElement('div');
            item.className = 'ellipsis-item';
            item.innerHTML = `
                ${this.getIconHtml('folder')}
                <span>${segment.displayName}</span>
            `;
            item.addEventListener('click', () => {
                this.navigateToPath(segment.path);
                this.hideEllipsisDropdown();
            });
            dropdown.appendChild(item);
        });
        
        // 为省略号元素添加唯一ID
        ellipsisElement.id = 'unique-ellipsis';
        
        // 直接绑定点击事件
        ellipsisElement.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // 使用正确的CSS类来显示下拉菜单
            const dropdown = document.getElementById('ellipsis-dropdown');
            dropdown.classList.toggle('show');
            
            // 重新定位下拉菜单，确保显示在正确位置
            this.positionEllipsisDropdown(ellipsisElement, dropdown);
        });
        
        // 确保点击外部能关闭下拉菜单
        this.setupEllipsisDropdownClose();
    }
    
    // 定位省略号下拉菜单
    positionEllipsisDropdown(ellipsisElement, dropdown) {
        const rect = ellipsisElement.getBoundingClientRect();
        const currentPathRect = document.getElementById('current-path').getBoundingClientRect();
        
        // 设置下拉菜单的位置
        dropdown.style.left = `${rect.left}px`;
        dropdown.style.top = `${rect.bottom + 5}px`;
        dropdown.style.position = 'fixed';
    }
    
    // 隐藏省略号下拉菜单
    hideEllipsisDropdown() {
        const dropdown = document.getElementById('ellipsis-dropdown');
        dropdown.classList.remove('show');
    }
    
    // 设置下拉菜单关闭逻辑
    setupEllipsisDropdownClose() {
        // 只添加一次事件监听器
        if (this.ellipsisDropdownCloseSet) {
            return;
        }
        
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('ellipsis-dropdown');
            const ellipsisButton = document.getElementById('unique-ellipsis') || document.querySelector('.path-ellipsis');
            
            if (dropdown && !dropdown.contains(e.target) && !ellipsisButton?.contains(e.target)) {
                dropdown.classList.remove('show');
            }
        });
        
        this.ellipsisDropdownCloseSet = true;
    }
    

    

    
    // 渲染路径片段
    renderPathSegments(container, segments, startIndex, endIndex) {
        const fragment = document.createDocumentFragment();
        for (let i = startIndex; i < endIndex; i++) {
            const segment = segments[i];
            
            if (i > startIndex) {
                const separator = document.createElement('span');
                separator.className = 'path-separator';
                separator.textContent = '/';
                fragment.appendChild(separator);
            }
            
            const segmentElement = document.createElement('span');
            segmentElement.className = `path-segment ${i === endIndex - 1 ? 'active' : ''}`;
            segmentElement.textContent = segment.displayName;
            segmentElement.setAttribute('data-path', segment.path);
            
            segmentElement.addEventListener('click', () => {
                this.navigateToPath(segment.path);
            });
            
            fragment.appendChild(segmentElement);
        }
        container.appendChild(fragment);
    }
    
    // 导航到指定路径
    async navigateToPath(path) {
        if (path === this.currentPath) return;
        
        this.currentPath = path;
        this.selectedFiles = []; // 清空选中的文件
        await this.loadFileList();
    }
    
    // 更新返回按钮状态
    updateBackButtonState() {
        const backBtn = document.getElementById('back-btn');
        if (backBtn) {
            const isRoot = this.currentPath === '/storage/emulated/0';
            backBtn.disabled = isRoot;
            backBtn.classList.toggle('disabled', isRoot);
        }
    }
    
    // 更新操作按钮状态（删除和下载）
    updateActionButtonsState() {
        const deleteBtn = document.getElementById('delete-btn');
        const downloadBtn = document.getElementById('download-btn');
        const hasSelection = this.selectedFiles.length > 0;
        
        if (deleteBtn) {
            deleteBtn.disabled = !hasSelection;
            deleteBtn.classList.toggle('disabled', !hasSelection);
        }
        
        if (downloadBtn) {
            downloadBtn.disabled = !hasSelection;
            downloadBtn.classList.toggle('disabled', !hasSelection);
        }
    }
    
    // 导航到父目录
    async navigateBack() {
        if (this.currentPath === '/storage/emulated/0') {
            return;
        }
        
        const pathParts = this.currentPath.split('/');
        pathParts.pop();
        const parentPath = pathParts.join('/') || '/';
        await this.navigateToDirectory(parentPath);
    }
    
    // 导航到指定目录
    async navigateToDirectory(path) {
        this.currentPath = path;
        this.selectedFiles = []; // 清空选中的文件
        await this.loadFileList();
    }
    
    // 刷新文件列表
    refreshFileList() {
        this.loadFileList();
    }
    
    // 切换文件选择状态
    toggleFileSelection(file, isSelected) {
        if (isSelected) {
            // 添加到选中列表
            if (!this.selectedFiles.some(f => f.path === file.path)) {
                this.selectedFiles.push(file);
            }
        } else {
            // 从选中列表移除
            this.selectedFiles = this.selectedFiles.filter(f => f.path !== file.path);
        }
        
        // 更新文件项的选中状态
        const fileItem = document.querySelector(`.file-item[data-path="${file.path}"]`);
        if (fileItem) {
            if (isSelected) {
                fileItem.classList.add('selected');
            } else {
                fileItem.classList.remove('selected');
            }
        }
        
        // 更新全选复选框状态
        this.updateSelectAllCheckbox();
        
        // 更新删除和下载按钮状态
        this.updateActionButtonsState();
    }
    
    // 更新全选复选框状态
    updateSelectAllCheckbox() {
        const selectAllCheckbox = document.getElementById('select-all');
        if (!selectAllCheckbox) return;
        
        const totalFiles = this.fileList.length;
        const selectedFiles = this.selectedFiles.length;
        
        selectAllCheckbox.checked = totalFiles > 0 && selectedFiles === totalFiles;
        selectAllCheckbox.indeterminate = selectedFiles > 0 && selectedFiles < totalFiles;
    }
    
    // 切换全选状态
    toggleSelectAll(checked) {
        this.selectedFiles = checked ? [...this.fileList] : [];
        
        // 更新所有文件项的选中状态
        document.querySelectorAll('.file-checkbox').forEach(checkbox => {
            checkbox.checked = checked;
        });
        
        document.querySelectorAll('.file-item').forEach(fileItem => {
            if (checked) {
                fileItem.classList.add('selected');
            } else {
                fileItem.classList.remove('selected');
            }
        });
        
        // 更新删除和下载按钮状态
        this.updateActionButtonsState();
    }
    
    // 显示上下文菜单
    showContextMenu(event, file, triggerElement = null) {
        this.contextMenuTarget = file;
        const menu = this.contextMenu;
        if (!menu) return;

        // 先显示菜单以获取其尺寸
        menu.classList.remove('hidden');

        // 强制浏览器重排以获取准确的菜单尺寸
        menu.offsetHeight; // 触发重排

        const menuWidth = menu.offsetWidth || 140;
        const menuHeight = menu.offsetHeight || 120;
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        
        // 边界安全距离（增加宽容度）
        const horizontalPadding = 20; // 水平方向留白
        const verticalPadding = 20;   // 垂直方向留白
        const bottomSafeZone = 50;    // 底部安全区域（提前触发向上弹出）

        let x, y;

        if (triggerElement) {
            // 如果有触发元素，从元素下方弹出
            const rect = triggerElement.getBoundingClientRect();
            
            // 计算可用空间
            const spaceBelow = windowHeight - rect.bottom - verticalPadding;
            const spaceAbove = rect.top - verticalPadding;
            
            // 判断是否应该向上弹出（更宽容的条件）
            // 如果下方空间不足菜单高度 + 安全区域，则向上弹出
            if (spaceBelow < menuHeight + bottomSafeZone && spaceAbove > menuHeight) {
                // 在按钮上方显示
                y = rect.top - menuHeight - 4;
            } else {
                // 默认在按钮下方显示
                y = rect.bottom + 4;
                
                // 如果上方空间足够但下方不足，强制向上
                if (spaceBelow < menuHeight && spaceAbove >= menuHeight) {
                    y = rect.top - menuHeight - 4;
                }
            }

            // 水平位置：默认左对齐到按钮（向左偏移）
            const horizontalOffset = 45; // 向左偏移量（px）
            x = rect.left - horizontalOffset;

            // 确保菜单不会超出窗口右边缘（增加水平边距）
            if (x + menuWidth > windowWidth - horizontalPadding) {
                x = windowWidth - menuWidth - horizontalPadding;
            }

            // 确保菜单不会超出窗口左边缘
            if (x < horizontalPadding) {
                x = horizontalPadding;
            }

            // 最终确保垂直方向不超出边界
            if (y < verticalPadding) {
                y = verticalPadding;
            }
            if (y + menuHeight > windowHeight - verticalPadding) {
                y = windowHeight - menuHeight - verticalPadding;
            }
        } else {
            // 使用鼠标位置
            x = event.clientX;
            y = event.clientY;

            // 右边界检测（增加边距）
            if (x + menuWidth > windowWidth - horizontalPadding) {
                x = windowWidth - menuWidth - horizontalPadding;
            }

            // 左边界检测
            if (x < horizontalPadding) {
                x = horizontalPadding;
            }

            // 下边界检测
            if (y + menuHeight > windowHeight - verticalPadding) {
                y = windowHeight - menuHeight - verticalPadding;
            }

            // 上边界检测
            if (y < verticalPadding) {
                y = verticalPadding;
            }
        }

        // 设置菜单位置
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
    }
    
    // 隐藏上下文菜单
    hideContextMenu() {
        if (this.contextMenu) {
            this.contextMenu.classList.add('hidden');
            this.contextMenuTarget = null;
        }
    }
    
    // 处理上下文菜单操作
    async handleContextMenuAction(action) {
        if (!this.contextMenuTarget) return;
        
        const file = this.contextMenuTarget;
        
        switch (action) {
            case 'download':
                let downloadDir = await this.resolveDownloadDirectory();

                if (!downloadDir) {
                    if (!window.electronAPI || !window.electronAPI.selectDirectory) {
                        console.error('electronAPI未定义或selectDirectory方法不存在');
                        return;
                    }
                    const result = await window.electronAPI.selectDirectory();
                    if (!result.canceled && result.filePaths.length > 0) {
                        downloadDir = result.filePaths[0];
                    }
                }

                if (downloadDir) {
                    await this.downloadFile(file, downloadDir);
                }
                break;
            case 'rename':
                this.renameFile(file);
                break;
            case 'delete':
                await this.deleteFile(file);
                break;
        }
    }
    
    // 删除选中的文件
    async deleteSelectedFiles() {
        if (this.selectedFiles.length === 0) {
            return;
        }
        
        const title = window.i18n.t('modal.deleteFilesTitle');
        const message = window.i18n.t('modal.deleteFilesMessage', { count: this.selectedFiles.length });
        
        this.showConfirmModal(title, message, async () => {
            for (const file of this.selectedFiles) {
                await this.deleteFile(file);
            }
            this.selectedFiles = [];
            this.loadFileList();
        });
    }
    
    // 删除单个文件
    async deleteFile(file) {
        try {
            let cmd;
            if (file.isDirectory) {
                cmd = `rm -rf "${file.path}"`;
            } else {
                cmd = `rm "${file.path}"`;
            }
            
            const result = await this.executeAdbCommand(cmd, this.selectedDevice);
            if (result.success) {
                this.loadFileList();
            } else {
                console.error('删除文件失败:', result.error);
            }
        } catch (error) {
            console.error('删除文件失败:', error);
        }
    }
    
    // 上传文件
    async uploadFiles() {
        try {
            if (!window.electronAPI || !window.electronAPI.selectFiles) {
                console.error('electronAPI未定义或selectFiles方法不存在');
                return;
            }
            
            const result = await window.electronAPI.selectFiles();
            if (!result.canceled && result.filePaths.length > 0) {
                for (const localPath of result.filePaths) {
                    const fileName = localPath.split(/[\\/]/).pop();
                    const remotePath = `${this.currentPath}/${fileName}`;
                    await this.uploadFile(localPath, remotePath);
                }
                this.loadFileList();
            }
        } catch (error) {
            console.error('上传文件失败:', error);
        }
    }
    
    // 上传单个文件
    async uploadFile(localPath, remotePath) {
        try {
            if (!window.electronAPI || !window.electronAPI.uploadFile) {
                console.error('electronAPI未定义或uploadFile方法不存在');
                return;
            }
            
            const result = await window.electronAPI.uploadFile(localPath, remotePath, this.selectedDevice);
            return result;
        } catch (error) {
            console.error('上传文件失败:', error);
            return { success: false, error: error.message };
        }
    }
    
    async resolveDownloadDirectory() {
        try {
            if (window.electronAPI && window.electronAPI.getConfig) {
                const config = await window.electronAPI.getConfig();
                const defaultDownloadPath = config?.APP_SETTINGS?.default_download_directory;

                if (defaultDownloadPath) {
                    if (window.electronAPI && window.electronAPI.checkPathExists) {
                        const exists = await window.electronAPI.checkPathExists(defaultDownloadPath);
                        if (exists) {
                            return defaultDownloadPath;
                        }
                    }

                    if (window.electronAPI && window.electronAPI.createDirectory) {
                        const createResult = await window.electronAPI.createDirectory(defaultDownloadPath);
                        if (createResult.success) {
                            return defaultDownloadPath;
                        }
                    }

                    if (window.electronAPI && window.electronAPI.showDialog) {
                        const dialogResult = await window.electronAPI.showDialog({
                            type: 'warning',
                            title: window.i18n.t('fileManager.directoryNotFound'),
                            message: window.i18n
                                ? window.i18n.t('fileManager.directoryNotFoundMessage', { path: defaultDownloadPath })
                                : `默认下载目录 "${defaultDownloadPath}" 不存在且无法创建，是否清除该路径设置？`,
                            buttons: [
                                window.i18n.t('common.clear'),
                                window.i18n.t('common.cancel')
                            ],
                            defaultId: 0,
                            cancelId: 1
                        });

                        if (dialogResult.response === 0) {
                            const currentConfig = await window.electronAPI.getConfig();
                            const updatedSettings = { ...currentConfig.APP_SETTINGS, default_download_directory: '' };
                            await window.electronAPI.saveConfig({ APP_SETTINGS: updatedSettings });
                        }
                    }
                }
            }
        } catch (error) {
            console.error('解析下载目录失败:', error);
        }

        return null;
    }

    // 下载选中的文件
    async downloadSelectedFiles() {
        if (this.selectedFiles.length === 0) {
            return;
        }
        
        try {
            let downloadDir = await this.resolveDownloadDirectory();
            
            if (!downloadDir) {
                if (!window.electronAPI || !window.electronAPI.selectDirectory) {
                    console.error('electronAPI未定义或selectDirectory方法不存在');
                    return;
                }
                
                const result = await window.electronAPI.selectDirectory();
                if (!result.canceled && result.filePaths.length > 0) {
                    downloadDir = result.filePaths[0];
                } else {
                    return;
                }
            }
            
            // 初始化多文件下载状态
            this.progressIndicator.setTotalFiles(this.selectedFiles.length);
            this.progressIndicator.setCurrentFileIndex(0);
            
            // 开始下载前显示进度条，只显示一次
            this.progressIndicator.show('准备下载...', 'download');
            
            for (const file of this.selectedFiles) {
                // 先递增索引，再开始下载，这样在计算进度时就能正确反映当前正在下载的文件
                this.progressIndicator.setCurrentFileIndex(this.progressIndicator.currentFileIndex + 1);
                await this.downloadFile(file, downloadDir);
            }
        } catch (error) {
            console.error('下载文件失败:', error);
        }
    }
    
    // 下载单个文件
    async downloadFile(file, downloadDir) {
        try {
            if (!window.electronAPI || !window.electronAPI.downloadFile) {
                console.error('electronAPI未定义或downloadFile方法不存在');
                return;
            }
            
            // 不再在这里显示进度条，而是在downloadSelectedFiles方法中只显示一次
            
            const localPath = `${downloadDir}/${file.name}`;
            const result = await window.electronAPI.downloadFile(file.path, localPath, this.selectedDevice);
            return result;
        } catch (error) {
            console.error('下载文件失败:', error);
            return { success: false, error: error.message };
        }
    }
    
    // 安装APK
    async installApk() {
        try {
            // 检查是否选择了设备
            if (!this.selectedDevice) {
                Toast.error(window.i18n.t('fileManager.selectDeviceFirst'));
                return;
            }
            
            // 检查electronAPI是否可用
            if (!window.electronAPI || !window.electronAPI.selectApkFile) {
                console.error('electronAPI未定义或selectApkFile方法不存在');
                return;
            }
            
            // 打开文件选择器（APK文件，单选）
            const result = await window.electronAPI.selectApkFile();
            if (result.canceled || result.filePaths.length === 0) {
                return;
            }
            
            const apkPath = result.filePaths[0];
            const fileName = apkPath.split(/[\\/]/).pop();
            
            // 显示进度条
            this.progressIndicator.show(window.i18n.t('fileManager.preparingInstall'), 'install');
            this.progressIndicator.setTotalFiles(1);
            this.progressIndicator.setCurrentFileIndex(0);
            
            // 注册进度监听器
            const removeListener = window.electronAPI.onInstallProgress((progress) => {
                this.progressIndicator.update(progress);
            });
            
            // 调用安装API
            try {
                const installResult = await window.electronAPI.installApk(apkPath, this.selectedDevice);
                
                if (installResult.success) {
                    Toast.success(window.i18n.t('fileManager.installSuccess'));
                } else {
                    Toast.error(installResult.error || window.i18n.t('fileManager.installFailed'));
                }
            } catch (error) {
                this.progressIndicator.update({
                    percentage: 100,
                    status: 'error',
                    message: window.i18n.t('fileManager.installFailed'),
                    fileName: fileName,
                    error: error.message
                });
            } finally {
                removeListener();
            }
        } catch (error) {
            console.error('安装APK失败:', error);
        }
    }
    
    // 重命名文件
    renameFile(file) {
        this.contextMenuTarget = file;
        
        const renameInput = document.getElementById('rename-input');
        const renameForm = document.getElementById('rename-modal-form');
        
        renameInput.value = file.name;
        renameInput.focus();
        renameInput.select();
        
        this.modals.rename.open();
        
        const saveBtn = document.getElementById('rename-modal-save-btn');
        const cancelBtn = document.getElementById('rename-modal-cancel-btn');
        const closeBtn = document.getElementById('rename-modal-close-btn');
        
        const handleSave = () => {
            const newName = renameInput.value.trim();
            if (newName && newName !== file.name) {
                const newPath = `${this.currentPath}/${newName}`;
                this.executeAdbCommand(`mv "${file.path}" "${newPath}"`, this.selectedDevice)
                    .then(result => {
                        if (result.success) {
                            this.loadFileList();
                        } else {
                            console.error('重命名文件失败:', result.error);
                        }
                    })
                    .catch(error => {
                        console.error('重命名操作失败:', error);
                    })
                    .finally(() => {
                        this.modals.rename.close();
                    });
            } else {
                this.modals.rename.close();
            }
        };
        
        const handleCancel = () => {
            this.modals.rename.close();
        };
        
        // 表单提交事件
        const handleFormSubmit = (e) => {
            e.preventDefault();
            handleSave();
        };
        
        // 移除之前的事件监听器，避免重复绑定
        saveBtn.removeEventListener('click', handleSave);
        cancelBtn.removeEventListener('click', handleCancel);
        closeBtn.removeEventListener('click', handleCancel);
        renameForm.removeEventListener('submit', handleFormSubmit);
        
        // 添加新的事件监听器
        saveBtn.addEventListener('click', handleSave);
        cancelBtn.addEventListener('click', handleCancel);
        closeBtn.addEventListener('click', handleCancel);
        renameForm.addEventListener('submit', handleFormSubmit);
    }
    
    // 显示控制参数模态框
    async showControlParamsModal() {
        this.modals.controlParams.open();
        
        this.initializeCustomSelects();

        await this.loadControlParams();
    }

    hideControlParamsModal() {
        this.modals.controlParams.close();
    }

    // 加载控制参数
    async loadControlParams() {
        try {
            // 调用electronAPI获取配置
            const config = await window.electronAPI.getConfig();
            
            // 提取scrcpy参数
            const scrcpyParams = config.SCRCPY_PARAMS || {};
            
            // 设置表单值
            document.getElementById('max-size').value = scrcpyParams.max_size || '';
            document.getElementById('video-bit-rate').value = scrcpyParams.video_bit_rate || '';
            document.getElementById('max-fps').value = scrcpyParams.max_fps || '';
            document.getElementById('always-on-top').checked = scrcpyParams.always_on_top || false;
            
            // 设置视频编码下拉框
            const videoCodecValue = scrcpyParams.video_codec || 'h264';
            this.setCustomSelectValue('video-codec', videoCodecValue);
        } catch (error) {
            console.error('加载控制参数失败:', error);
        }
    }

    // 设置自定义下拉框的值
    setCustomSelectValue(wrapperId, value) {
        const wrapper = document.getElementById(wrapperId);
        if (!wrapper) return;
        
        const optionsEl = document.getElementById(`${wrapperId}-options`);
        if (!optionsEl) return;
        
        const selected = wrapper.querySelector('.custom-select__text');
        
        optionsEl.querySelectorAll('.custom-select__option').forEach(option => {
            if (option.dataset.value === value) {
                option.classList.add('selected');
                if (selected) {
                    selected.textContent = option.querySelector('span').textContent;
                }
            } else {
                option.classList.remove('selected');
            }
        });
    }

    getCustomSelectValue(wrapperId) {
        const optionsEl = document.getElementById(`${wrapperId}-options`);
        if (!optionsEl) return null;
        
        const selectedOption = optionsEl.querySelector('.custom-select__option.selected');
        return selectedOption ? selectedOption.dataset.value : null;
    }

    // 保存控制参数
    async saveControlParams() {
        try {
            // 获取表单值
            const scrcpyParams = {
                max_size: document.getElementById('max-size').value || null,
                video_bit_rate: document.getElementById('video-bit-rate').value || null,
                max_fps: document.getElementById('max-fps').value || null,
                video_codec: this.getCustomSelectValue('video-codec') || null,
                always_on_top: document.getElementById('always-on-top').checked
            };
            
            // 调用electronAPI保存配置
            await window.electronAPI.saveConfig({ SCRCPY_PARAMS: scrcpyParams });
            
            // 关闭模态框
            this.hideControlParamsModal();
            
            // 显示成功提示

        } catch (error) {
            console.error('保存控制参数失败:', error);
            this.appendError('保存控制参数失败: ' + error.message);
        }
    }

    // 开始屏幕控制
    async startScreenControl() {
        try {
            Toast.info(window.i18n.t('screenControl.starting'));

            if (!this.selectedDevice) {
                Toast.error(window.i18n.t('screenControl.noDevice'));
                return;
            }

            const config = await window.electronAPI.getConfig();
            const scrcpyParams = config.SCRCPY_PARAMS || {};

            const result = await window.electronAPI.startScrcpy(this.selectedDevice, scrcpyParams);

            if (result.success) {
                Toast.success(window.i18n.t('screenControl.started'));
            } else {
                Toast.error(`${window.i18n.t('screenControl.startFailed')}: ${result.error}`);
            }
        } catch (error) {
            console.error('启动屏幕控制失败:', error);
            Toast.error(`${window.i18n.t('screenControl.startFailed')}: ${error.message}`);
        }
    }

    addScrollDebugListeners() {
        // 添加鼠标滚轮监听器来帮助调试滚动问题
        const testFilesList = document.getElementById('test-files-list');
        const testTypeSelector = document.getElementById('test-type-selector');
        
        if (testFilesList) {
            // 添加滚动事件监听（已移除调试输出）
        }
        
        
        if (testTypeSelector) {
            // 添加滚动事件监听（已移除调试输出）
        }
    }

    async selectTestPlan(plan, element) {
        // 检查是否是取消选中（再次点击已选中的计划）
        if (this.currentTestPlan && this.currentTestPlan.id === plan.id) {
            // 取消选中
            element.classList.remove('selected');
            this.currentTestPlan = null;

            
            // 清空选中的测试文件
            this.selectedTestFiles = [];
            
            // 移除所有文件的选中状态
            document.querySelectorAll('.test-file-item.selected').forEach(item => {
                item.classList.remove('selected');
            });
            
            // 清空文件列表显示，恢复到初始状态
            this.displayTestFiles([]);
            
            // 清空测试类型显示，恢复到初始占位符状态
            this.displayTestTypes([], window.i18n.t('testExecution.selectTestDirectoryFirst'));
            
            // 清空目录显示区域
            this.selectedDirectory = null;
            this.selectedDirectoryDisplayName = null;
            this.updateSelectedDirectory();
            
            // 重新启用测试目录和测试类型选项卡
            this.enableTestDirectoryTab();
            this.enableTestTypeTab();
            
            // 更新运行按钮状态
            this.updateRunButtonState();
            
            // 更新计划按钮状态
            this.updatePlanButtons();
            return;
        }
        
        // 取消定时计划子项的选中状态
        if (this.currentScheduledPlan) {
            document.querySelectorAll('.scheduled-plan-item.selected').forEach(item => {
                item.classList.remove('selected');
            });
            this.currentScheduledPlan = null;
            this.updateScheduledPlanButtons();
        }
        
        // 移除其他选中状态
        document.querySelectorAll('.test-file-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        // 移除其他测试计划的选中状态
        document.querySelectorAll('.test-plan-item.selected').forEach(item => {
            item.classList.remove('selected');
        });
        
        // 设置当前选中
        element.classList.add('selected');
        this.currentTestPlan = plan;
        
        // 记录当前状态，用于判断是否是"什么都没有选择"的场景
        const wasNothingSelected = !this.selectedDirectory && this.selectedTestFiles.length === 0;
        
        // 自动勾选测试计划对应的测试目录
        this.selectTestPlanDirectory(plan.testFiles || []);
        
        // 如果是"什么都没有选择"的场景，需要先扫描并显示文件列表
        if (wasNothingSelected && plan.testFiles && plan.testFiles.length > 0) {
            try {
                // 等待目录设置完成
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // 扫描并显示测试文件
                const testFiles = await window.electronAPI.scanTestFiles(this.selectedDirectory);
                this.displayTestFiles(testFiles);
                
                // 等待文件显示完成
                await new Promise(resolve => setTimeout(resolve, 200));
            } catch (error) {
                console.error(window.i18n.t('testExecution.scanTestFilesFailed') + ':', error);
            }
        }
        
        // 先根据计划筛选测试类型，再选择测试文件（避免闪现）
        this.selectTestPlanTypes(plan.testTypes || []);
        this.selectTestPlanFiles(plan.testFiles || []);
        
        // 如果是"什么都没有选择"的场景，确保文件被正确选中
        if (wasNothingSelected) {
            // 确保文件被正确选中
            if (plan.testFiles && plan.testFiles.length > 0) {
                setTimeout(() => {
                    this.selectTestPlanFiles(plan.testFiles);
                }, 100);
            }
            
            // 确保测试类型被正确选中
            if (plan.testTypes && plan.testTypes.length > 0) {
                setTimeout(() => {
                    this.selectTestPlanTypes(plan.testTypes);
                }, 200);
            }
        }
        
        // 禁用测试目录和测试类型选项卡
        this.disableTestDirectoryTab();
        this.disableTestTypeTab();
        
        // 更新UI显示选中的测试计划

        
        // 如果是"什么都没有选择"的场景，显示额外的提示信息
        if (wasNothingSelected) {

        }
        
        // 更新计划按钮状态
        this.updatePlanButtons();
    }

    async displayModalTestFiles() {
        const container = document.getElementById('modal-test-files');
        
        if (!this.selectedDirectory) {
            container.innerHTML = '';
            const placeholderElement = document.createElement('div');
            placeholderElement.className = 'no-files';
            placeholderElement.innerHTML = window.i18n.t('testExecution.selectTestDirectoryFirst');
            container.appendChild(placeholderElement);
            return;
        }

        container.innerHTML = `<div class="modal-test-files-loading"><div class="modal-test-files-spinner"></div></div>`;
        container.style.cssText = '';

        // 强制显示加载动画至少0.5秒
        const startTime = Date.now();
        
        const testFiles = await window.electronAPI.scanTestFiles(this.selectedDirectory);
        
        // 计算已经过去的时间，确保至少等待0.5秒
        const elapsed = Date.now() - startTime;
        const remainingTime = Math.max(0, 500 - elapsed);
        if (remainingTime > 0) {
            await new Promise(resolve => setTimeout(resolve, remainingTime));
        }

        if (testFiles.length === 0) {
            container.innerHTML = '';
            const placeholderElement = document.createElement('div');
            placeholderElement.className = 'no-files';
            placeholderElement.innerHTML = window.i18n.t('testExecution.noTestFilesInDir');
            container.appendChild(placeholderElement);
            return;
        }

        container.innerHTML = '';

        for (const file of testFiles) {
            const fileElement = document.createElement('div');
            fileElement.className = 'modal-test-file-item';
            
            // 获取测试用例的平台信息和蓝牙步骤信息
            let platform = null;
            let deviceName = '';
            let hasBleSteps = false;
            let blePort = '';
            let fileName = file.name;
            if (fileName.endsWith('.py')) {
                fileName = fileName.slice(0, -3);
            }
            
            try {
                const result = await window.electronAPI.testCase.get(fileName);
                if (result && result.success && result.data) {
                    platform = result.data.platform || null;
                    deviceName = result.data.deviceConfig?.deviceName || '';
                    blePort = result.data.bleDevice?.port || '';
                    hasBleSteps = result.data.steps && result.data.steps.some(step => step.type === 'ble');
                }
            } catch (error) {
                // 忽略错误，使用默认值
            }
            
            // 显示编辑按钮的条件: 安卓平台 或 有蓝牙步骤
            const isAndroid = platform && platform.toLowerCase() === 'android';
            const hasDeviceName = deviceName && deviceName !== '{{DEVICE_NAME}}' && deviceName.trim() !== '';
            const showEditBtn = isAndroid || hasBleSteps;
            
            // 构建设备信息显示（安卓用例显示设备ID，蓝牙用例显示端口）
            let deviceInfoHtml = '';
            let editBtnHtml = '';
            if (showEditBtn) {
                // 构建设备信息行
                let infoItems = [];
                
                // 安卓设备信息
                if (isAndroid) {
                    const deviceDisplay = hasDeviceName ? deviceName : window.i18n.t('testExecution.deviceSelection.notSet');
                    const deviceStatusClass = hasDeviceName ? 'device-set' : 'device-not-set';
                    infoItems.push(`
                        <span class="test-file-device-info ${deviceStatusClass}" data-file-name="${fileName}" data-type="device">
                            ${this.getIconHtml('devices')}
                            <span class="device-name-display">${deviceDisplay}</span>
                        </span>
                    `);
                }
                
                // 蓝牙端口信息
                if (hasBleSteps) {
                    const portDisplay = blePort || window.i18n.t('testExecution.deviceSelection.notSet');
                    const portStatusClass = blePort ? 'device-set' : 'device-not-set';
                    infoItems.push(`
                        <span class="test-file-device-info ${portStatusClass}" data-file-name="${fileName}" data-type="ble-port">
                            ${this.getIconHtml('cable')}
                            <span class="ble-port-display">${portDisplay}</span>
                        </span>
                    `);
                }
                
                if (infoItems.length > 0) {
                    deviceInfoHtml = `<div class="test-file-device-row">${infoItems.join('')}</div>`;
                }
                
                editBtnHtml = `
                    <button type="button" class="edit-device-btn" data-file-name="${fileName}" data-file-path="${file.path}" data-has-ble="${hasBleSteps}" data-is-android="${isAndroid}">
                        ${this.getIconHtml('edit')}
                    </button>
                `;
            }
            
            fileElement.innerHTML = `
                <div class="test-file-main-row">
                    <input type="checkbox" id="modal-file-${file.name}" value="${file.path}">
                    <label for="modal-file-${file.name}">
                        ${this.getIconHtml('description')}
                        ${file.name}
                    </label>
                </div>
                ${deviceInfoHtml}
                ${editBtnHtml}
            `;

            // 不默认选中文件，等待preselectModalItems设置选中状态
            const checkbox = fileElement.querySelector('input[type="checkbox"]');
            checkbox.checked = false;

            // 添加事件监听器，当文件选择状态改变时更新测试类型
            checkbox.addEventListener('change', () => {
                this.updateModalTestTypes();
            });

            // 为整个文件项添加点击事件，点击时切换复选框状态
            fileElement.addEventListener('click', (e) => {
                // 排除编辑按钮的点击
                if (e.target.closest('.edit-device-btn')) {
                    return;
                }
                // 排除复选框本身的点击（避免双重切换）
                if (e.target.type === 'checkbox') {
                    return;
                }
                // 排除label元素的点击（label会自动触发复选框切换）
                if (e.target.closest('label')) {
                    return;
                }
                // 切换复选框状态
                checkbox.checked = !checkbox.checked;
                // 触发change事件以更新测试类型
                checkbox.dispatchEvent(new Event('change'));
            });

            // 为编辑按钮添加事件监听
            const editBtn = fileElement.querySelector('.edit-device-btn');
            if (editBtn) {
                editBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.showEditDeviceIdModal(fileName, file.path);
                });
            }

            container.appendChild(fileElement);
        }

        // 初始显示测试类型
        this.updateModalTestTypes();
    }

    // 更新测试类型警告显示
    updateTestTypeWarning() {
        const warningElement = document.getElementById('test-type-warning');
        const availableTestTypes = document.querySelectorAll('#modal-test-types input[type="checkbox"]');
        const selectedTestTypes = this.getModalSelectedTestTypes();
        
        if (availableTestTypes.length > 0 && selectedTestTypes.length === 0) {
            warningElement.classList.remove('warning-hidden');
        } else {
            warningElement.classList.add('warning-hidden');
        }
    }
    
    async updateModalTestTypes(selectedTypes = null) {
        if (this.updatingModalTypes) {

            return await this.updatingModalTypes;
        }
        
        const container = document.getElementById('modal-test-types');
        
        const selectedFiles = this.getModalSelectedTestFiles();
        
        if (selectedFiles.length === 0) {
            container.textContent = window.i18n.t('testExecution.selectTestFileFirst');
            container.style.cssText = 'display: flex; justify-content: center; align-items: center; height: 100%; text-align: center; color: var(--text-secondary); font-size: 13px; padding: 13px;';
            return;
        }

        // 显示加载动画（参考设备管理设备信息卡片的加载动画样式）
        container.innerHTML = `<div class="modal-test-types-loading"><div class="modal-test-types-spinner"></div></div>`;
        container.style.cssText = '';

        try {
            
            this.updatingModalTypes = (async () => {
                // 强制显示加载动画至少0.5秒
                const startTime = Date.now();
                
                const markers = await this.extractMarkersFromModalSelectedFiles(selectedFiles);
                
                // 计算已经过去的时间，确保至少等待0.5秒
                const elapsed = Date.now() - startTime;
                const remainingTime = Math.max(0, 500 - elapsed);
                if (remainingTime > 0) {
                    await new Promise(resolve => setTimeout(resolve, remainingTime));
                }
                
                container.innerHTML = '';
                
                if (markers.length === 0) {
                    // 直接显示文字，设置灰色小字号样式
                    container.textContent = window.i18n.t('testExecution.noMarkers');
                    container.style.cssText = 'display: flex; justify-content: center; align-items: center; height: 100%; text-align: center; color: var(--text-secondary); font-size: 13px; padding: 13px;';
                } else {
                    // 重置容器样式
                    container.style.cssText = '';
                    const uniqueMarkers = [];
                    const seenNames = new Set();
                    
                    markers.forEach(marker => {
                        if (!seenNames.has(marker.name)) {
                            seenNames.add(marker.name);
                            uniqueMarkers.push(marker);
                        }
                    });
                    
                    uniqueMarkers.forEach(marker => {
                        const item = document.createElement('div');
                        item.className = 'modal-test-type-item';
                        const translatedDescription = window.i18n.t('testTypes.' + marker.name);
                        item.innerHTML = `
                            <input type="checkbox" id="modal-type-${marker.name}" value="${marker.name}">
                            <label for="modal-type-${marker.name}">
                                ${this.getIconHtml('category')}
                                ${translatedDescription}
                            </label>
                        `;

                        const checkbox = item.querySelector('input[type="checkbox"]');
                        if (selectedTypes && selectedTypes.includes(marker.name)) {
                            checkbox.checked = true;
                        } else if (selectedTypes === null) {
                            checkbox.checked = true;
                        } else {
                            checkbox.checked = false;
                        }

                        container.appendChild(item);
                    });
                }
                

            })();
            
            await this.updatingModalTypes;
        } catch (error) {
            console.error('提取标记失败:', error);
            container.innerHTML = '';
            const placeholder = document.createElement('div');
            placeholder.className = 'placeholder-message';
            placeholder.textContent = window.i18n.t('testExecution.extractMarkersFailed');
            container.appendChild(placeholder);
        } finally {
            this.updatingModalTypes = null;
            
            this.updateTestTypeWarning();
            
            const typeCheckboxes = document.querySelectorAll('#modal-test-types input[type="checkbox"]');
            typeCheckboxes.forEach(checkbox => {
                checkbox.addEventListener('change', () => {
                    this.updateTestTypeWarning();
                });
            });
        }
    }

    async displayModalTestTypes() {
        // 直接调用updateModalTestTypes方法，不传递selectedTypes参数（默认选中所有）
        await this.updateModalTestTypes();
    }

    async showNewPlanModal() {
        this.modals.plan.open();
        document.getElementById('modal-title').textContent = window.i18n.t('testExecution.newTestPlan');
        document.getElementById('plan-name').value = '';
        document.getElementById('plan-description').value = '';
        
        document.getElementById('loop-count').value = 1;
        document.getElementById('continue-on-failure').checked = true;
        
        await this.displayModalTestFiles();
        await this.displayModalTestTypes();
        
        document.getElementById('save-plan-btn').classList.remove('hidden');
        document.getElementById('update-plan-btn').classList.add('hidden');
        
        this.hidePlanNameError();
        
        const planNameInput = document.getElementById('plan-name');
        planNameInput.addEventListener('input', () => {
            this.hidePlanNameError();
        });
    }

    hideModal() {
        this.modals.plan.close();
    }

    showConfirmModal(title, message, onConfirm) {
        const titleElement = document.getElementById('confirm-modal-title');
        const messageElement = document.getElementById('confirm-modal-message');
        
        if (titleElement) {
            titleElement.textContent = title;
        }
        if (messageElement) {
            messageElement.textContent = message;
        }
        
        this.confirmCallback = onConfirm;
        this.modals.confirm.open();
    }

    _initDataTransferButtons() {
        const exportConfigBtn = document.getElementById('export-config-btn');
        if (exportConfigBtn) {
            exportConfigBtn.addEventListener('click', () => this._handleExportConfig());
        }

        const exportLogsBtn = document.getElementById('export-logs-btn');
        if (exportLogsBtn) {
            exportLogsBtn.addEventListener('click', () => this._handleExportLogs());
        }

        const importConfigBtn = document.getElementById('import-config-btn');
        if (importConfigBtn) {
            importConfigBtn.addEventListener('click', () => this._handleImportConfig());
        }
    }

    async _handleExportConfig() {
        try {
            const dialogResult = await window.electronAPI.selectExportPath({ type: 'config' });
            if (dialogResult.canceled || !dialogResult.filePath) return;

            const outputPath = dialogResult.filePath;
            const progressModal = new ProgressModal();
            progressModal.show(window.i18n.t('settings.exportConfig'), {
                icon: 'upload_file',
                initialMessage: window.i18n.t('settings.exportingConfig')
            });

            const removeListener = window.electronAPI.onExportProgress((data) => {
                if (data.phase === 'error') {
                    progressModal.showError(data.message);
                } else {
                    progressModal.updateProgress(data);
                }
            });

            try {
                const result = await window.electronAPI.exportConfig(outputPath);
                if (result.success) {
                    progressModal.showComplete(window.i18n.t('settings.exportConfigSuccess'));
                    Toast.success(window.i18n.t('settings.exportConfigSuccess'));
                } else {
                    progressModal.showError(result.error);
                    Toast.error(window.i18n.t('settings.exportConfigFailed') + ': ' + result.error);
                }
            } catch (error) {
                progressModal.showError(error.message);
                Toast.error(window.i18n.t('settings.exportConfigFailed'));
            } finally {
                removeListener();
            }
        } catch (error) {
            console.error('导出配置失败:', error);
            Toast.error(window.i18n.t('settings.exportConfigFailed'));
        }
    }

    async _handleExportLogs() {
        try {
            const dialogResult = await window.electronAPI.selectExportPath({ type: 'logs' });
            if (dialogResult.canceled || !dialogResult.filePath) return;

            const outputPath = dialogResult.filePath;
            const progressModal = new ProgressModal();
            progressModal.show(window.i18n.t('settings.exportLogs'), {
                icon: 'description',
                initialMessage: window.i18n.t('settings.exportingLogs')
            });

            const removeListener = window.electronAPI.onExportProgress((data) => {
                if (data.phase === 'error') {
                    progressModal.showError(data.message);
                } else {
                    progressModal.updateProgress(data);
                }
            });

            try {
                const result = await window.electronAPI.exportLogs(outputPath);
                if (result.success) {
                    progressModal.showComplete(window.i18n.t('settings.exportLogsSuccess'));
                    Toast.success(window.i18n.t('settings.exportLogsSuccess'));
                } else {
                    progressModal.showError(result.error);
                    Toast.error(window.i18n.t('settings.exportLogsFailed') + ': ' + result.error);
                }
            } catch (error) {
                progressModal.showError(error.message);
                Toast.error(window.i18n.t('settings.exportLogsFailed'));
            } finally {
                removeListener();
            }
        } catch (error) {
            console.error('导出日志失败:', error);
            Toast.error(window.i18n.t('settings.exportLogsFailed'));
        }
    }

    async _handleImportConfig() {
        try {
            const confirmTitle = window.i18n.t('settings.importConfig');
            const confirmMessage = window.i18n.t('settings.importConfigConfirm');
            this.showConfirmModal(confirmTitle, confirmMessage, async () => {
                await this._doImportConfig();
            });
        } catch (error) {
            console.error('导入配置失败:', error);
            Toast.error(window.i18n.t('settings.importConfigFailed'));
        }
    }

    async _doImportConfig() {
        try {
            const dialogResult = await window.electronAPI.selectImportPath();
            if (dialogResult.canceled || !dialogResult.filePaths || dialogResult.filePaths.length === 0) return;

            const zipPath = dialogResult.filePaths[0];
            const progressModal = new ProgressModal();
            progressModal.show(window.i18n.t('settings.importConfig'), {
                icon: 'download',
                initialMessage: window.i18n.t('settings.importingConfig')
            });

            const removeListener = window.electronAPI.onImportProgress((data) => {
                if (data.phase === 'error') {
                    progressModal.showError(data.message);
                } else {
                    progressModal.updateProgress(data);
                }
            });

            try {
                const result = await window.electronAPI.importConfig(zipPath);
                if (result.success) {
                    progressModal.showComplete(window.i18n.t('settings.importConfigSuccess'));
                    Toast.success(window.i18n.t('settings.importConfigSuccess'));

                    if (result.needRestart) {
                        setTimeout(() => {
                            progressModal.hide();
                            const restartTitle = window.i18n.t('settings.importRestartTitle');
                            const restartMessage = window.i18n.t('settings.importRestartMessage');
                            this.showConfirmModal(restartTitle, restartMessage, async () => {
                                await window.electronAPI.relaunchApp();
                            });
                        }, 1500);
                    }
                } else {
                    progressModal.showError(result.error);
                    Toast.error(window.i18n.t('settings.importConfigFailed') + ': ' + result.error);
                }
            } catch (error) {
                progressModal.showError(error.message);
                Toast.error(window.i18n.t('settings.importConfigFailed'));
            } finally {
                removeListener();
            }
        } catch (error) {
            console.error('导入配置失败:', error);
            Toast.error(window.i18n.t('settings.importConfigFailed'));
        }
    }

    hideConfirmModal() {
        this.modals.confirm.close();
        this.confirmCallback = null;
    }

    executeConfirmAction() {
        if (this.confirmCallback) {
            this.confirmCallback();
        }
        this.hideConfirmModal();
    }

    showSaveConfirmModal(title, message, onSave, onDiscard) {
        const titleElement = document.getElementById('save-confirm-modal-title');
        const messageElement = document.getElementById('save-confirm-modal-message');

        if (titleElement) titleElement.textContent = title;
        if (messageElement) messageElement.textContent = message;

        this.saveConfirmOnSave = onSave;
        this.saveConfirmOnDiscard = onDiscard;
        this.modals.saveConfirm.open();
    }

    hideSaveConfirmModal() {
        this.modals.saveConfirm.close();
        this.saveConfirmOnSave = null;
        this.saveConfirmOnDiscard = null;
    }

    executeSaveConfirmSave() {
        if (this.saveConfirmOnSave) {
            this.saveConfirmOnSave();
        }
        this.hideSaveConfirmModal();
    }

    executeSaveConfirmDiscard() {
        if (this.saveConfirmOnDiscard) {
            this.saveConfirmOnDiscard();
        }
        this.hideSaveConfirmModal();
    }

    async checkForUpdate() {
        try {
            const checkUpdateBtn = document.getElementById('check-update-btn');
            if (checkUpdateBtn) {
                checkUpdateBtn.disabled = true;
            }

            const result = await window.electronAPI.checkForUpdate();

            if (result.success && result.data.hasUpdate) {
                this.showUpdateModal(result.data);
            } else if (result.success && !result.data.hasUpdate) {
                Toast.success(window.i18n.t('settings.alreadyLatest'));
            } else {
                const errorCode = result.errorCode || 'unknown';
                const specificMessage = window.i18n.t(`settings.updateErrorCodes.${errorCode}`);
                const fallbackMessage = window.i18n.t('settings.checkUpdateFailed');
                Toast.error(`${fallbackMessage}: ${specificMessage}`);
            }
        } catch (error) {
            console.error('检查更新失败:', error);
            const specificMessage = window.i18n.t('settings.updateErrorCodes.unknown');
            const fallbackMessage = window.i18n.t('settings.checkUpdateFailed');
            Toast.error(`${fallbackMessage}: ${specificMessage}`);
        } finally {
            const checkUpdateBtn = document.getElementById('check-update-btn');
            if (checkUpdateBtn) {
                checkUpdateBtn.disabled = false;
            }
        }
    }

    showUpdateModal(updateData) {
        const currentVersionEl = document.getElementById('update-current-version');
        const newVersionEl = document.getElementById('update-new-version');
        const changelogEl = document.getElementById('update-changelog');
        const progressContainer = document.getElementById('update-progress-container');
        const downloadBtn = document.getElementById('update-download-btn');

        if (currentVersionEl) {
            currentVersionEl.textContent = `v${updateData.currentVersion}`;
        }
        if (newVersionEl) {
            newVersionEl.textContent = `v${updateData.latestVersion}`;
        }
        if (changelogEl) {
            changelogEl.innerHTML = this.renderMarkdown(updateData.releaseNotes || '');
        }
        if (progressContainer) {
            progressContainer.classList.add('hidden');
        }
        if (downloadBtn) {
            downloadBtn.textContent = window.i18n.t('settings.downloadUpdate');
            downloadBtn.disabled = false;
            downloadBtn.classList.remove('disabled');
        }

        this.updateData = updateData;
        this.updatePendingFilePath = null;

        this.modals.update.open();
    }

    hideUpdateModal() {
        this.modals.update.close();
        this.updateData = null;
        this.updatePendingFilePath = null;
        this.removeUpdateProgressListener = null;
    }

    async downloadUpdate() {
        const downloadBtn = document.getElementById('update-download-btn');
        const progressContainer = document.getElementById('update-progress-container');
        const progressFill = document.getElementById('update-progress-fill');
        const progressText = document.getElementById('update-progress-text');

        if (downloadBtn) {
            downloadBtn.textContent = window.i18n.t('settings.downloading');
            downloadBtn.disabled = true;
            downloadBtn.classList.add('disabled');
        }

        if (progressContainer) {
            progressContainer.classList.remove('hidden');
        }
        if (progressFill) {
            progressFill.style.width = '0%';
        }
        if (progressText) {
            progressText.textContent = '0%';
        }

        const speedEl = document.getElementById('update-progress-speed');
        if (speedEl) {
            speedEl.textContent = '';
        }

        if (this.removeUpdateProgressListener) {
            this.removeUpdateProgressListener();
        }

        this.removeUpdateProgressListener = window.electronAPI.onUpdateDownloadProgress((progress) => {
            const percent = Math.round(progress.percent);
            if (progressFill) {
                progressFill.style.width = `${percent}%`;
            }
            if (progressText) {
                progressText.textContent = `${percent}%`;
            }
            const speedEl = document.getElementById('update-progress-speed');
            if (speedEl && progress.speed !== undefined) {
                speedEl.textContent = this.formatDownloadSpeed(progress.speed);
            }
        });

        try {
            const result = await window.electronAPI.downloadUpdate(this.updateData.downloadUrl, this.updateData.fileName);

            if (this.removeUpdateProgressListener) {
                this.removeUpdateProgressListener();
                this.removeUpdateProgressListener = null;
            }

            if (result.success) {
                this.updatePendingFilePath = result.data.filePath;
                if (downloadBtn) {
                    downloadBtn.textContent = window.i18n.t('settings.clickToUpdate');
                    downloadBtn.disabled = false;
                    downloadBtn.classList.remove('disabled');
                }
                const speedEl = document.getElementById('update-progress-speed');
                if (speedEl) {
                    speedEl.textContent = '';
                }
            } else {
                Toast.error(result.error || window.i18n.t('settings.downloadFailed'));
                this.updatePendingFilePath = null;
                if (downloadBtn) {
                    downloadBtn.textContent = window.i18n.t('settings.downloadUpdate');
                    downloadBtn.disabled = false;
                    downloadBtn.classList.remove('disabled');
                }
            }
        } catch (error) {
            console.error('下载更新失败:', error);
            Toast.error(window.i18n.t('settings.downloadFailed'));
            this.updatePendingFilePath = null;

            if (this.removeUpdateProgressListener) {
                this.removeUpdateProgressListener();
                this.removeUpdateProgressListener = null;
            }

            if (downloadBtn) {
                downloadBtn.textContent = window.i18n.t('settings.downloadUpdate');
                downloadBtn.disabled = false;
                downloadBtn.classList.remove('disabled');
            }
        }
    }

    async installUpdate(filePath) {
        try {
            await window.electronAPI.installUpdate(filePath);
        } catch (error) {
            console.error('安装更新失败:', error);
            Toast.error(window.i18n.t('settings.downloadFailed'));
        }
    }

    renderMarkdown(text) {
        if (!text) return '';
        let html = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
        html = html.replace(/^## (.+)$/gm, '<h4>$1</h4>');
        html = html.replace(/^# (.+)$/gm, '<h4>$1</h4>');
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/^\- (.+)$/gm, '<li>$1</li>');

        html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => {
            return '<ul>' + match + '</ul>';
        });

        html = html.replace(/\n/g, '<br>');

        html = html.replace(/<br><h4>/g, '<h4>');
        html = html.replace(/<\/h4><br>/g, '</h4>');
        html = html.replace(/<br><ul>/g, '<ul>');
        html = html.replace(/<\/ul><br>/g, '</ul>');

        return html;
    }

    formatDownloadSpeed(bytesPerSecond) {
        if (bytesPerSecond <= 0) return '';
        if (bytesPerSecond < 1024) {
            return `${Math.round(bytesPerSecond)} B/s`;
        } else if (bytesPerSecond < 1024 * 1024) {
            return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
        } else {
            return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
        }
    }

    async autoCheckForUpdate() {
        try {
            const config = await window.electronAPI.getConfig();
            if (config && config.APP_SETTINGS && config.APP_SETTINGS.autoCheckUpdate === true) {
                setTimeout(() => {
                    this.checkForUpdate();
                }, 3000);
            }
        } catch (error) {
            console.error('自动检查更新失败:', error);
        }
    }

    getModalSelectedTestFiles() {
        const selectedFiles = [];
        const checkboxes = document.querySelectorAll('#modal-test-files input[type="checkbox"]');
        
        checkboxes.forEach(checkbox => {
            if (checkbox.checked) {
                selectedFiles.push({
                    name: checkbox.id.replace('modal-file-', ''),
                    path: checkbox.value,
                    type: 'python' // 默认类型
                });
            }
        });
        
        return selectedFiles;
    }

    getModalSelectedTestTypes() {
        const selectedTypes = [];
        const checkboxes = document.querySelectorAll('#modal-test-types input[type="checkbox"]');
        
        checkboxes.forEach(checkbox => {
            if (checkbox.checked) {
                selectedTypes.push(checkbox.value);
            }
        });
        
        return selectedTypes;
    }

    // 显示计划名称错误提示
    showPlanNameError() {
        const errorElement = document.getElementById('plan-name-error');
        errorElement.classList.remove('error-hidden');
        
        // 3秒后自动隐藏错误提示
        setTimeout(() => {
            this.hidePlanNameError();
        }, 3000);
    }
    
    // 隐藏计划名称错误提示
    hidePlanNameError() {
        const errorElement = document.getElementById('plan-name-error');
        errorElement.classList.add('error-hidden');
    }
    
    async saveTestPlan() {
        const name = document.getElementById('plan-name').value.trim();
        const description = document.getElementById('plan-description').value.trim();

        if (!name) {
            this.showPlanNameError();
            return;
        }

        // 获取模态框中选择的测试文件和测试类型
        const selectedTestFiles = this.getModalSelectedTestFiles();
        const selectedTestTypes = this.getModalSelectedTestTypes();

        if (selectedTestFiles.length === 0) {

            return;
        }



        try {
            const planData = {
                name: name,
                description: description,
                created: new Date().toISOString(),
                testFiles: selectedTestFiles,
                testTypes: selectedTestTypes,
                loopCount: parseInt(document.getElementById('loop-count').value) || 1,
                continueOnFailure: document.getElementById('continue-on-failure').checked
            };

            const result = await window.electronAPI.saveTestPlan(planData);
            
            if (result.success) {
                this.hideModal();

                this.currentTestPlan = null;
                await this.loadTestPlans();

                const newPlan = this.testPlans.find(plan => plan.name === name);
                if (newPlan) {
                    this.currentTestPlan = newPlan;

                    const element = document.querySelector(`.test-plan-item[data-plan-name="${CSS.escape(name)}"]`);
                    if (element) {
                        document.querySelectorAll('.test-plan-item.selected').forEach(item => {
                            item.classList.remove('selected');
                        });
                        element.classList.add('selected');
                    }

                    this.selectTestPlanDirectory(newPlan.testFiles || []);

                    if (newPlan.testFiles && newPlan.testFiles.length > 0) {
                        try {
                            await new Promise(resolve => setTimeout(resolve, 100));
                            const testFiles = await window.electronAPI.scanTestFiles(this.selectedDirectory);
                            this.displayTestFiles(testFiles);
                            await new Promise(resolve => setTimeout(resolve, 200));
                        } catch (error) {
                            console.error('扫描测试文件失败:', error);
                        }
                    }

                    this.selectTestPlanFiles(newPlan.testFiles || []);
                    this.selectTestPlanTypes(newPlan.testTypes || []);
                    this.disableTestDirectoryTab();
                    this.disableTestTypeTab();
                    this.updatePlanButtons();
                    this.updateRunButtonState();
                }
            } else {
                this.showError(window.i18n.t('testExecution.saveTestPlanFailed') + ': ' + result.error);
            }
        } catch (error) {
            console.error('保存测试计划失败:', error);
            this.showError(window.i18n.t('testExecution.saveTestPlanFailed') + ': ' + error.message);
        }
    }

    editTestPlan() {
        if (!this.currentTestPlan) {
            this.showError(window.i18n.t('testExecution.selectTestPlanFirst'));
            return;
        }
        
        this.showEditPlanModal(this.currentTestPlan);
    }

    async showEditPlanModal(plan) {
        this.modals.plan.open();
        document.getElementById('modal-title').textContent = window.i18n.t('testExecution.editTestPlan');
        
        // 填充现有数据
        document.getElementById('plan-name').value = plan.name;
        document.getElementById('plan-description').value = plan.description || '';
        
        // 回填循环设置值（兼容旧计划，使用默认值）
        document.getElementById('loop-count').value = plan.loopCount || 1;
        document.getElementById('continue-on-failure').checked = plan.continueOnFailure !== false;
        
        // 显示当前目录下的测试文件
        await this.displayModalTestFiles();
        
        // 预选中计划中的文件（在显示测试类型之前）
        this.preselectModalItems(plan);
        
        // 等待DOM更新完成，确保文件选择状态已设置
        await new Promise(resolve => setTimeout(resolve, 0));
        
        // 显示基于选中文件的测试类型，并预选中计划中的测试类型
        await this.updateModalTestTypes(plan.testTypes);
        
        // 显示更新按钮，隐藏保存按钮
        document.getElementById('save-plan-btn').classList.add('hidden');
        document.getElementById('update-plan-btn').classList.remove('hidden');
        
        // 重置错误提示
        this.hidePlanNameError();
        
        // 添加输入事件监听，输入时隐藏错误提示
        const planNameInput = document.getElementById('plan-name');
        planNameInput.addEventListener('input', () => {
            this.hidePlanNameError();
        });
    }

    preselectModalItems(plan) {
        // 预选中测试文件 - 使用最简单的方法：直接设置状态
        const fileCheckboxes = document.querySelectorAll('#modal-test-files input[type="checkbox"]');
        
        // 设置复选框状态
        fileCheckboxes.forEach(checkbox => {
            const filePath = checkbox.value;
            const isSelected = plan.testFiles.some(file => file.path === filePath);
            checkbox.checked = isSelected;
        });
        
        // 预选中测试类型
        const typeCheckboxes = document.querySelectorAll('#modal-test-types input[type="checkbox"]');
        typeCheckboxes.forEach(checkbox => {
            const typeName = checkbox.value;
            const isSelected = plan.testTypes.includes(typeName);
            checkbox.checked = isSelected;
        });
    }

    async updateTestPlan() {
        if (!this.currentTestPlan) {
            this.showError(window.i18n.t('testExecution.noSelectedTestPlan'));
            return;
        }

        const name = document.getElementById('plan-name').value.trim();
        const description = document.getElementById('plan-description').value.trim();

        if (!name) {
            this.showPlanNameError();
            return;
        }

        // 获取模态框中选择的测试文件和测试类型
        const selectedTestFiles = this.getModalSelectedTestFiles();
        const selectedTestTypes = this.getModalSelectedTestTypes();

        if (selectedTestFiles.length === 0) {

            return;
        }



        try {
            const planData = {
                id: this.currentTestPlan.id,
                name: name,
                description: description,
                created: this.currentTestPlan.created || new Date().toISOString(),
                testFiles: selectedTestFiles,
                testTypes: selectedTestTypes,
                loopCount: parseInt(document.getElementById('loop-count').value) || 1,
                continueOnFailure: document.getElementById('continue-on-failure').checked
            };

            const result = await window.electronAPI.updateTestPlan(planData);
            
            if (result.success) {
                this.hideModal();

                
                // 保存原始选中状态的计划ID
                const originalPlanId = this.currentTestPlan.id;
                
                // 重新加载计划列表
                await this.loadTestPlans();
                
                const updatedPlan = this.testPlans.find(plan => plan.id === originalPlanId);
                if (updatedPlan) {
                    // 更新当前选中的计划对象
                    this.currentTestPlan = updatedPlan;
                    
                    const element = document.querySelector(`.test-plan-item[data-plan-name="${CSS.escape(updatedPlan.name)}"]`);
                    if (element) {
                        document.querySelectorAll('.test-plan-item.selected').forEach(item => {
                            item.classList.remove('selected');
                        });
                        element.classList.add('selected');
                        
                        this.selectTestPlanFiles(updatedPlan.testFiles || []);
                        this.selectTestPlanTypes(updatedPlan.testTypes || []);
                        
                        this.disableTestDirectoryTab();
                        this.disableTestTypeTab();
                    }
                }
            } else {
                this.showError(window.i18n.t('testExecution.updateTestPlanFailed') + ': ' + result.error);
            }
        } catch (error) {
            console.error('更新测试计划失败:', error);
            this.showError(window.i18n.t('testExecution.updateTestPlanFailed') + ': ' + error.message);
        }
    }

    async deleteTestPlan() {
        if (!this.currentTestPlan) {
            this.showError(window.i18n.t('testExecution.selectTestPlanFirst'));
            return;
        }

        const planName = this.currentTestPlan.name;
        const planId = this.currentTestPlan.id;
        const title = window.i18n.t('modal.deletePlanTitle');
        const message = window.i18n.t('modal.deletePlanMessage', { name: planName });
        
        this.showConfirmModal(title, message, async () => {
            try {
                const result = await window.electronAPI.deleteTestPlan(planId);
                
                if (result.success) {
                    Toast.success(window.i18n.t('testExecution.deleteTestPlanSuccess'));
                    
                    // 级联删除：检查并更新包含此测试计划的定时计划
                    await this.cascadeDeleteFromScheduledPlans(planId);
                    
                    this.currentTestPlan = null;
                    
                    const planElements = document.querySelectorAll('.test-plan-item');
                    planElements.forEach(element => {
                        element.classList.remove('selected');
                    });
                    
                    this.selectedDirectory = null;
                    this.selectedDirectoryDisplayName = null;
                    this.updateSelectedDirectory();
                    
                    this.selectedTestFiles = [];
                    this.displayTestFiles([]);
                    
                    this.displayTestTypes([], window.i18n.t('testExecution.selectTestDirectoryFirst'));
                    
                    this.enableTestDirectoryTab();
                    this.enableTestTypeTab();
                    
                    await this.loadTestPlans();
                    this.updateRunButtonState();
                    this.updatePlanButtons();
                } else {
                    Toast.error(window.i18n.t('testExecution.deleteTestPlanFailed') + ': ' + result.error);
                }
            } catch (error) {
                console.error('删除测试计划失败:', error);
                Toast.error(window.i18n.t('testExecution.deleteTestPlanFailed') + ': ' + error.message);
            }
        });
    }
    
    async cascadeDeleteFromScheduledPlans(testPlanId) {
        try {
            const scheduledPlans = await window.electronAPI.getScheduledPlans();
            const plansToUpdate = [];
            const plansToDelete = [];
            
            for (const plan of scheduledPlans) {
                if (plan.testPlans && plan.testPlans.length > 0) {
                    const remainingTestPlans = plan.testPlans.filter(tp => {
                        return tp.id !== testPlanId;
                    });
                    
                    if (remainingTestPlans.length < plan.testPlans.length) {
                        if (remainingTestPlans.length === 0) {
                            // 如果没有剩余的测试计划，标记为删除
                            plansToDelete.push(plan);
                        } else {
                            // 否则更新定时计划
                            plansToUpdate.push({
                                ...plan,
                                testPlans: remainingTestPlans,
                                testPlanNames: remainingTestPlans.map(tp => tp.name)
                            });
                        }
                    }
                }
            }
            
            // 删除没有测试计划的定时计划
            for (const plan of plansToDelete) {
                await window.electronAPI.deleteScheduledPlan(plan.id);
            }
            
            // 更新包含被删除测试计划的定时计划
            for (const plan of plansToUpdate) {
                await window.electronAPI.updateScheduledPlan(plan);
            }
            
            // 重新加载定时计划列表
            await this.loadScheduledPlans();
            
            // 显示提示信息
            if (plansToDelete.length > 0 || plansToUpdate.length > 0) {
                let infoMessage = '';
                if (plansToDelete.length > 0) {
                    infoMessage += `已删除 ${plansToDelete.length} 个空的定时计划`;
                }
                if (plansToUpdate.length > 0) {
                    if (infoMessage) infoMessage += '，';
                    infoMessage += `已更新 ${plansToUpdate.length} 个定时计划`;
                }
                if (infoMessage) {
                    Toast.info(infoMessage);
                }
            }
        } catch (error) {
            console.error('级联删除定时计划失败:', error);
        }
    }

    async viewReport() {
        const selectedPlan = this.getSelectedTestPlan();
        if (!selectedPlan) {
            this.appendOutput('>>> ' + window.i18n.t('testExecution.selectTestPlanFirst') || '请先选择一个测试计划');
            return;
        }

        await this.showReportModal(selectedPlan);
    }

    async showReportModal(testPlan) {
        const planNameElement = document.getElementById('report-plan-name');
        const runsListElement = document.getElementById('report-runs-list');
        const noRunsElement = document.getElementById('report-no-runs');
        const openBtn = document.getElementById('report-modal-open-btn');
        
        planNameElement.textContent = testPlan.name;
        openBtn.disabled = true;
        this.selectedReportRun = null;
        
        runsListElement.innerHTML = `
            <div class="report-loading">
                <div class="report-loading-spinner"></div>
                <span data-i18n="reportModal.loading">${window.i18n.t('reportModal.loading')}</span>
            </div>
        `;
        runsListElement.classList.remove('hidden');
        noRunsElement.classList.add('hidden');
        
        this.modals.report.open();
        
        try {
            const result = await window.electronAPI.getTestPlanRuns(testPlan.name);
            
            if (!result.success) {
                runsListElement.innerHTML = `
                    <div class="report-no-runs">
                        <span class="svg-icon" data-icon="error"></span>
                        <span>${result.error || window.i18n.t('reportModal.loadFailed')}</span>
                    </div>
                `;
                return;
            }
            
            if (result.runs.length === 0) {
                runsListElement.classList.add('hidden');
                noRunsElement.classList.remove('hidden');
                return;
            }
            
            this.renderReportRuns(result.runs);
        } catch (error) {
            console.error('加载运行记录失败:', error);
            runsListElement.innerHTML = `
                <div class="report-no-runs">
                    <span class="svg-icon" data-icon="error"></span>
                    <span>${error.message}</span>
                </div>
            `;
        }
    }

    renderReportRuns(runs) {
        const runsListElement = document.getElementById('report-runs-list');
        
        runsListElement.innerHTML = runs.map(run => `
            <div class="report-run-item ${run.available ? '' : 'unavailable'}" 
                 data-index="${run.index}" 
                 data-path="${run.reportPath || ''}"
                 data-available="${run.available}">
                <div class="report-run-left">
                    <div class="report-run-index">${run.index}</div>
                    <div class="report-run-info">
                        <div class="report-run-time">${run.timestamp}${run.isLatest ? `<span class="report-latest-badge">${window.i18n.t('reportModal.latest')}</span>` : ''}</div>
                    </div>
                </div>
                <div class="report-run-right">
                    <div class="report-run-status ${run.available ? 'available' : 'unavailable'}">
                        <span class="svg-icon" data-icon="${run.available ? 'check_circle' : 'cancel'}"></span>
                        <span>${run.available ? window.i18n.t('reportModal.reportAvailable') : window.i18n.t('reportModal.reportUnavailable')}</span>
                    </div>
                </div>
            </div>
        `).join('');
        
        // 初始化模态框内的SVG图标
        const modalOverlay = document.getElementById('report-modal-overlay');
        const iconElements = modalOverlay.querySelectorAll('.svg-icon[data-icon]');
        iconElements.forEach(element => {
            const iconName = element.getAttribute('data-icon');
            if (window.Icons && window.Icons[iconName]) {
                element.innerHTML = window.Icons[iconName];
            }
        });
        
        const runItems = runsListElement.querySelectorAll('.report-run-item');
        runItems.forEach(item => {
            item.addEventListener('click', () => {
                const isAvailable = item.dataset.available === 'true';
                if (!isAvailable) return;
                
                runItems.forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
                
                this.selectedReportRun = {
                    index: parseInt(item.dataset.index),
                    path: item.dataset.path,
                    available: isAvailable
                };
                
                document.getElementById('report-modal-open-btn').disabled = false;
            });
        });
    }

    async openSelectedReport() {
        if (!this.selectedReportRun || !this.selectedReportRun.path) {
            this.appendOutput('>>> ' + window.i18n.t('reportModal.selectReport'));
            return;
        }
        
        const openBtn = document.getElementById('report-modal-open-btn');
        const cancelBtn = document.getElementById('report-modal-cancel-btn');
        const closeBtn = document.getElementById('report-modal-close-btn');
        
        // 设置加载状态
        openBtn.disabled = true;
        openBtn.classList.add('loading');
        openBtn.innerHTML = `<span class="btn-spinner"></span>`;
        cancelBtn.disabled = true;
        closeBtn.disabled = true;
        
        const selectedPlan = this.getSelectedTestPlan();
        this.appendOutput(`>>> 正在打开测试计划 '${selectedPlan.name}' 第 ${this.selectedReportRun.index} 次运行的报告...`);
        
        try {
            const result = await window.electronAPI.openReportByPath(this.selectedReportRun.path);
            
            if (result.success) {
                this.appendOutput(`>>> ${result.message}`);
                this.hideReportModal();
            } else {
                this.appendOutput(`>>> 打开报告失败: ${result.error}`);
                this.resetReportModalButtons();
            }
        } catch (error) {
            console.error('打开报告失败:', error);
            this.appendOutput(`>>> 打开报告失败: ${error.message}`);
            this.resetReportModalButtons();
        }
    }

    resetReportModalButtons() {
        const openBtn = document.getElementById('report-modal-open-btn');
        const cancelBtn = document.getElementById('report-modal-cancel-btn');
        const closeBtn = document.getElementById('report-modal-close-btn');
        
        openBtn.classList.remove('loading');
        openBtn.textContent = window.i18n.t('reportModal.openReport');
        openBtn.disabled = this.selectedReportRun ? false : true;
        cancelBtn.disabled = false;
        closeBtn.disabled = false;
    }

    hideReportModal() {
        this.modals.report.close();
        this.selectedReportRun = null;
        
        // 重置按钮状态
        const openBtn = document.getElementById('report-modal-open-btn');
        const cancelBtn = document.getElementById('report-modal-cancel-btn');
        const closeBtn = document.getElementById('report-modal-close-btn');
        
        openBtn.classList.remove('loading');
        openBtn.textContent = window.i18n.t('reportModal.openReport');
        openBtn.disabled = true;
        cancelBtn.disabled = false;
        closeBtn.disabled = false;
    }

    initReportModalEvents() {
        const modalOverlay = document.getElementById('report-modal-overlay');
        const closeBtn = document.getElementById('report-modal-close-btn');
        const cancelBtn = document.getElementById('report-modal-cancel-btn');
        const openBtn = document.getElementById('report-modal-open-btn');
        
        closeBtn.addEventListener('click', () => this.hideReportModal());
        cancelBtn.addEventListener('click', () => this.hideReportModal());
        openBtn.addEventListener('click', () => this.openSelectedReport());
        
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                this.hideReportModal();
            }
        });
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !modalOverlay.classList.contains('hidden')) {
                this.hideReportModal();
            }
        });
    }

    getSelectedTestPlan() {
        return this.currentTestPlan;
    }

    async enableViewReportButton() {
        const viewReportBtn = document.getElementById('view-report-btn');
        const selectedPlan = this.getSelectedTestPlan();
        
        if (!selectedPlan) {
            viewReportBtn.disabled = true;
            return;
        }

        viewReportBtn.disabled = false;
    }

    showError(message) {
        this.appendError(message);
    }

    showSuccess(message) {
        this.appendOutput('✅ ' + message);
    }

    // ==================== 定时计划相关方法 ====================

    async loadScheduledPlans() {
        try {
            if (window.electronAPI && window.electronAPI.getScheduledPlans) {
                this.scheduledPlans = await window.electronAPI.getScheduledPlans();
                this.renderScheduledPlansList();
                this.updateScheduledPlanButtons();
            }
        } catch (error) {
            console.error('加载定时计划失败:', error);
        }
    }

    renderScheduledPlansList() {
        const container = document.getElementById('scheduled-plans-list');
        const section = document.getElementById('scheduled-plan-section');
        
        container.innerHTML = '';

        if (!this.scheduledPlans || this.scheduledPlans.length === 0) {
            container.innerHTML = `
                <div class="placeholder-message">
                    ${this.getIconHtml('info')}
                    <span data-i18n="testExecution.noScheduledPlans">${window.i18n.t('testExecution.noScheduledPlans')}</span>
                </div>
            `;
            section.classList.remove('hidden');
            return;
        }

        section.classList.remove('hidden');

        const fragment = document.createDocumentFragment();
        this.scheduledPlans.forEach(plan => {
            const planElement = document.createElement('div');
            planElement.className = 'scheduled-plan-item';
            planElement.setAttribute('data-plan-id', plan.id);
            if (this.currentScheduledPlan && this.currentScheduledPlan.id === plan.id) {
                planElement.classList.add('selected');
            }

            const scheduledTime = new Date(plan.scheduledTime);
            const formattedTime = this.formatDateTime(scheduledTime);
            const status = this.getScheduledPlanStatus(plan);
            const planNames = plan.testPlanNames ? plan.testPlanNames.join(', ') : window.i18n.t('testExecution.noTestPlans');

            planElement.innerHTML = `
                ${this.getIconHtml('schedule')}
                <div class="test-plan-content">
                    <div class="test-plan-header">
                        <div style="font-weight: 500;">${plan.name}</div>
                    </div>
                    <div style="font-size: 12px; color: var(--text-secondary);">${planNames}</div>
                    <div class="test-plan-meta">
                        <span class="scheduled-time"><span>${formattedTime}</span></span>
                        <span class="scheduled-status ${status.class}">${status.text}</span>
                    </div>
                </div>
            `;

            planElement.addEventListener('click', () => {
                this.selectScheduledPlan(plan, planElement);
            });

            fragment.appendChild(planElement);
        });
        container.appendChild(fragment);
    }

    formatDateTime(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}`;
    }

    getScheduledPlanStatus(plan) {
        const now = new Date();
        const scheduledTime = new Date(plan.scheduledTime);

        if (plan.status === 'completed') {
            return {
                class: 'completed',
                text: window.i18n.t('scheduledPlan.statusCompleted') || '已完成'
            };
        } else if (plan.status === 'running') {
            return {
                class: 'running',
                text: window.i18n.t('scheduledPlan.statusRunning') || '执行中'
            };
        } else if (plan.status === 'cancelled') {
            return {
                class: 'cancelled',
                text: window.i18n.t('scheduledPlan.statusCancelled') || '已取消'
            };
        } else if (plan.status === 'expired') {
            return {
                class: 'expired',
                text: window.i18n.t('scheduledPlan.statusExpired') || '已过期'
            };
        } else if (scheduledTime <= now) {
            return {
                class: 'overdue',
                text: window.i18n.t('scheduledPlan.statusOverdue') || '已过期'
            };
        } else {
            return {
                class: 'pending',
                text: window.i18n.t('scheduledPlan.statusPending') || '待执行'
            };
        }
    }

    selectScheduledPlan(plan, element) {
        if (this.currentScheduledPlan && this.currentScheduledPlan.id === plan.id) {
            element.classList.remove('selected');
            this.currentScheduledPlan = null;
        } else {
            // 取消测试计划子项的选中状态
            if (this.currentTestPlan) {
                document.querySelectorAll('.test-plan-item.selected').forEach(item => {
                    item.classList.remove('selected');
                });
                this.currentTestPlan = null;
                this.updatePlanButtons();
                this.updateRunButtonState();
            }
            
            document.querySelectorAll('.scheduled-plan-item.selected').forEach(item => {
                item.classList.remove('selected');
            });
            element.classList.add('selected');
            this.currentScheduledPlan = plan;
        }

        this.updateScheduledPlanButtons();
        
        if (this.currentScheduledPlan) {
            this.enableViewReportButton();
        }
    }

    updateScheduledPlanButtons() {
        const editBtn = document.getElementById('edit-scheduled-plan-btn');
        const deleteBtn = document.getElementById('delete-scheduled-plan-btn');
        const hasSelected = !!this.currentScheduledPlan;

        // 判断是否应该禁用编辑和删除按钮
        let shouldDisable = !hasSelected;
        
        // 如果测试正在运行，且选中的是正在执行的定时计划，则禁用编辑和删除按钮
        if (this.isRunning && hasSelected && this.runningScheduledPlanId && 
            this.currentScheduledPlan.id === this.runningScheduledPlanId) {
            shouldDisable = true;
        }

        if (editBtn) editBtn.disabled = shouldDisable;
        if (deleteBtn) deleteBtn.disabled = shouldDisable;
    }

    async showNewScheduledPlanModal() {
        const modalTitle = document.getElementById('scheduled-plan-modal-title');
        const nameInput = document.getElementById('scheduled-plan-name');
        const timeInput = document.getElementById('scheduled-plan-time');

        modalTitle.textContent = window.i18n.t('scheduledPlan.newTitle') || '新建定时计划';
        nameInput.value = '';

        this.initDateTimePicker(timeInput);
        timeInput.value = '';

        await this.loadTestPlansForScheduledModal();

        document.getElementById('save-scheduled-plan-btn').classList.remove('hidden');
        document.getElementById('update-scheduled-plan-btn').classList.add('hidden');

        this.modals.scheduledPlan.open();
    }

    initDateTimePicker(inputElement) {
        if (!inputElement) return;

        if (!this.dateTimePickerOverlay) {
            this.createDateTimePickerOverlay();
        }

        inputElement.addEventListener('click', () => {
            this.showDateTimePicker(inputElement);
        });

        const icon = inputElement.parentElement.querySelector('.datetime-picker-icon');
        if (icon) {
            icon.style.pointerEvents = 'auto';
            icon.style.cursor = 'pointer';
            icon.addEventListener('click', () => {
                this.showDateTimePicker(inputElement);
            });
        }
    }

    createDateTimePickerOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'datetime-picker-overlay';
        overlay.className = 'datetime-picker-overlay hidden';
        overlay.innerHTML = `
            <div class="datetime-picker-panel">
                <div class="datetime-picker-header">
                    <button type="button" class="datetime-picker-nav prev-month" data-action="prev-month">
                        <span class="svg-icon" data-icon="keyboard_arrow_left"></span>
                    </button>
                    <div class="datetime-picker-title">
                        <span class="picker-year"></span>
                        <span class="picker-month"></span>
                    </div>
                    <button type="button" class="datetime-picker-nav next-month" data-action="next-month">
                        <span class="svg-icon" data-icon="keyboard_arrow_right"></span>
                    </button>
                </div>
                <div class="datetime-picker-body">
                    <div class="datetime-picker-weekdays">
                        <span>${window.i18n.t('datetime.sun') || '日'}</span>
                        <span>${window.i18n.t('datetime.mon') || '一'}</span>
                        <span>${window.i18n.t('datetime.tue') || '二'}</span>
                        <span>${window.i18n.t('datetime.wed') || '三'}</span>
                        <span>${window.i18n.t('datetime.thu') || '四'}</span>
                        <span>${window.i18n.t('datetime.fri') || '五'}</span>
                        <span>${window.i18n.t('datetime.sat') || '六'}</span>
                    </div>
                    <div class="datetime-picker-days"></div>
                </div>
                <div class="datetime-picker-time">
                    <div class="time-input-group">
                        <label>${window.i18n.t('datetime.hour') || '时'}</label>
                        <input type="number" class="time-input hour-input" min="0" max="23" value="00">
                    </div>
                    <span class="time-separator">:</span>
                    <div class="time-input-group">
                        <label>${window.i18n.t('datetime.minute') || '分'}</label>
                        <input type="number" class="time-input minute-input" min="0" max="59" value="00">
                    </div>
                </div>
                <div class="datetime-picker-footer">
                    <button type="button" class="datetime-picker-btn cancel-btn">${window.i18n.t('modal.cancel') || '取消'}</button>
                    <button type="button" class="datetime-picker-btn confirm-btn">${window.i18n.t('modal.confirm') || '确定'}</button>
                </div>
            </div>
        `;
        const modalOverlay = document.getElementById('scheduled-plan-modal-overlay');
        if (modalOverlay) {
            modalOverlay.appendChild(overlay);
        } else {
            document.body.appendChild(overlay);
        }
        this.dateTimePickerOverlay = overlay;

        overlay.querySelector('.prev-month').addEventListener('click', () => this.navigatePicker('month', -1));
        overlay.querySelector('.next-month').addEventListener('click', () => this.navigatePicker('month', 1));
        overlay.querySelector('.cancel-btn').addEventListener('click', () => this.hideDateTimePicker());
        overlay.querySelector('.confirm-btn').addEventListener('click', () => this.confirmDateTimePicker());

        const hourInput = overlay.querySelector('.hour-input');
        const minuteInput = overlay.querySelector('.minute-input');

        hourInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/[^0-9]/g, '');
            if (value.length > 2) {
                value = value.slice(0, 2);
            }
            const numValue = parseInt(value) || 0;
            if (numValue > 23) {
                value = '23';
            }
            e.target.value = value;
        });

        hourInput.addEventListener('blur', (e) => {
            let value = e.target.value;
            const numValue = parseInt(value) || 0;
            if (numValue < 0 || isNaN(numValue)) {
                value = '00';
            } else if (numValue > 23) {
                value = '23';
            } else {
                value = String(numValue).padStart(2, '0');
            }
            e.target.value = value;
        });

        minuteInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/[^0-9]/g, '');
            if (value.length > 2) {
                value = value.slice(0, 2);
            }
            const numValue = parseInt(value) || 0;
            if (numValue > 59) {
                value = '59';
            }
            e.target.value = value;
        });

        minuteInput.addEventListener('blur', (e) => {
            let value = e.target.value;
            const numValue = parseInt(value) || 0;
            if (numValue < 0 || isNaN(numValue)) {
                value = '00';
            } else if (numValue > 59) {
                value = '59';
            } else {
                value = String(numValue).padStart(2, '0');
            }
            e.target.value = value;
        });

        this.initializeDateTimePickerIcons(overlay);
    }

    initializeDateTimePickerIcons(overlay) {
        if (typeof window.Icons === 'undefined') return;
        
        const iconElements = overlay.querySelectorAll('.svg-icon[data-icon]');
        iconElements.forEach(element => {
            const iconName = element.getAttribute('data-icon');
            if (window.Icons[iconName]) {
                element.innerHTML = window.Icons[iconName];
            }
        });
        
        const navButtons = overlay.querySelectorAll('.datetime-picker-nav');
        navButtons.forEach(button => {
            const iconSpan = button.querySelector('.svg-icon');
            if (iconSpan && !iconSpan.innerHTML.trim()) {
                const iconName = iconSpan.getAttribute('data-icon');
                if (window.Icons[iconName]) {
                    iconSpan.innerHTML = window.Icons[iconName];
                    iconSpan.style.display = 'flex';
                    iconSpan.style.alignItems = 'center';
                    iconSpan.style.justifyContent = 'center';
                }
            }
        });
    }

    showDateTimePicker(inputElement) {
        this.dateTimePickerInput = inputElement;
        const overlay = this.dateTimePickerOverlay;

        const now = new Date();
        let initialDate = now;

        if (inputElement.value) {
            const parsed = this.parseDateTimeString(inputElement.value);
            if (parsed) {
                initialDate = parsed;
            }
        }

        this.pickerCurrentDate = initialDate;
        
        if (inputElement.value) {
            const parsed = this.parseDateTimeString(inputElement.value);
            if (parsed) {
                this.pickerSelectedDate = parsed;
            } else {
                this.pickerSelectedDate = null;
            }
        } else {
            this.pickerSelectedDate = null;
        }
        
        this.pickerMinDate = new Date(now.getTime() + 60000);
        this.pickerMaxDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        this.renderDatePicker();

        overlay.classList.remove('hidden');
    }

    hideDateTimePicker() {
        if (this.dateTimePickerOverlay) {
            this.dateTimePickerOverlay.classList.add('hidden');
        }
    }

    navigatePicker(unit, direction) {
        if (unit === 'year') {
            this.pickerCurrentDate.setFullYear(this.pickerCurrentDate.getFullYear() + direction);
        } else if (unit === 'month') {
            this.pickerCurrentDate.setMonth(this.pickerCurrentDate.getMonth() + direction);
        }
        this.renderDatePicker();
    }

    renderDatePicker() {
        const overlay = this.dateTimePickerOverlay;
        const year = this.pickerCurrentDate.getFullYear();
        const month = this.pickerCurrentDate.getMonth();

        overlay.querySelector('.picker-year').textContent = year + window.i18n.t('datetime.year') || '年';
        overlay.querySelector('.picker-month').textContent = (month + 1) + window.i18n.t('datetime.month') || '月';

        const daysContainer = overlay.querySelector('.datetime-picker-days');
        daysContainer.innerHTML = '';

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startDayOfWeek = firstDay.getDay();
        const totalDays = lastDay.getDate();

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let i = 0; i < startDayOfWeek; i++) {
            const emptyDay = document.createElement('div');
            emptyDay.className = 'datetime-picker-day empty';
            daysContainer.appendChild(emptyDay);
        }

        for (let day = 1; day <= totalDays; day++) {
            const dayElement = document.createElement('div');
            dayElement.className = 'datetime-picker-day';
            dayElement.textContent = day;

            const currentDate = new Date(year, month, day);
            currentDate.setHours(0, 0, 0, 0);

            if (currentDate.getTime() === today.getTime()) {
                dayElement.classList.add('today');
            }

            if (this.pickerSelectedDate && 
                this.pickerSelectedDate.getFullYear() === year &&
                this.pickerSelectedDate.getMonth() === month &&
                this.pickerSelectedDate.getDate() === day) {
                dayElement.classList.add('selected');
            }

            const minDateCompare = new Date(this.pickerMinDate);
            minDateCompare.setHours(0, 0, 0, 0);
            const maxDateCompare = new Date(this.pickerMaxDate);
            maxDateCompare.setHours(0, 0, 0, 0);

            if (currentDate.getTime() < minDateCompare.getTime() || currentDate.getTime() > maxDateCompare.getTime()) {
                dayElement.classList.add('disabled');
            } else {
                dayElement.addEventListener('click', () => {
                    this.selectDate(year, month, day);
                });
            }

            daysContainer.appendChild(dayElement);
        }

        const hourInput = overlay.querySelector('.hour-input');
        const minuteInput = overlay.querySelector('.minute-input');
        if (this.pickerSelectedDate) {
            hourInput.value = String(this.pickerSelectedDate.getHours()).padStart(2, '0');
            minuteInput.value = String(this.pickerSelectedDate.getMinutes()).padStart(2, '0');
        } else {
            const now = new Date();
            hourInput.value = String(now.getHours()).padStart(2, '0');
            minuteInput.value = String(now.getMinutes()).padStart(2, '0');
        }
    }

    selectDate(year, month, day) {
        const overlay = this.dateTimePickerOverlay;
        const hourInput = overlay.querySelector('.hour-input');
        const minuteInput = overlay.querySelector('.minute-input');
        
        const currentHour = parseInt(hourInput.value) || 0;
        const currentMinute = parseInt(minuteInput.value) || 0;
        
        this.pickerSelectedDate = new Date(year, month, day);
        this.pickerSelectedDate.setHours(currentHour, currentMinute, 0, 0);
        
        this.renderDatePicker();
    }

    confirmDateTimePicker() {
        if (!this.pickerSelectedDate) {
            this.pickerSelectedDate = new Date(this.pickerCurrentDate);
        }

        const overlay = this.dateTimePickerOverlay;
        const hour = parseInt(overlay.querySelector('.hour-input').value) || 0;
        const minute = parseInt(overlay.querySelector('.minute-input').value) || 0;

        this.pickerSelectedDate.setHours(hour, minute, 0, 0);

        const now = new Date();
        now.setSeconds(0, 0);
        const selectedTime = new Date(this.pickerSelectedDate);
        selectedTime.setSeconds(0, 0);
        
        if (selectedTime <= now) {
            Toast.error(window.i18n.t('scheduledPlan.timeMustBeFuture') || '执行时间必须晚于当前时间');
            return;
        }

        if (this.dateTimePickerInput) {
            this.dateTimePickerInput.value = this.formatDateTime(this.pickerSelectedDate);
            this.dateTimePickerInput.dataset.iso = this.pickerSelectedDate.toISOString();
        }

        this.hideDateTimePicker();
    }

    parseDateTimeString(str) {
        const match = str.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
        if (match) {
            return new Date(
                parseInt(match[1]),
                parseInt(match[2]) - 1,
                parseInt(match[3]),
                parseInt(match[4]),
                parseInt(match[5])
            );
        }
        return null;
    }

    async loadTestPlansForScheduledModal(selectedPlanIds = []) {
        const container = document.getElementById('scheduled-test-plans-list');
        container.innerHTML = '';

        if (!this.testPlans || this.testPlans.length === 0) {
            container.innerHTML = `
                <div class="placeholder-message">
                    ${this.getIconHtml('info')}
                    <span data-i18n="testExecution.noTestPlans">${window.i18n.t('testExecution.noTestPlans')}</span>
                </div>
            `;
            return;
        }

        const fragment = document.createDocumentFragment();
        this.testPlans.forEach(plan => {
            const isSelected = selectedPlanIds.includes(plan.id);
            const planElement = document.createElement('div');
            planElement.className = 'checkbox-item scheduled-plan-checkbox';
            planElement.innerHTML = `
                <input type="checkbox" id="scheduled-plan-${plan.id}" value="${plan.id}" ${isSelected ? 'checked' : ''}>
                <label for="scheduled-plan-${plan.id}">${plan.name}</label>
            `;
            fragment.appendChild(planElement);
        });
        container.appendChild(fragment);
    }

    getSelectedTestPlansFromModal() {
        const selectedPlans = [];
        const checkboxes = document.querySelectorAll('#scheduled-test-plans-list input[type="checkbox"]:checked');
        checkboxes.forEach(checkbox => {
            const plan = this.testPlans.find(p => p.id === checkbox.value);
            if (plan) {
                selectedPlans.push({
                    id: plan.id,
                    name: plan.name
                });
            }
        });
        return selectedPlans;
    }

    hideScheduledPlanModal() {
        this.modals.scheduledPlan.close();
    }

    editScheduledPlan() {
        if (!this.currentScheduledPlan) {
            this.showError(window.i18n.t('testExecution.selectScheduledPlanFirst') || '请先选择一个定时计划');
            return;
        }
        this.showEditScheduledPlanModal(this.currentScheduledPlan);
    }

    async showEditScheduledPlanModal(plan) {
        const modalTitle = document.getElementById('scheduled-plan-modal-title');
        const nameInput = document.getElementById('scheduled-plan-name');
        const timeInput = document.getElementById('scheduled-plan-time');

        modalTitle.textContent = window.i18n.t('scheduledPlan.editTitle') || '编辑定时计划';
        nameInput.value = plan.name;

        this.initDateTimePicker(timeInput);
        
        if (plan.scheduledTime) {
            const date = new Date(plan.scheduledTime);
            timeInput.value = this.formatDateTime(date);
            timeInput.dataset.iso = date.toISOString();
        }

        const selectedPlanIds = plan.testPlans ? plan.testPlans.map(p => p.id) : [];
        await this.loadTestPlansForScheduledModal(selectedPlanIds);

        document.getElementById('save-scheduled-plan-btn').classList.add('hidden');
        document.getElementById('update-scheduled-plan-btn').classList.remove('hidden');

        this.modals.scheduledPlan.open();
    }

    formatDateTimeForInput(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    async saveScheduledPlan() {
        const name = document.getElementById('scheduled-plan-name').value.trim();
        const scheduledTime = document.getElementById('scheduled-plan-time').value;
        const selectedTestPlans = this.getSelectedTestPlansFromModal();

        if (!name) {
            Toast.error(window.i18n.t('scheduledPlan.nameRequired') || '请输入计划名称');
            return;
        }

        if (!scheduledTime) {
            Toast.error(window.i18n.t('scheduledPlan.timeRequired') || '请选择执行时间');
            return;
        }

        if (selectedTestPlans.length === 0) {
            Toast.error(window.i18n.t('scheduledPlan.selectAtLeastOne') || '请至少选择一个测试计划');
            return;
        }

        const hasConflict = await this.checkTimeConflict(scheduledTime);
        if (hasConflict) {
            return;
        }

        try {
            const planData = {
                name: name,
                scheduledTime: new Date(scheduledTime).toISOString(),
                testPlans: selectedTestPlans,
                testPlanNames: selectedTestPlans.map(p => p.name),
                status: 'pending',
                created: new Date().toISOString()
            };

            const result = await window.electronAPI.saveScheduledPlan(planData);

            if (result.success) {
                this.hideScheduledPlanModal();
                await this.loadScheduledPlans();
                Toast.success(window.i18n.t('scheduledPlan.saveSuccess') || '定时计划保存成功');
            } else {
                Toast.error(window.i18n.t('scheduledPlan.saveFailed') + ': ' + result.error);
            }
        } catch (error) {
            console.error('保存定时计划失败:', error);
            Toast.error(window.i18n.t('scheduledPlan.saveFailed') + ': ' + error.message);
        }
    }

    /**
     * 检查定时计划中的所有测试计划是否包含Android用例
     * @param {Array} selectedTestPlans - 选中的测试计划数组
     * @returns {Promise<{required: boolean, cases: Array, planNames: Array}>}
     */
    async checkAndroidDeviceRequiredForScheduledPlan(selectedTestPlans) {
        if (!selectedTestPlans || selectedTestPlans.length === 0) {
            return { required: false, cases: [], planNames: [] };
        }

        const allAndroidCases = [];
        const planNames = [];

        for (const testPlan of selectedTestPlans) {
            const checkResult = await this.checkAndroidDeviceRequired(testPlan);
            if (checkResult.required) {
                allAndroidCases.push(...checkResult.cases);
                planNames.push(testPlan.name);
            }
        }

        return {
            required: allAndroidCases.length > 0,
            cases: allAndroidCases,
            planNames: planNames
        };
    }

    async updateScheduledPlan() {
        if (!this.currentScheduledPlan) {
            Toast.error(window.i18n.t('testExecution.noSelectedScheduledPlan') || '没有选中的定时计划');
            return;
        }

        const name = document.getElementById('scheduled-plan-name').value.trim();
        const scheduledTime = document.getElementById('scheduled-plan-time').value;
        const selectedTestPlans = this.getSelectedTestPlansFromModal();

        if (!name) {
            Toast.error(window.i18n.t('scheduledPlan.nameRequired') || '请输入计划名称');
            return;
        }

        if (!scheduledTime) {
            Toast.error(window.i18n.t('scheduledPlan.timeRequired') || '请选择执行时间');
            return;
        }

        if (selectedTestPlans.length === 0) {
            Toast.error(window.i18n.t('scheduledPlan.selectAtLeastOne') || '请至少选择一个测试计划');
            return;
        }

        const hasConflict = await this.checkTimeConflict(scheduledTime, this.currentScheduledPlan.id);
        if (hasConflict) {
            return;
        }

        try {
            const newScheduledTime = new Date(scheduledTime);
            const now = new Date();
            let status = this.currentScheduledPlan.status;
            
            // 如果是已完成或已过期的计划，且新时间是未来时间，将状态改回待执行
            if ((status === 'completed' || status === 'expired') && newScheduledTime > now) {
                status = 'pending';
            }
            
            const planData = {
                id: this.currentScheduledPlan.id,
                name: name,
                scheduledTime: newScheduledTime.toISOString(),
                testPlans: selectedTestPlans,
                testPlanNames: selectedTestPlans.map(p => p.name),
                status: status,
                created: this.currentScheduledPlan.created
            };

            const result = await window.electronAPI.updateScheduledPlan(planData);

            if (result.success) {
                this.hideScheduledPlanModal();
                await this.loadScheduledPlans();
                // 更新当前选中的定时计划数据
                this.currentScheduledPlan = {
                    ...this.currentScheduledPlan,
                    name: name,
                    scheduledTime: newScheduledTime.toISOString(),
                    testPlans: selectedTestPlans,
                    testPlanNames: selectedTestPlans.map(p => p.name),
                    status: status
                };
                Toast.success(window.i18n.t('scheduledPlan.updateSuccess') || '定时计划更新成功');
            } else {
                Toast.error(window.i18n.t('scheduledPlan.updateFailed') + ': ' + result.error);
            }
        } catch (error) {
            console.error('更新定时计划失败:', error);
            Toast.error(window.i18n.t('scheduledPlan.updateFailed') + ': ' + error.message);
        }
    }

    async deleteScheduledPlan() {
        if (!this.currentScheduledPlan) {
            Toast.error(window.i18n.t('testExecution.selectScheduledPlanFirst') || '请先选择一个定时计划');
            return;
        }

        const planName = this.currentScheduledPlan.name;
        const title = window.i18n.t('scheduledPlan.deleteSchedule') || '删除定时计划';
        const message = window.i18n.t('scheduledPlan.deleteConfirm', { name: planName }) || `确定要删除定时计划 "${planName}" 吗？`;

        this.showConfirmModal(title, message, async () => {
            try {
                const result = await window.electronAPI.deleteScheduledPlan(this.currentScheduledPlan.id);

                if (result.success) {
                    Toast.success(window.i18n.t('scheduledPlan.deleteSuccess') || '定时计划删除成功');
                    this.currentScheduledPlan = null;
                    await this.loadScheduledPlans();
                } else {
                    Toast.error(window.i18n.t('scheduledPlan.deleteFailed') + ': ' + result.error);
                }
            } catch (error) {
                console.error('删除定时计划失败:', error);
                Toast.error(window.i18n.t('scheduledPlan.deleteFailed') + ': ' + error.message);
            }
        });
    }

    async checkTimeConflict(scheduledTime, excludeId = null) {
        try {
            if (window.electronAPI && window.electronAPI.checkTimeConflict) {
                const result = await window.electronAPI.checkTimeConflict({
                    scheduledTime: new Date(scheduledTime).toISOString(),
                    excludeId: excludeId
                });

                if (result.hasConflict) {
                    this.showError(window.i18n.t('scheduledPlan.timeConflict') || '该时间已有其他定时计划，请选择其他时间');
                    return true;
                }
            }
            return false;
        } catch (error) {
            console.error('检查时间冲突失败:', error);
            return false;
        }
    }

    async handleScheduledTestStart(data) {
        const message = window.i18n.t('scheduledPlan.testStarting', { name: data.planName }) || `定时计划 "${data.planName}" 开始执行...`;
        this.appendOutput(`\n>>> ${message}`);
        
        // 重新加载定时计划列表，显示"执行中"状态
        await this.loadScheduledPlans();
        
        try {
            const testPlans = await window.electronAPI.getTestPlans();
            
            if (!data.testPlans || data.testPlans.length === 0) {
                this.appendError('>>> 定时计划没有关联的测试计划');
                return;
            }
            
            for (const testPlanObj of data.testPlans) {
                const testPlanId = testPlanObj.id;
                const testPlan = testPlans.find(p => p.id === testPlanId);
                
                if (!testPlan) {
                    this.appendError(`>>> 测试计划 ${testPlanId} 不存在`);
                    continue;
                }
                
                this.appendOutput(`>>> 正在执行测试计划: ${testPlan.name}`);
                
                this.currentTestPlan = testPlan;
                
                if (testPlan.testFiles && testPlan.testFiles.length > 0) {
                    this.selectTestPlanDirectory(testPlan.testFiles);
                    
                    const testFiles = await window.electronAPI.scanTestFiles(this.selectedDirectory);
                    this.displayTestFiles(testFiles);
                    
                    await new Promise(resolve => setTimeout(resolve, 200));
                    
                    this.selectTestPlanTypes(testPlan.testTypes || []);
                    this.selectTestPlanFiles(testPlan.testFiles);
                    
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                
                const scheduledPlanInfo = {
                    planId: data.planId,
                    name: data.planName,
                    executionTime: data.executionTime || new Date().toLocaleString()
                };
                
                await this.runTests(scheduledPlanInfo);
            }
            
        } catch (error) {
            console.error('执行定时计划失败:', error);
            this.appendError('>>> 执行定时计划失败: ' + error.message);
        } finally {
            // 通知主进程测试执行完成，更新定时计划状态
            if (data.planId) {
                await window.electronAPI.scheduledTestComplete(data.planId);
            }
            
            // 执行完成后重新加载定时计划列表，显示"已完成"状态
            this.loadScheduledPlans();
        }
    }

    handleScheduledPlanExpired(data) {
        this.loadScheduledPlans();
        Toast.warning(
            window.i18n.t('scheduledPlan.expiredNotification', { name: data.planName })
        );
    }

    // ===== 页面封装功能 =====

    async initPagePackage() {
        if (this.ppInitialized) return;
        this.ppInitialized = true;
        await this.ppLoadApps();
        this.ppInitCascadeSelects();
        this.ppInitModals();
        this.ppInitTabs();
    }

    ppInitTabs() {
        const tabs = document.querySelectorAll('.pp-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetTab = tab.dataset.tab;
                
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                document.querySelectorAll('.pp-content').forEach(content => {
                    content.classList.remove('active');
                });
                
                const targetContent = document.getElementById(`pp-${targetTab}-content`);
                if (targetContent) {
                    targetContent.classList.add('active');
                }
            });
        });
    }

    async ppLoadApps() {
        try {
            const result = await window.electronAPI.pagePackage.getApps();
            if (result.success) {
                this.ppApps = result.data;
                this.ppRenderAppOptions();
                this.ppUpdateBadge('app', this.ppApps.length);
            }
        } catch (error) {
            console.error('加载应用列表失败:', error);
        }
    }

    ppInitCascadeSelects() {
        const appWrapper = document.getElementById('pp-app-select-wrapper');
        if (appWrapper) {
            this.ppInitCascadeSelect(appWrapper, 'app');
        }
        
        const pageWrapper = document.getElementById('pp-page-select-wrapper');
        if (pageWrapper) {
            this.ppInitCascadeSelect(pageWrapper, 'page');
        }
        
        const elementWrapper = document.getElementById('pp-element-select-wrapper');
        if (elementWrapper) {
            this.ppInitCascadeSelect(elementWrapper, 'element');
        }
    }

    ppInitCascadeSelect(wrapper, type) {
        const select = wrapper.querySelector('.cascade-select');
        const selected = wrapper.querySelector('.cascade-select__selected');
        const searchInput = wrapper.querySelector('.cascade-select__search');
        const addBtn = wrapper.querySelector('.cascade-select__btn.add');
        const editBtn = wrapper.querySelector('.cascade-select__btn.edit');
        const deleteBtn = wrapper.querySelector('.cascade-select__btn.delete');
        const card = wrapper.closest('.pp-card');
        
        selected.addEventListener('click', (e) => {
            if (select.classList.contains('disabled')) return;
            const isOpen = select.classList.toggle('open');
            if (card) {
                card.classList.toggle('dropdown-open', isOpen);
            }
            document.querySelectorAll('.cascade-select.open').forEach(s => {
                if (s !== select) {
                    s.classList.remove('open');
                    const otherCard = s.closest('.pp-card');
                    if (otherCard) otherCard.classList.remove('dropdown-open');
                }
            });
        });
        
        searchInput.addEventListener('input', (e) => {
            const keyword = e.target.value.toLowerCase();
            this.ppFilterOptions(type, keyword);
        });
        
        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.ppShowAddModal(type);
        });
        
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.ppShowEditModal(type);
        });
        
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.ppConfirmDelete(type);
        });
        
        document.addEventListener('click', (e) => {
            if (!wrapper.contains(e.target)) {
                select.classList.remove('open');
                if (card) card.classList.remove('dropdown-open');
            }
        });
    }

    ppRenderAppOptions() {
        const wrapper = document.getElementById('pp-app-select-wrapper');
        const optionsContainer = wrapper.querySelector('.cascade-select__options');
        
        if (this.ppApps.length === 0) {
            optionsContainer.innerHTML = `<div class="cascade-select__option empty">${window.i18n.t('pagePackage.noApps')}</div>`;
            return;
        }
        
        optionsContainer.innerHTML = this.ppApps.map(app => `
            <div class="cascade-select__option" data-id="${app.id}">${app.name}</div>
        `).join('');
        
        optionsContainer.querySelectorAll('.cascade-select__option:not(.empty)').forEach(option => {
            option.addEventListener('click', () => {
                this.ppSelectApp(option.dataset.id);
            });
        });
        
        this.ppUpdateButtonStates('app');
    }

    async ppSelectApp(appId) {
        const app = this.ppApps.find(a => a.id === appId);
        if (!app) return;
        
        this.ppSelectedApp = app;
        
        const wrapper = document.getElementById('pp-app-select-wrapper');
        const textSpan = wrapper.querySelector('.cascade-select__text');
        textSpan.textContent = app.name;
        textSpan.classList.remove('placeholder');
        
        wrapper.querySelectorAll('.cascade-select__option').forEach(opt => {
            opt.classList.toggle('selected', opt.dataset.id === appId);
        });
        
        wrapper.querySelector('.cascade-select').classList.remove('open');
        
        // 设置应用卡片为选中状态
        document.getElementById('pp-app-card').classList.add('selected');
        
        // 重置页面和元素选择
        this.ppSelectedPage = null;
        this.ppSelectedElement = null;
        this.ppResetPageSelect();
        this.ppResetElementSelect();
        
        // 加载该应用下的页面
        await this.ppLoadPages(appId);
        
        // 展开页面卡片
        this.ppExpandCard('page');
        
        this.ppUpdateButtonStates('app');
    }

    async ppLoadPages(appId) {
        if (!appId) {
            this.ppPages = [];
            this.ppRenderPageOptions();
            this.ppUpdateBadge('page', 0);
            return;
        }
        
        try {
            const result = await window.electronAPI.pagePackage.getPages(appId);
            if (result.success) {
                this.ppPages = result.data || [];
                this.ppRenderPageOptions();
                this.ppUpdateBadge('page', this.ppPages.length);
            }
        } catch (error) {
            console.error('加载页面列表失败:', error);
            this.ppPages = [];
            this.ppRenderPageOptions();
        }
    }

    ppRenderPageOptions() {
        const wrapper = document.getElementById('pp-page-select-wrapper');
        const select = wrapper.querySelector('.cascade-select');
        const optionsContainer = wrapper.querySelector('.cascade-select__options');
        
        if (this.ppSelectedApp) {
            select.classList.remove('disabled');
        } else {
            select.classList.add('disabled');
        }
        
        if (this.ppPages.length === 0) {
            optionsContainer.innerHTML = `<div class="cascade-select__option empty">${window.i18n.t('pagePackage.noPages')}</div>`;
            return;
        }
        
        optionsContainer.innerHTML = this.ppPages.map(page => `
            <div class="cascade-select__option" data-id="${page.id}">${page.name}</div>
        `).join('');
        
        optionsContainer.querySelectorAll('.cascade-select__option:not(.empty)').forEach(option => {
            option.addEventListener('click', () => {
                this.ppSelectPage(option.dataset.id);
            });
        });
        
        this.ppUpdateButtonStates('page');
    }

    async ppSelectPage(pageId) {
        const page = this.ppPages.find(p => p.id === pageId);
        if (!page) return;
        
        this.ppSelectedPage = page;
        
        const wrapper = document.getElementById('pp-page-select-wrapper');
        const textSpan = wrapper.querySelector('.cascade-select__text');
        textSpan.textContent = page.name;
        textSpan.classList.remove('placeholder');
        
        wrapper.querySelectorAll('.cascade-select__option').forEach(opt => {
            opt.classList.toggle('selected', opt.dataset.id === pageId);
        });
        
        wrapper.querySelector('.cascade-select').classList.remove('open');
        
        // 设置页面卡片为选中状态
        document.getElementById('pp-page-card').classList.add('selected');
        
        // 重置元素选择
        this.ppSelectedElement = null;
        this.ppResetElementSelect();
        
        // 加载该页面下的元素
        await this.ppLoadElements(this.ppSelectedApp.id, pageId);
        
        // 展开元素卡片
        this.ppExpandCard('element');
        
        this.ppUpdateButtonStates('page');
    }

    async ppLoadElements(appId, pageId) {
        if (!appId || !pageId) {
            this.ppElements = [];
            this.ppRenderElementOptions();
            this.ppUpdateBadge('element', 0);
            return;
        }
        
        try {
            const result = await window.electronAPI.pagePackage.getElements(appId, pageId);
            if (result.success) {
                this.ppElements = result.data || [];
                this.ppRenderElementOptions();
                this.ppUpdateBadge('element', this.ppElements.length);
            }
        } catch (error) {
            console.error('加载元素列表失败:', error);
            this.ppElements = [];
            this.ppRenderElementOptions();
        }
    }

    ppRenderElementOptions() {
        const wrapper = document.getElementById('pp-element-select-wrapper');
        const select = wrapper.querySelector('.cascade-select');
        const optionsContainer = wrapper.querySelector('.cascade-select__options');
        
        if (this.ppSelectedPage) {
            select.classList.remove('disabled');
        } else {
            select.classList.add('disabled');
        }
        
        if (this.ppElements.length === 0) {
            optionsContainer.innerHTML = `<div class="cascade-select__option empty">${window.i18n.t('pagePackage.noElements')}</div>`;
            return;
        }
        
        optionsContainer.innerHTML = this.ppElements.map(element => `
            <div class="cascade-select__option" data-id="${element.id}">${element.name}</div>
        `).join('');
        
        optionsContainer.querySelectorAll('.cascade-select__option:not(.empty)').forEach(option => {
            option.addEventListener('click', () => {
                this.ppSelectElement(option.dataset.id);
            });
        });
        
        this.ppUpdateButtonStates('element');
    }

    ppSelectElement(elementId) {
        const element = this.ppElements.find(e => e.id === elementId);
        if (!element) return;
        
        this.ppSelectedElement = element;
        
        const wrapper = document.getElementById('pp-element-select-wrapper');
        const textSpan = wrapper.querySelector('.cascade-select__text');
        textSpan.textContent = element.name;
        textSpan.classList.remove('placeholder');
        
        wrapper.querySelectorAll('.cascade-select__option').forEach(opt => {
            opt.classList.toggle('selected', opt.dataset.id === elementId);
        });
        
        wrapper.querySelector('.cascade-select').classList.remove('open');
        
        // 设置元素卡片为选中状态
        document.getElementById('pp-element-card').classList.add('selected');

        this.ppUpdateBadge('element', this.ppElements.length);

        this.ppUpdateButtonStates('element');
    }

    ppResetAppSelect() {
        const wrapper = document.getElementById('pp-app-select-wrapper');
        const textSpan = wrapper.querySelector('.cascade-select__text');
        textSpan.textContent = window.i18n.t('pagePackage.selectApp');
        textSpan.classList.add('placeholder');
        wrapper.querySelectorAll('.cascade-select__option').forEach(opt => opt.classList.remove('selected'));
        
        // 收起所有卡片
        this.ppCollapseCard('page');
        this.ppCollapseCard('element');
        
        // 移除选中状态
        document.getElementById('pp-app-card').classList.remove('selected');
        document.getElementById('pp-page-card').classList.remove('selected');
        document.getElementById('pp-element-card').classList.remove('selected');
        
        // 更新按钮状态
        this.ppUpdateButtonStates('app');
    }

    ppResetPageSelect() {
        const wrapper = document.getElementById('pp-page-select-wrapper');
        const textSpan = wrapper.querySelector('.cascade-select__text');
        textSpan.textContent = window.i18n.t('pagePackage.selectPage');
        textSpan.classList.add('placeholder');
        wrapper.querySelector('.cascade-select').classList.add('disabled');
        wrapper.querySelectorAll('.cascade-select__option').forEach(opt => opt.classList.remove('selected'));
        
        // 收起页面和元素卡片
        this.ppCollapseCard('page');
        this.ppCollapseCard('element');
        
        // 移除选中状态
        document.getElementById('pp-page-card').classList.remove('selected');
        document.getElementById('pp-element-card').classList.remove('selected');
    }

    ppResetElementSelect() {
        const wrapper = document.getElementById('pp-element-select-wrapper');
        const textSpan = wrapper.querySelector('.cascade-select__text');
        textSpan.textContent = window.i18n.t('pagePackage.selectElement');
        textSpan.classList.add('placeholder');
        wrapper.querySelector('.cascade-select').classList.add('disabled');
        wrapper.querySelectorAll('.cascade-select__option').forEach(opt => opt.classList.remove('selected'));
        
        // 收起元素卡片
        this.ppCollapseCard('element');
        
        // 移除选中状态
        document.getElementById('pp-element-card').classList.remove('selected');
    }

    ppExpandCard(type) {
        const card = document.getElementById(`pp-${type}-card`);
        if (card) {
            card.classList.remove('collapsed');
            card.classList.add('expanded');
        }
    }

    ppCollapseCard(type) {
        const card = document.getElementById(`pp-${type}-card`);
        if (card) {
            card.classList.remove('expanded');
            card.classList.add('collapsed');
        }
    }

    ppUpdateBadge(type, count) {
        const badge = document.getElementById(`pp-${type}-badge`);
        const countSpan = document.getElementById(`pp-${type}-count`);
        if (badge && countSpan) {
            if (count > 0) {
                badge.style.display = 'block';
                countSpan.textContent = count;
            } else {
                badge.style.display = 'none';
            }
        }
    }

    ppUpdateButtonStates(type) {
        let wrapper, hasSelection;
        
        switch (type) {
            case 'app':
                wrapper = document.getElementById('pp-app-select-wrapper');
                hasSelection = !!this.ppSelectedApp;
                break;
            case 'page':
                wrapper = document.getElementById('pp-page-select-wrapper');
                hasSelection = !!this.ppSelectedPage;
                break;
            case 'element':
                wrapper = document.getElementById('pp-element-select-wrapper');
                hasSelection = !!this.ppSelectedElement;
                break;
        }
        
        if (wrapper) {
            const editBtn = wrapper.querySelector('.cascade-select__btn.edit');
            const deleteBtn = wrapper.querySelector('.cascade-select__btn.delete');
            if (editBtn) editBtn.disabled = !hasSelection;
            if (deleteBtn) deleteBtn.disabled = !hasSelection;
        }
    }

    ppFilterOptions(type, keyword) {
        let options, filtered;
        
        switch (type) {
            case 'app':
                options = this.ppApps;
                filtered = options.filter(app => app.name.toLowerCase().includes(keyword));
                this.ppRenderFilteredOptions('app', filtered);
                break;
            case 'page':
                options = this.ppPages;
                filtered = options.filter(page => page.name.toLowerCase().includes(keyword));
                this.ppRenderFilteredOptions('page', filtered);
                break;
            case 'element':
                options = this.ppElements;
                filtered = options.filter(element => 
                    element.name.toLowerCase().includes(keyword) || 
                    (element.value && element.value.toLowerCase().includes(keyword))
                );
                this.ppRenderFilteredOptions('element', filtered);
                break;
        }
    }

    ppRenderFilteredOptions(type, items) {
        const wrapperId = `pp-${type}-select-wrapper`;
        const wrapper = document.getElementById(wrapperId);
        const optionsContainer = wrapper.querySelector('.cascade-select__options');
        
        if (items.length === 0) {
            optionsContainer.innerHTML = `<div class="cascade-select__option empty">${window.i18n.t('pagePackage.noResults')}</div>`;
            return;
        }
        
        const selectedId = this.ppGetSelectedId(type);
        optionsContainer.innerHTML = items.map(item => `
            <div class="cascade-select__option ${selectedId === item.id ? 'selected' : ''}" data-id="${item.id}">${item.name}</div>
        `).join('');
        
        optionsContainer.querySelectorAll('.cascade-select__option:not(.empty)').forEach(option => {
            option.addEventListener('click', () => {
                const id = option.dataset.id;
                switch (type) {
                    case 'app': this.ppSelectApp(id); break;
                    case 'page': this.ppSelectPage(id); break;
                    case 'element': this.ppSelectElement(id); break;
                }
            });
        });
    }

    ppGetSelectedId(type) {
        switch (type) {
            case 'app': return this.ppSelectedApp?.id;
            case 'page': return this.ppSelectedPage?.id;
            case 'element': return this.ppSelectedElement?.id;
        }
    }

    // ===== 弹窗逻辑 =====

    ppInitModals() {
        this.ppInitAppModal();
        this.ppInitPageModal();
        this.ppInitElementModal();
    }

    ppInitAppModal() {
        const overlay = document.getElementById('pp-app-modal-overlay');
        if (!overlay) return;
        
        const closeBtn = overlay.querySelector('.pp-modal-close');
        const cancelBtn = overlay.querySelector('.pp-modal-cancel');
        const saveBtn = document.getElementById('pp-app-save-btn');
        
        closeBtn.addEventListener('click', () => this.ppCloseModal('app'));
        cancelBtn.addEventListener('click', () => this.ppCloseModal('app'));
        saveBtn.addEventListener('click', () => this.ppSaveApp());
        
        this.initApkDropZone();
    }

    initApkDropZone() {
        const dropZone = document.getElementById('apk-drop-zone');
        if (!dropZone) return;

        const content = dropZone.querySelector('.apk-drop-zone-content');
        const loading = document.getElementById('apk-drop-loading');
        const success = document.getElementById('apk-drop-success');
        const errorEl = document.getElementById('apk-drop-error');
        const errorMessage = document.getElementById('apk-error-message');

        const showState = (state) => {
            content.classList.toggle('hidden', state !== 'default');
            loading.classList.toggle('hidden', state !== 'loading');
            success.classList.toggle('hidden', state !== 'success');
            errorEl.classList.toggle('hidden', state !== 'error');
            dropZone.classList.remove('drag-over');
        };

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('drag-over');
        });

        dropZone.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const files = e.dataTransfer.files;
            if (files.length === 0) {
                showState('default');
                return;
            }

            const file = files[0];
            const filePath = window.electronAPI.getFilePath(file);
            
            if (!filePath.toLowerCase().endsWith('.apk')) {
                showState('error');
                if (errorMessage) {
                    errorMessage.textContent = window.i18n.t('pagePackage.apkInvalidFile');
                }
                setTimeout(() => showState('default'), 3000);
                return;
            }

            showState('loading');

            try {
                const result = await window.electronAPI.apk.parse(filePath);
                
                if (result.success && result.data) {
                    const data = result.data;
                    
                    if (data.packageName) {
                        document.getElementById('pp-package-input').value = data.packageName;
                    }
                    
                    if (data.activityName) {
                        document.getElementById('pp-activity-input').value = data.activityName;
                    }

                    const appInput = document.getElementById('pp-app-input');
                    if (appInput && !appInput.value.trim() && data.applicationLabel) {
                        appInput.value = data.applicationLabel;
                    }
                    
                    showState('success');
                    setTimeout(() => showState('default'), 2000);
                } else {
                    showState('error');
                    if (errorMessage) {
                        errorMessage.textContent = result.error || (window.i18n.t('pagePackage.apkParseFailed'));
                    }
                    setTimeout(() => showState('default'), 3000);
                }
            } catch (error) {
                console.error('APK解析错误:', error);
                showState('error');
                if (errorMessage) {
                    errorMessage.textContent = error.message || (window.i18n.t('pagePackage.apkParseFailed'));
                }
                setTimeout(() => showState('default'), 3000);
            }
        });

        dropZone.addEventListener('click', async () => {
            try {
                const result = await window.electronAPI.selectApkFile();
                if (result && result.filePaths && result.filePaths.length > 0) {
                    const filePath = result.filePaths[0];

                    showState('loading');

                    try {
                        const parseResult = await window.electronAPI.apk.parse(filePath);
                        
                        if (parseResult.success && parseResult.data) {
                            const data = parseResult.data;
                            
                            if (data.packageName) {
                                document.getElementById('pp-package-input').value = data.packageName;
                            }
                            
                            if (data.activityName) {
                                document.getElementById('pp-activity-input').value = data.activityName;
                            }

                            const appInput = document.getElementById('pp-app-input');
                            if (appInput && !appInput.value.trim() && data.applicationLabel) {
                                appInput.value = data.applicationLabel;
                            }
                            
                            showState('success');
                            setTimeout(() => showState('default'), 2000);
                        } else {
                            showState('error');
                            if (errorMessage) {
                                errorMessage.textContent = parseResult.error || (window.i18n.t('pagePackage.apkParseFailed'));
                            }
                            setTimeout(() => showState('default'), 3000);
                        }
                    } catch (parseError) {
                        console.error('APK解析错误:', parseError);
                        showState('error');
                        if (errorMessage) {
                            errorMessage.textContent = parseError.message || (window.i18n.t('pagePackage.apkParseFailed'));
                        }
                        setTimeout(() => showState('default'), 3000);
                    }
                }
            } catch (error) {
                console.error('选择文件错误:', error);
            }
        });
    }

    ppInitPageModal() {
        const overlay = document.getElementById('pp-page-modal-overlay');
        if (!overlay) return;
        
        const closeBtn = overlay.querySelector('.pp-modal-close');
        const cancelBtn = overlay.querySelector('.pp-modal-cancel');
        const saveBtn = document.getElementById('pp-page-save-btn');
        
        closeBtn.addEventListener('click', () => this.ppCloseModal('page'));
        cancelBtn.addEventListener('click', () => this.ppCloseModal('page'));
        saveBtn.addEventListener('click', () => this.ppSavePage());
    }

    ppInitElementModal() {
        const overlay = document.getElementById('pp-element-modal-overlay');
        if (!overlay) return;
        
        const closeBtn = overlay.querySelector('.pp-modal-close');
        const cancelBtn = overlay.querySelector('.pp-modal-cancel');
        const saveBtn = document.getElementById('pp-element-save-btn');
        
        closeBtn.addEventListener('click', () => this.ppCloseModal('element'));
        cancelBtn.addEventListener('click', () => this.ppCloseModal('element'));
        saveBtn.addEventListener('click', () => this.ppSaveElement());
        
        this.initializeCustomSelects();

        const inspectorBtn = document.getElementById('pp-inspector-btn');
        if (inspectorBtn) {
            inspectorBtn.addEventListener('click', () => this.ppOpenInspector());
        }
    }

    async ppOpenInspector() {
        if (!this.ppSelectedApp) {
            Toast.error(window.electronAPI.i18n.t('inspector.noAppSelected'));
            return;
        }
        const app = this.ppApps.find(a => a.id === this.ppSelectedApp.id);
        if (!app || !app.packageName || !app.activityName) {
            Toast.error(window.electronAPI.i18n.t('inspector.noAppInfo'));
            return;
        }

        this.modals.ppElement.close();
        this._ppElementModalNeedsReopen = true;

        let deviceName;
        try {
            deviceName = await this.showDeviceSelectionForInspector();
        } catch (e) {
            this._reopenElementModalIfNeeded();
            return;
        }

        const noReset = await this._showResetConfirmModal();
        await this.inspectorModal.open(deviceName, app.packageName, app.activityName, noReset);
    }

    _reopenElementModalIfNeeded() {
        if (this._ppElementModalNeedsReopen) {
            this._ppElementModalNeedsReopen = false;
            this.modals.ppElement.open();
        }
    }

    _showResetConfirmModal() {
        return new Promise((resolve) => {
            const titleElement = document.getElementById('confirm-modal-title');
            const messageElement = document.getElementById('confirm-modal-message');

            if (titleElement) {
                titleElement.textContent = window.i18n.t('inspector.resetConfirmTitle');
            }
            if (messageElement) {
                const i18n = window.i18n;
                messageElement.textContent = i18n ? i18n.t('inspector.resetConfirmQuestion') : '是否以临时无用户数据状态来启动应用？';
            }

            let resolved = false;
            const resolveOnce = (value) => {
                if (!resolved) {
                    resolved = true;
                    resolve(value);
                }
            };

            const escHandler = (e) => {
                if (e.key === 'Escape') {
                    resolveOnce(true);
                }
            };
            document.addEventListener('keydown', escHandler);

            const overlayClickHandler = (e) => {
                if (e.target === document.getElementById('confirm-modal-overlay')) {
                    resolveOnce(true);
                }
            };
            document.getElementById('confirm-modal-overlay')?.addEventListener('click', overlayClickHandler);

            const confirmBtn = document.getElementById('confirm-modal-confirm-btn');
            const cancelBtn = document.getElementById('confirm-modal-cancel-btn');

            const newConfirmBtn = confirmBtn.cloneNode(true);
            confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
            newConfirmBtn.addEventListener('click', () => {
                document.removeEventListener('keydown', escHandler);
                this.modals.confirm.close();
                resolveOnce(false);
            });

            const newCancelBtn = cancelBtn.cloneNode(true);
            cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
            newCancelBtn.addEventListener('click', () => {
                document.removeEventListener('keydown', escHandler);
                this.modals.confirm.close();
                resolveOnce(true);
            });

            this.modals.confirm.open();
        });
    }

    ppFillLocatorFromInspector(locatorType, locatorValue) {
        this.setCustomSelectValue('pp-element-locator-wrapper', locatorType);
        const valueInput = document.getElementById('pp-element-value-input');
        if (valueInput) {
            valueInput.value = locatorValue;
        }
        const nameInput = document.getElementById('pp-element-name-input');
        if (nameInput && !nameInput.value) {
            nameInput.focus();
        }
        this._reopenElementModalIfNeeded();
    }

    ppShowAddModal(type) {
        this.ppIsEditing = false;
        this.ppEditingType = type;
        
        switch (type) {
            case 'app':
                document.getElementById('pp-app-modal-title').textContent = window.i18n.t('pagePackage.newApp');
                document.getElementById('pp-app-input').value = '';
                this.initializeCustomSelects();
                this.setCustomSelectValue('pp-platform-wrapper', 'android');
                document.getElementById('pp-package-input').value = '';
                document.getElementById('pp-activity-input').value = '';
                this.modals.ppApp.open();
                document.getElementById('pp-app-input').focus();
                break;
            case 'page':
                if (!this.ppSelectedApp) {
                    Toast.warning(window.i18n.t('pagePackage.selectAppFirst'));
                    return;
                }
                document.getElementById('pp-page-modal-title').textContent = window.i18n.t('pagePackage.newPage');
                document.getElementById('pp-page-input').value = '';
                this.modals.ppPage.open();
                document.getElementById('pp-page-input').focus();
                break;
            case 'element':
                if (!this.ppSelectedPage) {
                    Toast.warning(window.i18n.t('pagePackage.selectPageFirst'));
                    return;
                }
                document.getElementById('pp-element-modal-title').textContent = window.i18n.t('pagePackage.newElement');
                document.getElementById('pp-element-name-input').value = '';
                document.getElementById('pp-element-value-input').value = '';
                this.setCustomSelectValue('pp-element-locator-wrapper', 'id');
                this.modals.ppElement.open();
                document.getElementById('pp-element-name-input').focus();
                break;
        }
    }

    ppShowEditModal(type) {
        this.ppIsEditing = true;
        this.ppEditingType = type;
        
        switch (type) {
            case 'app':
                if (!this.ppSelectedApp) return;
                document.getElementById('pp-app-modal-title').textContent = window.i18n.t('pagePackage.editApp');
                document.getElementById('pp-app-input').value = this.ppSelectedApp.name;
                this.initializeCustomSelects();
                this.setCustomSelectValue('pp-platform-wrapper', this.ppSelectedApp.platform || 'android');
                document.getElementById('pp-package-input').value = this.ppSelectedApp.packageName || '';
                document.getElementById('pp-activity-input').value = this.ppSelectedApp.activityName || '';
                this.modals.ppApp.open();
                document.getElementById('pp-app-input').focus();
                break;
            case 'page':
                if (!this.ppSelectedPage) return;
                document.getElementById('pp-page-modal-title').textContent = window.i18n.t('pagePackage.editPage');
                document.getElementById('pp-page-input').value = this.ppSelectedPage.name;
                this.modals.ppPage.open();
                document.getElementById('pp-page-input').focus();
                break;
            case 'element':
                if (!this.ppSelectedElement) return;
                document.getElementById('pp-element-modal-title').textContent = window.i18n.t('pagePackage.editElement');
                document.getElementById('pp-element-name-input').value = this.ppSelectedElement.name;
                document.getElementById('pp-element-value-input').value = this.ppSelectedElement.value;
                this.setCustomSelectValue('pp-element-locator-wrapper', this.ppSelectedElement.locator || 'id');
                this.modals.ppElement.open();
                document.getElementById('pp-element-name-input').focus();
                break;
        }
    }

    ppSetLocatorValue(locator) {
        const wrapper = document.getElementById('pp-element-locator-wrapper');
        if (!wrapper) return;

        const select = wrapper.querySelector('.custom-select');
        if (!select) return;

        let foundOption = null;

        const optionsEl = document.getElementById('pp-element-locator-wrapper-options');
        if (optionsEl) {
            optionsEl.querySelectorAll('.custom-select__option').forEach(opt => {
                if (opt.dataset.value === locator) {
                    opt.classList.add('selected');
                    foundOption = opt;
                } else {
                    opt.classList.remove('selected');
                }
            });
        }

        const selectedSpan = wrapper.querySelector('.custom-select__text');
        if (foundOption && selectedSpan) {
            const spanEl = foundOption.querySelector('span');
            selectedSpan.textContent = spanEl ? spanEl.textContent : foundOption.textContent;
        }
    }

    ppCloseModal(type) {
        const modalMap = {
            app: this.modals.ppApp,
            page: this.modals.ppPage,
            element: this.modals.ppElement
        };
        if (modalMap[type]) {
            modalMap[type].close();
        }
    }

    async ppSaveApp() {
        const name = document.getElementById('pp-app-input').value.trim();
        const platform = this.getCustomSelectValue('pp-platform-wrapper') || 'android';
        const packageName = document.getElementById('pp-package-input').value.trim();
        const activityName = document.getElementById('pp-activity-input').value.trim();
        
        if (!name) {
            Toast.error(window.i18n.t('pagePackage.nameRequired'));
            return;
        }
        
        try {
            let result;
            const appData = { name, platform, packageName, activityName };
            if (this.ppIsEditing) {
                result = await window.electronAPI.pagePackage.updateApp(this.ppSelectedApp.id, appData);
            } else {
                result = await window.electronAPI.pagePackage.addApp(appData);
            }
            
            if (result.success) {
                Toast.success(window.i18n.t('pagePackage.saveSuccess'));
                this.ppCloseModal('app');
                await this.ppLoadApps();
                if (this.ppIsEditing) {
                    this.ppSelectedApp.name = name;
                    this.ppSelectedApp.platform = platform;
                    this.ppSelectedApp.packageName = packageName;
                    this.ppSelectedApp.activityName = activityName;
                    const wrapper = document.getElementById('pp-app-select-wrapper');
                    wrapper.querySelector('.cascade-select__text').textContent = name;
                }
            } else {
                Toast.error(result.error || '保存失败');
            }
        } catch (error) {
            console.error('保存应用失败:', error);
            Toast.error('保存失败');
        }
    }

    async ppSavePage() {
        const name = document.getElementById('pp-page-input').value.trim();
        if (!name) {
            Toast.error(window.i18n.t('pagePackage.nameRequired'));
            return;
        }
        
        try {
            let result;
            if (this.ppIsEditing) {
                result = await window.electronAPI.pagePackage.updatePage(this.ppSelectedApp.id, this.ppSelectedPage.id, name);
            } else {
                result = await window.electronAPI.pagePackage.addPage(this.ppSelectedApp.id, name);
            }
            
            if (result.success) {
                Toast.success(window.i18n.t('pagePackage.saveSuccess'));
                this.ppCloseModal('page');
                await this.ppLoadPages(this.ppSelectedApp.id);
                if (this.ppIsEditing) {
                    this.ppSelectedPage.name = name;
                    const wrapper = document.getElementById('pp-page-select-wrapper');
                    wrapper.querySelector('.cascade-select__text').textContent = name;
                }
            } else {
                Toast.error(result.error || '保存失败');
            }
        } catch (error) {
            console.error('保存页面失败:', error);
            Toast.error('保存失败');
        }
    }

    async ppSaveElement() {
        const name = document.getElementById('pp-element-name-input').value.trim();
        const value = document.getElementById('pp-element-value-input').value.trim();
        const locator = this.getCustomSelectValue('pp-element-locator-wrapper') || 'id';
        
        if (!name) {
            Toast.error(window.i18n.t('pagePackage.nameRequired'));
            return;
        }
        if (!value) {
            Toast.error(window.i18n.t('pagePackage.valueRequired'));
            return;
        }
        
        const elementData = { name, locator, value };
        
        try {
            let result;
            if (this.ppIsEditing) {
                result = await window.electronAPI.pagePackage.updateElement(
                    this.ppSelectedApp.id, 
                    this.ppSelectedPage.id, 
                    this.ppSelectedElement.id, 
                    elementData
                );
            } else {
                result = await window.electronAPI.pagePackage.addElement(
                    this.ppSelectedApp.id, 
                    this.ppSelectedPage.id, 
                    elementData
                );
            }
            
            if (result.success) {
                Toast.success(window.i18n.t('pagePackage.saveSuccess'));
                this.ppCloseModal('element');
                await this.ppLoadElements(this.ppSelectedApp.id, this.ppSelectedPage.id);
                if (this.ppIsEditing) {
                    Object.assign(this.ppSelectedElement, elementData);
                    const wrapper = document.getElementById('pp-element-select-wrapper');
                    wrapper.querySelector('.cascade-select__text').textContent = name;
                }
            } else {
                Toast.error(result.error || '保存失败');
            }
        } catch (error) {
            console.error('保存元素失败:', error);
            Toast.error('保存失败');
        }
    }

    ppGetLocatorSelectValue() {
        const optionsEl = document.getElementById('pp-element-locator-wrapper-options');
        if (!optionsEl) return 'id';
        
        const selectedOption = optionsEl.querySelector('.custom-select__option.selected');
        return selectedOption ? selectedOption.dataset.value : 'id';
    }

    ppGetPlatformSelectValue() {
        const optionsEl = document.getElementById('pp-platform-wrapper-options');
        if (!optionsEl) return 'android';
        
        const selectedOption = optionsEl.querySelector('.custom-select__option.selected');
        return selectedOption ? selectedOption.dataset.value : 'android';
    }

    ppSetPlatformValue(platform) {
        const wrapper = document.getElementById('pp-platform-wrapper');
        if (!wrapper) return;
        
        const optionsEl = document.getElementById('pp-platform-wrapper-options');
        if (optionsEl) {
            optionsEl.querySelectorAll('.custom-select__option').forEach(opt => {
                opt.classList.toggle('selected', opt.dataset.value === platform);
            });
        }
        const selectedSpan = wrapper.querySelector('.custom-select__text');
        const selectedOption = optionsEl?.querySelector(`.custom-select__option[data-value="${platform}"]`);
        if (selectedOption && selectedSpan) {
            selectedSpan.textContent = selectedOption.querySelector('span').textContent;
        }
    }

    async ppConfirmDelete(type) {
        let message, itemName;
        
        switch (type) {
            case 'app':
                if (!this.ppSelectedApp) return;
                itemName = this.ppSelectedApp.name;
                message = window.i18n.t('pagePackage.deleteAppConfirm', { name: itemName });
                break;
            case 'page':
                if (!this.ppSelectedPage) return;
                itemName = this.ppSelectedPage.name;
                message = window.i18n.t('pagePackage.deletePageConfirm', { name: itemName });
                break;
            case 'element':
                if (!this.ppSelectedElement) return;
                itemName = this.ppSelectedElement.name;
                message = window.i18n.t('pagePackage.deleteElementConfirm', { name: itemName });
                break;
        }
        
        this.showConfirmModal(
            window.i18n.t('pagePackage.deleteConfirm'),
            message,
            async () => {
                await this.ppDeleteItem(type);
            }
        );
    }

    async ppDeleteItem(type) {
        try {
            let result;
            
            switch (type) {
                case 'app':
                    result = await window.electronAPI.pagePackage.deleteApp(this.ppSelectedApp.id);
                    if (result.success) {
                        this.ppSelectedApp = null;
                        this.ppSelectedPage = null;
                        this.ppSelectedElement = null;
                        await this.ppLoadApps();
                        this.ppResetAppSelect();
                        this.ppResetPageSelect();
                        this.ppResetElementSelect();
                        document.getElementById('pp-app-card').classList.remove('selected');
                    }
                    break;
                case 'page':
                    result = await window.electronAPI.pagePackage.deletePage(this.ppSelectedApp.id, this.ppSelectedPage.id);
                    if (result.success) {
                        this.ppSelectedPage = null;
                        this.ppSelectedElement = null;
                        await this.ppLoadPages(this.ppSelectedApp.id);
                        this.ppResetElementSelect();
                        document.getElementById('pp-page-card').classList.remove('selected');
                    }
                    break;
                case 'element':
                    result = await window.electronAPI.pagePackage.deleteElement(
                        this.ppSelectedApp.id, 
                        this.ppSelectedPage.id, 
                        this.ppSelectedElement.id
                    );
                    if (result.success) {
                        this.ppSelectedElement = null;
                        await this.ppLoadElements(this.ppSelectedApp.id, this.ppSelectedPage.id);
                        const elementWrapper = document.getElementById('pp-element-select-wrapper');
                        const elementTextSpan = elementWrapper.querySelector('.cascade-select__text');
                        elementTextSpan.textContent = window.i18n.t('pagePackage.selectElement');
                        elementTextSpan.classList.add('placeholder');
                        elementWrapper.querySelectorAll('.cascade-select__option').forEach(opt => opt.classList.remove('selected'));
                        document.getElementById('pp-element-card').classList.remove('selected');
                        this.ppUpdateButtonStates('element');
                    }
                    break;
            }
            
            if (result.success) {
                Toast.success(window.i18n.t('pagePackage.deleteSuccess'));
            } else {
                Toast.error(result.error || '删除失败');
            }
        } catch (error) {
            console.error('删除失败:', error);
            Toast.error('删除失败');
        }
    }

    // 页面切换时重置状态
    ppResetState() {
        this.ppSelectedApp = null;
        this.ppSelectedPage = null;
        this.ppSelectedElement = null;
        
        // 重置应用下拉框显示
        const appWrapper = document.getElementById('pp-app-select-wrapper');
        if (appWrapper) {
            const textSpan = appWrapper.querySelector('.cascade-select__text');
            textSpan.textContent = window.i18n.t('pagePackage.selectApp');
            textSpan.classList.add('placeholder');
            appWrapper.querySelectorAll('.cascade-select__option').forEach(opt => opt.classList.remove('selected'));
        }
        
        this.ppResetPageSelect();
        this.ppResetElementSelect();
        
        // 移除所有卡片选中状态
        document.getElementById('pp-app-card')?.classList.remove('selected');
        document.getElementById('pp-page-card')?.classList.remove('selected');
        document.getElementById('pp-element-card')?.classList.remove('selected');
        
        // 隐藏徽章
        this.ppUpdateBadge('app', 0);
        this.ppUpdateBadge('page', 0);
        this.ppUpdateBadge('element', 0);
    }

    // ===== 测试用例步骤管理 =====

    /**
     * 初始化测试用例编辑器
     */
    async tcInitEditor() {
        await this.tcLoadApps();
        await this.tcLoadBleDevices();
        await this.tcLoadMarkers();
        this.tcInitPlatformSelect();
        this.tcInitAppSelect();
        this.tcInitMarkersSelect();
        this.tcInitCollapsible();

        const editorForm = document.getElementById('tc-editor-form');
        if (editorForm && !editorForm._dirtyListenerAdded) {
            editorForm.addEventListener('change', (e) => {
                if (e.target.matches('input, select, textarea') && !e.target.closest('.tc-step-card')) {
                    this.tcMarkDirty();
                }
            });
            editorForm._dirtyListenerAdded = true;
        }
    }

    /**
     * 加载Markers列表
     */
    async tcLoadMarkers() {
        try {
            const markers = await window.electronAPI.getPytestMarkers();
            this.tcMarkers = markers || [];
        } catch (error) {
            console.error('加载Markers失败:', error);
            this.tcMarkers = [];
        }
    }

    /**
     * 初始化Markers下拉框
     */
    tcInitMarkersSelect() {
        const select = document.getElementById('tc-markers-select');
        if (!select) return;

        if (select.dataset.initialized === 'true') return;

        const selected = select.querySelector('.custom-select__selected');
        const options = select.querySelector('.custom-select__options');

        if (!selected || !options) return;

        document.body.appendChild(options);

        select.dataset.initialized = 'true';

        selected.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.custom-select__options.show').forEach(opt => {
                if (opt !== options) opt.classList.remove('show');
            });
            const mainContent = document.querySelector('.main-content');
            const isShowing = options.classList.contains('show');
            if (!isShowing) {
                this.positionDropdown(selected, options);
                options.classList.add('show');
                if (mainContent) {
                    mainContent.classList.add('dropdown-open');
                    mainContent.addEventListener('wheel', this.preventScroll, { passive: false });
                }
            } else {
                options.classList.remove('show');
                if (mainContent) {
                    mainContent.classList.remove('dropdown-open');
                    mainContent.removeEventListener('wheel', this.preventScroll, { passive: false });
                }
            }
        });

        this.tcRenderMarkersOptions();
    }

    /**
     * 渲染Markers选项
     */
    tcRenderMarkersOptions() {
        const optionsContainer = document.getElementById('tc-markers-options');
        if (!optionsContainer) return;

        if (this.tcMarkers.length === 0) {
            optionsContainer.innerHTML = `<div class="custom-select__option disabled"><span>${window.i18n.t('testExecution.noMarkers')}</span></div>`;
            return;
        }

        optionsContainer.innerHTML = this.tcMarkers.map(marker => `
            <div class="custom-select__option" data-value="${marker.name}" data-description="${marker.description || ''}">
                <span>${marker.name}</span>
            </div>
        `).join('');

        optionsContainer.querySelectorAll('.custom-select__option:not(.disabled)').forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const value = option.dataset.value;
                
                this.tcSelectedMarkers = this.tcSelectedMarkers || [];
                
                if (option.classList.contains('selected')) {
                    option.classList.remove('selected');
                    this.tcSelectedMarkers = this.tcSelectedMarkers.filter(m => m !== value);
                } else {
                    option.classList.add('selected');
                    this.tcSelectedMarkers.push(value);
                }

                this.tcUpdateMarkersDisplay();
            });
        });
    }

    /**
     * 更新Markers显示（徽章形式）
     */
    tcUpdateMarkersDisplay() {
        const selectedContainer = document.querySelector('#tc-markers-selected');
        if (!selectedContainer) return;

        // 清除所有现有内容（徽章和占位符）
        selectedContainer.innerHTML = '';

        if (this.tcSelectedMarkers.length === 0) {
            const placeholderSpan = document.createElement('span');
            placeholderSpan.className = 'custom-select__text';
            placeholderSpan.setAttribute('data-i18n', 'placeholders.selectMarkers');
            placeholderSpan.textContent = window.i18n.t('placeholders.selectMarkers');
            selectedContainer.appendChild(placeholderSpan);
        } else {
            this.tcSelectedMarkers.forEach(marker => {
                const badge = document.createElement('span');
                badge.className = 'marker-badge';
                badge.setAttribute('data-value', marker);
                badge.textContent = marker;
                selectedContainer.appendChild(badge);

                badge.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.tcSelectedMarkers = this.tcSelectedMarkers.filter(m => m !== marker);
                    const option = document.querySelector(`#tc-markers-options .custom-select__option[data-value="${marker}"]`);
                    if (option) option.classList.remove('selected');
                    this.tcUpdateMarkersDisplay();
                });
            });
        }
    }

    /**
     * 加载应用列表
     */
    async tcLoadApps() {
        try {
            const result = await window.electronAPI.pagePackage.getApps();
            if (result.success) {
                this.tcApps = result.data || [];
                this.tcRenderAppOptions();
            }
        } catch (error) {
            console.error('加载应用列表失败:', error);
        }
    }

    /**
     * 加载蓝牙设备列表（用于测试步骤中的蓝牙操作）
     */
    async tcLoadBleDevices() {
        try {
            const result = await window.electronAPI.bleDeviceDiscovery.getDevices();
            if (result.success) {
                this.tcBleDevices = result.data || [];
            }
        } catch (error) {
            console.error('加载蓝牙设备列表失败:', error);
        }
    }

    /**
     * 初始化应用选择下拉框
     */
    tcInitAppSelect() {
        // 使用custom-select组件，初始化在tcRenderAppOptions中完成
        const select = document.getElementById('tc-app-select');
        if (!select) return;

        // 跳过已初始化的下拉框
        if (select.dataset.initialized === 'true') return;

        const selected = select.querySelector('.custom-select__selected');
        const options = select.querySelector('.custom-select__options');

        if (!selected || !options) return;

        // 将下拉框选项移到 body 下
        document.body.appendChild(options);

        select.dataset.initialized = 'true';

        // 点击选中区域切换下拉框显示/隐藏
        selected.addEventListener('click', (e) => {
            e.stopPropagation();
            // 关闭其他下拉框
            document.querySelectorAll('.custom-select__options.show').forEach(opt => {
                if (opt !== options) {
                    opt.classList.remove('show');
                }
            });

            const mainContent = document.querySelector('.main-content');
            const isShowing = options.classList.contains('show');
            if (!isShowing) {
                this.positionDropdown(selected, options);
                options.classList.add('show');
                // 禁止页面滚动
                if (mainContent) {
                    mainContent.classList.add('dropdown-open');
                    mainContent.addEventListener('wheel', this.preventScroll, { passive: false });
                }
            } else {
                options.classList.remove('show');
                // 恢复页面滚动
                if (mainContent) {
                    mainContent.classList.remove('dropdown-open');
                    mainContent.removeEventListener('wheel', this.preventScroll, { passive: false });
                }
            }
        });
    }

    /**
     * 渲染应用选项
     */
    tcRenderAppOptions() {
        const optionsContainer = document.getElementById('tc-app-options');
        if (!optionsContainer) return;

        if (this.tcApps.length === 0) {
            optionsContainer.innerHTML = `<div class="custom-select__option disabled"><span>${window.i18n.t('pagePackage.noApps')}</span></div>`;
            return;
        }

        optionsContainer.innerHTML = this.tcApps.map(app => `
            <div class="custom-select__option" data-value="${app.id}" data-name="${app.name}">
                <span>${app.name}</span>
            </div>
        `).join('');

        // 绑定点击事件
        optionsContainer.querySelectorAll('.custom-select__option:not(.disabled)').forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const appId = option.dataset.value;
                this.tcSelectApp(appId);

                // 更新选中状态
                optionsContainer.querySelectorAll('.custom-select__option').forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');

                // 更新显示文本
                const selectedSpan = document.querySelector('#tc-app-selected .custom-select__text');
                if (selectedSpan) {
                    selectedSpan.textContent = option.dataset.name;
                }

                // 隐藏下拉框
                optionsContainer.classList.remove('show');
                const mainContent = document.querySelector('.main-content');
                if (mainContent) {
                    mainContent.classList.remove('dropdown-open');
                    mainContent.removeEventListener('wheel', this.preventScroll, { passive: false });
                }
            });
        });
    }

    /**
     * 过滤应用选项（已弃用，custom-select不支持搜索）
     */
    tcFilterAppOptions(keyword) {
        // 保留空实现以兼容
    }

    /**
     * 渲染平台选项
     */
    tcRenderPlatformOptions() {
        const optionsContainer = document.getElementById('tc-platform-options');
        if (!optionsContainer) return;

        const platforms = [
            { value: 'android', label: 'Android' }
        ];

        optionsContainer.innerHTML = platforms.map(platform => `
            <div class="custom-select__option${this.tcSelectedPlatform === platform.value ? ' selected' : ''}" data-value="${platform.value}">
                <span>${platform.label}</span>
            </div>
        `).join('');

        // 绑定点击事件
        optionsContainer.querySelectorAll('.custom-select__option').forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const platformValue = option.dataset.value;
                this.tcSelectPlatform(platformValue);

                // 更新选中状态
                optionsContainer.querySelectorAll('.custom-select__option').forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');

                // 更新显示文本
                const selectedSpan = document.querySelector('#tc-platform-selected .custom-select__text');
                if (selectedSpan) {
                    const platform = platforms.find(p => p.value === platformValue);
                    selectedSpan.textContent = platform ? platform.label : platformValue;
                }

                // 隐藏下拉框
                optionsContainer.classList.remove('show');
                const mainContent = document.querySelector('.main-content');
                if (mainContent) {
                    mainContent.classList.remove('dropdown-open');
                    mainContent.removeEventListener('wheel', this.preventScroll, { passive: false });
                }
            });
        });
    }

    /**
     * 选择平台
     */
    tcSelectPlatform(platformValue) {
        this.tcSelectedPlatform = platformValue;
    }

    /**
     * 选择应用
     */
    tcSelectApp(appId) {
        const app = this.tcApps.find(a => a.id === appId);
        if (!app) return;

        this.tcSelectedApp = app;

        // 自动填充Allure Epic
        const epicInput = document.getElementById('tc-allure-epic');
        if (epicInput && !epicInput.value) {
            epicInput.value = app.name;
        }

        // 启用测试步骤卡片
        this.tcUpdateStepsSectionState(true);
    }

    /**
     * 更新测试步骤卡片的禁用状态
     */
    tcUpdateStepsSectionState(enabled) {
        const stepsSection = document.getElementById('tc-steps-section');
        const addStepBtn = document.getElementById('tc-add-step-btn');
        const addStepBottomBtn = document.getElementById('tc-add-step-bottom-btn');
        const stepsContainer = document.getElementById('tc-steps-container');

        if (stepsSection) {
            if (enabled) {
                stepsSection.classList.remove('disabled');
            } else {
                stepsSection.classList.add('disabled');
            }
        }

        if (addStepBtn) {
            addStepBtn.disabled = !enabled;
        }

        if (addStepBottomBtn) {
            addStepBottomBtn.disabled = !enabled;
        }

        if (stepsContainer) {
            if (enabled) {
                stepsContainer.classList.remove('hidden');
            } else {
                stepsContainer.classList.add('hidden');
            }
        }
    }

    /**
     * 初始化折叠区域
     */
    tcInitCollapsible() {
        const headers = document.querySelectorAll('.tc-collapsible-header');
        headers.forEach(header => {
            if (header.dataset.initialized === 'true') return;
            header.dataset.initialized = 'true';
            header.addEventListener('click', () => {
                const section = header.closest('.tc-section-collapsible');
                section.classList.toggle('collapsed');
            });
        });
    }

    /**
     * 初始化平台选择下拉框
     */
    tcInitPlatformSelect() {
        const select = document.getElementById('tc-platform-select-wrapper-select');
        if (!select) return;
        if (select.dataset.initialized === 'true') return;
        
        const selected = select.querySelector('.custom-select__selected');
        const options = select.querySelector('.custom-select__options');
        if (!selected || !options) return;
        
        document.body.appendChild(options);
        select.dataset.initialized = 'true';
        
        selected.addEventListener('click', (e) => {
            e.stopPropagation();
            document.querySelectorAll('.custom-select__options.show').forEach(opt => {
                if (opt !== options) {
                    opt.classList.remove('show');
                }
            });
            const mainContent = document.querySelector('.main-content');
            const isShowing = options.classList.contains('show');
            if (!isShowing) {
                this.positionDropdown(selected, options);
                options.classList.add('show');
                if (mainContent) {
                    mainContent.classList.add('dropdown-open');
                    mainContent.addEventListener('wheel', this.preventScroll, { passive: false });
                }
            } else {
                options.classList.remove('show');
                if (mainContent) {
                    mainContent.classList.remove('dropdown-open');
                    mainContent.removeEventListener('wheel', this.preventScroll, { passive: false });
                }
            }
        });
        
        // 绑定选项点击事件
        options.querySelectorAll('.custom-select__option').forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const platformValue = option.dataset.value;
                this.tcSelectPlatform(platformValue);

                // 更新选中状态
                options.querySelectorAll('.custom-select__option').forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');

                // 更新显示文本
                const selectedSpan = select.querySelector('.custom-select__text');
                if (selectedSpan) {
                    const platformLabel = option.querySelector('span');
                    selectedSpan.textContent = platformLabel ? platformLabel.textContent : platformValue;
                }

                // 隐藏下拉框
                options.classList.remove('show');
                const mainContent = document.querySelector('.main-content');
                if (mainContent) {
                    mainContent.classList.remove('dropdown-open');
                    mainContent.removeEventListener('wheel', this.preventScroll, { passive: false });
                }
            });
        });
    }

    /**
     * 添加测试步骤
     */
    tcAddStep() {
        const stepId = `step_${Date.now()}`;
        const newStep = {
            id: stepId,
            order: this.tcSteps.length + 1,
            name: `步骤 ${this.tcSteps.length + 1}`,
            type: 'element',
            config: {
                pageId: null,
                pageName: null,
                elementId: null,
                elementName: null,
                locator: null,
                locatorValue: null,
                operation: 'click',
                operationValue: {}
            }
        };

        this.tcSteps.push(newStep);
        this.tcMarkDirty();
        this.tcRenderSteps();
        this.tcHideStepsEmpty();

        // 滚动到新步骤
        setTimeout(() => {
            const stepCard = document.querySelector(`[data-step-id="${stepId}"]`);
            if (stepCard) {
                stepCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // 聚焦步骤名称输入框
                const nameInput = stepCard.querySelector('.tc-step-name-input');
                if (nameInput) nameInput.focus();
            }
        }, 100);
    }

    /**
     * 隐藏步骤空状态
     */
    tcHideStepsEmpty() {
        const emptyDiv = document.getElementById('tc-steps-empty');
        const listDiv = document.getElementById('tc-steps-list');
        const bottomBtn = document.getElementById('tc-add-step-bottom-btn');
        if (emptyDiv) emptyDiv.classList.add('hidden');
        if (listDiv) listDiv.classList.remove('hidden');
        if (bottomBtn) bottomBtn.classList.remove('hidden');
    }

    /**
     * 显示步骤空状态
     */
    tcShowStepsEmpty() {
        const emptyDiv = document.getElementById('tc-steps-empty');
        const listDiv = document.getElementById('tc-steps-list');
        const bottomBtn = document.getElementById('tc-add-step-bottom-btn');
        if (emptyDiv) emptyDiv.classList.remove('hidden');
        if (listDiv) listDiv.classList.add('hidden');
        if (bottomBtn) bottomBtn.classList.add('hidden');
    }

    /**
     * 渲染步骤列表
     */
    tcRenderSteps() {
        const container = document.getElementById('tc-steps-list');
        if (!container) return;

        if (window.DeviceCascadeSelect && window.DeviceCascadeSelect.destroyAll) {
            window.DeviceCascadeSelect.destroyAll();
        }

        document.querySelectorAll('.custom-select__options[data-moved]').forEach(opt => {
            opt.remove();
        });

        container.innerHTML = '';

        // 按顺序排序
        const sortedSteps = [...this.tcSteps].sort((a, b) => a.order - b.order);

        sortedSteps.forEach((step, index) => {
            const stepCard = this.tcCreateStepCard(step, index + 1);
            container.appendChild(stepCard);
        });

        sortedSteps.forEach(step => {
            if (step.type === 'ble') {
                const card = container.querySelector(`[data-step-id="${step.id}"]`);
                if (card) {
                    this.tcInitBleCascadeSelect(card, step);
                }
            }
        });

        this.tcInitStepDragDrop();
        this.initializeIcons();
        this.tcInitStepSelects(container);
    }

    /**
     * 生成custom-select组件HTML
     * @param {string} selectId - 选择器ID
     * @param {Array} options - 选项数组 [{value, label, selected}]
     * @param {string} placeholder - 占位文本
     * @param {string} stepId - 步骤ID
     * @param {number} index - 多选元素索引（可选）
     * @returns {string} HTML字符串
     */
    tcGenerateCustomSelect(selectId, options, placeholder = '请选择', stepId = '', index = -1) {
        const selectedOption = options.find(opt => opt.selected);
        const selectedText = selectedOption ? selectedOption.label : placeholder;
        
        const uniqueSuffix = index >= 0 ? `-${stepId}-${index}` : `-${stepId}`;
        const uniqueId = `${selectId}${uniqueSuffix}`;
        
        let optionsHtml = '';
        options.forEach(opt => {
            optionsHtml += `<div class="custom-select__option${opt.selected ? ' selected' : ''}" data-value="${opt.value}"><span>${opt.label}</span></div>`;
        });

        return `
            <div class="custom-select-wrapper tc-step-select-wrapper" data-step-id="${stepId}" data-index="${index}">
                <div class="custom-select" id="${uniqueId}" data-select-id="${selectId}" data-step-id="${stepId}" data-index="${index}">
                    <div class="custom-select__selected" id="${uniqueId}-selected">
                        <span class="custom-select__text">${selectedText}</span>
                    </div>
                    <div class="custom-select__options" id="${uniqueId}-options">
                        ${optionsHtml}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 初始化步骤内的custom-select组件
     */
    tcInitStepSelects(container) {
        const selectWrappers = container.querySelectorAll('.tc-step-select-wrapper');
        
        selectWrappers.forEach(wrapper => {
            const select = wrapper.querySelector('.custom-select');
            const selected = select.querySelector('.custom-select__selected');
            const options = select.querySelector('.custom-select__options');
            
            if (!selected || !options) return;
            
            // 检查是否已经初始化过
            if (select.dataset.initialized) return;
            select.dataset.initialized = 'true';
            
            // 检查是否已经有相同ID的options在body下，如果有则先移除
            const existingOptions = document.body.querySelector(`#${options.id}`);
            if (existingOptions && existingOptions !== options) {
                existingOptions.remove();
            }
            
            // 将下拉选项移到body下以便正确定位
            if (!options.dataset.moved) {
                document.body.appendChild(options);
                options.dataset.moved = 'true';
            }
            
            // 点击选中区域
            selected.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                
                // 关闭其他下拉框
                document.querySelectorAll('.custom-select__options.show').forEach(opt => {
                    if (opt !== options) {
                        opt.classList.remove('show');
                    }
                });
                
                const mainContent = document.querySelector('.main-content');
                const isShowing = options.classList.contains('show');
                if (!isShowing) {
                    this.positionDropdown(selected, options);
                    options.classList.add('show');
                    // 禁止页面滚动
                    if (mainContent) {
                        mainContent.classList.add('dropdown-open');
                        mainContent.addEventListener('wheel', this.preventScroll, { passive: false });
                    }
                } else {
                    options.classList.remove('show');
                    // 恢复页面滚动
                    if (mainContent) {
                        mainContent.classList.remove('dropdown-open');
                        mainContent.removeEventListener('wheel', this.preventScroll, { passive: false });
                    }
                }
            });
            
            // 绑定选项点击事件
            const optionItems = options.querySelectorAll('.custom-select__option');
            optionItems.forEach(option => {
                option.addEventListener('click', (e) => {
                    e.stopPropagation();
                    
                    const value = option.dataset.value;
                    const text = option.querySelector('span').textContent;
                    const stepId = select.dataset.stepId;
                    const selectId = select.dataset.selectId;
                    const index = wrapper.dataset.index !== undefined ? parseInt(wrapper.dataset.index) : -1;
                    
                    // 更新选中状态
                    optionItems.forEach(opt => opt.classList.remove('selected'));
                    option.classList.add('selected');
                    
                    // 更新显示文本
                    const selectedSpan = selected.querySelector('.custom-select__text');
                    if (selectedSpan) {
                        selectedSpan.textContent = text;
                    }
                    
                    // 隐藏下拉框
                    options.classList.remove('show');
                    
                    // 恢复页面滚动
                    const mainContent = document.querySelector('.main-content');
                    if (mainContent) {
                        mainContent.classList.remove('dropdown-open');
                        mainContent.removeEventListener('wheel', this.preventScroll, { passive: false });
                    }
                    
                    // 触发变更事件处理
                    this.tcHandleSelectChange(selectId, value, stepId, index);
                });
            });
        });
    }

    /**
     * 处理下拉框变更
     */
    tcHandleSelectChange(selectId, value, stepId, index = -1) {
        const step = this.tcSteps.find(s => s.id === stepId);
        if (!step) return;

        this.tcMarkDirty();
        
        const config = step.config || {};
        
        switch (selectId) {
            // 元素操作相关
            case 'tc-page-select':
                config.pageId = value;
                config.elementId = '';
                config.locator = null;
                config.locatorValue = null;
                if (config.operation === 'sendText') {
                    config.operation = 'click';
                    config.operationValue = {};
                }
                const selectedPage = this.tcSelectedApp?.pages?.find(p => p.id === value);
                config.pageName = selectedPage?.name || '';
                this.tcUpdateElementSelect(stepId, value);
                this.tcUpdateOperationSelect(stepId);
                break;
            case 'tc-element-select':
                config.elementId = value;
                const pageForElement = this.tcSelectedApp?.pages?.find(p => p.id === config.pageId);
                const selectedElement = pageForElement?.elements?.find(el => el.id === value);
                if (selectedElement) {
                    config.elementName = selectedElement.name;
                    config.locator = selectedElement.locator;
                    config.locatorValue = selectedElement.value;
                    if (selectedElement.locator === 'click' && config.operation === 'sendText') {
                        config.operation = 'click';
                        config.operationValue = {};
                    }
                    this.tcUpdateOperationSelect(stepId);
                }
                break;
            case 'tc-multi-element-select':
                config.selectedElements = config.selectedElements || [];
                if (index >= 0 && index < config.selectedElements.length) {
                    const currentElem = config.selectedElements[index];
                    if (typeof currentElem === 'string') {
                        config.selectedElements[index] = {
                            elementId: value,
                            operation: 'click',
                            operationValue: {}
                        };
                    } else {
                        currentElem.elementId = value;
                        const elemLocatorType = this.tcGetElementLocatorType(config.pageId, value);
                        if (elemLocatorType === 'click' && currentElem.operation === 'sendText') {
                            currentElem.operation = 'click';
                            currentElem.operationValue = {};
                        }
                    }
                    this.tcUpdateMultiOperationSelect(stepId, index);
                }
                break;
            case 'tc-multi-operation-select':
                // 多选元素的操作类型选择
                config.selectedElements = config.selectedElements || [];
                if (index >= 0 && index < config.selectedElements.length) {
                    let currentElem = config.selectedElements[index];
                    // 如果当前元素是字符串，转换为对象格式
                    if (typeof currentElem === 'string') {
                        config.selectedElements[index] = {
                            elementId: currentElem,
                            operation: value,
                            operationValue: {}
                        };
                    } else if (typeof currentElem === 'object') {
                        currentElem.operation = value;
                        currentElem.operationValue = {};
                    }
                    // 重新渲染该元素的操作值区域
                    this.tcUpdateMultiOperationValue(stepId, index, value);
                }
                break;
            case 'tc-multi-input-type-select':
                // 多选元素的输入类型选择
                config.selectedElements = config.selectedElements || [];
                if (index >= 0 && index < config.selectedElements.length) {
                    const currentElem = config.selectedElements[index];
                    if (typeof currentElem === 'object') {
                        currentElem.operationValue = currentElem.operationValue || {};
                        currentElem.operationValue.inputType = value;
                    }
                    // 重新渲染输入值区域
                    this.tcUpdateMultiInputValueArea(stepId, index, value);
                }
                break;
            case 'tc-multi-random-precision':
                // 多选元素的随机精度选择
                config.selectedElements = config.selectedElements || [];
                if (index >= 0 && index < config.selectedElements.length) {
                    const currentElem = config.selectedElements[index];
                    if (typeof currentElem === 'object') {
                        currentElem.operationValue = currentElem.operationValue || {};
                        currentElem.operationValue.randomConfig = currentElem.operationValue.randomConfig || {};
                        currentElem.operationValue.randomConfig.precision = parseInt(value);
                    }
                }
                break;
            case 'tc-multi-faker-locale':
                // 多选元素的Faker语言选择
                config.selectedElements = config.selectedElements || [];
                if (index >= 0 && index < config.selectedElements.length) {
                    const currentElem = config.selectedElements[index];
                    if (typeof currentElem === 'object') {
                        currentElem.operationValue = currentElem.operationValue || {};
                        currentElem.operationValue.fakerConfig = currentElem.operationValue.fakerConfig || {};
                        currentElem.operationValue.fakerConfig.locale = value;
                        currentElem.operationValue.fakerConfig.provider = 'person.name';
                    }
                    // 重新渲染Faker配置
                    this.tcUpdateMultiInputValueArea(stepId, index, 'faker');
                }
                break;
            case 'tc-multi-faker-provider':
                // 多选元素的Faker类型选择
                config.selectedElements = config.selectedElements || [];
                if (index >= 0 && index < config.selectedElements.length) {
                    const currentElem = config.selectedElements[index];
                    if (typeof currentElem === 'object') {
                        currentElem.operationValue = currentElem.operationValue || {};
                        currentElem.operationValue.fakerConfig = currentElem.operationValue.fakerConfig || {};
                        currentElem.operationValue.fakerConfig.provider = value;
                    }
                    // 更新示例显示
                    this.tcUpdateMultiFakerExample(stepId, index, value);
                }
                break;
            case 'tc-operation-select':
                config.operation = value;
                config.operationValue = {};
                this.tcUpdateOperationValue(stepId);
                break;
            case 'tc-input-type-select':
                config.operationValue = config.operationValue || {};
                config.operationValue.inputType = value;
                this.tcUpdateInputValueArea(stepId, value);
                break;
            case 'tc-random-precision':
                config.operationValue = config.operationValue || {};
                config.operationValue.randomConfig = config.operationValue.randomConfig || {};
                config.operationValue.randomConfig.precision = parseInt(value);
                break;
            case 'tc-faker-locale':
                config.operationValue = config.operationValue || {};
                config.operationValue.fakerConfig = config.operationValue.fakerConfig || {};
                config.operationValue.fakerConfig.locale = value;
                this.tcUpdateFakerProviders(stepId, value);
                break;
            case 'tc-faker-provider':
                config.operationValue = config.operationValue || {};
                config.operationValue.fakerConfig = config.operationValue.fakerConfig || {};
                config.operationValue.fakerConfig.provider = value;
                this.tcUpdateFakerExampleDisplay(stepId, value);
                break;
            case 'tc-faker-category':
                config.operationValue = config.operationValue || {};
                config.operationValue.fakerConfig = config.operationValue.fakerConfig || {};
                config.operationValue.fakerConfig.category = value;
                this.tcUpdateFakerMethods(stepId, value);
                break;
            case 'tc-faker-method':
                config.operationValue = config.operationValue || {};
                config.operationValue.fakerConfig = config.operationValue.fakerConfig || {};
                config.operationValue.fakerConfig.method = value;
                break;
                
            // 蓝牙操作相关
            case 'tc-ble-method-select':
                config.deviceConfig = config.deviceConfig || {};
                config.deviceConfig.methodName = value;
                delete config.deviceConfig.params;
                this.tcUpdateBleDataConfig(stepId);
                break;
                
            case 'tc-target-value-type':
                config.compareConfig = config.compareConfig || {};
                config.compareConfig.targetValueType = value;
                if (value === 'custom') {
                    config.compareConfig.targetValue = '';
                    delete config.compareConfig.bleStepId;
                } else if (value === 'ble') {
                    delete config.compareConfig.targetValue;
                    config.compareConfig.bleStepId = '';
                }
                this.tcUpdateTargetValueConfig(stepId, value);
                break;
            case 'tc-ble-step-select':
                config.compareConfig = config.compareConfig || {};
                config.compareConfig.bleStepId = value;
                break;
            case 'tc-page-operation-type':
                config.operationType = value;
                this.tcUpdateOperationTypeUI(stepId, value);
                break;
            case 'tc-search-type':
                config.searchConfig = config.searchConfig || {};
                config.searchConfig.searchType = value;
                this.tcUpdateSearchTypeUI(stepId, value);
                break;
            case 'tc-search-element-page':
                config.searchConfig = config.searchConfig || {};
                config.searchConfig.pageId = value;
                config.searchConfig.elementId = '';
                config.searchConfig.elementName = '';
                this.tcUpdateSearchElementSelect(stepId, value);
                break;
            case 'tc-system-operation-type':
                config.systemConfig = config.systemConfig || {};
                config.systemConfig.operationType = value;
                break;
            case 'tc-nav-key-select':
                config.systemConfig = config.systemConfig || {};
                config.systemConfig.navKey = value;
                break;
            case 'tc-search-element-select':
                config.searchConfig = config.searchConfig || {};
                config.searchConfig.elementId = value;
                const pageForSearchElement = this.tcSelectedApp?.pages?.find(p => p.id === config.searchConfig?.pageId);
                const foundSearchElement = pageForSearchElement?.elements?.find(el => el.id === value);
                if (foundSearchElement) {
                    config.searchConfig.elementName = foundSearchElement.name;
                    config.searchConfig.locator = foundSearchElement.locator;
                    config.searchConfig.locatorValue = foundSearchElement.value;
                }
                break;
            case 'tc-compare-element-page':
                config.compareConfig = config.compareConfig || {};
                config.compareConfig.pageId = value;
                config.compareConfig.elementId = '';
                config.compareConfig.elementName = '';
                this.tcUpdateCompareElementSelect(stepId, value);
                break;
            case 'tc-compare-element-select':
                config.compareConfig = config.compareConfig || {};
                config.compareConfig.elementId = value;
                const pageForCompareElement = this.tcSelectedApp?.pages?.find(p => p.id === config.compareConfig?.pageId);
                const foundCompareElement = pageForCompareElement?.elements?.find(el => el.id === value);
                if (foundCompareElement) {
                    config.compareConfig.elementName = foundCompareElement.name;
                    config.compareConfig.locator = foundCompareElement.locator;
                    config.compareConfig.locatorValue = foundCompareElement.value;
                }
                break;
            default:
                if (selectId.startsWith('tc-ble-param-')) {
                    const paramKey = selectId.replace('tc-ble-param-', '');
                    config.deviceConfig = config.deviceConfig || {};
                    config.deviceConfig.params = config.deviceConfig.params || {};
                    config.deviceConfig.params[paramKey] = value;
                }
                break;
        }
    }

    /**
     * 更新元素选择下拉框
     */
    tcUpdateElementSelect(stepId, pageId) {
        const step = this.tcSteps.find(s => s.id === stepId);
        if (!step) return;
        
        const app = this.tcSelectedApp;
        let elementOptions = [{value: '', label: '请选择元素', selected: true}];
        
        if (pageId && app) {
            const page = app.pages?.find(p => p.id === pageId);
            if (page && page.elements) {
                elementOptions = [{value: '', label: '请选择元素', selected: true}];
                page.elements.forEach(element => {
                    elementOptions.push({value: element.id, label: element.name, selected: false});
                });
            }
        }
        
        const wrapper = document.querySelector(`#tc-element-select-${stepId}`)?.closest('.custom-select-wrapper');
        if (wrapper) {
            wrapper.outerHTML = this.tcGenerateCustomSelect('tc-element-select', elementOptions, '请选择元素', stepId);
            const card = document.querySelector(`[data-step-id="${stepId}"].tc-step-card`);
            if (card) {
                this.tcInitStepSelects(card);
            }
        }
    }

    /**
     * 更新操作值区域
     */
    tcUpdateOperationSelect(stepId) {
        const step = this.tcSteps.find(s => s.id === stepId);
        if (!step) return;
        const config = step.config || {};
        
        const operationOptions = this.tcGetOperationOptionsForLocator(config.locator, config.operation);
        const wrapper = document.querySelector(`#tc-operation-select-${stepId}`)?.closest('.custom-select-wrapper');
        if (wrapper) {
            wrapper.outerHTML = this.tcGenerateCustomSelect('tc-operation-select', operationOptions, '请选择操作', stepId);
            const card = document.querySelector(`[data-step-id="${stepId}"].tc-step-card`);
            if (card) {
                this.tcInitStepSelects(card);
            }
        }
        this.tcUpdateOperationValue(stepId);
    }

    tcUpdateOperationValue(stepId) {
        const step = this.tcSteps.find(s => s.id === stepId);
        if (!step) return;
        
        const container = document.querySelector(`.tc-operation-value-group[data-step-id="${stepId}"]`);
        if (container) {
            container.innerHTML = this.tcRenderOperationValue(step);
            this.initializeIcons();
            const card = container.closest('.tc-step-card');
            if (card) {
                this.tcInitStepSelects(card);
                this.tcBindOperationValueEvents(card, step);
            }
        }
    }

    tcUpdateMultiOperationSelect(stepId, index) {
        const step = this.tcSteps.find(s => s.id === stepId);
        if (!step) return;
        const config = step.config || {};
        const selectedElements = config.selectedElements || [];
        const elemConfig = selectedElements[index];
        if (!elemConfig || typeof elemConfig === 'string') return;
        
        const elemLocatorType = this.tcGetElementLocatorType(config.pageId, elemConfig.elementId);
        const elemOperationOptions = this.tcGetOperationOptionsForLocator(elemLocatorType, elemConfig.operation);
        const wrapper = document.querySelector(`#tc-multi-operation-select-${stepId}-${index}`)?.closest('.custom-select-wrapper');
        if (wrapper) {
            wrapper.outerHTML = this.tcGenerateCustomSelect('tc-multi-operation-select', elemOperationOptions, '请选择操作', stepId, index);
            const card = document.querySelector(`[data-step-id="${stepId}"].tc-step-card`);
            if (card) {
                this.tcInitStepSelects(card);
            }
        }
        this.tcUpdateMultiOperationValue(stepId, index, elemConfig.operation);
    }

    /**
     * 更新多选元素的操作值区域
     */
    tcUpdateMultiOperationValue(stepId, index, operation) {
        const step = this.tcSteps.find(s => s.id === stepId);
        if (!step) return;
        
        const selectedElements = step.config?.selectedElements || [];
        let elemConfig = selectedElements[index];
        
        // 如果元素配置是字符串，先转换为对象格式
        if (typeof elemConfig === 'string') {
            selectedElements[index] = {
                elementId: elemConfig,
                operation: operation,
                operationValue: {}
            };
            elemConfig = selectedElements[index];
        }
        
        if (!elemConfig || typeof elemConfig !== 'object') return;
        
        const container = document.querySelector(`.tc-multi-operation-value-group[data-step-id="${stepId}"][data-index="${index}"]`);
        if (container) {
            container.innerHTML = this.tcRenderMultiOperationValue(step, index, operation, elemConfig.operationValue || {});
            this.initializeIcons();
            const card = container.closest('.tc-step-card');
            if (card) {
                this.tcInitStepSelects(card);
                this.tcBindMultiSelectValueEvents(container, step);
            }
        }
    }

    /**
     * 更新多选元素的输入值区域
     */
    tcUpdateMultiInputValueArea(stepId, index, inputType) {
        const step = this.tcSteps.find(s => s.id === stepId);
        if (!step) return;
        
        const selectedElements = step.config?.selectedElements || [];
        const elemConfig = selectedElements[index];
        if (!elemConfig || typeof elemConfig !== 'object') return;
        
        const container = document.querySelector(`.tc-input-value-container[data-step-id="${stepId}"][data-index="${index}"]`);
        if (container) {
            container.innerHTML = this.tcRenderMultiInputValueArea(step, index, inputType, elemConfig.operationValue || {});
            this.initializeIcons();
            const card = container.closest('.tc-step-card');
            if (card) {
                this.tcInitStepSelects(card);
                this.tcBindMultiSelectValueEvents(container, step);
            }
        }
    }

    /**
     * 更新多选元素的Faker示例显示
     */
    tcUpdateMultiFakerExample(stepId, index, provider) {
        const step = this.tcSteps.find(s => s.id === stepId);
        if (!step) return;
        
        const selectedElements = step.config?.selectedElements || [];
        const elemConfig = selectedElements[index];
        if (!elemConfig || typeof elemConfig !== 'object') return;
        
        const fakerConfig = elemConfig.operationValue?.fakerConfig || {};
        const locale = fakerConfig.locale || 'zh_CN';
        
        const providers = {
            'zh_CN': [
                { value: 'person.name', label: window.i18n.t('testCase.fakerProviders.personName'), example: '张三' },
                { value: 'person.phone', label: window.i18n.t('testCase.fakerProviders.personPhone'), example: '13812345678' },
                { value: 'person.email', label: window.i18n.t('testCase.fakerProviders.personEmail'), example: 'zhangsan@example.com' },
                { value: 'address.city', label: window.i18n.t('testCase.fakerProviders.addressCity'), example: '北京市' },
                { value: 'address.address', label: window.i18n.t('testCase.fakerProviders.addressAddress'), example: '朝阳区xxx街道' },
                { value: 'company.name', label: window.i18n.t('testCase.fakerProviders.companyName'), example: '科技有限公司' }
            ],
            'en_US': [
                { value: 'person.name', label: window.i18n.t('testCase.fakerProviders.personName'), example: 'John Smith' },
                { value: 'person.phone', label: window.i18n.t('testCase.fakerProviders.personPhone'), example: '+1-555-123-4567' },
                { value: 'person.email', label: window.i18n.t('testCase.fakerProviders.personEmail'), example: 'john@example.com' },
                { value: 'address.city', label: window.i18n.t('testCase.fakerProviders.addressCity'), example: 'New York' },
                { value: 'address.address', label: window.i18n.t('testCase.fakerProviders.addressAddress'), example: '123 Main St' },
                { value: 'company.name', label: window.i18n.t('testCase.fakerProviders.companyName'), example: 'Tech Corp' }
            ],
            'ja_JP': [
                { value: 'person.name', label: window.i18n.t('testCase.fakerProviders.personName'), example: '田中太郎' },
                { value: 'person.phone', label: window.i18n.t('testCase.fakerProviders.personPhone'), example: '090-1234-5678' },
                { value: 'person.email', label: window.i18n.t('testCase.fakerProviders.personEmail'), example: 'tanaka@example.jp' },
                { value: 'address.city', label: window.i18n.t('testCase.fakerProviders.addressCity'), example: '東京都' },
                { value: 'address.address', label: window.i18n.t('testCase.fakerProviders.addressAddress'), example: '渋谷区xxx' },
                { value: 'company.name', label: window.i18n.t('testCase.fakerProviders.companyName'), example: '株式会社テック' }
            ],
            'ko_KR': [
                { value: 'person.name', label: window.i18n.t('testCase.fakerProviders.personName'), example: '김철수' },
                { value: 'person.phone', label: window.i18n.t('testCase.fakerProviders.personPhone'), example: '010-1234-5678' },
                { value: 'person.email', label: window.i18n.t('testCase.fakerProviders.personEmail'), example: 'kim@example.kr' },
                { value: 'address.city', label: window.i18n.t('testCase.fakerProviders.addressCity'), example: '서울특별시' },
                { value: 'address.address', label: window.i18n.t('testCase.fakerProviders.addressAddress'), example: '강남구 xxx' },
                { value: 'company.name', label: window.i18n.t('testCase.fakerProviders.companyName'), example: '테크주식회사' }
            ]
        };
        
        const currentProviders = providers[locale] || providers['zh_CN'];
        const currentProvider = currentProviders.find(p => p.value === provider) || currentProviders[0];
        
        const exampleValue = document.querySelector(`.tc-multi-operation-value-group[data-step-id="${stepId}"][data-index="${index}"] .tc-faker-example-value`);
        if (exampleValue) {
            exampleValue.textContent = currentProvider?.example || '';
        }
    }

    /**
     * 更新输入值区域
     */
    tcUpdateInputValueArea(stepId, inputType) {
        const step = this.tcSteps.find(s => s.id === stepId);
        if (!step) return;
        
        const container = document.querySelector(`.tc-input-value-container[data-step-id="${stepId}"]`);
        if (container) {
            container.innerHTML = this.tcRenderInputValueArea(step, inputType);
            const card = container.closest('.tc-step-card');
            if (card) {
                this.tcInitStepSelects(card);
                this.tcBindInputValueEvents(card, step);
            }
        }
    }

    /**
     * 更新Faker方法下拉框
     */
    tcUpdateFakerMethods(stepId, category) {
        const step = this.tcSteps.find(s => s.id === stepId);
        if (!step) return;
        
        const methods = this.tcGetFakerMethods(category);
        const methodOptions = methods.map((m, i) => ({
            value: m.value,
            label: m.label,
            selected: i === 0
        }));
        
        const wrapper = document.querySelector(`#tc-faker-method-${stepId}`)?.closest('.custom-select-wrapper');
        if (wrapper) {
            wrapper.outerHTML = this.tcGenerateCustomSelect('tc-faker-method', methodOptions, '请选择方法', stepId);
            const card = document.querySelector(`[data-step-id="${stepId}"].tc-step-card`);
            if (card) {
                this.tcInitStepSelects(card);
            }
        }
    }

    /**
     * 更新Faker类型下拉框（当语言变更时）
     */
    tcUpdateFakerProviders(stepId, locale) {
        const step = this.tcSteps.find(s => s.id === stepId);
        if (!step) return;
        
        const providers = {
            'zh_CN': [
                { value: 'person.name', label: window.i18n.t('testCase.fakerProviders.personName'), example: '张三' },
                { value: 'person.phone', label: window.i18n.t('testCase.fakerProviders.personPhone'), example: '13812345678' },
                { value: 'person.email', label: window.i18n.t('testCase.fakerProviders.personEmail'), example: 'zhangsan@example.com' },
                { value: 'address.city', label: window.i18n.t('testCase.fakerProviders.addressCity'), example: '北京市' },
                { value: 'address.address', label: window.i18n.t('testCase.fakerProviders.addressAddress'), example: '朝阳区xxx街道' },
                { value: 'company.name', label: window.i18n.t('testCase.fakerProviders.companyName'), example: '科技有限公司' }
            ],
            'en_US': [
                { value: 'person.name', label: window.i18n.t('testCase.fakerProviders.personName'), example: 'John Smith' },
                { value: 'person.phone', label: window.i18n.t('testCase.fakerProviders.personPhone'), example: '+1-555-123-4567' },
                { value: 'person.email', label: window.i18n.t('testCase.fakerProviders.personEmail'), example: 'john@example.com' },
                { value: 'address.city', label: window.i18n.t('testCase.fakerProviders.addressCity'), example: 'New York' },
                { value: 'address.address', label: window.i18n.t('testCase.fakerProviders.addressAddress'), example: '123 Main St' },
                { value: 'company.name', label: window.i18n.t('testCase.fakerProviders.companyName'), example: 'Tech Corp' }
            ],
            'ja_JP': [
                { value: 'person.name', label: window.i18n.t('testCase.fakerProviders.personName'), example: '田中太郎' },
                { value: 'person.phone', label: window.i18n.t('testCase.fakerProviders.personPhone'), example: '090-1234-5678' },
                { value: 'person.email', label: window.i18n.t('testCase.fakerProviders.personEmail'), example: 'tanaka@example.jp' },
                { value: 'address.city', label: window.i18n.t('testCase.fakerProviders.addressCity'), example: '東京都' },
                { value: 'address.address', label: window.i18n.t('testCase.fakerProviders.addressAddress'), example: '渋谷区xxx' },
                { value: 'company.name', label: window.i18n.t('testCase.fakerProviders.companyName'), example: '株式会社テック' }
            ],
            'ko_KR': [
                { value: 'person.name', label: window.i18n.t('testCase.fakerProviders.personName'), example: '김철수' },
                { value: 'person.phone', label: window.i18n.t('testCase.fakerProviders.personPhone'), example: '010-1234-5678' },
                { value: 'person.email', label: window.i18n.t('testCase.fakerProviders.personEmail'), example: 'kim@example.kr' },
                { value: 'address.city', label: window.i18n.t('testCase.fakerProviders.addressCity'), example: '서울특별시' },
                { value: 'address.address', label: window.i18n.t('testCase.fakerProviders.addressAddress'), example: '강남구 xxx' },
                { value: 'company.name', label: window.i18n.t('testCase.fakerProviders.companyName'), example: '테크주식회사' }
            ]
        };
        
        const currentProviders = providers[locale] || providers['zh_CN'];
        const providerOptions = currentProviders.map((p, i) => ({
            value: p.value,
            label: p.label,
            selected: i === 0
        }));
        
        step.config.operationValue.fakerConfig.provider = currentProviders[0].value;
        
        const wrapper = document.querySelector(`#tc-faker-provider-${stepId}`)?.closest('.custom-select-wrapper');
        if (wrapper) {
            wrapper.outerHTML = this.tcGenerateCustomSelect('tc-faker-provider', providerOptions, window.i18n.t('testCase.fakerType'), stepId);
            const card = document.querySelector(`[data-step-id="${stepId}"].tc-step-card`);
            if (card) {
                this.tcInitStepSelects(card);
            }
        }
        
        const exampleValue = document.querySelector(`[data-step-id="${stepId}"].tc-step-card .tc-faker-example-value`);
        if (exampleValue) {
            exampleValue.textContent = currentProviders[0].example;
        }
    }

    tcUpdateFakerExampleDisplay(stepId, provider) {
        const step = this.tcSteps.find(s => s.id === stepId);
        if (!step) return;
        
        const fakerConfig = step.config?.operationValue?.fakerConfig || {};
        const locale = fakerConfig.locale || 'zh_CN';
        
        const examplesZh = {
            'person.name': '张三',
            'person.phone': '13812345678',
            'person.email': 'zhangsan@example.com',
            'address.city': '北京市',
            'address.address': '朝阳区xxx街道',
            'company.name': '科技有限公司'
        };
        const examplesEn = {
            'person.name': 'John Smith',
            'person.phone': '+1-555-123-4567',
            'person.email': 'john@example.com',
            'address.city': 'New York',
            'address.address': '123 Main St',
            'company.name': 'Tech Corp'
        };
        const examplesJa = {
            'person.name': '田中太郎',
            'person.phone': '090-1234-5678',
            'person.email': 'tanaka@example.jp',
            'address.city': '東京都',
            'address.address': '渋谷区xxx',
            'company.name': '株式会社テック'
        };
        const examplesKo = {
            'person.name': '김철수',
            'person.phone': '010-1234-5678',
            'person.email': 'kim@example.kr',
            'address.city': '서울특별시',
            'address.address': '강남구 xxx',
            'company.name': '테크주식회사'
        };
        
        const examplesMap = {
            'zh_CN': examplesZh,
            'en_US': examplesEn,
            'ja_JP': examplesJa,
            'ko_KR': examplesKo
        };
        
        const examples = examplesMap[locale] || examplesZh;
        
        const exampleValue = document.querySelector(`[data-step-id="${stepId}"].tc-step-card .tc-faker-example-value`);
        if (exampleValue) {
            exampleValue.textContent = examples[provider] || '';
        }
    }

    /**
     * 更新蓝牙操作配置
     */
    tcUpdateBleDataConfig(stepId) {
        const step = this.tcSteps.find(s => s.id === stepId);
        if (!step) return;

        const config = step.config || {};
        const deviceConfig = config.deviceConfig || {};

        const bleConfig = document.querySelector(`.tc-ble-config[data-step-id="${stepId}"]`);
        if (!bleConfig) return;

        const card = bleConfig.closest('.tc-step-card');
        if (!card) return;

        let methodOptionsHtml = '';
        let paramsHtml = '';

        if (deviceConfig.deviceId && this.tcBleDevices.length > 0) {
            const device = this.tcBleDevices.find(d => d.deviceId === deviceConfig.deviceId);
            if (device && device.methods) {
                const methodOptions = device.methods.map(m => ({
                    value: m.name,
                    label: m.displayName || m.name,
                    selected: deviceConfig.methodName === m.name
                }));
                methodOptionsHtml = `
                    <div class="form-group">
                        <label>${window.i18n.t('testCase.bleMethod')}</label>
                        ${this.tcGenerateCustomSelect('tc-ble-method-select', methodOptions, window.i18n.t('testCase.bleMethodPlaceholder'), stepId)}
                    </div>
                `;

                if (deviceConfig.methodName) {
                    const method = device.methods.find(m => m.name === deviceConfig.methodName);
                    if (method && method.params) {
                        paramsHtml = this.tcRenderDeviceParams(method.params, deviceConfig.params || {}, stepId);
                    }
                }
            }
        }

        const deviceSelectContainer = bleConfig.querySelector(`.tc-ble-device-select-container[data-step-id="${stepId}"]`);

        const existingMethodGroup = bleConfig.querySelector('.form-group:has(.tc-step-select-wrapper [data-select-id="tc-ble-method-select"])');
        if (existingMethodGroup) {
            const methodSelect = existingMethodGroup.querySelector('.custom-select');
            if (methodSelect) {
                const methodOptionsId = methodSelect.querySelector('.custom-select__options')?.id;
                if (methodOptionsId) {
                    const bodyOptions = document.body.querySelector(`#${methodOptionsId}`);
                    if (bodyOptions) bodyOptions.remove();
                }
            }
            existingMethodGroup.remove();
        }

        const existingParamsContainer = bleConfig.querySelector(`.tc-ble-params-container[data-step-id="${stepId}"]`);
        if (existingParamsContainer) {
            existingParamsContainer.querySelectorAll('.custom-select').forEach(cs => {
                const optId = cs.querySelector('.custom-select__options')?.id;
                if (optId) {
                    const bodyOpt = document.body.querySelector(`#${optId}`);
                    if (bodyOpt) bodyOpt.remove();
                }
            });
            existingParamsContainer.remove();
        }

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = `
            ${methodOptionsHtml}
            <div class="tc-ble-params-container" data-step-id="${stepId}">
                ${paramsHtml}
            </div>
        `;

        const insertAfter = deviceSelectContainer ? deviceSelectContainer.closest('.form-group') : null;
        const referenceNode = insertAfter ? insertAfter.nextSibling : null;

        while (tempDiv.firstChild) {
            bleConfig.insertBefore(tempDiv.firstChild, referenceNode);
        }

        this.tcInitStepSelects(card);
        this.tcBindBleEvents(card, step);
    }

    /**
     * 创建步骤卡片DOM
     */
    tcCreateStepCard(step, order) {
        const card = document.createElement('div');
        card.className = 'tc-step-card';
        card.setAttribute('data-step-id', step.id);
        card.setAttribute('data-step-order', step.order);

        card.innerHTML = `
            <div class="tc-step-drag-handle tc-step-drag-handle-top" data-drag-handle="true">
                <button type="button" class="tc-step-move-btn tc-step-move-up-btn" data-step-id="${step.id}" data-move="up" title="上移">
                    ${this.getIconHtml('arrow_upward')}
                </button>
                <div class="tc-drag-grip" data-drag-grip="true">
                    <span></span><span></span><span></span>
                </div>
                <button type="button" class="tc-step-move-btn tc-step-move-down-btn" data-step-id="${step.id}" data-move="down" title="下移">
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
                    <button type="button" class="tc-step-btn tc-step-copy-btn" data-step-id="${step.id}" title="复制">
                        ${this.getIconHtml('content_copy')}
                    </button>
                    <button type="button" class="tc-step-btn tc-step-delete-btn" data-step-id="${step.id}" title="删除">
                        ${this.getIconHtml('delete')}
                    </button>
                </div>
            </div>
            <div class="tc-step-body">
                ${this.tcRenderStepConfig(step)}
            </div>
            <div class="tc-step-drag-handle tc-step-drag-handle-bottom" data-drag-handle="true">
                <button type="button" class="tc-step-move-btn tc-step-move-up-btn" data-step-id="${step.id}" data-move="up" title="上移">
                    ${this.getIconHtml('arrow_upward')}
                </button>
                <div class="tc-drag-grip" data-drag-grip="true">
                    <span></span><span></span><span></span>
                </div>
                <button type="button" class="tc-step-move-btn tc-step-move-down-btn" data-step-id="${step.id}" data-move="down" title="下移">
                    ${this.getIconHtml('arrow_downward')}
                </button>
            </div>
        `;

        // 绑定事件
        this.tcBindStepCardEvents(card, step);

        return card;
    }

    /**
     * 渲染步骤配置区域
     */
    tcRenderStepConfig(step) {
        let configHtml = `
            <div class="tc-step-type-selector">
                <label>步骤类型</label>
                <div class="tc-type-tabs">
                    <button type="button" class="tc-type-tab ${step.type === 'element' ? 'active' : ''}" data-type="element">
                        ${this.getIconHtml('touch_app')}
                        <span>元素操作</span>
                    </button>
                    <button type="button" class="tc-type-tab ${step.type === 'page' ? 'active' : ''}" data-type="page">
                        ${this.getIconHtml('pageview')}
                        <span>页面操作</span>
                    </button>
                    <button type="button" class="tc-type-tab ${step.type === 'system' ? 'active' : ''}" data-type="system">
                        ${this.getIconHtml('smartphone')}
                        <span>系统操作</span>
                    </button>
                    <button type="button" class="tc-type-tab ${step.type === 'ble' ? 'active' : ''}" data-type="ble">
                        ${this.getIconHtml('bluetooth')}
                        <span>蓝牙操作</span>
                    </button>
                </div>
            </div>
        `;

        // 根据类型渲染配置
        switch (step.type) {
            case 'element':
                configHtml += this.tcRenderElementConfig(step);
                break;
            case 'ble':
                configHtml += this.tcRenderBleConfig(step);
                break;
            case 'page':
                configHtml += this.tcRenderPageConfig(step);
                break;
            case 'system':
                configHtml += this.tcRenderSystemConfig(step);
                break;
        }

        return configHtml;
    }

    /**
     * 渲染元素操作配置
     */
    tcRenderElementConfig(step) {
        const config = step.config || {};
        const app = this.tcSelectedApp;
        const multiSelect = config.multiSelect || false;
        const clickCount = config.multiClickCount || 1;
        const selectedElements = config.selectedElements || [];

        // 获取页面选项
        let pageOptions = [{value: '', label: '请选择页面', selected: !config.pageId}];
        if (app && app.pages) {
            app.pages.forEach(page => {
                pageOptions.push({value: page.id, label: page.name, selected: config.pageId === page.id});
            });
        }

        // 获取元素选项
        let elementOptions = [{value: '', label: '请选择元素', selected: true}];
        if (config.pageId && app) {
            const page = app.pages?.find(p => p.id === config.pageId);
            if (page && page.elements) {
                elementOptions = [{value: '', label: '请选择元素', selected: !config.elementId}];
                page.elements.forEach(element => {
                    elementOptions.push({value: element.id, label: element.name, selected: config.elementId === element.id});
                });
            }
        }

        // 操作类型选项
        const operationOptions = this.tcGetOperationOptionsForLocator(config.locator, config.operation);

        // 渲染多选元素列表
        let multiElementsHtml = '';
        if (multiSelect && selectedElements.length > 0) {
            selectedElements.forEach((elemConfig, index) => {
                const elemId = typeof elemConfig === 'string' ? elemConfig : elemConfig.elementId;
                const elemOperation = typeof elemConfig === 'object' ? (elemConfig.operation || 'click') : 'click';
                const elemOperationValue = typeof elemConfig === 'object' ? (elemConfig.operationValue || {}) : {};
                
                const elemOptions = this.tcGetElementOptionsForPage(config.pageId, elemId);
                const elemLocatorType = this.tcGetElementLocatorType(config.pageId, elemId);
                const elemOperationOptions = this.tcGetOperationOptionsForLocator(elemLocatorType, elemOperation);
                
                multiElementsHtml += `
                    <div class="tc-multi-element-item" data-index="${index}" data-step-id="${step.id}">
                        <div class="tc-multi-element-header">
                            <span class="tc-multi-element-number">${index + 1}</span>
                            ${this.tcGenerateCustomSelect('tc-multi-element-select', elemOptions, '请选择元素', step.id, index)}
                            <button type="button" class="tc-multi-element-remove-btn" data-step-id="${step.id}" data-index="${index}">
                                <span class="svg-icon" data-icon="close"></span>
                            </button>
                        </div>
                        <div class="tc-multi-element-body">
                            <div class="form-group">
                                <label>操作类型</label>
                                ${this.tcGenerateCustomSelect('tc-multi-operation-select', elemOperationOptions, '请选择操作', step.id, index)}
                            </div>
                            <div class="form-group tc-multi-operation-value-group" data-step-id="${step.id}" data-index="${index}">
                                ${this.tcRenderMultiOperationValue(step, index, elemOperation, elemOperationValue)}
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
                        <label>页面选择</label>
                        ${this.tcGenerateCustomSelect('tc-page-select', pageOptions, '请选择页面', step.id)}
                    </div>
                    <div class="form-group tc-element-select-group" data-step-id="${step.id}">
                        <div class="tc-element-select-header">
                            <label>元素选择</label>
                        </div>
                        <label class="tc-multi-select-toggle">
                            <input type="checkbox" class="tc-multi-select-checkbox" data-step-id="${step.id}" ${multiSelect ? 'checked' : ''}>
                            <span>元素多选</span>
                        </label>
                        <div class="tc-single-element-select ${multiSelect ? 'hidden' : ''}">
                            ${this.tcGenerateCustomSelect('tc-element-select', elementOptions, '请选择元素', step.id)}
                        </div>
                        <div class="tc-multi-element-config ${multiSelect ? '' : 'hidden'}">
                            <div class="tc-multi-element-count-row">
                                <span class="tc-multi-element-count-label">点击数量</span>
                                <input type="number" class="glass-input tc-multi-click-count" data-step-id="${step.id}"
                                       value="${clickCount}" min="1" max="${selectedElements.length || 1}">
                                <span class="tc-multi-element-hint">从 ${selectedElements.length || 0} 个元素中随机选择</span>
                            </div>
                            <div class="tc-multi-elements-list" data-step-id="${step.id}">
                                ${multiElementsHtml}
                            </div>
                            <button type="button" class="tc-add-multi-element-btn" data-step-id="${step.id}">
                                <span class="svg-icon" data-icon="add"></span>
                                <span>添加元素</span>
                            </button>
                        </div>
                    </div>
                </div>
                <div class="form-row tc-single-operation-row ${multiSelect ? 'hidden' : ''}">
                    <div class="form-group">
                        <label>操作类型</label>
                        ${this.tcGenerateCustomSelect('tc-operation-select', operationOptions, '请选择操作', step.id)}
                    </div>
                    <div class="form-group tc-operation-value-group" data-step-id="${step.id}">
                        ${this.tcRenderOperationValue(step)}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 渲染多选元素的操作值输入区域
     */
    tcRenderMultiOperationValue(step, index, operation, operationValue) {
        switch (operation) {
            case 'click':
                const clickCount = operationValue.clickCount || 1;
                return `
                    <label>点击次数</label>
                    <input type="number" class="glass-input tc-multi-click-count-input" data-step-id="${step.id}" data-index="${index}"
                           value="${clickCount}" min="1" max="10">
                `;

            case 'sendText':
                return this.tcRenderMultiSendTextConfig(step, index, operationValue);

            case 'swipeUp':
            case 'swipeDown':
                const swipeDuration = operationValue.swipeDuration || 500;
                return `
                    <label>滑动时间(ms)</label>
                    <input type="number" class="glass-input tc-multi-swipe-duration" data-step-id="${step.id}" data-index="${index}"
                           value="${swipeDuration}" min="100" step="100">
                `;

            default:
                return '';
        }
    }

    /**
     * 渲染多选元素的发送文本配置
     */
    tcRenderMultiSendTextConfig(step, index, operationValue) {
        const inputType = operationValue.inputType || 'custom';
        const inputOptions = [
            {value: 'custom', label: window.i18n.t('testCase.bleCustomData'), selected: inputType === 'custom'},
            {value: 'random', label: window.i18n.t('testCase.inputRandom'), selected: inputType === 'random'},
            {value: 'faker', label: window.i18n.t('testCase.inputFaker'), selected: inputType === 'faker'}
        ];

        return `
            <label>${window.i18n.t('testCase.inputContent')}</label>
            <div class="tc-sendtext-config">
                <div class="tc-input-type-selector">
                    ${this.tcGenerateCustomSelect('tc-multi-input-type-select', inputOptions, window.i18n.t('testCase.inputType'), step.id, index)}
                </div>
                <div class="tc-input-value-container" data-step-id="${step.id}" data-index="${index}">
                    ${this.tcRenderMultiInputValueArea(step, index, inputType, operationValue)}
                </div>
            </div>
        `;
    }

    /**
     * 渲染多选元素的输入值区域
     */
    tcRenderMultiInputValueArea(step, index, inputType, operationValue) {
        switch (inputType) {
            case 'custom':
                return `
                    <input type="text" class="glass-input tc-multi-custom-input" data-step-id="${step.id}" data-index="${index}"
                           value="${operationValue.inputValue || ''}" placeholder="输入文本内容">
                `;

            case 'random':
                const randomConfig = operationValue.randomConfig || {};
                const precisionOptions = [
                    {value: '0', label: '整数', selected: randomConfig.precision === 0 || !randomConfig.precision},
                    {value: '1', label: '1位小数', selected: randomConfig.precision === 1},
                    {value: '2', label: '2位小数', selected: randomConfig.precision === 2},
                    {value: '3', label: '3位小数', selected: randomConfig.precision === 3},
                    {value: '4', label: '4位小数', selected: randomConfig.precision === 4},
                    {value: '5', label: '5位小数', selected: randomConfig.precision === 5}
                ];
                return `
                    <div class="tc-random-config">
                        <div class="form-row">
                            <div class="form-group">
                                <label>最小值</label>
                                <input type="number" class="glass-input tc-multi-random-min" data-step-id="${step.id}" data-index="${index}"
                                       value="${randomConfig.minValue || 0}" step="0.1">
                            </div>
                            <div class="form-group">
                                <label>最大值</label>
                                <input type="number" class="glass-input tc-multi-random-max" data-step-id="${step.id}" data-index="${index}"
                                       value="${randomConfig.maxValue || 100}" step="0.1">
                            </div>
                            <div class="form-group">
                                <label>精度</label>
                                ${this.tcGenerateCustomSelect('tc-multi-random-precision', precisionOptions, '请选择精度', step.id, index)}
                            </div>
                        </div>
                    </div>
                `;

            case 'faker':
                return this.tcRenderMultiFakerConfig(step, index, operationValue);

            default:
                return '';
        }
    }

    /**
     * 渲染多选元素的Faker配置
     */
    tcRenderMultiFakerConfig(step, index, operationValue) {
        const fakerConfig = operationValue.fakerConfig || {};

        const locales = [
            { value: 'zh_CN', label: window.i18n.t('testCase.fakerLocales.zh_CN') },
            { value: 'en_US', label: window.i18n.t('testCase.fakerLocales.en_US') },
            { value: 'ja_JP', label: window.i18n.t('testCase.fakerLocales.ja_JP') },
            { value: 'ko_KR', label: window.i18n.t('testCase.fakerLocales.ko_KR') }
        ];

        const providers = {
            'zh_CN': [
                { value: 'person.name', label: window.i18n.t('testCase.fakerProviders.personName'), example: '张三' },
                { value: 'person.phone', label: window.i18n.t('testCase.fakerProviders.personPhone'), example: '13812345678' },
                { value: 'person.email', label: window.i18n.t('testCase.fakerProviders.personEmail'), example: 'zhangsan@example.com' },
                { value: 'address.city', label: window.i18n.t('testCase.fakerProviders.addressCity'), example: '北京市' },
                { value: 'address.address', label: window.i18n.t('testCase.fakerProviders.addressAddress'), example: '朝阳区xxx街道' },
                { value: 'company.name', label: window.i18n.t('testCase.fakerProviders.companyName'), example: '科技有限公司' }
            ],
            'en_US': [
                { value: 'person.name', label: window.i18n.t('testCase.fakerProviders.personName'), example: 'John Smith' },
                { value: 'person.phone', label: window.i18n.t('testCase.fakerProviders.personPhone'), example: '+1-555-123-4567' },
                { value: 'person.email', label: window.i18n.t('testCase.fakerProviders.personEmail'), example: 'john@example.com' },
                { value: 'address.city', label: window.i18n.t('testCase.fakerProviders.addressCity'), example: 'New York' },
                { value: 'address.address', label: window.i18n.t('testCase.fakerProviders.addressAddress'), example: '123 Main St' },
                { value: 'company.name', label: window.i18n.t('testCase.fakerProviders.companyName'), example: 'Tech Corp' }
            ],
            'ja_JP': [
                { value: 'person.name', label: window.i18n.t('testCase.fakerProviders.personName'), example: '田中太郎' },
                { value: 'person.phone', label: window.i18n.t('testCase.fakerProviders.personPhone'), example: '090-1234-5678' },
                { value: 'person.email', label: window.i18n.t('testCase.fakerProviders.personEmail'), example: 'tanaka@example.jp' },
                { value: 'address.city', label: window.i18n.t('testCase.fakerProviders.addressCity'), example: '東京都' },
                { value: 'address.address', label: window.i18n.t('testCase.fakerProviders.addressAddress'), example: '渋谷区xxx' },
                { value: 'company.name', label: window.i18n.t('testCase.fakerProviders.companyName'), example: '株式会社テック' }
            ],
            'ko_KR': [
                { value: 'person.name', label: window.i18n.t('testCase.fakerProviders.personName'), example: '김철수' },
                { value: 'person.phone', label: window.i18n.t('testCase.fakerProviders.personPhone'), example: '010-1234-5678' },
                { value: 'person.email', label: window.i18n.t('testCase.fakerProviders.personEmail'), example: 'kim@example.kr' },
                { value: 'address.city', label: window.i18n.t('testCase.fakerProviders.addressCity'), example: '서울특별시' },
                { value: 'address.address', label: window.i18n.t('testCase.fakerProviders.addressAddress'), example: '강남구 xxx' },
                { value: 'company.name', label: window.i18n.t('testCase.fakerProviders.companyName'), example: '테크주식회사' }
            ]
        };

        const selectedLocale = fakerConfig.locale || 'zh_CN';
        const selectedProvider = fakerConfig.provider || 'person.name';
        const currentProviders = providers[selectedLocale] || providers['zh_CN'];
        const currentProvider = currentProviders.find(p => p.value === selectedProvider) || currentProviders[0];

        const localeOptions = locales.map(l => ({
            value: l.value,
            label: l.label,
            selected: selectedLocale === l.value
        }));

        const providerOptions = currentProviders.map(p => ({
            value: p.value,
            label: p.label,
            selected: selectedProvider === p.value
        }));

        const languageLabel = window.i18n.t('testCase.fakerLocale');
        const typeLabel = window.i18n.t('testCase.fakerType');
        const exampleLabel = window.i18n.t('testCase.fakerExample');

        return `
            <div class="tc-faker-config">
                <div class="tc-faker-row">
                    <div class="tc-faker-field">
                        <label>${languageLabel}</label>
                        ${this.tcGenerateCustomSelect('tc-multi-faker-locale', localeOptions, window.i18n.t('testCase.fakerLocale'), step.id, index)}
                    </div>
                    <div class="tc-faker-field">
                        <label>${typeLabel}</label>
                        ${this.tcGenerateCustomSelect('tc-multi-faker-provider', providerOptions, window.i18n.t('testCase.fakerType'), step.id, index)}
                    </div>
                </div>
                <div class="tc-faker-example">
                    <span class="tc-faker-example-label">${exampleLabel}:</span>
                    <span class="tc-faker-example-value">${currentProvider?.example || ''}</span>
                </div>
            </div>
        `;
    }

    /**
     * 获取指定页面的元素选项
     */
    tcGetElementOptionsForPage(pageId, selectedValue) {
        const app = this.tcSelectedApp;
        let elementOptions = [{value: '', label: '请选择元素', selected: !selectedValue}];
        if (pageId && app) {
            const page = app.pages?.find(p => p.id === pageId);
            if (page && page.elements) {
                page.elements.forEach(element => {
                    elementOptions.push({value: element.id, label: element.name, selected: selectedValue === element.id});
                });
            }
        }
        return elementOptions;
    }

    tcGetOperationOptionsForLocator(locatorType, currentOperation) {
        const isClickLocator = locatorType === 'click';
        const options = [
            {value: 'click', label: '点击', selected: currentOperation === 'click' || !currentOperation},
            {value: 'swipeUp', label: '向上滑动(页面向下)', selected: currentOperation === 'swipeUp'},
            {value: 'swipeDown', label: '向下滑动(页面向上)', selected: currentOperation === 'swipeDown'}
        ];
        if (!isClickLocator) {
            options.splice(1, 0, {value: 'sendText', label: '发送文本', selected: currentOperation === 'sendText'});
        }
        return options;
    }

    tcGetElementLocatorType(pageId, elementId) {
        const app = this.tcSelectedApp;
        if (pageId && elementId && app) {
            const page = app.pages?.find(p => p.id === pageId);
            const element = page?.elements?.find(el => el.id === elementId);
            return element?.locator || null;
        }
        return null;
    }


    /**
     * 渲染操作值输入区域
     */
    tcRenderOperationValue(step) {
        const config = step.config || {};
        const operation = config.operation || 'click';

        switch (operation) {
            case 'click':
                const clickCount = config.operationValue?.clickCount || 1;
                return `
                    <label>点击次数</label>
                    <input type="number" class="glass-input tc-click-count" data-step-id="${step.id}"
                           value="${clickCount}" min="1" max="10">
                `;

            case 'sendText':
                return this.tcRenderSendTextConfig(step);

            case 'swipeUp':
            case 'swipeDown':
                const duration = config.operationValue?.swipeDuration || 500;
                return `
                    <label>滑动时间(ms)</label>
                    <input type="number" class="glass-input tc-swipe-duration" data-step-id="${step.id}"
                           value="${duration}" min="100" step="100">
                `;

            default:
                return '';
        }
    }

    /**
     * 渲染发送文本配置
     */
    tcRenderSendTextConfig(step) {
        const config = step.config || {};
        const opValue = config.operationValue || {};
        const inputType = opValue.inputType || 'custom';

        // 输入类型选项
        const inputTypeOptions = [
            {value: 'custom', label: window.i18n.t('testCase.bleCustomData'), selected: inputType === 'custom'},
            {value: 'random', label: window.i18n.t('testCase.inputRandom'), selected: inputType === 'random'},
            {value: 'faker', label: window.i18n.t('testCase.inputFaker'), selected: inputType === 'faker'}
        ];

        return `
            <label>${window.i18n.t('testCase.inputContent')}</label>
            <div class="tc-sendtext-config">
                <div class="tc-input-type-selector">
                    ${this.tcGenerateCustomSelect('tc-input-type-select', inputTypeOptions, window.i18n.t('testCase.inputType'), step.id)}
                </div>
                <div class="tc-input-value-container" data-step-id="${step.id}">
                    ${this.tcRenderInputValueArea(step, inputType)}
                </div>
            </div>
        `;
    }

    /**
     * 渲染输入值区域
     */
    tcRenderInputValueArea(step, inputType) {
        const opValue = step.config?.operationValue || {};

        switch (inputType) {
            case 'custom':
                return `
                    <input type="text" class="glass-input tc-custom-input" data-step-id="${step.id}"
                           value="${opValue.inputValue || ''}" placeholder="输入文本内容">
                `;

            case 'random':
                const randomConfig = opValue.randomConfig || {};
                const precisionOptions = [
                    {value: '0', label: '整数', selected: randomConfig.precision === 0 || !randomConfig.precision},
                    {value: '1', label: '1位小数', selected: randomConfig.precision === 1},
                    {value: '2', label: '2位小数', selected: randomConfig.precision === 2},
                    {value: '3', label: '3位小数', selected: randomConfig.precision === 3},
                    {value: '4', label: '4位小数', selected: randomConfig.precision === 4},
                    {value: '5', label: '5位小数', selected: randomConfig.precision === 5}
                ];
                return `
                    <div class="tc-random-config">
                        <div class="form-row">
                            <div class="form-group">
                                <label>最小值</label>
                                <input type="number" class="glass-input tc-random-min" data-step-id="${step.id}"
                                       value="${randomConfig.minValue || 0}" step="0.1">
                            </div>
                            <div class="form-group">
                                <label>最大值</label>
                                <input type="number" class="glass-input tc-random-max" data-step-id="${step.id}"
                                       value="${randomConfig.maxValue || 100}" step="0.1">
                            </div>
                            <div class="form-group">
                                <label>精度</label>
                                ${this.tcGenerateCustomSelect('tc-random-precision', precisionOptions, '请选择精度', step.id)}
                            </div>
                        </div>
                    </div>
                `;

            case 'faker':
                return this.tcRenderFakerConfig(step);

            default:
                return '';
        }
    }

    /**
     * 渲染Faker配置
     */
    tcRenderFakerConfig(step) {
        const opValue = step.config?.operationValue || {};
        const fakerConfig = opValue.fakerConfig || {};

        const locales = [
            { value: 'zh_CN', label: window.i18n.t('testCase.fakerLocales.zh_CN') },
            { value: 'en_US', label: window.i18n.t('testCase.fakerLocales.en_US') },
            { value: 'ja_JP', label: window.i18n.t('testCase.fakerLocales.ja_JP') },
            { value: 'ko_KR', label: window.i18n.t('testCase.fakerLocales.ko_KR') }
        ];

        const providers = {
            'zh_CN': [
                { value: 'person.name', label: window.i18n.t('testCase.fakerProviders.personName'), example: '张三' },
                { value: 'person.phone', label: window.i18n.t('testCase.fakerProviders.personPhone'), example: '13812345678' },
                { value: 'person.email', label: window.i18n.t('testCase.fakerProviders.personEmail'), example: 'zhangsan@example.com' },
                { value: 'address.city', label: window.i18n.t('testCase.fakerProviders.addressCity'), example: '北京市' },
                { value: 'address.address', label: window.i18n.t('testCase.fakerProviders.addressAddress'), example: '朝阳区xxx街道' },
                { value: 'company.name', label: window.i18n.t('testCase.fakerProviders.companyName'), example: '科技有限公司' }
            ],
            'en_US': [
                { value: 'person.name', label: window.i18n.t('testCase.fakerProviders.personName'), example: 'John Smith' },
                { value: 'person.phone', label: window.i18n.t('testCase.fakerProviders.personPhone'), example: '+1-555-123-4567' },
                { value: 'person.email', label: window.i18n.t('testCase.fakerProviders.personEmail'), example: 'john@example.com' },
                { value: 'address.city', label: window.i18n.t('testCase.fakerProviders.addressCity'), example: 'New York' },
                { value: 'address.address', label: window.i18n.t('testCase.fakerProviders.addressAddress'), example: '123 Main St' },
                { value: 'company.name', label: window.i18n.t('testCase.fakerProviders.companyName'), example: 'Tech Corp' }
            ],
            'ja_JP': [
                { value: 'person.name', label: window.i18n.t('testCase.fakerProviders.personName'), example: '田中太郎' },
                { value: 'person.phone', label: window.i18n.t('testCase.fakerProviders.personPhone'), example: '090-1234-5678' },
                { value: 'person.email', label: window.i18n.t('testCase.fakerProviders.personEmail'), example: 'tanaka@example.jp' },
                { value: 'address.city', label: window.i18n.t('testCase.fakerProviders.addressCity'), example: '東京都' },
                { value: 'address.address', label: window.i18n.t('testCase.fakerProviders.addressAddress'), example: '渋谷区xxx' },
                { value: 'company.name', label: window.i18n.t('testCase.fakerProviders.companyName'), example: '株式会社テック' }
            ],
            'ko_KR': [
                { value: 'person.name', label: window.i18n.t('testCase.fakerProviders.personName'), example: '김철수' },
                { value: 'person.phone', label: window.i18n.t('testCase.fakerProviders.personPhone'), example: '010-1234-5678' },
                { value: 'person.email', label: window.i18n.t('testCase.fakerProviders.personEmail'), example: 'kim@example.kr' },
                { value: 'address.city', label: window.i18n.t('testCase.fakerProviders.addressCity'), example: '서울특별시' },
                { value: 'address.address', label: window.i18n.t('testCase.fakerProviders.addressAddress'), example: '강남구 xxx' },
                { value: 'company.name', label: window.i18n.t('testCase.fakerProviders.companyName'), example: '테크주식회사' }
            ]
        };

        const selectedLocale = fakerConfig.locale || 'zh_CN';
        const selectedProvider = fakerConfig.provider || 'person.name';
        const currentProviders = providers[selectedLocale] || providers['zh_CN'];
        const currentProvider = currentProviders.find(p => p.value === selectedProvider) || currentProviders[0];

        const localeOptions = locales.map(l => ({
            value: l.value,
            label: l.label,
            selected: selectedLocale === l.value
        }));

        const providerOptions = currentProviders.map(p => ({
            value: p.value,
            label: p.label,
            selected: selectedProvider === p.value
        }));

        const languageLabel = window.i18n.t('testCase.fakerLocale');
        const typeLabel = window.i18n.t('testCase.fakerType');
        const exampleLabel = window.i18n.t('testCase.fakerExample');

        return `
            <div class="tc-faker-config">
                <div class="tc-faker-row">
                    <div class="tc-faker-field">
                        <label>${languageLabel}</label>
                        ${this.tcGenerateCustomSelect('tc-faker-locale', localeOptions, window.i18n.t('testCase.fakerLocale'), step.id)}
                    </div>
                    <div class="tc-faker-field">
                        <label>${typeLabel}</label>
                        ${this.tcGenerateCustomSelect('tc-faker-provider', providerOptions, window.i18n.t('testCase.fakerType'), step.id)}
                    </div>
                </div>
                <div class="tc-faker-example">
                    <span class="tc-faker-example-label">${exampleLabel}:</span>
                    <span class="tc-faker-example-value">${currentProvider?.example || ''}</span>
                </div>
            </div>
        `;
    }

    tcRenderSystemConfig(step) {
        const config = step.config || {};
        const systemConfig = config.systemConfig || {};
        const operationType = systemConfig.operationType || 'navigation';
        const navKey = systemConfig.navKey || 'back';
        const clickCount = systemConfig.clickCount || 1;

        const operationTypeOptions = [
            {value: 'navigation', label: window.i18n.t('testCase.navigationBar'), selected: operationType === 'navigation'}
        ];

        const navKeyOptions = [
            {value: 'back', label: window.i18n.t('testCase.navBack'), selected: navKey === 'back'},
            {value: 'home', label: window.i18n.t('testCase.navHome'), selected: navKey === 'home'},
            {value: 'recent', label: window.i18n.t('testCase.navRecent'), selected: navKey === 'recent'}
        ];

        return `
            <div class="tc-step-config tc-system-config">
                <div class="form-row">
                    <div class="form-group">
                        <label>${window.i18n.t('testCase.systemOperationType')}</label>
                        ${this.tcGenerateCustomSelect('tc-system-operation-type', operationTypeOptions, window.i18n.t('testCase.selectSystemOperationType'), step.id)}
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>${window.i18n.t('testCase.keySelect')}</label>
                        ${this.tcGenerateCustomSelect('tc-nav-key-select', navKeyOptions, window.i18n.t('testCase.selectKey'), step.id)}
                    </div>
                    <div class="form-group">
                        <label>${window.i18n.t('testCase.clickCount')}</label>
                        <input type="number" class="glass-input tc-nav-click-count" data-step-id="${step.id}"
                               value="${clickCount}" min="1" step="1">
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 渲染蓝牙操作配置
     */
    tcRenderBleConfig(step) {
        const config = step.config || {};
        const deviceConfig = config.deviceConfig || {};

        let methodOptionsHtml = '';
        let paramsHtml = '';

        if (deviceConfig.deviceId && this.tcBleDevices.length > 0) {
            const device = this.tcBleDevices.find(d => d.deviceId === deviceConfig.deviceId);
            if (device && device.methods) {
                const methodOptions = device.methods.map(m => ({
                    value: m.name,
                    label: m.displayName || m.name,
                    selected: deviceConfig.methodName === m.name
                }));
                methodOptionsHtml = `
                    <div class="form-group">
                        <label>${window.i18n.t('testCase.bleMethod')}</label>
                        ${this.tcGenerateCustomSelect('tc-ble-method-select', methodOptions, window.i18n.t('testCase.bleMethodPlaceholder'), step.id)}
                    </div>
                `;

                if (deviceConfig.methodName) {
                    const method = device.methods.find(m => m.name === deviceConfig.methodName);
                    if (method && method.params) {
                        paramsHtml = this.tcRenderDeviceParams(method.params, deviceConfig.params || {}, step.id);
                    }
                }
            }
        }

        return `
            <div class="tc-step-config tc-ble-config" data-step-id="${step.id}">
                <div class="form-group">
                    <label>${window.i18n.t('testCase.bleDeviceSelect')}</label>
                    <div class="tc-ble-device-select-container" data-step-id="${step.id}"></div>
                </div>
                ${methodOptionsHtml}
                <div class="tc-ble-params-container" data-step-id="${step.id}">
                    ${paramsHtml}
                </div>
            </div>
        `;
    }

    tcRenderDeviceParams(params, paramValues, stepId) {
        if (!params || params.length === 0) return '';

        const fieldsHtml = params.map(param => {
            const value = paramValues[param.key] !== undefined ? paramValues[param.key] : (param.default !== undefined ? param.default : '');

            if (param.type === 'select') {
                const options = (param.options || []).map(opt => ({
                    value: String(opt.value),
                    label: opt.label,
                    selected: String(value) === String(opt.value)
                }));
                return `
                    <div class="form-group">
                        <label>${param.label}</label>
                        ${this.tcGenerateCustomSelect(`tc-ble-param-${param.key}`, options, param.placeholder || '请选择', stepId)}
                    </div>
                `;
            } else if (param.type === 'number') {
                const step = param.step || 'any';
                const precisionAttr = param.precision !== undefined ? ` data-precision="${param.precision}"` : '';
                return `
                    <div class="form-group">
                        <label>${param.label}</label>
                        <input type="number" class="glass-input tc-ble-param-input" data-step-id="${stepId}" data-param-key="${param.key}"
                               value="${value}" step="${step}" placeholder="${param.placeholder || ''}"${precisionAttr}>
                    </div>
                `;
            } else {
                return `
                    <div class="form-group">
                        <label>${param.label}</label>
                        <input type="text" class="glass-input tc-ble-param-input" data-step-id="${stepId}" data-param-key="${param.key}"
                               value="${value}" placeholder="${param.placeholder || ''}">
                    </div>
                `;
            }
        }).join('');

        return `<div class="tc-ble-device-params"><div class="form-row">${fieldsHtml}</div></div>`;
    }

    /**
     * 渲染蓝牙操作配置内容（用于动态更新）
     */
    tcRenderBleOperationConfigContent(step) {
        const config = step.config || {};
        const deviceConfig = config.deviceConfig || {};

        let methodOptionsHtml = '';
        let paramsHtml = '';

        if (deviceConfig.deviceId && this.tcBleDevices.length > 0) {
            const device = this.tcBleDevices.find(d => d.deviceId === deviceConfig.deviceId);
            if (device && device.methods) {
                const methodOptions = device.methods.map(m => ({
                    value: m.name,
                    label: m.displayName || m.name,
                    selected: deviceConfig.methodName === m.name
                }));
                methodOptionsHtml = `
                    <div class="form-group">
                        <label>${window.i18n.t('testCase.bleMethod')}</label>
                        ${this.tcGenerateCustomSelect('tc-ble-method-select', methodOptions, window.i18n.t('testCase.bleMethodPlaceholder'), step.id)}
                    </div>
                `;

                if (deviceConfig.methodName) {
                    const method = device.methods.find(m => m.name === deviceConfig.methodName);
                    if (method && method.params) {
                        paramsHtml = this.tcRenderDeviceParams(method.params, deviceConfig.params || {}, step.id);
                    }
                }
            }
        }

        return `
            <div class="tc-ble-device-select-container" data-step-id="${step.id}"></div>
            ${methodOptionsHtml}
            <div class="tc-ble-params-container" data-step-id="${step.id}">
                ${paramsHtml}
            </div>
        `;
    }

    /**
     * 渲染页面操作配置
     */
    tcRenderPageConfig(step) {
        const config = step.config || {};
        if (!config.operationType) {
            config.operationType = 'compare';
        }
        const operationType = config.operationType;

        const operationTypeOptions = [
            {value: 'compare', label: window.i18n.t('testCase.pageCompare'), selected: operationType === 'compare'},
            {value: 'search', label: window.i18n.t('testCase.pageSearch'), selected: operationType === 'search'}
        ];

        const app = this.tcSelectedApp;
        let compareElementPageOptions = [{value: '', label: window.i18n.t('pagePackage.selectPage'), selected: !config.compareConfig?.pageId}];
        if (app && app.pages) {
            app.pages.forEach(page => {
                compareElementPageOptions.push({value: page.id, label: page.name, selected: config.compareConfig?.pageId === page.id});
            });
        }

        let compareElementOptions = [{value: '', label: window.i18n.t('pagePackage.selectElement'), selected: true}];
        if (config.compareConfig?.pageId && app) {
            const page = app.pages?.find(p => p.id === config.compareConfig.pageId);
            if (page && page.elements) {
                compareElementOptions = [{value: '', label: window.i18n.t('pagePackage.selectElement'), selected: !config.compareConfig.elementId}];
                page.elements.forEach(element => {
                    compareElementOptions.push({value: element.id, label: element.name, selected: config.compareConfig.elementId === element.id});
                });
            }
        }

        const compareConfig = config.compareConfig || {};
        if (!compareConfig.targetValueType) {
            compareConfig.targetValueType = 'custom';
            config.compareConfig = compareConfig;
        }
        const targetValueType = compareConfig.targetValueType;

        const currentStepIndex = this.tcSteps.findIndex(s => s.id === step.id);
        const hasBleSteps = this.tcSteps.some((s, index) =>
            index < currentStepIndex &&
            s.type === 'ble' &&
            (s.config?.deviceConfig?.methodName === 'send_random_data' || s.config?.deviceConfig?.methodName === 'send_custom_data')
        );

        const targetValueOptions = [
            {value: 'custom', label: window.i18n.t('testCase.bleCustomData'), selected: targetValueType === 'custom'}
        ];
        if (hasBleSteps) {
            targetValueOptions.push({
                value: 'ble',
                label: window.i18n.t('testCase.bleOperation'),
                selected: targetValueType === 'ble'
            });
        }

        const bleStepId = compareConfig.bleStepId || '';
        const bleStepOptions = [{value: '', label: window.i18n.t('testCase.selectStep'), selected: !bleStepId}];
        this.tcSteps.forEach((s, index) => {
            if (index < currentStepIndex &&
                s.type === 'ble' &&
                (s.config?.deviceConfig?.methodName === 'send_random_data' || s.config?.deviceConfig?.methodName === 'send_custom_data')) {
                bleStepOptions.push({
                    value: s.id,
                    label: `${s.name} ${window.i18n.t('testCase.generatedRandomValue')}`,
                    selected: bleStepId === s.id
                });
            }
        });

        const isBleTarget = targetValueType === 'ble';
        const showCustomInput = targetValueType === 'custom';
        const showBleStepSelect = isBleTarget;
        const toleranceDisabled = !isBleTarget && compareConfig.targetValue && isNaN(parseFloat(compareConfig.targetValue));

        const searchConfig = config.searchConfig || {};
        if (!searchConfig.searchType) {
            searchConfig.searchType = 'element';
            config.searchConfig = searchConfig;
        }
        const searchType = searchConfig.searchType;
        const searchTypeOptions = [
            {value: 'element', label: window.i18n.t('testCase.searchTypeElement'), selected: searchType === 'element'},
            {value: 'text', label: window.i18n.t('testCase.searchTypeText'), selected: searchType === 'text'}
        ];
        const searchMatchType = searchConfig.matchType || 'contains';

        let searchElementPageOptions = [{value: '', label: window.i18n.t('pagePackage.selectPage'), selected: !searchConfig.pageId}];
        if (app && app.pages) {
            app.pages.forEach(page => {
                searchElementPageOptions.push({value: page.id, label: page.name, selected: searchConfig.pageId === page.id});
            });
        }

        let searchElementOptions = [{value: '', label: window.i18n.t('pagePackage.selectElement'), selected: true}];
        if (searchConfig.pageId && app) {
            const page = app.pages?.find(p => p.id === searchConfig.pageId);
            if (page && page.elements) {
                searchElementOptions = [{value: '', label: window.i18n.t('pagePackage.selectElement'), selected: !searchConfig.elementId}];
                page.elements.forEach(element => {
                    searchElementOptions.push({value: element.id, label: element.name, selected: searchConfig.elementId === element.id});
                });
            }
        }

        return `
            <div class="tc-step-config tc-page-config">
                <div class="form-row">
                    <div class="form-group">
                        <label>${window.i18n.t('testCase.pageOperationType')}</label>
                        ${this.tcGenerateCustomSelect('tc-page-operation-type', operationTypeOptions, window.i18n.t('testCase.selectOperationType'), step.id)}
                    </div>
                </div>
                <div class="tc-page-compare-config ${operationType === 'compare' ? '' : 'hidden'}" data-step-id="${step.id}">
                    <div class="tc-compare-group">
                        <div class="form-row">
                            <div class="form-group">
                                <label>${window.i18n.t('testCase.compareSource')}</label>
                                ${this.tcGenerateCustomSelect('tc-target-value-type', targetValueOptions, window.i18n.t('testCase.selectCompareSource'), step.id)}
                            </div>
                            <div class="form-group tc-custom-target-value-group ${showCustomInput ? '' : 'hidden'}">
                                <label>${window.i18n.t('testCase.targetValue')}</label>
                                <input type="text" class="glass-input tc-compare-target-value" data-step-id="${step.id}"
                                       value="${compareConfig.targetValue || ''}" placeholder="${window.i18n.t('testCase.enterTargetValue')}">
                            </div>
                        </div>
                        <div class="form-row tc-ble-step-select-group ${showBleStepSelect ? '' : 'hidden'}">
                            <div class="form-group">
                                <label>${window.i18n.t('testCase.stepSelect')}</label>
                                ${this.tcGenerateCustomSelect('tc-ble-step-select', bleStepOptions, window.i18n.t('testCase.selectStep'), step.id)}
                            </div>
                        </div>
                    </div>
                    <div class="tc-compare-group">
                        <div class="form-row">
                            <div class="form-group">
                                <label>${window.i18n.t('testCase.compareElementPage')}</label>
                                ${this.tcGenerateCustomSelect('tc-compare-element-page', compareElementPageOptions, window.i18n.t('pagePackage.selectPage'), step.id)}
                            </div>
                            <div class="form-group">
                                <label>${window.i18n.t('testCase.compareElement')}</label>
                                ${this.tcGenerateCustomSelect('tc-compare-element-select', compareElementOptions, window.i18n.t('pagePackage.selectElement'), step.id)}
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
                            ${this.tcGenerateCustomSelect('tc-search-type', searchTypeOptions, window.i18n.t('testCase.selectSearchType'), step.id)}
                        </div>
                    </div>
                    <div class="tc-search-element-group ${searchType === 'element' ? '' : 'hidden'}" data-step-id="${step.id}">
                        <div class="tc-compare-group">
                            <div class="form-row">
                                <div class="form-group">
                                    <label>${window.i18n.t('testCase.searchElementPage')}</label>
                                    ${this.tcGenerateCustomSelect('tc-search-element-page', searchElementPageOptions, window.i18n.t('pagePackage.selectPage'), step.id)}
                                </div>
                                <div class="form-group">
                                    <label>${window.i18n.t('testCase.searchElement')}</label>
                                    ${this.tcGenerateCustomSelect('tc-search-element-select', searchElementOptions, window.i18n.t('pagePackage.selectElement'), step.id)}
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="tc-search-text-group ${searchType === 'text' ? '' : 'hidden'}" data-step-id="${step.id}">
                        <div class="form-row">
                            <div class="form-group">
                                <label>${window.i18n.t('testCase.searchTextValue')}</label>
                                <input type="text" class="glass-input tc-search-text-value" data-step-id="${step.id}"
                                       value="${searchConfig.textValue || ''}" placeholder="${window.i18n.t('testCase.enterSearchText')}">
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
    }

    /**
     * 绑定步骤卡片事件
     */
    tcBindStepCardEvents(card, step) {
        const stepId = step.id;

        card.addEventListener('change', (e) => {
            if (e.target.matches('input, select, textarea')) {
                this.tcMarkDirty();
            }
        });

        // 步骤名称变更
        const nameInput = card.querySelector('.tc-step-name-input');
        if (nameInput) {
            nameInput.addEventListener('change', (e) => {
                step.name = e.target.value;
                this.tcMarkDirty();
            });
        }

        // 复制按钮
        const copyBtn = card.querySelector('.tc-step-copy-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => this.tcCopyStep(stepId));
        }

        // 删除按钮
        const deleteBtn = card.querySelector('.tc-step-delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => this.tcDeleteStep(stepId));
        }

        // 步骤类型切换
        const typeTabs = card.querySelectorAll('.tc-type-tab');
        typeTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                typeTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                const bleContainer = card.querySelector('.tc-ble-device-select-container');
                if (bleContainer && bleContainer.id && window.DeviceCascadeSelect && window.DeviceCascadeSelect.instances[bleContainer.id]) {
                    window.DeviceCascadeSelect.instances[bleContainer.id].destroy();
                }

                step.type = tab.dataset.type;
                this.tcMarkDirty();
                const body = card.querySelector('.tc-step-body');
                body.innerHTML = this.tcRenderStepConfig(step);
                this.tcBindStepCardEvents(card, step);
                this.initializeIcons();
                this.tcInitStepSelects(card);
                if (step.type === 'ble') {
                    this.tcInitBleCascadeSelect(card, step);
                }
            });
        });

        // 元素操作相关事件
        this.tcBindElementEvents(card, step);

        // 蓝牙操作相关事件
        this.tcBindBleEvents(card, step);

        // 页面操作相关事件
        this.tcBindPageEvents(card, step);

        // 系统操作相关事件
        this.tcBindSystemEvents(card, step);
    }

    /**
     * 绑定元素操作事件
     */
    tcBindElementEvents(card, step) {
        // 操作值事件
        this.tcBindOperationValueEvents(card, step);
        
        // 多选功能事件绑定
        this.tcBindMultiSelectEvents(card, step);
    }

    /**
     * 绑定多选功能事件
     */
    tcBindMultiSelectEvents(card, step) {
        const stepId = step.id;
        
        // 多选复选框
        const multiSelectCheckbox = card.querySelector('.tc-multi-select-checkbox');
        if (multiSelectCheckbox) {
            multiSelectCheckbox.addEventListener('change', (e) => {
                step.config.multiSelect = e.target.checked;
                if (e.target.checked) {
                    // 初始化多选元素列表
                    step.config.selectedElements = step.config.selectedElements || [];
                    if (step.config.selectedElements.length === 0) {
                        step.config.selectedElements = [''];
                    }
                    step.config.multiClickCount = 1;
                } else {
                    // 清空多选相关数据
                    step.config.selectedElements = [];
                    step.config.multiClickCount = 1;
                }
                // 重新渲染元素选择区域
                this.tcReRenderElementSelect(card, step);
                // 控制操作类型行的显示/隐藏
                const singleOperationRow = card.querySelector('.tc-single-operation-row');
                if (singleOperationRow) {
                    if (e.target.checked) {
                        singleOperationRow.classList.add('hidden');
                    } else {
                        singleOperationRow.classList.remove('hidden');
                    }
                }
                this.initializeIcons();
                this.tcInitStepSelects(card);
                // 重新绑定事件
                this.tcBindMultiSelectEvents(card, step);
            });
        }
        
        // 点击数量输入
        const multiClickCountInput = card.querySelector('.tc-multi-click-count');
        if (multiClickCountInput) {
            multiClickCountInput.addEventListener('change', (e) => {
                const maxCount = step.config.selectedElements?.length || 1;
                let value = parseInt(e.target.value) || 1;
                value = Math.max(1, Math.min(value, maxCount));
                step.config.multiClickCount = value;
                e.target.value = value;
            });
        }
        
        // 添加元素按钮
        const addElementBtn = card.querySelector('.tc-add-multi-element-btn');
        if (addElementBtn) {
            addElementBtn.addEventListener('click', () => {
                step.config.selectedElements = step.config.selectedElements || [];
                step.config.selectedElements.push('');
                // 更新点击数量最大值
                const countInput = card.querySelector('.tc-multi-click-count');
                if (countInput) {
                    countInput.max = step.config.selectedElements.length;
                }
                // 重新渲染
                this.tcReRenderElementSelect(card, step);
                this.initializeIcons();
                this.tcInitStepSelects(card);
                // 重新绑定事件
                this.tcBindMultiSelectEvents(card, step);
            });
        }
        
        // 删除元素按钮
        const removeBtns = card.querySelectorAll('.tc-multi-element-remove-btn');
        removeBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.currentTarget.dataset.index);
                step.config.selectedElements = step.config.selectedElements || [];
                step.config.selectedElements.splice(index, 1);
                // 更新点击数量
                const countInput = card.querySelector('.tc-multi-click-count');
                if (countInput && step.config.multiClickCount > step.config.selectedElements.length) {
                    step.config.multiClickCount = step.config.selectedElements.length || 1;
                    countInput.value = step.config.multiClickCount;
                    countInput.max = step.config.selectedElements.length || 1;
                }
                // 重新渲染
                this.tcReRenderElementSelect(card, step);
                this.initializeIcons();
                this.tcInitStepSelects(card);
                // 重新绑定事件
                this.tcBindMultiSelectEvents(card, step);
            });
        });

        // 多选元素的点击次数输入
        const multiClickCountInputs = card.querySelectorAll('.tc-multi-click-count-input');
        multiClickCountInputs.forEach(input => {
            input.addEventListener('change', (e) => {
                const index = parseInt(e.target.dataset.index);
                const currentElem = step.config.selectedElements?.[index];
                if (typeof currentElem === 'object') {
                    currentElem.operationValue = currentElem.operationValue || {};
                    currentElem.operationValue.clickCount = parseInt(e.target.value) || 1;
                }
            });
        });

        // 多选元素的滑动时间输入
        const multiSwipeDurations = card.querySelectorAll('.tc-multi-swipe-duration');
        multiSwipeDurations.forEach(input => {
            input.addEventListener('change', (e) => {
                const index = parseInt(e.target.dataset.index);
                const currentElem = step.config.selectedElements?.[index];
                if (typeof currentElem === 'object') {
                    currentElem.operationValue = currentElem.operationValue || {};
                    currentElem.operationValue.swipeDuration = parseInt(e.target.value) || 500;
                }
            });
        });

        // 多选元素的自定义输入
        const multiCustomInputs = card.querySelectorAll('.tc-multi-custom-input');
        multiCustomInputs.forEach(input => {
            input.addEventListener('change', (e) => {
                const index = parseInt(e.target.dataset.index);
                const currentElem = step.config.selectedElements?.[index];
                if (typeof currentElem === 'object') {
                    currentElem.operationValue = currentElem.operationValue || {};
                    currentElem.operationValue.inputValue = e.target.value;
                }
            });
        });

        // 多选元素的随机范围配置
        const multiRandomMins = card.querySelectorAll('.tc-multi-random-min');
        const multiRandomMaxs = card.querySelectorAll('.tc-multi-random-max');
        multiRandomMins.forEach(input => {
            input.addEventListener('change', (e) => {
                const index = parseInt(e.target.dataset.index);
                const currentElem = step.config.selectedElements?.[index];
                if (typeof currentElem === 'object') {
                    currentElem.operationValue = currentElem.operationValue || {};
                    currentElem.operationValue.randomConfig = currentElem.operationValue.randomConfig || {};
                    currentElem.operationValue.randomConfig.minValue = parseFloat(e.target.value) || 0;
                }
            });
        });
        multiRandomMaxs.forEach(input => {
            input.addEventListener('change', (e) => {
                const index = parseInt(e.target.dataset.index);
                const currentElem = step.config.selectedElements?.[index];
                if (typeof currentElem === 'object') {
                    currentElem.operationValue = currentElem.operationValue || {};
                    currentElem.operationValue.randomConfig = currentElem.operationValue.randomConfig || {};
                    currentElem.operationValue.randomConfig.maxValue = parseFloat(e.target.value) || 100;
                }
            });
        });
    }

    tcBindMultiSelectValueEvents(container, step) {
        const multiClickCountInputs = container.querySelectorAll('.tc-multi-click-count-input');
        multiClickCountInputs.forEach(input => {
            input.addEventListener('change', (e) => {
                const index = parseInt(e.target.dataset.index);
                const currentElem = step.config.selectedElements?.[index];
                if (typeof currentElem === 'object') {
                    currentElem.operationValue = currentElem.operationValue || {};
                    currentElem.operationValue.clickCount = parseInt(e.target.value) || 1;
                }
            });
        });

        const multiSwipeDurations = container.querySelectorAll('.tc-multi-swipe-duration');
        multiSwipeDurations.forEach(input => {
            input.addEventListener('change', (e) => {
                const index = parseInt(e.target.dataset.index);
                const currentElem = step.config.selectedElements?.[index];
                if (typeof currentElem === 'object') {
                    currentElem.operationValue = currentElem.operationValue || {};
                    currentElem.operationValue.swipeDuration = parseInt(e.target.value) || 500;
                }
            });
        });

        const multiCustomInputs = container.querySelectorAll('.tc-multi-custom-input');
        multiCustomInputs.forEach(input => {
            input.addEventListener('change', (e) => {
                const index = parseInt(e.target.dataset.index);
                const currentElem = step.config.selectedElements?.[index];
                if (typeof currentElem === 'object') {
                    currentElem.operationValue = currentElem.operationValue || {};
                    currentElem.operationValue.inputValue = e.target.value;
                }
            });
        });

        const multiRandomMins = container.querySelectorAll('.tc-multi-random-min');
        const multiRandomMaxs = container.querySelectorAll('.tc-multi-random-max');
        multiRandomMins.forEach(input => {
            input.addEventListener('change', (e) => {
                const index = parseInt(e.target.dataset.index);
                const currentElem = step.config.selectedElements?.[index];
                if (typeof currentElem === 'object') {
                    currentElem.operationValue = currentElem.operationValue || {};
                    currentElem.operationValue.randomConfig = currentElem.operationValue.randomConfig || {};
                    currentElem.operationValue.randomConfig.minValue = parseFloat(e.target.value) || 0;
                }
            });
        });
        multiRandomMaxs.forEach(input => {
            input.addEventListener('change', (e) => {
                const index = parseInt(e.target.dataset.index);
                const currentElem = step.config.selectedElements?.[index];
                if (typeof currentElem === 'object') {
                    currentElem.operationValue = currentElem.operationValue || {};
                    currentElem.operationValue.randomConfig = currentElem.operationValue.randomConfig || {};
                    currentElem.operationValue.randomConfig.maxValue = parseFloat(e.target.value) || 100;
                }
            });
        });
    }

    /**
     * 重新渲染元素选择区域
     */
    tcReRenderElementSelect(card, step) {
        const config = step.config || {};
        const multiSelect = config.multiSelect || false;
        const clickCount = config.multiClickCount || 1;
        const selectedElements = config.selectedElements || [];
        const app = this.tcSelectedApp;
        
        // 获取元素选项
        let elementOptions = [{value: '', label: '请选择元素', selected: true}];
        if (config.pageId && app) {
            const page = app.pages?.find(p => p.id === config.pageId);
            if (page && page.elements) {
                elementOptions = [{value: '', label: '请选择元素', selected: !config.elementId}];
                page.elements.forEach(element => {
                    elementOptions.push({value: element.id, label: element.name, selected: config.elementId === element.id});
                });
            }
        }
        
        // 渲染多选元素列表
        let multiElementsHtml = '';
        if (multiSelect && selectedElements.length > 0) {
            selectedElements.forEach((elemConfig, index) => {
                const elemId = typeof elemConfig === 'string' ? elemConfig : elemConfig.elementId;
                const elemOperation = typeof elemConfig === 'object' ? (elemConfig.operation || 'click') : 'click';
                const elemOperationValue = typeof elemConfig === 'object' ? (elemConfig.operationValue || {}) : {};
                
                const elemOptions = this.tcGetElementOptionsForPage(config.pageId, elemId);
                const elemLocatorType = this.tcGetElementLocatorType(config.pageId, elemId);
                const elemOperationOptions = this.tcGetOperationOptionsForLocator(elemLocatorType, elemOperation);
                
                multiElementsHtml += `
                    <div class="tc-multi-element-item" data-index="${index}" data-step-id="${step.id}">
                        <div class="tc-multi-element-header">
                            <span class="tc-multi-element-number">${index + 1}</span>
                            ${this.tcGenerateCustomSelect('tc-multi-element-select', elemOptions, '请选择元素', step.id, index)}
                            <button type="button" class="tc-multi-element-remove-btn" data-step-id="${step.id}" data-index="${index}">
                                <span class="svg-icon" data-icon="close"></span>
                            </button>
                        </div>
                        <div class="tc-multi-element-body">
                            <div class="form-group">
                                <label>操作类型</label>
                                ${this.tcGenerateCustomSelect('tc-multi-operation-select', elemOperationOptions, '请选择操作', step.id, index)}
                            </div>
                            <div class="form-group tc-multi-operation-value-group" data-step-id="${step.id}" data-index="${index}">
                                ${this.tcRenderMultiOperationValue(step, index, elemOperation, elemOperationValue)}
                            </div>
                        </div>
                    </div>
                `;
            });
        }
        
        const elementSelectGroup = card.querySelector('.tc-element-select-group');
        if (elementSelectGroup) {
            elementSelectGroup.innerHTML = `
                <div class="tc-element-select-header">
                    <label>元素选择</label>
                </div>
                <label class="tc-multi-select-toggle">
                    <input type="checkbox" class="tc-multi-select-checkbox" data-step-id="${step.id}" ${multiSelect ? 'checked' : ''}>
                    <span>元素多选</span>
                </label>
                <div class="tc-single-element-select ${multiSelect ? 'hidden' : ''}">
                    ${this.tcGenerateCustomSelect('tc-element-select', elementOptions, '请选择元素', step.id)}
                </div>
                <div class="tc-multi-element-config ${multiSelect ? '' : 'hidden'}">
                    <div class="tc-multi-element-count-row">
                        <span class="tc-multi-element-count-label">点击数量</span>
                        <input type="number" class="glass-input tc-multi-click-count" data-step-id="${step.id}"
                               value="${clickCount}" min="1" max="${selectedElements.length || 1}">
                        <span class="tc-multi-element-hint">从 ${selectedElements.length || 0} 个元素中随机选择</span>
                    </div>
                    <div class="tc-multi-elements-list" data-step-id="${step.id}">
                        ${multiElementsHtml}
                    </div>
                    <button type="button" class="tc-add-multi-element-btn" data-step-id="${step.id}">
                        <span class="svg-icon" data-icon="add"></span>
                        <span>添加元素</span>
                    </button>
                </div>
            `;
        }
    }

    /**
     * 绑定操作值事件
     */
    tcBindOperationValueEvents(card, step) {
        // 点击次数
        const clickCount = card.querySelector('.tc-click-count');
        if (clickCount) {
            clickCount.addEventListener('change', (e) => {
                step.config.operationValue = step.config.operationValue || {};
                step.config.operationValue.clickCount = parseInt(e.target.value) || 1;
            });
        }

        // 滑动时间
        const swipeDuration = card.querySelector('.tc-swipe-duration');
        if (swipeDuration) {
            swipeDuration.addEventListener('change', (e) => {
                step.config.operationValue = step.config.operationValue || {};
                step.config.operationValue.swipeDuration = parseInt(e.target.value) || 500;
            });
        }

        // 自定义输入
        const customInput = card.querySelector('.tc-custom-input');
        if (customInput) {
            customInput.addEventListener('change', (e) => {
                step.config.operationValue = step.config.operationValue || {};
                step.config.operationValue.inputValue = e.target.value;
            });
        }

        this.tcBindInputValueEvents(card, step);
    }

    /**
     * 绑定输入值事件
     */
    tcBindInputValueEvents(card, step) {
        // 自定义输入
        const customInput = card.querySelector('.tc-custom-input');
        if (customInput) {
            customInput.addEventListener('change', (e) => {
                step.config.operationValue = step.config.operationValue || {};
                step.config.operationValue.inputValue = e.target.value;
            });
        }

        // 随机范围配置
        const minInput = card.querySelector('.tc-random-min');
        const maxInput = card.querySelector('.tc-random-max');
        if (minInput) {
            minInput.addEventListener('change', (e) => {
                step.config.operationValue = step.config.operationValue || {};
                step.config.operationValue.randomConfig = step.config.operationValue.randomConfig || {};
                step.config.operationValue.randomConfig.minValue = parseFloat(e.target.value) || 0;
            });
        }
        if (maxInput) {
            maxInput.addEventListener('change', (e) => {
                step.config.operationValue = step.config.operationValue || {};
                step.config.operationValue.randomConfig = step.config.operationValue.randomConfig || {};
                step.config.operationValue.randomConfig.maxValue = parseFloat(e.target.value) || 100;
            });
        }
    }

    /**
     * 更新Faker类型选项（通过card元素）
     */
    tcUpdateFakerProvidersByCard(card, step, locale) {
        const providerSelect = card.querySelector('.tc-faker-provider');
        if (!providerSelect) return;

        const providers = {
            'zh_CN': [
                { value: 'person.name', label: window.i18n.t('testCase.fakerProviders.personName'), example: '张三' },
                { value: 'person.phone', label: window.i18n.t('testCase.fakerProviders.personPhone'), example: '13812345678' },
                { value: 'person.email', label: window.i18n.t('testCase.fakerProviders.personEmail'), example: 'zhangsan@example.com' },
                { value: 'address.city', label: window.i18n.t('testCase.fakerProviders.addressCity'), example: '北京市' },
                { value: 'address.address', label: window.i18n.t('testCase.fakerProviders.addressAddress'), example: '朝阳区xxx街道' },
                { value: 'company.name', label: window.i18n.t('testCase.fakerProviders.companyName'), example: '科技有限公司' }
            ],
            'en_US': [
                { value: 'person.name', label: window.i18n.t('testCase.fakerProviders.personName'), example: 'John Smith' },
                { value: 'person.phone', label: window.i18n.t('testCase.fakerProviders.personPhone'), example: '+1-555-123-4567' },
                { value: 'person.email', label: window.i18n.t('testCase.fakerProviders.personEmail'), example: 'john@example.com' },
                { value: 'address.city', label: window.i18n.t('testCase.fakerProviders.addressCity'), example: 'New York' },
                { value: 'address.address', label: window.i18n.t('testCase.fakerProviders.addressAddress'), example: '123 Main St' },
                { value: 'company.name', label: window.i18n.t('testCase.fakerProviders.companyName'), example: 'Tech Corp' }
            ],
            'ja_JP': [
                { value: 'person.name', label: window.i18n.t('testCase.fakerProviders.personName'), example: '田中太郎' },
                { value: 'person.phone', label: window.i18n.t('testCase.fakerProviders.personPhone'), example: '090-1234-5678' },
                { value: 'person.email', label: window.i18n.t('testCase.fakerProviders.personEmail'), example: 'tanaka@example.jp' },
                { value: 'address.city', label: window.i18n.t('testCase.fakerProviders.addressCity'), example: '東京都' },
                { value: 'address.address', label: window.i18n.t('testCase.fakerProviders.addressAddress'), example: '渋谷区xxx' },
                { value: 'company.name', label: window.i18n.t('testCase.fakerProviders.companyName'), example: '株式会社テック' }
            ],
            'ko_KR': [
                { value: 'person.name', label: window.i18n.t('testCase.fakerProviders.personName'), example: '김철수' },
                { value: 'person.phone', label: window.i18n.t('testCase.fakerProviders.personPhone'), example: '010-1234-5678' },
                { value: 'person.email', label: window.i18n.t('testCase.fakerProviders.personEmail'), example: 'kim@example.kr' },
                { value: 'address.city', label: window.i18n.t('testCase.fakerProviders.addressCity'), example: '서울특별시' },
                { value: 'address.address', label: window.i18n.t('testCase.fakerProviders.addressAddress'), example: '강남구 xxx' },
                { value: 'company.name', label: window.i18n.t('testCase.fakerProviders.companyName'), example: '테크주식회사' }
            ]
        };

        const currentProviders = providers[locale] || providers['zh_CN'];
        providerSelect.innerHTML = currentProviders.map(p =>
            `<option value="${p.value}">${p.label}</option>`
        ).join('');

        if (currentProviders.length > 0) {
            this.tcUpdateFakerExample(card, currentProviders[0].value);
        }
    }

    /**
     * 更新Faker示例
     */
    tcUpdateFakerExample(card, provider) {
        const exampleSpan = card.querySelector('.tc-faker-example-value');
        if (!exampleSpan) return;

        const examples = {
            'person.name': '张三',
            'person.phone': '13812345678',
            'person.email': 'zhangsan@example.com',
            'address.city': '北京市',
            'address.address': '朝阳区xxx街道',
            'company.name': '科技有限公司'
        };

        exampleSpan.textContent = examples[provider] || '';
    }

    /**
     * 绑定蓝牙操作事件
     */
    tcBindBleEvents(card, step) {
        const paramInputs = card.querySelectorAll('.tc-ble-param-input');
        paramInputs.forEach(input => {
            input.addEventListener('input', (e) => {
                const precision = e.target.dataset.precision;
                if (precision !== undefined && e.target.type === 'number') {
                    const value = e.target.value;
                    if (value.includes('.')) {
                        const parts = value.split('.');
                        const maxDecimals = parseInt(precision);
                        if (parts[1] && parts[1].length > maxDecimals) {
                            parts[1] = parts[1].substring(0, maxDecimals);
                            e.target.value = parts.join('.');
                        }
                    }
                }
            });

            input.addEventListener('change', (e) => {
                const paramKey = e.target.dataset.paramKey;
                if (paramKey) {
                    step.config = step.config || {};
                    step.config.deviceConfig = step.config.deviceConfig || {};
                    step.config.deviceConfig.params = step.config.deviceConfig.params || {};
                    step.config.deviceConfig.params[paramKey] = e.target.type === 'number' ? parseFloat(e.target.value) : e.target.value;
                }
            });
        });
    }

    tcInitBleCascadeSelect(card, step) {
        const container = card.querySelector(`.tc-ble-device-select-container[data-step-id="${step.id}"]`);
        if (!container || this.tcBleDevices.length === 0) return;

        if (!container.id) {
            container.id = `ble-select-${step.id}`;
        }

        const stepId = step.id;
        const cascadeSelect = new DeviceCascadeSelect(container.id, {
            placeholder: window.i18n.t('testCase.bleDeviceSelect'),
            typePlaceholder: window.i18n.t('testCase.bleDeviceType'),
            modelPlaceholder: window.i18n.t('testCase.bleDeviceModel'),
            onSelect: (device) => {
                const s = this.tcSteps.find(st => st.id === stepId);
                if (s) {
                    s.config = s.config || {};
                    s.config.deviceConfig = {
                        deviceId: device.deviceId,
                        deviceName: device.name
                    };
                    this.tcUpdateBleDataConfig(stepId);
                }
            }
        });

        cascadeSelect.render(this.tcBleDevices);

        const config = step.config || {};
        const deviceConfig = config.deviceConfig || {};
        if (deviceConfig.deviceId) {
            const device = this.tcBleDevices.find(d => d.deviceId === deviceConfig.deviceId);
            if (device) {
                cascadeSelect.select(device, true);
            }
        }
    }

    /**
     * 绑定页面操作事件
     */
    tcBindPageEvents(card, step) {
        const targetValue = card.querySelector('.tc-compare-target-value');
        const tolerance = card.querySelector('.tc-compare-tolerance');
        const compareConfig = step.config.compareConfig || {};
        const targetValueType = compareConfig.targetValueType || 'custom';

        const updateToleranceState = (isRandomRange) => {
            if (tolerance) {
                if (isRandomRange) {
                    tolerance.disabled = false;
                } else {
                    const value = targetValue ? targetValue.value : '';
                    const isNumeric = !isNaN(parseFloat(value)) && isFinite(value);
                    if (value && !isNumeric) {
                        tolerance.disabled = true;
                        tolerance.value = '';
                        step.config.compareConfig = step.config.compareConfig || {};
                        delete step.config.compareConfig.tolerance;
                    } else {
                        tolerance.disabled = false;
                    }
                }
            }
        };

        if (targetValue) {
            targetValue.addEventListener('input', (e) => {
                if (targetValueType === 'custom') {
                    updateToleranceState(false);
                }
            });
            targetValue.addEventListener('change', (e) => {
                step.config.compareConfig = step.config.compareConfig || {};
                step.config.compareConfig.targetValue = e.target.value;
                if (targetValueType === 'custom') {
                    updateToleranceState(false);
                }
            });
        }

        if (tolerance) {
            tolerance.addEventListener('change', (e) => {
                step.config.compareConfig = step.config.compareConfig || {};
                if (e.target.value !== '') {
                    step.config.compareConfig.tolerance = parseFloat(e.target.value);
                } else {
                    delete step.config.compareConfig.tolerance;
                }
            });
        }

        updateToleranceState(targetValueType !== 'custom' && targetValueType !== '');

        const searchTextValue = card.querySelector('.tc-search-text-value');
        if (searchTextValue) {
            searchTextValue.addEventListener('change', (e) => {
                step.config.searchConfig = step.config.searchConfig || {};
                step.config.searchConfig.textValue = e.target.value;
            });
        }

        const searchMatchRadios = card.querySelectorAll('.tc-search-match-radio');
        searchMatchRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                step.config.searchConfig = step.config.searchConfig || {};
                step.config.searchConfig.matchType = e.target.value;
            });
        });
    }

    tcBindSystemEvents(card, step) {
        const clickCountInput = card.querySelector('.tc-nav-click-count');
        if (clickCountInput) {
            clickCountInput.addEventListener('change', (e) => {
                step.config.systemConfig = step.config.systemConfig || {};
                step.config.systemConfig.clickCount = parseInt(e.target.value) || 1;
            });
        }
    }

    tcUpdateTargetValueConfig(stepId, targetValueType) {
        const step = this.tcSteps.find(s => s.id === stepId);
        if (!step) return;

        const card = document.querySelector(`[data-step-id="${stepId}"].tc-step-card`);
        if (!card) return;

        const customTargetValueGroup = card.querySelector('.tc-custom-target-value-group');
        const bleStepSelectGroup = card.querySelector('.tc-ble-step-select-group');
        const tolerance = card.querySelector('.tc-compare-tolerance');

        if (customTargetValueGroup) {
            customTargetValueGroup.classList.toggle('hidden', targetValueType !== 'custom');
        }

        if (bleStepSelectGroup) {
            bleStepSelectGroup.classList.toggle('hidden', targetValueType !== 'ble');
        }

        if (tolerance) {
            const isBleTarget = targetValueType === 'ble';
            if (isBleTarget) {
                tolerance.disabled = false;
            } else {
                const targetValue = card.querySelector('.tc-compare-target-value');
                const value = targetValue ? targetValue.value : '';
                const isNumeric = !isNaN(parseFloat(value)) && isFinite(value);
                if (value && !isNumeric) {
                    tolerance.disabled = true;
                    tolerance.value = '';
                    step.config.compareConfig = step.config.compareConfig || {};
                    delete step.config.compareConfig.tolerance;
                } else {
                    tolerance.disabled = false;
                }
            }
        }
    }

    tcUpdateCompareElementSelect(stepId, pageId) {
        const step = this.tcSteps.find(s => s.id === stepId);
        if (!step) return;

        const app = this.tcSelectedApp;
        let elementOptions = [{value: '', label: '请选择元素', selected: true}];

        if (pageId && app) {
            const page = app.pages?.find(p => p.id === pageId);
            if (page && page.elements) {
                elementOptions = [{value: '', label: '请选择元素', selected: true}];
                page.elements.forEach(element => {
                    elementOptions.push({value: element.id, label: element.name, selected: false});
                });
            }
        }

        const wrapper = document.querySelector(`#tc-compare-element-select-${stepId}`)?.closest('.custom-select-wrapper');
        if (wrapper) {
            wrapper.outerHTML = this.tcGenerateCustomSelect('tc-compare-element-select', elementOptions, '请选择元素', stepId);
            const card = document.querySelector(`[data-step-id="${stepId}"].tc-step-card`);
            if (card) {
                this.tcInitStepSelects(card);
            }
        }
    }

    tcUpdateOperationTypeUI(stepId, operationType) {
        const card = document.querySelector(`[data-step-id="${stepId}"].tc-step-card`);
        if (!card) return;

        const compareConfig = card.querySelector('.tc-page-compare-config');
        const searchConfig = card.querySelector('.tc-page-search-config');

        if (compareConfig) {
            compareConfig.classList.toggle('hidden', operationType !== 'compare');
        }
        if (searchConfig) {
            searchConfig.classList.toggle('hidden', operationType !== 'search');
        }
    }

    tcUpdateSearchTypeUI(stepId, searchType) {
        const card = document.querySelector(`[data-step-id="${stepId}"].tc-step-card`);
        if (!card) return;

        const elementGroup = card.querySelector('.tc-search-element-group');
        if (elementGroup) {
            elementGroup.classList.toggle('hidden', searchType !== 'element');
        }

        const textGroup = card.querySelector('.tc-search-text-group');
        if (textGroup) {
            textGroup.classList.toggle('hidden', searchType !== 'text');
        }
    }

    tcUpdateSearchElementSelect(stepId, pageId) {
        const step = this.tcSteps.find(s => s.id === stepId);
        if (!step) return;

        const app = this.tcSelectedApp;
        let elementOptions = [{value: '', label: window.i18n.t('pagePackage.selectElement'), selected: true}];

        if (pageId && app) {
            const page = app.pages?.find(p => p.id === pageId);
            if (page && page.elements) {
                elementOptions = [{value: '', label: window.i18n.t('pagePackage.selectElement'), selected: true}];
                page.elements.forEach(element => {
                    elementOptions.push({value: element.id, label: element.name, selected: false});
                });
            }
        }

        const wrapper = document.querySelector(`#tc-search-element-select-${stepId}`)?.closest('.custom-select-wrapper');
        if (wrapper) {
            wrapper.outerHTML = this.tcGenerateCustomSelect('tc-search-element-select', elementOptions, window.i18n.t('pagePackage.selectElement'), stepId);
            const card = document.querySelector(`[data-step-id="${stepId}"].tc-step-card`);
            if (card) {
                this.tcInitStepSelects(card);
            }
        }
    }

    /**
     * 初始化拖拽排序
     */
    tcInitStepDragDrop() {
        const cards = document.querySelectorAll('.tc-step-card');
        const container = document.getElementById('tc-steps-list');
        const totalCards = cards.length;

        cards.forEach((card, index) => {
            const dragGrips = card.querySelectorAll('.tc-drag-grip[data-drag-grip]');

            dragGrips.forEach(grip => {
                grip.draggable = true;

                grip.addEventListener('dragstart', (e) => {
                    this.tcDraggedStep = card;
                    card.classList.add('dragging');
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setDragImage(card, 0, 0);
                });

                grip.addEventListener('dragend', () => {
                    card.classList.remove('dragging');
                    this.tcDraggedStep = null;
                    this.tcUpdateStepOrders();
                    this.tcUpdateMoveButtonsState();
                });
            });

            card.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';

                if (this.tcDraggedStep && this.tcDraggedStep !== card) {
                    const allCards = [...container.querySelectorAll('.tc-step-card:not(.dragging)')];
                    const nextCard = allCards.find(c => {
                        const rect = c.getBoundingClientRect();
                        return e.clientY < rect.top + rect.height / 2;
                    });

                    if (nextCard) {
                        container.insertBefore(this.tcDraggedStep, nextCard);
                    } else {
                        container.appendChild(this.tcDraggedStep);
                    }
                }
            });

            const moveBtns = card.querySelectorAll('.tc-step-move-btn');
            moveBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const direction = btn.getAttribute('data-move');
                    const stepId = btn.getAttribute('data-step-id');
                    this.tcMoveStep(stepId, direction);
                });
            });
        });

        this.tcUpdateMoveButtonsState();
    }

    tcMoveStep(stepId, direction) {
        const container = document.getElementById('tc-steps-list');
        const cards = [...container.querySelectorAll('.tc-step-card')];
        const currentIndex = cards.findIndex(c => c.getAttribute('data-step-id') === stepId);

        if (currentIndex === -1) return;
        if (direction === 'up' && currentIndex === 0) return;
        if (direction === 'down' && currentIndex === cards.length - 1) return;

        const card = cards[currentIndex];
        const scrollTop = container.scrollTop;

        card.classList.add('tc-step-moving');

        if (direction === 'up') {
            const prevCard = cards[currentIndex - 1];
            container.insertBefore(card, prevCard);
        } else {
            const nextCard = cards[currentIndex + 1];
            container.insertBefore(nextCard, card);
        }

        container.scrollTop = scrollTop;

        setTimeout(() => {
            card.classList.remove('tc-step-moving');
        }, 300);

        this.tcUpdateStepOrders();
        this.tcUpdateMoveButtonsState();
        this.tcMarkDirty();
    }

    tcUpdateMoveButtonsState() {
        const container = document.getElementById('tc-steps-list');
        if (!container) return;
        const cards = [...container.querySelectorAll('.tc-step-card')];

        cards.forEach((card, index) => {
            const upBtns = card.querySelectorAll('.tc-step-move-up-btn');
            const downBtns = card.querySelectorAll('.tc-step-move-down-btn');

            upBtns.forEach(btn => {
                btn.disabled = index === 0;
                btn.classList.toggle('tc-step-move-btn-disabled', index === 0);
            });

            downBtns.forEach(btn => {
                btn.disabled = index === cards.length - 1;
                btn.classList.toggle('tc-step-move-btn-disabled', index === cards.length - 1);
            });
        });
    }

    /**
     * 更新步骤顺序
     */
    tcUpdateStepOrders() {
        const container = document.getElementById('tc-steps-list');
        const cards = container.querySelectorAll('.tc-step-card');

        cards.forEach((card, index) => {
            const stepId = card.getAttribute('data-step-id');
            const step = this.tcSteps.find(s => s.id === stepId);
            if (step) {
                step.order = index + 1;
            }

            // 更新显示的序号
            const numberEl = card.querySelector('.tc-step-number');
            if (numberEl) {
                numberEl.textContent = index + 1;
            }
        });
    }

    /**
     * 删除步骤
     */
    tcDeleteStep(stepId) {
        this.tcSteps = this.tcSteps.filter(s => s.id !== stepId);
        this.tcMarkDirty();
        this.tcRenderSteps();

        if (this.tcSteps.length === 0) {
            this.tcShowStepsEmpty();
        }
    }

    /**
     * 复制步骤
     */
    tcCopyStep(stepId) {
        const originalStep = this.tcSteps.find(s => s.id === stepId);
        if (!originalStep) return;

        const newStepId = `step_${Date.now()}`;
        const newStep = {
            ...JSON.parse(JSON.stringify(originalStep)),
            id: newStepId,
            name: `${originalStep.name} (副本)`,
            order: this.tcSteps.length + 1
        };

        this.tcSteps.push(newStep);
        this.tcMarkDirty();
        this.tcRenderSteps();
    }

    tcMarkDirty() {
        this.tcHasUnsavedChanges = true;
    }

    tcCollectFormData() {
        const fileName = document.getElementById('tc-file-name')?.value?.trim() || '';
        const caseName = document.getElementById('tc-case-name')?.value?.trim() || '';
        const description = document.getElementById('tc-description')?.value?.trim() || '';
        const epic = document.getElementById('tc-allure-epic')?.value?.trim() || '';
        const feature = document.getElementById('tc-allure-feature')?.value?.trim() || '';
        const story = document.getElementById('tc-allure-story')?.value?.trim() || '';

        // 从下拉框获取选中的markers
        const markers = this.tcSelectedMarkers || [];

        // 从步骤中提取蓝牙设备信息
        let bleDevice = null;
        const sortedSteps = [...this.tcSteps].sort((a, b) => a.order - b.order);
        for (const step of sortedSteps) {
            if (step.type === 'ble') {
                const config = step.config || {};
                const deviceConfig = config.deviceConfig || {};
                if (deviceConfig.deviceId) {
                    const device = this.tcBleDevices.find(d => d.deviceId === deviceConfig.deviceId);
                    if (device) {
                        const bleConfig = device.bleConfig || {};
                        bleDevice = {
                            uuids: bleConfig.uuids || '',
                            uuidn: bleConfig.uuidn || '',
                            uuidw: bleConfig.uuidw || '',
                            bleName: bleConfig.bleName || '',
                            advData: bleConfig.advData || '',
                            port: deviceConfig.port || '',
                            deviceId: device.deviceId,
                            deviceName: device.name,
                            methodName: deviceConfig.methodName,
                            methodParams: deviceConfig.params || {}
                        };
                        break;
                    }
                }
            }
        }

        // 合并蓝牙设备配置：优先使用加载的配置中的端口
        // 注意：测试步骤中没有填入端口的地方，端口只通过"编辑设备标识弹窗"填写
        if (bleDevice && this.tcLoadedBleDevice) {
            // 始终使用加载的配置中的端口（因为步骤中没有端口输入）
            if (this.tcLoadedBleDevice.port) {
                bleDevice.port = this.tcLoadedBleDevice.port;
            }
        }

        // 如果步骤中没有蓝牙设备信息，但之前加载了蓝牙设备配置，保留它
        if (!bleDevice && this.tcLoadedBleDevice) {
            bleDevice = this.tcLoadedBleDevice;
        }

        // 保留原有的设备配置（编辑时保留设备连接标识）
        const deviceConfig = this.tcLoadedDeviceConfig || null;

        return {
            fileName,
            name: caseName || fileName,
            description,
            platform: this.tcSelectedPlatform || 'android',
            targetApp: this.tcSelectedApp,
            steps: sortedSteps,
            deviceConfig,
            bleDevice,
            allureConfig: {
                epic,
                feature,
                story,
                markers
            },
            waitTimeConfig: {
                appLoadWaitTime: parseFloat(document.getElementById('tc-app-load-wait-time')?.value) || 10,
                elementWaitTimeout: parseFloat(document.getElementById('tc-element-wait-timeout')?.value) || 30,
                stepInterval: parseFloat(document.getElementById('tc-step-interval')?.value) || 2,
                appCloseWaitTime: parseFloat(document.getElementById('tc-app-close-wait-time')?.value) || 2
            }
        };
    }

    /**
     * 重置编辑器
     */
    tcResetEditor() {
        this.tcSteps = [];
        this.tcSelectedApp = null;
        this.tcSelectedPlatform = 'android';
        this.tcSelectedMarkers = [];
        this.tcLoadedDeviceConfig = null;
        this.tcLoadedBleDevice = null;

        // 重置表单
        const form = document.getElementById('tc-case-form');
        if (form) form.reset();

        // 重置平台选择
        const platformSelectedSpan = document.querySelector('#tc-platform-select-wrapper-select .custom-select__text');
        if (platformSelectedSpan) {
            platformSelectedSpan.textContent = window.i18n.t('testCase.platforms.android');
        }
        const platformOptions = document.getElementById('tc-platform-select-wrapper-options');
        if (platformOptions) {
            platformOptions.querySelectorAll('.custom-select__option').forEach(opt => {
                opt.classList.toggle('selected', opt.getAttribute('data-value') === 'android');
            });
        }

        // 重置应用选择
        const appSelectedSpan = document.querySelector('#tc-app-selected .custom-select__text');
        if (appSelectedSpan) {
            appSelectedSpan.textContent = window.i18n.t('testCase.selectApp');
        }
        // 清除选中状态
        const appOptions = document.getElementById('tc-app-options');
        if (appOptions) {
            appOptions.querySelectorAll('.custom-select__option').forEach(opt => opt.classList.remove('selected'));
        }

        // 重置Markers选择
        this.tcSelectedMarkers = [];
        // 清除Markers选中状态
        const markersOptions = document.getElementById('tc-markers-options');
        if (markersOptions) {
            markersOptions.querySelectorAll('.custom-select__option').forEach(opt => opt.classList.remove('selected'));
        }
        // 更新Markers显示
        this.tcUpdateMarkersDisplay();

        // 重置测试步骤卡片状态为禁用
        this.tcUpdateStepsSectionState(false);

        // 显示空状态
        this.tcShowStepsEmpty();
    }
}



// 应用启动
document.addEventListener('DOMContentLoaded', () => {

    try {
        const app = new XKAutoTesterApp();
        
        // 窗口控制按钮事件
        const minimizeBtn = document.getElementById('window-minimize');
        const maximizeBtn = document.getElementById('window-maximize');
        const closeBtn = document.getElementById('window-close');
        
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
                if (app.inspectorModal) {
                    app.inspectorModal.close();
                }
                window.electronAPI.closeWindow();
            });
        }
        
        // 更新最大化按钮图标
        function updateMaximizeButton(isMaximized) {
            if (maximizeBtn) {
                if (isMaximized) {
                    maximizeBtn.innerHTML = `
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="8" y="8" width="12" height="12" rx="2"/>
                            <path d="M4 16V6a2 2 0 0 1 2-2h10"/>
                        </svg>
                    `;
                    maximizeBtn.title = '还原';
                    document.body.classList.add('window-maximized');
                } else {
                    maximizeBtn.innerHTML = `
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="4" y="4" width="16" height="16" rx="2"/>
                        </svg>
                    `;
                    maximizeBtn.title = '最大化';
                    document.body.classList.remove('window-maximized');
                }
            }
        }

        // 初始化时检查窗口最大化状态
        window.electronAPI.isWindowMaximized().then(isMaximized => {
            updateMaximizeButton(isMaximized);
        });

        // 监听窗口最大化事件
        window.electronAPI.onWindowMaximized((isMaximized) => {
            updateMaximizeButton(isMaximized);
        });

    } catch (error) {
        console.error('创建XKAutoTesterApp实例失败:', error);
    }
});