/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFDevice, ESPCDFNode } from "@store";
import { ESPRM_NAME_PARAM_TYPE } from "@shared/utils/constants";

/**
 * Resolves the user-visible label for a CDF device from the name param,
 * internal device id, then the parent node label.
 *
 * @param cdfDevice - Device on the CDF node
 * @param nodeLabel - Optional node info name fallback
 * @returns Resolved display name (may be empty)
 */
export function resolveCdfDeviceDisplayName(
  cdfDevice: ESPCDFDevice,
  nodeLabel?: string,
): string {
  const nameParam = cdfDevice.params?.find(
    (param) => param.type === ESPRM_NAME_PARAM_TYPE,
  );
  const fromNameParam = nameParam?.value as string | undefined;
  if (fromNameParam) {
    return fromNameParam;
  }

  return cdfDevice.name || nodeLabel || "";
}

/**
 * Writes `displayName` on one CDF device from current params and node label.
 *
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
  );
  if (resolved) {
    cdfDevice.displayName = resolved;
  }
}
