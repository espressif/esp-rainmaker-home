/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ESPCDFAutomation,
  ESPCDFAutomationAction,
  ESPCDFAutomationCreateInput,
  ESPCDFAutomationEditInput,
  ESPCDFAutomationEvent,
  ESPCDFGroup,
  ESPCDFNode,
  ESPCDFPaginatedAPIResponse,
} from "@store";
import { ESPCDF } from "@store";
import {
  ESPRMNGGroup,
  ESPRMNGAutomation,
  ESPRMNGNode,
  type ActionTarget,
  type TriggerItem,
} from "@espressif/rmng-base-sdk";
import { ESPRMNG_AUTOMATION_STATUS } from "@sdk-adaptors/ESPRMNGBase/utils/constants";
import {
  generateTriggerIdForAutomation,
  operatorToBackend,
  parseTriggerId,
  type CdfEventsToTriggerItemsResult,
} from "@sdk-adaptors/ESPRMNGBase/utils/automation";
import {
  transformToESPCDFAutomation,
  type ResolvedAutomationEvents,
} from "@sdk-adaptors/ESPRMNGBase/transformers/transformToESPCDFAutomation";
import {
  parseAutomationPathForCdfNode,
  resolveAutomationPathForCdfNode,
} from "./matterAutomationPaths";

type NodeParamsEvent = {
  deviceName?: string;
  param?: string;
  check?: unknown;
  value?: unknown;
};

function readCdfNode(nodeId: string): ESPCDFNode | undefined {
  return ESPCDF.instance?.nodeStore?.getNodeById?.(nodeId);
}

function isNodeParamsEvent(
  event: ESPCDFAutomationEvent,
): event is ESPCDFAutomationEvent & NodeParamsEvent {
  return (
    typeof event === "object" &&
    event !== null &&
    "deviceName" in event &&
    "param" in event &&
    "check" in event &&
    "value" in event
  );
}

function matterCdfEventsToTriggerItems(
  events: ESPCDFAutomationEvent[] | undefined,
  nodeId: string,
  automationId: string,
  cdfNode?: ESPCDFNode,
): CdfEventsToTriggerItemsResult {
  if (!Array.isArray(events)) return { triggerItems: [], triggerIds: [] };

  const triggerItems: TriggerItem[] = [];
  const triggerIds: string[] = [];
  for (const event of events) {
    if (!isNodeParamsEvent(event)) continue;
    const id = generateTriggerIdForAutomation(nodeId, automationId);
    triggerIds.push(id);
    triggerItems.push({
      id,
      path: resolveAutomationPathForCdfNode(
        cdfNode,
        event.deviceName ?? "",
        event.param ?? "",
      ),
      operator: operatorToBackend(event.check as Parameters<typeof operatorToBackend>[0]),
      value: event.value,
    });
  }
  return { triggerItems, triggerIds };
}

function matterTargetsToCdfActions(
  targets: ActionTarget[] | undefined,
): ESPCDFAutomationAction[] {
  if (!Array.isArray(targets)) return [];
  return targets.map((target) => {
    const { deviceName, param } = parseAutomationPathForCdfNode(
      readCdfNode(target.node),
      target.path,
    );
    return {
      nodeId: target.node,
      deviceName,
      param,
      value: target.value,
    };
  });
}
function matterCdfActionsToTargets(
  actions: ESPCDFAutomationAction[] | undefined,
): ActionTarget[] {
  if (!Array.isArray(actions)) return [];
  return actions.map((action) => ({
    node: action.nodeId,
    path: resolveAutomationPathForCdfNode(
      readCdfNode(action.nodeId),
      action.deviceName,
      action.param,
    ),
    value: action.value,
  }));
}

function buildMatterCdfAutomationTransformOptions(
  automation: ESPRMNGAutomation,
  nodeId: string | undefined,
  resolvedEvents: ResolvedAutomationEvents,
  getNode: (id: string) => Promise<ESPRMNGNode>,
  inputActions?: ESPCDFAutomationAction[],
) {
  return {
    resolvedEvents,
    resolvedActions:
      inputActions && inputActions.length > 0
        ? inputActions
        : matterTargetsToCdfActions(automation.actions?.targets),
    nodeId,
    getNode,
  };
}

function wrapAutomationUpdateForMatterPaths(
  automation: ESPCDFAutomation,
  sdkAutomation: ESPRMNGAutomation,
  nodeId: string | undefined,
  getNode: (id: string) => Promise<unknown>,
): void {
  const baseUpdate = automation.operations.update;
  if (!baseUpdate) return;

  automation.operations.update = async (data: ESPCDFAutomationEditInput) => {
    const payload: Partial<ESPRMNGAutomation> = {};
    if (data.name !== undefined) payload.name = data.name;
    if (data.enabled !== undefined) {
      payload.status = data.enabled
        ? ESPRMNG_AUTOMATION_STATUS.ENABLED
        : ESPRMNG_AUTOMATION_STATUS.DISABLED;
    }
    if (data.retrigger !== undefined) payload.retrigger = data.retrigger;
    if (data.actions !== undefined) {
      payload.actions = { targets: matterCdfActionsToTargets(data.actions) };
    }
    if (data.events !== undefined && Array.isArray(data.events)) {
      const updateNodeId = data.nodeId ?? nodeId;
      if (!updateNodeId) {
        throw new Error("nodeId is required to update automation events");
      }
      const thisAutomationTriggerIds = sdkAutomation.conditions?.and ?? [];
      const previousNodeId =
        thisAutomationTriggerIds.length > 0
          ? parseTriggerId(thisAutomationTriggerIds[0])?.nodeId ??
            thisAutomationTriggerIds[0].split("~")[0]
          : undefined;

      if (previousNodeId && previousNodeId !== updateNodeId) {
        const previousNode = (await getNode(previousNodeId)) as {
          getTriggers?: () => Promise<{ toTriggerItem: () => TriggerItem }[]>;
          setTriggers?: (items: TriggerItem[]) => Promise<unknown>;
        };
        const previousTriggers = await previousNode.getTriggers?.();
        const previousItems = (previousTriggers ?? []).map((t) => t.toTriggerItem());
        const remainingOnPrevious = previousItems.filter(
          (t) => !thisAutomationTriggerIds.includes(t.id),
        );
        await previousNode.setTriggers?.(remainingOnPrevious);
      }

      const cdfNode = readCdfNode(updateNodeId);
      const { triggerItems, triggerIds } = matterCdfEventsToTriggerItems(
        data.events,
        updateNodeId,
        sdkAutomation.id,
        cdfNode,
      );
      const node = (await getNode(updateNodeId)) as {
        getTriggers?: () => Promise<{ toTriggerItem: () => TriggerItem }[]>;
        setTriggers?: (items: TriggerItem[]) => Promise<unknown>;
      };
      const existingTriggers = await node.getTriggers?.();
      const existingItems = (existingTriggers ?? []).map((t) => t.toTriggerItem());
      const triggersFromOtherAutomations = existingItems.filter(
        (t) => !thisAutomationTriggerIds.includes(t.id),
      );
      await node.setTriggers?.([...triggersFromOtherAutomations, ...triggerItems]);
      payload.conditions = { and: triggerIds };
    }
    await sdkAutomation.update(payload);
    return { status: "success", description: "Automation updated successfully" };
  };
}

async function resolveMatterAutomationTriggerDetails(
  rmngGroup: ESPRMNGGroup,
  automation: { conditions?: { and?: string[] } },
): Promise<ResolvedAutomationEvents> {
  const andIds = automation.conditions?.and ?? [];
  if (andIds.length === 0) return [];

  const resolved: ResolvedAutomationEvents = [];
  const nodeTriggersCache: Record<
    string,
    { id?: string; path?: string; operator?: string; value?: unknown }[]
  > = {};

  for (const triggerId of andIds) {
    if (typeof triggerId !== "string") continue;
    const nid = triggerId.split("~")[0] ?? "";
    if (!nid) continue;
    try {
      if (!nodeTriggersCache[nid]) {
        const node = await rmngGroup.getNode(nid);
        const list = await node.getTriggers();
        nodeTriggersCache[nid] = list.map((t) => ({
          id: t.id,
          path: t.path,
          operator: t.operator,
          value: t.value,
        }));
      }
      const trigger = nodeTriggersCache[nid].find((tr) => tr.id === triggerId);
      if (!trigger?.path) continue;
      const cdfNode = readCdfNode(nid);
      const { deviceName, param } = parseAutomationPathForCdfNode(
        cdfNode,
        trigger.path,
      );
      resolved.push({
        deviceName,
        param,
        check: trigger.operator ?? "eq",
        value: trigger.value,
      });
    } catch {
      // Non-fatal: skip this trigger
    }
  }
  return resolved;
}

/**
 * Replaces group automation ops so hybrid/pure-Matter nodes use
 * `0x<ep>.0x<cluster>.0x<attr>` trigger/action paths expected by firmware.
 */
export function installMatterAutomationOpsOverride(
  cdfGroup: ESPCDFGroup,
  sdkGroup: ESPRMNGGroup,
  identifier: string,
): void {
  if (!cdfGroup.isMatter) return;

  const baseCreate = cdfGroup.operations.createAutomation;
  if (!baseCreate) return;

  cdfGroup.operations.createAutomation = async (
    automationData: ESPCDFAutomationCreateInput,
  ): Promise<ESPCDFAutomation> => {
    const nodeId = automationData.nodeId;
    if (!nodeId) {
      throw new Error("nodeId is required to create automation");
    }
    const cdfNode = readCdfNode(nodeId);
    const targets = matterCdfActionsToTargets(automationData.actions);
    const automation = await sdkGroup.createAutomation({
      name: automationData.name,
      conditions: { and: [] },
      actions: { targets: [] },
      status: automationData.enabled
        ? ESPRMNG_AUTOMATION_STATUS.ENABLED
        : ESPRMNG_AUTOMATION_STATUS.DISABLED,
      retrigger: automationData.retrigger ?? false,
    });
    const { triggerItems, triggerIds } = matterCdfEventsToTriggerItems(
      automationData.events,
      nodeId,
      automation.id,
      cdfNode,
    );
    if (triggerItems.length > 0) {
      const node = await sdkGroup.getNode(nodeId);
      await Promise.all(triggerItems.map((t) => node.addTrigger(t)));
      await automation.update({
        conditions: { and: triggerIds },
        actions: { targets },
      });
    } else if (targets.length > 0) {
      await automation.update({ actions: { targets } });
    }

    const events = Array.isArray(automationData.events) ? automationData.events : [];
    const resolvedEvents: ResolvedAutomationEvents = events
      .filter(isNodeParamsEvent)
      .map((e) => ({
        deviceName: e.deviceName ?? "",
        param: e.param ?? "",
        check: String(e.check ?? "=="),
        value: e.value,
      }));

    const cdfAutomation = transformToESPCDFAutomation(
      automation,
      identifier,
      buildMatterCdfAutomationTransformOptions(
        automation,
        nodeId,
        resolvedEvents,
        (id) => sdkGroup.getNode(id),
        automationData.actions,
      ),
    );
    wrapAutomationUpdateForMatterPaths(
      cdfAutomation,
      automation,
      nodeId,
      (id) => sdkGroup.getNode(id),
    );
    return cdfAutomation;
  };

  cdfGroup.operations.getAutomations = async (): Promise<
    ESPCDFPaginatedAPIResponse<ESPCDFAutomation[]>
  > => {
    const rawList = await sdkGroup.getAutomations();
    const data = await Promise.all(
      rawList.map(async (automation) => {
        const resolvedEvents = await resolveMatterAutomationTriggerDetails(
          sdkGroup,
          automation,
        );
        const andIds = automation.conditions?.and ?? [];
        const nodeId =
          andIds.length > 0 && typeof andIds[0] === "string"
            ? andIds[0].split("~")[0]
            : undefined;
        const cdfAutomation = transformToESPCDFAutomation(
          automation,
          identifier,
          buildMatterCdfAutomationTransformOptions(
            automation,
            nodeId,
            resolvedEvents,
            (id) => sdkGroup.getNode(id),
          ),
        );
        wrapAutomationUpdateForMatterPaths(
          cdfAutomation,
          automation,
          nodeId,
          (id) => sdkGroup.getNode(id),
        );
        return cdfAutomation;
      }),
    );
    return {
      status: "success",
      description: "Automations fetched successfully",
      data,
      pagination: {
        hasNext: false,
        fetchNext: undefined,
      },
    };
  };
}
