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
    OPEN_REPORT_BY_PATH: 'open-report-by-path',
    GET_ALLURE_SERVER_STATUS: 'get-allure-server-status',
    CLEAR_ALLURE_REPORTS: 'clear-allure-reports',
    CLEAR_ALL_LOGS: 'clear-all-logs',
    
    // 配置
    GET_CONFIG: 'get-config',
    SAVE_CONFIG: 'save-config',
    
    // 更新
    CHECK_FOR_UPDATE: 'check-for-update',
    DOWNLOAD_UPDATE: 'download-update',
    INSTALL_UPDATE: 'install-update',
    ON_DOWNLOAD_PROGRESS: 'on-download-progress',

    INSPECTOR_START_SESSION: 'inspector:start-session',
    INSPECTOR_GET_SCREENSHOT: 'inspector:get-screenshot',
    INSPECTOR_GET_PAGE_SOURCE: 'inspector:get-page-source',
    INSPECTOR_FIND_ELEMENT_LOCATORS: 'inspector:find-element-locators',
    INSPECTOR_REFRESH_SESSION: 'inspector:refresh-session',
    INSPECTOR_STOP_SESSION: 'inspector:stop-session',

    EXPORT_CONFIG: 'export-config',
    EXPORT_LOGS: 'export-logs',
    IMPORT_CONFIG: 'import-config',
    SELECT_EXPORT_PATH: 'select-export-path',
    SELECT_IMPORT_PATH: 'select-import-path',
    ON_EXPORT_PROGRESS: 'on-export-progress',
    ON_IMPORT_PROGRESS: 'on-import-progress'
};

module.exports = { IPC_CHANNELS };
