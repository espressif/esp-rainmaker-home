/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFNode } from "@store";
import { isDeviceConnected } from "@shared/utils/device";
import { parseBridgedChildParentNodeId } from "@shared/utils/matterLocalReachability";
import { useCDF } from "@shared/hooks/useCDF";
import { mqttTransportUiState } from "@shared/state/mqttTransportUiState";

/**
 * Cloud online or LAN-discovered (`local` / `matter_local`) for control UI.
 * Reads `subscriptionStore.registeredTransports` so MobX tracks discovery changes.
 * Also reads `mqttTransportUiState.connected` so observers re-render when the
 * app MQTT session flips (`isDeviceConnected` consults that flag internally).
 */
export function useDeviceConnected(node: ESPCDFNode | undefined): boolean {
  const { store } = useCDF();
  const nodeId = node?.id;
  // MobX tracking for transport session (used inside isDeviceConnected).
  void mqttTransportUiState.connected;

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

  return storeNode
    ? isDeviceConnected(
        storeNode,
        registeredTransports,
        bridgeParentTransports,
      )
    : false;
}
