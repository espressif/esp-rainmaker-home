/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ActionTarget,
  CreateAutomationInput,
  ESPRMNeoAutomation,
  ESPRMNeoGroup,
  ESPRMNeoNode,
  TriggerItem,
  TriggerOperator,
} from "@espressif/rainmaker-neo-base-sdk";
import {
  ESPCDFAutomationAction,
  ESPCDFAutomationConditionOperator,
  ESPCDFAutomationCreateInput,
  ESPCDFAutomationEditInput,
  ESPCDFAutomationEvent,
  ESPCDFAutomationNodeParamsEvent,
} from "@store";
import {
  ESPRMNEO_API_OPERATOR,
  ESPRMNEO_AUTOMATION_ERR_GET_NODE_REQUIRED,
  ESPRMNEO_AUTOMATION_ERR_NODE_ID_REQUIRED,
  ESPRMNEO_AUTOMATION_EVENT_DEVICE_NAME_KEY,
  ESPRMNEO_AUTOMATION_STATUS,
  ESPRMNEO_GROUP_ERR_AUTOMATION_NODE_ID_REQUIRED,
  ESPRMNEO_GROUP_ERR_CREATE_AUTOMATION_ON_SUBGROUP,
  ESPRMNEO_TRIGGER_ID_SEP,
  ESPRMNEO_TRIGGER_OPERATOR,
  ESPRMNEO_TRIGGER_PATH_SEP,
  ESPRMNEO_TRIGGER_TYPE_PARAM,
} from "../constants";
import type {
  ResolvedAutomationEvents,
  RmneoAutomationGetNode,
} from "../types/automationTypes";
import { isChildGroup } from "./groupHelpers";

/**
 * Builds a `<deviceId>.<paramId>` path used in RMNeo trigger and action wire payloads.
 * @param deviceId - Device name / id segment before the path separator.
 * @param paramId - Param name / id segment after the path separator.
 * @returns Combined path string for ActionTarget / TriggerItem.
 */
function buildPath(deviceId: string, paramId: string): string {
  return `${deviceId}${ESPRMNEO_TRIGGER_PATH_SEP}${paramId}`;
}

/**
 * Splits a `<deviceId>.<paramId>` path into its components.
 * When no separator is present, the whole string is treated as `deviceId` and `paramId` is empty.
 * @param path - Wire path from an ActionTarget or TriggerItem.
 * @returns Parsed device and param id segments.
 */
function parsePath(path: string): { deviceId: string; paramId: string } {
  const dot = path.indexOf(ESPRMNEO_TRIGGER_PATH_SEP);
  if (dot === -1) return { deviceId: path, paramId: "" };
  return { deviceId: path.slice(0, dot), paramId: path.slice(dot + 1) };
}

/**
 * Generates a unique trigger ID for RMNeo (no restriction on format).
 * Prefers `crypto.randomUUID` when available; otherwise uses a timestamp + random fallback.
 * @returns A unique string suitable as a TriggerItem id.
 */
export function generateTriggerId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Generates a trigger ID in the form `nodeId~automationId~randomNumber`.
 * Enables identifying which automation owns a trigger during update (filter by automationId).
 * @param nodeId - Node that owns the trigger.
 * @param automationId - Automation that owns the trigger.
 * @returns Composed trigger id embedding node and automation identity.
 */
export function generateTriggerIdForAutomation(nodeId: string, automationId: string): string {
  const randomPart = generateTriggerId();
  return `${nodeId}${ESPRMNEO_TRIGGER_ID_SEP}${automationId}${ESPRMNEO_TRIGGER_ID_SEP}${randomPart}`;
}

/**
 * Parses a composed trigger ID into node, automation, and random segments.
 * @param triggerId - Trigger id, optionally in `nodeId~automationId~random` form.
 * @returns Parsed parts when the format matches; otherwise `null`.
 */
export function parseTriggerId(
  triggerId: string
): { nodeId: string; automationId: string; randomPart: string } | null {
  const parts = triggerId.split(ESPRMNEO_TRIGGER_ID_SEP);
  if (parts.length >= 3) {
    return {
      nodeId: parts[0],
      automationId: parts[1],
      randomPart: parts.slice(2).join(ESPRMNEO_TRIGGER_ID_SEP),
    };
  }
  return null;
}

/**
 * Derives the owning node id from the first trigger id in `conditions.and`.
 * @param triggerIds - Trigger ids owned by an automation (may be composed `node~…` form).
 * @returns Node id when parseable; otherwise `undefined`.
 */
export function resolveNodeIdFromTriggerIds(
  triggerIds: string[]
): string | undefined {
  const first = triggerIds[0];
  if (!first || typeof first !== "string") return undefined;
  return (
    parseTriggerId(first)?.nodeId ?? first.split(ESPRMNEO_TRIGGER_ID_SEP)[0]
  );
}

/**
 * Resolves `getNode` or throws when automation mutations need a node.
 * @param getNode - Optional node resolver from transform options.
 * @param nodeId - Node id to resolve.
 * @returns The ESPRMNeoNode for `nodeId`.
 */
export async function requireAutomationNode(
  getNode: RmneoAutomationGetNode | undefined,
  nodeId: string
): Promise<ESPRMNeoNode> {
  if (!getNode) {
    throw new Error(ESPRMNEO_AUTOMATION_ERR_GET_NODE_REQUIRED);
  }
  return getNode(nodeId);
}

/**
 * Replace-all triggers on a node: drop `ownedTriggerIds`, keep others, optionally append `nextItems`.
 * Used so one automation never deletes triggers owned by other automations on the same node.
 * @param node - RMNeo node whose triggers to rewrite.
 * @param ownedTriggerIds - Trigger ids owned by this automation.
 * @param nextItems - New trigger items to add after filtering (omit on delete cleanup).
 */
export async function replaceOwnedTriggersOnNode(
  node: ESPRMNeoNode,
  ownedTriggerIds: string[],
  nextItems: TriggerItem[] = []
): Promise<void> {
  const existingItems = (await node.getTriggers()).map((t) => t.toTriggerItem());
  const kept = existingItems.filter((t) => !ownedTriggerIds.includes(t.id));
  await node.createTrigger([...kept, ...nextItems]);
}

/**
 * Maps RMNeo action targets to CDF automation actions.
 * @param targets - Action targets from the SDK (node + path + value).
 * @returns CDF action list; empty when `targets` is missing or not an array.
 */
export function targetsToCdfActions(
  targets: ActionTarget[] | undefined
): ESPCDFAutomationAction[] {
  if (!Array.isArray(targets)) return [];
  return targets.map((t) => {
    const { deviceId, paramId } = parsePath(t.path);
    return {
      nodeId: t.node,
      deviceName: deviceId,
      param: paramId,
      value: t.value,
    };
  });
}

/**
 * Maps CDF automation actions to RMNeo action targets.
 * @param actions - CDF actions (nodeId + deviceName + param + value).
 * @returns RMNeo ActionTarget list; empty when `actions` is missing or not an array.
 */
export function cdfActionsToTargets(
  actions: ESPCDFAutomationAction[] | undefined
): ActionTarget[] {
  if (!Array.isArray(actions)) return [];
  return actions.map((a) => ({
    node: a.nodeId,
    path: buildPath(a.deviceName, a.param),
    value: a.value,
  }));
}

/** RainMaker triggers wire-format comparison keyword (`eq` | `ne` | `lt` | `le` | `gt` | `ge`). */
export type ApiTriggerOperator =
  (typeof ESPRMNEO_API_OPERATOR)[keyof typeof ESPRMNEO_API_OPERATOR];

/**
 * Normalizes a RainMaker API comparison keyword for {@link TriggerItem} wire payloads.
 *
 * The triggers endpoint uses two-letter keywords only
 * ({@link ESPRMNEO_API_OPERATOR}) — never symbolic forms like `==` or `>=`.
 * Unknown or missing values fall back to {@link ESPRMNEO_API_OPERATOR.EQ}.
 * @param op - Comparison keyword from the API.
 * @returns The same keyword when valid; otherwise `"eq"`.
 */
export function apiOperatorToTriggerOperator(op: string | undefined): ApiTriggerOperator {
  if (op === ESPRMNEO_API_OPERATOR.EQ) return ESPRMNEO_API_OPERATOR.EQ;
  if (op === ESPRMNEO_API_OPERATOR.NE) return ESPRMNEO_API_OPERATOR.NE;
  if (op === ESPRMNEO_API_OPERATOR.LT) return ESPRMNEO_API_OPERATOR.LT;
  if (op === ESPRMNEO_API_OPERATOR.LE) return ESPRMNEO_API_OPERATOR.LE;
  if (op === ESPRMNEO_API_OPERATOR.GT) return ESPRMNEO_API_OPERATOR.GT;
  if (op === ESPRMNEO_API_OPERATOR.GE) return ESPRMNEO_API_OPERATOR.GE;
  return ESPRMNEO_API_OPERATOR.EQ;
}

/**
 * Maps a CDF condition operator enum to a RainMaker API wire-format keyword.
 * @param check - CDF automation condition operator; unknown/missing falls back to `"eq"`.
 * @returns API keyword (`eq` | `ne` | `lt` | `le` | `gt` | `ge`) for trigger wire payloads.
 */
export function operatorToBackend(
  check: ESPCDFAutomationConditionOperator | undefined
): ApiTriggerOperator {
  if (check === ESPCDFAutomationConditionOperator.EQUAL) {
    return ESPRMNEO_API_OPERATOR.EQ;
  }
  if (check === ESPCDFAutomationConditionOperator.NOT_EQUAL) {
    return ESPRMNEO_API_OPERATOR.NE;
  }
  if (check === ESPCDFAutomationConditionOperator.LESS_THAN) {
    return ESPRMNEO_API_OPERATOR.LT;
  }
  if (check === ESPCDFAutomationConditionOperator.LESS_THAN_OR_EQUAL) {
    return ESPRMNEO_API_OPERATOR.LE;
  }
  if (check === ESPCDFAutomationConditionOperator.GREATER_THAN) {
    return ESPRMNEO_API_OPERATOR.GT;
  }
  if (check === ESPCDFAutomationConditionOperator.GREATER_THAN_OR_EQUAL) {
    return ESPRMNEO_API_OPERATOR.GE;
  }
  return ESPRMNEO_API_OPERATOR.EQ;
}

/**
 * Maps a backend/RMNeo operator string (API keyword or symbol) to a CDF condition operator enum.
 * @param op - Operator from API keywords or RMNeo symbols; unknown/missing falls back to EQUAL.
 * @returns Matching {@link ESPCDFAutomationConditionOperator} value.
 */
export function backendOperatorToCdfOperator(
  op: string | undefined
): ESPCDFAutomationConditionOperator {
  if (op === ESPRMNEO_API_OPERATOR.EQ || op === ESPRMNEO_TRIGGER_OPERATOR.EQ) {
    return ESPCDFAutomationConditionOperator.EQUAL;
  }
  if (op === ESPRMNEO_API_OPERATOR.NE || op === ESPRMNEO_TRIGGER_OPERATOR.NE) {
    return ESPCDFAutomationConditionOperator.NOT_EQUAL;
  }
  if (op === ESPRMNEO_API_OPERATOR.LT || op === ESPRMNEO_TRIGGER_OPERATOR.LT) {
    return ESPCDFAutomationConditionOperator.LESS_THAN;
  }
  if (op === ESPRMNEO_API_OPERATOR.LE || op === ESPRMNEO_TRIGGER_OPERATOR.LE) {
    return ESPCDFAutomationConditionOperator.LESS_THAN_OR_EQUAL;
  }
  if (op === ESPRMNEO_API_OPERATOR.GT || op === ESPRMNEO_TRIGGER_OPERATOR.GT) {
    return ESPCDFAutomationConditionOperator.GREATER_THAN;
  }
  if (op === ESPRMNEO_API_OPERATOR.GE || op === ESPRMNEO_TRIGGER_OPERATOR.GE) {
    return ESPCDFAutomationConditionOperator.GREATER_THAN_OR_EQUAL;
  }
  return ESPCDFAutomationConditionOperator.EQUAL;
}

/**
 * Converts a single RMNeo {@link TriggerItem} to a CDF node-params event.
 * @param item - RMNeo trigger item with path, operator, and value.
 * @returns CDF node-params event shape for store / UI automation models.
 */
export function triggerItemToCdfEvent(item: TriggerItem): ESPCDFAutomationNodeParamsEvent {
  const { deviceId, paramId } = parsePath(item.path);
  return {
    deviceName: deviceId,
    param: paramId,
    check: backendOperatorToCdfOperator(item.operator),
    value: item.value,
  };
}

/**
 * Converts RMNeo trigger items to CDF node-params events.
 * @param items - RMNeo trigger items to map.
 * @returns CDF node-params events; empty when `items` is not an array.
 */
export function triggerItemsToCdfEvents(items: TriggerItem[]): ESPCDFAutomationNodeParamsEvent[] {
  if (!Array.isArray(items)) return [];
  return items.map(triggerItemToCdfEvent);
}

/** Result of mapping CDF automation events to RMNeo trigger items and ids. */
export interface CdfEventsToTriggerItemsResult {
  triggerItems: TriggerItem[];
  triggerIds: string[];
}

/**
 * Narrows a CDF automation event to a node-params trigger shape.
 * @param e - Candidate automation event.
 * @returns `true` when `e` has deviceName, param, check, and value.
 */
function isNodeParamsEvent(e: ESPCDFAutomationEvent): e is ESPCDFAutomationNodeParamsEvent {
  return (
    typeof e === "object" &&
    e !== null &&
    "deviceName" in e &&
    "param" in e &&
    "check" in e &&
    "value" in e
  );
}

/**
 * Picks a trigger id for create/update: `node~automation~uuid`, `node~uuid`, or bare uuid.
 * @param nodeId - Optional node id used when composing the id.
 * @param automationId - Optional automation id used when composing the id.
 * @returns Stable-enough unique trigger id for the given identity context.
 */
function resolveTriggerId(nodeId?: string, automationId?: string): string {
  if (nodeId && automationId) {
    return generateTriggerIdForAutomation(nodeId, automationId);
  }
  if (nodeId) {
    return `${nodeId}${ESPRMNEO_TRIGGER_ID_SEP}${generateTriggerId()}`;
  }
  return generateTriggerId();
}

/**
 * Converts CDF automation events to RMNeo {@link TriggerItem}[] and stable trigger IDs.
 *
 * When both `nodeId` and `automationId` are provided, IDs use
 * `nodeId~automationId~random` so updates can identify this automation's triggers.
 * Otherwise falls back to `nodeId~uuid` or a bare uuid for backward compatibility.
 * @param events - CDF automation events (non-node-params events are skipped).
 * @param nodeId - Optional node id used when composing trigger ids.
 * @param automationId - Optional automation id used when composing trigger ids.
 * @returns Parallel `triggerItems` and `triggerIds` arrays.
 */
export function cdfEventsToTriggerItems(
  events: ESPCDFAutomationEvent[] | undefined,
  nodeId?: string,
  automationId?: string
): CdfEventsToTriggerItemsResult {
  if (!Array.isArray(events)) return { triggerItems: [], triggerIds: [] };

  const triggerItems: TriggerItem[] = [];
  const triggerIds: string[] = [];

  for (const e of events) {
    if (!isNodeParamsEvent(e)) continue;

    const id = resolveTriggerId(nodeId, automationId);
    triggerIds.push(id);
    triggerItems.push({
      id,
      type: ESPRMNEO_TRIGGER_TYPE_PARAM,
      path: buildPath(e.deviceName ?? "", e.param ?? ""),
      // Wire format uses API keywords; SDK TriggerOperator typings still list symbols.
      operator: operatorToBackend(e.check) as TriggerOperator,
      value: e.value,
    });
  }

  return { triggerItems, triggerIds };
}

/**
 * Builds the direct RMNeo automation field updates that do not require node
 * trigger synchronization.
 * @param data - Partial CDF automation edit input.
 * @returns RMNeo update payload containing scalar fields and actions.
 */
export function buildAutomationUpdatePayload(
  data: ESPCDFAutomationEditInput,
): Partial<CreateAutomationInput> {
  const payload: Partial<CreateAutomationInput> = {};
  if (data.name !== undefined) payload.name = data.name;
  if (data.enabled !== undefined) {
    payload.status = data.enabled
      ? ESPRMNEO_AUTOMATION_STATUS.ENABLED
      : ESPRMNEO_AUTOMATION_STATUS.DISABLED;
  }
  if (data.retrigger !== undefined) payload.retrigger = data.retrigger;
  if (data.actions !== undefined) {
    payload.actions = { targets: cdfActionsToTargets(data.actions) };
  }
  return payload;
}

/**
 * Determines whether an automation is enabled, treating a missing SDK status
 * as enabled to preserve the CDF default.
 * @param status - Current RMNeo automation status.
 * @returns Whether the automation should be exposed as enabled.
 */
export function isAutomationEnabled(
  status: ESPRMNeoAutomation["status"],
): boolean {
  return (
    (status ?? ESPRMNEO_AUTOMATION_STATUS.ENABLED)
    === ESPRMNEO_AUTOMATION_STATUS.ENABLED
  );
}

/**
 * Replaces only the current automation's triggers and returns its new
 * conditions, preserving triggers owned by other automations.
 * @param automation - Automation whose trigger ownership is being updated.
 * @param events - Replacement CDF events to convert into RMNeo triggers.
 * @param updateNodeId - Node that should own the replacement triggers.
 * @param getNode - Optional node resolver supplied by the transformer.
 * @returns Conditions referencing the newly created trigger ids.
 */
export async function syncAutomationEventTriggers(
  automation: ESPRMNeoAutomation,
  events: ESPCDFAutomationEditInput["events"],
  updateNodeId: string | undefined,
  getNode: RmneoAutomationGetNode | undefined,
): Promise<{ and: string[] }> {
  if (!updateNodeId) {
    throw new Error(ESPRMNEO_AUTOMATION_ERR_NODE_ID_REQUIRED);
  }

  const ownedTriggerIds = automation.conditions?.and ?? [];
  const previousNodeId = resolveNodeIdFromTriggerIds(ownedTriggerIds);
  if (previousNodeId && previousNodeId !== updateNodeId) {
    const previousNode = await requireAutomationNode(getNode, previousNodeId);
    await replaceOwnedTriggersOnNode(previousNode, ownedTriggerIds);
  }

  const { triggerItems, triggerIds } = cdfEventsToTriggerItems(
    events,
    updateNodeId,
    automation.id,
  );
  const node = await requireAutomationNode(getNode, updateNodeId);
  await replaceOwnedTriggersOnNode(node, ownedTriggerIds, triggerItems);
  return { and: triggerIds };
}

/**
 * Guards automation creation: home groups only, and a source `nodeId` is required
 * for composing `nodeId~automationId~random` trigger ids.
 * @param rmneoGroup - Target RMNeo group where automation is being created
 * @param nodeId - Node id from CDF create input (must be present)
 * @returns The same `nodeId` after validation
 * @throws When called on a subgroup or when `nodeId` is missing
 */
export function assertCanCreateAutomation(
  rmneoGroup: ESPRMNeoGroup,
  nodeId: string | undefined,
): string {
  if (isChildGroup(rmneoGroup)) {
    throw new Error(ESPRMNEO_GROUP_ERR_CREATE_AUTOMATION_ON_SUBGROUP);
  }
  if (!nodeId) {
    throw new Error(ESPRMNEO_GROUP_ERR_AUTOMATION_NODE_ID_REQUIRED);
  }
  return nodeId;
}

/**
 * Creates an RMNeo automation shell with empty conditions/actions so the SDK
 * allocates an automation id required for trigger id composition.
 * @param rmneoGroup - RMNeo group where the automation should be created
 * @param automationData - CDF automation create input
 * @returns Newly created RMNeo automation instance
 */
export async function createAutomationShell(
  rmneoGroup: ESPRMNeoGroup,
  automationData: ESPCDFAutomationCreateInput,
): Promise<ESPRMNeoAutomation> {
  return await rmneoGroup.createAutomation({
    name: automationData.name,
    conditions: { and: [] },
    actions: { targets: [] },
    status: automationData.enabled
      ? ESPRMNEO_AUTOMATION_STATUS.ENABLED
      : ESPRMNEO_AUTOMATION_STATUS.DISABLED,
    retrigger: automationData.retrigger ?? false,
  });
}

/**
 * Creates node triggers for CDF events and links them to the automation
 * conditions together with action targets.
 * @param rmneoGroup - RMNeo group used to resolve the node for trigger creation
 * @param nodeId - Node id owning the created triggers
 * @param automation - Target automation to update with trigger ids/actions
 * @param automationData - CDF automation input events/actions
 * @returns Promise that resolves after triggers + automation update complete
 */
export async function syncAutomationTriggersAndActions(
  rmneoGroup: ESPRMNeoGroup,
  nodeId: string,
  automation: ESPRMNeoAutomation,
  automationData: ESPCDFAutomationCreateInput,
): Promise<void> {
  const targets = cdfActionsToTargets(automationData.actions);
  const { triggerItems, triggerIds } = cdfEventsToTriggerItems(
    automationData.events,
    nodeId,
    automation.id,
  );
  if (triggerItems.length === 0) {
    return;
  }
  const node = await rmneoGroup.getNode(nodeId);
  await Promise.all(
    triggerItems.map(async (triggerItem) => {
      return await node.createTrigger(triggerItem);
    }),
  );
  await automation.update({
    conditions: { and: triggerIds },
    actions: { targets },
  });
}

/**
 * Maps CDF create-input events to resolved event objects used when returning
 * a freshly created CDF automation (before trigger re-fetch).
 * @param events - CDF automation events from create input
 * @returns Resolved automation events for immediate CDF model hydration
 */
export function toResolvedAutomationEvents(
  events: ESPCDFAutomationCreateInput["events"],
): ResolvedAutomationEvents {
  const normalizedEvents = Array.isArray(events) ? events : [];
  return normalizedEvents
    .filter(
      (event) =>
        typeof event === "object"
        && event !== null
        && ESPRMNEO_AUTOMATION_EVENT_DEVICE_NAME_KEY in event,
    )
    .map((event) => {
      const maybeNodeEvent = event as {
        deviceName?: string;
        param?: string;
        check?: string;
        value?: unknown;
      };
      return {
        deviceName: maybeNodeEvent.deviceName ?? "",
        param: maybeNodeEvent.param ?? "",
        check: maybeNodeEvent.check ?? ESPRMNEO_TRIGGER_OPERATOR.EQ,
        value: maybeNodeEvent.value,
      };
    });
}

type TriggerNodeLike = {
  getTriggers?(): Promise<unknown[]>;
  setTriggers?(items: unknown[]): Promise<unknown>;
};

/**
 * Resolves automation `conditions.and` trigger ids into CDF event objects by
 * loading each owning node’s triggers (cached per node). Non-fatal: skips
 * triggers that fail to resolve so one bad node cannot blank the list.
 * @param rmneoGroup - Home group used to resolve nodes via `getNode`
 * @param automation - Automation whose `conditions.and` trigger ids to expand
 * @returns Resolved CDF-shaped events for UI / {@link transformToESPCDFAutomation}
 */
export async function resolveAutomationTriggerDetails(
  rmneoGroup: ESPRMNeoGroup,
  automation: { conditions?: { and?: string[] } },
): Promise<ResolvedAutomationEvents> {
  const andIds = automation.conditions?.and ?? [];
  if (andIds.length === 0) return [];

  const getNodeFn = (rmneoGroup as { getNode?(id: string): Promise<unknown> }).getNode;
  if (typeof getNodeFn !== "function") return [];

  const resolved: ResolvedAutomationEvents = [];
  const nodeTriggersCache: Record<
    string,
    { id?: string; path?: string; operator?: string; value?: unknown }[]
  > = {};

  for (const triggerId of andIds) {
    if (typeof triggerId !== "string") continue;
    const parts = triggerId.split(ESPRMNEO_TRIGGER_ID_SEP);
    const nid = parts.length >= 1 ? parts[0] : "";
    if (!nid) continue;
    try {
      if (!nodeTriggersCache[nid]) {
        const node = (await getNodeFn.call(rmneoGroup, nid)) as TriggerNodeLike;
        const getTriggersFn = node?.getTriggers;
        if (typeof getTriggersFn !== "function") {
          nodeTriggersCache[nid] = [];
          continue;
        }
        const list = await getTriggersFn.call(node);
        nodeTriggersCache[nid] = Array.isArray(list)
          ? (list as {
              id?: string;
              path?: string;
              operator?: string;
              value?: unknown;
            }[])
          : [];
      }
      const t = nodeTriggersCache[nid].find((tr) => tr.id === triggerId);
      if (t) {
        resolved.push(
          triggerItemToCdfEvent({
            id: t.id ?? "",
            type: ESPRMNEO_TRIGGER_TYPE_PARAM,
            path: t.path ?? "",
            // Wire format uses API keywords; SDK TriggerOperator typings still list symbols.
            operator: apiOperatorToTriggerOperator(t.operator) as TriggerOperator,
            value: t.value,
          }),
        );
      }
    } catch {
      // Non-fatal: skip this trigger
    }
  }
  return resolved;
}
