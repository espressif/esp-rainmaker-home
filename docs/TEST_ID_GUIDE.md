# Test ID Assignment Guide
## Quick Reference for React Native QA Automation

> **TL;DR**: Use `{...testProps("id")}` on **interactive elements** or `qaId` on **custom components**. Follow unified pattern: `{type}_{name}_{context}[_{qualifier}]`. **Always use snake_case format manually.**

---

## Why This Matters

### Without Test IDs:
```tsx
// Hard to test
<TouchableOpacity onPress={handleLogin}>
  <Text>Login</Text>
</TouchableOpacity>
```

### With Test IDs:
```tsx
// Easy to test
<TouchableOpacity {...testProps("button_login")} onPress={handleLogin}>
  <Text>Login</Text>
</TouchableOpacity>
```

**Result**: Stable, maintainable automated tests that survive UI refactoring.

---

## Our Standard: The testProps Pattern

### What is testProps?

A utility function that handles cross-platform test ID generation:

```typescript
// utils/testProps.ts
export const testProps = (id: string) => {
  return {
    testID: id,      // For React Native & test automation
    nativeID: id     // For iOS accessibility tree
  };
};
```

**IMPORTANT**: IDs must be in **snake_case** format (e.g., `button_login`, `input_email`).
This function does NOT perform automatic conversion - use snake_case manually.

**Benefits**:
- Cross-platform consistency (iOS + Android)
- iOS accessibility tree preserved
- Centralized changes

---

## How to Use

### Step 1: Import testProps
```tsx
import { testProps } from '@/utils/testProps';
```

### Step 2: Add to Interactive Elements
```tsx
// CORRECT - On clickable element
<TouchableOpacity {...testProps("button_login")} onPress={handleLogin}>
  <Text>Login</Text>
</TouchableOpacity>

// CORRECT - On input field
<TextInput {...testProps("input_email")} value={email} />

// CORRECT - On switch
<Switch {...testProps("toggle_notifications")} value={enabled} />
```

### Step 3: Use Descriptive Names in snake_case
```tsx
// BAD - Generic or wrong format
{...testProps("button")}
{...testProps("buttonLogin")}  // Wrong: camelCase
{...testProps("button-login")}  // Wrong: kebab-case

// GOOD - Descriptive and snake_case
{...testProps("button_login")}
{...testProps("button_forgot_password")}
```

---

## Critical Rules



### Rule 1: Use Semantic Naming Convention

We use two approaches for assigning IDs:

1. **Direct `testProps` usage** - For native React Native components
2. **`qaId` prop usage** - For custom components that accept a `qaId` prop

---

#### Pattern 1: Direct `testProps` Usage

**Pattern**: `{type}_{name}_{context}[_{qualifier}]`

| Placeholder | Meaning | Examples | When Required |
|------------|---------|----------|---------------|
| `type` | Component type | `button`, `input`, `text`, `view`, `scroll`, `image`, `icon`, `toggle`, `switch` | **Always required** |
| `name` | Specific identifier/action | `login`, `signup`, `save`, `delete`, `verify`, `email`, `password`, `title`, `subtitle` | **Required for interactive elements**, for non-interactive elements use same as context (can be omitted) |
| `context` | Screen/feature context | `login`, `signup`, `forgot_password`, `confirmation_code`, `pop`, `scan_qr`, `settings`, `home` | **Always required** (use screen/feature name where element is used) |
| `qualifier` | Optional modifier | `verify`, `confirm`, `cancel`, `resend` | Only when multiple similar actions exist |

**IMPORTANT**: All IDs must be in **snake_case** format. Use underscores to separate words.

**Pattern Application:**

```tsx
// Interactive Elements: {type}_{name}_{context}
// Simple case: name = context (omitted)
{...testProps("button_login")}                    // type: button, name: login, context: login (omitted)

// With name: {type}_{name}_{context}
{...testProps("button_reset_forgot_password")}    // type: button, name: reset, context: forgot_password
{...testProps("toggle_notifications")}            // type: toggle, name: notifications, context: notifications (omitted)

// Non-Interactive Elements: {type}_{name}_{context} (name = context, omitted)
{...testProps("text_app_version_settings")}       // type: text, name: app_version, context: settings
{...testProps("view_account_security")}           // type: view, name: account_security, context: account_security (omitted)
{...testProps("scroll_confirmation_code")}        // type: scroll, name: confirmation_code, context: confirmation_code (omitted)
{...testProps("image_pop")}                       // type: image, name: pop, context: pop (omitted)
{...testProps("text_title_pop")}                  // type: text, name: title, context: pop
{...testProps("text_subtitle_pop")}              // type: text, name: subtitle, context: pop
```

---

#### Pattern 2: `qaId` Prop Usage (Custom Components)

**Pattern**: `{type}_{name}_{context}[_{qualifier}]`

| Placeholder | Meaning | Examples | When Required |
|------------|---------|----------|---------------|
| `type` | Component type | `header`, `screen_wrapper`, `content_wrapper`, `button`, `dialog`, `input`, `logo`, `typo`, `item`, `card`, `modal`, `empty_state`, `footer_tabs` | **Always required** |
| `name` | Specific identifier/action | `login`, `signup`, `save`, `delete`, `verify`, `add`, `remove`, `email`, `password`, `connect`, `name` | **Required for interactive components**, for layout components use same as context (can be omitted) |
| `context` | Screen/feature context | `scan_qr`, `scan_ble`, `login`, `signup`, `settings`, `home`, `pop`, `confirmation_code`, `personal_info`, `notification_center`, `wifi`, `forgot_password` | **Always required** (use screen/feature name where component is used) |
| `qualifier` | Optional modifier | `verify`, `confirm`, `cancel`, `resend` | Only when multiple similar actions exist |

**Pattern Application:**

```tsx
// Layout Components: {type}_{name}_{context} (name = context, so omitted)
<Header qaId="header_scan_qr" />                    // type: header, name: scan_qr, context: scan_qr (omitted)
<ScreenWrapper qaId="screen_wrapper_pop" />         // type: screen_wrapper, name: pop, context: pop (omitted)

// Interactive Components: {type}_{name}_{context}
// Simple case: name = context (omitted)
<Button qaId="button_login" />               // type: button, name: login, context: login (omitted)
// With name: {type}_{name}_{context}
<Button qaId="button_reset_forgot_password" />     // type: button, name: reset, context: forgot_password
<Button qaId="button_connect_wifi" />              // type: button, name: connect, context: wifi
// With qualifier:
<Button qaId="button_verify_delete_account" />     // type: button, name: verify, context: delete_account

// Input Component: {field_name} (NO prefix! Special case)
<Input qaId="email" />                              // No prefix! Component adds it:
                                                    //   - Wrapper: testProps("email")
                                                    //   - TextInput: testProps("input_email")
```

**Rules**:
1. **Always include `type`** - Component type (button, dialog, header, etc.)
2. **Always include `name`** for interactive components - Action/identifier
3. **Always include `context`** - Screen/feature where component is used
4. **For layout components** - `name` = `context` (can be omitted, pattern becomes `{type}_{context}`)
5. **Use `qualifier`** only when multiple similar actions exist on same screen

**Special Case: Custom Components**

Custom components like `Input`, `ConfirmationDialog`  components automatically prefixes/suffixes the `qaId`:
- **Wrapper View**: Uses `qaId` as-is → `testProps("email")`
- **TextInput**: Adds `input_` prefix → `testProps("input_email")`

```tsx
// CORRECT - Pass field name only (no prefix)
<Input qaId="email" placeholder="Email" />
// Generated IDs:
//   - View wrapper: testProps("email")
//   - TextInput: testProps("input_email")

// WRONG - Don't add prefix yourself
<Input qaId="input_email" />  // Would create: input_input_email
```

### Rule 2: Conditional Spreading (For Custom Components)

```tsx
// Component with optional qaId prop
interface ButtonProps {
  label: string;
  onPress: () => void;
  qaId?: string;  // Optional
}

const Button: React.FC<ButtonProps> = ({ label, onPress, qaId }) => (
  <TouchableOpacity 
    {...(qaId ? testProps(qaId) : {})}  // Only spread if provided
    onPress={onPress}
  >
    <Text>{label}</Text>
  </TouchableOpacity>
);

// Usage
<Button label="Login" onPress={handleLogin} qaId="button_login" />
```

---

## Real-World Examples

Examples are categorized by usage pattern for better understanding.

---

### Category 1: Direct `testProps` Usage

#### Example 1: Native Button with testProps

```tsx
// Direct usage on TouchableOpacity
<TouchableOpacity {...testProps("button_login")} onPress={handleLogin}>
  <Text>Login</Text>
</TouchableOpacity>

// Pattern breakdown:
//   type: "button"
//   name: "login"
//   context: "login" (omitted, same as name)
//   Result: "button_login"

// With name when different from context
<TouchableOpacity {...testProps("button_reset_forgot_password")} onPress={handleReset}>
  <Text>Reset Password</Text>
</TouchableOpacity>

// Pattern breakdown:
//   type: "button"
//   name: "reset"
//   context: "forgot_password"
//   Result: "button_reset_forgot_password"
```

#### Example 2: Native TextInput with testProps

```tsx
// Direct usage on TextInput
<TextInput 
  {...testProps("input_email")} 
  value={email}
  placeholder="Enter email"
/>

// Pattern breakdown:
//   type: "input"
//   name: "email"
//   context: "email" (omitted, same as name)
//   Result: "input_email"
```

#### Example 3: ScrollView with testProps

```tsx
// Direct usage on ScrollView
<ScrollView {...testProps("scroll_confirmation_code")}>
  {/* Content */}
</ScrollView>

// Pattern breakdown:
//   type: "scroll"
//   name: "confirmation_code"
//   context: "confirmation_code" (omitted, same as name)
//   Result: "scroll_confirmation_code"
```


### Category 2: Custom Components with `qaId` Prop

#### Example 1: Button Component with qaId

```tsx
// Usage
<Button label="Login" onPress={handleLogin} qaId="button_login" />

// Pattern breakdown:
//   type: "button"
//   name: "login"
//   Result: "button_login"
```

#### Example 2: Input Component (Custom components - Special Case)

```tsx
// Input component - pass qaId WITHOUT prefix
<Input
  qaId="email"  // No "input_" prefix!
  placeholder="Enter email"
  onFieldChange={handleEmailChange}
/>

// Pattern breakdown:
//   qaId: "email" (no prefix)
//   Component internally generates:
//     - Wrapper View: testProps("email")
//     - TextInput: testProps("input_email")
```

#### Example 3: Screen Wrapper with qaId

```tsx
// Screen wrapper with context
<ScreenWrapper 
  qaId="screen_wrapper_pop"
  style={globalStyles.container}
>
  {/* Content */}
</ScreenWrapper>

// Pattern breakdown:
//   type: "screen_wrapper"
//   context: "pop"
//   Result: "screen_wrapper_pop"
```

#### Example 4: Header with qaId

```tsx
// Header with context
<Header 
  showBack 
  label="Scan QR Code" 
  qaId="header_scan_qr" 
/>

// Pattern breakdown:
//   type: "header"
//   name: "scan_qr"
//   context: "scan_qr" (omitted, same as name)
//   Result: "header_scan_qr"
```


**Document Version**: 2.0  
**Last Updated**: November 5, 2025  
**Maintained By**: QA Team
