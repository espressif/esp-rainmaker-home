/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { makeObservable, observable } from "mobx";
import type { ESPCDFDevice, ESPCDFNode } from "@store";
import {
  ESPRM_NAME_PARAM_TYPE,
  MATTER_METADATA_DEVICE_NAME_KEY,
  MATTER_METADATA_KEY,
} from "@shared/utils/constants";

/**
 * Resolves the user-visible label for a CDF device.
 * Precedence: name param → Matter metadata deviceName → device id → node label.
 * Name param wins so remote renames via `esp.param.name` are not masked by stale metadata.
 * @param cdfDevice - Device on the CDF node
 * @param nodeLabel - Optional node info name fallback
 * @param matterDeviceName - Optional Matter metadata `deviceName`
 * @returns Resolved display name (may be empty)
 */
export function resolveCdfDeviceDisplayName(
  cdfDevice: ESPCDFDevice,
  nodeLabel?: string,
  matterDeviceName?: string,
): string {
  const nameParam = cdfDevice.params?.find(
    (param) => param.type === ESPRM_NAME_PARAM_TYPE,
  );
  const fromNameParam = nameParam?.value as string | undefined;
  if (typeof fromNameParam === "string" && fromNameParam.trim().length > 0) {
    return fromNameParam;
  }

  if (typeof matterDeviceName === "string" && matterDeviceName.trim().length > 0) {
    return matterDeviceName;
  }

  return cdfDevice.name || nodeLabel || "";
}

/**
 * Reads Matter metadata device name from a CDF node, when present.
 * @param cdfNode - Parent CDF node
 * @returns Metadata device name or `undefined`
 */
export function readMatterMetadataDeviceName(
  cdfNode: ESPCDFNode,
): string | undefined {
  const metadata = cdfNode.metadata as Record<string, unknown> | undefined;
  const matter = metadata?.[MATTER_METADATA_KEY] as
    | Record<string, unknown>
    | undefined;
  const name = matter?.[MATTER_METADATA_DEVICE_NAME_KEY];
  return typeof name === "string" ? name : undefined;
}

/**
 * Writes `displayName` on one CDF device from current params, Matter metadata, and node label.
 * @param cdfNode - Parent CDF node
 * @param deviceName - Internal device name on the node
 */
export function syncCdfDeviceDisplayName(
  cdfNode: ESPCDFNode,
  deviceName: string,
): void {
  const cdfDevice = cdfNode.devices?.find((device) => device.name === deviceName);
  if (!cdfDevice) {
    return;
  }

  const resolved = resolveCdfDeviceDisplayName(
    cdfDevice,
    cdfNode.nodeConfig?.info?.name,
    readMatterMetadataDeviceName(cdfNode),
  );
  if (resolved) {
    cdfDevice.displayName = resolved;
  }
}

/**
 * Marks each device/service param's `value` field as MobX-observable so
 * in-place mutations from live shadow pushes trigger observer re-renders.
 * Idempotent — safe to call again on a re-transformed node.
 * @param cdfNode - CDF node to instrument.
 */
export function makeCdfNodeParamsObservable(cdfNode: ESPCDFNode): void {
  for (const device of cdfNode.devices ?? []) {
    for (const param of device.params ?? []) {
      try {
        makeObservable(param, { value: observable });
      } catch (error) {
        // Already instrumented.
        console.debug(
          "[makeCdfNodeParamsObservable] Device param already observable",
          { nodeId: cdfNode.id, deviceName: device.name, paramName: param.name, error },
        );
      }
    }
  }
  for (const service of cdfNode.services ?? []) {
    for (const param of service.params ?? []) {
      try {
        makeObservable(param, { value: observable });
      } catch (error) {
        // Already instrumented.
        console.debug(
          "[makeCdfNodeParamsObservable] Service param already observable",
          { nodeId: cdfNode.id, serviceName: service.name, paramName: param.name, error },
        );
      }
    }
  }
}
