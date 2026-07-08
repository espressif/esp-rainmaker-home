/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFNode } from "@store";
import { buildPath } from "@espressif/rmng-base-sdk";
import {
  isRmngMatterHybridCdfNode,
  isRmngPureMatterCdfNode,
} from "./rmngMatterNodeKind";
import { isBridgedRmngMatterCdfNode } from "../bridge/rmngMatterBridgeKind";

type MatterPathRef = {
  endpoint?: string;
  cluster?: string;
  attr?: string;
};

const MATTER_AUTOMATION_PATH = /^0x[0-9a-f]+\.0x[0-9a-f]+\.0x[0-9a-f]+$/i;

function normalizeHexToken(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined;
  const trimmed = value.trim();
  if (/^0x/i.test(trimmed)) return trimmed.toLowerCase();
  const parsed = parseInt(trimmed, 16);
  if (Number.isNaN(parsed)) return undefined;
  return `0x${parsed.toString(16)}`;
}

function readParamMatterPath(param: {
  _matterPath?: MatterPathRef;
  _raw?: { _matterPath?: MatterPathRef };
}): MatterPathRef | undefined {
  return param._matterPath ?? param._raw?._matterPath;
}

/** True when firmware expects `0x<ep>.0x<cluster>.0x<attr>` automation paths. */
export function cdfNodeUsesMatterAutomationPaths(node: ESPCDFNode | undefined): boolean {
  if (!node) return false;
  return (
    isRmngMatterHybridCdfNode(node) ||
    isRmngPureMatterCdfNode(node) ||
    isBridgedRmngMatterCdfNode(node)
  );
}

/**
 * Maps CDF device/param names to firmware Matter data-model path
 * (`0x<endpoint>.0x<cluster>.0x<attribute>`).
 */
export function buildMatterAutomationPathFromCdf(
  cdfNode: ESPCDFNode,
  deviceName: string,
  paramName: string,
): string | undefined {
  const device = cdfNode.devices?.find((d) => (d.name ?? "") === deviceName);
  const param = device?.params?.find((p) => (p.name ?? "") === paramName);
  const matterPath = param ? readParamMatterPath(param) : undefined;
  if (!matterPath) return undefined;

  const endpoint = normalizeHexToken(matterPath.endpoint);
  const cluster = normalizeHexToken(matterPath.cluster);
  const attr = normalizeHexToken(matterPath.attr);
  if (!endpoint || !cluster || !attr) return undefined;
  return `${endpoint}.${cluster}.${attr}`;
}

export function resolveAutomationPathForCdfNode(
  cdfNode: ESPCDFNode | undefined,
  deviceName: string,
  paramName: string,
): string {
  if (cdfNode && cdfNodeUsesMatterAutomationPaths(cdfNode)) {
    const matterPath = buildMatterAutomationPathFromCdf(
      cdfNode,
      deviceName,
      paramName,
    );
    if (matterPath) return matterPath;
  }
  return buildPath(deviceName, paramName);
}

/** Reverse Matter automation path to CDF device/param for UI display. */
export function matterAutomationPathToCdfDeviceParam(
  cdfNode: ESPCDFNode,
  path: string,
): { deviceName: string; param: string } | undefined {
  if (!MATTER_AUTOMATION_PATH.test(path)) return undefined;

  const [ep, cluster, attr] = path.split(".").map((t) => t.toLowerCase());
  for (const device of cdfNode.devices ?? []) {
    for (const param of device.params ?? []) {
      const matterPath = readParamMatterPath(param);
      if (!matterPath) continue;
      if (
        normalizeHexToken(matterPath.endpoint)?.toLowerCase() === ep &&
        normalizeHexToken(matterPath.cluster)?.toLowerCase() === cluster &&
        normalizeHexToken(matterPath.attr)?.toLowerCase() === attr
      ) {
        return {
          deviceName: device.name ?? "",
          param: param.name ?? "",
        };
      }
    }
  }
  return undefined;
}

export function parseAutomationPathForCdfNode(
  cdfNode: ESPCDFNode | undefined,
  path: string,
): { deviceName: string; param: string } {
  if (cdfNode && MATTER_AUTOMATION_PATH.test(path)) {
    const mapped = matterAutomationPathToCdfDeviceParam(cdfNode, path);
    if (mapped?.deviceName && mapped.param) return mapped;
  }
  const parts = path.split(".");
  if (parts.length >= 2) {
    return { deviceName: parts[0], param: parts.slice(1).join(".") };
  }
  return { deviceName: path, param: "" };
}
