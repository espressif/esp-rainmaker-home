/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPLocalControlAdapterInterface } from "@store";

import { rejectWebUnsupported } from "@native-adaptors/utils/webPlatform";

const ESPLocalControlAdapter: ESPLocalControlAdapterInterface & {
  disconnect: (nodeId: string) => Promise<void>;
} = {
  isConnected: async () => false,
  connect: async () => rejectWebUnsupported("local control"),
  sendData: async () => rejectWebUnsupported("local control"),
  disconnect: async () => undefined,
};

export default ESPLocalControlAdapter;
