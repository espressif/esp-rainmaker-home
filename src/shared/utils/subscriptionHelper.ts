/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFNodeUpdateEvent, NodeUpdateDataInput, ESP_CDF_NODE_SUBSCRIPTION_EVENTS } from "@store";

/**
 * RainMaker Cloud push notification event_type strings mapped to CDF node subscription events.
 */
export const RAINMAKER_EVENT_TO_CDF_NODE_SUBSCRIPTION_EVENTS: Record<string, string> = {
  "rmaker.event.node_params_changed":
    ESP_CDF_NODE_SUBSCRIPTION_EVENTS.NODE_PARAMS_CHANGED,
  "rmaker.event.user_node_added": ESP_CDF_NODE_SUBSCRIPTION_EVENTS.USER_NODE_ADDED,
  "rmaker.event.user_node_removed":
    ESP_CDF_NODE_SUBSCRIPTION_EVENTS.USER_NODE_REMOVED,
  "rmaker.event.node_connected": ESP_CDF_NODE_SUBSCRIPTION_EVENTS.NODE_CONNECTED,
  "rmaker.event.node_disconnected":
    ESP_CDF_NODE_SUBSCRIPTION_EVENTS.NODE_DISCONNECTED,
  // RainMaker NG (rmng) subscription-channel event types.
  "rmng.event.node_params_changed":
    ESP_CDF_NODE_SUBSCRIPTION_EVENTS.NODE_PARAMS_CHANGED,
  "rmng.event.node_connected": ESP_CDF_NODE_SUBSCRIPTION_EVENTS.NODE_CONNECTED,
  "rmng.event.node_disconnected":
    ESP_CDF_NODE_SUBSCRIPTION_EVENTS.NODE_DISCONNECTED,
};

/**
 * Resolves an incoming event type to a CDF topic. Unknown strings pass through unchanged
 * so future topics or vendor extensions can still be routed by custom handlers.
 */
export function mapRainmakerEventToCDFNodeSubscriptionEvent(eventType: string): string {
  if (!eventType) return eventType;
  return RAINMAKER_EVENT_TO_CDF_NODE_SUBSCRIPTION_EVENTS[eventType] ?? eventType;
}

/**
 * Maps subscription-channel update data to the CDF node-update event shape.
 * Pure transformation only; no side effects or store access.
 *
 * Used by the adaptor layer to forward SDK subscription manager updates
 * into the CDF subscription store (nodeEventHandlers contract).
 * @param update - Update from subscription channel (e.g. SDK ESPNodeUpdateData)
 * @returns Event shape expected by subscriptionStore.nodeUpdates.listen
 */
export function mapNodeUpdateDataToEvent(
  update: NodeUpdateDataInput
): ESPCDFNodeUpdateEvent {
  return {
    event_type: mapRainmakerEventToCDFNodeSubscriptionEvent(update.eventType),
    node_id: update.nodeId,
    payload: update.payload,
    timestamp:
      (update.metadata?.timestamp as number | undefined) ?? Date.now(),
  };
}
