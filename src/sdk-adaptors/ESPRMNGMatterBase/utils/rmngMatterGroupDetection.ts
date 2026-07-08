/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPRMNGGroup } from "@espressif/rmng-base-sdk";
import {
  ESPRMNGFabric,
  type ESPRMNGMatterCapabilityResponse,
} from "@espressif/rmng-matter-sdk";

function readRmngMatterCapabilityPayload(
  group: ESPRMNGGroup | ESPRMNGFabric,
): ESPRMNGMatterCapabilityResponse | undefined {
  return (
    (group as unknown as ESPRMNGFabric).fabricDetails ??
    (group as { matter?: ESPRMNGMatterCapabilityResponse }).matter ??
    (group as { fabric_details?: ESPRMNGMatterCapabilityResponse })
      .fabric_details
  );
}

/** True when inline API/storage matter payload has fabric credentials. */
export function hasRmngMatterCapabilityData(
  matter?: ESPRMNGMatterCapabilityResponse | null,
): boolean {
  if (!matter) {
    return false;
  }

  return Boolean(
    matter.root_ca?.length ||
      matter.fabric_id?.length ||
      (matter as { rootCa?: string }).rootCa?.length ||
      (matter as { fabricId?: string }).fabricId?.length,
  );
}

/**
 * True when the RMNG group is Matter-enabled on the server (inline `matter`, stored
 * fabric details, or `capabilities` includes `"matter"`).
 *
 * Do not use `instanceof ESPRMNGFabric` — {@link resolveRmngSdkFabric} wraps every
 * group as a fabric shell without credentials.
 */
export function isRmngMatterCapableGroup(
  group: ESPRMNGGroup | ESPRMNGFabric,
): boolean {
  if (hasRmngMatterCapabilityData(readRmngMatterCapabilityPayload(group))) {
    return true;
  }

  const capabilities = (group as { capabilities?: string[] }).capabilities;
  return Array.isArray(capabilities) && capabilities.includes("matter");
}

export function resolveRmngFabricId(
  group: ESPRMNGGroup | ESPRMNGFabric,
): string {
  const matter = readRmngMatterCapabilityPayload(group);
  const fabricId =
    matter?.fabric_id ??
    (matter as { fabricId?: string } | undefined)?.fabricId;
  return fabricId ?? group.groupId;
}
