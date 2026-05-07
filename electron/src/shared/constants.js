/**
 * IPC 通道常量定义
 * 主进程和渲染进程共享
 */

const IPC_CHANNELS = {
    // 窗口控制
    WINDOW_MINIMIZE: 'window-minimize',
    WINDOW_MAXIMIZE: 'window-maximize',
    WINDOW_CLOSE: 'window-close',
    WINDOW_IS_MAXIMIZED: 'window-is-maximized',
    
    // 测试操作
    RUN_PYTHON_TESTS: 'run-python-tests',
    GET_TEST_PLANS: 'get-test-plans',
    SAVE_TEST_PLAN: 'save-test-plan',
    UPDATE_TEST_PLAN: 'update-test-plan',
    DELETE_TEST_PLAN: 'delete-test-plan',
    
    // 定时计划
    GET_SCHEDULED_PLANS: 'get-scheduled-plans',
    SAVE_SCHEDULED_PLAN: 'save-scheduled-plan',
    UPDATE_SCHEDULED_PLAN: 'update-scheduled-plan',
    DELETE_SCHEDULED_PLAN: 'delete-scheduled-plan',
    
    // 报告相关
    VIEW_REPORT: 'view-report',
    CHECK_REPORT_EXISTS: 'check-report-exists',
    STOP_ALLURE_SERVER: 'stop-allure-server',
    GET_ALLURE_SERVER_STATUS: 'get-allure-server-status',
    
    // 配置
    GET_CONFIG: 'get-config',
    SAVE_CONFIG: 'save-config',
    
    // 更新
    CHECK_FOR_UPDATE: 'check-for-update',
    DOWNLOAD_UPDATE: 'download-update',
    INSTALL_UPDATE: 'install-update',
    ON_DOWNLOAD_PROGRESS: 'on-download-progress'
};

module.exports = { IPC_CHANNELS };
