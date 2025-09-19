# Configuration & Customization

This document provides detailed information on how to configure and customize the ESP RainMaker Home App to suit your specific needs.

## Table of Contents

- [SDK Configuration](#sdk-configuration)
- [Device & Parameter Configuration](#device--parameter-configuration)
- [Theme Customization](#theme-customization)
- [Localization](#localization)
- [Advanced Customization](#advanced-customization)
- [API Configuration](#api-configuration)

## SDK Configuration

The app can be customized through the SDK configuration files:

### [`rainmaker.config.ts`](../rainmaker.config.ts) - Main SDK Configuration

```typescript
export const SDKConfig = {
  baseUrl: "https://api.rainmaker.espressif.com",
  version: "v1",
  authUrl: "https://3pauth.rainmaker.espressif.com",
  clientId: "1h7ujqjs8140n17v0ahb4n51m2",
  redirectUrl: "rainmaker://com.espressif.novahome/success",
  customStorageAdapter: asyncStorageAdapter,
  localDiscoveryAdapter: EspLocalDiscoveryAdapter,
  localControlAdapter: ESPLocalControlAdapter,
  provisionAdapter: provisionAdapter,
  notificationAdapter: ESPNotificationAdapter,
  oauthAdapter: espOauthAdapter,
  appUtilityAdapter: ESPAppUtilityAdapter,
};

export const CDFConfig = {
  autoSync: true, // Enable automatic data synchronization
};
```

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
    roomLabel: "Power",
  },
  {
    name: "Brightness",
    types: [ESPRM_BRIGHTNESS_PARAM_TYPE],
    control: BrightnessSlider,
    dataTypes: DATA_TYPE_INT,
    paramType: ESPRM_BRIGHTNESS_PARAM_TYPE,
    roomLabel: "Brightness",
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

Modify app name and bundle identifiers in [`app.json`](../app.json):

```json
{
  "expo": {
    "name": "Your Custom App Name",
    "slug": "your-custom-slug",
    "version": "1.0.0",
    "bundleIdentifier": "com.yourcompany.yourapp"
    // ... other configurations
  }
}
```

## API Configuration

### Custom API Endpoint

Customize the ESP RainMaker API endpoint and authentication settings in [`rainmaker.config.ts`](../rainmaker.config.ts):

```typescript
export const SDKConfig = {
  baseUrl: "https://your-custom-api.com", // Custom API endpoint
  version: "v1",
  authUrl: "https://your-custom-auth.com", // Custom OAuth endpoint
  clientId: "your-client-id", // OAuth client ID
  redirectUrl: "yourapp://com.yourcompany.yourapp/success", // OAuth redirect URL
  customStorageAdapter: asyncStorageAdapter,
  localDiscoveryAdapter: EspLocalDiscoveryAdapter,
  localControlAdapter: ESPLocalControlAdapter,
  provisionAdapter: provisionAdapter,
  notificationAdapter: ESPNotificationAdapter,
  oauthAdapter: espOauthAdapter,
  appUtilityAdapter: ESPAppUtilityAdapter,
};
```

### Environment-Specific Configuration

You can create environment-specific configurations:

```typescript
// Development configuration
const developmentConfig = {
  baseUrl: "api.staging.rainmaker.espressif.com",
};

// Production configuration
const productionConfig = {
  baseUrl: "https://api.rainmaker.espressif.com",
};

// Use appropriate configuration based on environment
export const SDKConfig = __DEV__ ? developmentConfig : productionConfig;
```

### Custom Adapters

You can implement custom adapters for specific functionality:

#### Storage Adapter

```typescript
// Actual storage adapter structure from ESPAsyncStorage.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ESPRMStorageAdapterInterface } from "@espressif/rainmaker-base-sdk";

export const asyncStorageAdapter: ESPRMStorageAdapterInterface = {
  setItem: async (name: string, value: string) => {
    try {
      await AsyncStorage.setItem(name, value);
    } catch (error) {
      throw error;
    }
  },
  getItem: async (name: string): Promise<string | null> => {
    try {
      const response = await AsyncStorage.getItem(name);
      return response;
    } catch (error) {
      throw error;
    }
  },
  removeItem: async (name: string) => {
    try {
      await AsyncStorage.removeItem(name);
    } catch (error) {
      throw error;
    }
  },
  clear: async () => {
    try {
      await AsyncStorage.clear();
    } catch (error) {
      throw error;
    }
  },
};
```

#### Notification Adapter

```typescript
// Actual notification adapter structure from ESPNotificationAdapter.ts
export const ESPNotificationAdapter = {
  currentListener: null as EmitterSubscription | null,

  addNotificationListener: async (
    callback: (data: Record<string, any>) => void
  ): Promise<() => void> => {
    try {
      if (ESPNotificationAdapter.currentListener) {
        ESPNotificationAdapter.removeNotificationListener();
      }

      // Listen for incoming notifications and handle them
      const notificationListener = DeviceEventEmitter.addListener(
        "ESPNotificationModule",
        (data: Record<string, any>) => {
          callback(data); // Invoke the callback with the received data
        }
      );

      // Save listener reference for removal
      ESPNotificationAdapter.currentListener = notificationListener;

      // Return a cleanup function to remove the notification listener
      return () => {
        ESPNotificationAdapter.removeNotificationListener();
      };
    } catch (error) {
      return () => {}; // Return a no-op cleanup function in case of an error
    }
  },

  removeNotificationListener: (): void => {
    try {
      if (ESPNotificationAdapter.currentListener) {
        ESPNotificationAdapter.currentListener.remove();
        ESPNotificationAdapter.currentListener = null;
      }
    } catch (error) {
      throw error;
    }
  },

  getNotificationPlatform: async (): Promise<string> => {
    try {
      const platform = await ESPNotificationModule.getNotificationPlatform();
      return platform;
    } catch (error) {
      console.error("Error getting notification platform:", error);
      throw error;
    }
  },
};
```

---

> **⚠️ IMPORTANT NOTICE**: The public deployment details and configurations provided in this repository are intended for **development and educational purposes only** and should **NOT be used for commercial purposes**.
