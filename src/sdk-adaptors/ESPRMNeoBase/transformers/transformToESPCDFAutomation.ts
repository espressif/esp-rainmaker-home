/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
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
import { ESPRMNeoAutomation } from "@espressif/rainmaker-neo-base-sdk";
import {
    targetsToCdfActions,
    backendOperatorToCdfOperator,
    buildAutomationUpdatePayload,
    isAutomationEnabled,
    resolveNodeIdFromTriggerIds,
    replaceOwnedTriggersOnNode,
    syncAutomationEventTriggers,
} from "../utils/helpers/automationHelpers";
import { normalizeRmneoSdkResponseToCdf } from "../utils/helpers/sharedHelpers";
import { ESPRMNEO_AUTOMATION_STATUS } from "../utils/constants";
import type { TransformToESPCDFAutomationOptions } from "../utils/types/automationTypes";

export type {
    ResolvedAutomationEvents,
    ResolvedAutomationAction,
    TransformToESPCDFAutomationOptions,
    RmneoAutomationGetNode,
} from "../utils/types/automationTypes";



/**
 * Transforms RMNeo automation to unified ESPCDFAutomation.
 * RMNeo: conditions.and = trigger IDs; actions.targets = { node, path: "<deviceId>.<paramId>", value }.
 * CDF: events = event objects { deviceName, param, check, value } for UI; actions = { nodeId, deviceName, param, value }.
 *
 * Trigger ownership (update events):
 * - A node can have triggers used by multiple automations. We must NOT delete all triggers on the node.
 * - Each automation "owns" only the trigger IDs listed in its conditions.and.
 * - On update we: remove only this automation's triggers (by ID), keep all other triggers, then add this automation's new triggers.
 * - This preserves other automations' triggers on the same node.
 *
 * Maps RMNeo automation + optional resolved events/actions into an ESPCDFAutomation with CRUD ops.
 * @param automation - SDK automation instance.
 * @param identifier - Adaptor identifier stamped on the CDF entity.
 * @param options - Optional resolved UI events/actions and `getNode` for trigger sync.
 * @returns CDF automation with update / delete / enable operations.
 */
export function transformToESPCDFAutomation(
    automation: ESPRMNeoAutomation,
    identifier: string,
    options?: TransformToESPCDFAutomationOptions,
): ESPCDFAutomation {
    const andIds = automation.conditions?.and ?? [];
    const nodeId = options?.nodeId ?? resolveNodeIdFromTriggerIds(andIds);

    const events: ESPCDFAutomationEvent[] = options?.resolvedEvents?.length
        ? options.resolvedEvents.map((e) => ({
            deviceName: e.deviceName ?? "",
            param: e.param ?? "",
            check: backendOperatorToCdfOperator(e.check),
            value: e.value,
        }))
        : [];

    const operations: ESPCDFAutomationOperation = {
        /**
         * Updates automation fields and, when events change, syncs owned node triggers.
         * @param data - Partial CDF edit input.
         * @returns CDF API success response (description from SDK `message`).
         */
        async update(data: ESPCDFAutomationEditInput): Promise<ESPCDFAPIResponse> {
            const payload = buildAutomationUpdatePayload(data);
            if (data.events !== undefined) {
                payload.conditions = await syncAutomationEventTriggers(
                    automation,
                    data.events,
                    data.nodeId ?? nodeId,
                    options?.getNode,
                );
            }
            const res = await automation.update(payload);
            return normalizeRmneoSdkResponseToCdf(res);
        },
        /**
         * Deletes the automation, then best-effort removes its owned triggers from the node.
         * @returns CDF API success response (description from SDK `message`).
         */
        async delete(): Promise<ESPCDFAPIResponse> {
            const ownedTriggerIds = automation.conditions?.and ?? [];
            const triggerNodeId = resolveNodeIdFromTriggerIds(ownedTriggerIds);
            const res = await automation.delete();
            // Best-effort cleanup after delete (same soft behavior as before when getNode is missing).
            if (triggerNodeId && options?.getNode) {
                const node = await options.getNode(triggerNodeId);
                await replaceOwnedTriggersOnNode(node, ownedTriggerIds);
            }
            return normalizeRmneoSdkResponseToCdf(res);
        },
        /**
         * Enables or disables the automation via SDK status update.
         * @param enabled - Whether the automation should be enabled.
         * @returns CDF API success response (description from SDK `message`).
         */
        async enable(enabled: boolean): Promise<ESPCDFAPIResponse> {
            const status = enabled
                ? ESPRMNEO_AUTOMATION_STATUS.ENABLED
                : ESPRMNEO_AUTOMATION_STATUS.DISABLED;
            const res = await automation.update({ status });
            return normalizeRmneoSdkResponseToCdf(res);
        },
    };

    return new ESPCDFAutomation({
        id: automation.id,
        name: automation.name,
        enabled: isAutomationEnabled(automation.status),
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
