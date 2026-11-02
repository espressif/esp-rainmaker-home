/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { normalizeMatterNodeIdHex } from "@shared/utils/matterNodeIdHex";

/**
 * Whether a completed commission is a pure Matter node, judged by the cloud
 * having minted the same id for both at `/verify`.
 * @param cloudNodeId - Cloud node id resolved for the commissioned node.
 * @param matterNodeId - Matter node id from the completion event payload.
 * @returns `true` only when both ids are present and name the same node, so a
 * missing id leaves the caller on its slower node-inspecting path.
 */
export function isPureMatterCommissionedNode(
  cloudNodeId: unknown,
  matterNodeId: unknown,
): boolean {
  const cloud = normalizeMatterNodeIdHex(
    typeof cloudNodeId === "string" ? cloudNodeId : undefined,
  );
  const matter = normalizeMatterNodeIdHex(
    typeof matterNodeId === "string" ? matterNodeId : undefined,
  );
  return Boolean(cloud && matter && cloud === matter);
}
