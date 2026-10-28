/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { MATTER_ONLY_DATA_MODEL, NODE_TYPE } from "./constants";
import type { ESPCDFNode } from "@store";

/**
 * Whether a node is on the Matter fabric only, with no cloud stack behind it.
 * `data_model` is cloud truth; `nodeType` covers the pre-config-fetch window.
 * @param node - CDF node to classify
 * @returns `true` when the node has no cloud stack behind it
 */
export function isPureMatterNode(node: ESPCDFNode): boolean {
  const dataModel = (node as { _raw?: { config?: { data_model?: string } } })
    ._raw?.config?.data_model;
  if (dataModel === MATTER_ONLY_DATA_MODEL) {
    return true;
  }
  return (node as { nodeType?: string }).nodeType === NODE_TYPE.PURE_MATTER;
}
