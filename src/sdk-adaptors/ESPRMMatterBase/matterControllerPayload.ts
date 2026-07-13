/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPNodeUpdateData } from "@espressif/rainmaker-base-sdk";
import { RMAKER_EVENT_NODE_PARAMS_CHANGED } from "@shared/utils/constants";
import {
  MATTER_CTL_SETUP_NOTIFICATION_KEY,
  MATTER_CTL_SETUP_PARAM_MT_DEVICES_NOTIFICATION_KEY,
  MATTER_CTL_SETUP_PAYLOAD_ATTRIBUTES_KEY,
  MATTER_CTL_SETUP_PAYLOAD_CLUSTERS_KEY,
  MATTER_CTL_SETUP_PAYLOAD_CLUSTER_SERVERS_KEY,
  MATTER_NODE_UPDATE_SOURCE,
} from "./constants";

/** One Matter fabric device entry reported by the controller setup service. */
export interface ControllerMTNode {
  endpoints?: unknown;
  rainmaker_node_id?: string;
  online?: boolean;
}

/** Map of Matter fabric device id → controller-reported device entry. */
export interface ControllerMTNodeMap {
  [matterFabricDeviceId: string]: ControllerMTNode;
}

/** Parsed `MatterCTLSetup` notification / shadow fragment. */
export interface ParsedMatterCtlSetup {
  mtDevices: ControllerMTNodeMap;
}

/** Reachability slice used to wire `matter_controller` transport on peer nodes. */
export interface MtDeviceReachability {
  rainmaker_node_id: string;
  online: boolean;
}

/**
 * Normalizes a notification payload to a plain object (parses JSON strings).
 * @param payload - Raw update payload from subscription or notification channel
 * @returns Parsed object, or null when payload is missing or invalid JSON
 */
export function parseNotificationPayloadObject(
  payload: unknown,
): Record<string, unknown> | null {
  if (!payload) {
    return null;
  }
  if (typeof payload === "string") {
    try {
      return JSON.parse(payload) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (typeof payload === "object") {
    return payload as Record<string, unknown>;
  }
  return null;
}

/**
 * Returns whether the payload is a controller setup notification (`MatterCTLSetup`).
 * @param payload - Raw update payload (object or JSON string)
 * @returns True when the payload contains a `MatterCTLSetup` key
 */
export function isMatterCtlSetupNotificationPayload(payload: unknown): boolean {
  const parsed = parseNotificationPayloadObject(payload);
  if (!parsed) {
    return false;
  }
  return MATTER_CTL_SETUP_NOTIFICATION_KEY in parsed;
}

/**
 * Extracts the `MatterCTLSetup.MTDevices` map from a notification payload.
 * @param payload - Raw update payload (object or JSON string)
 * @returns Parsed setup with MTDevices map, or null when absent
 */
export function parseMatterCtlSetupPayload(
  payload: unknown,
): ParsedMatterCtlSetup | null {
  const parsed = parseNotificationPayloadObject(payload);
  if (!parsed) {
    return null;
  }

  const setup = parsed[MATTER_CTL_SETUP_NOTIFICATION_KEY] as
    | Record<string, unknown>
    | undefined;
  const mtDevices = setup?.[MATTER_CTL_SETUP_PARAM_MT_DEVICES_NOTIFICATION_KEY] as
    | ControllerMTNodeMap
    | undefined;

  if (!mtDevices || typeof mtDevices !== "object") {
    return null;
  }

  return { mtDevices };
}

/**
 * Pulls online/offline reachability from an MTDevices map.
 * Entries without an explicit `online` boolean or `rainmaker_node_id` are skipped.
 * @param mtDevices - Matter fabric device id → controller-reported entry map
 * @returns Reachability entries for transport wiring
 */
export function extractMtDeviceReachability(
  mtDevices: ControllerMTNodeMap,
): MtDeviceReachability[] {
  const reachability: MtDeviceReachability[] = [];
  for (const node of Object.values(mtDevices)) {
    if (typeof node?.online !== "boolean" || !node.rainmaker_node_id) {
      continue;
    }
    reachability.push({
      rainmaker_node_id: node.rainmaker_node_id,
      online: node.online,
    });
  }
  return reachability;
}

/**
 * Parses `0x6` / `6` style ids from controller setup payload keys.
 * @param key - Endpoint, cluster, or attribute key
 * @returns Parsed id, or null
 */
function parseCtlHexId(key: string): number | null {
  const trimmed = key.trim();
  const parsed = trimmed.startsWith("0x") || trimmed.startsWith("0X")
    ? Number.parseInt(trimmed.slice(2), 16)
    : Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Maps one `MatterCTLSetup` push to peer `ESPNodeUpdateData` (1 event → 1 update).
 * @param rawPayload - Controller update payload (object or JSON string)
 * @param timestamp - Event timestamp; defaults to `Date.now()`
 * @returns Synthetic peer update for `handleNodeUpdate`, or null when unparseable
 */
export function matterCtlSetupToSingleNodeUpdate(
  rawPayload: unknown,
  timestamp: number = Date.now(),
): ESPNodeUpdateData | null {
  const setup = parseMatterCtlSetupPayload(rawPayload);
  if (!setup) {
    return null;
  }

  const mtNode = Object.values(setup.mtDevices)[0];
  const nodeId = mtNode?.rainmaker_node_id;
  if (!nodeId) {
    return null;
  }

  const endpoints = mtNode.endpoints as Record<string, unknown> | undefined;
  const endpointEntries = Object.entries(endpoints ?? {});
  if (!endpointEntries.length) {
    return null;
  }
  const [endpointKey, endpoint] = endpointEntries[0];
  const endpointId = parseCtlHexId(endpointKey);
  if (endpointId === null || !endpoint || typeof endpoint !== "object") {
    return null;
  }

  const clusters = (endpoint as Record<string, unknown>)[
    MATTER_CTL_SETUP_PAYLOAD_CLUSTERS_KEY
  ] as Record<string, unknown> | undefined;
  const serverEntries = Object.entries(
    (clusters?.[MATTER_CTL_SETUP_PAYLOAD_CLUSTER_SERVERS_KEY] as
      | Record<string, unknown>
      | undefined) ?? {},
  );
  if (!serverEntries.length) {
    return null;
  }
  const [clusterKey, cluster] = serverEntries[0];
  const clusterId = parseCtlHexId(clusterKey);
  if (clusterId === null || !cluster || typeof cluster !== "object") {
    return null;
  }

  const attrEntries = Object.entries(
    ((cluster as Record<string, unknown>)[
      MATTER_CTL_SETUP_PAYLOAD_ATTRIBUTES_KEY
    ] as Record<string, unknown> | undefined) ?? {},
  );
  if (!attrEntries.length) {
    return null;
  }
  const [attrKey, rawValue] = attrEntries[0];
  const attributeId = parseCtlHexId(attrKey);
  if (attributeId === null) {
    return null;
  }

  return {
    nodeId,
    source: MATTER_NODE_UPDATE_SOURCE,
    eventType: RMAKER_EVENT_NODE_PARAMS_CHANGED,
    metadata: { endpointId, clusterId, attributeId, timestamp },
    payload: {
      [`cluster_${clusterId}_attr_${attributeId}`]: rawValue,
    },
  };
}
