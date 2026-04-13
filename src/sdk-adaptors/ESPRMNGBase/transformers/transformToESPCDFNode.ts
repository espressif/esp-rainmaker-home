/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ESPCDFNode,
    ESPCDF,
    ESPCDFNodeConfig,
    ESPCDFNodeInfoInterface,
    ESPCDFAPIResponse,
} from "@store";
import { ESPRMNGDevice, ESPRMNGNode, ESPRMNGService } from "@espressif/rmng-base-sdk";
import type {
    ESPCDFNodeOperation,
    ESPCDFPropertyChangeCallback,
} from "@store";
import { EVENT_NODE_PARAMS_CHANGED } from "@store";
import { ESPRMNGBaseAdaptorIdentifier } from "@config/sdk.identifiers";
import { HEADLESS_ERROR_UNKNOWN } from "@shared/utils/constants";
import { mapShadowDocumentToNodeUpdateEvents } from "../utils/common";
import { safeTransform } from "@sdk-adaptors/shared/utils/safeTransform";
import { transformToESPCDFDevice } from "./transformToESPCDFDevice";
import { transformToESPCDFService } from "./transformToESPCDFService";
import { ianaTzToEspPosixTz } from "@shared/utils/timezone";

const MQTT_TRANSPORT_KEY = "mqtt";

/**
 * Builds a no-op property-change handler for RMNG nodes until raw-node sync is implemented.
 * @param _rawNode - Mutable SDK node backing the CDF entity (reserved for future sync).
 * @returns Callback registered on the CDF node for property change events.
 */
const createPropertyChangeSyncCallback = (
    _rawNode: ESPRMNGNode,
): ESPCDFPropertyChangeCallback => {
    return () => {
        // Sync CDF changes back to raw node when needed
    };
};

/**
 * Transforms one RMNG SDK node into a CDF node with resilient device/service mapping.
 * Malformed devices or services are skipped so the node still renders when the payload is partial.
 * @param node - Raw RMNG SDK node.
 * @returns Transformed CDF node.
 */
export function transformToESPCDFNode(node: ESPRMNGNode): ESPCDFNode {
    const nodeId = node.nodeId;
    const operations: ESPCDFNodeOperation = {
        setMultipleParams: async (_params: Record<string, any>) => {
            return node.setParams(_params);
        },
        delete: async (): Promise<ESPCDFAPIResponse> => {
            const res = await node.delete();
            const raw =
                res && typeof res === "object"
                    ? String((res as { status?: string }).status ?? "").toLowerCase()
                    : "";
            if (raw === "success" || raw.includes("success")) {
                return res as ESPCDFAPIResponse;
            }
            return {
                status: "success",
                description:
                    (res &&
                        typeof res === "object" &&
                        typeof (res as { description?: string }).description ===
                            "string" &&
                        (res as { description: string }).description) ||
                    "",
            };
        },
        setTimeZone: async (_timeZone: string) => {
            const posix = ianaTzToEspPosixTz(_timeZone);
            const timePayload: Record<string, string> = { TZ: _timeZone };
            if (posix) {
                timePayload["TZ-POSIX"] = posix;
            }
            return node.setParams({
                Time: timePayload,
            });
        },
        updateMetadata: async (_metadata: Record<string, any>) => {
            throw new Error("RMNGBase SDK does not support node updateMetadata");
        },
        checkOTAUpdate: async () => {
            throw new Error("RMNGBase SDK does not support node checkOTAUpdate");
        },
        pushOTAUpdate: async (_params: any) => {
            throw new Error("RMNGBase SDK does not support node pushOTAUpdate");
        },
        getOTAUpdateStatus: async () => {
            throw new Error("RMNGBase SDK does not support node getOTAUpdateStatus");
        },
    };

    node.on("params", (event: any) => {
        const root = ESPCDF.instance;
        const listen = root?.subscriptionStore?.nodeUpdates?.listen;
        if (!listen) return;

        const isShadowDoc =
            event &&
            typeof event === "object" &&
            event.state?.reported !== undefined;

        if (isShadowDoc) {
            for (const ev of mapShadowDocumentToNodeUpdateEvents(node.nodeId, event)) {
                listen(ev);
            }
            return;
        }

        listen({
            event_type: EVENT_NODE_PARAMS_CHANGED,
            node_id: node.nodeId,
            payload: event ?? {},
            timestamp: Date.now(),
        });
    });

    const devices = safeTransform<ESPRMNGDevice, ReturnType<typeof transformToESPCDFDevice>>(
        node.devices,
        "node.devices",
        (device) => transformToESPCDFDevice(device),
        ({ index, error }) => {
            const message = error instanceof Error ? error.message : HEADLESS_ERROR_UNKNOWN;
            console.warn("Node device transform skipped", {
                nodeId,
                index,
                reason: message,
            });
        },
        { skipElement: (device) => !device },
    );

    const services = safeTransform<ESPRMNGService, ReturnType<typeof transformToESPCDFService>>(
        node.services,
        "node.services",
        (service) => transformToESPCDFService(service),
        ({ index, error }) => {
            const message = error instanceof Error ? error.message : HEADLESS_ERROR_UNKNOWN;
            console.warn("Node service transform skipped", {
                nodeId,
                index,
                reason: message,
            });
        },
        { skipElement: (service) => !service },
    );

    const cdfNode = new ESPCDFNode({
        identifier: ESPRMNGBaseAdaptorIdentifier,
        id: node.nodeId,
        type: "rmng node",
        nodeConfig: new ESPCDFNodeConfig({
            configVersion: node.config.config_version ?? "",
            info: node.config.info as ESPCDFNodeInfoInterface,
        }),
        devices,
        services,
        connectivityStatus: node.connectivityStatus,
        metadata: {},
        operations: operations,
        isPrimaryUser: true, // TODO: Remove this once we have a proper way to determine if the node is primary user
        transportOrder: [MQTT_TRANSPORT_KEY],
        availableTransports: {
            [MQTT_TRANSPORT_KEY]: { type: MQTT_TRANSPORT_KEY, metadata: {} },
        },
        _raw: node,
    });
    const syncCallback = createPropertyChangeSyncCallback(node);
    cdfNode.onPropertyChange(syncCallback);

    return cdfNode;
}

/**
 * Transforms a batch of RMNG SDK nodes to CDF nodes.
 * Invalid nodes are skipped and reported as partial failures.
 * @param nodes - Raw SDK nodes.
 * @param context - Context label for partial failure logs.
 * @returns Successfully transformed CDF nodes.
 */
export function transformToESPCDFNodes(
    nodes: ESPRMNGNode[],
    context: string,
): ESPCDFNode[] {
    const failures: { nodeId: string; index: number; reason: string }[] = [];

    const transformedNodes = safeTransform<ESPRMNGNode, ESPCDFNode>(
        nodes,
        context,
        (n) => transformToESPCDFNode(n),
        ({ index, context: ctx, error }) => {
            const message = error instanceof Error ? error.message : HEADLESS_ERROR_UNKNOWN;
            failures.push({
                nodeId: nodes[index]?.nodeId ?? "",
                index,
                reason: `${ctx}: ${message}`,
            });
        },
    );

    if (failures.length > 0) {
        console.warn("Node transform partial failures", failures);
    }

    return transformedNodes;
}
