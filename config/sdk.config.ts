/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import Constants from "expo-constants";
import asyncStorageAdapter from "@native-adaptors/implementations/ESPAsyncStorage";
import {
  runtimeConfigManager,
  type ESPRMNeoRuntimeConfig,
  type ESPRMRuntimeConfig,
} from "@config/runtime.config";
import { provisionAdapter } from "@native-adaptors/implementations/ESPProvAdapter";
import { EspLocalDiscoveryAdapter } from "@native-adaptors/implementations/ESPDiscoveryAdapter";
import { matterLocalDiscoveryAdapter } from "@native-adaptors/implementations/MatterDiscoverAdapter";
import ESPLocalControlAdapter from "@native-adaptors/implementations/ESPLocalControlAdapter";
import { ESPNotificationAdapter } from "@native-adaptors/implementations/ESPNotificationAdapter";
import { espOauthAdapter } from "@native-adaptors/implementations/ESPOauthAdapter";
import { nativeLoginAdapter } from "@native-adaptors/implementations/ESPNativeLoginAdapter";
import ESPAppUtilityAdapter from "@native-adaptors/implementations/ESPAppUtilityAdapter";
import { matterCommissioningAdaptor } from "@native-adaptors/implementations/ESPMatterAdapter";
import { ESPMatterControlAdapter } from "@native-adaptors/implementations/ESPMatterControlAdapter";
import { ESPMatterSubscriptionAdapter } from "@native-adaptors/implementations/ESPMatterSubscriptionAdapter";
import { ESPMQTTAdapter } from "@native-adaptors/implementations/ESPMQTTAdapter";
import { ESPRMBaseConfig } from "@espressif/rainmaker-base-sdk";
import type { ESPRMMatterBaseConfig } from "@espressif/rainmaker-matter-sdk";
import { type ESPRMNeoBaseConfig } from "@espressif/rainmaker-neo-base-sdk";
import { reportDerivedShadowParams } from "@sdk-adaptors/ESPRMNeoMatterBase/utils/derivedShadowReporter";
import type { ESPRMNeoMatterBaseConfig } from "@espressif/rainmaker-neo-matter-sdk";
import { matterClusterConfig } from "@config/cluster.config";
import {
  DEFAULT_ACTIVE_SDK_ID,
  ESPRM_BASE_SDK_ID,
  ESPRMMatter_BASE_SDK_ID,
  ESPRMNeo_BASE_SDK_ID,
  ESPRMNeoMatter_BASE_SDK_ID,
  type SDKIdentifier,
  isRmneoStackSdkId,
  normalizeSdkIdentifier,
} from "./sdk.identifiers";
import { getRegionConfig } from "./region.config";

export {
  DEFAULT_ACTIVE_SDK_ID,
  ESPRM_BASE_SDK_ID,
  ESPRMNeo_BASE_SDK_ID,
  ESPRMMatterBaseAdaptorIdentifier,
  ESPRMBaseAdaptorIdentifier,
  ESPRMNeoBaseAdaptorIdentifier,
  SUPPORTED_SDK_IDENTIFIERS,
  isRmneoStackSdkId,
  normalizeSdkIdentifier,
  type SDKIdentifier,
} from "./sdk.identifiers";

/**
 * Pure Matter nodes: PUT a *derived* RainMaker Neo node config raised from the
 * endpoint tree through the attribute<->param mapping (`data_model: "rmng"`,
 * `origin.type: "derived"`) instead of the Matter pass-through. Write side
 * only for now — reading it back into a device model is the next step.
 */
const MATTER_DERIVED_NODE_CONFIG = true;
/** Derived configs carry the Identify param, so pure Matter nodes keep their identify button. */
const MATTER_DERIVED_NODE_CONFIG_INCLUDE_IDENTIFY = true;

// Binary-level extra (region-invariant values). Region-scoped config comes
// from getRegionConfig() at call time — no legacy rmSdk/rmSdkCn fallback.
const extra = Constants.expoConfig?.extra || {};

const {
  matterSdk = {} as Record<string, string>,
  features = {} as Record<string, any>,
} = extra;

// ─── RM SDK Config ────────────────────────────────────────────────────────────

export function getRMSDKConfig(): ESPRMBaseConfig {
  const override = (
    runtimeConfigManager.activeSdk === ESPRM_BASE_SDK_ID
      ? (runtimeConfigManager.config as ESPRMRuntimeConfig | null)
      : null
  );

  // Region-scoped cloud config (global vs CN), resolved at call time.
  const region = getRegionConfig();
  const regionalRm = region.rmSdk;

  // Third-party auth: region availability AND binary capability, both
  // disable-only (mirrors the getFeatures() cascade without importing it —
  // features.config already imports this module).
  const thirdPartyAuthEnabled =
    region.features.enableThirdPartyAuth !== false &&
    features.enableThirdPartyAuth !== false;

  const base = {
    baseUrl: override?.baseUrl ?? regionalRm.baseUrl ?? "https://api.rainmaker.espressif.com",
    claimUrl: override?.claimUrl ?? regionalRm.claimUrl ?? "https://esp-claiming.rainmaker.espressif.com",
    version: override?.version ?? regionalRm.version ?? "v1",
    customStorageAdapter: asyncStorageAdapter,
    localDiscoveryAdapter: EspLocalDiscoveryAdapter,
    localControlAdapter: ESPLocalControlAdapter,
    provisionAdapter: provisionAdapter,
    notificationAdapter: ESPNotificationAdapter,
    oauthAdapter: espOauthAdapter,
    // Platform account UI for providers that have one. The SDK prefers it over
    // the browser flow per attempt and falls back to `oauthAdapter` when it
    // reports unavailable, so no caller has to choose.
    nativeLoginAdapter,
    appUtilityAdapter: ESPAppUtilityAdapter,
  };

  return thirdPartyAuthEnabled
    ? {
      ...base,
      authUrl: override?.authUrl ?? regionalRm.authUrl,
      clientId: override?.clientId ?? regionalRm.clientId,
      redirectUrl: override?.redirectUrl ?? regionalRm.redirectUrl,
    }
    : base;
}

const rmneoCompatibleProvisionAdapter = {
  ...provisionAdapter,
  getDeviceVersion: async (deviceName: string): Promise<Record<string, unknown>> => {
    return provisionAdapter.getDeviceVersionInfo(deviceName);
  },
};

export function getRMNeoSDKConfig(): ESPRMNeoBaseConfig {
  const activeSdk = runtimeConfigManager.activeSdk;
  const override =
    activeSdk != null && isRmneoStackSdkId(activeSdk)
      ? (runtimeConfigManager.config as ESPRMNeoRuntimeConfig | null)
      : null;

  // Region-scoped RMNeo cloud config, resolved at call time. Cast matches the
  // pre-regionConfigs typing (extra was Record<string, string>); blank env
  // values still surface as runtime config errors, not silent fallbacks.
  const rmneoSdk = getRegionConfig().rmneoSdk as Record<string, string>;

  return {
    // RainMaker Neo expects two full URLs only (stage included in each value).
    baseUrl: override?.baseUrl ?? rmneoSdk.baseUrl,
    userApiBase: override?.userApiBase ?? rmneoSdk.userApiBase,
    awsRegion: override?.awsRegion ?? rmneoSdk.awsRegion,
    iotEndpoint: override?.iotEndpoint ?? rmneoSdk.iotEndpoint,
    customStorageAdapter: asyncStorageAdapter,
    localControlAdapter: ESPLocalControlAdapter as ESPRMNeoBaseConfig["localControlAdapter"],
    // Native bridge uses async isConnected(); MQTTTransport types are sync.
    mqttAdapter: ESPMQTTAdapter as unknown as ESPRMNeoBaseConfig["mqttAdapter"],
    provisionAdapter: rmneoCompatibleProvisionAdapter as ESPRMNeoBaseConfig["provisionAdapter"],
    localDiscoveryAdapter: EspLocalDiscoveryAdapter as ESPRMNeoBaseConfig["localDiscoveryAdapter"],
  };
}

// ─── Active SDK ───────────────────────────────────────────────────────────────

/**
 * Region default from `ACTIVE_SDK` in the committed region env files
 * (.env.global.example / .env.cn.example), resolved once for the active region at module load
 * (the region is session-stable — see region.config.ts).
 */
export const ActiveSDK = (getRegionConfig().activeSdk ||
  DEFAULT_ACTIVE_SDK_ID) as SDKIdentifier;

/**
 * Effective SDK after persisted runtime scan config (Config Scan).
 * Must be used after `runtimeConfigManager.loadFromStorage()` at startup.
 *
 * RainMaker Classic and RainMaker Neo base adaptors are all registered
 * (see integrations/index.ts).
 */
export function getResolvedActiveSdk(): SDKIdentifier {
  return (
    normalizeSdkIdentifier(runtimeConfigManager.activeSdk) ??
    normalizeSdkIdentifier(ActiveSDK) ??
    DEFAULT_ACTIVE_SDK_ID
  );
}

// ─── CDF Config ───────────────────────────────────────────────────────────────

export const CDFConfig = {
  autoSync: features.enableCdfAutoSync ?? false,
};

// ─── Matter SDK Config ────────────────────────────────────────────────────────

/**
 * Neo Matter SDK config — the Neo base config plus the full Matter surface.
 *
 * Reuses the exact adapter objects the classic stack passes: they are pure
 * native bridges / data registries with stack-agnostic contracts (the Neo SDK's
 * adapter interfaces are shape-identical to the classic ones by design), so one
 * object satisfies both SDKs. `clusterConfig` is the same cluster → UI param
 * registry, which is structurally typed and valid for either package.
 *
 * @returns Neo Matter SDK configuration.
 */
export function getNeoMatterSDKConfig(): ESPRMNeoMatterBaseConfig {
  return {
    ...getRMNeoSDKConfig(),
    matterCommissioningAdaptor,
    matterControlAdapter: ESPMatterControlAdapter,
    matterSubscriptionAdapter: ESPMatterSubscriptionAdapter,
    matterLocalDiscoveryAdapter,
    matterVendorId: matterSdk.vendorId,
    // Returned unasserted on purpose: this is the only place one shared
    // `matterClusterConfig` is handed to both stacks, so letting the Neo SDK's own
    // `ClusterConfigMap` check it here is what catches a classic/Neo divergence at
    // build time instead of as a silent mis-decode at runtime.
    clusterConfig: matterClusterConfig,
    derivedNodeConfig: MATTER_DERIVED_NODE_CONFIG,
    includeIdentify: MATTER_DERIVED_NODE_CONFIG_INCLUDE_IDENTIFY,
    // The app is a derived pure Matter node's reporter: params the SDK learns
    // over the fabric are published as the node's reported shadow state, where
    // a native node's firmware would put them (same MQTT session, same policy).
    shadowReporter: reportDerivedShadowParams,
  };
}

export function getMatterSDKConfig(): ESPRMMatterBaseConfig {
  return {
    ...getRMSDKConfig(),
    matterCommissioningAdaptor,
    matterControlAdapter: ESPMatterControlAdapter,
    matterSubscriptionAdapter: ESPMatterSubscriptionAdapter,
    matterLocalDiscoveryAdapter,
    matterVendorId: matterSdk.vendorId,
    clusterConfig: matterClusterConfig,
  };
}


// ─── SDK Feature Map (Level 2) ────────────────────────────────────────────────
//
// Defines which features each SDK adaptor supports.
// This is the technical truth — UI consumes this via config/features.config.ts.
// Add a new SDK entry here when a new adaptor is registered.

/** RainMaker Neo base stack. The Neo Matter stack inherits it and flips one flag. */
const RMNEO_SDK_FEATURES: Record<string, boolean | readonly string[]> = {
  scenes: false,
  schedules: true,
  automations: true,
  // Neo automations do not expose Allow retrigger in the product UI.
  automationRetrigger: false,
  localControl: true,
  notifications: true,
  groupSharing: true,
  subGroupSharing: true,
  transferGroupSharing: false,
  ota: false,
  controlGroups: true,
  secondaryGroupManagement: true,
  aiAgent: false,
  thirdPartyAuth: false,
  voiceAssistants: false,
  authAllowedUsernameTypes: ["email", "phone"],
  // Challenge-response association over LAN HTTP, against the `ch_resp`
  // endpoint set on the shared `_esp_rmaker_ctrl._tcp` instance.
  onNetworkProvisioning: true,
  softApProvisioning: true,
  // The RMNeo stack has no Matter support: its CDF group exposes no
  // `convertToMatterFabric` / `issueUserNoC`, so commissioning cannot run.
  matterCommissioning: false,
  // Neo has no account-deletion API.
  accountDeletion: false,
  // Neo has no `updateName` API: the profile shows email / phone read-only.
  nicknameEditing: false,
  // A hybrid automates over RainMaker; only pure Matter nodes are left out.
  hybridMatterAutomation: true,
  // Neo accepts schedule writes for offline nodes, so they stay selectable.
  offlineDeviceSchedules: true,
  // On-network provisionable nodes announce on the shared `_esp_rmaker_ctrl._tcp`
  // instance: filtered on `cap`, security read from the version endpoint.
  onNetworkDiscoveryViaLocalControl: true,
  // A node timezone write is confirmed by reading the Time param back over MQTT.
  timezoneLiveVerify: true,
};

export const SDK_FEATURE_MAP: Record<
  SDKIdentifier,
  Record<string, boolean | readonly string[]>
> = {
  [ESPRM_BASE_SDK_ID]: {
    // All features fully supported
    scenes: true,
    schedules: true,
    automations: true,
    automationRetrigger: true,
    localControl: true,
    notifications: true,
    groupSharing: true,
    subGroupSharing: false,
    transferGroupSharing: true,
    ota: true,
    controlGroups: false,
    secondaryGroupManagement: false,
    // API-only / env-controlled — always true at SDK level
    aiAgent: true,
    thirdPartyAuth: true,
    voiceAssistants: true,
    onNetworkProvisioning: true,
    softApProvisioning: true,
    // Matter lives in the separate ESPRMMatterBase adaptor, not this one.
    matterCommissioning: false,
    accountDeletion: true,
    nicknameEditing: true,
    // Every Matter-backed node stays out of automations until hybrid
    // automation is validated on classic.
    hybridMatterAutomation: false,
    offlineDeviceSchedules: false,
    // Dedicated `_esp_rmaker_chal_resp._tcp` service; TXT carries the security details.
    onNetworkDiscoveryViaLocalControl: false,
    // No service-level getParams to read back with: an accepted write is success.
    timezoneLiveVerify: false,
  },
  [ESPRMNeo_BASE_SDK_ID]: RMNEO_SDK_FEATURES,
  // Neo plus Matter commissioning: this adaptor's CDF group carries
  // convertToMatterFabric / getFabricDetails / startCommissioning.
  [ESPRMNeoMatter_BASE_SDK_ID]: {
    ...RMNEO_SDK_FEATURES,
    matterCommissioning: true,
  },
  [ESPRMMatter_BASE_SDK_ID]: {
    scenes: true,
    schedules: true,
    automations: true,
    automationRetrigger: true,
    localControl: true,
    notifications: true,
    groupSharing: true,
    subGroupSharing: false,
    transferGroupSharing: true,
    ota: true,
    controlGroups: false,
    secondaryGroupManagement: false,
    aiAgent: true,
    thirdPartyAuth: true,
    voiceAssistants: true,
    matterCommissioning: true,
    onNetworkProvisioning: true,
    softApProvisioning: true,
    accountDeletion: true,
    nicknameEditing: true,
    hybridMatterAutomation: false,
    offlineDeviceSchedules: false,
    onNetworkDiscoveryViaLocalControl: false,
    timezoneLiveVerify: false,
  },
};
