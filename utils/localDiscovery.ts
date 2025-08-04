/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPRMEventType } from "@espressif/rainmaker-base-sdk";
import { CDF } from "@espressif/rainmaker-base-cdf";


/**
 * Starts local discovery for nodes in the network.
 * 
 * This function initializes local discovery by subscribing to discovery events.
 * When a node is discovered locally, it updates the node's transport configuration
 * and sets up event listeners.
 * 
 * @param {CDF} store - The CDF (Connected Device Framework) store instance that manages application state
 * @returns {void}
 */
const startNodeLocalDiscovery = (store: CDF) => {
  // Listen to local discovery events
  store.userStore.user?.subscribe(
    ESPRMEventType.localDiscovery,
    (event: any) => {
      store.subscriptionStore.transport.listen(event);
    }
  );
};

export { startNodeLocalDiscovery };