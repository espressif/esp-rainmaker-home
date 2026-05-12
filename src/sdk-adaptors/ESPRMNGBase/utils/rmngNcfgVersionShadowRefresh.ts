/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { runInAction } from "mobx";
import { ESPCDF } from "@store";
import {
    applyShadowReportedNcfgVersion,
    ESPRMNGNode,
} from "@espressif/rmng-base-sdk";
import { ESPRMNGBaseAdaptorIdentifier } from "@config/sdk.identifiers";
import { applyRefreshedCdfNodeToStore } from "./rmngApplyRefreshedNodeToStore";
import { EspLocalDiscoveryAdapter } from "@native-adaptors/implementations/ESPDiscoveryAdapter";
import {
    MDNS_SERVICE_TYPE_ESP_LOCAL_CTRL,
    MDNS_DOMAIN_LOCAL,
} from "@shared/utils/constants";

/**
 * Extracts params and online status from shadow update payload.
 * Shadow structure: { state: { reported: { params: {...}, online, ncfg_ver } } }
 */
function extractFromShadow(shadow: unknown): {
    params: Record<string, unknown> | undefined;
    isOnline: boolean;
} {
    const reported = (shadow as { state?: { reported?: { params?: Record<string, unknown>; online?: boolean } } })
        ?.state?.reported;
    return {
        params: reported?.params && typeof reported.params === "object" ? reported.params : undefined,
        // Default to true: we received an MQTT update, so device must be connected
        isOnline: reported?.online ?? true,
    };
}

/**
 * Fetches fresh node config via getNodeDetails and replaces in store.
 * Uses addNode (via applyRefreshedCdfNodeToStore) which properly re-attaches
 * the CDF synchronizer for devices/params - matching the provision/sync pattern.
 *
 * @param shadowParams - Params from the shadow update that triggered this refresh.
 *                       Used directly instead of doing a separate getParams request.
 * @param isOnline - Whether the device is online (from the shadow update).
 */
async function performNodeConfigRefresh(
    nodeId: string,
    shadowParams: Record<string, unknown> | undefined,
    isOnline: boolean,
): Promise<void> {
    const root = ESPCDF.instance;
    const storeNode = root?.nodeStore?.getNodeById?.(nodeId);

    const user = root?.userStore?.getAuthorizationEntityForAdaptor(ESPRMNGBaseAdaptorIdentifier);
    if (!user) {
        return;
    }

    // Capture old connectivity status to preserve if shadow doesn't specify
    const oldRaw = storeNode?._raw as ESPRMNGNode | undefined;
    const oldConnectivityStatus = oldRaw?.connectivityStatus;

    if (oldRaw && typeof oldRaw.cleanup === "function") {
        try {
            oldRaw.cleanup();
        } catch {
            /* ignore */
        }
    }

    try {
        const cdfNode = await user.getNodeDetails(nodeId);
        applyRefreshedCdfNodeToStore(cdfNode);

        const newStoreNode = root?.nodeStore?.getNodeById?.(nodeId);
        const newRaw = newStoreNode?._raw as ESPRMNGNode | undefined;

        // Set connectivity status: we received an MQTT update so device is online.
        // If shadow explicitly had online status, use it; otherwise use preserved old status
        // or default to true (we got an MQTT update = device must be connected).
        const newConnectivityStatus = {
            isConnected: isOnline || oldConnectivityStatus?.isConnected || true,
            lastConnectionTimestamp:
                oldConnectivityStatus?.lastConnectionTimestamp ?? Date.now(),
        };

        // Update BOTH the SDK node (_raw) AND the CDF store node's connectivityStatus
        // The CDF node has its own copy that the UI reads.
        // Wrap in runInAction for MobX reactivity.
        runInAction(() => {
            if (newStoreNode) {
                newStoreNode.connectivityStatus = newConnectivityStatus;
            }
            if (newRaw) {
                newRaw.connectivityStatus = newConnectivityStatus;

                // Apply params from shadow if available
                if (shadowParams) {
                    newRaw.params = shadowParams;
                }
            }
        });

        // Restart local discovery to pick up mDNS after device comes online
        try {
            await EspLocalDiscoveryAdapter.stopDiscovery();
            await EspLocalDiscoveryAdapter.startDiscovery(() => {}, {
                serviceType: MDNS_SERVICE_TYPE_ESP_LOCAL_CTRL,
                domain: MDNS_DOMAIN_LOCAL,
            });
        } catch {
            // Local discovery restart failure is non-critical
        }
    } catch {
        // getNodeDetails failure is handled by not updating the store
    }
}

/**
 * If IoT shadow `state.reported` carries a new node config version for this node,
 * refetch config and update CDF nodeStore / group nodeDetails (same transport merge as provision).
 *
 * Extracts params and online status directly from the shadow update.
 * On first sighting of a version for this node, persists it only (baseline).
 */
export async function refreshRmngNodeIfShadowNcfgVersionChanged(
    nodeId: string,
    shadow: unknown,
): Promise<void> {
    const { params, isOnline } = extractFromShadow(shadow);
    await applyShadowReportedNcfgVersion(nodeId, shadow, {
        onNcfgVersionIncreased: () => performNodeConfigRefresh(nodeId, params, isOnline),
    });
}
