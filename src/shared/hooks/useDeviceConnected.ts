/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo } from "react";
import type { ESPCDFNode } from "@store";
import { isDeviceConnected } from "@shared/utils/device";
import { parseBridgedChildParentNodeId } from "@shared/utils/matterLocalReachability";
import { useCDF } from "@shared/hooks/useCDF";

/**
 * Cloud online or LAN-discovered (`local` / `matter_local`) for control UI.
 * Reads `subscriptionStore.registeredTransports` so MobX tracks discovery changes.
 */
export function useDeviceConnected(node: ESPCDFNode | undefined): boolean {
  const { store } = useCDF();
  const nodeId = node?.id;

  const storeNode = nodeId
    ? (store.nodeStore.nodesByIDMap[nodeId] ?? node)
    : undefined;
  const registeredTransports = nodeId
    ? store.subscriptionStore.registeredTransports[nodeId]
    : undefined;
  const bridgeParentNodeId = nodeId
    ? parseBridgedChildParentNodeId(nodeId)
    : null;
  const bridgeParentTransports = bridgeParentNodeId
    ? store.subscriptionStore.registeredTransports[bridgeParentNodeId]
    : undefined;

  return useMemo(
    () =>
      storeNode
        ? isDeviceConnected(
            storeNode,
            registeredTransports,
            bridgeParentTransports,
          )
        : false,
    [storeNode, registeredTransports, bridgeParentTransports],
  );
}
