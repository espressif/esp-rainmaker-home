/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { READ_PERMISSION, WRITE_PERMISSION, ESPRM_SYSTEM_SERVICE } from "@shared/utils/constants";
import { ESPCDFNode, ESPCDFService, ESPCDFServiceParam } from "@store";

/**
 * Firmware system parameter types.
 *
 * Note: Different backends may expose different identifiers for the same logical
 * system operation. Always resolve backend-specific operations through
 * `getSystemOperation()` and use the returned `SYSTEM_OPERATION` value in the UI
 * to ensure consistent behavior across all supported backends.
 */
export const SYSTEM_PARAM_TYPES = {
  REBOOT: "esp.param.reboot",
  FACTORY_RESET: "esp.param.factory-reset",
  WIFI_RESET: "esp.param.wifi-reset",
  NETWORK_RESET: "esp.param.network-reset"
} as const;

/**
 * Logical, firmware-agnostic system operations the UI renders.
 * Several firmware param types can collapse onto one operation (e.g. wifi-reset
 * and network-reset both map to NETWORK_RESET).
 */
export const SYSTEM_OPERATION = {
  REBOOT: "reboot",
  NETWORK_RESET: "network-reset",
  FACTORY_RESET: "factory-reset",
} as const;

export type SystemOperation =
  (typeof SYSTEM_OPERATION)[keyof typeof SYSTEM_OPERATION];

/** Maps each firmware param type to its logical operation. */
const PARAM_TYPE_TO_OPERATION: Record<string, SystemOperation> = {
  [SYSTEM_PARAM_TYPES.REBOOT]: SYSTEM_OPERATION.REBOOT,
  [SYSTEM_PARAM_TYPES.WIFI_RESET]: SYSTEM_OPERATION.NETWORK_RESET,
  [SYSTEM_PARAM_TYPES.NETWORK_RESET]: SYSTEM_OPERATION.NETWORK_RESET,
  [SYSTEM_PARAM_TYPES.FACTORY_RESET]: SYSTEM_OPERATION.FACTORY_RESET,
};

/**
 * Resolves the logical operation for a system param, collapsing backend-specific
 * type names (wifi-reset / network-reset) onto a single concept.
 * @param param - System service param to classify.
 * @returns The logical operation, or undefined if the param is not a known operation.
 */
export const getSystemOperation = (
  param: ESPCDFServiceParam,
): SystemOperation | undefined => PARAM_TYPE_TO_OPERATION[param.type];

/**
 * Gets the system service and available parameters from a node's configuration
 * @param node - The ESP Rainmaker node to check for system service support
 * @returns Object containing the system service and available parameters
 * @example
 * const { systemService, availableParams } = getNodeSystemConfig(node);
 * if (systemService && availableParams.length > 0) {
 *   console.log('Available system operations:', availableParams.map(p => p.name));
 * }
 */
export const getNodeSystemConfig = (node: ESPCDFNode | undefined) => {
  if (!node || !node.services) {
    return {
      systemService: undefined,
      availableParams: [],
    };
  }
  const systemService: ESPCDFService | undefined = node.services?.find(
    (service) => service.type === ESPRM_SYSTEM_SERVICE
  );

  if (!systemService) {
    return {
      systemService: undefined,
      availableParams: [],
    };
  }

  /* Keep writable params that map to a known logical operation. */
  const availableParams: ESPCDFServiceParam[] =
    systemService.params?.filter(
      (param) =>
        getSystemOperation(param) !== undefined &&
        param.properties?.includes(READ_PERMISSION) &&
        param.properties?.includes(WRITE_PERMISSION)
    ) || [];

  return {
    systemService,
    availableParams,
  };
};


