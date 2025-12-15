class XKAutoTesterApp {
    constructor() {
        this.selectedDirectory = null;
        this.selectedTestFiles = [];
        this.testPlans = [];
        this.currentTestPlan = null;
        this.isRunning = false;
        this.isInitializing = false; // 添加初始化状态标志
        this.initialized = false; // 添加初始化完成标志
        
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
            console.log('应用已经初始化，跳过重复初始化');
            return;
        }
        this.isInitializing = true;
        
        console.log('开始初始化应用...');
        console.log('DOM状态:', document.readyState);
        console.log('test-type-selector容器:', document.getElementById('test-type-selector'));
        
        // 初始化事件监听
        this.setupEventListeners();
        
        // 只在应用启动时显示一次占位符
        this.initializePlaceholders();
        
        // 加载项目信息（不触发scanTestFiles）
        await this.loadProjectInfo();
        
        // 页面加载时就显示测试计划区域并加载测试计划
        const testPlanSection = document.getElementById('test-plan-section');
        testPlanSection.classList.remove('hidden');
        await this.loadTestPlans();
        
        // 初始化运行按钮状态
        this.updateRunButtonState();
        
        // 初始化计划按钮状态
        this.updatePlanButtons();
        
        // 添加滚动调试监听器
        this.addScrollDebugListeners();
        
        console.log('XKAutoTester App 初始化完成');
        this.isInitializing = false;
        this.initialized = true;
        
        // 强制显示占位符，确保它们被显示
        setTimeout(() => {
            console.log('强制检查占位符显示状态');
            this.forceDisplayPlaceholders();
        }, 1000);
    }

    setupEventListeners() {
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

        // 测试输出监听
        window.electronAPI.onTestOutput((event, data) => {
            this.appendOutput(data);
        });

        window.electronAPI.onTestError((event, data) => {
            this.appendError(data);
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
            console.log('项目信息:', info);
        } catch (error) {
            console.error('加载项目信息失败:', error);
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
            this.displayTestTypes([], '请先选择测试目录');
            this.displayTestPlansPlaceholder('测试计划为空');
            // 更新计划按钮状态
            this.updatePlanButtons();
            return;
        }

        try {
            // 安全检查：确保electronAPI已加载
            if (!window.electronAPI || !window.electronAPI.scanTestFiles) {
                this.showError('Electron API未正确加载，无法扫描测试文件');
                console.error('electronAPI未定义:', window.electronAPI);
                return;
            }
            
            // 调用后端API实时扫描tests文件夹
            const testFiles = await window.electronAPI.scanTestFiles(this.selectedDirectory);

            if (testFiles.length === 0) {
                this.showError('在tests目录下未找到任何测试文件');
                // 没有找到文件时，显示请选择文件的提示
                this.displayTestTypes([], '请选择测试文件');
                // 只有在没有测试计划时才显示占位符
                if (!this.testPlans || this.testPlans.length === 0) {
                    this.displayTestPlansPlaceholder('测试计划为空');
                }
                return;
            }

            this.displayTestFiles(testFiles);
            
            // 扫描到文件后，显示请选择文件的提示
            this.displayTestTypes([], '请选择测试文件');
            // 只有在没有测试计划时才显示占位符
            if (!this.testPlans || this.testPlans.length === 0) {
                this.displayTestPlansPlaceholder('测试计划为空');
            }
        } catch (error) {
            console.error('扫描测试文件失败:', error);
            this.showError('扫描测试文件失败: ' + error.message);
        }
    }

    // 初始化应用时设置占位符显示
    initializePlaceholders() {
        console.log('initializePlaceholders called');
        
        // 直接设置占位符，因为initializeApp已经在DOMContentLoaded之后执行
        this.setupPlaceholders();
        
        // 强制显示初始占位符
        this.displayTestTypes([], '请先选择测试目录');
    }
    
    // 实际设置占位符的逻辑
    setupPlaceholders() {
        console.log('setupPlaceholders called');
        
        // 检查是否已经有占位符，如果没有才设置
        const testTypeContainer = document.getElementById('test-type-selector');
        const testPlansContainer = document.getElementById('test-plans-list');
        
        // 如果测试类型容器没有占位符，才设置
        if (testTypeContainer && !testTypeContainer.querySelector('.placeholder-message')) {
            console.log('设置测试类型占位符');
            this.displayTestTypes([], '请先选择测试目录');
        }
        
        // 如果测试计划容器没有占位符，才设置
        if (testPlansContainer && !testPlansContainer.querySelector('.placeholder-message')) {
            console.log('设置测试计划占位符');
            this.displayTestPlansPlaceholder('测试计划为空');
        }
    }

    forceDisplayPlaceholders() {
        console.log('forceDisplayPlaceholders called');
        
        // 强制清空测试类型选择器并显示占位符
        const container = document.getElementById('test-type-selector');
        if (container) {
            console.log('强制清空测试类型选择器');
            container.innerHTML = '';
            
            // 使用与测试计划一致的占位符样式
            const placeholderElement = document.createElement('div');
            placeholderElement.className = 'placeholder-message';
            placeholderElement.innerHTML = `
                <span class="material-icons">info</span>
                <span>请先选择测试目录</span>
            `;
            container.appendChild(placeholderElement);
            
            console.log('占位符已添加到容器');
        }
        
        // 只有在没有测试计划时才显示测试计划占位符
        if (this.testPlans && this.testPlans.length === 0) {
            console.log('没有测试计划，显示占位符');
            this.displayTestPlansPlaceholder('测试计划为空');
        } else {
            console.log('已有测试计划，不覆盖显示');
        }
        
        console.log('强制显示占位符完成');
    }

    displayTestFiles(files) {
        const container = document.getElementById('test-files-list');
        container.innerHTML = '';

        files.forEach(file => {
            const fileElement = document.createElement('div');
            fileElement.className = 'test-file-item';
            fileElement.setAttribute('data-path', file.path);
            fileElement.innerHTML = `
                <span class="material-icons">description</span>
                <span>${file.name}</span>
            `;

            fileElement.addEventListener('click', () => {
                this.toggleTestFile(file, fileElement);
            });

            container.appendChild(fileElement);
        });
    }

    toggleTestFile(file, element) {
        const index = this.selectedTestFiles.findIndex(f => f.path === file.path);
        
        if (index >= 0) {
            // 取消选择
            this.selectedTestFiles.splice(index, 1);
            element.classList.remove('selected');
        } else {
            // 选择
            this.selectedTestFiles.push(file);
            element.classList.add('selected');
        }

        // 基于选中的文件动态更新测试类型选择器
        // 添加防抖机制，避免频繁调用
        if (this.updateTestTypesTimeout) {
            clearTimeout(this.updateTestTypesTimeout);
        }
        this.updateTestTypesTimeout = setTimeout(() => {
            // 如果正在通过测试计划选择文件，则不触发标记提取
            if (!this.selectingFromPlan) {
                this.updateTestTypesFromSelectedFiles();
            }
        }, 100);
        
        this.updateRunButtonState();
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
        
        console.log('updatePlanButtons called, hasSelectedPlan:', hasSelectedPlan, 'currentTestPlan:', this.currentTestPlan);
        
        newPlanButton.disabled = !hasDirectory;
        editPlanButton.disabled = !hasSelectedPlan;
        deletePlanButton.disabled = !hasSelectedPlan;
        
        // 更新查看报告按钮状态
        if (hasSelectedPlan) {
            console.log('有选中计划，调用enableViewReportButton');
            await this.enableViewReportButton();
        } else {
            console.log('没有选中计划，直接禁用查看报告按钮');
            viewReportButton.disabled = true;
        }
    }

    async updateTestTypesFromSelectedFiles() {
        if (this.selectedTestFiles.length === 0) {
            // 没有选中文件时，显示占位提示
            this.displayTestTypes([], '请先选择测试文件');
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
            console.log('标记提取正在进行中，等待完成...');
            return await this.extractingMarkers;
        }
        
        // 调用后端API来扫描选中的文件并提取pytest标记
        try {
            console.log('开始提取pytest标记，文件数量:', this.selectedTestFiles.length);
            
            // 设置提取状态
            this.extractingMarkers = window.electronAPI.extractPytestMarkers(this.selectedTestFiles.map(f => f.path));
            const markers = await this.extractingMarkers;
            
            console.log('pytest标记提取完成，标记数量:', markers.length);
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

    async runTests() {
        if (this.isRunning || !this.currentTestPlan) {
            if (!this.currentTestPlan) {
                this.showError('请先选择一个测试计划');
            }
            return;
        }

        this.isRunning = true;
        this.updateUIForRunning();

        try {
            const testConfig = {
                testPaths: this.selectedTestFiles.map(f => f.path),
                markers: this.getSelectedTestTypes(),
                testPlanName: this.currentTestPlan?.name || null
            };

            const result = await window.electronAPI.runPythonTests(testConfig);
            
            if (result.success) {
                this.appendOutput('>>> 测试运行完成！');
                this.enableViewReportButton();
            } else {
                this.appendError(`>>> 测试运行失败 (退出码: ${result.exitCode})`);
            }
        } catch (error) {
            console.error('运行测试失败:', error);
            this.appendError('>>> 运行测试失败: ' + error.message);
        } finally {
            this.isRunning = false;
            this.updateUIForStopped();
        }
    }

    stopTests() {
        // 这里应该实现停止测试的逻辑
        // 目前Electron主进程还没有实现停止功能
        this.isRunning = false;
        this.updateUIForStopped();
        this.appendOutput('>>> 测试已停止');
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
    }

    updateUIForStopped() {
        document.getElementById('run-tests-btn').disabled = false;
        document.getElementById('stop-tests-btn').disabled = true;
        
        this.updateProgress('准备就绪', 100);
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
        output.innerHTML = '<div class="welcome-message"><span class="material-icons">rocket_launch</span><h3>欢迎使用 XKAutoTester</h3><p>选择测试目录和类型，然后点击运行测试开始自动化测试。</p></div>';
        // 移除有内容时的滚动条样式
        output.classList.remove('has-content');
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
                { name: 'smoke', description: '冒烟测试' },
                { name: 'unit', description: '单元功能测试' },
                { name: 'exception', description: '异常场景测试' },
                { name: 'critical', description: '关键功能测试' },
                { name: 'appium', description: 'Appium移动端测试' }
            ];
            this.displayTestTypes(defaultMarkers);
        }
    }

    displayTestTypes(markers, placeholder = null) {
        console.log('displayTestTypes called - markers:', markers.length, 'placeholder:', placeholder);
        
        const container = document.getElementById('test-type-selector');
        if (!container) {
            console.log('容器不存在，跳过显示');
            return;
        }
        
        // 添加调试日志
        console.log('displayTestTypes called with markers:', markers.map(m => m.name));
        
        // 如果有占位符，强制重新渲染
        if (placeholder) {
            console.log('有占位符，强制重新渲染');
            container.innerHTML = '';
        } else {
            // 检查是否已经有相同的内容，避免重复渲染
            const currentMarkers = Array.from(container.querySelectorAll('input[type="checkbox"]')).map(cb => cb.id.replace('-tests', ''));
            const newMarkers = markers.map(m => m.name);
            
            // 如果内容相同，不重新渲染
            if (currentMarkers.length === newMarkers.length && 
                currentMarkers.every(marker => newMarkers.includes(marker))) {
                console.log('Markers already displayed, skipping re-render');
                return;
            }
            
            container.innerHTML = '';
        }

        if (placeholder) {
            // 显示占位提示 - 使用与测试计划一致的样式
            const placeholderElement = document.createElement('div');
            placeholderElement.className = 'placeholder-message';
            placeholderElement.innerHTML = `
                <span class="material-icons">info</span>
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
                <span class="material-icons">info</span>
                <span>没有找到pytest标记，将执行所有测试</span>
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

        console.log('Unique markers to display:', uniqueMarkers.map(m => m.name));

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
        
        console.log('Displayed markers count:', container.querySelectorAll('input[type="checkbox"]').length);
    }

    async loadTestPlans() {
        try {
            console.log('开始加载测试计划...');
            this.testPlans = await window.electronAPI.getTestPlans();
            console.log('获取到的测试计划数据:', this.testPlans);
            console.log('测试计划数量:', this.testPlans.length);
            this.displayTestPlans();
        } catch (error) {
            console.error('加载测试计划失败:', error);
        }
    }

    displayTestPlans() {
        console.log('开始显示测试计划，数量:', this.testPlans.length);
        const container = document.getElementById('test-plans-list');
        console.log('测试计划容器:', container);
        container.innerHTML = '';

        if (this.testPlans.length === 0) {
            // 没有测试计划时显示占位符，但测试计划区域仍然显示
            console.log('没有测试计划，显示占位符');
            this.displayTestPlansPlaceholder('暂无测试计划');
            return;
        }

        console.log('开始渲染测试计划列表');
        this.testPlans.forEach(plan => {
            const planElement = document.createElement('div');
            planElement.className = 'test-plan-item';
            
            // 构建测试计划详细信息
            const fileCount = plan.testFiles ? plan.testFiles.length : 0;
            const typeCount = plan.testTypes ? plan.testTypes.length : 0;
            const fileInfo = fileCount > 0 ? `${fileCount}个文件` : '无文件';
            const typeInfo = typeCount > 0 ? `${typeCount}个类型` : '所有类型';
            
            planElement.innerHTML = `
                <span class="material-icons">assignment</span>
                <div>
                    <div style="font-weight: 500;">${plan.name}</div>
                    <div style="font-size: 12px; color: var(--text-secondary);">${plan.description || '无描述'}</div>
                    <div style="font-size: 10px; color: var(--text-tertiary); margin-top: 4px;">
                        >>> ${fileInfo} | >>> ${typeInfo}
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
            <span class="material-icons">info</span>
            <span>${message}</span>
        `;
        container.appendChild(placeholderElement);
    }

    selectTestPlanFiles(testFiles) {
        // 设置标志，表示正在通过测试计划选择文件
        this.selectingFromPlan = true;
        
        // 清空当前选中的测试文件
        this.selectedTestFiles = [];
        
        console.log('selectTestPlanFiles called - testFiles:', testFiles);
        
        // 先移除所有文件的选中状态
        document.querySelectorAll('.test-file-item.selected').forEach(item => {
            item.classList.remove('selected');
        });
        
        // 根据测试计划中的文件路径自动勾选对应的测试文件
        testFiles.forEach(planFile => {
            // 尝试多种路径匹配方式，确保能找到对应的文件
            const fileItem = this.findTestFileItemByPath(planFile.path);
            console.log('Looking for file:', planFile.path, 'Found:', !!fileItem);
            if (fileItem) {
                fileItem.classList.add('selected');
                this.selectedTestFiles.push(planFile);
                console.log('File selected:', planFile.name);
            }
        });
        
        console.log('Selected files count:', this.selectedTestFiles.length);
        
        // 更新运行按钮状态
        this.updateRunButtonState();
        
        // 清除标志
        setTimeout(() => {
            this.selectingFromPlan = false;
        }, 100);
    }

    selectTestPlanDirectory(testFiles) {
        // 根据测试计划中的文件路径自动推断并设置测试目录
        if (testFiles.length === 0) {
            return;
        }
        
        // 从第一个文件的路径推断目录
        const firstFile = testFiles[0];
        if (firstFile && firstFile.path) {
            // 从文件路径中提取目录路径
            // 例如："tests\\test_playwright.py" -> 推断项目根目录
            const pathParts = firstFile.path.split(/[\\/]/);
            
            // 如果路径包含"tests"目录，则推断项目根目录
            if (pathParts.includes('tests')) {
                // 找到"tests"目录的索引
                const testsIndex = pathParts.indexOf('tests');
                // 项目根目录是"tests"目录的父目录
                const projectRoot = pathParts.slice(0, testsIndex).join('/');
                
                // 如果项目根目录为空（即tests在根目录下），则使用项目根目录
                if (projectRoot === '') {
                    // 使用项目根目录（当前目录）
                    this.selectedDirectory = '.';
                } else {
                    this.selectedDirectory = projectRoot;
                }
                
                // 使用绝对路径：将相对路径转换为绝对路径
                // 假设项目根目录是Electron应用所在目录的父目录
                const absolutePath = this.getAbsolutePath(this.selectedDirectory);
                this.selectedDirectory = absolutePath;
                
                // 从测试计划路径中提取文件夹名称用于显示
                // 例如：从"tests\\test_playwright.py"中提取"tests"作为显示名称
                this.selectedDirectoryDisplayName = 'tests';
                
                this.updateSelectedDirectory();
                this.appendOutput(`📁 已自动设置测试目录: ${this.selectedDirectory}`);
                
                // 调试信息：显示推断的路径详情
                console.log('路径推断详情:', {
                    originalPath: firstFile.path,
                    pathParts: pathParts,
                    testsIndex: testsIndex,
                    projectRoot: projectRoot,
                    selectedDirectory: this.selectedDirectory,
                    displayName: this.selectedDirectoryDisplayName
                });
            } else {
                // 如果路径不包含tests目录，直接使用文件所在目录
                const fileDir = pathParts.slice(0, -1).join('/');
                if (fileDir) {
                    this.selectedDirectory = fileDir;
                    // 使用文件所在目录的最后一个部分作为显示名称
                    this.selectedDirectoryDisplayName = pathParts[pathParts.length - 2] || fileDir.split(/[\\/]/).pop();
                    this.updateSelectedDirectory();
                    this.appendOutput(`📁 已自动设置测试目录: ${fileDir}`);
                }
            }
        }
    }

    selectTestPlanTypes(testTypes) {
        // 根据测试计划中的测试类型自动勾选对应的测试类型
        const container = document.getElementById('test-type-selector');
        const checkboxes = container.querySelectorAll('input[type="checkbox"]');
        
        console.log('selectTestPlanTypes called - testTypes:', testTypes, 'checkboxes found:', checkboxes.length);
        
        // 测试类型中文映射
        const markerDescriptions = {
            'smoke': '冒烟测试',
            'critical': '关键功能测试',
            'exception': '异常场景测试'
        };
        
        // 如果没有复选框，或者需要更新显示文本，重新创建测试类型显示
        if (checkboxes.length === 0 || testTypes.length > 0) {
            console.log('Creating/updating test type display with Chinese mapping');
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
        const directoryCard = document.querySelector('.left-panel .material-card:nth-child(2)');
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
        const directoryCard = document.querySelector('.left-panel .material-card:nth-child(2)');
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
        const typeCard = document.querySelector('.left-panel .material-card:nth-child(3)');
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
        const typeCard = document.querySelector('.left-panel .material-card:nth-child(3)');
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
            testTypeSelector.style.pointerEvents = 'auto';
        }
    }

    addScrollDebugListeners() {
        // 添加鼠标滚轮监听器来帮助调试滚动问题
        const testFilesList = document.getElementById('test-files-list');
        const testTypeSelector = document.getElementById('test-type-selector');
        
        if (testFilesList) {
            testFilesList.addEventListener('wheel', (event) => {
                console.log('文件列表滚轮事件:', {
                    deltaY: event.deltaY,
                    target: event.target.className,
                    containerScrollTop: testFilesList.scrollTop,
                    containerScrollHeight: testFilesList.scrollHeight,
                    containerClientHeight: testFilesList.clientHeight
                });
            });
        }
        
        if (testTypeSelector) {
            testTypeSelector.addEventListener('wheel', (event) => {
                console.log('测试类型列表滚轮事件:', {
                    deltaY: event.deltaY,
                    target: event.target.className,
                    containerScrollTop: testTypeSelector.scrollTop,
                    containerScrollHeight: testTypeSelector.scrollHeight,
                    containerClientHeight: testTypeSelector.clientHeight
                });
            });
        }
    }

    async selectTestPlan(plan, element) {
        // 检查是否是取消选中（再次点击已选中的计划）
        if (this.currentTestPlan && this.currentTestPlan.name === plan.name) {
            // 取消选中
            element.classList.remove('selected');
            this.currentTestPlan = null;
            this.appendOutput(`📋 已取消选择测试计划: ${plan.name}`);
            
            // 清空选中的测试文件
            this.selectedTestFiles = [];
            
            // 移除所有文件的选中状态
            document.querySelectorAll('.test-file-item.selected').forEach(item => {
                item.classList.remove('selected');
            });
            
            // 清空文件列表显示，恢复到初始状态
            this.displayTestFiles([]);
            
            // 清空测试类型显示，恢复到初始占位符状态
            this.displayTestTypes([], '请先选择测试目录');
            
            // 清空目录显示区域
            this.selectedDirectory = null;
            this.selectedDirectoryDisplayName = null;
            this.updateSelectedDirectory();
            
            // 重新启用测试目录和测试类型选项卡
            this.enableTestDirectoryTab();
            this.enableTestTypeTab();
            
            // 更新运行按钮状态
            this.updateRunButtonState();
            
            // 更新计划按钮状态（编辑和删除计划按钮需要恢复置灰）
            this.updatePlanButtons();
            return;
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
                console.error('扫描测试文件失败:', error);
            }
        }
        
        // 先根据计划筛选测试类型，再选择测试文件（避免闪现）
        this.selectTestPlanTypes(plan.testTypes || []);
        this.selectTestPlanFiles(plan.testFiles || []);
        
        // 如果是"什么都没有选择"的场景，确保目录、文件、类型都被正确选中
        if (wasNothingSelected) {
            // 确保目录被正确设置
            if (plan.testFiles && plan.testFiles.length > 0) {
                // 重新调用目录选择以确保目录被正确设置
                setTimeout(() => {
                    this.selectTestPlanDirectory(plan.testFiles);
                }, 100);
            }
            
            // 确保文件被正确选中
            if (plan.testFiles && plan.testFiles.length > 0) {
                setTimeout(() => {
                    this.selectTestPlanFiles(plan.testFiles);
                }, 200);
            }
            
            // 确保测试类型被正确选中
            if (plan.testTypes && plan.testTypes.length > 0) {
                setTimeout(() => {
                    this.selectTestPlanTypes(plan.testTypes);
                }, 300);
            }
        }
        
        // 禁用测试目录和测试类型选项卡
        this.disableTestDirectoryTab();
        this.disableTestTypeTab();
        
        // 更新UI显示选中的测试计划
        this.appendOutput(`📋 已选择测试计划: ${plan.name}`);
        
        // 如果是"什么都没有选择"的场景，显示额外的提示信息
        if (wasNothingSelected) {
            this.appendOutput(`✅ 已自动选中对应的目录、文件和测试类型`);
        }
        
        // 更新计划按钮状态（编辑和删除计划按钮需要启用）
        this.updatePlanButtons();
    }

    async displayModalTestFiles() {
        const container = document.getElementById('modal-test-files');
        container.innerHTML = '';

        if (!this.selectedDirectory) {
            // 未选择目录时显示提示
            const placeholderElement = document.createElement('div');
            placeholderElement.className = 'no-files';
            placeholderElement.innerHTML = '请先选择测试目录';
            container.appendChild(placeholderElement);
            return;
        }

        // 调用后端API实时扫描tests文件夹
        const testFiles = await window.electronAPI.scanTestFiles(this.selectedDirectory);

        if (testFiles.length === 0) {
            // 没有测试文件时显示提示
            const placeholderElement = document.createElement('div');
            placeholderElement.className = 'no-files';
            placeholderElement.innerHTML = '当前目录下没有测试文件';
            container.appendChild(placeholderElement);
            return;
        }

        testFiles.forEach(file => {
            const fileElement = document.createElement('div');
            fileElement.className = 'modal-test-file-item';
            fileElement.innerHTML = `
                <input type="checkbox" id="modal-file-${file.name}" value="${file.path}">
                <label for="modal-file-${file.name}">
                    <span class="material-icons">description</span>
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

    async updateModalTestTypes(selectedTypes = null) {
        // 防重复调用机制：如果正在更新模态框测试类型，等待完成
        if (this.updatingModalTypes) {
            console.log('模态框测试类型更新正在进行中，等待完成...');
            return await this.updatingModalTypes;
        }
        
        const container = document.getElementById('modal-test-types');
        container.innerHTML = '';

        // 获取弹窗中选择的文件
        const selectedFiles = this.getModalSelectedTestFiles();
        
        // 添加调试日志
        console.log('updateModalTestTypes - 选中的文件数量:', selectedFiles.length);
        console.log('updateModalTestTypes - 选中的文件:', selectedFiles.map(f => f.name));
        console.log('updateModalTestTypes - 需要选中的测试类型:', selectedTypes);
        
        if (selectedFiles.length === 0) {
            // 没有选中文件时，显示占位提示
            const placeholder = document.createElement('div');
            placeholder.className = 'placeholder-message';
            placeholder.textContent = '请先选择测试文件';
            container.appendChild(placeholder);
            return;
        }

        try {
            console.log('开始更新模态框测试类型，文件数量:', selectedFiles.length);
            
            // 设置更新状态
            this.updatingModalTypes = (async () => {
                // 从选中的文件中提取pytest标记
                const markers = await this.extractMarkersFromModalSelectedFiles(selectedFiles);
                
                if (markers.length === 0) {
                    // 选中的文件没有标记时，显示占位提示
                    const placeholder = document.createElement('div');
                    placeholder.className = 'placeholder-message';
                    placeholder.textContent = '选中的文件没有pytest标记，将执行所有测试';
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
                        item.innerHTML = `
                            <input type="checkbox" id="modal-type-${marker.name}" value="${marker.name}">
                            <label for="modal-type-${marker.name}">
                                <span class="material-icons">category</span>
                                <strong>${marker.name}</strong> - ${marker.description}
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
                
                console.log('模态框测试类型更新完成');
            })();
            
            await this.updatingModalTypes;
        } catch (error) {
            console.error('提取标记失败:', error);
            const placeholder = document.createElement('div');
            placeholder.className = 'placeholder-message';
            placeholder.textContent = '提取标记失败，将执行所有测试';
            container.appendChild(placeholder);
        } finally {
            // 清除更新状态
            this.updatingModalTypes = null;
        }
    }

    async displayModalTestTypes() {
        // 直接调用updateModalTestTypes方法，不传递selectedTypes参数（默认选中所有）
        await this.updateModalTestTypes();
    }

    async showNewPlanModal() {
        document.getElementById('modal-overlay').classList.remove('hidden');
        document.getElementById('modal-title').textContent = '新建测试计划';
        document.getElementById('plan-name').value = '';
        document.getElementById('plan-description').value = '';
        
        // 显示当前目录下的测试文件和测试类型
        await this.displayModalTestFiles();
        await this.displayModalTestTypes();
        
        // 显示保存按钮，隐藏更新按钮
        document.getElementById('save-plan-btn').classList.remove('hidden');
        document.getElementById('update-plan-btn').classList.add('hidden');
    }

    hideModal() {
        document.getElementById('modal-overlay').classList.add('hidden');
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

    async saveTestPlan() {
        const name = document.getElementById('plan-name').value.trim();
        const description = document.getElementById('plan-description').value.trim();

        if (!name) {
            this.showError('请输入计划名称');
            return;
        }

        // 获取模态框中选择的测试文件和测试类型
        const selectedTestFiles = this.getModalSelectedTestFiles();
        const selectedTestTypes = this.getModalSelectedTestTypes();

        if (selectedTestFiles.length === 0) {
            this.showError('请至少选择一个测试文件');
            return;
        }

        // 如果没有选择测试类型，显示提示信息（但不阻止保存）
        if (selectedTestTypes.length === 0) {
            this.appendOutput('⚠️ 没有选择测试类型，将默认执行所有测试');
        }

        try {
            const planData = {
                name: name,
                description: description,
                created: new Date().toISOString(),
                testFiles: selectedTestFiles,
                testTypes: selectedTestTypes
            };

            const result = await window.electronAPI.saveTestPlan(planData);
            
            if (result.success) {
                this.hideModal();
                await this.loadTestPlans();
                this.appendOutput(`✅ 测试计划 "${name}" 保存成功`);
                
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
                this.showError('保存测试计划失败: ' + result.error);
            }
        } catch (error) {
            console.error('保存测试计划失败:', error);
            this.showError('保存测试计划失败: ' + error.message);
        }
    }

    editTestPlan() {
        if (!this.currentTestPlan) {
            this.showError('请先选择一个测试计划');
            return;
        }
        
        this.showEditPlanModal(this.currentTestPlan);
    }

    async showEditPlanModal(plan) {
        document.getElementById('modal-overlay').classList.remove('hidden');
        document.getElementById('modal-title').textContent = '编辑测试计划';
        
        // 填充现有数据
        document.getElementById('plan-name').value = plan.name;
        document.getElementById('plan-description').value = plan.description || '';
        
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
            this.showError('没有选中的测试计划');
            return;
        }

        const name = document.getElementById('plan-name').value.trim();
        const description = document.getElementById('plan-description').value.trim();

        if (!name) {
            this.showError('请输入计划名称');
            return;
        }

        // 获取模态框中选择的测试文件和测试类型
        const selectedTestFiles = this.getModalSelectedTestFiles();
        const selectedTestTypes = this.getModalSelectedTestTypes();

        if (selectedTestFiles.length === 0) {
            this.showError('请至少选择一个测试文件');
            return;
        }

        // 如果没有选择测试类型，显示提示信息（但不阻止保存）
        if (selectedTestTypes.length === 0) {
            this.appendOutput('⚠️ 没有选择测试类型，将默认执行所有测试');
        }

        try {
            const planData = {
                id: this.currentTestPlan.id || this.currentTestPlan.name,
                name: name,
                description: description,
                created: this.currentTestPlan.created || new Date().toISOString(),
                testFiles: selectedTestFiles,
                testTypes: selectedTestTypes
            };

            const result = await window.electronAPI.updateTestPlan(planData);
            
            if (result.success) {
                this.hideModal();
                this.appendOutput(`>>> 测试计划 "${name}" 更新成功`);
                
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
                this.showError('更新测试计划失败: ' + result.error);
            }
        } catch (error) {
            console.error('更新测试计划失败:', error);
            this.showError('更新测试计划失败: ' + error.message);
        }
    }

    async deleteTestPlan() {
        if (!this.currentTestPlan) {
            this.showError('请先选择一个测试计划');
            return;
        }

        const planName = this.currentTestPlan.name;
        const confirmDelete = confirm(`确定要删除测试计划 "${planName}" 吗？此操作不可撤销。`);
        
        if (!confirmDelete) {
            return;
        }

        try {
            const result = await window.electronAPI.deleteTestPlan(this.currentTestPlan.id || planName);
            
            if (result.success) {
                this.appendOutput(`>>> 测试计划 "${planName}" 已删除`);
                
                // 删除计划后取消所有选中，恢复默认初始状态
                this.currentTestPlan = null;
                
                // 清除所有计划项的选中样式
                const planElements = document.querySelectorAll('.test-plan-item');
                planElements.forEach(element => {
                    element.classList.remove('selected');
                });
                
                // 清除目录信息
                this.selectedDirectory = null;
                this.selectedDirectoryDisplayName = null;
                this.updateSelectedDirectory();
                
                // 清除文件列表
                this.selectedTestFiles = [];
                this.displayTestFiles([]);
                
                // 清除测试类型信息
                this.displayTestTypes([], '请先选择测试目录');
                
                // 重新启用测试目录和测试类型选项卡
                this.enableTestDirectoryTab();
                this.enableTestTypeTab();
                
                await this.loadTestPlans();
                // 更新运行按钮状态
                this.updateRunButtonState();
                // 更新计划按钮状态（删除计划按钮需要恢复置灰）
                this.updatePlanButtons();
            } else {
                this.showError('删除测试计划失败: ' + result.error);
            }
        } catch (error) {
            console.error('删除测试计划失败:', error);
            this.showError('删除测试计划失败: ' + error.message);
        }
    }

    async viewReport() {
        try {
            const selectedPlan = this.getSelectedTestPlan();
            if (!selectedPlan) {
                this.appendOutput('>>> 请先选择一个测试计划');
                return;
            }

            this.appendOutput(`>>> 正在打开测试计划 '${selectedPlan.name}' 的报告...`);
            
            const result = await window.electronAPI.viewReport(selectedPlan.name);
            
            if (result.success) {
                this.appendOutput(`>>> ${result.message}`);
                // 查看报告后启用停止服务器按钮
                this.enableStopAllureButton();
            } else {
                this.appendOutput(`>>> 打开报告失败: ${result.error}`);
            }
        } catch (error) {
            console.error('查看报告失败:', error);
            this.appendOutput(`>>> 查看报告失败: ${error.message}`);
        }
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
        
        console.log('enableViewReportButton called, selectedPlan:', selectedPlan);
        
        if (!selectedPlan) {
            console.log('没有选中计划，禁用查看报告按钮');
            viewReportBtn.disabled = true;
            return;
        }

        console.log('检查测试计划报告是否存在，计划名称:', selectedPlan.name);

        try {
            // 检查报告是否存在
            const result = await window.electronAPI.checkReportExists(selectedPlan.name);
            console.log('检查报告存在性结果:', result);
            viewReportBtn.disabled = !result.exists;
            console.log('查看报告按钮禁用状态:', viewReportBtn.disabled);
        } catch (error) {
            console.error('检查报告存在性失败:', error);
            viewReportBtn.disabled = true;
        }
    }

    showError(message) {
        this.appendError(message);
    }

    showSuccess(message) {
        this.appendOutput('✅ ' + message);
    }
}

// 应用启动
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded事件触发，开始创建应用实例');
    try {
        new XKAutoTesterApp();
        console.log('XKAutoTesterApp实例创建成功');
    } catch (error) {
        console.error('创建XKAutoTesterApp实例失败:', error);
    }
});