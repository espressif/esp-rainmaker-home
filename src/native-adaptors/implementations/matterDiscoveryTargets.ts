/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { NativeModules, Platform } from "react-native";

/** Matter node ids (hex) the CHIP discovery module should probe on the LAN. */
let matterDiscoveryTargetNodeIds: string[] = [];

/**
 * Updates the Matter node id list used by {@link matterLocalDiscoveryAdapter} when starting
 * CHIP operational discovery on Android.
 * @param nodeIds - Lowercase hex Matter node ids from the active Matter home.
 */
function setMatterDiscoveryTargetNodeIds(nodeIds: string[]): void {
  matterDiscoveryTargetNodeIds = [...nodeIds];
}

/**
 * Returns the current Matter discovery target node ids.
 * @returns Hex Matter node ids to probe.
 */
function getMatterDiscoveryTargetNodeIds(): readonly string[] {
  return matterDiscoveryTargetNodeIds;
}

/**
 * Syncs target node ids to in-memory state and the Android CHIP discovery module.
 * @param nodeIds - Hex Matter node ids from the active Matter home.
 */
function syncMatterDiscoveryTargetNodeIds(nodeIds: string[]): void {
  setMatterDiscoveryTargetNodeIds(nodeIds);
  if (
    Platform.OS === "android" &&
    typeof NativeModules.MatterDiscoveryModule?.setTargetMatterNodeIds ===
      "function"
  ) {
    NativeModules.MatterDiscoveryModule.setTargetMatterNodeIds(nodeIds);
  }
}

export {
  getMatterDiscoveryTargetNodeIds,
  setMatterDiscoveryTargetNodeIds,
  syncMatterDiscoveryTargetNodeIds,
};
