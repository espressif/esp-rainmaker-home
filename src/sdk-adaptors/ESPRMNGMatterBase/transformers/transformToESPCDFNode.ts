/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPRMNGNode } from "@espressif/rmng-base-sdk";
import type { ESPCDFNode } from "@store";
import { transformToESPCDFNodeBase } from "@sdk-adaptors/ESPRMNGBase/transformers/transformToESPCDFNode";
import type { TransformRmngNodeOptions } from "./buildRmngMatterCdfNode";
import {
  isRmngMatterTransformPath,
  transformRmngMatterNodeToCdf,
} from "./transformRmngMatterNodeToCdf";

export type { TransformRmngNodeOptions } from "./buildRmngMatterCdfNode";
export { isRmngMatterTransformPath } from "./transformRmngMatterNodeToCdf";

/**
 * Matter-aware node transform: delegates to Matter build paths only when
 * {@link isRmngMatterTransformPath} matches; classic RMNG nodes stay on base.
 */
export function transformToESPCDFNode(
  node: ESPRMNGNode,
  options?: unknown,
): ESPCDFNode {
  const matterOptions = options as TransformRmngNodeOptions | undefined;
  if (isRmngMatterTransformPath(node, matterOptions)) {
    return transformRmngMatterNodeToCdf(node, matterOptions);
  }
  return transformToESPCDFNodeBase(node);
}
