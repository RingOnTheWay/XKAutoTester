# 04 - Test Execution & Reports

> **Applicable Version**: v0.1.3+ | **Target Audience**: Experienced test engineers

---

## Overview

The **Test Execution** tab is the central scheduling interface, responsible for:

- Test directory selection & file management
- Test plan creation, editing, and deletion
- Test type filtering (based on Pytest markers)
- Test execution (real-time log output + progress tracking)
- Allure report viewing with run history
- Test server management

![Test Execution Main Interface](../images/04-test-execution-main.png)

---

## Interface Layout

| Area | Position | Content |
|------|----------|---------|
| **Left Panel** | Top | Test directory + file list |
| | Middle | Test plan management (unlocks after directory selected) |
| | Bottom | Test type filter + scheduled plan management |
| **Right Panel** | Top | Real-time test output log |
| | Bottom | Progress bar + control buttons (Run/Stop/View Report/Stop Server) |

---

## Workflow

```
Select test directory → Create test plan → Select test types → Run tests → View report
```

---

## Step 1: Select Test Directory

Click **Select Test Directory** and choose the folder containing Python test scripts.

After directory selection:
- The **Test File List** shows all `.py` test files in the directory (with checkboxes)
- **Test Plan** card unlocks
- **Test Type** card loads Pytest markers
- **Scheduled Plan** card unlocks

![Select Test Directory](../images/04-select-directory.png)

---

## Step 2: Create a Test Plan

### 2.1 Open the New Plan Modal

Click **New Plan** (unlocked after directory selection) to open the plan editor modal.

### 2.2 Configure Plan Parameters

| Parameter | Description | Required |
|-----------|-------------|----------|
| **Plan Name** | Identifier for the plan | Yes |
| **Plan Description** | Description text | No |
| **Test Files** | Check `.py` test files to execute (loaded from directory) | At least one |
| **Test Types** | Check Pytest markers to execute (e.g. smoke, regression) | Optional (all if none checked) |
| **Loop Count** | Number of execution cycles (default 1, range 1~999) | Yes |
| **Continue on Failure** | If checked, continue subsequent cycles after a failure | No |

> If no test type is selected, the system executes all tests in the directory without marker filtering.

### 2.3 Save the Plan

Click **Save** to write the plan to `config/test_plans.json`; the plan list refreshes.

---

## Step 3: Select Test Types

In the **Test Type** card, check the markers to execute:

- All available markers come from `config/pytest.ini`
- Check states pass as Pytest parameters (`-m "marker1 or marker2"`)

---

## Step 4: Run Tests

### 4.1 Start Tests

Click **Run Tests**; the system will:

1. Spawn a Python subprocess executing `python -m main`
2. Stream stdout/stderr in real-time to the right-side log panel
3. Update the progress bar dynamically (based on test file count)

### 4.2 During Execution

| Action | Button | Effect |
|--------|--------|--------|
| Stop tests | **Stop Tests** | Terminate the subprocess, halt current execution |
| View logs | Scroll right panel | Real-time pytest output and assertion results |

![Test Running](../images/04-test-running.png)

### 4.3 Test Completion

After execution finishes (normal completion or termination):

- Progress bar resets
- **View Report** button unlocks
- **Stop Server** button unlocks

---

## Step 5: View Reports

### 5.1 Open the Report Selector

Click **View Report** to open the report selection modal.

The modal lists **all historical run records** for the currently selected test plan.

### 5.2 Select a Run Record

- Each record shows the execution timestamp
- Selecting a record unlocks the **Open Report** button
- Click **Open Report** to launch the Allure report in your default browser

The Allure report includes:
- Test overview (passed/failed/skipped counts)
- Categorized by Suite/Epic/Feature/Story
- Detailed steps and screenshots per test case
- Error stack traces for failed cases

### 5.3 Stop the Allure Server

After viewing reports, click **Stop Server** to shut down the Allure local service and free the port.

---

## Managing Test Plans

### Edit a Plan

Select a plan → click **Edit Plan** → modify in the modal → click **Update Plan**.

### Delete a Plan

Select a plan → click **Delete Plan** → confirm deletion.

> [!CAUTION]
> Deleting a plan does **not** delete the corresponding test case files or scripts — only plan metadata is removed.

---

## Log Output Panel

### Quick Actions

| Action | How |
|--------|-----|
| **Clear logs** | Click the 🗑 button in the top-right of the log panel |
| **Copy logs** | Select and copy text directly from the panel |

### Log Content

Logs contain the full output of Python test execution:

```
========================== test session starts ==========================
platform win32 -- Python 3.12.4, pytest-8.4.2, pluggy-1.5.0
rootdir: D:\test_cases
configfile: pytest.ini
...
collected 5 items / 3 deselected / 2 selected
test_login.py::TestLogin::test_password_login PASSED  [ 50%]
test_login.py::TestLogin::test_sms_login PASSED          [100%]
========================== 2 passed in 45.23s ===========================
```

---

## Test Types & Pytest Integration

Custom markers defined in `config/pytest.ini`:

```ini
[pytest]
markers =
    smoke: Smoke tests
    regression: Regression tests
    login: Login-related tests
    payment: Payment-related tests
```

Types checked on the platform map to `pytest -m "smoke or regression"` arguments.

---

## Next Steps

- [06 - Scheduled Plans & Loop Execution](06-scheduled-plan.md)
- [07 - System Settings](07-settings.md)
