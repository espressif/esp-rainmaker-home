/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { DeviceEventEmitter } from "react-native";
import {
  ESPRMNeoEventType,
  ESPRMNeoUser,
} from "@espressif/rainmaker-neo-base-sdk";
import { DISCOVERY_LOST_EVENT } from "@shared/utils/constants";
import ESPLocalControlAdapter from "@/src/native-adaptors/implementations/ESPLocalControlAdapter";

/**
 * Starts RMNeo LAN discovery against the new transport-aware SDK.
 *
 * Discovery is driven through the SDK's user event-subscription API
 * ({@link ESPRMNeoUser.subscribe}), which uses the registered
 * `ESPLocalDiscoveryAdapter` and delivers standardized `ESPDiscoveredNodeData`
 * (`{ nodeId, transportDetails: { type: "local", metadata: { baseUrl } } }`).
 *
 * Each hit is forwarded to the CDF store (`cdfCallback`, wired to
 * `subscriptionStore.transport.listen`). The CDF store is the single source of
 * truth for transport state: it updates the `ESPCDFNode`'s `availableTransports`
 * and emits an `availableTransportsChanged` property change, which the node's
 * sync callback (see `transformToESPCDFNode`) mirrors onto the raw
 * `ESPRMNeoNode` via `addTransport`/`removeTransport`. So this module
 * does NOT touch the raw node directly — it only feeds CDF.
 *
 * On `DISCOVERY_LOST_EVENT` (the SDK's subscribe delivers "found" only; loss
 * comes from the native discovery module) the CDF-side removal — and thus the
 * raw node's `removeTransport` via the same sync callback — is handled by
 * the `localDiscovery` lost handler. Here we additionally evict the native
 * local-control session cache so a later reconnect re-handshakes with current
 * credentials (covers PoP/IP changes after a factory-reset + re-provision).
 * @param cdfCallback - CDF store sink (wired to `subscriptionStore.transport.listen`).
 * @param user - The authenticated raw `ESPRMNeoUser` that owns the subscription.
 * @returns Combined teardown (SDK unsubscribe + lost-event listener removal).
 */
export async function startRmneoLocalDiscoverySubscription(
  cdfCallback: (event: unknown) => void,
  user: ESPRMNeoUser,
): Promise<() => void> {
  user.subscribe(ESPRMNeoEventType.localDiscovery, (data: unknown) => {
    // Feed the CDF store; the CDF property-change sync in transformToESPCDFNode
    // projects the resulting availableTransports onto the raw ESPRMNeoNode.
    cdfCallback(data);
  });

  const lostSubscription = DeviceEventEmitter.addListener(
    DISCOVERY_LOST_EVENT,
    (payload: unknown) => {
      const nodeId = (payload as { nodeId?: string })?.nodeId;
      if (!nodeId) return;
      console.log("[Discovery_Lost_Event] nodeId:", nodeId);
      // Best-effort: evict the native local-control cache (session/PoP/IP).
      // The CDF transport removal (-> sync callback -> removeLocalTransport)
      // is driven by the localDiscovery lost handler.
      void ESPLocalControlAdapter.disconnect(nodeId);
    },
  );

  return () => {
    user.unsubscribe(ESPRMNeoEventType.localDiscovery);
    lostSubscription.remove();
  };
}
