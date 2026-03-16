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
        this.isInitializing = false; // 添加初始化状态标志
        this.initialized = false; // 添加初始化完成标志
        this.selectedDevice = null; // 添加设备管理相关属性
        this.currentMarkers = []; // 保存当前的测试类型标记
        this.selectedReportRun = null; // 选中的报告运行记录
        
        // 文件管理器相关属性
        this.currentPath = '/storage/emulated/0'; // 默认路径
        this.selectedFiles = []; // 选中的文件列表
        this.fileList = []; // 当前目录的文件列表
        this.contextMenu = null; // 上下文菜单引用
        this.contextMenuTarget = null; // 上下文菜单的目标元素
        
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
        
        // 初始化文件管理器状态（在加载配置后调用，确保使用正确的语言）
        this.toggleFileManagerEnabled(false);
        
        // 页面加载时就显示测试计划区域并加载测试计划
        const testPlanSection = document.getElementById('test-plan-section');
        testPlanSection.classList.remove('hidden');
        await this.loadTestPlans();
        
        // 加载定时计划
        await this.loadScheduledPlans();
        
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
        this.deviceStatusSaved = false; // 初始化设备状态保存标记
        
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
            
            this.initializeComponentIcons();
            this.updateComponentTranslations();
        } catch (error) {
            console.error('加载组件失败:', error);
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
                                    <span data-i18n="${opt.label}">${window.i18n ? window.i18n.t(opt.label) : opt.value}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
                
                wrapper.innerHTML = selectHtml;
                
                const selectedSpan = wrapper.querySelector('.custom-select__text');
                const defaultOption = options.find(opt => opt.default);
                if (selectedSpan && defaultOption) {
                    selectedSpan.textContent = window.i18n ? window.i18n.t(defaultOption.label) : defaultOption.value;
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
                description: window.i18n ? window.i18n.t(`testTypes.${marker.name}`) : marker.description
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
        
        const androidConnectionTab = document.querySelector('[data-tab="android-connection"] span:last-child');
        if (androidConnectionTab) {
            androidConnectionTab.textContent = window.i18n.t('tabs.androidConnection');
        }
        
        const settingsTab = document.querySelector('[data-tab="settings"] span:last-child');
        if (settingsTab) {
            settingsTab.textContent = window.i18n.t('tabs.settings');
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
        
        const stopServerBtn = document.querySelector('#stop-allure-btn span:last-child');
        if (stopServerBtn) {
            stopServerBtn.textContent = window.i18n.t('testExecution.stopServer');
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

        // Allure服务器控制
        document.getElementById('stop-allure-btn').addEventListener('click', () => {
            this.stopAllureServer();
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

        // 屏幕控制
        const screenControlBtn = document.getElementById('screen-control-btn');
        if (screenControlBtn) {
            screenControlBtn.addEventListener('click', () => {
                this.startScreenControl();
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
            }
        } catch (error) {
            console.error('加载配置失败:', error);
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
                'none': window.i18n ? window.i18n.t('settings.none') : '无',
                'dingtalk': window.i18n ? window.i18n.t('settings.dingtalk') : '钉钉'
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
        
        // 自定义语言选择器事件监听
        const customLanguageSelect = document.getElementById('custom-language-select');
        const customLanguageSelected = document.getElementById('custom-language-selected');
        const customLanguageOptions = document.getElementById('custom-language-options');
        
        if (customLanguageSelect && customLanguageSelected && customLanguageOptions) {
            // 将下拉框选项移到 body 下，避免被 modal 的 backdrop-filter 影响
            document.body.appendChild(customLanguageOptions);
            
            // 点击选中区域切换下拉框显示/隐藏
            customLanguageSelected.addEventListener('click', (e) => {
                e.stopPropagation();
                const isShowing = customLanguageOptions.classList.contains('show');
                const mainContent = document.querySelector('.main-content');
                if (!isShowing) {
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
        
        // 通知平台选择器事件监听
        const notificationPlatformSelect = document.getElementById('custom-notification-platform-select');
        const notificationPlatformSelected = document.getElementById('custom-notification-platform-selected');
        const notificationPlatformOptions = document.getElementById('custom-notification-platform-options');
        
        if (notificationPlatformSelect && notificationPlatformSelected && notificationPlatformOptions) {
            document.body.appendChild(notificationPlatformOptions);
            
            notificationPlatformSelected.addEventListener('click', (e) => {
                e.stopPropagation();
                const isShowing = notificationPlatformOptions.classList.contains('show');
                const mainContent = document.querySelector('.main-content');
                if (!isShowing) {
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
        
        // 如果元素不可见，使用默认位置
        if (rect.width === 0 && rect.height === 0) {
            options.style.top = '50%';
            options.style.left = '50%';
            options.style.width = '200px';
            options.style.transform = 'translate(-50%, -50%)';
            return;
        }
        
        const viewportHeight = window.innerHeight;
        const optionsHeight = 200;
        
        let top = rect.bottom + 4;
        
        if (top + optionsHeight > viewportHeight - 20) {
            top = rect.top - optionsHeight - 4;
            if (top < 0) {
                top = 10;
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
    }

    displayTestFiles(files) {
        const container = document.getElementById('test-files-list');
        container.innerHTML = '';

        files.forEach(file => {
            const fileElement = document.createElement('div');
            fileElement.className = 'test-file-item';
            fileElement.setAttribute('data-path', file.path);
            fileElement.innerHTML = `
                ${this.getIconHtml('description')}
                <span>${file.name}</span>
            `;

            container.appendChild(fileElement);
        });
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
        // 清除所有Toast消息，避免弹窗显示时能看到未消失的toast
        Toast.clearAll();
        
        // 显示模态框
        const modalOverlay = document.getElementById('device-modal-overlay');
        if (modalOverlay) {
            modalOverlay.classList.remove('hidden');
        }

        // 显示扫描状态
        this.showDeviceScanningState();

        // 扫描设备
        await this.scanDevices();
        
        // 如果有保存的设备状态，自动选择对应设备并显示设备信息卡片
        if (this.deviceStatusSaved && this.selectedDevice) {
            setTimeout(() => {
                const deviceToSelect = document.querySelector(`.device-item[data-device-id="${this.selectedDevice}"]`);
                if (deviceToSelect) {
                    // 模拟点击事件，自动选择设备
                    deviceToSelect.click();
                }
            }, 100);
        }
        
        // 添加开放5555端口按钮事件监听
        const openPortBtn = document.getElementById('open-port-btn');
        if (openPortBtn) {
            // 移除旧的事件监听，避免重复绑定
            openPortBtn.removeEventListener('click', this.boundOpenPort5555);
            // 添加新的事件监听
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
        const modalOverlay = document.getElementById('device-modal-overlay');
        if (modalOverlay) {
            modalOverlay.classList.add('hidden');
        }
        
        // 隐藏新增设备输入框和结果提示
        this.hideAddDeviceInput();
        
        // 清除设备列表中的选中状态
        const deviceListElement = document.getElementById('device-list');
        if (deviceListElement) {
            const selectedDeviceElement = deviceListElement.querySelector('.device-item.selected');
            if (selectedDeviceElement) {
                selectedDeviceElement.classList.remove('selected');
                selectedDeviceElement.style.backgroundColor = '';
            }
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
                    
                    // 启用确认按钮
                    if (confirmButton) {
                        confirmButton.disabled = false;
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

    async runTests(scheduledPlanInfo = null) {
        if (this.isRunning || !this.currentTestPlan) {
            if (!this.currentTestPlan) {
                this.showError(window.i18n.t('testExecution.selectTestPlanFirst'));
            }
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
                    loopResults.push({ loop: i, success: false });
                    if (!continueOnFailure) {
                        this.appendError(`>>> ${window.i18n.t('testExecution.loopStopped', { current: i })}`);
                        break;
                    }
                    this.appendError(`>>> ${window.i18n.t('testExecution.loopFailed', { current: i })}`);
                } else {
                    loopResults.push({ loop: i, success: true });
                    this.appendOutput(`>>> ${window.i18n.t('testExecution.loopCompleted', { current: i })}`);
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
            
            // 统一显示测试结果状态（基于 loopResults 数组，检查是否所有测试都通过）
            const allTestsPassed = loopResults.length > 0 && loopResults.every(r => r.success);
            if (!allTestsPassed) {
                this.appendOutput('>>> ' + window.i18n.t('testExecution.testFailed'));
            } else {
                this.appendOutput('>>> ' + window.i18n.t('testExecution.testPassed'));
            }
            
            // 更新 hasFailure 变量以保持与通知一致
            hasFailure = !allTestsPassed;
            this.appendOutput('>>> ============================\n');

            const notificationInfo = {
                testPlanName: this.currentTestPlan?.name || '',
                testFileNames: testFileNames,
                testTypes: testTypes,
                loopCount: loopCount,
                totalLoops: loopResults.length,
                passRate: passRate,
                hasFailure: hasFailure,
                stoppedEarly: stoppedEarly
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

            const testResult = testInfo.hasFailure ? '失败' : '通过';
            
            let message = `【XKAutoTester 测试结果通知】\n`;
            
            if (testInfo.scheduledPlanName) {
                message += `\n定时计划: ${testInfo.scheduledPlanName}\n`;
                message += `执行时间: ${testInfo.scheduledPlanExecutionTime || new Date().toLocaleString()}\n`;
            }
            
            message += `\n测试计划: ${testInfo.testPlanName}\n`;
            message += `测试文件: ${testInfo.testFileNames || '无'}\n`;
            message += `测试类型: ${testInfo.testTypes || '全部'}\n`;
            message += `循环次数: ${testInfo.loopCount}\n`;
            message += `\n聚合信息:\n`;
            message += `总轮次: ${testInfo.totalLoops}\n`;
            message += `通过率: ${testInfo.passRate}%\n`;
            message += `\n测试结果: ${testResult}`;

            const notificationData = {
                accessToken: dingtalkConfig.access_token,
                secret: dingtalkConfig.secret,
                message: message
            };

            this.appendOutput('\n>>> 正在发送钉钉通知...');
            const result = await window.electronAPI.sendDingTalkNotification(notificationData);
            
            if (result.success) {
                this.appendOutput('>>> 钉钉通知发送成功');
            } else {
                this.appendError('>>> 钉钉通知发送失败: ' + (result.error || '未知错误'));
            }
        } catch (error) {
            console.error('发送钉钉通知失败:', error);
            this.appendError('>>> 发送钉钉通知失败: ' + error.message);
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
        const output = document.getElementById('test-output');
        // 如果有欢迎消息，先清除
        if (output.querySelector('.welcome-message')) {
            output.innerHTML = '';
        }
        // 添加有内容时的滚动条样式
        output.classList.add('has-content');
        
        const line = document.createElement('div');
        line.textContent = text;
        line.className = 'output-line';
        output.appendChild(line);
        output.scrollTop = output.scrollHeight;
    }

    appendError(text) {
        const output = document.getElementById('test-output');
        // 如果有欢迎消息，先清除
        if (output.querySelector('.welcome-message')) {
            output.innerHTML = '';
        }
        // 添加有内容时的滚动条样式
        output.classList.add('has-content');
        
        const line = document.createElement('div');
        line.textContent = text;
        line.className = 'output-line error';
        line.style.color = 'var(--error)';
        output.appendChild(line);
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
                { name: 'smoke', description: window.i18n ? window.i18n.t('testTypes.smoke') : '冒烟测试' },
                { name: 'unit', description: window.i18n ? window.i18n.t('testTypes.unit') : '单元功能测试' },
                { name: 'exception', description: window.i18n ? window.i18n.t('testTypes.exception') : '异常场景测试' },
                { name: 'critical', description: window.i18n ? window.i18n.t('testTypes.critical') : '关键功能测试' },
                { name: 'appium', description: window.i18n ? window.i18n.t('testTypes.appium') : 'Appium移动端测试' }
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
                <span>${window.i18n ? window.i18n.t('testExecution.noMarkers') : '没有找到pytest标记，将执行所有测试'}</span>
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



        uniqueMarkers.forEach(marker => {
            const label = document.createElement('label');
            label.className = 'checkbox-container';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `${marker.name}-tests`;
            checkbox.checked = true; // 默认选中所有标记
            
            const checkmark = document.createElement('span');
            checkmark.className = 'checkmark';
            
            const text = document.createTextNode(marker.description || marker.name);
            
            label.appendChild(checkbox);
            label.appendChild(checkmark);
            label.appendChild(text);
            
            container.appendChild(label);
        });
        

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


        this.testPlans.forEach(plan => {
            const planElement = document.createElement('div');
            planElement.className = 'test-plan-item';
            planElement.setAttribute('data-plan-name', plan.name);
            
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
            
            planElement.innerHTML = `
                ${this.getIconHtml('assignment')}
                <div>
                    <div style="font-weight: 500;">${plan.name}</div>
                    <div style="font-size: 12px; color: var(--text-secondary);">${plan.description || (window.i18n ? window.i18n.t('testExecution.noDescription') : '无描述')}</div>
                    <div style="font-size: 10px; color: var(--text-tertiary); margin-top: 4px;">
                        >>> ${fileInfo} | >>> ${typeInfo}
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

            container.appendChild(planElement);
        });
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
            'smoke': window.i18n ? window.i18n.t('testTypes.smoke') : '冒烟测试',
            'critical': window.i18n ? window.i18n.t('testTypes.critical') : '关键功能测试',
            'exception': window.i18n ? window.i18n.t('testTypes.exception') : '异常场景测试'
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
                this.updateDownloadProgress(progress);
            });
        }
        
        // 添加进度条关闭按钮事件监听
        const closeBtn = document.getElementById('download-progress-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hideDownloadProgress());
        }
    }
    
    // 显示下载进度条
    showDownloadProgress() {
        const progressContainer = document.getElementById('download-progress-container');
        if (progressContainer) {
            // 重置进度条状态
            const progressBar = document.getElementById('download-progress-bar');
            if (progressBar) {
                progressBar.style.width = '0%';
            }
            
            // 重置百分比
            const percentageElement = document.getElementById('download-percentage');
            if (percentageElement) {
                percentageElement.textContent = '0%';
            }
            
            // 重置文件名
            const filenameElement = document.getElementById('download-filename');
            if (filenameElement) {
                filenameElement.textContent = '准备下载...';
            }
            
            // 重置文件个数信息
            const fileCountElement = document.getElementById('download-file-count');
            if (fileCountElement) {
                if (this.totalDownloadFiles > 1) {
                    // 如果是多文件下载，显示当前下载的文件索引和总文件数
                    fileCountElement.textContent = `文件: ${this.currentDownloadIndex} / ${this.totalDownloadFiles}`;
                } else {
                    // 如果是单文件下载，显示默认值
                    fileCountElement.textContent = '文件: 0 / 0';
                }
            }
            
            // 清空错误信息
            this.clearDownloadError();
            
            // 隐藏倒计时元素
            const countdownElement = document.getElementById('download-countdown');
            if (countdownElement) {
                countdownElement.style.display = 'none';
            }
            
            // 清除可能存在的定时器
            if (this.downloadProgressTimer) {
                clearTimeout(this.downloadProgressTimer);
                this.downloadProgressTimer = null;
            }
            if (this.countdownUpdateTimer) {
                clearInterval(this.countdownUpdateTimer);
                this.countdownUpdateTimer = null;
            }
            
            // 显示进度条容器
            progressContainer.classList.remove('hidden');
            
            // 隐藏关闭按钮
            const closeButton = document.getElementById('download-progress-close');
            if (closeButton) {
                closeButton.style.display = 'none';
            }
        }
    }
    
    // 隐藏下载进度条
    hideDownloadProgress() {
        const progressContainer = document.getElementById('download-progress-container');
        if (progressContainer) {
            progressContainer.classList.add('hidden');
        }
        // 清空错误信息
        this.clearDownloadError();
    }
    
    // 更新下载进度
    updateDownloadProgress(progress) {
        // 显示进度条
        this.showDownloadProgress();
        
        // 计算整体进度（考虑多文件下载）
        let overallPercentage = progress.percentage;
        if (this.totalDownloadFiles > 1) {
            // 多文件下载时，计算整体进度
            // currentDownloadIndex从1开始，表示当前正在下载的文件索引
            // 已完成的文件数 = currentDownloadIndex - 1
            const completedFiles = this.currentDownloadIndex - 1;
            const fileProgress = (completedFiles / this.totalDownloadFiles) * 100;
            const currentFileProgress = (progress.percentage / 100) * (100 / this.totalDownloadFiles);
            overallPercentage = Math.min(100, fileProgress + currentFileProgress);
        }
        
        // 更新下载状态
        const filenameElement = document.getElementById('download-filename');
        if (filenameElement) {
            if (overallPercentage === 100) {
                filenameElement.textContent = '下载完成';
            } else {
                filenameElement.textContent = '正在下载';
            }
        }
        
        // 更新进度条
        const progressBar = document.getElementById('download-progress-bar');
        if (progressBar) {
            progressBar.style.width = `${overallPercentage}%`;
        }
        
        // 更新百分比
        const percentageElement = document.getElementById('download-percentage');
        if (percentageElement) {
            percentageElement.textContent = `${Math.round(overallPercentage)}%`;
        }
        
        // 更新文件个数信息
        const fileCountElement = document.getElementById('download-file-count');
        if (fileCountElement) {
            if (this.totalDownloadFiles > 1) {
                // 多文件下载时，显示当前文件索引和总文件数
                fileCountElement.textContent = `文件: ${this.currentDownloadIndex} / ${this.totalDownloadFiles}`;
            } else {
                // 单文件下载时，显示文件进度
                const transferred = progress.transferred || 0;
                const totalSize = progress.totalSize || 1;
                fileCountElement.textContent = `文件: ${transferred} / ${totalSize}`;
            }
        }
        
        // 显示或隐藏倒计时
        const countdownElement = document.getElementById('download-countdown');
        const closeButton = document.getElementById('download-progress-close');
        
        if (progress.error) {
            this.showDownloadError(progress.error);
            // 有错误时隐藏倒计时，显示关闭按钮
            if (countdownElement) {
                countdownElement.style.display = 'none';
            }
            if (closeButton) {
                closeButton.style.display = 'flex';
            }
        } else if (overallPercentage === 100) {
            // 下载成功，显示倒计时和关闭按钮
            if (countdownElement) {
                countdownElement.style.display = 'inline';
            }
            if (closeButton) {
                closeButton.style.display = 'flex';
            }
            
            // 清除之前可能存在的定时器
            if (this.downloadProgressTimer) {
                clearTimeout(this.downloadProgressTimer);
            }
            if (this.countdownUpdateTimer) {
                clearInterval(this.countdownUpdateTimer);
            }
            
            // 倒计时总秒数
            let countdownSeconds = 5;
            
            // 更新倒计时显示
            const updateCountdown = () => {
                if (countdownElement) {
                    countdownElement.textContent = `${countdownSeconds}秒后自动关闭`;
                }
                
                if (countdownSeconds <= 0) {
                    this.hideDownloadProgress();
                    // 清除定时器引用
                    if (this.countdownUpdateTimer) {
                        clearInterval(this.countdownUpdateTimer);
                        this.countdownUpdateTimer = null;
                    }
                    this.downloadProgressTimer = null;
                } else {
                    countdownSeconds--;
                }
            };
            
            // 立即更新一次
            updateCountdown();
            
            // 设置倒计时更新定时器（每秒更新一次）
            this.countdownUpdateTimer = setInterval(updateCountdown, 1000);
            
            // 设置最终关闭的定时器
            this.downloadProgressTimer = setTimeout(() => {
                this.hideDownloadProgress();
                // 清除定时器引用
                if (this.countdownUpdateTimer) {
                    clearInterval(this.countdownUpdateTimer);
                    this.countdownUpdateTimer = null;
                }
                this.downloadProgressTimer = null;
            }, 5000);
        } else {
            // 下载中，隐藏倒计时和关闭按钮
            if (countdownElement) {
                countdownElement.style.display = 'none';
            }
            if (closeButton) {
                closeButton.style.display = 'none';
            }
        }
    }
    
    // 显示下载错误信息
    showDownloadError(errorMessage) {
        const errorContainer = document.getElementById('download-error');
        const errorMessageElement = document.getElementById('download-error-message');
        const errorTooltipElement = document.getElementById('download-error-tooltip');
        const filenameElement = document.getElementById('download-filename');
        
        if (errorContainer && errorMessageElement && errorTooltipElement) {
            // 更新下载状态文案为"下载失败"
            if (filenameElement) {
                filenameElement.textContent = '下载失败';
            }
            
            // 过滤掉不需要显示的行，但保留执行的ADB命令信息
            let filteredError = errorMessage;
            if (filteredError.includes('pull: building fle list')) {
                filteredError = filteredError.replace(/pull: building fle list[.\s]*/g, '');
            }
            
            // 将完整错误信息显示在悬浮窗中，确保包含执行的ADB命令
            errorTooltipElement.textContent = filteredError;
            
            // 主显示区域只显示简洁的错误提示
            let simpleError = window.i18n.t('fileManager.adbCommandFailed');
            const errorLines = filteredError.split('\n');
            
            // 优先查找详细错误信息
            let foundDetailedError = false;
            for (const line of errorLines) {
                if (line.includes('详细错误:')) {
                    simpleError = line.replace('详细错误:', '').trim();
                    foundDetailedError = true;
                    break;
                }
            }
            
            // 如果没有找到详细错误信息，尝试查找ADB命令信息
            if (!foundDetailedError) {
                for (const line of errorLines) {
                    if (line.includes('执行的ADB命令:')) {
                        simpleError = window.i18n.t('fileManager.adbCommandFailed');
                        break;
                    }
                }
            }
            
            // 将换行符替换为<br>标签，以便在HTML中正确显示换行
            const formattedError = simpleError.replace(/\n/g, '<br>');
            errorMessageElement.innerHTML = formattedError;
            errorContainer.classList.remove('hidden');
            
            // 显示toast提示，说明是哪个阶段失败的
            let toastMessage = window.i18n.t('fileManager.downloadFailed');
            if (errorMessage.includes('创建zip文件失败')) {
                toastMessage = window.i18n.t('fileManager.zipCreationFailed');
            } else if (errorMessage.includes('执行的ADB命令:')) {
                toastMessage = window.i18n.t('fileManager.adbCommandFailed');
            }
            Toast.error(toastMessage);
        }
    }
    
    // 隐藏下载错误信息
    clearDownloadError() {
        const errorContainer = document.getElementById('download-error');
        const errorMessageElement = document.getElementById('download-error-message');
        const errorTooltipElement = document.getElementById('download-error-tooltip');
        
        if (errorContainer && errorMessageElement && errorTooltipElement) {
            errorMessageElement.textContent = '';
            errorTooltipElement.textContent = '';
            errorContainer.classList.add('hidden');
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
            return window.i18n ? window.i18n.t('fileManager.justNow') : '刚刚';
        } else if (diff < hour) {
            const minutes = Math.floor(diff / minute);
            return window.i18n ? `${minutes} ${window.i18n.t('fileManager.minutesAgo')}` : `${minutes}分钟前`;
        } else if (diff < day) {
            const hours = Math.floor(diff / hour);
            return window.i18n ? `${hours} ${window.i18n.t('fileManager.hoursAgo')}` : `${hours}小时前`;
        } else if (diff < week) {
            const days = Math.floor(diff / day);
            return window.i18n ? `${days} ${window.i18n.t('fileManager.daysAgo')}` : `${days}天前`;
        } else if (diff < month) {
            const weeks = Math.floor(diff / week);
            return window.i18n ? `${weeks} ${window.i18n.t('fileManager.weeksAgo')}` : `${weeks}周前`;
        } else if (diff < year) {
            const months = Math.floor(diff / month);
            return window.i18n ? `${months} ${window.i18n.t('fileManager.monthsAgo')}` : `${months}个月前`;
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
        for (let i = startIndex; i < endIndex; i++) {
            const segment = segments[i];
            
            // 添加路径分隔符（除了第一个）
            if (i > startIndex) {
                const separator = document.createElement('span');
                separator.className = 'path-separator';
                separator.textContent = '/';
                container.appendChild(separator);
            }
            
            // 创建可点击的路径片段
            const segmentElement = document.createElement('span');
            segmentElement.className = `path-segment ${i === endIndex - 1 ? 'active' : ''}`;
            segmentElement.textContent = segment.displayName;
            segmentElement.setAttribute('data-path', segment.path);
            
            // 添加点击事件
            segmentElement.addEventListener('click', () => {
                this.navigateToPath(segment.path);
            });
            
            container.appendChild(segmentElement);
        }
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
        
        const menuWidth = menu.offsetWidth || 180;
        const menuHeight = menu.offsetHeight || 120;
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        
        let x, y;
        
        if (triggerElement) {
            // 如果有触发元素，从元素下方弹出
            const rect = triggerElement.getBoundingClientRect();
            x = rect.left;
            y = rect.bottom + 4; // 4px 间距
            
            // 确保菜单不会超出窗口右边缘
            if (x + menuWidth > windowWidth) {
                x = windowWidth - menuWidth - 10;
            }
            
            // 确保菜单不会超出窗口下边缘
            if (y + menuHeight > windowHeight) {
                y = rect.top - menuHeight - 4; // 在按钮上方显示
            }
        } else {
            // 使用鼠标位置
            x = event.clientX;
            y = event.clientY;
            
            if (x + menuWidth > windowWidth) {
                x = windowWidth - menuWidth - 10;
            }
            if (y + menuHeight > windowHeight) {
                y = windowHeight - menuHeight - 10;
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
                if (!window.electronAPI || !window.electronAPI.selectDirectory) {
                    console.error('electronAPI未定义或selectDirectory方法不存在');
                    return;
                }
                const result = await window.electronAPI.selectDirectory();
                if (!result.canceled && result.filePaths.length > 0) {
                    const downloadDir = result.filePaths[0];
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
    
    // 下载选中的文件
    async downloadSelectedFiles() {
        if (this.selectedFiles.length === 0) {
            return;
        }
        
        try {
            let downloadDir = null;
            
            // 首先检查默认下载路径是否存在
            if (window.electronAPI && window.electronAPI.getConfig) {
                const config = await window.electronAPI.getConfig();
                const defaultDownloadPath = config?.APP_SETTINGS?.default_download_directory;
                
                if (defaultDownloadPath) {
                    // 检查路径是否存在
                    if (window.electronAPI && window.electronAPI.checkPathExists) {
                        const exists = await window.electronAPI.checkPathExists(defaultDownloadPath);
                        if (exists) {
                            downloadDir = defaultDownloadPath;
                        }
                    }
                }
            }
            
            // 如果默认下载路径不存在或无效，弹出选择目录对话框
            if (!downloadDir) {
                if (!window.electronAPI || !window.electronAPI.selectDirectory) {
                    console.error('electronAPI未定义或selectDirectory方法不存在');
                    return;
                }
                
                const result = await window.electronAPI.selectDirectory();
                if (!result.canceled && result.filePaths.length > 0) {
                    downloadDir = result.filePaths[0];
                } else {
                    // 用户取消选择，直接返回
                    return;
                }
            }
            
            // 初始化多文件下载状态
            this.currentDownloadIndex = 0;
            this.totalDownloadFiles = this.selectedFiles.length;
            
            // 开始下载前显示进度条，只显示一次
            this.showDownloadProgress();
            
            for (const file of this.selectedFiles) {
                // 先递增索引，再开始下载，这样在计算进度时就能正确反映当前正在下载的文件
                this.currentDownloadIndex++;
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
    
    // 重命名文件
    renameFile(file) {
        this.contextMenuTarget = file;
        
        // 显示自定义重命名模态框
        const modalOverlay = document.getElementById('rename-modal-overlay');
        const renameInput = document.getElementById('rename-input');
        const renameForm = document.getElementById('rename-modal-form');
        
        // 设置默认文件名
        renameInput.value = file.name;
        renameInput.focus();
        renameInput.select();
        
        // 显示模态框
        modalOverlay.classList.remove('hidden');
        
        // 保存按钮事件处理
        const saveBtn = document.getElementById('rename-modal-save-btn');
        const cancelBtn = document.getElementById('rename-modal-cancel-btn');
        const closeBtn = document.getElementById('rename-modal-close-btn');
        
        // 保存按钮点击事件
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
                        // 隐藏模态框
                        modalOverlay.classList.add('hidden');
                    });
            } else {
                // 隐藏模态框
                modalOverlay.classList.add('hidden');
            }
        };
        
        // 取消按钮点击事件
        const handleCancel = () => {
            // 隐藏模态框
            modalOverlay.classList.add('hidden');
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
        // 显示模态框
        const modalOverlay = document.getElementById('control-params-overlay');
        if (modalOverlay) {
            modalOverlay.classList.remove('hidden');
        }
        
        // 确保下拉框已初始化
        this.initializeCustomSelects();

        // 加载控制参数
        await this.loadControlParams();
    }

    // 隐藏控制参数模态框
    hideControlParamsModal() {
        const modalOverlay = document.getElementById('control-params-overlay');
        if (modalOverlay) {
            modalOverlay.classList.add('hidden');
        }
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
        
        const select = wrapper.querySelector('.custom-select');
        if (!select) return;
        
        const options = select.querySelectorAll('.custom-select__option');
        const selected = select.querySelector('.custom-select__text');
        
        options.forEach(option => {
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

    // 获取自定义下拉框的值
    getCustomSelectValue(wrapperId) {
        const wrapper = document.getElementById(wrapperId);
        if (!wrapper) return null;
        
        const selectedOption = wrapper.querySelector('.custom-select__option.selected');
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
            // 显示正在启动中的toast提示
            Toast.info(window.i18n.t('screenControl.starting'));
            
            if (!this.selectedDevice) {
                this.showError(this.translate('selectDeviceFirst'));
                return;
            }
            
            // 获取配置
            const config = await window.electronAPI.getConfig();
            const scrcpyParams = config.SCRCPY_PARAMS || {};
            
            // 调用electronAPI启动scrcpy
            const result = await window.electronAPI.startScrcpy(this.selectedDevice, scrcpyParams);
            
            if (result.success) {
                // 屏幕控制已启动，不显示输出
            } else {
                this.appendError(`❌ ${window.i18n.t('screenControl.startFailed')}: ${result.error}`);
            }
        } catch (error) {
            console.error('启动屏幕控制失败:', error);
            this.appendError(`❌ ${window.i18n.t('screenControl.startFailed')}: ${error.message}`);
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
        if (this.currentTestPlan && this.currentTestPlan.name === plan.name) {
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
        container.innerHTML = '';

        if (!this.selectedDirectory) {
            // 未选择目录时显示提示
            const placeholderElement = document.createElement('div');
            placeholderElement.className = 'no-files';
            placeholderElement.innerHTML = window.i18n.t('testExecution.selectTestDirectoryFirst');
            container.appendChild(placeholderElement);
            return;
        }

        // 调用后端API实时扫描tests文件夹
        const testFiles = await window.electronAPI.scanTestFiles(this.selectedDirectory);

        if (testFiles.length === 0) {
            // 没有测试文件时显示提示
            const placeholderElement = document.createElement('div');
            placeholderElement.className = 'no-files';
            placeholderElement.innerHTML = window.i18n.t('testExecution.noTestFilesInDir');
            container.appendChild(placeholderElement);
            return;
        }

        testFiles.forEach(file => {
            const fileElement = document.createElement('div');
            fileElement.className = 'modal-test-file-item';
            fileElement.innerHTML = `
                <input type="checkbox" id="modal-file-${file.name}" value="${file.path}">
                <label for="modal-file-${file.name}">
                    ${this.getIconHtml('description')}
                    ${file.name}
                </label>
            `;

            // 不默认选中文件，等待preselectModalItems设置选中状态
            const checkbox = fileElement.querySelector('input[type="checkbox"]');
            checkbox.checked = false;

            // 添加事件监听器，当文件选择状态改变时更新测试类型
            checkbox.addEventListener('change', () => {
                this.updateModalTestTypes();
            });

            container.appendChild(fileElement);
        });

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
        // 防重复调用机制：如果正在更新模态框测试类型，等待完成
        if (this.updatingModalTypes) {

            return await this.updatingModalTypes;
        }
        
        const container = document.getElementById('modal-test-types');
        container.innerHTML = '';

        // 获取弹窗中选择的文件
        const selectedFiles = this.getModalSelectedTestFiles();
        
        // 添加调试日志



        
        if (selectedFiles.length === 0) {
            // 没有选中文件时，显示占位提示
            const placeholder = document.createElement('div');
            placeholder.className = 'placeholder-message';
            placeholder.textContent = window.i18n.t('testExecution.selectTestFileFirst');
            container.appendChild(placeholder);
            return;
        }

        try {

            
            // 设置更新状态
            this.updatingModalTypes = (async () => {
                // 从选中的文件中提取pytest标记
                const markers = await this.extractMarkersFromModalSelectedFiles(selectedFiles);
                
                if (markers.length === 0) {
                    // 选中的文件没有标记时，显示占位提示
                    const placeholder = document.createElement('div');
                    placeholder.className = 'placeholder-message';
                    placeholder.textContent = window.i18n.t('testExecution.noMarkers');
                    container.appendChild(placeholder);
                } else {
                    // 前端去重：使用Set确保标记名称唯一
                    const uniqueMarkers = [];
                    const seenNames = new Set();
                    
                    markers.forEach(marker => {
                        if (!seenNames.has(marker.name)) {
                            seenNames.add(marker.name);
                            uniqueMarkers.push(marker);
                        }
                    });
                    
                    // 显示从文件中提取的标记（已去重）
                    uniqueMarkers.forEach(marker => {
                        const item = document.createElement('div');
                        item.className = 'modal-test-type-item';
                        // 根据当前语言设置翻译标记描述
                        const translatedDescription = window.i18n ? window.i18n.t('testTypes.' + marker.name) : marker.description;
                        item.innerHTML = `
                            <input type="checkbox" id="modal-type-${marker.name}" value="${marker.name}">
                            <label for="modal-type-${marker.name}">
                                ${this.getIconHtml('category')}
                                ${translatedDescription}
                            </label>
                        `;

                        // 根据传入的selectedTypes设置选中状态，如果没有传入则默认选中所有
                        const checkbox = item.querySelector('input[type="checkbox"]');
                        if (selectedTypes && selectedTypes.includes(marker.name)) {
                            checkbox.checked = true;
                        } else if (selectedTypes === null) {
                            // 新建计划时默认选中所有
                            checkbox.checked = true;
                        } else {
                            // 编辑计划时根据计划中的类型设置
                            checkbox.checked = false;
                        }

                        container.appendChild(item);
                    });
                }
                

            })();
            
            await this.updatingModalTypes;
        } catch (error) {
            console.error('提取标记失败:', error);
            const placeholder = document.createElement('div');
            placeholder.className = 'placeholder-message';
            placeholder.textContent = window.i18n.t('testExecution.extractMarkersFailed');
            container.appendChild(placeholder);
        } finally {
            // 清除更新状态
            this.updatingModalTypes = null;
            
            // 更新测试类型警告
            this.updateTestTypeWarning();
            
            // 监听测试类型选择变化，更新警告
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
        document.getElementById('modal-overlay').classList.remove('hidden');
        document.getElementById('modal-title').textContent = window.i18n.t('testExecution.newTestPlan');
        document.getElementById('plan-name').value = '';
        document.getElementById('plan-description').value = '';
        
        // 初始化循环设置默认值
        document.getElementById('loop-count').value = 1;
        document.getElementById('continue-on-failure').checked = true;
        
        // 显示当前目录下的测试文件和测试类型
        await this.displayModalTestFiles();
        await this.displayModalTestTypes();
        
        // 显示保存按钮，隐藏更新按钮
        document.getElementById('save-plan-btn').classList.remove('hidden');
        document.getElementById('update-plan-btn').classList.add('hidden');
        
        // 重置错误提示
        this.hidePlanNameError();
        
        // 添加输入事件监听，输入时隐藏错误提示
        const planNameInput = document.getElementById('plan-name');
        planNameInput.addEventListener('input', () => {
            this.hidePlanNameError();
        });
    }

    hideModal() {
        document.getElementById('modal-overlay').classList.add('hidden');
    }

    showConfirmModal(title, message, onConfirm) {
        const overlay = document.getElementById('confirm-modal-overlay');
        const titleElement = document.getElementById('confirm-modal-title');
        const messageElement = document.getElementById('confirm-modal-message');
        
        if (titleElement) {
            titleElement.textContent = title;
        }
        if (messageElement) {
            messageElement.textContent = message;
        }
        
        this.confirmCallback = onConfirm;
        overlay.classList.remove('hidden');
    }

    hideConfirmModal() {
        document.getElementById('confirm-modal-overlay').classList.add('hidden');
        this.confirmCallback = null;
    }

    executeConfirmAction() {
        if (this.confirmCallback) {
            this.confirmCallback();
        }
        this.hideConfirmModal();
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
                await this.loadTestPlans();

                
                // 新建计划后自动选中新建的计划
                const newPlan = this.testPlans.find(plan => plan.name === name);
                if (newPlan) {
                    // 找到对应的DOM元素并选中
                    const planElements = document.querySelectorAll('.test-plan-item');
                    for (const element of planElements) {
                        const planName = element.querySelector('div > div:first-child').textContent;
                        if (planName === name) {
                            await this.selectTestPlan(newPlan, element);
                            break;
                        }
                    }
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
        document.getElementById('modal-overlay').classList.remove('hidden');
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
                id: this.currentTestPlan.id || this.currentTestPlan.name,
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
                const originalPlanId = this.currentTestPlan.id || this.currentTestPlan.name;
                
                // 重新加载计划列表
                await this.loadTestPlans();
                
                // 找到更新后的计划（通过原始ID查找）
                const updatedPlan = this.testPlans.find(plan => plan.id === originalPlanId || plan.name === originalPlanId);
                if (updatedPlan) {
                    // 更新当前选中的计划对象
                    this.currentTestPlan = updatedPlan;
                    
                    // 重新选中更新后的计划
                    const planElements = document.querySelectorAll('.test-plan-item');
                    for (const element of planElements) {
                        const planName = element.querySelector('div > div:first-child').textContent;
                        if (planName === updatedPlan.name) {
                            // 移除所有选中状态
                            document.querySelectorAll('.test-plan-item.selected').forEach(item => {
                                item.classList.remove('selected');
                            });
                            
                            // 选中当前计划
                            element.classList.add('selected');
                            
                            // 更新文件列表和测试类型卡片信息
                            this.selectTestPlanFiles(updatedPlan.testFiles || []);
                            this.selectTestPlanTypes(updatedPlan.testTypes || []);
                            
                            // 禁用测试目录和测试类型选项卡（保持置灰状态）
                            this.disableTestDirectoryTab();
                            this.disableTestTypeTab();
                            
                            break;
                        }
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
                const result = await window.electronAPI.deleteTestPlan(planId || planName);
                
                if (result.success) {
                    Toast.success(window.i18n.t('testExecution.deleteTestPlanSuccess'));
                    
                    // 级联删除：检查并更新包含此测试计划的定时计划
                    await this.cascadeDeleteFromScheduledPlans(planId, planName);
                    
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
    
    async cascadeDeleteFromScheduledPlans(testPlanId, testPlanName) {
        try {
            const scheduledPlans = await window.electronAPI.getScheduledPlans();
            const plansToUpdate = [];
            const plansToDelete = [];
            
            for (const plan of scheduledPlans) {
                if (plan.testPlans && plan.testPlans.length > 0) {
                    // 检查是否包含被删除的测试计划
                    const remainingTestPlans = plan.testPlans.filter(tp => {
                        const tpId = tp.id || tp.name;
                        return tpId !== testPlanId && tpId !== testPlanName;
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
        const modalOverlay = document.getElementById('report-modal-overlay');
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
        
        modalOverlay.classList.remove('hidden');
        
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
                this.enableStopAllureButton();
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
        const modalOverlay = document.getElementById('report-modal-overlay');
        modalOverlay.classList.add('hidden');
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

    async stopAllureServer() {
        try {
            this.appendOutput('>>> 正在停止Allure服务器...');
            
            const result = await window.electronAPI.stopAllureServer();
            
            if (result.success) {
                this.appendOutput(`>>> ${result.message}`);
                // 服务器停止后禁用停止按钮
                this.disableStopAllureButton();
            } else {
                this.appendOutput(`>>> 停止服务器失败: ${result.error}`);
            }
        } catch (error) {
            console.error('停止Allure服务器失败:', error);
            this.appendOutput(`>>> 停止Allure服务器失败: ${error.message}`);
        }
    }

    async enableStopAllureButton() {
        const stopAllureBtn = document.getElementById('stop-allure-btn');
        stopAllureBtn.disabled = false;
        
        // 定期检查服务器状态，如果服务器停止则禁用按钮
        this.checkAllureServerStatus();
    }

    disableStopAllureButton() {
        const stopAllureBtn = document.getElementById('stop-allure-btn');
        stopAllureBtn.disabled = true;
    }

    async checkAllureServerStatus() {
        try {
            // 检查allure open进程状态
            const status = await window.electronAPI.getAllureServerStatus();
            if (!status.running && !status.allureOpenRunning) {
                this.disableStopAllureButton();
            } else {
                // 如果进程仍在运行，继续检查
                setTimeout(() => this.checkAllureServerStatus(), 5000);
            }
        } catch (error) {
            console.error('检查进程状态失败:', error);
            // 出错时也禁用按钮
            this.disableStopAllureButton();
        }
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
                <div>
                    <div style="font-weight: 500;">${plan.name}</div>
                    <div style="font-size: 12px; color: var(--text-secondary);">${planNames}</div>
                    <div style="font-size: 10px; color: var(--text-tertiary); margin-top: 4px;">
                        <span class="scheduled-time">${formattedTime}</span>
                        <span class="scheduled-status ${status.class}">${status.text}</span>
                    </div>
                </div>
            `;

            planElement.addEventListener('click', () => {
                this.selectScheduledPlan(plan, planElement);
            });

            container.appendChild(planElement);
        });
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
        const modalOverlay = document.getElementById('scheduled-plan-modal-overlay');
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

        modalOverlay.classList.remove('hidden');
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

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.hideDateTimePicker();
            }
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

        this.testPlans.forEach(plan => {
            const isSelected = selectedPlanIds.includes(plan.id || plan.name);
            const planElement = document.createElement('div');
            planElement.className = 'checkbox-item scheduled-plan-checkbox';
            planElement.innerHTML = `
                <input type="checkbox" id="scheduled-plan-${plan.id || plan.name}" value="${plan.id || plan.name}" ${isSelected ? 'checked' : ''}>
                <label for="scheduled-plan-${plan.id || plan.name}">${plan.name}</label>
            `;
            container.appendChild(planElement);
        });
    }

    getSelectedTestPlansFromModal() {
        const selectedPlans = [];
        const checkboxes = document.querySelectorAll('#scheduled-test-plans-list input[type="checkbox"]:checked');
        checkboxes.forEach(checkbox => {
            const plan = this.testPlans.find(p => (p.id || p.name) === checkbox.value);
            if (plan) {
                selectedPlans.push({
                    id: plan.id || plan.name,
                    name: plan.name
                });
            }
        });
        return selectedPlans;
    }

    hideScheduledPlanModal() {
        document.getElementById('scheduled-plan-modal-overlay').classList.add('hidden');
    }

    editScheduledPlan() {
        if (!this.currentScheduledPlan) {
            this.showError(window.i18n.t('testExecution.selectScheduledPlanFirst') || '请先选择一个定时计划');
            return;
        }
        this.showEditScheduledPlanModal(this.currentScheduledPlan);
    }

    async showEditScheduledPlanModal(plan) {
        const modalOverlay = document.getElementById('scheduled-plan-modal-overlay');
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

        const selectedPlanIds = plan.testPlans ? plan.testPlans.map(p => p.id || p.name) : [];
        await this.loadTestPlansForScheduledModal(selectedPlanIds);

        document.getElementById('save-scheduled-plan-btn').classList.add('hidden');
        document.getElementById('update-scheduled-plan-btn').classList.remove('hidden');

        modalOverlay.classList.remove('hidden');
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
                const testPlanId = testPlanObj.id || testPlanObj.name;
                const testPlan = testPlans.find(p => p.id === testPlanId || p.name === testPlanId);
                
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
}



// 应用启动
document.addEventListener('DOMContentLoaded', () => {

    try {
        new XKAutoTesterApp();
        
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