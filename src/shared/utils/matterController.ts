/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ESPRM_MATTER_CONTROLLER_SERVICE,
  ESPRM_MATTER_CONTROLLER_SETUP_SERVICE,
  MATTER_CTL_CMD_PARAM_NAME,
  MATTER_CTL_CMD_UPDATE_DEVICE_LIST,
  WRITE_PERMISSION,
} from "@shared/utils/constants";
import {
  ESPCDFNode,
  ESPCDFService,
  ESPCDFServiceParam,
} from "@store";

/** Resolved Matter controller service and writable `MTCtlCMD` param on a node. */
export interface MatterControllerConfig {
  service: ESPCDFService | undefined;
  mtCtlCmdParam: ESPCDFServiceParam | undefined;
  canUpdateDeviceList: boolean;
}

/**
 * Resolves the Matter controller (or setup) service and device-list command param.
 * @param node - CDF node to inspect
 * @returns Service handles and whether a device-list refresh can be sent
 */
export const getMatterControllerConfig = (
  node: ESPCDFNode | undefined,
): MatterControllerConfig => {
  if (!node?.services?.length) {
    return {
      service: undefined,
      mtCtlCmdParam: undefined,
      canUpdateDeviceList: false,
    };
  }

  const service =
    node.services.find(
      (entry) => entry.type === ESPRM_MATTER_CONTROLLER_SERVICE,
    ) ??
    node.services.find(
      (entry) => entry.type === ESPRM_MATTER_CONTROLLER_SETUP_SERVICE,
    );

  if (!service) {
    return {
      service: undefined,
      mtCtlCmdParam: undefined,
      canUpdateDeviceList: false,
    };
  }

  const mtCtlCmdParam = service.params?.find(
    (param) => param.name === MATTER_CTL_CMD_PARAM_NAME,
  );

  const canUpdateDeviceList = Boolean(
    mtCtlCmdParam?.properties?.includes(WRITE_PERMISSION),
  );

  return {
    service,
    mtCtlCmdParam,
    canUpdateDeviceList,
  };
};

/**
 * Requests a Matter controller device-list refresh via cloud `MTCtlCMD = 2`.
 * @param node - Target CDF node
 * @param config - Resolved Matter controller service from {@link getMatterControllerConfig}
 */
export const updateMatterControllerDeviceList = async (
  node: ESPCDFNode,
  config: MatterControllerConfig,
): Promise<void> => {
  const { service, mtCtlCmdParam } = config;

  if (!service || !mtCtlCmdParam) {
    return;
  }

  await node.setMultipleParams({
    [service.name]: [
      {
        [mtCtlCmdParam.name]: MATTER_CTL_CMD_UPDATE_DEVICE_LIST,
      },
    ],
  });
};
