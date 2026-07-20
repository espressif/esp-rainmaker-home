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

Each region has **one self-contained env file** holding *everything* for that region — native/build identity **and** the JS/runtime region config — in a single layer. There are two files per region:

| File | Committed? | Role |
| --- | --- | --- |
| `.env.global.example` / `.env.cn.example` | yes | Template / reference (safe to commit). Also the fallback when no local file exists (CI, fresh checkout). |
| `.env.global` / `.env.cn` | **no** (gitignored) | Your real values. Copy the matching `.example`, then edit. |

A build copies the relevant file to `.env`, **preferring the local file and falling back to the committed `.example`**:

```bash
npm run android            # global Android → .env.global (else .env.global.example)
npm run android:cn         # CN Android     → .env.cn     (else .env.cn.example)
npm run ios                # iOS binary     → .env.global.example (see APP_REGION note below)
```

Two consumers read the copied `.env`:

- **`scripts/sync-env-to-*.js`** pull the native/build-identity keys into the Android (gradle) / iOS (xcconfig) projects.
- **`app.config.ts`** reads native keys via `process.env` **and** parses **both** region files directly (local if present, else `.example`), embedding them as `extra.regionConfigs.{global,cn}`. The app selects one at runtime via `config/region.config.ts` (`getRegionConfig()`).

Because both region blocks are always embedded, **one binary can serve both regions**: the iOS App Store app builds from `.env.global.example` (`APP_REGION=auto`) and resolves its region from the device's Region setting at startup. Android instead ships two flavors, each pinned at build time by the `APP_REGION` in its file: the local `.env.global` sets `APP_REGION=global` (the global APK omits the CN-only WeChat native module, so it must not runtime-flip to CN), and `.env.cn` sets `APP_REGION=cn`.

> **`APP_REGION` note:** `npm run ios` copies the committed `.env.global.example` (which keeps `APP_REGION=auto` for the single iOS binary), **not** the local `.env.global` (which is pinned to `global` for the Android global flavor). Keep valid iOS values in `.env.global.example` for this reason.

The region keys must keep an identical key set across the two regions (same keys, region-specific values). The sync scripts also accept `ENVFILE=<path>` to read a different env file without copying.

---

### App Identity & Branding

| Variable                     | Description                                         | Default                        |
| ---------------------------- | --------------------------------------------------- | ------------------------------ |
| `APP_NAME`                   | Display name shown on the device home screen        | `ESP RainMaker Home`           |
| `APP_SLUG`                   | Expo slug (used for OTA and deep links)             | `esp-rainmaker-home`           |
| `APP_SCHEMA`                 | URL scheme for deep links (`<schema>://`)           | `rainmaker`                    |
| `IOS_APP_APPLICATION_ID`     | iOS bundle identifier                               | `com.espressif.nova`           |
| `ANDROID_APP_APPLICATION_ID` | Android application ID for this build. Value differs per region file (`com.espressif.novahome` global, `com.espressif.nova` cn); the global flavor inherits it via `defaultConfig`, the cn flavor via `findProperty`. Builds are one-flavor-at-a-time. | `com.espressif.novahome` |
| `IOS_APP_GROUP_ID`           | iOS App Group ID (used for notification extensions) | `group.com.espressif.novahome` |

---

### Version Information

| Variable               | Description                       |
| ---------------------- | --------------------------------- |
| `APP_VERSION`          | Semantic version shown in the app |
| `ANDROID_VERSION_CODE` | Android integer version code      |

---

### SDK Configuration (region config — `.env.global.example` / `.env.cn.example`)

The active SDK and its API endpoints are **region config**: they live in the committed `.env.global.example` / `.env.cn.example` files (same keys in both) and are selected at runtime for the active region.

| Variable      | Description                                         | Global value                          | CN value                                    |
| ------------- | --------------------------------------------------- | ------------------------------------- | ------------------------------------------- |
| `ACTIVE_SDK`  | SDK to use: `rainmaker-base-sdk` or `rmng-base-sdk` | `rainmaker-matter-sdk`                | `rainmaker-matter-sdk`                      |
| `BASE_URL`    | ESP RainMaker API base URL                          | `https://api.rainmaker.espressif.com` | `https://api2.rainmaker.espressif.com.cn`   |
| `API_VERSION` | API version path segment                            | `v1`                                  | `v1`                                        |
| `CLAIM_URL`      | Claiming service URL                             | `https://esp-claiming.rainmaker.espressif.com` | `https://claiming.rainmaker.espressif.com.cn` |

The `RMNG_*` endpoint set follows the same pattern. These are embedded as `extra.regionConfigs.{global,cn}` and resolved by `config/sdk.config.ts` via `getRegionConfig()` at startup — there is **no fallback** to legacy top-level keys; a missing region block fails fast.

---

### Feature Flags

Feature flags use a **three-level, disable-only gating** system (`config/features.config.ts`):

- **Level 3 — SDK capability** (hard gate): if the active SDK does not support a feature, it is disabled regardless of config.
- **Level 2 — region availability** (`.env.global.example` / `.env.cn.example`, committed): what the region offers, resolved at runtime. Example: `ENABLE_VOICE_ASSISTANTS=false` in `.env.cn.example` hides Alexa/Google Assistant in the CN region — including on the single iOS binary.
- **Level 1 — binary `.env` override**: disables what a specific binary cannot support. Example: `ENABLE_NOTIFICATIONS=false` in `.env.cn.example`, because the Android CN binary ships without FCM. This is a per-binary push-transport limit, not a CN-region policy — so `config/features.config.ts` keeps notifications available on **iOS** (APNs, every region) regardless of the flag; only Android honors it.

No level can enable what a lower level disabled. Set a variable to `false` to turn a feature off; unset variables default to enabled.

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

**Region config** (`.env.global.example` / `.env.cn.example`) — the OAuth client and the offered providers are per-region:

| Variable                             | Description                               | Global value                                 | CN value                                  |
| ------------------------------------ | ----------------------------------------- | -------------------------------------------- | ----------------------------------------- |
| `THIRD_PARTY_AUTH_CLIENT_ID`         | Cognito / OAuth client ID                 | `1h7ujqjs8140n17v0ahb4n51m2`                 | `6m3FgmvJSt4g6pDrHgfpYj`                  |
| `THIRD_PARTY_AUTH_AUTH_URL`          | OAuth authorization endpoint              | `https://3pauth.rainmaker.espressif.com`     | `https://api2.rainmaker.espressif.com.cn` |
| `THIRD_PARTY_AUTH_REDIRECT_URL`      | Redirect URL sent to the OAuth server     | `rainmaker://com.espressif.novahome/success` | `rainmaker://com.espressif.nova/success`  |
| `THIRD_PARTY_AUTH_ENABLED_PROVIDERS` | Providers offered, in display order       | `Google,SignInWithApple`                     | `WeChat,SignInWithApple`                  |

The provider lists **are** the region gate — Google is simply absent from the CN list and WeChat from the global list; no code-level provider filtering exists.

**Binary keys** (in the region file copied to `.env`) — the native redirect capture must match the binary's application id:

| Variable                           | Description                          |
| ---------------------------------- | ------------------------------------ |
| `THIRD_PARTY_AUTH_REDIRECT_SCHEME` | URL scheme for OAuth redirect        |
| `THIRD_PARTY_AUTH_REDIRECT_HOST`   | Host component of OAuth redirect URL |
| `THIRD_PARTY_AUTH_REDIRECT_URL`    | Full redirect URL (native BuildConfig) |

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

### Legal & Website Links (region config — `.env.global.example` / `.env.cn.example`)

These URLs appear in the app's settings / about screen and the CN consent screen. They are region config, resolved at runtime for the active region.

| Variable              | Description                  | Global value                                                        | CN value                                                            |
| --------------------- | ---------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `WEBSITE_LINK`        | Product website URL          | `https://rainmaker.espressif.com`                                    | `https://rainmaker.espressif.com`                                    |
| `TERMS_OF_USE_LINK`   | Terms of use URL template   | `https://rainmaker.espressif.com/{lang}/terms-of-use?region=global`   | `https://rainmaker.espressif.com/{lang}/terms-of-use?region=china`   |
| `PRIVACY_POLICY_LINK` | Privacy policy URL template | `https://rainmaker.espressif.com/{lang}/privacy-policy?region=global` | `https://rainmaker.espressif.com/{lang}/privacy-policy?region=china` |

The legal links support a `{lang}` placeholder, replaced at runtime with the active UI language (`en` / `zh`) so each region serves its pages in both languages (e.g. CN region + English UI → `https://rainmaker.espressif.com/en/privacy-policy?region=china`). A plain URL without the placeholder applies to all languages.

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

### Android App Signing (per-flavor keystores)

Release signing is **per flavor**: each region's `.env` carries its own keystore credentials, so building a flavor signs it with that flavor's keystore. Four keys, defined in the **local** (gitignored) `.env.global` / `.env.cn`:

| Variable | Description |
| --- | --- |
| `ANDROID_KEYSTORE_FILE` | Keystore path, relative to `android/app/` (e.g. `sign/global-release.jks`) |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore (store) password |
| `ANDROID_KEY_ALIAS` | Key alias |
| `ANDROID_KEY_PASSWORD` | Key password |

Flow: `npm run prebuild:android` (via `scripts/sync-env-to-android.js`) reads these from the active `.env` and writes the **gitignored** `android/keystore.properties`; `build.gradle`'s single `release` signingConfig reads that file and signs whichever flavor is being assembled. So `keystore.properties` always holds just these four keys — a new variant needs no extra keys in it, only the four values in that variant's `.env`.

- Put the keystores under `android/app/sign/` (gitignored) and the real credentials only in the **local** `.env.global` / `.env.cn` — keep the committed `.env.*.example` lines blank. Signing secrets are written **only** to `keystore.properties`, never to the committed `gradle.properties`.
- Without `ANDROID_KEYSTORE_FILE` set, the release APK is unsigned and debug builds use the default debug key.

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

This is the **SDK wiring layer** — it reads the active region's block from `extra.regionConfigs` (built from the committed `.env.global.example` / `.env.cn.example`), merges any runtime config (QR scan), and assembles the config objects passed to each SDK adaptor.

**Important caveats:**

- **`ActiveSDK`** is resolved from `ACTIVE_SDK` in the committed region files (`.env.global.example` / `.env.cn.example`) for the active region. Changing it requires a rebuild — it is baked in at build time.
- **`getRMSDKConfig()`** merges values in priority order: _runtime config (QR scan) → active region config → hardcoded fallback_. If a QR-scanned config is present it always wins over `.env` for `baseUrl`, `version`, `authUrl`, `clientId`, and `redirectUrl`.
- **`SDK_FEATURE_MAP`** is the Level 3 hard gate for feature flags. If you integrate a new SDK adaptor, you **must** add its entry here and explicitly set unsupported features to `false` — only an explicit `false` disables a feature; keys absent from the map pass this gate (i.e. default to enabled).
- **`CDFConfig.autoSync`** is driven by `ENABLE_CDF_AUTOSYNC` in `.env`. Setting it to `false` disables automatic CDF data synchronisation — device state will only refresh on explicit user action.
- **`getMatterSDKConfig()`** extends the RM SDK config with the Matter vendor ID (`matterVendorId`) and the React Native **Matter** adaptor (`matterAdapter`). It is passed into **`ESPRMMatterBaseSDKAdaptor`** whenever adaptors are created — not a separate post-CDF step.

---

### `config/features.config.ts`

This file resolves the final feature flag state used throughout the app.

**Important caveats:**

- **Always call `getFeatures()` as a function** — it is intentionally not a `const` export. It reads `ActiveSDK` at call time, making it safe if the SDK is switched at runtime. Caching its return value across a SDK switch will produce stale flags.
- **`getEnabledOAuthProviders()`** returns the active region's provider list (`THIRD_PARTY_AUTH_ENABLED_PROVIDERS` in `.env.global.example` / `.env.cn.example`) and an empty array when `thirdPartyAuth` is disabled at any gate level. The Login screen calls this to decide which OAuth buttons to render.
- You cannot enable a feature via region or binary config that the SDK does not support — Level 3 (`SDK_FEATURE_MAP`) is always the hard ceiling.

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
