/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFTransportConfig } from "@store";
import { ESPCDF } from "@store";
import { MATTER_LOCAL_TRANSPORT_KEY } from "./constants";

/** True when `matter_local` has LAN host/port from operational discovery (not a stub). */
export function isOperationalMatterLocalTransport(
    config?: ESPCDFTransportConfig | null,
): boolean {
    if (!config) return false;
    const meta = config.metadata as Record<string, unknown> | undefined;
    const host = meta?.host;
    const port = meta?.port;
    return (
        typeof host === "string" &&
        host.trim().length > 0 &&
        typeof port === "number"
    );
}

function hasMatterLocalTransport(nodeId: string): boolean {
    const transports =
        ESPCDF.instance?.subscriptionStore?.registeredTransports?.[nodeId];
    return isOperationalMatterLocalTransport(
        transports?.[MATTER_LOCAL_TRANSPORT_KEY],
    );
}

/** Bridged RainMaker Neo child ids: `{parentNodeId}--{suffix}`. */
export function parseBridgedChildParentNodeId(nodeId: string): string | null {
    const sep = nodeId.indexOf("--");
    if (sep <= 0) return null;
    const parentNodeId = nodeId.slice(0, sep);
    return parentNodeId.length > 0 ? parentNodeId : null;
}

/** True when LAN Matter control is available for `nodeId` (or its bridge parent). */
export function isMatterNodeLocallyReachable(nodeId: string): boolean {
    const parentId = parseBridgedChildParentNodeId(nodeId);
    if (parentId) {
        const child =
            ESPCDF.instance?.nodeStore?.getNodeById?.(nodeId) ??
            ESPCDF.instance?.nodeStore?.nodesByIDMap?.[nodeId];
        if (!child?.connectivityStatus?.isConnected) {
            return false;
        }
        return hasMatterLocalTransport(parentId);
    }
    return hasMatterLocalTransport(nodeId);
}
