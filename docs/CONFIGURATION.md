# Configuration & Customization

This document provides detailed information on how to configure and customize the ESP RainMaker Home App to suit your specific needs.

> **Everything you need to customise for a white-label or custom-backend build can be set in the `.env` file.** No source files need to be edited for the configurations listed in the [Environment Variables](#environment-variables-env) section.

## Table of Contents

- [Environment Variables (.env)](#environment-variables-env)
  - [App Identity & Branding](#app-identity--branding)
  - [Version Information](#version-information)
  - [SDK Configuration](#sdk-configuration)
  - [Feature Flags](#feature-flags)
  - [Third-Party Auth (OAuth)](#third-party-auth-oauth)
  - [Deep Links](#deep-links)
  - [Matter Configuration](#matter-configuration)
  - [Legal & Website Links](#legal--website-links)
  - [Scan Configuration](#scan-configuration)
- [Device & Parameter Configuration](#device--parameter-configuration)
- [Theme Customization](#theme-customization)
- [Localization](#localization)
- [Advanced Customization](#advanced-customization)
- [Source-Level Configuration](#source-level-configuration)
  - [config/sdk.config.ts](#configsdkconfigts)
  - [config/features.config.ts](#configfeaturesconfigts)
  - [config/runtime.config.ts](#configruntimeconfigts)
  - [config/agent.config.ts](#configagentconfigts)
  - [src/integrations/index.ts — CDF Bootstrap](#srcintegrationsindexts--cdf-bootstrap)

## Environment Variables (.env)

The `.env` file is the **single place** to configure the app for a different backend, brand, or feature set. All values are injected into the Expo build via `app.config.ts` and synced to native Android / iOS build configs by the prebuild scripts.

### Setup

```bash
cp .env.example .env
# Edit .env with your values
npm run prebuild   # syncs values to android/ and ios/ native configs
```

Re-run `npm run prebuild` (or just `npm run android` / `npm run ios`) any time you change `.env`.

---

### App Identity & Branding

| Variable                     | Description                                         | Default                        |
| ---------------------------- | --------------------------------------------------- | ------------------------------ |
| `APP_NAME`                   | Display name shown on the device home screen        | `ESP RainMaker Home`           |
| `APP_SLUG`                   | Expo slug (used for OTA and deep links)             | `esp-rainmaker-home`           |
| `APP_SCHEMA`                 | URL scheme for deep links (`<schema>://`)           | `rainmaker`                    |
| `IOS_APP_APPLICATION_ID`     | iOS bundle identifier                               | `com.espressif.nova`           |
| `ANDROID_APP_APPLICATION_ID` | Android application ID                              | `com.espressif.novahome`       |
| `IOS_APP_GROUP_ID`           | iOS App Group ID (used for notification extensions) | `group.com.espressif.novahome` |

---

### Version Information

| Variable               | Description                       |
| ---------------------- | --------------------------------- |
| `APP_VERSION`          | Semantic version shown in the app |
| `ANDROID_VERSION_CODE` | Android integer version code      |

---

### SDK Configuration

The active SDK and its API endpoints are fully controlled from `.env`.

| Variable      | Description                                         | Default                               |
| ------------- | --------------------------------------------------- | ------------------------------------- |
| `ACTIVE_SDK`  | SDK to use: `rainmaker-base-sdk` or `rmng-base-sdk` | `rainmaker-base-sdk`                  |
| `BASE_URL`    | ESP RainMaker API base URL                          | `https://api.rainmaker.espressif.com` |
| `API_VERSION` | API version path segment                            | `v1`                                  |

These values are read by `app.config.ts` and passed to the SDK adaptor via `config/sdk.config.ts` at startup — no source file edits required.

---

### Feature Flags

Feature flags use a **two-level gating** system:

- **Level 2 — SDK capability** (hard gate): if the active SDK does not support a feature, it is disabled regardless of `.env`.
- **Level 1 — `.env` switch** (soft gate): can only _disable_ a feature that the SDK supports. Set the variable to `false` to turn it off.

| Variable                  | Feature                            | Default |
| ------------------------- | ---------------------------------- | ------- |
| `ENABLE_SCENES`           | Scenes management                  | `true`  |
| `ENABLE_SCHEDULES`        | Schedules management               | `true`  |
| `ENABLE_AUTOMATIONS`      | Automations                        | `true`  |
| `ENABLE_LOCAL_CONTROL`    | Local device control               | `true`  |
| `ENABLE_NOTIFICATIONS`    | Push notifications                 | `true`  |
| `ENABLE_GROUP_SHARING`    | Home / group sharing               | `true`  |
| `ENABLE_OTA`              | Over-the-air firmware updates      | `true`  |
| `ENABLE_AI_AGENT`         | AI Agent chat feature              | `true`  |
| `ENABLE_THIRD_PARTY_AUTH` | OAuth (Google / Apple sign-in)     | `true`  |
| `ENABLE_VOICE_ASSISTANTS` | Voice assistant integrations       | `true`  |
| `ENABLE_CDF_AUTOSYNC`     | Automatic CDF data synchronization | `true`  |

> **Note:** `ENABLE_NOTIFICATIONS` only controls whether the notification feature is active in the app. For Android push notifications to be delivered, you must also provide a valid [`android/app/google-services.json`](#android-push-notifications-google-servicesjson).

---

### Third-Party Auth (OAuth)

| Variable                             | Description                               | Default                                      |
| ------------------------------------ | ----------------------------------------- | -------------------------------------------- |
| `THIRD_PARTY_AUTH_CLIENT_ID`         | Cognito / OAuth client ID                 | `1h7ujqjs8140n17v0ahb4n51m2`                 |
| `THIRD_PARTY_AUTH_AUTH_URL`          | OAuth authorization endpoint              | `https://3pauth.rainmaker.espressif.com`     |
| `THIRD_PARTY_AUTH_REDIRECT_SCHEME`   | URL scheme for OAuth redirect             | `rainmaker`                                  |
| `THIRD_PARTY_AUTH_REDIRECT_HOST`     | Host component of OAuth redirect URL      | `com.espressif.novahome`                     |
| `THIRD_PARTY_AUTH_REDIRECT_URL`      | Full OAuth redirect URL                   | `rainmaker://com.espressif.novahome/success` |
| `THIRD_PARTY_AUTH_ENABLED_PROVIDERS` | Comma-separated list of enabled providers | `Google,SignInWithApple`                     |

---

### Deep Links

| Variable                       | Description                         | Default                |
| ------------------------------ | ----------------------------------- | ---------------------- |
| `AGENTS_DEEP_LINK_SCHEME`      | URL scheme for AI Agent deep links  | `rainmaker`            |
| `AGENTS_DEEP_LINK_HOST`        | Host for AI Agent deep links        | `agents.espressif.com` |
| `AGENTS_DEEP_LINK_PATH_PREFIX` | Path prefix for AI Agent deep links | `/try/agents`          |

---

### Matter Configuration

| Variable                | Description                                          | Default          |
| ----------------------- | ---------------------------------------------------- | ---------------- |
| `MATTER_VENDOR_ID`      | Vendor ID used by the Matter SDK                     | `0x131B`         |
| `MATTER_ECOSYSTEM_NAME` | Ecosystem name displayed during Matter commissioning | `Rainmaker Home` |

---

### Scope

**Commissioning only**

## This application integrates Matter exclusively for **device commissioning (onboarding)**.

### Notes

- Matter support is limited to **commissioning**.
  It does **not** include a full Matter controller implementation for device control.

- References to local discovery and control in `getRMSDKConfig()` correspond to
  **ESP RainMaker transports**, not a Matter control plane.

- The `SDK_FEATURE_MAP` in `config/sdk.config.ts` enables Matter commissioning via:

  ```ts
  matterCommissioning: true;
  ```

  for the `rainmaker-matter-sdk` variant.

- The commissioning UI is driven by:
  - QR code scanning
  - Native platform modules

---

### Legal & Website Links

These URLs appear in the app's settings / about screen and the signup / agent consent sheets.

| Variable              | Description                 | Default                                                                |
| --------------------- | --------------------------- | ---------------------------------------------------------------------- |
| `WEBSITE_LINK`        | Product website URL         | `https://rainmaker.espressif.com`                                       |
| `TERMS_OF_USE_LINK`   | Terms of use URL template   | `https://rainmaker.espressif.com/{lang}/terms-of-use?region=global`     |
| `PRIVACY_POLICY_LINK` | Privacy policy URL template | `https://rainmaker.espressif.com/{lang}/privacy-policy?region=global`   |

The legal links support a `{lang}` placeholder, replaced at runtime with the active UI language (`en` / `zh`), so both language versions of a page are served from one configured URL — e.g. with `TERMS_OF_USE_LINK=https://rainmaker.espressif.com/{lang}/terms-of-use?region=china` in `.env`, an English UI resolves to `https://rainmaker.espressif.com/en/terms-of-use?region=china`. A plain URL without the placeholder applies to all languages.

---

### Scan Configuration

| Variable                    | Description                                  | Default |
| --------------------------- | -------------------------------------------- | ------- |
| `ENABLE_SCAN_CONFIGURATION` | Enable QR-code-based runtime config override | `true`  |

When enabled, tapping the app logo 5 times on the login screen opens a QR scanner that can override `BASE_URL`, `API_VERSION`, and OAuth settings at runtime without a new build.

---

### Android Push Notifications (`google-services.json`)

Android push notifications require a valid **Firebase** configuration file in addition to `ENABLE_NOTIFICATIONS=true`.

The repository ships a placeholder at `android/app/google-services.json.template`. You must replace `android/app/google-services.json` with your own project's file:

1. Go to the [Firebase Console](https://console.firebase.google.com/) and open (or create) your project.
2. Navigate to **Project Settings → Your apps → Android app**.
3. Download `google-services.json`.
4. Copy it to `android/app/google-services.json`, replacing the placeholder.

> ⚠️ **Without a valid `google-services.json`, Android push notifications will not work.** The app will build and run, but no notifications will be delivered.

## Device & Parameter Configuration

### Device Configuration

**[`config/devices.config.ts`](../config/devices.config.ts)** - Configure device types and their control panels

```typescript
// Actual device configuration structure
export const DEVICE_TYPE_LIST = [
  {
    label: "Lighting",
    groupLabel: "Lights",
    type: [
      "lightbulb",
      "lightbulb3",
      "lightbulb4",
      "lightbulb5",
      "lightstrip",
      "lightstrip1",
      "light",
    ],
    name: "Light",
    param: "Light",
    deviceType: ["1", "2"],
    icon: {
      lightbulb: { icon: "light-3" },
      lightbulb3: { icon: "light-1" },
      lightbulb4: { icon: "light-1" },
      lightbulb5: { icon: "light-1" },
      lightstrip: { icon: "light-5" },
      lightstrip1: { icon: "light-5" },
    },
    defaultIcon: "light-1",
    disabled: false,
    controlPanel: "light",
  },
  {
    label: "Switch",
    groupLabel: "Switch",
    type: ["switch1", "switch2", "switch3", "dimmerswitch", "switch"],
    name: "Switch",
    param: "Switch",
    deviceType: ["80", "81", "82", "83"],
    icon: {
      switch1: { icon: "switch" },
      switch2: { icon: "switch-2" },
      switch3: { icon: "switch-3" },
      dimmerswitch: { icon: "switch-4" },
      switch: { icon: "switch" },
    },
    defaultIcon: "switch",
    disabled: false,
    controlPanel: "switch",
  },
  // ... more device types including Socket, Fan, Temperature, Sensor, Router, etc.
];
```

### Parameter Configuration

**[`config/params.config.ts`](../config/params.config.ts)** - Configure parameter controls and their behavior

```typescript
// Actual parameter configuration structure
export const PARAM_CONTROLS = [
  {
    name: "Text",
    types: [ESPRM_UI_TEXT_PARAM_TYPE],
    control: TextInput,
    dataTypes: DATA_TYPE_ALL,
  },
  {
    name: "Toggle",
    types: [ESPRM_UI_TOGGLE_PARAM_TYPE, ESPRM_POWER_PARAM_TYPE],
    control: ToggleSwitch,
    dataTypes: DATA_TYPE_BOOL,
    hide: true,
  },
  {
    name: "Brightness",
    types: [ESPRM_BRIGHTNESS_PARAM_TYPE],
    control: BrightnessSlider,
    dataTypes: DATA_TYPE_INT,
    paramType: ESPRM_BRIGHTNESS_PARAM_TYPE,
  },
  {
    name: "CCT",
    types: [ESPRM_CCT_PARAM_TYPE],
    control: ColorTemperatureSlider,
    dataTypes: DATA_TYPE_INT,
    paramType: ESPRM_CCT_PARAM_TYPE,
  },
  {
    name: "Saturation",
    types: [ESPRM_SATURATION_PARAM_TYPE],
    control: SaturationSlider,
    dataTypes: DATA_TYPE_INT,
    paramType: ESPRM_SATURATION_PARAM_TYPE,
    derivedMeta: [
      {
        hue: ESPRM_HUE_PARAM_TYPE,
      },
    ],
  },
  {
    name: "Hue Slider",
    types: [ESPRM_UI_HUE_SLIDER_PARAM_TYPE, ESPRM_HUE_PARAM_TYPE],
    control: HueSlider,
    dataTypes: DATA_TYPE_INT,
    paramType: ESPRM_HUE_PARAM_TYPE,
  },
  // ... more parameter controls
];
```

## Theme Customization

### Design Tokens

**[`theme/tokens.ts`](../theme/tokens.ts)** - Customize colors, typography, spacing, and animations

#### Colors

```typescript
// Actual theme structure from theme/tokens.ts
const themes = {
  light: {
    colors: {
      white: "#ffffff",
      black: "#2c3e50",
      bluetooth: "#2c5aa0",
      gray: "#7f8c8d",
      lightGray: "#bdc3c7",
      red: "#e74c3c",
      orange: "#f39c12",
      blue: "#2c5aa0",
      green: "#27ae60",
      yellow: "#f1c40f",
      lightBlue: "rgba(44, 90, 160, .3)",
      bg: "#f5f6f7",
      bg1: "#e8eef7",
      bg2: "#d4e0f0",
      bg3: "#b0c7e3",
      bg4: "rgba(44, 90, 160, 0.15)",
      bg5: "#f8f9fa",
      borderColor: "rgba(218, 218, 218, 0.62)",
      darkBorderColor: "#cbd5e1",
      primary: "#2c5aa0",
      text_primary: "#1e293b",
      text_primary_light: "#334155",
      text_primary_dark: "#0f172a",
      text_secondary: "#64748b",
      text_secondary_light: "#475569",
      text_secondary_dark: "#334155",
      warn: "#b25b00",
      error: "#b71c1c",
      success: "#237804",
      warnBg: "#FFF4D6",
      errorBg: "#FADADA",
      successBg: "#D9F7BE",
    },
  },
  dark: {
    colors: {
      // Dark theme colors...
    },
  },
};
```

#### Typography & Spacing

```typescript
// Actual scaling functions from utils/styling.ts
import { scale, verticalScale } from "@/utils/styling";

// Typography uses responsive scaling
export const tokens = {
  colors: colorsProxy, // Dynamic color proxy

  fontSize: {
    xs: scale(12),
    sm: scale(14),
    _15: scale(15),
    md: scale(16),
    lg: scale(18),
    xl: scale(22),
  },

  fonts: {
    regular: "'Poppins-Regular', 'Avenir', Helvetica, Arial, sans-serif",
    medium: "'Poppins-Medium', 'Avenir', Helvetica, Arial, sans-serif",
  },

  radius: {
    sm: verticalScale(10),
    md: verticalScale(16),
  },

  spacing: {
    _5: scale(5),
    _10: scale(10),
    _15: scale(15),
    _20: scale(20),
    _30: scale(30),
    _40: scale(40),
  },

  border: {
    defaultWidth: 1.5,
  },
};
```

### Global Styles

**[`theme/globalStyleSheet.tsx`](../theme/globalStyleSheet.tsx)** - Global style definitions

This file contains:

- Global component styles
- Layout definitions
- Common style patterns
- Cross-platform style consistency

## Localization

### Translation Files

**[`locales/en.json`](../locales/en.json)** - English translations

Add more locale files as needed (e.g., `locales/es.json`, `locales/fr.json`)

```json
{
  "layout": {
    "navigation": {
      "footer": {
        "home": "Home",
        "rooms": "Rooms",
        "scenes": "Scenes",
        "user": "User"
      }
    }
  },
  "auth": {
    "login": {
      "signInButton": "Sign in",
      "forgotPassword": "Forgot password",
      "thirdPartyLogin": "Third party account login"
    }
  },
  "device": {
    "addDeviceSelection": {
      "title": "Add Device",
      "bluetoothOption": "Bluetooth",
      "qrOption": "Scan QR Code",
      "softAPOption": "SoftAP"
    }
  }
  // ... extensive translation structure with 500+ keys
}
```

### i18n Configuration

**[`i18n.ts`](../i18n.ts)** - Internationalization configuration

Configure:

- Default language
- Fallback language
- Available locales
- Date/time formatting
- Number formatting

## Advanced Customization

### Custom Device Panels

Create custom device control panels in `app/(device)/device_panels/` by extending the base device panel components.

**Steps to create a custom device panel:**

1. Create a new TypeScript file in `app/(device)/device_panels/`
2. Extend the base device panel component
3. Implement custom UI and control logic
4. Register the panel in the device configuration

**Example:**

```typescript
// CustomLightPanel.tsx
import React from "react";
import { BaseDevicePanel } from "../../../components/DeviceSettings/BaseDevicePanel";

export const CustomLightPanel: React.FC<DevicePanelProps> = ({ device }) => {
  // Custom panel implementation
  return (
    <BaseDevicePanel device={device}>
      {/* Custom UI components */}
    </BaseDevicePanel>
  );
};
```

### Custom Parameter Controls

Add new parameter control types in `components/ParamControls/` to support custom device parameters.

**Steps to create a custom parameter control:**

1. Create a new component in `components/ParamControls/`
2. Implement the parameter control interface
3. Handle parameter value changes
4. Register the control in parameter configuration

### Branding & Assets

#### App Icons and Images

- Replace app icons in `assets/images/`
- Update device icons in `assets/images/devices/`
- Add custom branding assets

#### Splash Screen

- Update splash screen assets in platform-specific directories
- Configure splash screen behavior in [`app.json`](../app.json)

#### App Metadata

App name, slug, version, and bundle identifiers are all controlled via `.env` — no need to edit `app.config.ts` directly. See the [App Identity & Branding](#app-identity--branding) and [Version Information](#version-information) tables above.

## Source-Level Configuration

The files below sit **outside** `.env` and require source edits for structural changes (e.g. adding a new SDK, changing AI Agent endpoints, or wiring a new feature flag). Understanding these caveats prevents hard-to-debug runtime issues.

---

### `config/sdk.config.ts`

This is the **SDK wiring layer** — it reads `.env` values from `app.config.ts` extras, merges any runtime config (QR scan), and assembles the config objects passed to each SDK adaptor.

**Important caveats:**

- **`ActiveSDK`** is resolved from `ACTIVE_SDK` in `.env`. Changing the active SDK requires a rebuild — it is baked in at build time.
- **`getRMSDKConfig()`** merges values in priority order: _runtime config (QR scan) → `.env` → hardcoded fallback_. If a QR-scanned config is present it always wins over `.env` for `baseUrl`, `version`, `authUrl`, `clientId`, and `redirectUrl`.
- **`SDK_FEATURE_MAP`** is the Level 2 hard gate for feature flags. If you integrate a new SDK adaptor, you **must** add its entry here listing which features it supports. Features absent from the map default to disabled.
- **`CDFConfig.autoSync`** is driven by `ENABLE_CDF_AUTOSYNC` in `.env`. Setting it to `false` disables automatic CDF data synchronisation — device state will only refresh on explicit user action.
- **`getMatterSDKConfig()`** extends the RM SDK config with the Matter vendor ID (`matterVendorId`) and the React Native **Matter** adaptor (`matterAdapter`). It is passed into **`ESPRMMatterBaseSDKAdaptor`** whenever adaptors are created — not a separate post-CDF step.

---

### `config/features.config.ts`

This file resolves the final feature flag state used throughout the app.

**Important caveats:**

- **Always call `getFeatures()` as a function** — it is intentionally not a `const` export. It reads `ActiveSDK` at call time, making it safe if the SDK is switched at runtime. Caching its return value across a SDK switch will produce stale flags.
- **`getEnabledOAuthProviders()`** returns an empty array when `thirdPartyAuth` is disabled at either gate level. The Login screen calls this to decide which OAuth buttons to render.
- You cannot enable a feature via `.env` that the SDK does not support — Level 2 (`SDK_FEATURE_MAP`) is always the hard ceiling.

---

### `config/runtime.config.ts`

Manages the **QR-code-based runtime config** that can override `.env` SDK settings without a rebuild.

**Important caveats:**

- `runtimeConfigManager.loadFromStorage()` **must be called once at app startup** (it is called inside `initializeApp()` in `src/integrations/index.ts`). It must complete before any SDK config is read.
- After scanning a new QR config, the overrides take effect on the **next app launch** — the current session continues using the previously loaded config.
- To revert to `.env` defaults, call `runtimeConfigManager.reset()` and restart the app. This clears the persisted storage keys defined in `config/runtime.keys.config.ts`.
- The scanned payload must match the `ScannedConfigPayload` interface (`sdk` + `config` fields). An invalid payload is silently ignored.

---

### `config/agent.config.ts`

Contains the **AI Agent API URLs** and default identifiers.

**Important caveat:**

- These values are **hardcoded in source** and are not driven by `.env`. If you need to point the AI Agent at a different backend (e.g. a self-hosted deployment), edit this file directly:

  ```typescript
  export const AGENTS_API_BASE_URL = "https://api.agents.espressif.com";
  export const AGENTS_WEBSOCKET_BASE_URL = "wss://api.agents.espressif.com";
  export const DEFAULT_AGENT_ID = "esp_rainmaker_control";
  export const RAINMAKER_MCP_CONNECTOR_URL =
    "https://mcp.rainmaker.espressif.com/api/mcp";
  ```

---

### `src/integrations/index.ts` — CDF Bootstrap

This is the **app-level initialisation entry point**. It wires all SDK adaptors into the CDF runtime and must not be bypassed.

**Important caveats:**

- **Adding a new SDK adaptor** requires two steps:
  1. Instantiate and return it from `AdaptorFactory.createAll()`.
  2. Add its feature capabilities to `SDK_FEATURE_MAP` in `config/sdk.config.ts`.
     Skipping step 2 means all features for the new SDK will be hard-disabled.

- **`CDFBootstrap` is a singleton.** Calling `initialize()` multiple times is safe (it is a no-op after the first successful call). Do not call `reset()` in production — it clears all registered adaptors and requires a full re-initialisation.

- **Execution order inside `initializeApp()` is fixed:**
  1. Load persisted runtime config from storage.
  2. Boot CDF and register **all** SDK adaptors from the factory (this includes **`ESPRMMatterBaseSDKAdaptor`** with `getMatterSDKConfig()`).

  Do not reorder these steps — adaptor config must see the runtime overrides loaded in step 1.

- **Matter commissioning** is not a third init phase: the Matter-enabled RainMaker SDK adaptor is registered together with the base adaptor. Native Matter modules are loaded early where required (e.g. side import in the app entry path). Extending Matter support means keeping `matterAdapter`, HeadlessJS tasks, and native projects in sync with `@espressif/rainmaker-matter-sdk`.

---

> **⚠️ IMPORTANT NOTICE**: The public deployment details and configurations provided in this repository are intended for **development and educational purposes only** and should **NOT be used for commercial purposes**.
