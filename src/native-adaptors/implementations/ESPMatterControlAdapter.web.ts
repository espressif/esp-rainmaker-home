/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ESPMatterAttributeReadResult,
  ESPMatterAttributeReport,
  ESPMatterControlAdapterInterface,
  ESPMatterControlResult,
  ESPMatterInitConfig,
  ESPMatterSubscribeAttribute,
  ESPMatterSubscribeResult,
} from "@espressif/rainmaker-matter-sdk";

import { rejectWebUnsupported } from "@native-adaptors/utils/webPlatform";

const unsupportedResult = (): Promise<ESPMatterControlResult> =>
  rejectWebUnsupported("Matter local control");

/** No-op Matter control adaptor for web */
export const ESPMatterControlAdapter: ESPMatterControlAdapterInterface = {
  init: (_config: ESPMatterInitConfig) => unsupportedResult(),
  shutdown: () => unsupportedResult(),
  read: (): Promise<ESPMatterAttributeReadResult> =>
    rejectWebUnsupported("Matter local control"),
  write: () => unsupportedResult(),
  invoke: () => unsupportedResult(),
  subscribe: (
    _matterNodeId: string,
    _attributes: ESPMatterSubscribeAttribute[],
    _onReport: (report: ESPMatterAttributeReport) => void,
  ): Promise<ESPMatterSubscribeResult> =>
    rejectWebUnsupported("Matter local control"),
};

export default ESPMatterControlAdapter;
