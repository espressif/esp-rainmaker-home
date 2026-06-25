/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ESPRMNGNode,
    ESPRMNG_NODE_EVENT_PARAMS,
} from "@espressif/rmng-base-sdk";

type ParamsListener = (event: unknown) => void;

const paramsListenerByNode = new WeakMap<ESPRMNGNode, ParamsListener>();

/** Replaces any prior `params` listener on the backing SDK node (hybrid rebuild safe). */
export function setRmngSdkNodeParamsListener(
    node: ESPRMNGNode,
    listener: ParamsListener,
): void {
    const prev = paramsListenerByNode.get(node);
    if (prev) {
        node.off(ESPRMNG_NODE_EVENT_PARAMS, prev);
    }
    node.on(ESPRMNG_NODE_EVENT_PARAMS, listener);
    paramsListenerByNode.set(node, listener);
}
