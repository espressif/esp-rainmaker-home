/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ESPCDF,
  type ESPCDFNode,
  EVENT_NODE_CONNECTED,
  EVENT_NODE_DISCONNECTED,
  EVENT_NODE_PARAMS_CHANGED,
} from "@store";
import type { ESPRMNGNode } from "@espressif/rmng-base-sdk";
import {
  emitShadowConnectivityEvents,
  mapShadowDocumentToNodeUpdateEvents,
} from "@sdk-adaptors/ESPRMNGBase/utils/common";
import { refreshRmngNodeIfShadowNcfgVersionChanged } from "@sdk-adaptors/ESPRMNGBase/utils/rmngNcfgVersionShadowRefresh";
import { runNcfgShadowHandlerCoalesced } from "@sdk-adaptors/ESPRMNGBase/utils/rmngNcfgShadowCoalesce";
import { logRmngDeviceParamsRaw } from "@sdk-adaptors/ESPRMNGBase/utils/rmngAdaptorDebugLog";
import { resolveRmngMatterShadowPayloadForCdf } from "./rmngMatterShadowParams";
import { isRmngMatterEndpointParamFormat } from "./rmngMatterEndpointFormat";
import { setRmngSdkNodeParamsListener } from "./rmngSdkNodeParamsListener";

/**
 * Wires SDK `params` / shadow events on a hybrid node to CDF subscription updates.
 * Must be re-run after `cdfNode._raw` is swapped (room MQTT resync, cloud refresh).
 */
export function bindHybridMatterMqttParamsBridge(
  cdfNode: ESPCDFNode,
  sdkNode: ESPRMNGNode,
): void {
  const nodeId = sdkNode.nodeId ?? cdfNode.id;

  setRmngSdkNodeParamsListener(sdkNode, (event: unknown) => {
    const isShadowDoc =
      event &&
      typeof event === "object" &&
      (event as { state?: { reported?: unknown } }).state?.reported !== undefined;
    logRmngDeviceParamsRaw(
      "buildRmngHybridMatterCdfNode.params",
      nodeId,
      "mqtt",
      event,
      { isShadowDoc },
    );

    const root = ESPCDF.instance;
    const listen = root?.subscriptionStore?.nodeUpdates?.listen;
    if (!listen) return;

    if (isShadowDoc) {
      void (async () => {
        emitShadowConnectivityEvents(nodeId, event, listen);

        const isPrimary = await runNcfgShadowHandlerCoalesced(nodeId, async () => {
          try {
            await refreshRmngNodeIfShadowNcfgVersionChanged(nodeId, event);
          } catch (err) {
            console.warn(
              `[ncfg_ver][app] refreshRmngNodeIfShadowNcfgVersionChanged failed nodeId=${nodeId}`,
              err,
            );
          }
        });
        if (!isPrimary) return;

        const events = mapShadowDocumentToNodeUpdateEvents(nodeId, event);
        for (const ev of events) {
          if (
            ev.event_type === EVENT_NODE_CONNECTED ||
            ev.event_type === EVENT_NODE_DISCONNECTED
          ) {
            continue;
          }
          if (
            ev.event_type === EVENT_NODE_PARAMS_CHANGED &&
            ev.payload &&
            typeof ev.payload === "object"
          ) {
            const freshCdf =
              root?.nodeStore?.getNodeById?.(nodeId) ?? cdfNode;
            const incomingParams = ev.payload as Record<string, unknown>;
            const payloadForCdf = resolveRmngMatterShadowPayloadForCdf(
              freshCdf,
              incomingParams,
            );
            if (
              payloadForCdf === null ||
              isRmngMatterEndpointParamFormat(payloadForCdf)
            ) {
              continue;
            }
            console.log(
              "[buildRmngHybridMatterCdfNode] shadow mapped",
              { nodeId, mapped: payloadForCdf },
            );
            ev.payload = payloadForCdf;
          }
          listen(ev);
        }
      })();
      return;
    }

    const rawPayload =
      event && typeof event === "object"
        ? (event as Record<string, unknown>)
        : {};
    const rewritten = resolveRmngMatterShadowPayloadForCdf(cdfNode, rawPayload);
    if (rewritten === null || isRmngMatterEndpointParamFormat(rewritten)) return;
    listen({
      event_type: EVENT_NODE_PARAMS_CHANGED,
      node_id: nodeId,
      payload: rewritten,
      timestamp: Date.now(),
    });
  });
}
