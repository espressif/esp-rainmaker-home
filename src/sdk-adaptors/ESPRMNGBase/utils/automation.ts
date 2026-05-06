import { ActionTarget, TriggerItem, TriggerOperator } from "@espressif/rmng-base-sdk";
import {
    ESPCDFAutomationAction,
    ESPCDFAutomationConditionOperator,
    ESPCDFAutomationEvent,
    ESPCDFAutomationNodeParamsEvent,
} from "@store";

/** Generates a unique trigger ID for RMNG (no restriction on format). */
export function generateTriggerId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/** Separator used in trigger IDs so we can parse nodeId and automationId (avoids conflict with UUID hyphens). */
const TRIGGER_ID_SEP = "~";

/**
 * Generates a trigger ID in the form nodeId~automationId~randomNumber.
 * Enables identifying which automation owns a trigger during update (filter by automationId).
 */
export function generateTriggerIdForAutomation(nodeId: string, automationId: string): string {
    const randomPart = generateTriggerId();
    return `${nodeId}${TRIGGER_ID_SEP}${automationId}${TRIGGER_ID_SEP}${randomPart}`;
}

/** Parses trigger ID: returns [nodeId, automationId, randomPart] when format is nodeId~automationId~random. */
export function parseTriggerId(triggerId: string): { nodeId: string; automationId: string; randomPart: string } | null {
    const parts = triggerId.split(TRIGGER_ID_SEP);
    if (parts.length >= 3) {
        return { nodeId: parts[0], automationId: parts[1], randomPart: parts.slice(2).join(TRIGGER_ID_SEP) };
    }
    return null;
}

export function targetsToCdfActions(
    targets: ActionTarget[] | undefined
): ESPCDFAutomationAction[] {
    if (!Array.isArray(targets)) return [];
    return targets.map((t) => ({
        nodeId: t.node,
        deviceName: t.device,
        param: t.param,
        value: t.value,
    }));
}

export function cdfActionsToTargets(
    actions: ESPCDFAutomationAction[] | undefined
): ActionTarget[] {
    if (!Array.isArray(actions)) return [];
    return actions.map((a) => ({
        node: a.nodeId,
        device: a.deviceName,
        param: a.param,
        value: a.value,
    }));
}

/**
 * Maps API / legacy comparison strings to RMNG {@link TriggerOperator} values.
 * @param op - Raw operator from node trigger metadata (e.g. "==", ">=").
 * @returns Normalized trigger operator for {@link TriggerItem}.
 */
export function apiOperatorToTriggerOperator(op: string | undefined): TriggerOperator {
    if (op === "eq" || op === "==") return "eq";
    if (op === "ne" || op === "!=") return "ne";
    if (op === "lt" || op === "<") return "lt";
    if (op === "le" || op === "<=") return "le";
    if (op === "gt" || op === ">") return "gt";
    if (op === "ge" || op === ">=") return "ge";
    return "eq";
}

export function operatorToBackend(check: ESPCDFAutomationConditionOperator | undefined): TriggerOperator {
    if (check === ESPCDFAutomationConditionOperator.EQUAL) return "eq";
    if (check === ESPCDFAutomationConditionOperator.NOT_EQUAL) return "ne";
    if (check === ESPCDFAutomationConditionOperator.LESS_THAN) return "lt";
    if (check === ESPCDFAutomationConditionOperator.LESS_THAN_OR_EQUAL) return "le";
    if (check === ESPCDFAutomationConditionOperator.GREATER_THAN) return "gt";
    if (check === ESPCDFAutomationConditionOperator.GREATER_THAN_OR_EQUAL) return "ge";
    return "eq";
}

/** Maps backend/RMNG operator string to CDF condition operator enum. */
export function backendOperatorToCdfOperator(op: string | undefined): ESPCDFAutomationConditionOperator {
    if (op === "eq" || op === "==") return ESPCDFAutomationConditionOperator.EQUAL;
    if (op === "ne" || op === "!=") return ESPCDFAutomationConditionOperator.NOT_EQUAL;
    if (op === "lt" || op === "<") return ESPCDFAutomationConditionOperator.LESS_THAN;
    if (op === "le" || op === "<=") return ESPCDFAutomationConditionOperator.LESS_THAN_OR_EQUAL;
    if (op === "gt" || op === ">") return ESPCDFAutomationConditionOperator.GREATER_THAN;
    if (op === "ge" || op === ">=") return ESPCDFAutomationConditionOperator.GREATER_THAN_OR_EQUAL;
    return ESPCDFAutomationConditionOperator.EQUAL;
}

/** Converts a single RMNG TriggerItem to CDF node-params event shape. */
export function triggerItemToCdfEvent(item: TriggerItem): ESPCDFAutomationNodeParamsEvent {
    return {
        deviceName: item.device ?? "",
        param: item.param ?? "",
        check: backendOperatorToCdfOperator(item.operator),
        value: item.value,
    };
}

/** Converts RMNG trigger items to CDF events (for automation events array). */
export function triggerItemsToCdfEvents(items: TriggerItem[]): ESPCDFAutomationNodeParamsEvent[] {
    if (!Array.isArray(items)) return [];
    return items.map(triggerItemToCdfEvent);
}

export interface CdfEventsToTriggerItemsResult {
    triggerItems: TriggerItem[];
    triggerIds: string[];
}

/**
 * Converts CDF automation events to RMNG TriggerItem[] and stable trigger IDs.
 * When both nodeId and automationId are provided, IDs use format nodeId~automationId~randomNumber
 * so update can identify this automation's triggers. Otherwise falls back to nodeId~uuid for backward compat.
 */
export function cdfEventsToTriggerItems(
    events: ESPCDFAutomationEvent[] | undefined,
    nodeId?: string,
    automationId?: string
): CdfEventsToTriggerItemsResult {
    const isNodeParamsEvent = (e: ESPCDFAutomationEvent): e is ESPCDFAutomationNodeParamsEvent =>
        typeof e === "object" && e !== null && "deviceName" in e && "param" in e && "check" in e && "value" in e;
    if (!Array.isArray(events)) return { triggerItems: [], triggerIds: [] };
    const triggerItems: TriggerItem[] = [];
    const triggerIds: string[] = [];
    for (const e of events) {
        if (!isNodeParamsEvent(e)) continue;
        const id =
            nodeId && automationId
                ? generateTriggerIdForAutomation(nodeId, automationId)
                : nodeId
                  ? `${nodeId}${TRIGGER_ID_SEP}${generateTriggerId()}`
                  : generateTriggerId();
        triggerIds.push(id);
        triggerItems.push({
            id,
            device: e.deviceName ?? "",
            param: e.param ?? "",
            operator: operatorToBackend(e.check),
            value: e.value,
        });
    }
    return { triggerItems, triggerIds };
}
