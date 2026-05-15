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
import { AUTOMATION_RMNG_ENABLE_DISABLE_UNSUPPORTED_I18N_KEY } from "@shared/utils/constants";
import {
    targetsToCdfActions,
    cdfActionsToTargets,
    cdfEventsToTriggerItems,
    parseTriggerId,
} from "../utils/automation";


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
            if (data.enabled !== undefined) payload.enabled = data.enabled;
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
            return { status: res.status, description: res.description ?? "" };
        },
        async delete(): Promise<ESPCDFAPIResponse> {
            const res = await automation.delete();
            if (res.status === "success") {
                const thisAutomationTriggerIds = automation.conditions?.and ?? [];
                const nodeId = parseTriggerId(thisAutomationTriggerIds[0])?.nodeId ?? thisAutomationTriggerIds[0].split("~")[0];
                if (!nodeId) {
                    throw new Error("nodeId is required to delete automation");
                }
                const node = await options?.getNode?.(nodeId);
                if (node) {
                    const existingTriggers = await node.getTriggers();
                    const existingItems = existingTriggers.map((t) => t.toTriggerItem());
                    // Same node or new node: always remove this automation's previous triggers (by ID) and add the new ones.
                    // So "same node, condition change" is handled: old triggers are excluded, new triggerItems replace them.
                    const triggersFromOtherAutomations = existingItems.filter((t) => !thisAutomationTriggerIds.includes(t.id));
                    await node.setTriggers([...triggersFromOtherAutomations]);
                }
            }
            return { status: res.status, description: res.description ?? "" };
        },
        /**
         * RMNG currently does not support the enable/disable functionality for automation.
         * Throws an `Error` carrying `description` as an i18next key (`automation.errors.*`) for the UI layer to translate.
         */
        async enable(_enabled: boolean): Promise<ESPCDFAPIResponse> {
            const description = AUTOMATION_RMNG_ENABLE_DISABLE_UNSUPPORTED_I18N_KEY;
            const error = new Error(description) as Error & { description: string };
            error.description = description;
            throw error;
        },
    };

    return new ESPCDFAutomation({
        id: automation.id,
        name: automation.name,
        enabled: automation.enabled ?? false,
        nodeId,
        eventType: ESPCDFAutomationEventType.NODE_PARAMS,
        events,
        eventOperator: ESPCDFAutomationEventOperator.AND,
        actions: targetsToCdfActions(automation.actions?.targets),
        retrigger: automation.retrigger ?? false,
        adaptorIdentifier: identifier,
        operations,
        _raw: automation,
    });
}
