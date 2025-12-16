/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ESPRMNode,
  ESPRMService,
  ESPRMServiceParam,
} from "@espressif/rainmaker-base-sdk";
import { READ_PERMISSION, WRITE_PERMISSION, ESPRM_SYSTEM_SERVICE } from "./constants";

/**
 * System parameter types
 */
export const SYSTEM_PARAM_TYPES = {
  REBOOT: "esp.param.reboot",
  FACTORY_RESET: "esp.param.factory-reset",
  WIFI_RESET: "esp.param.wifi-reset",
} as const;

/**
 * Gets the system service and available parameters from a node's configuration
 *
 * @param node - The ESP Rainmaker node to check for system service support
 * @returns Object containing the system service and available parameters
 *
 * @example
 * const { systemService, availableParams } = getNodeSystemConfig(node);
 * if (systemService && availableParams.length > 0) {
 *   console.log('Available system operations:', availableParams.map(p => p.name));
 * }
 */
export const getNodeSystemConfig = (node: ESPRMNode | undefined) => {
  if (!node?.nodeConfig?.services) {
    return {
      systemService: undefined,
      availableParams: [],
    };
  }

  const systemService: ESPRMService | undefined = node.nodeConfig.services.find(
    (service) => service.type === ESPRM_SYSTEM_SERVICE
  );

  if (!systemService) {
    return {
      systemService: undefined,
      availableParams: [],
    };
  }

  /* Get all available system parameters that have write permission */
  const availableParams: ESPRMServiceParam[] =
    systemService.params?.filter(
      (param) =>
        (param.type === SYSTEM_PARAM_TYPES.REBOOT ||
          param.type === SYSTEM_PARAM_TYPES.FACTORY_RESET ||
          param.type === SYSTEM_PARAM_TYPES.WIFI_RESET) &&
        param.properties?.includes(READ_PERMISSION) &&
        param.properties?.includes(WRITE_PERMISSION)
    ) || [];

  return {
    systemService,
    availableParams,
  };
};


