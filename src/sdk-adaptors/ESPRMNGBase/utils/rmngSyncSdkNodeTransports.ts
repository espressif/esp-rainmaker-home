/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFTransportConfig } from "@store";
import { ESPRMNGNode } from "@espressif/rmng-base-sdk";

/**
 * Mirrors CDF `availableTransports` onto the backing RMNG SDK node so
 * delegated transport selection can use LAN control.
 */
export function syncAvailableTransportsToRmngSdkNode(
    rawNode: ESPRMNGNode,
    availableTransports: Record<string, ESPCDFTransportConfig> | undefined,
): void {
    const nextTransports = availableTransports ?? {};

    for (const mode of Object.keys(rawNode.availableTransports ?? {})) {
        if (!nextTransports[mode]) {
            rawNode.removeTransport(mode);
        }
    }

    for (const [mode, config] of Object.entries(nextTransports)) {
        if (config) {
            rawNode.addTransport(mode, config);
        }
    }
}
