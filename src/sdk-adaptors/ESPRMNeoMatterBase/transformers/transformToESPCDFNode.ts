/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * CDF node transform for the Neo Matter stack.
 *
 * Delegates to the Neo base transform — the store sink it binds goes through
 * `ESPRMNeoBase.subscriptionManager`, which routes pure Matter nodes to the
 * "matter" channel (per-node channel order), so live attribute updates reach
 * the CDF store with zero extra wiring — then decorates the result with the
 * Matter identity the shared UI contract reads:
 *
 * - `isMatter: true` gates Control's one-shot attribute read.
 * - `metadata.matter_node_id` feeds `readMatterNodeIdFromCdfNode` /
 *   `isMatterCdfNode` (local discovery targeting).
 * - `metadata.Matter` feeds DeviceInfo's firmware-version read and rename.
 *
 * A hybrid keeps the base transform's device model and control path and gains
 * only its Matter operational id, so LAN discovery can resolve an mDNS hit back
 * to it. Plain nodes pass through untouched.
 */

import type { ESPRMNeoNode } from "@espressif/rainmaker-neo-base-sdk";
import {
  buildNodeConfigPayload,
  ESPRMNeoFabric,
  ESPRMNeoMatterNode,
} from "@espressif/rainmaker-neo-matter-sdk";
import type { ESPCDFAPIResponse } from "@store";
import type { ESPCDFNode } from "@store";
import { normalizeRmneoSdkResponseToCdf } from "@sdk-adaptors/ESPRMNeoBase/utils/helpers/sharedHelpers";
import { syncCdfNodeDisplayNames } from "@sdk-adaptors/shared/utils/common";
import { setPendingNodeConfig } from "@shared/utils/matterPendingNodeConfig";
import { ESPRMNeoMatterBaseAdaptorIdentifier } from "@config/sdk.identifiers";
import { NEO_MATTER_DESC_NODE_CONFIG_UPDATED } from "../constants";
import {
  MATTER_METADATA_KEY,
  MATTER_METADATA_NODE_ID_KEY,
  METADATA_KEY_IS_RAINMAKER,
} from "@shared/utils/constants";
import {
  transformToESPCDFNode as baseTransformToESPCDFNode,
  transformToESPCDFNodes as baseTransformToESPCDFNodes,
} from "@sdk-adaptors/ESPRMNeoBase/transformers/transformToESPCDFNode";
import { MATTER_XY_COLOR_PARAM_FLAG } from "@shared/utils/paramUtils";

const HEX_PREFIX = "0x";

function toHexKey(id: number): string {
  return HEX_PREFIX + id.toString(16);
}

/**
 * Projects the SDK node's parsed topology back into the verbose
 * `metadata.Matter.endpoints` shape shared UI helpers read — in particular
 * `filterUnsupportedMatterColorParams`, which drops Hue/Saturation/CCT params
 * whose backing ColorControl ATTRIBUTE the device does not advertise. Without
 * this, that filter fails open on Neo and a CCT-only light grows Hue and
 * Saturation sliders that classic correctly hides.
 */
function buildMetadataEndpoints(
  node: ESPRMNeoMatterNode,
): Record<string, unknown> | undefined {
  if (!node.endpoints || node.endpoints.length === 0) {
    return undefined;
  }
  const endpoints: Record<string, unknown> = {};
  for (const endpoint of node.endpoints) {
    const servers: Record<string, unknown> = {};
    for (const clusterId of endpoint.serverClusters) {
      const attrs = endpoint.serverClusterAttributes?.[clusterId];
      servers[toHexKey(clusterId)] =
        attrs && attrs.length > 0
          ? { attributes: attrs.map((a) => toHexKey(a)) }
          : {};
    }
    const clients: Record<string, unknown> = {};
    for (const clusterId of endpoint.clientClusters) {
      clients[toHexKey(clusterId)] = {};
    }
    endpoints[toHexKey(endpoint.endpointId)] = {
      ...(endpoint.deviceType !== undefined
        ? { deviceType: endpoint.deviceType }
        : {}),
      clusters: { servers, clients },
    };
  }
  return endpoints;
}

/** Builds the CDF `metadata` payload for a pure Matter node. */
function buildMatterCdfMetadata(
  node: ESPRMNeoMatterNode,
): Record<string, unknown> {
  const info = node.config?.info as
    | { name?: string; fw_version?: string; firmwareVersion?: string }
    | undefined;
  const endpoints = buildMetadataEndpoints(node);
  const matterMeta: Record<string, unknown> = {
    [METADATA_KEY_IS_RAINMAKER]: false,
    deviceName: info?.name,
    softwareVersionString: info?.firmwareVersion ?? info?.fw_version,
    ...(endpoints ? { endpoints } : {}),
    // Commissioning metadata (when this runtime built the node from it) wins
    // over the reconstructed defaults above.
    ...(node.matterMetadata ?? {}),
  };
  return {
    [MATTER_METADATA_NODE_ID_KEY]: node.matterNodeId,
    [MATTER_METADATA_KEY]: matterMeta,
  };
}

/**
 * Carries a hybrid's Matter operational id onto its CDF node.
 *
 * Deliberately the id and nothing else: `isMatter` gates Control's Matter-only
 * attribute read and the node-id fallback in `readMatterNodeIdFromCdfNode`, and
 * a hybrid has no Matter device model — it controls over RainMaker. The id is
 * all local discovery needs. The base transform builds an empty `metadata`, so
 * stamp both places the readers look.
 */
function attachHybridMatterNodeId(
  cdfNode: ESPCDFNode,
  node: ESPRMNeoNode,
): ESPCDFNode {
  const matterNodeId = (
    node as { matterNodeId?: string }
  ).matterNodeId?.trim();
  if (!matterNodeId) {
    return cdfNode;
  }
  const decorated = cdfNode as ESPCDFNode & { matterNodeId?: string };
  decorated.matterNodeId = matterNodeId;
  decorated.metadata = {
    ...(cdfNode.metadata ?? {}),
    [MATTER_METADATA_NODE_ID_KEY]: matterNodeId,
  };
  return decorated;
}

/**
 * Routes `updateMetadata` to `PUT /v1/groups/{gid}/nodes/{nid}/config`.
 *
 * RMNeo's base `updateMetadata` throws, but a pure Matter node's metadata *is*
 * its node config. Cloud 403s this for anything else, hence the narrow binding.
 * A failed PUT is queued for the group-sync repush.
 * @param cdfNode - Node whose operation is being overridden
 * @param node - Backing pure Matter SDK node
 */
function attachPureMatterMetadataWriter(
  cdfNode: ESPCDFNode,
  node: ESPRMNeoMatterNode,
): void {
  const groupId = node.groupId?.trim();
  const nodeId = node.nodeId?.trim();
  if (!groupId || !nodeId) {
    return;
  }

  cdfNode.operations.updateMetadata = async (
    metadata: Record<string, any>,
  ): Promise<ESPCDFAPIResponse> => {
    const merged = {
      ...((cdfNode.metadata?.[MATTER_METADATA_KEY] as
        | Record<string, unknown>
        | undefined) ?? {}),
      ...((metadata?.[MATTER_METADATA_KEY] as
        | Record<string, unknown>
        | undefined) ?? {}),
    };
    try {
      const res = await new ESPRMNeoFabric({
        groupId,
        groupName: "",
      }).setNodeConfig(nodeId, buildNodeConfigPayload(merged));
      cdfNode.metadata = {
        ...(cdfNode.metadata ?? {}),
        [MATTER_METADATA_KEY]: merged,
      };
      return normalizeRmneoSdkResponseToCdf(
        res,
        NEO_MATTER_DESC_NODE_CONFIG_UPDATED,
      );
    } catch (error) {
      await setPendingNodeConfig(groupId, nodeId, merged);
      throw error;
    }
  };
}

/** Applies the Matter identity onto an already-transformed CDF node. */
export function decorateCdfNodeWithMatterIdentity(
  cdfNode: ESPCDFNode,
  node: ESPRMNeoNode | ESPRMNeoMatterNode,
): ESPCDFNode {
  if (!(node instanceof ESPRMNeoMatterNode)) {
    return attachHybridMatterNodeId(cdfNode, node);
  }
  const decorated = cdfNode as ESPCDFNode & {
    isMatter?: boolean;
    matterNodeId?: string;
    nodeType?: string;
  };
  decorated.identifier = ESPRMNeoMatterBaseAdaptorIdentifier;
  decorated.isMatter = true;
  decorated.matterNodeId = node.matterNodeId;
  decorated.nodeType = node.nodeType;
  decorated.metadata = buildMatterCdfMetadata(node);
  attachPureMatterMetadataWriter(decorated, node);
  markXyColorParams(decorated, node);
  // The Matter name only lands now, so name the devices again.
  syncCdfNodeDisplayNames(decorated);
  return decorated;
}

/**
 * Stamps the XY marker on CDF params the SDK compiled XY-backed (Hue and
 * Saturation on an XY-only color light, driven through CurrentX/CurrentY +
 * MoveToColor). `filterUnsupportedMatterColorParams` keeps a marked param
 * when the XY pair is advertised, where an HS-backed one would be dropped.
 */
function markXyColorParams(
  cdfNode: ESPCDFNode,
  node: ESPRMNeoMatterNode,
): void {
  for (const device of cdfNode.devices ?? []) {
    for (const param of device.params ?? []) {
      if (node.getParamAddress(device.name, param.name)?.xyColorComponent) {
        Object.assign(param, { [MATTER_XY_COLOR_PARAM_FLAG]: true });
      }
    }
  }
}

/** Maps one Neo SDK node (pure Matter or hybrid) to a CDF node. */
export function transformNeoMatterSdkNodeToCdf(
  node: ESPRMNeoNode | ESPRMNeoMatterNode,
): ESPCDFNode {
  return decorateCdfNodeWithMatterIdentity(
    baseTransformToESPCDFNode(node as ESPRMNeoNode),
    node,
  );
}

/** Batch variant; per-node failures are skipped by the base transform. */
export function transformNeoMatterSdkNodesToCdf(
  nodes: (ESPRMNeoNode | ESPRMNeoMatterNode)[],
  context: string,
): ESPCDFNode[] {
  const cdfNodes = baseTransformToESPCDFNodes(nodes as ESPRMNeoNode[], context);
  // Base transform preserves order for successful nodes; re-associate by id.
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  for (const cdfNode of cdfNodes) {
    const raw = byId.get(cdfNode.id);
    if (raw) {
      decorateCdfNodeWithMatterIdentity(cdfNode, raw);
    }
  }
  return cdfNodes;
}
