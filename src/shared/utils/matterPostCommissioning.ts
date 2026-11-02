/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPCDFUser } from "@store";
import { isPureMatterCommissionedNode } from "@shared/utils/matterCommissionedNode";
import { applyMatterCommissionedNodeTimezone } from "@shared/utils/timezone";

/**
 * Cloud-side setup a Matter-commissioned node still needs once commissioning
 * itself has succeeded.
 *
 * Matter commissioning never runs the provisioning-time stages, so anything the
 * Wi-Fi provision path does after a node joins has to be repeated here. Today
 * that is the timezone; the point of one named entry is that the next such step
 * lands here too, rather than growing another branch in the commissioning
 * screen's hook — which has no business knowing which cloud calls are involved.
 *
 * Fire-and-forget on purpose: commissioning has already succeeded and the user
 * has been navigated onward, so a failure here must not surface as a
 * commissioning error. Each step retries on its own schedule.
 * @param user - Signed-in CDF user, used to fetch and write the node.
 * @param cloudNodeId - RainMaker node id returned by the association step.
 * @param matterNodeId - Operational Matter node id from the same response;
 *   equal to `cloudNodeId` on a pure Matter node.
 */
export function applyPostCommissioningNodeSetup(
  user: ESPCDFUser | null,
  cloudNodeId: string | undefined,
  matterNodeId: unknown,
): void {
  if (!cloudNodeId) {
    return;
  }

  // Decided here rather than inside the timezone helper so the helper never has
  // to fetch the node to find out: that fetch rebuilds a pure Matter node from a
  // config carrying `endpoints` and no `devices`, which blanks the card the user
  // is looking at.
  void applyMatterCommissionedNodeTimezone(
    user,
    cloudNodeId,
    isPureMatterCommissionedNode(cloudNodeId, matterNodeId),
  );
}
