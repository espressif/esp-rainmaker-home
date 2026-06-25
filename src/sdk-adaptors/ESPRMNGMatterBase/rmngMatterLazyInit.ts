/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPRMNGGroup } from "@espressif/rmng-base-sdk";
import type { ESPCDFNode } from "@store";
import { ensureRmngMatterSdkConfigured } from "./ensureMatterSDK";
import { isRmngMatterCapableGroup } from "./utils/rmngMatterGroupDetection";
import { isRmngOnlyGroupNodeDetails } from "./utils/rmngGroupNodeDetailsContext";
import {
  isRmngMatterHybridCdfNode,
  isRmngPureMatterCdfNode,
} from "./utils/rmngMatterNodeKind";

/** True when any home has Matter/hybrid nodes (not RMNG-only `node_details`). */
export function groupsNeedMatterSdk(groups: ESPRMNGGroup[]): boolean {
  return groups.some((group) => {
    if (isSubgroupLike(group)) {
      return false;
    }
    if (!isRmngMatterCapableGroup(group)) {
      return false;
    }
    return !isRmngOnlyGroupNodeDetails(group.nodeDetails, group.nodeIds ?? []);
  });
}

/** True when subscribe-all should register the Matter subscription channel. */
export function cdfNodesNeedMatterSubscription(nodes: ESPCDFNode[]): boolean {
  return nodes.some(
    (node) => isRmngPureMatterCdfNode(node) || isRmngMatterHybridCdfNode(node),
  );
}

function isSubgroupLike(group: ESPRMNGGroup): boolean {
  return group.parentId != null && group.parentId !== "";
}

/**
 * Configures RMNG Matter SDK only when the session actually has Matter/hybrid
 * nodes. RMNG-only homes with fabric metadata skip init on login/sync.
 */
export async function ensureRmngMatterSdkIfNeeded(options: {
  groups?: ESPRMNGGroup[];
  cdfNodes?: ESPCDFNode[];
}): Promise<void> {
  const needsGroups = options.groups ? groupsNeedMatterSdk(options.groups) : false;
  const needsNodes = options.cdfNodes
    ? cdfNodesNeedMatterSubscription(options.cdfNodes)
    : false;
  if (!needsGroups && !needsNodes) {
    return;
  }
  await ensureRmngMatterSdkConfigured();
}
