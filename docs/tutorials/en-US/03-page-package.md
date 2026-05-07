# 03 - Page Element Packaging

> **Applicable Version**: v0.1.3+ | **Target Audience**: Experienced test engineers

---

## Overview

The **Page Package** module implements **App → Page → Element** three-level management for maintaining UI element locators of the app under test. Test cases reference these locators for UI interaction, avoiding hard-coded locator values in every test case.

```
App
  └── Page
       └── Element
            ├── Locator Type: id / xpath / accessibility_id / css / class_name
            └── Locator Value: actual locator expression
```

![Page Package Main Interface](../images/03-page-package-main.png)

---

## Workflow

```
Add app (APK auto-parse) → Add pages → Add element locators → Reference in test cases
```

---

## Step 1: Add an App

### 1.1 Open the App Modal

Click the **+** button in the app selector dropdown to open the **New App** modal.

![Add App](../images/03-add-app.png)

### 1.2 App Information

| Field | Description | Required |
|-------|-------------|----------|
| **App Name** | Friendly name for the app (e.g. "WeChat") | Yes |
| **APK Drop Zone** | Drag & drop an APK file for auto-parsing | No |
| **Platform** | Fixed to Android | Yes |
| **Package Name** | Android package name (e.g. `com.tencent.mm`) | Yes |
| **Activity Name** | Launch Activity (e.g. `.ui.LauncherUI`) | No |

![App Modal](../images/03-app-modal.png)

### 1.3 APK Auto-Parsing (Recommended)

Drag an APK file into the **APK Drop Zone**; the system uses aapt2 to automatically extract:

- **Package Name** (`package`)
- **Launch Activity** (`launchable-activity`)

On success, the panel turns green ("Parse Success") and form fields auto-fill.

![APK Parsing](../images/03-apk-parse.png)

> [!TIP]
> APK parsing avoids manual lookup of package names and Activities, reducing human error.

### 1.4 Save the App

Click **Save** to write app information to `config/page_package.json`.

---

## Step 2: Add a Page

### 2.1 Select an App

Select the newly created app in the app dropdown — the page selector unlocks.

![Select App](../images/03-select-app.png)

### 2.2 Open the Page Modal

Click the **+** button in the page selector dropdown to open the **New Page** modal.

### 2.3 Page Information

| Field | Description | Example |
|-------|-------------|---------|
| **Page Name** | Screen name | `Login Page`, `Home Page`, `Settings Page` |

![Add Page](../images/03-add-page.png)

### 2.4 Save the Page

Click **Save** to attach the page under the current app.

---

## Step 3: Add Element Locators

### 3.1 Select a Page

Select the created page in the page dropdown — the element selector unlocks.

### 3.2 Open the Element Modal

Click the **+** button in the element selector dropdown to open the **New Element** modal.

### 3.3 Configure the Locator

| Field | Description | Example |
|-------|-------------|---------|
| **Element Name** | Friendly name for the element | `Username Field`, `Login Button`, `Password Field` |
| **Locator** | Element location strategy | Dropdown selection, 5 types supported |
| **Locator Value** | Actual locator expression | Depends on locator type |

### Locator Type Reference

| Locator | Use Case | Example Value |
|---------|----------|---------------|
| **id** | Element has `resource-id` | `com.example:id/btn_login` |
| **xpath** | Complex hierarchy location | `//android.widget.Button[@text='Login']` |
| **accessibility_id** | Element has `content-desc` | `login_button` |
| **css** | Embedded WebView pages | `.login-form .submit-btn` |
| **class_name** | Locate by class name | `android.widget.EditText` |

> Recommended priority: `id` > `accessibility_id` > `xpath` > `class_name` > `css`

![Add Element](../images/03-add-element.png)

### 3.4 Save the Element

Click **Save** to attach the element under the current page.

---

## Step 4: Managing Package Data

### Cascade Selector Operations

Each dropdown provides unified operation buttons:

| Button | Function |
|--------|----------|
| **+** | Add (app/page/element) |
| **✎ (Edit)** | Edit the currently selected item |
| **🗑 (Delete)** | Delete the currently selected item |

After selecting an item, the edit/delete buttons unlock.

### Search / Filter

Each dropdown has a search input at the top; enter keywords to filter the list in real-time.

![Search Filter](../images/03-search.png)

### Count Badges

Each dropdown header displays the count of items under the current selection level:

- App count → shown in the app selector area
- Page count → shown in the page selector area
- Element count → shown in the element selector area

---

## Integration with Test Cases

When creating test cases in the Test Case tab:

1. **Select App** — choose from the page package app list
2. **Configure Steps** — each step's **Target Page** is chosen from the current app's page list
3. **Select Elements** — **Target Element** is chosen from the target page's element list

Generated Python code automatically references these locators — no hard-coding needed.

---

## Data Structure Example

```json
{
  "apps": [
    {
      "id": "app_001",
      "name": "Example App",
      "platform": "android",
      "packageName": "com.example.app",
      "activityName": "com.example.app.MainActivity",
      "pages": [
        {
          "id": "page_001",
          "name": "Login Page",
          "elements": [
            {
              "id": "elem_001",
              "name": "Username Field",
              "locator": "id",
              "value": "com.example:id/et_username"
            },
            {
              "id": "elem_002",
              "name": "Password Field",
              "locator": "id",
              "value": "com.example:id/et_password"
            },
            {
              "id": "elem_003",
              "name": "Login Button",
              "locator": "xpath",
              "value": "//android.widget.Button[@text='Login']"
            }
          ]
        }
      ]
    }
  ]
}
```

---

## Next Steps

- [02 - Test Case Management](02-test-case.md)
- [04 - Test Execution & Reports](04-test-execution.md)
