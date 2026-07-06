/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { registerRmngNcfgRefreshHooks } from "@sdk-adaptors/shared/rmngNcfgRefreshHooks";
import { isBridgeParentCdfNode } from "./bridge/rmngMatterBridgeKind";
import { refreshBridgedChildrenAfterParentNcfg } from "./bridge/rmngMatterBridgeNcfg";
import {
  clearRmngMatterEndpointShadowDedupe,
  seedRmngMatterEndpointShadowCache,
} from "./bridge/utils/rmngMatterShadowDedupe";
import {
  mergeRmngEndpointParamTrees,
  stashHybridBuildParams,
} from "./utils/rmngMatterHybridBuildParams";

/** Wires hybrid/bridge ncfg refresh into the base shadow-version handler. */
export function registerRmngMatterNcfgRefreshHooks(): void {
  registerRmngNcfgRefreshHooks({
    onRefreshStart: clearRmngMatterEndpointShadowDedupe,
    mergeShadowParams: mergeRmngEndpointParamTrees,
    onShadowParamsMerged: stashHybridBuildParams,
    onRefreshComplete: async (ctx) => {
      const { nodeId, mergedShadowParams, refreshedNode } = ctx;
      if (mergedShadowParams) {
        seedRmngMatterEndpointShadowCache(nodeId, mergedShadowParams);
      }
      if (refreshedNode && isBridgeParentCdfNode(refreshedNode)) {
        await refreshBridgedChildrenAfterParentNcfg(nodeId);
      }
    },
  });
}
