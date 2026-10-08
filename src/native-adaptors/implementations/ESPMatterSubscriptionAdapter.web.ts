/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPMatterAdapter } from "@espressif/rainmaker-matter-sdk";

/** Endpoint summary for Matter subscription path derivation */
export interface MatterEndpointSummary {
  endpointId: number;
  serverClusters: number[];
}

const DEFAULT_MIN_INTERVAL_SEC = 1;
const DEFAULT_MAX_INTERVAL_SEC = 30;

/** No-op Matter subscription adaptor for web */
const ESPMatterSubscriptionAdapter: ESPMatterAdapter = {
  initialize: async () => undefined,
  dispose: async () => undefined,
  subscribeToDevice: async () => undefined,
  unsubscribeFromDevice: async () => undefined,
  isDeviceReachable: async () => false,
};

/** No-op rm↔matter id registration on web */
function registerMatterNodeIdMapping(
  _rmNodeId: string,
  _matterNodeId: string,
  _endpoints?: readonly MatterEndpointSummary[],
): void {
  /* no-op */
}

/** No-op bulk rm↔matter id sync on web */
function syncMatterNodeIdMappings(
  _pairs: Iterable<{
    nodeId: string;
    matterNodeId: string;
    matterEndpoints?: readonly MatterEndpointSummary[];
  }>,
): void {
  /* no-op */
}

/** Always returns undefined on web */
function getMatterNodeIdForRmNodeId(_rmNodeId: string): string | undefined {
  return undefined;
}

/** No-op reachability cache on web */
function setMatterNodeReachability(
  _matterNodeId: string,
  _reachable: boolean,
): void {
  /* no-op */
}

export {
  ESPMatterSubscriptionAdapter,
  DEFAULT_MIN_INTERVAL_SEC,
  DEFAULT_MAX_INTERVAL_SEC,
  registerMatterNodeIdMapping,
  syncMatterNodeIdMappings,
  getMatterNodeIdForRmNodeId,
  setMatterNodeReachability,
};

export default ESPMatterSubscriptionAdapter;
