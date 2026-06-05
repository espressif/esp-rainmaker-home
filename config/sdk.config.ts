/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import Constants from "expo-constants";
import asyncStorageAdapter from "@native-adaptors/implementations/ESPAsyncStorage";
import {
  runtimeConfigManager,
  type ESPRMNGRuntimeConfig,
  type ESPRMRuntimeConfig,
} from "@config/runtime.config";
import { provisionAdapter } from "@native-adaptors/implementations/ESPProvAdapter";
import { EspLocalDiscoveryAdapter } from "@native-adaptors/implementations/ESPDiscoveryAdapter";
import { matterLocalDiscoveryAdapter } from "@native-adaptors/implementations/MatterDiscoverAdapter";
import ESPLocalControlAdapter from "@native-adaptors/implementations/ESPLocalControlAdapter";
import { ESPNotificationAdapter } from "@native-adaptors/implementations/ESPNotificationAdapter";
import { espOauthAdapter } from "@native-adaptors/implementations/ESPOauthAdapter";
import ESPAppUtilityAdapter from "@native-adaptors/implementations/ESPAppUtilityAdapter";
import { matterCommissioningAdaptor } from "@native-adaptors/implementations/ESPMatterAdapter";
import { ESPMatterControlAdapter } from "@native-adaptors/implementations/ESPMatterControlAdapter";
import { ESPMatterSubscriptionAdapter } from "@native-adaptors/implementations/ESPMatterSubscriptionAdapter";
import { ESPMQTTAdapter } from "@native-adaptors/implementations/ESPMQTTAdapter";
import { ESPRMBaseConfig } from "@espressif/rainmaker-base-sdk";
import type { ESPRMMatterBaseConfig } from "@espressif/rainmaker-matter-sdk";
import type { ESPRMNGBaseConfig } from "@espressif/rmng-base-sdk";
import { matterClusterConfig } from "@sdk-adaptors/ESPRMMatterBase/cluster.config";
import {
  DEFAULT_ACTIVE_SDK_ID,
  ESPRM_BASE_SDK_ID,
  ESPRMMatter_BASE_SDK_ID,
  ESPRMNG_BASE_SDK_ID,
  type SDKIdentifier,
} from "./sdk.identifiers";

export {
  DEFAULT_ACTIVE_SDK_ID,
  ESPRM_BASE_SDK_ID,
  ESPRMNG_BASE_SDK_ID,
  ESPRMMatterBaseAdaptorIdentifier,
  ESPRMBaseAdaptorIdentifier,
  ESPRMNGBaseAdaptorIdentifier,
  SUPPORTED_SDK_IDENTIFIERS,
  type SDKIdentifier,
} from "./sdk.identifiers";

// Get environment variables from Expo Constants
const extra = Constants.expoConfig?.extra || {};

const {
  rmSdk = {} as Record<string, string>,
  rmngSdk = {} as Record<string, string>,
  matterSdk = {} as Record<string, string>,
  activeSdk,
  features = {} as Record<string, any>,
} = extra;

// ─── RM SDK Config ────────────────────────────────────────────────────────────

const thirdPartyAuthEnabled = features.enableThirdPartyAuth ?? false;

export function getRMSDKConfig(): ESPRMBaseConfig {
  const override = (
    runtimeConfigManager.activeSdk === ESPRM_BASE_SDK_ID
      ? (runtimeConfigManager.config as ESPRMRuntimeConfig | null)
      : null
  );

  const base = {
    baseUrl: override?.baseUrl ?? rmSdk.baseUrl ?? "https://api.rainmaker.espressif.com",
    version: override?.version ?? rmSdk.version ?? "v1",
    customStorageAdapter: asyncStorageAdapter,
    localDiscoveryAdapter: EspLocalDiscoveryAdapter,
    localControlAdapter: ESPLocalControlAdapter,
    provisionAdapter: provisionAdapter,
    notificationAdapter: ESPNotificationAdapter,
    oauthAdapter: espOauthAdapter,
    appUtilityAdapter: ESPAppUtilityAdapter,
  };

  return thirdPartyAuthEnabled
    ? {
      ...base,
      authUrl: override?.authUrl ?? rmSdk.authUrl,
      clientId: override?.clientId ?? rmSdk.clientId,
      redirectUrl: override?.redirectUrl ?? rmSdk.redirectUrl,
    }
    : base;
}

const rmngCompatibleProvisionAdapter = {
  ...provisionAdapter,
  getDeviceVersion: async (deviceName: string): Promise<Record<string, unknown>> => {
    return provisionAdapter.getDeviceVersionInfo(deviceName);
  },
};

export function getRMNGSDKConfig(): ESPRMNGBaseConfig {
  const override = (
    runtimeConfigManager.activeSdk === ESPRMNG_BASE_SDK_ID
      ? (runtimeConfigManager.config as ESPRMNGRuntimeConfig | null)
      : null
  );

  return {
    baseUrl:
      override?.baseUrl ??
      rmngSdk.baseUrl,
    apiPath: override?.apiPath ?? rmngSdk.apiPath,
    userApiBase: override?.userApiBase ?? rmngSdk.userApiBase,
    userApiBaseUrl:
      override?.userApiBaseUrl ??
      rmngSdk.userApiBaseUrl,
    userApiPath: override?.userApiPath ?? rmngSdk.userApiPath,
    identityId:
      override?.identityId ??
      rmngSdk.identityId,
    awsRegion: override?.awsRegion ?? rmngSdk.awsRegion,
    userPoolId:
      override?.userPoolId ??
      rmngSdk.userPoolId,
    clientId:
      override?.clientId ??
      rmngSdk.clientId,
    iotEndpoint:
      override?.iotEndpoint ??
      rmngSdk.iotEndpoint,
    customStorageAdapter: asyncStorageAdapter,
    localControlAdapter: ESPLocalControlAdapter as ESPRMNGBaseConfig["localControlAdapter"],
    // Native bridge uses async isConnected(); rmng-base-sdk MQTTTransport types are sync.
    mqttAdapter: ESPMQTTAdapter as unknown as ESPRMNGBaseConfig["mqttAdapter"],
    provisionAdapter: rmngCompatibleProvisionAdapter as ESPRMNGBaseConfig["provisionAdapter"],
  };
}

// ─── Active SDK ───────────────────────────────────────────────────────────────

/** Build-time default from `ACTIVE_SDK` in `.env` / app.config `extra`. */
export const ActiveSDK = (activeSdk || DEFAULT_ACTIVE_SDK_ID) as SDKIdentifier;

/**
 * Effective SDK after persisted runtime scan config (Config Scan).
 * Must be used after `runtimeConfigManager.loadFromStorage()` at startup.
 */
export function getResolvedActiveSdk(): SDKIdentifier {
  return runtimeConfigManager.activeSdk ?? ActiveSDK;
}

// ─── CDF Config ───────────────────────────────────────────────────────────────

export const CDFConfig = {
  autoSync: features.enableCdfAutoSync ?? false,
};

// ─── Matter SDK Config ────────────────────────────────────────────────────────

export function getMatterSDKConfig(): ESPRMMatterBaseConfig {
  return {
    ...getRMSDKConfig(),
    matterCommissioningAdaptor,
    matterControlAdapter: ESPMatterControlAdapter,
    matterSubscriptionAdapter: ESPMatterSubscriptionAdapter,
    matterLocalDiscoveryAdapter,
    matterVendorId: matterSdk.vendorId ?? "0x131B",
    clusterConfig: matterClusterConfig,
  };
}


// ─── SDK Feature Map (Level 2) ────────────────────────────────────────────────
//
// Defines which features each SDK adaptor supports.
// This is the technical truth — UI consumes this via config/features.config.ts.
// Add a new SDK entry here when a new adaptor is registered.

export const SDK_FEATURE_MAP: Record<
  SDKIdentifier,
  Record<string, boolean | readonly string[]>
> = {
  [ESPRM_BASE_SDK_ID]: {
    // All features fully supported
    scenes: true, schedules: true, automations: true, localControl: true,
    notifications: true, groupSharing: true, subGroupSharing: false, transferGroupSharing: true, ota: true,
    controlGroups: false,
    // API-only / env-controlled — always true at SDK level
    aiAgent: true, thirdPartyAuth: true, voiceAssistants: true,
    onNetworkProvisioning: true,
  },
  [ESPRMNG_BASE_SDK_ID]: {
    scenes: false, schedules: true, automations: true, localControl: true,
    notifications: true, groupSharing: true, subGroupSharing: true, transferGroupSharing: false, ota: false,
    controlGroups: true,
    aiAgent: false, thirdPartyAuth: false, voiceAssistants: false,
    authAllowedUsernameTypes: ["email", "phone"],
    groupSharingAllowedTypes: ["userCode"],
    onNetworkProvisioning: false,
  },
  [ESPRMMatter_BASE_SDK_ID]: {
    scenes: true, schedules: true, automations: true, localControl: true,
    notifications: true, groupSharing: true, subGroupSharing: false, transferGroupSharing: true, ota: true,
    controlGroups: false,
    aiAgent: true, thirdPartyAuth: true, voiceAssistants: true,
    matterCommissioning: true,
    onNetworkProvisioning: true,
  },
};
