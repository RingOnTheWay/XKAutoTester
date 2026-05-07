# 02 - Test Case Management

> **Applicable Version**: v0.1.3+ | **Target Audience**: Experienced test engineers

---

## Overview

The **Test Case** tab provides a visual editor for Android test cases, supporting:

- Basic info entry (filename, name, description)
- Target app & platform selection
- Visual test step configuration (referencing element locators from page packages)
- Allure report tag configuration (Epic / Feature / Story / Markers)
- Automatic Python code generation (Jinja template engine)
- BLE Mock device configuration (serial port simulation)

---

## Workflow

```
Select test directory → Create/Select case → Fill form → Add test steps → Save & generate code
```

---

## Step 1: Select Test Directory

Click **Select Test Directory** on the left panel to choose the folder for storing test case JSON files. After selection:

- The file list shows all `.json` test files in that directory
- Click a filename to load the corresponding case editor on the right

---

## Step 2: Create a New Test Case

Click the **+** button in the center of the right panel to enter the editing form.

### 2.1 Basic Information

| Field | Description | Constraint |
|-------|-------------|------------|
| **File Name** | Generated JSON filename | Alphanumeric + underscore only (e.g. `login_test`) |
| **Case Name** | Friendly name, used as Allure report title | Free text |
| **Description** | Case description | Free text |

### 2.2 App & Platform

| Field | Description |
|-------|-------------|
| **Platform** | Fixed to `Android` |
| **App** | Select from apps registered in Page Package |

> Selecting an app unlocks the Test Steps section; it remains disabled until an app is chosen.

---

## Step 3: Configure Test Steps

Test steps are the core execution units. Each step consists of an **action** (how to interact) and **properties** (parameters for that action).

### 3.1 Add a Step

Click **Add Step** to insert a step card into the list.

### 3.2 Action Types

| Action | Description | Key Parameters |
|--------|-------------|----------------|
| **click** | Tap an element | Target page + element |
| **input_text** | Enter text | Target page + element + input value |
| **get_text** | Retrieve text | Target page + element + variable name |
| **wait_for_element** | Wait for element to appear | Target page + element + timeout (seconds) |
| **swipe** | Swipe gesture | Direction + offset + start coordinates |
| **back** | Back key | No extra parameters |
| **home** | Home key | No extra parameters |
| **install_app** | Install an app | APK path |
| **remove_app** | Uninstall an app | Package name |
| **start_app** | Start an app | Package name |
| **assert_text** | Assert text matches | Target page + element + expected value |
| **launch_app** | Launch an Activity | Activity name |
| **launch_app_with_wait** | Launch Activity and wait | Activity + wait page + wait element |
| **sleep** | Wait for a fixed duration | Seconds |
| **start_ble_mock** | Start BLE Mock | Device name |
| **stop_ble_mock** | Stop BLE Mock | Device name |
| **start_app_permission** | Grant app permission | App package name |

### 3.3 Step Properties

Each step displays different property fields based on its action type:

#### Common Properties

| Property | Description |
|----------|-------------|
| **Target Page** | Select from the current app's page package, auto-links element locators |
| **Target Element** | Select from the target page's element list, referencing its locator (ID/XPath etc.) |
| **Step Description** | Descriptive text for the step |

#### Action-specific Properties

| Action | Extra Properties |
|--------|-----------------|
| **input_text** | **Input Value** — text content / variable reference (e.g. `${phone_number}`) |
| **wait_for_element** | **Timeout (seconds)** — maximum wait duration |
| **get_text** | **Variable Name** — extracted text stored for later use via `${variableName}` |
| **swipe** | **Direction** — up/down/left/right; **Offset** — 0.0~1.0 screen ratio |
| **assert_text** | **Expected Value** — text to match |
| **sleep** | **Wait Seconds** |
| **start_ble_mock** | **BLE Device Name** — select from configured BLE devices |
| **start_app_permission** | **App Package Name** |

### 3.4 Step Operations

Each step card supports:
- **Drag to reorder** — grab the left handle to rearrange execution order
- **Duplicate** — copy the current step to the next position
- **Delete** — remove the current step

![Step Actions](../images/02-step-actions.png)

---

## Step 4: Configure Allure Tags (Optional)

Expand the **Allure Configuration** collapsible panel to set report tags:

| Tag | Description | Example |
|-----|-------------|---------|
| **Epic** | Target app/system | `Target App` |
| **Feature** | Target module | `Login Module` |
| **Story** | Target feature | `Password Login` |
| **Markers** | Pytest markers | `smoke`, `regression` |

> Marker options come from the markers list defined in `config/pytest.ini`.

---

## Step 5: Save & Generate Python Code

Click **Save** in the bottom-right corner:

1. Case JSON file written to the test directory
2. Python test script auto-generated to the corresponding directory (based on `templates/test_case_template.py`)

The generated Python code automatically integrates `TestInitializer`, which includes ADB connection, Appium startup, and BLE initialization (if configured).

---

## Managing Cases

### Edit an Existing Case

Click a filename in the left file list → modify the form → click **Save**.

### Delete a Case

Enter edit mode → click the red **Delete** button → confirm deletion of both the JSON file and corresponding Python code.

### Cancel Editing

Click **Cancel Edit** to exit the current editing state and return to the empty form.

---

## BLE Mock Device Configuration

When test steps include `start_ble_mock` / `stop_ble_mock` actions, BLE device configuration is required.

### How to Configure

1. In the test case form's device info, select "Add BLE Mock Port"
2. Enter the serial port number (e.g. `COM7`), matching a device configured in `config/ble_device.json`
3. Generated code will automatically include BLE device initialization logic

### BLE Device Management

Manage BLE device parameters (name, serial port, baud rate, etc.) via Android Connection → Device Management or through `config/ble_device.json`. See [05 - Device Connection & Mirroring](05-device-connection.md).

---

## Generated Code Structure

After saving, the generated Python test file structure:

```
test_cases/
├── login_test.json          # Case metadata
└── login_test.py            # Auto-generated test script
    ├── TestInitializer      # Unified initialization (ADB + Appium + BLE)
    ├── setup_method()       # Runs automatically before each test method
    ├── test_login_test()    # Generated test method
    └── Step-mapped code     # 1:1 mapping from JSON steps to Python
```

---

## Next Steps

- [03 - Page Element Packaging](03-page-package.md)
- [04 - Test Execution & Reports](04-test-execution.md)
