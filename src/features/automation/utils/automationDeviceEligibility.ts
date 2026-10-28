/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { getFeatures } from "@config/features.config";
import { isPureMatterNode } from "@shared/utils/matterNodeType";
import { readMatterNodeIdFromCdfNode } from "@shared/utils/matterDeviceStateEvents";
import type { ESPCDFNode } from "@store";

/**
 * Whether a node can never take part in an automation.
 *
 * With `hybridMatterAutomation` (RMNeo) only pure-Matter is ineligible — a
 * hybrid drives its automation over RainMaker. Without it (classic) every
 * Matter-backed node stays excluded until that change is validated separately.
 * Feature-gated, so it lives here rather than in `shared/utils`, which stays
 * deployment-agnostic.
 * @param node - Candidate event/action node
 * @returns `true` when the node can never take part in an automation
 */
export function isAutomationMatterIneligibleNode(node: ESPCDFNode): boolean {
  if (getFeatures().hybridMatterAutomation) {
    return isPureMatterNode(node);
  }
  return readMatterNodeIdFromCdfNode(node) != null;
}
