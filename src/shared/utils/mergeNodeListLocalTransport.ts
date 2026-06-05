/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ESPCDFNode,
  ESPCDFNodesByIDMap,
  ESPCDFNodeTransport,
  ESPCDFTransportConfig,
} from "@store";
import { MATTER_LOCAL_TRANSPORT_KEY } from "@shared/utils/constants";

/**
 * Decide whether a previously-stored transport entry should survive a cloud
 * refresh. Locally-discovered transports (mDNS rainmaker LOCAL, Matter
 * operational LAN, future Thread / BLE-bridge transports, etc.) are not
 * known to the cloud — applying a cloud-only refresh blindly would wipe
 * them. Preserved transports are identified by well-known local transport
 * keys/types (`ESPCDFNodeTransport.LOCAL`, `matter_local`, etc.) and must
 * carry non-empty discovery metadata.
 */
function shouldCarryOver(
  key: string,
  entry: ESPCDFTransportConfig | undefined,
): boolean {
  if (!entry) return false;
  if (key === ESPCDFNodeTransport.LOCAL || entry.type === ESPCDFNodeTransport.LOCAL) {
    const baseUrl = entry.metadata?.baseUrl;
    return baseUrl != null && String(baseUrl).trim().length > 0;
  }
  if (
    key === MATTER_LOCAL_TRANSPORT_KEY ||
    entry.type === MATTER_LOCAL_TRANSPORT_KEY
  ) {
    const host = entry.metadata?.host;
    return host != null && String(host).trim().length > 0;
  }
  return false;
}

/**
 * Re-applies any locally-discovered transports onto an incoming node list
 * when the API refresh only carries cloud-managed data. Keeps "Available on
 * WLAN" stable until either the discovery layer emits a service-lost or a
 * new discovery update overwrites the entry.
 *
 * Use at sync boundaries before `nodeStore.setNodesList`, not inside the
 * store.
 */
export function mergeLocalTransportFromNodeMap(
  incomingNodes: ESPCDFNode[],
  previousById: ESPCDFNodesByIDMap,
  registeredByNodeId: Record<
    string,
    Partial<Record<string, ESPCDFTransportConfig>>
  > = {},
): ESPCDFNode[] {
  return incomingNodes.map((node) => {
    const previous = previousById[node.id];
    const prevTransports = previous?.availableTransports as
      | Record<string, ESPCDFTransportConfig>
      | undefined;

    const carryOver: Record<string, ESPCDFTransportConfig> = {};

    if (prevTransports) {
      for (const key of Object.keys(prevTransports)) {
        const entry = prevTransports[key];
        if (shouldCarryOver(key, entry)) {
          carryOver[key] = entry as ESPCDFTransportConfig;
        }
      }
    }

    const registered = registeredByNodeId[node.id];
    if (registered) {
      for (const key of Object.keys(registered)) {
        const entry = registered[key];
        if (entry) {
          carryOver[key] = entry;
        }
      }
    }

    if (Object.keys(carryOver).length === 0) return node;

    const merged = {
      ...node,
      availableTransports: {
        ...(node.availableTransports || {}),
        ...carryOver,
      },
    } as unknown as ESPCDFNode;
    const raw = merged._raw as Record<string, unknown> | undefined;
    if (raw && typeof raw === "object") {
      const prevAt = raw.availableTransports as Record<string, unknown> | undefined;
      merged._raw = {
        ...raw,
        availableTransports: { ...(prevAt || {}), ...carryOver },
      } as typeof merged._raw;
    }
    return merged;
  });
}
