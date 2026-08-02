/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ESPCDFNode,
  ESPCDF,
  ESPCDFNodeConfig,
  ESPCDFAPIResponse,
  type ESPCDFNodeOperation,
} from "@store";
import {
  ESPRMNeoBase,
  ESPRMNeoDevice,
  ESPRMNeoNode,
  ESPRMNeoService,
  clearNcfgVersionMarker,
} from "@espressif/rainmaker-neo-base-sdk";
import { makeCdfNodeParamsObservable } from "@sdk-adaptors/shared/utils/common";
import { tryFactoryResetBeforeDelete } from "@sdk-adaptors/shared/utils/factoryReset";
import { projectRegisteredTransportsOntoRawNode } from "@sdk-adaptors/shared/utils/projectRegisteredTransports";
import { ESPRMNeoBaseAdaptorIdentifier } from "@config/sdk.identifiers";
import { HEADLESS_ERROR_UNKNOWN } from "@shared/utils/constants";
import { ianaTzToEspPosixTz } from "@shared/utils/timezone";
import { safeTransform } from "@sdk-adaptors/shared/utils/safeTransform";
import { normalizeRmneoSdkResponseToCdf } from "../utils/helpers/sharedHelpers";
import { bindRmneoCdfStoreSink } from "../utils/helpers/cdfStoreSinkHelpers";
import {
  clearCdfProjectedNcfg,
  createPropertyChangeSyncCallback,
  mapSdkNodeInfoToCdf,
} from "../utils/helpers/nodeHelpers";
import {
  ESPRMNEO_CDF_NODE_TYPE,
  ESPRMNEO_NODE_DESC_DELETED,
  ESPRMNEO_NODE_DESC_PARAMS_UPDATED,
  ESPRMNEO_NODE_DESC_TIMEZONE_UPDATED,
  ESPRMNEO_NODE_ERR_CHECK_OTA_UNSUPPORTED,
  ESPRMNEO_NODE_ERR_GET_OTA_STATUS_UNSUPPORTED,
  ESPRMNEO_NODE_ERR_PUSH_OTA_UNSUPPORTED,
  ESPRMNEO_NODE_ERR_UPDATE_METADATA_UNSUPPORTED,
  ESPRMNEO_TIME_PARAM_TZ,
  ESPRMNEO_TIME_PARAM_TZ_POSIX,
  ESPRMNEO_TIME_SERVICE_NAME,
  ESPRMNEO_TRANSFORM_CONTEXT_NODE_DEVICES,
  ESPRMNEO_TRANSFORM_CONTEXT_NODE_SERVICES,
  ESPRMNEO_TRANSFORM_LOG_NODE_DEVICE_SKIPPED,
  ESPRMNEO_TRANSFORM_LOG_NODE_PARTIAL_FAILURES,
  ESPRMNEO_TRANSFORM_LOG_NODE_SERVICE_SKIPPED,
} from "../utils/constants";
import { Logger } from "../utils/logger";
import { transformToESPCDFDevice } from "./transformToESPCDFDevice";
import { transformToESPCDFService } from "./transformToESPCDFService";

/** Re-export so existing MQTT / group callers keep a stable import path. */
export { bindRmneoCdfStoreSink } from "../utils/helpers/cdfStoreSinkHelpers";

/**
 * Builds CDF node operations that delegate to `ESPRMNeoNode` APIs.
 * @param node - Live RMNeo SDK node (`_raw`).
 * @returns Operations attached to the CDF node.
 */
const createNodeOperations = (node: ESPRMNeoNode): ESPCDFNodeOperation => {
  const nodeId = node.nodeId;

  return {
    /**
     * Publishes param updates via the SDK transport handler (local → mqtt).
     * @param params - Device/service → param map (same shape as SDK `setParams`).
     * @returns Normalized CDF API response.
     */
    setMultipleParams: async (params: Record<string, unknown>) => {
      const res = await node.setParams(params);
      return normalizeRmneoSdkResponseToCdf(res, ESPRMNEO_NODE_DESC_PARAMS_UPDATED);
    },

    /**
     * Factory-resets when possible, deletes the node, and clears subscription /
     * ncfg markers so re-provision of the same id starts clean.
     * @returns Normalized CDF API response.
     */
    delete: async (): Promise<ESPCDFAPIResponse> => {
      await tryFactoryResetBeforeDelete(node.services);
      const res = await node.delete();
      await ESPRMNeoBase.subscriptionManager
        .unsubscribeFromNode(nodeId)
        .catch(() => {});
      await clearNcfgVersionMarker(nodeId).catch(() => {});
      clearCdfProjectedNcfg(nodeId);
      return normalizeRmneoSdkResponseToCdf(res, ESPRMNEO_NODE_DESC_DELETED);
    },

    /**
     * Writes IANA (+ optional POSIX) timezone onto the RainMaker Time service.
     * @param timeZone - IANA timezone id.
     * @returns Normalized CDF API response.
     */
    setTimeZone: async (timeZone: string) => {
      const posix = ianaTzToEspPosixTz(timeZone);
      const timePayload: Record<string, string> = {
        [ESPRMNEO_TIME_PARAM_TZ]: timeZone,
      };
      if (posix) {
        timePayload[ESPRMNEO_TIME_PARAM_TZ_POSIX] = posix;
      }
      const res = await node.setParams({
        [ESPRMNEO_TIME_SERVICE_NAME]: timePayload,
      });
      return normalizeRmneoSdkResponseToCdf(
        res,
        ESPRMNEO_NODE_DESC_TIMEZONE_UPDATED,
      );
    },

    updateMetadata: async () => {
      throw new Error(ESPRMNEO_NODE_ERR_UPDATE_METADATA_UNSUPPORTED);
    },
    checkOTAUpdate: async () => {
      throw new Error(ESPRMNEO_NODE_ERR_CHECK_OTA_UNSUPPORTED);
    },
    pushOTAUpdate: async () => {
      throw new Error(ESPRMNEO_NODE_ERR_PUSH_OTA_UNSUPPORTED);
    },
    getOTAUpdateStatus: async () => {
      throw new Error(ESPRMNEO_NODE_ERR_GET_OTA_STATUS_UNSUPPORTED);
    },
  };
};

/**
 * Maps one `ESPRMNeoNode` to an `ESPCDFNode` (devices, services, ops, store sink).
 * Malformed devices/services are skipped so partial configs still render.
 *
 * Live MQTT / shadow / ncfg raw sync stay in the SDK; this only builds CDF and
 * registers {@link bindRmneoCdfStoreSink} for store projection.
 * @param node - Live RMNeo SDK node.
 * @returns CDF node with `_raw` pointing at `node`.
 */
export function transformToESPCDFNode(node: ESPRMNeoNode): ESPCDFNode {
  const nodeId = node.nodeId;

  // Node self-subscribes for SDK state; this adds the CDF store as another
  // subscriber. The channel dedupes the underlying MQTT subscription per shadow.
  bindRmneoCdfStoreSink(node);

  const devices = safeTransform<
    ESPRMNeoDevice,
    ReturnType<typeof transformToESPCDFDevice>
  >(
    node.devices,
    ESPRMNEO_TRANSFORM_CONTEXT_NODE_DEVICES,
    (device) => transformToESPCDFDevice(device),
    ({ index, error }) => {
      Logger.warn(ESPRMNEO_TRANSFORM_LOG_NODE_DEVICE_SKIPPED, {
        nodeId,
        index,
        reason: error instanceof Error ? error.message : HEADLESS_ERROR_UNKNOWN,
      });
    },
    { skipElement: (device) => !device },
  );

  const services = safeTransform<
    ESPRMNeoService,
    ReturnType<typeof transformToESPCDFService>
  >(
    node.services,
    ESPRMNEO_TRANSFORM_CONTEXT_NODE_SERVICES,
    (service) => transformToESPCDFService(service),
    ({ index, error }) => {
      Logger.warn(ESPRMNEO_TRANSFORM_LOG_NODE_SERVICE_SKIPPED, {
        nodeId,
        index,
        reason: error instanceof Error ? error.message : HEADLESS_ERROR_UNKNOWN,
      });
    },
    { skipElement: (service) => !service },
  );

  const cdfNode = new ESPCDFNode({
    identifier: ESPRMNeoBaseAdaptorIdentifier,
    id: nodeId,
    type: ESPRMNEO_CDF_NODE_TYPE,
    nodeConfig: new ESPCDFNodeConfig({
      configVersion: node.config.config_version ?? "",
      info: mapSdkNodeInfoToCdf(node.config.info),
    }),
    devices,
    services,
    connectivityStatus: node.connectivityStatus,
    metadata: {},
    operations: createNodeOperations(node),
    // TODO: derive from RMNeo sharing / primary-user APIs when available.
    isPrimaryUser: true,
    transportOrder: node.transportOrder,
    availableTransports: node.availableTransports,
    _raw: node,
  });

  cdfNode.onPropertyChange(createPropertyChangeSyncCallback(node, cdfNode));
  makeCdfNodeParamsObservable(cdfNode);

  // Fresh SDK instances only seed mqtt; re-apply durable LAN registration so
  // setParams can go local-first before the next discovery cycle.
  projectRegisteredTransportsOntoRawNode(
    node,
    ESPCDF.instance?.subscriptionStore?.getRegisteredTransportsSnapshot?.()?.[
      nodeId
    ],
  );

  return cdfNode;
}

/**
 * Maps a batch of RMNeo SDK nodes to CDF nodes. Failures are skipped and logged.
 * @param nodes - Raw SDK nodes.
 * @param context - Label included in partial-failure logs.
 * @returns Successfully transformed CDF nodes.
 */
export function transformToESPCDFNodes(
  nodes: ESPRMNeoNode[],
  context: string,
): ESPCDFNode[] {
  const failures: { nodeId: string; index: number; reason: string }[] = [];

  const transformedNodes = safeTransform<ESPRMNeoNode, ESPCDFNode>(
    nodes,
    context,
    (n) => transformToESPCDFNode(n),
    ({ index, context: ctx, error }) => {
      failures.push({
        nodeId: nodes[index]?.nodeId ?? "",
        index,
        reason: `${ctx}: ${
          error instanceof Error ? error.message : HEADLESS_ERROR_UNKNOWN
        }`,
      });
    },
  );

  if (failures.length > 0) {
    Logger.warn(ESPRMNEO_TRANSFORM_LOG_NODE_PARTIAL_FAILURES, failures);
  }

  return transformedNodes;
}
