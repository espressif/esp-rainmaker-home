/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */


import ESPMatterUtilityModule from "../interfaces/ESPMatterUtillityInterface";
import { NativeModules, Platform } from "react-native";

/**
 * Module-local cache of the active matter fabric id. Co-located with its
 * single writer ({@link ESPMatterUtilityAdapter.syncFabricSession}) so the
 * cache is an obvious artifact of the fabric-session sync, and consumed by
 * the matter SDK's `MatterSubscriptionChannel.fabricIdResolver` (wired in
 * `ESPRMMatterBaseSDKAdaptor.initializeSDK`).
 *
 * The fabric id is the 16-hex-character RainMaker fabric id (e.g.
 * `F650F4A3F147C167`), not the compressed Matter fabric id. The native
 * control adapter does its own per-node lookup and ignores the value, but
 * the SDK throws if no resolver is configured — returning the active fabric
 * id satisfies both contracts.
 */
let activeMatterFabricId: string | null = null;

/**
 * @returns The most recently synced active matter fabric id, or `null` if
 *          no fabric has been synced yet for this session.
 */
export function getActiveMatterFabricId(): string | null {
    return activeMatterFabricId;
}

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
  /**
   * Syncs {@link FabricSessionManager} from active-home fabric details for operational discovery.
   * @param params - Fabric metadata from `home.getFabricDetails()` (Android KeyStore must already hold NOC).
   */
  async syncFabricSession(params: {
    groupId: string;
    fabricId: string;
    name?: string;
    matterUserId: string;
    rootCa: string;
    ipk?: string;
    groupCatIdOperate?: string;
    groupCatIdAdmin?: string;
    userCatId?: string;
  }): Promise<void> {
    // Android: `ESPMatterUtilityModule.syncFabricSession` → FabricSessionManager.
    // iOS: `ESPMatterModule.syncFabricSession` → `currentMatterController`.
    const iosFallback: undefined | ((p: typeof params) => Promise<unknown>) =
      Platform.OS === "ios" &&
      typeof NativeModules.ESPMatterModule?.syncFabricSession === "function"
        ? NativeModules.ESPMatterModule.syncFabricSession
        : undefined;

    try {
      if (typeof ESPMatterUtilityModule?.syncFabricSession === "function") {
        await ESPMatterUtilityModule.syncFabricSession(params);
      } else if (iosFallback) {
        await iosFallback(params);
      } else {
        throw new Error("Native module method syncFabricSession not available");
      }
      activeMatterFabricId = params.fabricId || null;
    } catch (error) {
      console.error(
        "[ESPMatterUtilityAdapter] Error syncing fabric session:",
        error
      );
      throw error;
    }
  },
};
