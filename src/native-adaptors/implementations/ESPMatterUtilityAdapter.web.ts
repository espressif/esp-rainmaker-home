/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { rejectWebUnsupported } from "@native-adaptors/utils/webPlatform";

let activeMatterFabricId: string | null = null;

/**
 * @returns The most recently synced active matter fabric id, or null on web
 */
export function getActiveMatterFabricId(): string | null {
  return activeMatterFabricId;
}

/** No-op Matter utility adaptor for web */
export const ESPMatterUtilityAdapter = {
  isUserNocAvailableForFabric: async (_fabricId: string): Promise<boolean> =>
    false,
  storePrecommissionInfo: async (): Promise<void> =>
    rejectWebUnsupported("Matter utility"),
  syncFabricSession: async (params: {
    groupId: string;
    fabricId: string;
    name?: string;
    matterUserId: string;
    rootCa: string;
    ipk?: string;
    groupCatIdOperate?: string;
    groupCatIdAdmin?: string;
    userCatId?: string;
  }): Promise<void> => {
    activeMatterFabricId = params.fabricId || null;
  },
};

export default ESPMatterUtilityAdapter;
