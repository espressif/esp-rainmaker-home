/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ESPRMNeoBase,
  type ESPNodeUpdateData,
  type ESPRMNeoNode,
} from "@espressif/rainmaker-neo-base-sdk";
import {
  ESPCDF,
  EVENT_NODE_CONNECTED,
  EVENT_NODE_DISCONNECTED,
  type ESPCDFNodeUpdateEvent,
} from "@store";
import { mapNodeUpdateDataToEvent } from "@shared/utils/subscriptionHelper";
import {
  ESPRMNEO_TRANSFORM_LOG_NCFG_REFRESH_FAILED,
  ESPRMNEO_TRANSFORM_LOG_SUBSCRIBE_NODE_FAILED,
  ESPRMNEO_TRANSFORM_LOG_SUBSCRIPTION_MANAGER_UNAVAILABLE,
} from "../constants";
import { Logger } from "../logger";
import {
  refreshRmneoCdfIfNcfgAheadOfStore,
  runNcfgShadowHandlerCoalesced,
} from "./nodeHelpers";
import {
  emitShadowConnectivityEvents,
  mapShadowDocumentToNodeUpdateEvents,
} from "./sharedHelpers";

/**
 * One store-sink callback per `nodeId`. Replaced on re-transform so SDK
 * channel singletons do not fan out to multiple CDF listeners.
 */
const cdfStoreSinkByNodeId = new Map<
  string,
  (update: ESPNodeUpdateData) => void
>();

/**
 * Returns true when `metadata.shadow` looks like an AWS IoT shadow document
 * (`state.reported` present) — the MQTT channel shape from
 * `transformShadowToNodeUpdate`.
 * @param shadow - Value from `ESPNodeUpdateData.metadata.shadow`.
 * @returns Whether the payload can be treated as a full shadow document.
 */
const isAwsShadowDocument = (shadow: unknown): shadow is object =>
  !!shadow &&
  typeof shadow === "object" &&
  (shadow as { state?: { reported?: unknown } }).state?.reported !== undefined;

/**
 * Resolves the CDF `nodeUpdates.listen` sink, or an override from user subscribe.
 * @param listenOverride - Optional CDF callback (e.g. `onNodeUpdate`).
 * @returns Listener, or `undefined` when the store is not ready.
 */
function resolveCdfListen(
  listenOverride?: (ev: ESPCDFNodeUpdateEvent) => void,
): ((ev: ESPCDFNodeUpdateEvent) => void) | undefined {
  return listenOverride ?? ESPCDF.instance?.subscriptionStore?.nodeUpdates?.listen;
}

/**
 * Schedules CDF ncfg rebuild when shadow `ncfg_ver` is ahead of the store.
 * SDK owns raw `sync()` + ncfg markers; this only projects schema into CDF.
 * @param nodeId - Node whose config may have changed.
 * @param shadow - Full AWS shadow document.
 */
function scheduleCdfNcfgRefresh(nodeId: string, shadow: object): void {
  void runNcfgShadowHandlerCoalesced(nodeId, async () => {
    try {
      await refreshRmneoCdfIfNcfgAheadOfStore(nodeId, shadow);
    } catch (err) {
      Logger.warn(ESPRMNEO_TRANSFORM_LOG_NCFG_REFRESH_FAILED, {
        nodeId,
        err,
      });
    }
  });
}

/**
 * Projects one SDK `ESPNodeUpdateData` into the CDF subscription store.
 *
 * Prefers the SDK-normalized `payload` for params (no shadow re-parse).
 * Shadow is used only for connectivity + CDF ncfg rebuild.
 * @param update - Normalized update from `subscriptionManager`.
 * @param listenOverride - Optional listen target (user `onNodeUpdate`).
 */
export function projectRmneoUpdateToCdf(
  update: ESPNodeUpdateData,
  listenOverride?: (ev: ESPCDFNodeUpdateEvent) => void,
): void {
  const listen = resolveCdfListen(listenOverride);
  if (!listen) {
    return;
  }

  const shadow = update.metadata?.shadow;
  if (isAwsShadowDocument(shadow)) {
    emitShadowConnectivityEvents(update.nodeId, shadow, listen);
    scheduleCdfNcfgRefresh(update.nodeId, shadow);
  }

  const payload = update.payload;
  if (
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    Object.keys(payload).length > 0
  ) {
    listen(mapNodeUpdateDataToEvent(update));
  }
}

/**
 * Projects a raw AWS shadow document into CDF (connectivity + params).
 * Used when the SDK does not fan the message out (e.g. `/update/accepted`).
 * @param nodeId - Target node id.
 * @param shadow - Parsed shadow JSON.
 * @param listenOverride - Optional listen target.
 */
export function projectShadowDocumentToCdf(
  nodeId: string,
  shadow: unknown,
  listenOverride?: (ev: ESPCDFNodeUpdateEvent) => void,
): void {
  const listen = resolveCdfListen(listenOverride);
  if (!listen || !isAwsShadowDocument(shadow)) {
    return;
  }

  emitShadowConnectivityEvents(nodeId, shadow, listen);
  scheduleCdfNcfgRefresh(nodeId, shadow);

  for (const ev of mapShadowDocumentToNodeUpdateEvents(nodeId, shadow)) {
    if (
      ev.event_type === EVENT_NODE_CONNECTED ||
      ev.event_type === EVENT_NODE_DISCONNECTED
    ) {
      // Connectivity already emitted above; avoid duplicate store writes.
      continue;
    }
    listen(ev);
  }
}

/**
 * Registers (or replaces) the CDF store sink for one `ESPRMNeoNode` on
 * `ESPRMNeoBase.subscriptionManager`.
 *
 * SDK owns MQTT + raw node updates; this only projects into
 * `subscriptionStore.nodeUpdates.listen`.
 *
 * Call again after `resetMqttNodeRegistrations` or `_raw` replacement so
 * updates keep reaching the CDF store.
 * @param node - RMNeo SDK node to bind.
 */
export function bindRmneoCdfStoreSink(node: ESPRMNeoNode): void {
  const handleNodeUpdate = (update: ESPNodeUpdateData) => {
    projectRmneoUpdateToCdf(update);
  };

  try {
    const manager = ESPRMNeoBase.subscriptionManager;
    const previous = cdfStoreSinkByNodeId.get(node.nodeId);
    if (previous) {
      void manager.unsubscribeFromNode(node.nodeId, previous).catch(() => {});
    }
    cdfStoreSinkByNodeId.set(node.nodeId, handleNodeUpdate);

    manager.subscribeToNode(node, handleNodeUpdate).catch((err) => {
      Logger.warn(ESPRMNEO_TRANSFORM_LOG_SUBSCRIBE_NODE_FAILED, {
        nodeId: node.nodeId,
        err,
      });
    });
  } catch (err) {
    Logger.warn(ESPRMNEO_TRANSFORM_LOG_SUBSCRIPTION_MANAGER_UNAVAILABLE, {
      nodeId: node.nodeId,
      err,
    });
  }
}
