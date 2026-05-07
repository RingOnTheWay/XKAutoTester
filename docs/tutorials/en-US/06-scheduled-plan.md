# 06 - Scheduled Plans & Loop Execution

> **Applicable Version**: v0.1.3+ | **Target Audience**: Experienced test engineers

---

## Overview

The scheduled plan feature lets you set tests to execute automatically at a future time, requiring no manual supervision. The platform uses a min-heap priority queue scheduler + node-cron for precise timed triggers.

**Core capabilities:**

- Single scheduled execution: set a future time point
- Linked to test plans: automatically runs the specified test plans
- Loop execution: supports 1~999 cycles, configurable continue-on-failure
- Prevent system sleep: can block system sleep during execution

![Scheduled Plan Interface](../images/06-scheduled-plan-main.png)

---

## Scheduling Architecture

```
ScheduledPlanService (JSON persistence)
    ↓
SchedulerService (Min-heap priority queue + node-cron)
    ↓
On time → Auto-run the linked test plan(s)
    ↓
IPC notification to renderer (scheduled-test-start / scheduled-plan-expired)
```

---

## Workflow

```
Select test directory → Create test plan → Create scheduled plan → Wait for auto-execution → View report
```

> [!NOTE]
> Scheduled plans and test plans are independent entities. You must first create a test plan, then link it to a scheduled plan.

---

## Step 1: Prerequisites

Before creating a scheduled plan, ensure:

1. **Test directory selected** — in the Test Execution tab, choose a folder containing test scripts
2. **Test plan created** — at least one test plan with test files, types, and loop settings

See [04 - Test Execution & Reports](04-test-execution.md).

---

## Step 2: Create a Scheduled Plan

### 2.1 Open the Scheduled Plan Modal

In the Test Execution tab, left panel, **Scheduled Plan** area, click **New Scheduled Plan**.

![New Scheduled Plan](../images/06-new-scheduled-plan.png)

### 2.2 Configure Parameters

| Parameter | Description | Required |
|-----------|-------------|----------|
| **Plan Name** | Identifier for the scheduled plan | Yes |
| **Execution Time** | Target date and time | Yes |
| **Select Test Plans** | Check test plans to execute when due (multi-select supported) | At least one |

![Scheduled Plan Modal](../images/06-scheduled-plan-modal.png)

### 2.3 Time Picker

Click the execution time input to open the datetime picker:

- Select date (calendar view)
- Select time (hours:minutes)
- Confirmed time displays formatted in the input

![DateTime Picker](../images/06-datetime-picker.png)

### 2.4 Save the Scheduled Plan

Click **Save** to write the plan to `config/scheduled_plans.json`; the SchedulerService auto-enqueues it.

---

## Step 3: Managing Scheduled Plans

### View All Scheduled Plans

The **Scheduled Plans** list on the left shows all created plans and their execution times.

![Scheduled Plans List](../images/06-scheduled-plans-list.png)

### Edit a Scheduled Plan

Select a plan → click **Edit Scheduled Plan** → modify parameters → click **Update Plan**.

### Delete a Scheduled Plan

Select a plan → click **Delete Scheduled Plan** → confirm deletion.

> [!CAUTION]
> Deleting a scheduled plan does not delete the linked test plans or test cases.

---

## Step 4: Automatic Execution

When the system time reaches the scheduled plan's execution time:

1. SchedulerService triggers the plan
2. Auto-calls `PythonTestService.runTests()` to start testing
3. IPC event `scheduled-test-start` notifies the frontend to update UI state
4. Test logs stream in real-time to the right panel
5. Allure report generated after completion

![Auto Execution Notification](../images/06-auto-execution.png)

---

## Step 5: Loop Execution & Failure Handling

When creating a test plan, loop execution parameters can be configured:

| Parameter | Description | Default |
|-----------|-------------|---------|
| **Loop Count** | Number of execution cycles for the test plan | 1 (no loop) |
| **Continue on Failure** | Whether to continue subsequent cycles after a failure | Yes |

### Loop Execution Examples

```
Loop Count: 3, Continue on Failure: ✅
───────────────────────────────────
Round 1 → Execute → Pass ✓
Round 2 → Execute → Fail ✗ → Continue
Round 3 → Execute → Pass ✓
Result: 2/3 passed
```

```
Loop Count: 3, Continue on Failure: ❌
───────────────────────────────────
Round 1 → Execute → Pass ✓
Round 2 → Execute → Fail ✗ → Stop
Result: 1/2 passed (Round 3 not executed)
```

---

## Conflict Detection

When saving a scheduled plan, the system checks for time conflicts with existing plans:

- If overlapping scheduled plans exist, a warning is shown
- You can still save after confirmation (the platform supports parallel execution)

---

## Prevent System Sleep

During scheduled execution, if **Settings → Run → Prevent system sleep during execution** is enabled, the system will block Windows from entering sleep/hibernation.

See [07 - System Settings](07-settings.md).

---

## Scheduled Plan Data Structure

`config/scheduled_plans.json` example:

```json
{
  "plans": [
    {
      "id": "sched_001",
      "name": "Daily Smoke Test",
      "executeTime": "2026-05-08T08:00:00",
      "testPlanIds": ["plan_001"],
      "createdAt": "2026-05-07T16:00:00"
    }
  ]
}
```

---

## Limitations

- Scheduled plans support **single execution only**, not cron-based recurrence. For daily execution, create plans daily or start them manually
- Execution time is based on **local system time**
- The computer must remain powered on at the execution time

---

## Next Steps

- [04 - Test Execution & Reports](04-test-execution.md)
- [07 - System Settings](07-settings.md)
