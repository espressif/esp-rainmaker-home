/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { List, RefreshCw } from "lucide-react-native";
import type { TFunction } from "i18next";
import { getFeatures } from "@config/features.config";
import {
  ESPRM_NAME_PARAM_TYPE,
  MATTER_METADATA_DEVICE_NAME_KEY,
  MATTER_METADATA_KEY,
  RMAKER_USER_AUTH_UPDATE_RESULT_SKIPPED_NO_REFRESH_TOKEN,
  RMAKER_USER_AUTH_UPDATE_RESULT_UPDATED,
  SUCESS,
} from "@shared/utils/constants";
import { getSubDeviceInitialDisplayName } from "@shared/utils/device";
import { getMatterControllerConfig } from "@shared/utils/matterController";
import { getNodeRmakerUserAuthConfig } from "@shared/utils/userAuthServiceHelper";
import type { RmakerUserAuthUpdateResult } from "@shared/utils/userAuthServiceHelper";
import {
  SETTINGS_QUICK_ACTION_AUTH_TOKEN,
  SETTINGS_QUICK_ACTION_DEVICE_LIST,
  SETTINGS_SECTION_NAME,
  SAVE_DEVICE_NAME_STATUS_FAILED,
  SAVE_DEVICE_NAME_STATUS_NO_PARAM,
  SAVE_DEVICE_NAME_STATUS_SUCCESS,
  RMAKER_AUTH_TOAST_KIND_UPDATED,
  RMAKER_AUTH_TOAST_KIND_NO_REFRESH_TOKEN,
  RMAKER_AUTH_TOAST_KIND_FAILED,
} from "@features/control/constants";
import type { SettingsQuickActionItem } from "@features/control/components";
import { getPrimaryHomogeneousDeviceType } from "@features/group/utils/controlGroupHelpers";
import {
  ESPCDFDevice,
  ESPCDFDeviceParam,
  ESPCDFNode,
} from "@store";

/** Default settings sections before device-specific filtering. */
export const SETTINGS_DEFAULT_SECTIONS = [
  SETTINGS_SECTION_NAME,
  "info",
  "ota",
  "sharing",
  "remove",
] as const;

/** Outcome of {@link saveDeviceDisplayName}. */
export type SaveDeviceDisplayNameOutcome =
  | typeof SAVE_DEVICE_NAME_STATUS_SUCCESS
  | typeof SAVE_DEVICE_NAME_STATUS_NO_PARAM
  | typeof SAVE_DEVICE_NAME_STATUS_FAILED;

/** Toast message kind for a RainMaker user-auth token update. */
export type RmakerAuthUpdateToastKind =
  | typeof RMAKER_AUTH_TOAST_KIND_UPDATED
  | typeof RMAKER_AUTH_TOAST_KIND_NO_REFRESH_TOKEN
  | typeof RMAKER_AUTH_TOAST_KIND_FAILED;

/**
 * Resolves a node from the store map using the route node id.
 * @param nodesByIDMap - Live node index from the CDF store
 * @param nodeId - Route param node id
 * @returns Matching node or undefined
 */
export const resolveSettingsNode = (
  nodesByIDMap: Record<string, ESPCDFNode> | undefined,
  nodeId: string | undefined,
): ESPCDFNode | undefined => {
  if (!nodeId) {
    return undefined;
  }
  return nodesByIDMap?.[nodeId];
};

/**
 * Resolves the sub-device referenced by the settings route `device` param.
 * @param node - Parent CDF node
 * @param deviceParam - Route param device name
 * @returns Matching sub-device or undefined
 */
export const resolveSettingsDevice = (
  node: ESPCDFNode | undefined,
  deviceParam: string | undefined,
): ESPCDFDevice | undefined => {
  if (!deviceParam || !node?.devices) {
    return undefined;
  }
  return node.devices.find((entry) => entry.name === deviceParam);
};

/**
 * Finds the writable/display name param on a sub-device.
 * @param device - CDF sub-device
 * @returns Name param or undefined
 */
export const getDeviceNameParam = (
  device: ESPCDFDevice | undefined,
): ESPCDFDeviceParam | undefined =>
  device?.params?.find(
    (param) =>
      param.type === ESPRM_NAME_PARAM_TYPE &&
      param.properties?.includes("write"),
  ) as
    | ESPCDFDeviceParam
    | undefined;

/**
 * Computes the display label for the settings name field.
 * @param device - CDF sub-device
 * @param node - Parent CDF node
 * @returns Human-readable device name
 */
export const getSettingsDisplayName = (
  device: ESPCDFDevice | undefined,
  node: ESPCDFNode | undefined,
): string => {
  if (!device || !node) {
    return "";
  }
  return getSubDeviceInitialDisplayName(device, node);
};

/**
 * Whether settings actions should be disabled for the current user/session.
 * @param isPrimary - Node primary-user flag
 * @param isConnected - Node connectivity flag
 * @returns True when the user cannot edit settings
 */
export const isSettingsDisabled = (
  isPrimary: boolean,
  isConnected: boolean,
): boolean => !isPrimary || !isConnected;

/**
 * Reads the optional readme URL from node config info.
 * @param node - CDF node
 * @returns Readme URL or null
 */
export const getNodeReadmeUrl = (
  node: ESPCDFNode | undefined,
): string | null =>
  (node?.nodeConfig?.info as { readme?: string } | undefined)?.readme ?? null;

/**
 * Whether the control group settings field should appear on device settings.
 * @param node - CDF node
 * @param isPrimary - Node primary-user flag
 * @returns True when control groups are enabled and the user can view the field
 */
export const shouldShowAddToControlGroup = (
  node: ESPCDFNode | undefined,
  isPrimary: boolean,
): boolean =>
  Boolean(getFeatures().controlGroups && isPrimary && node);

/**
 * Whether a node can be assigned to a control group (homogeneous device type).
 * @param node - CDF node
 * @returns True when the node has a single compatible device type
 */
export const canNodeBeAddedToControlGroup = (
  node: ESPCDFNode | undefined,
): boolean =>
  Boolean(node && getPrimaryHomogeneousDeviceType(node) !== null);

/**
 * Whether the registration-token quick action should be shown.
 * @param node - CDF node
 * @param isPrimary - Node primary-user flag
 * @returns True when the user can push a new auth token
 */
export const shouldShowUpdateAuthToken = (
  node: ESPCDFNode | undefined,
  isPrimary: boolean,
): boolean => Boolean(isPrimary && getNodeRmakerUserAuthConfig(node).canUpdate);

/**
 * Whether the Matter device-list quick action should be shown.
 * @param node - CDF node
 * @param isPrimary - Node primary-user flag
 * @returns True when MTCtlCMD is writable on the Matter controller service
 */
export const shouldShowUpdateDeviceList = (
  node: ESPCDFNode | undefined,
  isPrimary: boolean,
): boolean => {
  if (!isPrimary) {
    return false;
  }
  return getMatterControllerConfig(node).canUpdateDeviceList;
};

/**
 * Maps a RainMaker user-auth update result to a toast category for the hook.
 * @param result - Outcome from {@link updateRmakerUserAuthForNode}
 * @returns Toast kind for i18n lookup in the hook
 */
export const resolveRmakerAuthUpdateToastKind = (
  result: RmakerUserAuthUpdateResult,
): RmakerAuthUpdateToastKind => {
  if (result === RMAKER_USER_AUTH_UPDATE_RESULT_UPDATED) {
    return RMAKER_AUTH_TOAST_KIND_UPDATED;
  }
  if (result === RMAKER_USER_AUTH_UPDATE_RESULT_SKIPPED_NO_REFRESH_TOKEN) {
    return RMAKER_AUTH_TOAST_KIND_NO_REFRESH_TOKEN;
  }
  return RMAKER_AUTH_TOAST_KIND_FAILED;
};

/**
 * Whether a node delete API response indicates success.
 * @param status - Status field from the delete call
 * @returns True when the node was removed
 */
export const isNodeDeleteSuccess = (status: unknown): boolean =>
  status === SUCESS || String(status ?? "").toLowerCase() === SUCESS;

/**
 * Persists an edited device display name via the writable name param or
 * Matter metadata. A writable `esp.param.name` wins whenever the device
 * exposes one; Matter devices without that param fall back to the
 * `updateMetadata` rename.
 * @param node - Parent CDF node
 * @param device - Target sub-device (optional for Matter metadata-only path)
 * @param name - Trimmed display name to save
 * @returns Outcome so the hook can show the right toast
 */
export const saveDeviceDisplayName = async (
  node: ESPCDFNode,
  device: ESPCDFDevice | undefined,
  name: string,
): Promise<SaveDeviceDisplayNameOutcome> => {
  try {
    const nameParam = getDeviceNameParam(device);

    if (nameParam) {
      await nameParam.setValue(name);
      if (device) {
        device.displayName = name;
      }
      return SAVE_DEVICE_NAME_STATUS_SUCCESS;
    }

    const isMatterDevice = Boolean(
      node.metadata && node.metadata[MATTER_METADATA_KEY],
    );

    if (isMatterDevice) {
      const currentMetadata = node.metadata || {};
      const matterMetadata = currentMetadata[MATTER_METADATA_KEY] || {};
      const updatedMetadata = {
        ...currentMetadata,
        [MATTER_METADATA_KEY]: {
          ...matterMetadata,
          [MATTER_METADATA_DEVICE_NAME_KEY]: name,
        },
      };

      await node.updateMetadata(updatedMetadata);
      if (device) {
        device.displayName = name;
      }
      return SAVE_DEVICE_NAME_STATUS_SUCCESS;
    }

    return SAVE_DEVICE_NAME_STATUS_NO_PARAM;
  } catch {
    return SAVE_DEVICE_NAME_STATUS_FAILED;
  }
};

export interface BuildSettingsQuickActionsInput {
  t: TFunction;
  showUpdateAuthToken: boolean;
  showUpdateDeviceList: boolean;
  settingsDisabled: boolean;
  isUpdatingAuthToken: boolean;
  isUpdatingDeviceList: boolean;
  onUpdateAuthToken: () => void;
  onUpdateDeviceList: () => void;
}

/**
 * Builds the horizontal quick-action tiles for device settings.
 * @param input - Visibility flags, handlers, and i18n
 * @returns Ordered quick-action items for {@link SettingsQuickActions}
 */
export const buildSettingsQuickActions = (
  input: BuildSettingsQuickActionsInput,
): SettingsQuickActionItem[] => {
  const {
    t,
    showUpdateAuthToken,
    showUpdateDeviceList,
    settingsDisabled,
    isUpdatingAuthToken,
    isUpdatingDeviceList,
    onUpdateAuthToken,
    onUpdateDeviceList,
  } = input;

  const actions: SettingsQuickActionItem[] = [];

  if (showUpdateAuthToken) {
    actions.push({
      id: SETTINGS_QUICK_ACTION_AUTH_TOKEN,
      label: t("device.settings.updateRegistrationToken"),
      Icon: RefreshCw,
      onPress: onUpdateAuthToken,
      disabled: settingsDisabled,
      loading: isUpdatingAuthToken,
      qaId: "button_update_auth_token",
    });
  }

  if (showUpdateDeviceList) {
    actions.push({
      id: SETTINGS_QUICK_ACTION_DEVICE_LIST,
      label: t("device.settings.updateDeviceList"),
      Icon: List,
      onPress: onUpdateDeviceList,
      disabled: settingsDisabled,
      loading: isUpdatingDeviceList,
      qaId: "button_update_device_list",
    });
  }

  return actions;
};
