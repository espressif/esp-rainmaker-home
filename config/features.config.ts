/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import Constants from 'expo-constants';
import { getResolvedActiveSdk, SDK_FEATURE_MAP } from '@config/sdk.config';

/**
 * All controllable feature keys in the application.
 *
 * Essential (always enabled, not configurable):
 *   provisioning, deviceManagement, accountDeletion
 *
 * SDK-gated (RMNG = false):
 *   scenes, schedules, localControl, notifications, groupSharing, subGroupSharing, transferGroupSharing, ota
 *
 * Both SDKs supported (env-only control):
 *   automations, aiAgent, thirdPartyAuth, voiceAssistants
 *
 * SDK-gated (RMNG / rmng-base-sdk only):
 *   controlGroups — device control groups (homogeneous subgroups); not on rainmaker-base-sdk or rainmaker-matter-sdk
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
  | 'onNetworkProvisioning';

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
  onNetworkProvisioning:  'enableOnNetworkProvisioning',
};

/**
 * Returns the current feature flag state by cascading two levels:
 *
 *   Level 2 (SDK capability) — hard gate. If the active SDK does not support
 *   a feature, it is disabled regardless of the .env setting.
 *
 *   Level 1 (.env switch) — can only disable a feature that the SDK supports.
 *   It cannot enable a feature the SDK does not support.
 *
 * This is a FUNCTION (not a const) so it reads the active SDK at call time,
 * making it safe for runtime SDK switching.
 */
export function getFeatures(): Record<FeatureKey, boolean> {
  const sdk = getResolvedActiveSdk();
  const env = (Constants.expoConfig?.extra?.features || {}) as Record<string, boolean>;
  const sdkCaps = SDK_FEATURE_MAP[sdk] ?? {};
  const resolve = (key: FeatureKey): boolean => {
    // Level 2: SDK capability is the hard gate — cannot be overridden upward
    if (sdkCaps[key] === false) return false;
    // Level 1: .env switch — can only disable, never unlock what SDK blocks
    if (env[ENV_KEY_MAP[key]] === false) return false;
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
    onNetworkProvisioning:  resolve('onNetworkProvisioning'),
  };
}

/**
 * Returns the list of enabled OAuth providers for the Login screen.
 * Returns an empty array when thirdPartyAuth is disabled at either level.
 */
export function getEnabledOAuthProviders(): string[] {
  const f = getFeatures();
  if (!f.thirdPartyAuth) return [];
  return (Constants.expoConfig?.extra?.features?.thirdPartyAuthProviders || []) as string[];
}
