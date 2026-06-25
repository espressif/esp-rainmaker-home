/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 *
 * Transforms RMNG automation to unified ESPCDFAutomation per RMNG_AUTOMATION_CDF_REFERENCE.md.
 * RMNG: conditions.and = trigger IDs; actions.targets = { node, path: "<deviceId>.<paramId>", value }.
 * CDF: events = event objects { deviceName, param, check, value } for UI; actions = { nodeId, deviceName, param, value }.
 *
 * Trigger ownership (update events):
 * - A node can have triggers used by multiple automations. We must NOT delete all triggers on the node.
 * - Each automation "owns" only the trigger IDs listed in its conditions.and.
 * - On update we: remove only this automation's triggers (by ID), keep all other triggers, then add this automation's new triggers.
 * - This preserves other automations' triggers on the same node.
 */

import {
    ESPCDFAutomation,
    ESPCDFAPIResponse,
    ESPCDFAutomationOperation,
    ESPCDFAutomationEditInput,
    ESPCDFAutomationEventType,
    ESPCDFAutomationEventOperator,
} from "@store";
import type { ESPCDFAutomationEvent } from "@store";
import { ESPRMNGAutomation, ESPRMNGNode } from "@espressif/rmng-base-sdk";
import {
    targetsToCdfActions,
    cdfActionsToTargets,
    cdfEventsToTriggerItems,
    parseTriggerId,
} from "../utils/automation";
import { normalizeRmngSdkResponseToCdf } from "../utils/common";
import { ESPRMNG_AUTOMATION_STATUS } from "../utils/constants";


/** Resolved event objects for UI (deviceName, param, check, value). Used when trigger details are resolved in getAutomations. */
export type ResolvedAutomationEvents = {
    deviceName?: string;
    param?: string;
    check?: string;
    value?: unknown;
}[];

/** Options for transformToESPCDFAutomation. getNode is required for automation update (events/conditions) to sync node triggers. */
export interface TransformToESPCDFAutomationOptions {
    resolvedEvents?: ResolvedAutomationEvents;
    /** When set, used instead of parsing SDK action targets (e.g. Matter hex paths). */
    resolvedActions?: {
        nodeId: string;
        deviceName: string;
        param: string;
        value: unknown;
    }[];
    /** Used by operations.update to resolve node and sync triggers when events change. */
    getNode?: (nodeId: string) => Promise<ESPRMNGNode>;
    /** Optional nodeId when known (e.g. from createAutomation); otherwise derived from automation.conditions.and[0]. */
    nodeId?: string;
}

export function transformToESPCDFAutomation(
    automation: ESPRMNGAutomation,
    identifier: string,
    options?: TransformToESPCDFAutomationOptions,
): ESPCDFAutomation {
    const conditions = automation.conditions ?? {};
    const andIds = conditions.and ?? [];
    const nodeId = options?.nodeId ?? (andIds.length > 0 && typeof andIds[0] === "string" ? andIds[0].split("~")[0] : undefined);

    const events: ESPCDFAutomationEvent[] = options?.resolvedEvents?.length
        ? (options.resolvedEvents.map((e) => ({
            deviceName: e.deviceName ?? "",
            param: e.param ?? "",
            check: e.check ?? "==",
            value: e.value,
        })) as ESPCDFAutomationEvent[])
        : [];

    const operations: ESPCDFAutomationOperation = {
        async update(data: ESPCDFAutomationEditInput): Promise<ESPCDFAPIResponse> {
            const payload: Partial<ESPRMNGAutomation> = {};
            if (data.name !== undefined) payload.name = data.name;
            if (data.enabled !== undefined) payload.status = data.enabled ? ESPRMNG_AUTOMATION_STATUS.ENABLED : ESPRMNG_AUTOMATION_STATUS.DISABLED;
            if (data.retrigger !== undefined) payload.retrigger = data.retrigger;
            if (data.actions !== undefined) {
                payload.actions = { targets: cdfActionsToTargets(data.actions) };
            }
            if (data.events !== undefined && Array.isArray(data.events)) {
                const updateNodeId = data.nodeId ?? nodeId;
                if (!updateNodeId) {
                    throw new Error("nodeId is required to update automation events");
                }
                const getNodeFn = options?.getNode;
                if (!getNodeFn) {
                    throw new Error("getNode is required to update automation events (pass getNode in transform options)");
                }
                const thisAutomationTriggerIds = automation.conditions?.and ?? [];
                const previousNodeId =
                    thisAutomationTriggerIds.length > 0
                        ? parseTriggerId(thisAutomationTriggerIds[0])?.nodeId ?? thisAutomationTriggerIds[0].split("~")[0]
                        : undefined;

                // When the event node changes (e.g. from node A to node B), remove this automation's triggers from the previous node so they are not left orphaned.
                if (previousNodeId && previousNodeId !== updateNodeId) {
                    const previousNode = await getNodeFn(previousNodeId);
                    const previousTriggers = await previousNode.getTriggers();
                    const previousItems = previousTriggers.map((t) => t.toTriggerItem());
                    const remainingOnPrevious = previousItems.filter((t) => !thisAutomationTriggerIds.includes(t.id));
                    await previousNode.setTriggers(remainingOnPrevious);
                }

                const { triggerItems, triggerIds: newTriggerIds } = cdfEventsToTriggerItems(data.events, updateNodeId, automation.id);
                const node = await getNodeFn(updateNodeId);
                const existingTriggers = await node.getTriggers();
                const existingItems = existingTriggers.map((t) => t.toTriggerItem());
                // Same node or new node: always remove this automation's previous triggers (by ID) and add the new ones.
                // So "same node, condition change" is handled: old triggers are excluded, new triggerItems replace them.
                const triggersFromOtherAutomations = existingItems.filter((t) => !thisAutomationTriggerIds.includes(t.id));
                await node.setTriggers([...triggersFromOtherAutomations, ...triggerItems]);
                payload.conditions = { and: newTriggerIds };
            }
            const res = await automation.update(payload);
            return normalizeRmngSdkResponseToCdf(res, "Automation updated successfully");
        },
        async delete(): Promise<ESPCDFAPIResponse> {
            const res = await automation.delete();
            const thisAutomationTriggerIds = automation.conditions?.and ?? [];
            const nodeId =
                parseTriggerId(thisAutomationTriggerIds[0])?.nodeId ??
                thisAutomationTriggerIds[0]?.split("~")[0];
            if (nodeId) {
                const node = await options?.getNode?.(nodeId);
                if (node) {
                    const existingTriggers = await node.getTriggers();
                    const existingItems = existingTriggers.map((t) => t.toTriggerItem());
                    const triggersFromOtherAutomations = existingItems.filter(
                        (t) => !thisAutomationTriggerIds.includes(t.id),
                    );
                    await node.setTriggers([...triggersFromOtherAutomations]);
                }
            }
            return normalizeRmngSdkResponseToCdf(res, "Automation deleted successfully");
        },
        async enable(enabled: boolean): Promise<ESPCDFAPIResponse> {
            const status = enabled ? ESPRMNG_AUTOMATION_STATUS.ENABLED : ESPRMNG_AUTOMATION_STATUS.DISABLED;
            const res = await automation.update({ status });
            return normalizeRmngSdkResponseToCdf(res, `Automation ${status} successfully`);
        },
    };

    return new ESPCDFAutomation({
        id: automation.id,
        name: automation.name,
        enabled: (automation.status ?? ESPRMNG_AUTOMATION_STATUS.ENABLED) === ESPRMNG_AUTOMATION_STATUS.ENABLED,
        nodeId,
        eventType: ESPCDFAutomationEventType.NODE_PARAMS,
        events,
        eventOperator: ESPCDFAutomationEventOperator.AND,
        actions: options?.resolvedActions ?? targetsToCdfActions(automation.actions?.targets),
        retrigger: automation.retrigger ?? false,
        adaptorIdentifier: identifier,
        operations,
        _raw: automation,
    });
}
