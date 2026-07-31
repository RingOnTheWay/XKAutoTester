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
    WINDOW_SET_IGNORE_MOUSE_EVENTS: 'window-set-ignore-mouse-events',
    WINDOW_DRAG_START: 'window-drag-start',
    WINDOW_DRAG_MOVE: 'window-drag-move',
    WINDOW_DRAG_END: 'window-drag-end',
    WINDOW_MAXIMIZED: 'window-maximized',

    // 测试操作
    RUN_PYTHON_TESTS: 'run-python-tests',
    STOP_PYTHON_TESTS: 'stop-python-tests',
    GET_TEST_PLANS: 'get-test-plans',
    SAVE_TEST_PLAN: 'save-test-plan',
    UPDATE_TEST_PLAN: 'update-test-plan',
    DELETE_TEST_PLAN: 'delete-test-plan',
    GET_TEST_PLAN_RUNS: 'get-test-plan-runs',
    SCAN_TEST_FILES: 'scan-test-files',
    GET_PYTEST_MARKERS: 'get-pytest-markers',
    EXTRACT_PYTEST_MARKERS: 'extract-pytest-markers',
    LOG_TEST_OUTPUT: 'log-test-output',
    TEST_OUTPUT: 'test-output',
    TEST_ERROR: 'test-error',

    // 定时计划
    GET_SCHEDULED_PLANS: 'get-scheduled-plans',
    SAVE_SCHEDULED_PLAN: 'save-scheduled-plan',
    UPDATE_SCHEDULED_PLAN: 'update-scheduled-plan',
    DELETE_SCHEDULED_PLAN: 'delete-scheduled-plan',
    CHECK_TIME_CONFLICT: 'check-time-conflict',
    GET_SCHEDULER_STATUS: 'get-scheduler-status',
    SCHEDULED_TEST_COMPLETE: 'scheduled-test-complete',
    SCHEDULED_TEST_START: 'scheduled-test-start',
    SCHEDULED_PLAN_EXPIRED: 'scheduled-plan-expired',
    GET_SCHEDULED_PLAN_RUNS: 'get-scheduled-plan-runs',

    // 报告相关
    VIEW_REPORT: 'view-report',
    CHECK_REPORT_EXISTS: 'check-report-exists',
    OPEN_REPORT_BY_PATH: 'open-report-by-path',
    GET_ALLURE_SERVER_STATUS: 'get-allure-server-status',
    CLEAR_ALLURE_REPORTS: 'clear-allure-reports',
    DELETE_REPORT_RUN: 'delete-report-run',
    CLEAR_ALL_LOGS: 'clear-all-logs',
    SEND_DINGTALK_NOTIFICATION: 'send-dingtalk-notification',

    // 配置
    GET_CONFIG: 'get-config',
    SAVE_CONFIG: 'save-config',
    GET_PROJECT_INFO: 'get-project-info',
    GET_DATA_PATH: 'get-data-path',
    CHANGE_DATA_PATH: 'change-data-path',
    RESET_DATA_PATH: 'reset-data-path',
    SHOW_DIALOG: 'show-dialog',
    RELAUNCH_APP: 'relaunch-app',

    // 更新
    CHECK_FOR_UPDATE: 'check-for-update',
    DOWNLOAD_UPDATE: 'download-update',
    INSTALL_UPDATE: 'install-update',
    ON_DOWNLOAD_PROGRESS: 'on-download-progress',

    // 设备
    GET_CONNECTED_DEVICES: 'getConnectedDevices',
    EXECUTE_ADB_COMMAND: 'executeAdbCommand',
    UPLOAD_FILE: 'uploadFile',
    DOWNLOAD_FILE: 'downloadFile',
    START_SCRCPY: 'start-scrcpy',
    SCRCPY_ERROR: 'scrcpy-error',
    UPLOAD_PROGRESS: 'upload-progress',
    DOWNLOAD_PROGRESS: 'download-progress',
    INSTALL_PROGRESS: 'install-progress',

    // 文件操作
    SELECT_DIRECTORY: 'select-directory',
    SELECT_FILE: 'select-file',
    SELECT_FILES: 'selectFiles',
    SELECT_APK_FILE: 'select-apk-file',
    OPEN_EXTERNAL: 'open-external',
    OPEN_PATH: 'open-path',
    SAVE_TEST_CASE: 'save-test-case',
    DELETE_TEST_CASE: 'delete-test-case',
    CHECK_PATH_EXISTS: 'checkPathExists',
    CREATE_DIRECTORY: 'createDirectory',

    // ADB
    INSTALL_APK: 'install-apk',

    // 环境
    START_CHECKS: 'start-checks',
    CHECK_PROGRESS: 'check-progress',
    CHECK_RESULT: 'check-result',
    CHECK_COMPLETE: 'check-complete',
    INSTALL_DRIVER: 'install-driver',
    CHECK_INSTALLER_RUNNING: 'check-installer-running',
    SPLASH_READY: 'splash-ready',
    RECHECK_CP210X_DRIVER: 'recheck-cp210x-driver',
    GET_SERIAL_PORTS: 'getSerialPorts',

    // 版本
    GET_VERSION_INFO: 'get-version-info',
    GET_VERSION: 'get-version',
    GET_DISPLAY_VERSION: 'get-display-version',

    // 电源
    SET_PREVENT_SLEEP: 'set-prevent-sleep',

    // Inspector
    INSPECTOR_START_SESSION: 'inspector:start-session',
    INSPECTOR_GET_SCREENSHOT: 'inspector:get-screenshot',
    INSPECTOR_GET_PAGE_SOURCE: 'inspector:get-page-source',
    INSPECTOR_FIND_ELEMENT_LOCATORS: 'inspector:find-element-locators',
    INSPECTOR_REFRESH_SESSION: 'inspector:refresh-session',
    INSPECTOR_STOP_SESSION: 'inspector:stop-session',
    INSPECTOR_PROGRESS: 'inspector:progress',

    // 数据传输
    EXPORT_CONFIG: 'export-config',
    EXPORT_LOGS: 'export-logs',
    IMPORT_CONFIG: 'import-config',
    SELECT_EXPORT_PATH: 'select-export-path',
    SELECT_IMPORT_PATH: 'select-import-path',
    ON_EXPORT_PROGRESS: 'on-export-progress',
    ON_IMPORT_PROGRESS: 'on-import-progress',

    // APK 解析
    APK_PARSE: 'apk:parse',

    // 蓝牙设备发现
    BLE_DEVICE_DISCOVERY_GET_DEVICES: 'ble-device-discovery:get-devices',
    BLE_DEVICE_DISCOVERY_GET_DEVICE_DETAIL: 'ble-device-discovery:get-device-detail',

    // 页面封装
    PAGE_PACKAGE_GET_APPS: 'page-package:get-apps',
    PAGE_PACKAGE_ADD_APP: 'page-package:add-app',
    PAGE_PACKAGE_UPDATE_APP: 'page-package:update-app',
    PAGE_PACKAGE_DELETE_APP: 'page-package:delete-app',
    PAGE_PACKAGE_SEARCH_APPS: 'page-package:search-apps',
    PAGE_PACKAGE_GET_PAGES: 'page-package:get-pages',
    PAGE_PACKAGE_ADD_PAGE: 'page-package:add-page',
    PAGE_PACKAGE_UPDATE_PAGE: 'page-package:update-page',
    PAGE_PACKAGE_DELETE_PAGE: 'page-package:delete-page',
    PAGE_PACKAGE_SEARCH_PAGES: 'page-package:search-pages',
    PAGE_PACKAGE_GET_ELEMENTS: 'page-package:get-elements',
    PAGE_PACKAGE_ADD_ELEMENT: 'page-package:add-element',
    PAGE_PACKAGE_UPDATE_ELEMENT: 'page-package:update-element',
    PAGE_PACKAGE_DELETE_ELEMENT: 'page-package:delete-element',
    PAGE_PACKAGE_SEARCH_ELEMENTS: 'page-package:search-elements',
    PAGE_PACKAGE_GET_APP_STATS: 'page-package:get-app-stats',
    PAGE_PACKAGE_GET_PAGE_STATS: 'page-package:get-page-stats',

    // 测试用例
    TEST_CASE_LIST: 'test-case:list',
    TEST_CASE_GET: 'test-case:get',
    TEST_CASE_SAVE: 'test-case:save',
    TEST_CASE_DELETE: 'test-case:delete',
    TEST_CASE_CHECK_JSON_EXISTS: 'test-case:check-json-exists',
    TEST_CASE_BATCH_CHECK_JSON_EXISTS: 'test-case:batch-check-json-exists',
    TEST_CASE_GENERATE_PYTHON: 'test-case:generate-python',
    TEST_CASE_SAVE_AND_GENERATE: 'test-case:save-and-generate'
};

module.exports = { IPC_CHANNELS };
