/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { DeviceEventEmitter } from "react-native";
import {
  ESPCDF,
  ESPCDFEventType,
  ESPCDFNodeTransport,
} from "@store";
import {
  DISCOVERY_LOST_EVENT,
  MDNS_SERVICE_TYPES_RAINMAKER_LOCAL_CTRL,
} from "@shared/utils/constants";
import { handleNodeTransportUpdate } from "@store";

/** Normalized mDNS type key (native may drop the trailing dot). */
const normalizeServiceType = (serviceType: string): string =>
  serviceType.replace(/\.$/, "");

const RAINMAKER_LOCAL_CTRL_TYPES = new Set(
  MDNS_SERVICE_TYPES_RAINMAKER_LOCAL_CTRL.map(normalizeServiceType),
);

let discoveryLostSubscription: ReturnType<
  typeof DeviceEventEmitter.addListener
> | null = null;
let discoveryStoreRef: ESPCDF | null = null;

/**
 * Starts local discovery for nodes in the network.
 *
 * This function initializes local discovery by subscribing to discovery events.
 * When a node is discovered locally, it updates the node's transport configuration
 * and sets up event listeners.
 * @param store - The CDF (Connected Device Framework) store instance that manages application state
 */
const startNodeLocalDiscovery = (store: ESPCDF) => {
  discoveryStoreRef = store;
  if (!discoveryLostSubscription) {
    discoveryLostSubscription = DeviceEventEmitter.addListener(
      DISCOVERY_LOST_EVENT,
      (payload: { nodeId?: string; serviceType?: string }) => {
        // Multi-browse: only react to RainMaker local-control losses (classic
        // `_esp_local_ctrl` or Neo `_esp_rmaker_ctrl`); Matter losses are
        // handled by `startMatterLocalDiscovery`.
        if (
          payload?.serviceType &&
          !RAINMAKER_LOCAL_CTRL_TYPES.has(
            normalizeServiceType(payload.serviceType),
          )
        ) {
          return;
        }
        const nodeId = payload?.nodeId;
        if (!nodeId || !discoveryStoreRef) return;
        handleNodeTransportUpdate(
          discoveryStoreRef,
          nodeId,
          { type: ESPCDFNodeTransport.LOCAL, metadata: {} },
          "remove"
        );
      }
    );
  }

  const ESPCDFUser = store.userStore.user;
  ESPCDFUser?.subscribeToEvent(
    ESPCDFEventType.localDiscovery,
    (event: any) => {
      store.subscriptionStore.transport.listen(event);
    }
  );
};

export { startNodeLocalDiscovery };