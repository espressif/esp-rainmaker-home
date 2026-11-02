/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPRMNeoGroup, ESPRMNeoUser } from "@espressif/rainmaker-neo-base-sdk";
import {
  ESPRMNeoFabric,
  buildNodeConfigPayload,
  registerMatterNodes,
  type ESPCommissioningResponse,
} from "@espressif/rainmaker-neo-matter-sdk";
import type {
  ESPCDFGroup,
  ESPCDFIssueUserNoCResponse,
  ESPCDFMatterFabricDetails,
  ESPCDFNode,
} from "@store";
import { ESPCDF } from "@store";
import { SUCESS } from "@shared/utils/constants";
import {
  clearPendingNodeConfig,
  getPendingNodeConfigs,
} from "@shared/utils/matterPendingNodeConfig";
import {
  injectLocalMatterNodeIds,
  type MatterSdkNodeLike,
} from "@sdk-adaptors/shared/utils/injectLocalMatterNodeIds";
import { normalizeMatterFabricDetails } from "@sdk-adaptors/shared/utils/matterFabricDetails";
import { transformToESPCDFGroup as transformToESPCDFGroupFromNeoBase } from "@sdk-adaptors/ESPRMNeoBase/transformers/transformToESPCDFGroup";
import { attachHybridLocalControlToNodes } from "../utils/attachHybridLocalControlToNodes";
import { transformNeoMatterSdkNodesToCdf } from "./transformToESPCDFNode";

/**
 * Re-pushes node-config payloads whose post-confirm PUT failed (self-heal).
 * Best-effort: a marker survives until its PUT finally lands.
 */
async function repushPendingNodeConfigs(fabric: ESPRMNeoFabric): Promise<void> {
  const pending = await getPendingNodeConfigs(fabric.groupId);
  for (const entry of pending) {
    try {
      await fabric.setNodeConfig(
        entry.neoNodeId,
        buildNodeConfigPayload(entry.matterMetadata),
      );
      await clearPendingNodeConfig(fabric.groupId, entry.neoNodeId);
    } catch {
      // Keep the marker; next sync retries.
    }
  }
}

/**
 * Neo capability response → CDF fabric details.
 *
 * The Neo cloud returns snake_case; CDF wants camelCase. Both spellings are
 * read because the SDK's declared `ESPRMNeoMatterCapabilityResponse` omits
 * `matter_user_id`, which the wire does carry — the same defensive read the RM
 * adaptor does.
 * @param fabric - Fabric whose `fabricDetails` were populated by getFabricDetails.
 * @returns CDF fabric details, or undefined when nothing is populated yet.
 */
function normalizeFabricDetails(
  fabric: ESPRMNeoFabric,
): ESPCDFMatterFabricDetails | undefined {
  return normalizeMatterFabricDetails(
    fabric.fabricDetails as Record<string, unknown> | undefined,
  );
}

/**
 * The Matter fabric id, read defensively in both spellings.
 *
 * CDF's `ESPCDFGroup.fabricId` gates the whole NoC flow: `ensureNocReadyForFabric`
 * returns silently when it is empty, so a missing value skips NoC issuance and
 * `storePrecommissionInfo` with no error at all — commissioning then fails much
 * later, inside native CHIP, on a null root certificate.
 */
function resolveFabricId(fabric: ESPRMNeoFabric): string {
  const raw = fabric.fabricDetails as Record<string, string | undefined> | undefined;
  return raw?.fabricId ?? raw?.fabric_id ?? "";
}

/**
 * Neo group → CDF group, with the Matter surface attached.
 *
 * Delegates the whole group shape to the Neo base transformer and adds the
 * commissioning verbs plus, for fabrics, a capability-aware `getNodes`: pure
 * Matter nodes are compiled by the Matter SDK from their cloud node config
 * through the cluster registry; hybrid nodes keep the ordinary Neo config path
 * (RainMaker params are their source of truth — the firmware mirrors them
 * into Matter).
 *
 * `convertToMatterFabric` is always present so a plain group can be promoted;
 * `getFabricDetails`, `issueUserNoC`, `startCommissioning` and the `getNodes`
 * override only appear once the group already is a fabric.
 */
export function transformToESPCDFGroup(
  group: ESPRMNeoGroup | ESPRMNeoFabric,
  user: ESPRMNeoUser,
  identifier: string,
): ESPCDFGroup {
  const baseGroup = transformToESPCDFGroupFromNeoBase(
    group as ESPRMNeoGroup,
    user,
    identifier,
  );

  const fabric = group instanceof ESPRMNeoFabric ? group : null;

  const matterOperations = {
    /** Promotes a plain group to a Matter fabric, or refreshes an existing one. */
    async convertToMatterFabric(): Promise<ESPCDFGroup> {
      const promoted =
        fabric ?? (await (group as ESPRMNeoGroup).convertToFabric());
      await promoted.getFabricDetails();
      return transformToESPCDFGroup(promoted, user, identifier);
    },

    ...(fabric
      ? {
          /**
           * Capability-aware node load for a fabric: pure Matter nodes resolve
           * through the SDK's `getNodesWithDetails` (GET /config + cluster
           * registry) instead of the base's config/shadow path, which would
           * silently drop them. Hybrid nodes still ride the base `getNode`
           * inside the SDK call. Runs the pending-config self-heal first so a
           * failed post-confirm PUT is retried before the node is rebuilt.
           */
          async getNodes(): Promise<ESPCDFNode[]> {
            await repushPendingNodeConfigs(fabric);
            const sdkNodes = await fabric.getNodesWithDetails();
            await injectLocalMatterNodeIds(
              sdkNodes as unknown as MatterSdkNodeLike[],
            );
            registerMatterNodes(sdkNodes);
            // Hybrids gain a matter_local write leg ahead of their cloud legs.
            await attachHybridLocalControlToNodes(sdkNodes);
            const cdfNodes = transformNeoMatterSdkNodesToCdf(
              sdkNodes,
              "neoMatterGroupSync.getNodes",
            );
            const cdf = await ESPCDF.instance;
            cdf?.groupStore.updateGroup(fabric.groupId, {
              nodeDetails: cdfNodes,
            });
            return cdfNodes;
          },
          async getFabricDetails(): Promise<ESPCDFMatterFabricDetails> {
            await fabric.getFabricDetails();
            const details = normalizeFabricDetails(fabric);
            if (!details?.rootCa) {
              throw new Error(
                "Fabric details incomplete after getFabricDetails: no rootCa",
              );
            }
            return details;
          },

          /**
           * Issues the user NoC for this fabric.
           *
           * The SDK returns the flat cloud shape; CDF expects a `certificates`
           * array, so it is wrapped rather than passed through.
           *
           * The identifier is read from `matter_node_id` as well as
           * `matter_user_id`: this endpoint returns the former (verified on the
           * wire) even though the SDK type declares the latter, and for a *user*
           * NoC that node id is the fabric's admin node — what RainMaker calls
           * the matter user id. CDF rejects the payload without it.
           */
          async issueUserNoC(): Promise<ESPCDFIssueUserNoCResponse> {
            const response = (await fabric.issueUserNoC()) as {
              noc?: string;
              matter_user_id?: string;
              matter_node_id?: string;
              message?: string;
            };
            return {
              status: SUCESS,
              description: response.message ?? "",
              certificates: [
                {
                  groupId: fabric.groupId,
                  matterUserId:
                    response.matter_user_id ?? response.matter_node_id ?? "",
                  userNoC: response.noc ?? "",
                },
              ],
            };
          },

          /**
           * Starts native commissioning. The returned function tears down the
           * SDK's event listeners — callers must invoke it on unmount.
           */
          async startCommissioning(
            qrData: string,
            onProgress?: (message: {
              status: string;
              description?: string;
            }) => void,
          ): Promise<() => void> {
            return await fabric.startCommissioning(
              qrData,
              (progress: ESPCommissioningResponse) => {
                onProgress?.({
                  status: progress.status,
                  description: progress.description,
                });
              },
            );
          },
        }
      : {}),
  };

  baseGroup.operations = {
    ...baseGroup.operations,
    ...matterOperations,
  };
  baseGroup.identifier = identifier;
  if (fabric) {
    baseGroup.fabricDetails = normalizeFabricDetails(fabric);
    // The Neo base transform is non-Matter and sets neither; CDF reads both.
    baseGroup.isMatter = true;
    baseGroup.fabricId = resolveFabricId(fabric);
  }

  return baseGroup;
}
