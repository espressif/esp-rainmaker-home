/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  DiscoveryParamsInterface,
  ESPLocalDiscoveryAdapterInterface,
} from "@store";

const noopCleanup = async () => undefined;

/** No-op Matter mDNS discovery adaptor for web */
export const matterLocalDiscoveryAdapter: ESPLocalDiscoveryAdapterInterface & {
  stopDiscoveryForType: (serviceType: string) => Promise<void>;
  addLostListener: (
    callback: (data: Record<string, unknown>) => void,
    params?: DiscoveryParamsInterface,
  ) => Promise<() => void>;
} = {
  startDiscovery: async () => noopCleanup,
  stopDiscovery: noopCleanup,
  stopDiscoveryForType: noopCleanup,
  addLostListener: async () => () => undefined,
};

export {
  getMatterDiscoveryTargetNodeIds,
  setMatterDiscoveryTargetNodeIds,
  syncMatterDiscoveryTargetNodeIds,
} from "./matterDiscoveryTargets.web";
export default matterLocalDiscoveryAdapter;
