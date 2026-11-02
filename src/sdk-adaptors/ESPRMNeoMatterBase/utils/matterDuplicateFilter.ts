/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPRMNeoNode } from "@espressif/rainmaker-neo-base-sdk";
import { ESPCDF } from "@store";
import { isServedByAnotherChannel } from "@sdk-adaptors/ESPRMNeoBase/utils/helpers/cdfStoreSinkHelpers";
import type {
  CloudShadowDocument,
  CloudUpdateFilter,
} from "@sdk-adaptors/ESPRMNeoBase/utils/helpers/cloudUpdateFilter";
import { wasParamDeliveredWithin } from "@sdk-adaptors/ESPRMNeoBase/utils/helpers/paramDeliveryHelpers";

/**
 * How long after the Matter link delivers a param the cloud's copy of it is
 * treated as a late echo. The cloud copy lands ~2 s behind.
 */
const CLOUD_ECHO_WINDOW_MS = 5_000;

/** A shadow document's reported params: device name → param name → value. */
type ReportedParams = Record<string, Record<string, unknown>>;

/** The Matter fields the Neo Matter SDK adds to a RainMaker + Matter node. */
type MatterLinkedNode = ESPRMNeoNode & {
  matterNodeId?: string;
  /** Params the Matter link carries, keyed `device::param`. */
  matterParamIndex?: Record<string, unknown>;
};

/**
 * Drops the params the Matter link delivered in the last few seconds, keeping
 * the rest (a name, a schedule, a value Matter never reported).
 * @param nodeId - Node the document is for
 * @param doc - Plain shadow document
 * @returns The document without recently delivered params, or null when
 *   nothing else is left in it
 */
function withoutRecentlyDeliveredParams(
  nodeId: string,
  doc: CloudShadowDocument,
): CloudShadowDocument | null {
  const { params, ...otherReported } = doc.state.reported as {
    params?: ReportedParams;
  };
  const cloudOnly: ReportedParams = {};
  for (const [deviceName, deviceParams] of Object.entries(params ?? {})) {
    for (const [paramName, value] of Object.entries(deviceParams ?? {})) {
      if (
        !wasParamDeliveredWithin(
          nodeId,
          deviceName,
          paramName,
          CLOUD_ECHO_WINDOW_MS,
        )
      ) {
        (cloudOnly[deviceName] ??= {})[paramName] = value;
      }
    }
  }
  if (
    Object.keys(cloudOnly).length === 0 &&
    Object.keys(otherReported).length === 0
  ) {
    return null;
  }
  return {
    ...doc,
    state: { ...doc.state, reported: { ...otherReported, params: cloudOnly } },
  };
}

/**
 * Builds the filter that drops cloud duplicates for the Neo Matter stack.
 *
 * While a live Matter subscription serves a RainMaker + Matter node, the
 * cloud's copy of what Matter already delivered lands ~2 s behind and could
 * undo a quick second toggle, so only params Matter delivered in the last
 * {@link CLOUD_ECHO_WINDOW_MS} are dropped. A value Matter did not deliver (a
 * report it could not map, say) still comes from the cloud. Once the link is
 * not live, everything goes through.
 * @param isLinkLive - Whether a node's Matter link is up (subscription adapter)
 * @returns Filter for the Neo base `/update/accepted` bridge
 */
export function createMatterDuplicateFilter(
  isLinkLive: (...nodeIds: (string | undefined)[]) => boolean,
): CloudUpdateFilter {
  return (nodeId, doc) => {
    const sdkNode = ESPCDF.instance?.nodeStore?.getNodeById?.(nodeId)?._raw as
      | MatterLinkedNode
      | undefined;
    if (
      !sdkNode?.matterParamIndex ||
      !isServedByAnotherChannel(sdkNode) ||
      !isLinkLive(nodeId, sdkNode.matterNodeId)
    ) {
      return doc;
    }
    return withoutRecentlyDeliveredParams(nodeId, doc);
  };
}
