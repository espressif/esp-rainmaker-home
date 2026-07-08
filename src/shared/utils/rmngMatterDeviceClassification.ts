/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFNode } from "@store";

type MatterNodeMeta = {
    isBridgeParent?: boolean;
    isBridgedRmngMatterChild?: boolean;
    isRmngMatterHybrid?: boolean;
    matter_node_id?: string;
    matterNodeId?: string;
};

/** Matter bridge parent — hidden from automation/room pickers; shown on Home as status. */
export function isBridgeParentInfrastructureNode(node: ESPCDFNode): boolean {
    const meta = node.metadata as MatterNodeMeta | undefined;
    if (!meta?.isBridgeParent) return false;
    // Home shows the thread-br status card; automation/scheduling should skip it.
    return (node.devices ?? []).every(
        (device) => (device.params?.length ?? 0) === 0,
    );
}

/** Drop infrastructure bridge parents from user-facing node/device pickers. */
export function filterNodesForUserDeviceLists(nodes: ESPCDFNode[]): ESPCDFNode[] {
    return nodes.filter((node) => !isBridgeParentInfrastructureNode(node));
}

/**
 * RMNG+Matter or bridged Matter child — used where RainMaker automation cannot
 * subscribe to local Matter-only triggers.
 */
export function isRmngMatterAutomationDeviceNode(node: ESPCDFNode): boolean {
    const meta = node.metadata as MatterNodeMeta | undefined;
    if (meta?.isRmngMatterHybrid || meta?.isBridgedRmngMatterChild) return true;
    const matterId = meta?.matter_node_id ?? meta?.matterNodeId;
    return typeof matterId === "string" && matterId.trim().length > 0;
}
