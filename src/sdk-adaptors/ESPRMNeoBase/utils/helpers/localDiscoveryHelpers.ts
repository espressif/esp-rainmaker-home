/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { DeviceEventEmitter, Platform } from "react-native";
import {
  ESPRMNeoEventType,
  ESPRMNeoUser,
  ESPTransportMode,
} from "@espressif/rainmaker-neo-base-sdk";
import { ESPCDF, ESPCDFNodeTransport, handleNodeTransportUpdate } from "@store";
import {
  DISCOVERY_LOST_EVENT,
  MDNS_SERVICE_TYPES_RAINMAKER_LOCAL_CTRL,
  PLATFORM_ANDROID,
} from "@shared/utils/constants";
import ESPLocalControlAdapter from "@/src/native-adaptors/implementations/ESPLocalControlAdapter";
import { EspLocalDiscoveryAdapter } from "@native-adaptors/implementations/ESPDiscoveryAdapter";
import { onWifiLost } from "@native-adaptors/utils/wifiState";

const withoutTrailingDot = (serviceType: string): string =>
  serviceType.replace(/\.$/, "");

/**
 * Whether a lost event is for a RainMaker local-control service (the same
 * check the CDF removal in `localDiscovery` makes).
 * @param serviceType - Service type from the native event, if any.
 * @returns True when the local route should go.
 */
const isRainmakerLocalCtrlLoss = (serviceType: string | undefined): boolean =>
  !serviceType ||
  MDNS_SERVICE_TYPES_RAINMAKER_LOCAL_CTRL.some(
    (type) => withoutTrailingDot(type) === withoutTrailingDot(serviceType),
  );

/**
 * Removes the local route from the `_raw` the CDF store holds for a node.
 * CDF's `applyRegisteredTransports` swaps `_raw` for a plain copy when it
 * merges a found local route, so the sync callback clears only the live SDK
 * node. The copy kept the old LAN address, and the next node refresh copied
 * it back onto the fresh SDK node: writes went over the LAN with Wi-Fi off.
 * @param nodeId - The node that left the local network.
 */
function dropLocalRouteFromStoredRawNode(nodeId: string): void {
  const raw = ESPCDF.instance?.nodeStore?.getNodeById?.(nodeId)?._raw as
    | { availableTransports?: Record<string, unknown> }
    | undefined;
  if (raw?.availableTransports?.[ESPTransportMode.local]) {
    delete raw.availableTransports[ESPTransportMode.local];
  }
}

/**
 * Starts RMNeo LAN discovery against the new transport-aware SDK.
 *
 * Discovery is driven through the SDK's user event-subscription API
 * ({@link ESPRMNeoUser.subscribe}), which uses the registered
 * `ESPLocalDiscoveryAdapter` and delivers standardized `ESPDiscoveredNodeData`
 * (`{ nodeId, transportDetails: { type: "local", metadata: { baseUrl,
 * protocol, capabilities? } } }`).
 *
 * The SDK browses `_esp_rmaker_ctrl._tcp` (RainMaker Neo firmware) and
 * tags each hit with `protocol: "rmaker_local_ctrl"`, which is how the SDK's
 * transport layer picks its local-control implementation — so the whole
 * metadata bag must survive the CDF round-trip (see the
 * `AVAILABLE_TRANSPORTS` case in `nodeHelpers`). Nodes advertising only
 * `ch_resp` in their `cap` TXT record are filtered out by the SDK, since they
 * serve on-network association rather than param control.
 *
 * Each hit is forwarded to the CDF store (`cdfCallback`, wired to
 * `subscriptionStore.transport.listen`). The CDF store is the single source of
 * truth for transport state: it updates the `ESPCDFNode`'s `availableTransports`
 * and emits an `availableTransportsChanged` property change, which the node's
 * sync callback (see `transformToESPCDFNode`) mirrors onto the raw
 * `ESPRMNeoNode` via `addTransport`/`removeTransport`. So this module
 * feeds CDF and does not add routes to the raw node itself; on a loss it only
 * clears the store's stale `_raw` copy (see `dropLocalRouteFromStoredRawNode`).
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
      const { nodeId, serviceType } =
        (payload as { nodeId?: string; serviceType?: string }) ?? {};
      if (!nodeId) return;
      console.log("[Discovery_Lost_Event] nodeId:", nodeId);
      // Best-effort: evict the native local-control cache (session/PoP/IP).
      // The CDF transport removal (-> sync callback -> removeLocalTransport)
      // is driven by the localDiscovery lost handler.
      void ESPLocalControlAdapter.disconnect(nodeId);
      if (isRainmakerLocalCtrlLoss(serviceType)) {
        dropLocalRouteFromStoredRawNode(nodeId);
      }
    },
  );

  // Android reports a node lost only seconds after Wi-Fi goes, and its local
  // client keeps sending to the LAN address meanwhile. iOS refuses that at once.
  const stopWifiWatch =
    Platform.OS === PLATFORM_ANDROID
      ? onWifiLost(() => {
          dropAllLocalRoutes();
          // A fresh browse reports the boards again once Wi-Fi is back.
          for (const serviceType of MDNS_SERVICE_TYPES_RAINMAKER_LOCAL_CTRL) {
            void EspLocalDiscoveryAdapter.restartDiscoveryForType(serviceType);
          }
        })
      : () => {};

  return () => {
    user.unsubscribe(ESPRMNeoEventType.localDiscovery);
    lostSubscription.remove();
    stopWifiWatch();
  };
}

/** Removes every node's local route, as a loss on the network would. */
function dropAllLocalRoutes(): void {
  const store = ESPCDF.instance;
  for (const node of store?.nodeStore?.nodesList ?? []) {
    if (!node.availableTransports?.[ESPCDFNodeTransport.LOCAL]) continue;
    console.log("[localDiscovery] Wi-Fi lost; local route dropped for", node.id);
    handleNodeTransportUpdate(
      store,
      node.id,
      { type: ESPCDFNodeTransport.LOCAL, metadata: {} },
      "remove",
    );
    dropLocalRouteFromStoredRawNode(node.id);
    void ESPLocalControlAdapter.disconnect(node.id);
  }
}
