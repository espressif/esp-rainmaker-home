/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFNode } from "@store";
import { ESPRMNGNode } from "@espressif/rmng-base-sdk";
import {
    isBridgeParentNode,
    isBridgedRmngMatterChildNode,
} from "../bridge";
import { isClassicRmngCloudNode, isRmngMatterHybridNode } from "../utils";
import { buildBridgeParentCdfNode } from "../bridge/transformers/buildBridgeParentCdfNode";
import { buildRmngBridgedMatterCdfNode } from "../bridge/transformers/buildRmngBridgedMatterCdfNode";
import { buildRmngHybridMatterCdfNode } from "./buildRmngHybridMatterCdfNode";
import {
    buildRmngMatterCdfNode,
    isRmngMatterNodeCandidate,
    type TransformRmngNodeOptions,
} from "./buildRmngMatterCdfNode";

export type { TransformRmngNodeOptions };

/**
 * Whether {@link transformRmngMatterNodeToCdf} should handle this SDK node (Matter paths only).
 */
export function isRmngMatterTransformPath(
    node: ESPRMNGNode,
    options?: TransformRmngNodeOptions,
): boolean {
    if (
        isClassicRmngCloudNode(node) &&
        !isBridgedRmngMatterChildNode(node) &&
        !isBridgeParentNode(node)
    ) {
        return false;
    }

    // Bridged mesh children are rmng-only in node_details but use the Matter hybrid build path.
    if (
        options?.groupNodeCapability &&
        !options.groupNodeCapability.hasMatter &&
        !isBridgedRmngMatterChildNode(node)
    ) {
        return false;
    }
    return (
        isBridgeParentNode(node) ||
        isBridgedRmngMatterChildNode(node) ||
        options?.isRmngMatterHybrid === true ||
        isRmngMatterHybridNode(node) ||
        isRmngMatterNodeCandidate(node, options)
    );
}

/**
 * Transforms one RMNG Matter SDK node into a CDF node (pure, hybrid, bridge parent, bridged child).
 */
export function transformRmngMatterNodeToCdf(
    node: ESPRMNGNode,
    options?: TransformRmngNodeOptions,
): ESPCDFNode {
    if (isBridgeParentNode(node)) {
        return buildBridgeParentCdfNode(node, options);
    }

    if (isBridgedRmngMatterChildNode(node)) {
        return buildRmngBridgedMatterCdfNode(node, options);
    }

    if (options?.isRmngMatterHybrid || isRmngMatterHybridNode(node)) {
        return buildRmngHybridMatterCdfNode(node, options);
    }

    if (isRmngMatterNodeCandidate(node, options)) {
        return buildRmngMatterCdfNode(node, options);
    }

    throw new Error(
        `[ESPRMNGMatterBase/transformRmngMatterNodeToCdf] Node ${node.nodeId} is not a Matter node candidate`,
    );
}
