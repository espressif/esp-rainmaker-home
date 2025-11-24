/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import ESPMatterUtilityModule from "../interfaces/ESPMatterUtillityInterface";

export const ESPMatterUtilityAdapter = {
  /**
   * Checks if a user NOC is available for the given fabric.
   * @returns Promise<boolean> - true if a user NOC is available for the given fabric, false otherwise
   */
  async isUserNocAvailableForFabric(fabricId: string): Promise<boolean> {
    if (!ESPMatterUtilityModule?.isUserNocAvailableForFabric) {
      throw new Error(
        "Native module method isUserNocAvailableForFabric not available"
      );
    }

    try {
      return await ESPMatterUtilityModule.isUserNocAvailableForFabric(fabricId);
    } catch (error) {
      console.error(
        "[ESPMatterUtilityAdapter] Error checking if user NOC is available for fabric:",
        error
      );
      throw error;
    }
  },
  /**
   * Stores pre-commissioning information (user NOC + fabric metadata)
   * @param params - The parameters for storing pre-commissioning information
   * @returns Promise<void> - void
   */
  async storePrecommissionInfo(params: {
    groupId: string;
    fabricId: string;
    name?: string;
    userNoc: string;
    matterUserId: string;
    rootCa: string;
    ipk?: string;
    groupCatIdOperate?: string;
    groupCatIdAdmin?: string;
    userCatId?: string;
  }): Promise<void> {
    if (!ESPMatterUtilityModule?.storePrecommissionInfo) {
      throw new Error(
        "Native module method storePrecommissionInfo not available"
      );
    }

    try {
      await ESPMatterUtilityModule.storePrecommissionInfo(params);
    } catch (error) {
      console.error(
        "[ESPMatterUtilityAdapter] Error storing pre-commission info:",
        error
      );
      throw error;
    }
  },
};
