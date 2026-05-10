/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { DeviceEventEmitter } from "react-native";
import { ESPRMNGBase } from "@espressif/rmng-base-sdk";
import { ESPCDFNodeTransport } from "@store";
import {
    DISCOVERY_LOST_EVENT,
    MDNS_DOMAIN_LOCAL,
    MDNS_SERVICE_TYPE_ESP_LOCAL_CTRL,
} from "@shared/utils/constants";
import { EspLocalDiscoveryAdapter } from "@native-adaptors/implementations/ESPDiscoveryAdapter";

/**
 * Starts RMNG LAN discovery: mDNS → `ESPRMNGBase.setNodeBaseUrl`, CDF callback for UI,
 * and clears base URL on `DISCOVERY_LOST_EVENT`.
 *
 * @returns Combined teardown (discovery listener + lost-event subscription).
 */
export async function startRmngLocalDiscoverySubscription(
    cdfCallback: (event: unknown) => void,
): Promise<() => void> {
    const wrappedCallback = (raw: { nodeId?: string; baseUrl?: string }) => {
        const { nodeId, baseUrl } = raw ?? {};
        if (nodeId && baseUrl) {
            ESPRMNGBase.setNodeBaseUrl(nodeId, baseUrl);
        }
        cdfCallback({
            nodeId,
            transportDetails: {
                type: ESPCDFNodeTransport.LOCAL,
                metadata: { baseUrl },
            },
        });
    };

    const stopDiscoveryUpdates = await EspLocalDiscoveryAdapter.startDiscovery(wrappedCallback, {
        serviceType: MDNS_SERVICE_TYPE_ESP_LOCAL_CTRL,
        domain: MDNS_DOMAIN_LOCAL,
    });

    const lostSubscription = DeviceEventEmitter.addListener(DISCOVERY_LOST_EVENT, (payload: unknown) => {
        const nodeId = (payload as { nodeId?: string })?.nodeId;
        if (nodeId) {
            ESPRMNGBase.clearNodeBaseUrl(nodeId);
        }
    });

    return () => {
        stopDiscoveryUpdates?.();
        lostSubscription.remove();
    };
}
