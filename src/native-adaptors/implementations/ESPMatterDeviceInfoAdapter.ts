/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/*
 * A Matter node's name and firmware version (the Basic Information cluster).
 * Cluster ids stay here so callers never need them. On web every call fails
 * quietly, like ESPMatterControlAdapter.
 */

import type { ESPMatterDeviceInfoAdapterInterface } from "../contracts/matterDeviceInfo";
import { ESPMatterControlAdapter } from "./ESPMatterControlAdapter";

const BASIC_INFORMATION_CLUSTER_ID = 0x0028;
const NODE_LABEL_ATTRIBUTE_ID = 0x0005;
const SOFTWARE_VERSION_STRING_ATTRIBUTE_ID = 0x000a;
const SOFTWARE_VERSION_ATTRIBUTE_ID = 0x0009;
/** Basic Information lives on the root endpoint. */
const ROOT_ENDPOINT_ID = 0;

/** Longest name the Matter spec allows, counted in UTF-8 bytes. */
export const MATTER_NODE_LABEL_MAX_LENGTH = 32;

export const ESPMatterDeviceInfoAdapter: ESPMatterDeviceInfoAdapterInterface = {
  /**
   * Writes the device name over the local network.
   * @param matterNodeId - Matter node id of the device
   * @param name - New name, sent as is: cutting it here would leave the
   *   device and the cloud with different names, so callers check the length
   * @returns True when the device accepted the name
   */
  async writeDeviceName(matterNodeId: string, name: string): Promise<boolean> {
    const result = await ESPMatterControlAdapter.write(
      matterNodeId,
      ROOT_ENDPOINT_ID,
      BASIC_INFORMATION_CLUSTER_ID,
      NODE_LABEL_ATTRIBUTE_ID,
      name,
    );
    return Boolean(result?.success);
  },

  /**
   * Reads the firmware version: the display text if set, else the number,
   * which is all some firmware fills in.
   * @param matterNodeId - Matter node id of the device
   * @returns Version for display, or undefined when the device does not answer
   */
  async readFirmwareVersion(matterNodeId: string): Promise<string | undefined> {
    const asText = await ESPMatterControlAdapter.read(
      matterNodeId,
      ROOT_ENDPOINT_ID,
      BASIC_INFORMATION_CLUSTER_ID,
      SOFTWARE_VERSION_STRING_ATTRIBUTE_ID,
    );
    if (
      asText?.success &&
      typeof asText.value === "string" &&
      asText.value.trim()
    ) {
      return asText.value.trim();
    }

    const asNumber = await ESPMatterControlAdapter.read(
      matterNodeId,
      ROOT_ENDPOINT_ID,
      BASIC_INFORMATION_CLUSTER_ID,
      SOFTWARE_VERSION_ATTRIBUTE_ID,
    );
    return asNumber?.success && asNumber.value != null
      ? String(asNumber.value)
      : undefined;
  },
};
