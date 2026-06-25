/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFNode } from "@store";
import { ESPCDF } from "@store";
import { ESPRMNGNode, type ESPRMNGGroup } from "@espressif/rmng-base-sdk";
import { applyRefreshedCdfNodeToStore } from "@sdk-adaptors/ESPRMNGBase/utils/rmngApplyRefreshedNodeToStore";
import { resolveRmngNodeTransformOptions } from "./loadPureMatterBuildContext";
import { transformRmngMatterNodeToCdf } from "./transformRmngMatterNodeToCdf";
import {
  hasUsableMatterTopology,
  resolveGroupNodeCapability,
  resolveGroupNodeCapabilityFromSubtree,
} from "../utils/rmngGroupNodeDetailsContext";
import { getMatterMetadata } from "@shared/utils/matterLocalStorage";
import { isRmngPureMatterCdfNode, isRmngMatterHybridCdfNode } from "../utils/rmngMatterNodeKind";
import { logRawMatterData } from "../utils/logRawMatterData";
import { cdfNeedsMatterParamRefresh } from "../utils/rmngMatterTopologyHelpers";
import { resolveHybridEndpointParamsForBuild } from "../utils/rmngMatterHybridBuildParams";
import { ensureRmngMatterSdkConfigured } from "../ensureMatterSDK";
import { ensureRmngSdkNodeMatterSubscribeShape } from "../utils/rmngMatterSubscribeShape";
import { retrySubscribeForNodeId } from "@shared/utils/matterSubscribeRetry";

const PURE_MATTER_LOG = "[rmngPureMatter]";

function resolveSdkNodeForRefresh(
  nodeId: string,
  groupId: string,
  sdkNode?: ESPRMNGNode | unknown,
): ESPRMNGNode {
  if (sdkNode instanceof ESPRMNGNode) {
    return sdkNode;
  }
  console.log(`${PURE_MATTER_LOG} refresh using minimal SDK node`, { nodeId, groupId });
  return new ESPRMNGNode({ node_id: nodeId, devices: [], services: [] }, groupId);
}

function resolveCapabilityForRefresh(
  nodeId: string,
  groupId: string,
  groupNodeDetails?: Record<string, import("@espressif/rmng-base-sdk").NodeCapabilityInfo>,
) {
  if (groupNodeDetails) {
    return resolveGroupNodeCapability({ nodeDetails: groupNodeDetails }, nodeId);
  }
  const home = ESPCDF.instance?.getCurrentHome?.();
  const rawGroup = home?._raw as ESPRMNGGroup | undefined;
  if (rawGroup) {
    return resolveGroupNodeCapabilityFromSubtree(rawGroup, nodeId);
  }
  console.log(`${PURE_MATTER_LOG} refresh capability unresolved`, { nodeId, groupId });
  return undefined;
}

export async function refreshRmngPureMatterCdfNode(options: {
  nodeId: string;
  groupId: string;
  sdkNode?: ESPRMNGNode;
  groupNodeDetails?: Record<string, import("@espressif/rmng-base-sdk").NodeCapabilityInfo>;
  isMatterLocallyReachable?: boolean;
}): Promise<ESPCDFNode | undefined> {
  await ensureRmngMatterSdkConfigured();

  console.log(`${PURE_MATTER_LOG} refreshRmngPureMatterCdfNode start`, {
    nodeId: options.nodeId,
    groupId: options.groupId,
    hasSdkNode: options.sdkNode instanceof ESPRMNGNode,
    isMatterLocallyReachable: options.isMatterLocallyReachable,
  });

  const capability = resolveCapabilityForRefresh(
    options.nodeId,
    options.groupId,
    options.groupNodeDetails,
  );

  const sdkNode = resolveSdkNodeForRefresh(
    options.nodeId,
    options.groupId,
    options.sdkNode,
  );
  ensureRmngSdkNodeMatterSubscribeShape(
    sdkNode,
    options.nodeId,
    options.nodeId,
    "pure_matter",
  );

  const localMeta = await getMatterMetadata(options.nodeId);
  const hasTopology = hasUsableMatterTopology(localMeta);
  logRawMatterData(
    options.nodeId,
    "refreshRmngPureMatterCdfNode load",
    localMeta?.matter_data,
  );
  console.log(`${PURE_MATTER_LOG} refresh local matter_data`, {
    nodeId: options.nodeId,
    hasTopology,
    endpointCount: hasTopology
      ? Object.keys(
          (localMeta?.matter_data as { endpoints?: Record<string, unknown> })
            ?.endpoints ?? {},
        ).length
      : 0,
  });

  const transformOptions = await resolveRmngNodeTransformOptions(sdkNode, {
    groupId: options.groupId,
    groupNodeCapability: capability,
    isPureMatterFromGroup: !!capability,
    isMatterLocallyReachable: options.isMatterLocallyReachable,
    hasUsableMatterTopology: hasTopology,
  });

  const cdfNode = transformRmngMatterNodeToCdf(sdkNode, transformOptions);
  applyRefreshedCdfNodeToStore(cdfNode);
  console.log(`${PURE_MATTER_LOG} refreshRmngPureMatterCdfNode done`, {
    nodeId: options.nodeId,
    deviceNames: cdfNode.devices?.map((d) => d.name),
    deviceCount: cdfNode.devices?.length ?? 0,
  });

  if (options.isMatterLocallyReachable) {
    const user = ESPCDF.instance?.userStore?.user;
    void retrySubscribeForNodeId(user, options.nodeId, { rawNode: sdkNode }).catch(
      (error: unknown) => {
        console.warn(
          `${PURE_MATTER_LOG} post-refresh matter subscribe retry failed`,
          options.nodeId,
          error,
        );
      },
    );
  }

  return cdfNode;
}

export async function refreshRmngHybridMatterCdfNode(options: {
  nodeId: string;
  groupId: string;
  sdkNode?: ESPRMNGNode;
  groupNodeDetails?: Record<string, import("@espressif/rmng-base-sdk").NodeCapabilityInfo>;
  isMatterLocallyReachable?: boolean;
}): Promise<ESPCDFNode | undefined> {
  await ensureRmngMatterSdkConfigured();

  console.log(`${PURE_MATTER_LOG} refreshRmngHybridMatterCdfNode start`, {
    nodeId: options.nodeId,
    groupId: options.groupId,
    hasSdkNode: options.sdkNode instanceof ESPRMNGNode,
    isMatterLocallyReachable: options.isMatterLocallyReachable,
  });

  const capability = resolveCapabilityForRefresh(
    options.nodeId,
    options.groupId,
    options.groupNodeDetails,
  );

  const sdkNode = resolveSdkNodeForRefresh(
    options.nodeId,
    options.groupId,
    options.sdkNode,
  );

  const storedParams = resolveHybridEndpointParamsForBuild(sdkNode);
  const hasMqttParams = Object.keys(storedParams).length > 0;

  const transformOptions = await resolveRmngNodeTransformOptions(sdkNode, {
    groupId: options.groupId,
    groupNodeCapability: capability,
    isRmngMatterHybrid: true,
    storedParams,
    hasUsableMatterTopology: !hasMqttParams,
    isMatterLocallyReachable: options.isMatterLocallyReachable,
  });

  const cdfNode = transformRmngMatterNodeToCdf(sdkNode, transformOptions);
  applyRefreshedCdfNodeToStore(cdfNode);
  console.log(`${PURE_MATTER_LOG} refreshRmngHybridMatterCdfNode done`, {
    nodeId: options.nodeId,
    deviceNames: cdfNode.devices?.map((d) => d.name),
    deviceCount: cdfNode.devices?.length ?? 0,
  });

  if (options.isMatterLocallyReachable) {
    const user = ESPCDF.instance?.userStore?.user;
    void retrySubscribeForNodeId(user, options.nodeId, { rawNode: sdkNode }).catch(
      (error: unknown) => {
        console.warn(
          `${PURE_MATTER_LOG} post-refresh hybrid matter subscribe retry failed`,
          options.nodeId,
          error,
        );
      },
    );
  }

  return cdfNode;
}

/** Re-builds a pure-Matter or hybrid CDF node after local `matter_data` is persisted. */
export async function refreshPureMatterCdfNodeIfNeeded(
  nodeId: string,
  cdfNode: ESPCDFNode,
  options?: { forceParamRefresh?: boolean },
): Promise<void> {
  const isPure = isRmngPureMatterCdfNode(cdfNode);
  const isHybrid = isRmngMatterHybridCdfNode(cdfNode);
  if (!isPure && !isHybrid) {
    return;
  }

  if (isHybrid) {
    console.log(
      `${PURE_MATTER_LOG} refreshPureMatterCdfNodeIfNeeded skipped: hybrid uses cloud+mqtt params`,
      { nodeId },
    );
    return;
  }

  const localMeta = await getMatterMetadata(nodeId);
  // logRawMatterData(
  //   nodeId,
  //   "refreshPureMatterCdfNodeIfNeeded",
  //   localMeta?.matter_data,
  // );

  const needsRefresh =
    options?.forceParamRefresh === true ||
    cdfNeedsMatterParamRefresh(cdfNode, localMeta);

  if (!needsRefresh) {
    console.log(`${PURE_MATTER_LOG} refreshPureMatterCdfNodeIfNeeded skipped: CDF matches local topology`, {
      nodeId,
    });
    return;
  }

  if (!hasUsableMatterTopology(localMeta)) {
    console.log(`${PURE_MATTER_LOG} refreshPureMatterCdfNodeIfNeeded skipped: no local topology`, {
      nodeId,
    });
    return;
  }

  const rawWrapper = cdfNode._raw as { _rmngSdkNode?: ESPRMNGNode } | undefined;
  const groupId =
    (cdfNode as { groupId?: string }).groupId ??
    rawWrapper?._rmngSdkNode?.groupId ??
    "";

  console.log(`${PURE_MATTER_LOG} refreshPureMatterCdfNodeIfNeeded rebuilding`, {
    nodeId,
    groupId,
    hasRmngSdkNode: rawWrapper?._rmngSdkNode instanceof ESPRMNGNode,
  });

  await refreshRmngPureMatterCdfNode({
    nodeId,
    groupId,
    sdkNode: rawWrapper?._rmngSdkNode,
    isMatterLocallyReachable: true,
  });
}
