/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Platform } from "react-native";

import type { ESPCDFDevice, ESPCDFNode } from "@store";
import { getDeviceDisplayName } from "@shared/utils/deviceDisplayName";
import {
  DEVICE_NAME_PROBLEM_MESSAGE_KEYS,
  findDeviceNameProblem,
  getDeviceNameMaxLength,
  saveDeviceName,
} from "@shared/utils/deviceNaming";
import { DEFAULT_MATTER_DEVICE_NAME } from "@shared/utils/constants";

/*
 * Naming the devices of a node just added through Matter. Shared by the
 * "Name your device" screen (Android) and the iOS add, which saves the name
 * typed in Apple's sheet without showing that screen.
 */

/**
 * Whether the app shows its own "Name your device" step after a Matter add.
 * Only on Android: Apple's sheet already asks for the name, Google's never
 * returns one.
 */
export const MATTER_NAME_STEP_SHOWN = Platform.OS !== "ios";

/** Translation key shown when a device is left without a name. */
const NAME_REQUIRED_MESSAGE_KEY = "device.deviceDetails.nameRequired";

/** A device and the name it should get. */
export interface DeviceRename {
  device: ESPCDFDevice;
  name: string;
}

/** The renames to save, or the message key saying why none can be saved. */
export type SetupNamesPlan =
  | { renames: DeviceRename[]; problemKey?: undefined }
  | { problemKey: string; renames?: undefined };

/**
 * The name typed in Apple's sheet; the app's placeholder name does not count.
 * @param name - Name from the commissioning event
 * @returns The typed name, or "" when there is none
 */
export const sheetDeviceName = (name: string | undefined): string =>
  name && name !== DEFAULT_MATTER_DEVICE_NAME ? name.trim() : "";

/**
 * A device's first name on the setup step: the sheet name, else its current name.
 * @param device - Device on the added node
 * @param node - The added node
 * @param sheetName - Result of {@link sheetDeviceName}
 * @returns Name to start from
 */
export const initialSetupName = (
  device: ESPCDFDevice,
  node: ESPCDFNode,
  sheetName: string,
): string => sheetName || getDeviceDisplayName(device, node) || "";

/**
 * Works out which names need saving. Every name is checked before any write,
 * so no name is half saved.
 * @param node - The added node
 * @param namesByDevice - Names keyed by `device.name`
 * @returns The renames, or why the names cannot be saved
 */
export const planSetupNames = (
  node: ESPCDFNode,
  namesByDevice: Record<string, string>,
): SetupNamesPlan => {
  const named = (node.devices ?? []).map((device) => ({
    device,
    name: (namesByDevice[device.name] ?? "").trim(),
  }));
  if (named.some(({ name }) => !name)) {
    return { problemKey: NAME_REQUIRED_MESSAGE_KEY };
  }

  // Compare with the device's current name, not the prefill, or a sheet name that was simply accepted is never saved.
  const renames = named.filter(
    ({ device, name }) => name !== getDeviceDisplayName(device, node).trim(),
  );

  const maxLength = getDeviceNameMaxLength(node);
  const problem = renames
    .map(({ name }) => findDeviceNameProblem(name, maxLength))
    .find((found) => found !== undefined);
  return problem
    ? { problemKey: DEVICE_NAME_PROBLEM_MESSAGE_KEYS[problem] }
    : { renames };
};

/**
 * Saves each rename. A name the device did not take yet is retried by
 * `saveDeviceName` itself.
 * @param node - The added node
 * @param renames - From {@link planSetupNames}
 * @returns False when a name could not be saved (it stays editable in device settings)
 */
export const saveSetupNames = async (
  node: ESPCDFNode,
  renames: DeviceRename[],
): Promise<boolean> => {
  let allSaved = true;
  for (const { device, name } of renames) {
    const result = await saveDeviceName(node, device, name);
    if (result === "failed" || result === "invalid") {
      console.warn(`[matterSetupNames] Could not save name for device ${device.name}`);
      allSaved = false;
    }
  }
  return allSaved;
};
