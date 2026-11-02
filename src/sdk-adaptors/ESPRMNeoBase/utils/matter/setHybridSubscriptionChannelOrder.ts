/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MatterSdkNodeLike } from "@sdk-adaptors/shared/utils/injectLocalMatterNodeIds";

/** Base-SDK subscription channel id for the AWS IoT shadow. */
const MQTT_SUBSCRIPTION_CHANNEL = "mqtt";

/** Matter SDK subscription channel id, hardcoded so this stays off the Matter adaptor. */
const MATTER_SUBSCRIPTION_CHANNEL = "matter";

type PinnableNode = MatterSdkNodeLike & {
  isMatter?: boolean;
  setSubscriptionChannelOrder?: (channelIds: string[]) => void;
};

/**
 * Gives a hybrid a deliberate subscription channel order: Matter first, cloud
 * behind it.
 *
 * Order alone used to be the whole problem: the Matter channel resolves its
 * `subscribe` before the adapter handshake, so putting it first meant a hybrid
 * never reached MQTT and every cloud-only write (timezone, schedules) failed
 * with `Node … not registered`. The channel now declines a hybrid it cannot
 * reach on the fabric, so order is safe to state honestly — Matter serves it on
 * the LAN, where its attributes are live and the shadow may carry no params at
 * all, and MQTT serves it everywhere else.
 *
 * Local Matter control is untouched either way: that rides `transportOrder`,
 * not the subscription channels.
 * @param node - Raw SDK node, mutated in place before the CDF transform.
 */
export function setHybridSubscriptionChannelOrder(node: PinnableNode): void {
  if (
    node.isMatter === true ||
    typeof node.setSubscriptionChannelOrder !== "function"
  ) {
    return;
  }
  const meta = node.metadata as { matter_node_id?: string } | undefined;
  if (!node.matterNodeId && !meta?.matter_node_id) {
    return;
  }
  node.setSubscriptionChannelOrder([
    MATTER_SUBSCRIPTION_CHANNEL,
    MQTT_SUBSCRIPTION_CHANNEL,
  ]);
}
