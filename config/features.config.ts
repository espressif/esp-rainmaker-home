/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { getResolvedActiveSdk, SDK_FEATURE_MAP } from '@config/sdk.config';
import { getRegionConfig } from '@config/region.config';

/**
 * All controllable feature keys in the application.
 *
 * Essential (always enabled, not configurable):
 *   provisioning, deviceManagement, accountDeletion
 *
 * SDK-gated (RMNeo = false):
 *   scenes, schedules, localControl, notifications, groupSharing, subGroupSharing, transferGroupSharing, ota
 *
 * Both SDKs supported (env-only control):
 *   automations, aiAgent, thirdPartyAuth, voiceAssistants
 *
 * SDK-gated (RMNeo / rainmaker-neo-base-sdk only):
 *   controlGroups — device control groups (homogeneous subgroups); not on rainmaker-base-sdk or rainmaker-matter-sdk
 *   secondaryGroupManagement — secondary users get RainMaker Neo's group-management surface:
 *   browse/manage rooms (listing, rename, delete-if-empty) and rename the home
 *   (backend grants `group:update` + subgroup permissions to secondary access;
 *   classic RM keeps group/room management primary-only)
 */
export type FeatureKey =
  | 'scenes'
  | 'schedules'
  | 'automations'
  | 'localControl'
  | 'notifications'
  | 'groupSharing'
  | 'subGroupSharing'
  | 'transferGroupSharing'
  | 'ota'
  | 'aiAgent'
  | 'thirdPartyAuth'
  | 'voiceAssistants'
  | 'controlGroups'
  | 'secondaryGroupManagement'
  | 'onNetworkProvisioning'
  | 'matterCommissioning'
  | 'backendSelector';

/**
 * Maps each FeatureKey to its corresponding key in the features block
 * of Constants.expoConfig.extra.features (set in app.config.ts).
 */
const ENV_KEY_MAP: Record<FeatureKey, string> = {
  scenes:                 'enableScenes',
  schedules:              'enableSchedules',
  automations:            'enableAutomations',
  localControl:           'enableLocalControl',
  notifications:          'enableNotifications',
  groupSharing:           'enableGroupSharing',
  subGroupSharing:        'enableSubGroupSharing',
  transferGroupSharing:   'enableTransferGroupSharing',
  ota:                    'enableOta',
  aiAgent:                'enableAiAgent',
  thirdPartyAuth:         'enableThirdPartyAuth',
  voiceAssistants:        'enableVoiceAssistants',
  controlGroups:          'enableControlGroups',
  secondaryGroupManagement: 'enableSecondaryGroupManagement',
  onNetworkProvisioning:  'enableOnNetworkProvisioning',
  // SDK-capability only: no region/binary env switch, so the SDK map decides.
  matterCommissioning:    'enableMatterCommissioning',
  backendSelector:        'enableBackendSelector',
};

/**
 * Returns the current feature flag state by cascading three disable-only
 * levels:
 *
 *   Level 3 (SDK capability) — hard gate. If the active SDK does not support
 *   a feature, it is disabled regardless of any config.
 *
 *   Level 2 (region availability) — data from the committed region env files
 *   (.env.global.example / .env.cn.example → extra.regionConfigs.<region>.features). E.g.
 *   voice assistants are off in the CN region. Resolved at runtime, so the
 *   single iOS binary follows the region it detects at startup.
 *
 *   Level 1 (binary .env switch) — extra.features from the per-binary .env;
 *   disables what a specific BINARY cannot support (e.g. notifications on the
 *   Android CN build, which ships without FCM).
 *
 * No level can enable what a lower level disabled, with ONE platform exception:
 * notifications are a push-transport capability rather than a region policy, so
 * they stay available on iOS (APNs, every region) regardless of the region /
 * binary ENABLE_NOTIFICATIONS flag — that flag exists to disable the Android CN
 * flavor only. This is a FUNCTION (not a const) so it reads the active SDK,
 * region, and platform at call time.
 */
export function getFeatures(): Record<FeatureKey, boolean> {
  const sdk = getResolvedActiveSdk();
  const binaryEnv = (Constants.expoConfig?.extra?.features || {}) as Record<string, boolean>;
  const regionFeatures = getRegionConfig().features;
  const sdkCaps = SDK_FEATURE_MAP[sdk] ?? {};
  const resolve = (key: FeatureKey): boolean => {
    // Level 3: SDK capability is the hard gate — cannot be overridden upward
    if (sdkCaps[key] === false) return false;
    // Notifications are a per-binary push-transport capability, not a region
    // policy: ENABLE_NOTIFICATIONS=false in .env.cn.example exists only to turn off the
    // Android CN flavor, which ships without Firebase/FCM. iOS ships APNs in
    // every region, so on iOS notifications stay available whenever the SDK
    // allows — the region/binary env disable applies to Android only.
    if (key === 'notifications' && Platform.OS === 'ios') return true;
    // Level 2: region availability (data-driven, from .env.global.example / .env.cn.example)
    if (regionFeatures[ENV_KEY_MAP[key]] === false) return false;
    // Level 1: binary .env switch — can only disable
    if (binaryEnv[ENV_KEY_MAP[key]] === false) return false;
    return true;
  };

  return {
    scenes:                 resolve('scenes'),
    schedules:              resolve('schedules'),
    automations:            resolve('automations'),
    localControl:           resolve('localControl'),
    notifications:          resolve('notifications'),
    groupSharing:           resolve('groupSharing'),
    subGroupSharing:        resolve('subGroupSharing'),
    transferGroupSharing:   resolve('transferGroupSharing'),
    ota:                    resolve('ota'),
    aiAgent:                resolve('aiAgent'),
    thirdPartyAuth:         resolve('thirdPartyAuth'),
    voiceAssistants:        resolve('voiceAssistants'),
    controlGroups:          resolve('controlGroups'),
    secondaryGroupManagement: resolve('secondaryGroupManagement'),
    onNetworkProvisioning:  resolve('onNetworkProvisioning'),
    matterCommissioning:    resolve('matterCommissioning'),
    backendSelector:        resolve('backendSelector'),
  };
}

/**
 * Returns the list of enabled OAuth providers for the Login screen, in
 * display order. Provider availability is fully data-driven per region: the
 * committed region env files list exactly the providers offered there
 * (e.g. CN lists WeChat + Apple, global lists Google + Apple), so no
 * code-level region filtering remains.
 * Returns an empty array when thirdPartyAuth is disabled at any level.
 */
export function getEnabledOAuthProviders(): string[] {
  const f = getFeatures();
  if (!f.thirdPartyAuth) return [];
  return getRegionConfig().features.thirdPartyAuthProviders ?? [];
}
