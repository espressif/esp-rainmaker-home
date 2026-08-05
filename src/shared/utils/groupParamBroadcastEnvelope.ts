/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFDevice, ESPCDFDeviceParam } from "@store";
import {
  GROUP_PARAM_BROADCAST_ENVELOPE_TOP_LEVEL_KEY,
  GROUP_PARAM_BROADCAST_FIELD_TARGETS,
  GROUP_PARAM_BROADCAST_FIELD_VALUE,
  GROUP_PARAM_BROADCAST_TARGET_ROW_DEVICE_KEY,
  GROUP_PARAM_BROADCAST_TARGET_ROW_PARAM_KEY,
} from "@shared/utils/constants";

/** One device plus the exact device param instance that should receive the broadcast value. */
export interface GroupParamBroadcastTargetRow {
  device: ESPCDFDevice;
  param: ESPCDFDeviceParam;
}

/**
 * Parsed group param broadcast envelope produced by {@link buildGroupParamBroadcastSetParamsPayload}
 * and consumed by SDK adaptors in {@link ESPCDFGroup.setParams}.
 */
export interface GroupParamBroadcastEnvelope {
  value: unknown;
  /** One row per member; `param` may differ by name across devices even when `type` matches. */
  targets: GroupParamBroadcastTargetRow[];
}

/** Options passed to {@link broadcastGroupParam} for error handling. */
export interface GroupParamBroadcastOptions {
  /** Invoked when {@link ESPCDFGroup.setParams} rejects (e.g. transport / API error). */
  onSetParamsError?: (err: unknown) => void;
}

/**
 * Returns the param type string used when keying control payloads, falling back to the param name
 * when type is unset (matches RainMaker Neo-style `params` maps).
 * @param param The concrete param row (member device or template)
 * @returns Stable key for adaptor lookups on the wire
 */
export function resolveGroupParamBroadcastTypeKey(
  param: ESPCDFDeviceParam
): string {
  const paramType = param.type;
  if (paramType) return paramType;
  return param.name;
}

/**
 * Wraps value and per-device param rows in the adaptor-recognized `setParams` payload.
 * @param value Value to publish
 * @param targets Member devices with their concrete param instances
 * @returns Payload for {@link ESPCDFGroup.setParams}, or null when `targets` is empty
 */
export function buildGroupParamBroadcastSetParamsPayload(
  value: unknown,
  targets: GroupParamBroadcastTargetRow[]
): Record<string, Record<string, unknown>> | null {
  const rows = targets.filter((t) => t.device != null && t.param != null);
  if (rows.length === 0) {
    return null;
  }
  const body: Record<string, unknown> = {
    [GROUP_PARAM_BROADCAST_FIELD_VALUE]: value,
    [GROUP_PARAM_BROADCAST_FIELD_TARGETS]: rows.map((t) => ({
      [GROUP_PARAM_BROADCAST_TARGET_ROW_DEVICE_KEY]: t.device,
      [GROUP_PARAM_BROADCAST_TARGET_ROW_PARAM_KEY]: t.param,
    })),
  };
  return {
    [GROUP_PARAM_BROADCAST_ENVELOPE_TOP_LEVEL_KEY]: body,
  };
}

/**
 * Extracts a {@link GroupParamBroadcastEnvelope} from a `setParams` payload when present.
 * @param payload Incoming {@link ESPCDFGroup.setParams} argument
 * @returns Parsed envelope, or null when the payload is not a group param broadcast
 */
export function parseGroupParamBroadcastEnvelope(
  payload: Record<string, Record<string, unknown>>
): GroupParamBroadcastEnvelope | null {
  const body = payload[GROUP_PARAM_BROADCAST_ENVELOPE_TOP_LEVEL_KEY];
  if (body == null || typeof body !== "object") {
    return null;
  }
  const value = body[GROUP_PARAM_BROADCAST_FIELD_VALUE];
  const targetsRaw = body[GROUP_PARAM_BROADCAST_FIELD_TARGETS];
  if (!Array.isArray(targetsRaw)) {
    return null;
  }
  const targets: GroupParamBroadcastTargetRow[] = [];
  for (const item of targetsRaw) {
    if (item == null || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const device = rec[GROUP_PARAM_BROADCAST_TARGET_ROW_DEVICE_KEY] as
      | ESPCDFDevice
      | undefined;
    const param = rec[GROUP_PARAM_BROADCAST_TARGET_ROW_PARAM_KEY] as
      | ESPCDFDeviceParam
      | undefined;
    if (device != null && param != null) {
      targets.push({ device, param });
    }
  }
  if (targets.length === 0) {
    return null;
  }
  return { value, targets };
}
