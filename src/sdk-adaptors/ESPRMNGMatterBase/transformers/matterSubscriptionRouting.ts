/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { runInAction } from "mobx";
import type { ESPCDF, ESPCDFNode } from "@store";
import { mergeEndpointParamsIntoMergedData, ensureMatterDataAttributePath } from "@sdk-adaptors/ESPRMNGMatterBase/utils/mergeEndpointParamsIntoMatterData";
import { getMatterMetadata, setMatterMetadata } from "@shared/utils/matterLocalStorage";
import { isRmngPureMatterCdfNode, isRmngMatterHybridCdfNode } from "@sdk-adaptors/ESPRMNGMatterBase/utils/rmngMatterNodeKind";
import { isBridgeParentCdfNode } from "@sdk-adaptors/ESPRMNGMatterBase/bridge/rmngMatterBridgeKind";
import { resolveBridgedChildCdfNodeForSubscription } from "@sdk-adaptors/ESPRMNGMatterBase/bridge/rmngMatterBridgeDiscovery";
import { mergeRmngMatterEndpointParamsIntoMerged } from "@sdk-adaptors/ESPRMNGMatterBase/utils/mergeRmngMatterConfigAndParams";
import { logRmngDeviceParamsRaw } from "@sdk-adaptors/ESPRMNGBase/utils/rmngAdaptorDebugLog";
import { refreshPureMatterCdfNodeIfNeeded } from "@sdk-adaptors/ESPRMNGMatterBase/transformers/refreshRmngPureMatterCdfNode";
import {
    LIGHT_PARAM_TO_MATTER_PATH,
    type MatterSubscriptionPathMetadata,
    resolveEndpointHexForParam,
    registerLightParamTopologyPaths,
    collectCdfMatterParamNames,
    paramNameForMatterPath,
    applyMatterDeviceParamsToCdfNode,
    resolveMatterTargetDevice,
} from "@sdk-adaptors/ESPRMNGMatterBase/utils/rmngMatterTopologyHelpers";
import { encodeRmngMatterParamForMatterData, type MatterParamDecodeContext } from "@sdk-adaptors/ESPRMNGMatterBase/utils/decodeRmngMatterParamForCdf";

const MATTER_SUBSCRIPTION_DEVICE_NAME = "Light";
const PURE_MATTER_LOG = "[rmngPureMatter]";

export type { MatterSubscriptionPathMetadata };

/** Param names emitted by transformMatterToRMNG for light clusters. */
const KNOWN_LIGHT_PARAMS = new Set([
    "Power",
    "Brightness",
    "Hue",
    "Saturation",
    "CCT",
    "ColorTemperature",
    "Temperature",
]);


const matterPersistQueues = new Map<string, Promise<unknown>>();
function runMatterPersistSerialized<T>(
  nodeId: string,
  task: () => Promise<T>,
): Promise<T> {
  const prev = matterPersistQueues.get(nodeId) ?? Promise.resolve();
  const run = prev.then(task, task);
  matterPersistQueues.set(
    nodeId,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

function findCdfNode(cdfStore: ESPCDF, nodeId: string): ESPCDFNode | undefined {
    const node = cdfStore.nodeStore?.getNodeById?.(nodeId);
    if (node) return node;
    const list = cdfStore.nodeStore?.nodesList;
    if (!list) return undefined;
    const normalized = nodeId.toUpperCase();
    return list.find((candidate) => {
        const meta = candidate.metadata as
            | { matter_node_id?: string; matterNodeId?: string }
            | undefined;
        return (
            candidate.id.toUpperCase() === normalized ||
            (meta?.matter_node_id ?? meta?.matterNodeId ?? "").toUpperCase() ===
                normalized
        );
    });
}

async function fanOutBridgeParentSubscription(
    parentNodeId: string,
    deviceParams: Record<string, unknown>,
    cdfStore: ESPCDF,
    subscriptionMetadata?: MatterSubscriptionPathMetadata,
    payload?: Record<string, Record<string, unknown>> | Record<string, unknown>,
    options?: { paramDecodeContext?: MatterParamDecodeContext },
): Promise<void> {
    const list = cdfStore.nodeStore?.nodesList ?? [];
    const targetChild = resolveBridgedChildCdfNodeForSubscription(
        parentNodeId,
        list,
        subscriptionMetadata?.endpointId,
    );
    if (!targetChild) return;

    const childPayload =
        payload ??
        ({ Light: deviceParams } as Record<string, Record<string, unknown>>);
    await handleMatterLocalParamUpdate(
        targetChild.id,
        childPayload,
        cdfStore,
        subscriptionMetadata,
        options,
    );
}

/** Extract device-level params from SDK payload ({ Light: {...} }) or flat params. */
export function extractMatterDeviceParams(
    payload: Record<string, Record<string, unknown>> | Record<string, unknown>,
): Record<string, unknown> | null {
    if (!payload || typeof payload !== "object") return null;

    const lightBucket = (payload as Record<string, unknown>)[MATTER_SUBSCRIPTION_DEVICE_NAME];
    if (lightBucket && typeof lightBucket === "object" && !Array.isArray(lightBucket)) {
        return lightBucket as Record<string, unknown>;
    }

    const keys = Object.keys(payload);
    if (keys.some((k) => KNOWN_LIGHT_PARAMS.has(k))) {
        return payload as Record<string, unknown>;
    }

    for (const value of Object.values(payload)) {
        if (value && typeof value === "object" && !Array.isArray(value)) {
            const inner = value as Record<string, unknown>;
            if (Object.keys(inner).some((k) => KNOWN_LIGHT_PARAMS.has(k))) {
                return inner;
            }
        }
    }
    return null;
}

function buildCompressedEndpointParamsFromDeviceParams(
    deviceParams: Record<string, unknown>,
    device?: { params?: { name?: string; _matterPath?: { endpoint?: string } }[] },
    subscriptionMetadata?: MatterSubscriptionPathMetadata,
): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    for (const [paramName, value] of Object.entries(deviceParams)) {
        if (value === undefined || value === null) continue;
        const path = LIGHT_PARAM_TO_MATTER_PATH[paramName];
        if (!path) continue;
        const endpointHex = resolveEndpointHexForParam(paramName, device, subscriptionMetadata);
        if (!payload[endpointHex]) payload[endpointHex] = { c: { s: {} } };
        const ep = payload[endpointHex] as {
            c: { s: Record<string, Record<string, Record<string, unknown>>> };
        };
        if (!ep.c.s[path.cluster]) ep.c.s[path.cluster] = { a: {} };
        ep.c.s[path.cluster].a ??= {};
        ep.c.s[path.cluster].a![path.attribute] = encodeRmngMatterParamForMatterData(
            paramName,
            value,
        );
    }
    return payload;
}

function buildRmngEndpointParamsFromDeviceParams(
    deviceParams: Record<string, unknown>,
    device?: { params?: { name?: string; _matterPath?: { endpoint?: string } }[] },
    subscriptionMetadata?: MatterSubscriptionPathMetadata,
): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    for (const [paramName, value] of Object.entries(deviceParams)) {
        if (value === undefined || value === null) continue;
        const path = LIGHT_PARAM_TO_MATTER_PATH[paramName];
        if (!path) continue;
        const endpointHex = resolveEndpointHexForParam(paramName, device, subscriptionMetadata);
        if (!payload[endpointHex]) {
            payload[endpointHex] = { clusters: { servers: {} } };
        }
        const ep = payload[endpointHex] as {
            clusters: { servers: Record<string, { attributes: Record<string, unknown> }> };
        };
        if (!ep.clusters.servers[path.cluster]) {
            ep.clusters.servers[path.cluster] = { attributes: {} };
        }
        ep.clusters.servers[path.cluster].attributes[path.attribute] =
            encodeRmngMatterParamForMatterData(paramName, value);
    }
    return payload;
}

function hasUnknownSubscriptionParams(
    deviceParams: Record<string, unknown>,
    cdfParamNames: Set<string>,
): boolean {
    return Object.keys(deviceParams).some((paramName) => !cdfParamNames.has(paramName));
}

/**
 * Matter local subscription funnel for pure-Matter and RMNG+Matter hybrid CDF nodes.
 */
export async function handleMatterLocalParamUpdate(
    nodeId: string,
    payload: Record<string, Record<string, unknown>> | Record<string, unknown>,
    cdfStore?: ESPCDF | null,
    subscriptionMetadata?: MatterSubscriptionPathMetadata,
    options?: { paramDecodeContext?: MatterParamDecodeContext },
): Promise<void> {
    const deviceParams = extractMatterDeviceParams(payload);
    if (!deviceParams || Object.keys(deviceParams).length === 0) return;

    logRmngDeviceParamsRaw(
        "handleMatterLocalParamUpdate",
        nodeId,
        "matter",
        payload,
        { deviceParams },
    );

    if (!cdfStore?.nodeStore) return;
    const node = findCdfNode(cdfStore, nodeId);
    if (!node) {
        console.warn(`${PURE_MATTER_LOG} handleMatterLocalParamUpdate: CDF node not found`, nodeId);
        return;
    }

    const paramDecodeContext =
        options?.paramDecodeContext ?? "matter_subscription";

    if (isBridgeParentCdfNode(node)) {
        await fanOutBridgeParentSubscription(
            nodeId,
            deviceParams,
            cdfStore,
            subscriptionMetadata,
            payload,
            options,
        );
        return;
    }

    if (!isRmngPureMatterCdfNode(node) && !isRmngMatterHybridCdfNode(node)) {
        console.log(`${PURE_MATTER_LOG} handleMatterLocalParamUpdate: skip non-Matter node`, nodeId);
        return;
    }

    const isHybrid = isRmngMatterHybridCdfNode(node);
    const meta = node.metadata as {
        matter_data?: Record<string, unknown>;
        rmngMatterMergedData?: Record<string, unknown>;
    } | undefined;

    console.log(
        `${PURE_MATTER_LOG} handleMatterLocalParamUpdate entry`,
        nodeId,
        isHybrid ? "hybrid" : "pure",
        "params:",
        Object.keys(deviceParams),
        "cdfDeviceCount:",
        node.devices?.length ?? 0,
        "cdfDeviceNames:",
        node.devices?.map((d) => d.name),
    );

    const targetDevice = resolveMatterTargetDevice(node, deviceParams, subscriptionMetadata);
    const cdfParamNames = collectCdfMatterParamNames(node);
    const unknownParams = hasUnknownSubscriptionParams(deviceParams, cdfParamNames);

    if (!targetDevice?.params?.length) {
        console.warn(`${PURE_MATTER_LOG} handleMatterLocalParamUpdate: no device/params for node`, {
            nodeId,
            cdfDeviceCount: node.devices?.length ?? 0,
            cdfDeviceNames: node.devices?.map((d) => d.name),
            incomingParamNames: Object.keys(deviceParams),
            unknownParams,
        });
    } else {
        console.log(`${PURE_MATTER_LOG} handleMatterLocalParamUpdate target device`, {
            nodeId,
            deviceName: targetDevice.name,
            existingParamNames: targetDevice.params?.map((p) => p.name),
            unknownParams,
        });

        applyMatterDeviceParamsToCdfNode(node, deviceParams, subscriptionMetadata, {
            paramDecodeContext,
        });
    }

    try {
        await runMatterPersistSerialized(nodeId, async () => {
          const existing = await getMatterMetadata(nodeId);
          const matterData = (existing?.matter_data ??
            meta?.matter_data ?? {
              data_model: "matter",
              endpoints: {},
            }) as Record<string, unknown>;

          if (isHybrid) {
            const compressedParams =
              buildCompressedEndpointParamsFromDeviceParams(
                deviceParams,
                targetDevice,
                subscriptionMetadata,
              );
            mergeRmngMatterEndpointParamsIntoMerged(
              matterData,
              compressedParams,
            );
          } else {
            registerLightParamTopologyPaths(
              matterData,
              Object.keys(deviceParams),
              targetDevice,
              subscriptionMetadata,
            );

            const rmngParams = buildRmngEndpointParamsFromDeviceParams(
              deviceParams,
              targetDevice,
              subscriptionMetadata,
            );
            mergeEndpointParamsIntoMergedData(matterData, rmngParams);

            if (
              subscriptionMetadata?.endpointId !== undefined &&
              subscriptionMetadata.clusterId !== undefined &&
              subscriptionMetadata.attributeId !== undefined
            ) {
              const pathParam = paramNameForMatterPath(
                subscriptionMetadata.clusterId,
                subscriptionMetadata.attributeId,
              );
              const pathValue =
                pathParam && deviceParams[pathParam] !== undefined
                  ? deviceParams[pathParam]
                  : undefined;
              ensureMatterDataAttributePath(
                matterData,
                subscriptionMetadata.endpointId,
                subscriptionMetadata.clusterId,
                subscriptionMetadata.attributeId,
                pathValue,
              );
            }
          }
          await setMatterMetadata(nodeId, { matter_data: matterData });
          runInAction(() => {
            if (meta) {
              meta.matter_data = matterData;
            }
          });
          const endpointCount = Object.keys(
            (matterData.endpoints as Record<string, unknown> | undefined) ?? {},
          ).length;
          // logRawMatterData(
          //   nodeId,
          //   "handleMatterLocalParamUpdate persisted",
          //   matterData,
          // );
          console.log(
            `${PURE_MATTER_LOG} handleMatterLocalParamUpdate persisted matter_data`,
            {
              nodeId,
              endpointCount,
              updatedParams: Object.keys(deviceParams),
              unknownParams,
            },
          );
          await refreshPureMatterCdfNodeIfNeeded(nodeId, node, {
            forceParamRefresh: unknownParams,
          });

          const refreshedNode = findCdfNode(cdfStore, nodeId);
          if (refreshedNode) {
            applyMatterDeviceParamsToCdfNode(
              refreshedNode,
              deviceParams,
              subscriptionMetadata,
            );
          }
        });
    } catch (error) {
        console.warn(`${PURE_MATTER_LOG} handleMatterLocalParamUpdate matter_data persist failed:`, error);
    }
}
