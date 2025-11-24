/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { NativeModules } from "react-native";

interface ESPMatterUtilityInterface {
  /**
   * Checks if a user NOC is available for the given fabric.
   * @returns boolean - true if a user NOC is available for the given fabric, false otherwise
   */
  isUserNocAvailableForFabric(fabricId: string): Promise<boolean>;
  /**
   * Stores pre-commissioning information (user NOC + fabric metadata)
   */
  storePrecommissionInfo(params: {
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
  }): Promise<void>;
}

const { ESPMatterUtilityModule } = NativeModules;

if (!ESPMatterUtilityModule) {
  console.error(
    "ESPMatterUtilityModuleInterface is not available in NativeModules!"
  );
}

export default ESPMatterUtilityModule as ESPMatterUtilityInterface;
