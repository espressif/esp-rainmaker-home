/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPMatterCommissioningAdaptorInterface } from "@espressif/rainmaker-matter-sdk";

import { rejectWebUnsupported } from "@native-adaptors/utils/webPlatform";

/** No-op Matter commissioning adaptor for web */
export const matterCommissioningAdaptor: ESPMatterCommissioningAdaptorInterface = {
  generateCSR: () => rejectWebUnsupported("Matter commissioning"),
  startEcosystemCommissioning: () => rejectWebUnsupported("Matter commissioning"),
  postMessage: () => rejectWebUnsupported("Matter commissioning"),
};

export default matterCommissioningAdaptor;
