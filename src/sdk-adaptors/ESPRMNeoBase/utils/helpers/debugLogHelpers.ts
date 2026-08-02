/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "../logger";

const MAX_STRING_PREVIEW = 48;

/**
 * Produces a compact, non-recursive preview of a diagnostic value.
 * @param value - Value to preview.
 * @returns Primitive value or compact collection marker.
 */
function preview(
  value: unknown,
): string | number | boolean | null | undefined {
  if (value == null) {
    return value as null | undefined;
  }
  if (typeof value === "string") {
    return value.length <= MAX_STRING_PREVIEW
      ? value
      : `${value.slice(0, MAX_STRING_PREVIEW)}…(${value.length}c)`;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return `[array:${value.length}]`;
  }
  if (typeof value === "object") {
    return `{obj:${Object.keys(value as object).length}k}`;
  }
  return String(value);
}

/**
 * Snapshots an SDK group into a compact diagnostic shape (no fabric fields).
 * @param item - SDK group value.
 * @returns Compact diagnostic snapshot.
 */
function snapshotSdkGroup(item: unknown): unknown {
  if (item == null || typeof item !== "object") {
    return item;
  }

  const group = item as {
    groupId?: unknown;
    groupName?: unknown;
    accessType?: unknown;
    parentId?: unknown;
    nodeIds?: unknown;
    node_ids?: unknown;
    subgroups?: unknown[];
  };

  const nodeIdsList = Array.isArray(group.nodeIds)
    ? group.nodeIds
    : Array.isArray(group.node_ids)
      ? group.node_ids
      : [];

  return {
    groupId: group.groupId,
    groupName: group.groupName,
    accessType: group.accessType,
    parentId: group.parentId,
    nodeIds: nodeIdsList.map((id) => preview(id)),
    subgroupsCount: Array.isArray(group.subgroups)
      ? group.subgroups.length
      : 0,
    subgroups: Array.isArray(group.subgroups)
      ? group.subgroups.map(snapshotSdkGroup)
      : undefined,
  };
}

/**
 * Snapshots a raw group API row into a compact diagnostic shape.
 * @param group - Raw API group row.
 * @returns Compact raw group snapshot.
 */
function snapshotRawApiGroup(group: unknown): unknown {
  if (group == null || typeof group !== "object") {
    return group;
  }

  const record = group as Record<string, unknown>;
  return {
    group_id: record.group_id,
    group_name: record.group_name,
    node_ids: Array.isArray(record.node_ids)
      ? record.node_ids.map((id) => preview(id))
      : [],
  };
}

/**
 * Snapshots a raw groups API response.
 * @param raw - Raw groups API response.
 * @returns Compact response snapshot.
 */
function snapshotRawApiResponse(raw: unknown): unknown {
  if (raw == null || typeof raw !== "object") {
    return raw;
  }

  const response = raw as { groups?: unknown[] };
  return {
    groupsCount: Array.isArray(response.groups) ? response.groups.length : 0,
    groups: Array.isArray(response.groups)
      ? response.groups.map(snapshotRawApiGroup)
      : undefined,
  };
}

/**
 * Selects the appropriate compact diagnostic summary for a groups payload.
 * @param payload - Raw diagnostic payload.
 * @returns Compact diagnostic representation.
 */
function summarizeGroupsPayload(payload: unknown): unknown {
  if (payload == null) {
    return payload;
  }

  if (Array.isArray(payload)) {
    return payload.map(snapshotSdkGroup);
  }

  if (typeof payload !== "object") {
    return payload;
  }

  const record = payload as Record<string, unknown>;

  if ("rawApiResponse" in record || "sdkGroups" in record) {
    return {
      rawApiResponse: snapshotRawApiResponse(record.rawApiResponse),
      sdkGroups: Array.isArray(record.sdkGroups)
        ? record.sdkGroups.map(snapshotSdkGroup)
        : snapshotSdkGroup(record.sdkGroups),
      ...(record.groupId != null ? { groupId: record.groupId } : {}),
      ...(record.groupName != null ? { groupName: record.groupName } : {}),
      ...(record.rawApiGroup != null
        ? { rawApiGroup: snapshotRawApiGroup(record.rawApiGroup) }
        : {}),
    };
  }

  return snapshotSdkGroup(payload);
}

/**
 * Writes a compact JSON diagnostic summary.
 * @param tag - Diagnostic category tag.
 * @param source - Calling source label.
 * @param payload - Raw payload to summarize.
 */
function logSummary(tag: string, source: string, payload: unknown): void {
  if (!__DEV__) {
    return;
  }

  const summary = summarizeGroupsPayload(payload);
  Logger.log(`${tag} ${source} ${JSON.stringify(summary)}`);
}

/**
 * Logs raw getGroups payloads as a compact groups-only summary.
 * @param source - Calling source label.
 * @param payload - Raw groups payload.
 */
export function logRmneoGroupsRaw(source: string, payload: unknown): void {
  logSummary("[groups]", source, payload);
}

/**
 * Summarizes node config/schema without dumping nested cloud config.
 * @param payload - Raw node config payload.
 * @returns Compact node config summary.
 */
function summarizeNodeConfig(payload: unknown): unknown {
  if (payload == null || typeof payload !== "object") {
    return preview(payload);
  }

  const record = payload as Record<string, unknown>;
  const keys = Object.keys(record);
  const summary: Record<string, unknown> = {
    topLevelKeys: keys,
  };

  if (record.Matter != null && typeof record.Matter === "object") {
    const matter = record.Matter as Record<string, unknown>;
    summary.Matter = {
      keys: Object.keys(matter),
      endpointsCount:
        matter.endpoints && typeof matter.endpoints === "object"
          ? Object.keys(matter.endpoints as object).length
          : 0,
    };
  }

  if (record.Info != null && typeof record.Info === "object") {
    const info = record.Info as Record<string, unknown>;
    summary.Info = {
      keys: Object.keys(info),
      node_id: preview(info.node_id ?? info.nodeId),
    };
  }

  if (Array.isArray(record.devices)) {
    summary.devicesCount = record.devices.length;
  }

  if (record.endpoints != null && typeof record.endpoints === "object") {
    summary.endpointsCount = Object.keys(record.endpoints as object).length;
  }

  if (record.data_model != null) {
    summary.data_model = preview(record.data_model);
  }

  if (record.config != null && typeof record.config === "object") {
    const inner = record.config as Record<string, unknown>;
    summary.configKeys = Object.keys(inner);
    if (Array.isArray(inner.devices)) {
      summary.configDevicesCount = inner.devices.length;
    }
    if (inner.data_model != null) {
      summary.configDataModel = preview(inner.data_model);
    }
    if (inner.endpoints != null && typeof inner.endpoints === "object") {
      summary.configEndpointsCount = Object.keys(
        inner.endpoints as object,
      ).length;
    }
  }

  return summary;
}

/**
 * Summarizes device parameter values as names and short previews.
 * @param payload - Raw device parameter map.
 * @returns Compact device parameter summary.
 */
function summarizeDeviceParams(payload: unknown): unknown {
  if (payload == null || typeof payload !== "object") {
    return preview(payload);
  }

  const record = payload as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    out[key] = preview(value);
  }
  return out;
}

/**
 * Logs a node config/schema summary at CDF build.
 * @param source - Calling source label.
 * @param nodeId - Node identifier.
 * @param payload - Raw node config payload.
 * @param extra - Additional compact metadata.
 */
export function logRmneoNodeConfigRaw(
  source: string,
  nodeId: string,
  payload: unknown,
  extra?: Record<string, unknown>,
): void {
  if (!__DEV__) {
    return;
  }

  const summary: Record<string, unknown> = {
    nodeId,
    payload: summarizeNodeConfig(payload),
  };
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      summary[key] = preview(value);
    }
  }
  Logger.log(`[node-config] ${source} ${JSON.stringify(summary)}`);
}

/**
 * Logs device parameter values as names and short previews only.
 * @param source - Calling source label.
 * @param nodeId - Node identifier.
 * @param transport - Transport or source used to retrieve the values.
 * @param payload - Raw device parameter payload.
 * @param extra - Additional compact metadata.
 */
export function logRmneoDeviceParamsRaw(
  source: string,
  nodeId: string,
  transport: "mqtt" | "matter" | "sdk-getParams" | "initial",
  payload: unknown,
  extra?: Record<string, unknown>,
): void {
  if (!__DEV__) {
    return;
  }

  const summary: Record<string, unknown> = {
    nodeId,
    transport,
    payload: summarizeDeviceParams(payload),
  };
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      summary[key] = preview(value);
    }
  }
  Logger.log(`[device-params] ${source} ${JSON.stringify(summary)}`);
}
