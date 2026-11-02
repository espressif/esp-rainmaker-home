/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SDK-neutral contract for the native adapter that reads and writes a Matter
 * node's own details: its name and firmware version. App code depends on
 * this, so it never needs Matter cluster ids or the adapter behind it.
 * Takes Matter node ids only; which CDF node they belong to is decided above
 * this layer.
 */
export interface ESPMatterDeviceInfoAdapterInterface {
  /**
   * Writes the device's own name over the local network.
   * @param matterNodeId - Matter node id of the device
   * @param name - New name, sent as is; callers check the length
   * @returns True when the device accepted the name
   */
  writeDeviceName(matterNodeId: string, name: string): Promise<boolean>;

  /**
   * Reads the device's firmware version.
   * @param matterNodeId - Matter node id of the device
   * @returns Version for display, or undefined when the device does not answer
   */
  readFirmwareVersion(matterNodeId: string): Promise<string | undefined>;
}
