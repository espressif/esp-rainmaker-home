/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { buildShadowBase } from "@espressif/rainmaker-neo-base-sdk";
import {
  ESPMQTTAdapter,
  addMqttConnectionListener,
} from "@native-adaptors/implementations/ESPMQTTAdapter";
import { onSessionEnd } from "@shared/utils/userSession";

type DerivedParams = Record<string, Record<string, unknown>>;

/** Unsent reported params per shadow topic, latest value per param. */
const unsent = new Map<string, DerivedParams>();
let stopConnectionWatch: (() => void) | null = null;

onSessionEnd(() => {
  unsent.clear();
  stopConnectionWatch?.();
  stopConnectionWatch = null;
});

function mergeParams(into: DerivedParams, params: DerivedParams): void {
  for (const [deviceName, deviceParams] of Object.entries(params)) {
    into[deviceName] = { ...into[deviceName], ...deviceParams };
  }
}

async function publishUnsent(topic: string): Promise<void> {
  const params = unsent.get(topic);
  if (!params || !(await ESPMQTTAdapter.isConnected())) {
    return;
  }
  unsent.delete(topic);
  try {
    await ESPMQTTAdapter.publish(
      topic,
      JSON.stringify({ state: { reported: { params } } }),
    );
  } catch (error) {
    const newer = unsent.get(topic);
    unsent.set(topic, params);
    if (newer) mergeParams(params, newer);
    throw error;
  }
}

function watchConnection(): void {
  if (stopConnectionWatch) return;
  stopConnectionWatch = addMqttConnectionListener((status) => {
    if (!status.connected) return;
    for (const topic of [...unsent.keys()]) {
      void publishUnsent(topic).catch((error) => {
        console.warn("[derivedShadowReporter] publish after reconnect failed:", error);
      });
    }
  });
}

/**
 * Publishes a derived pure Matter node's params as its reported shadow state.
 * Params that cannot go out while MQTT is down are kept and sent on reconnect,
 * so a one-time value such as a new name is not lost.
 * @param nodeId - Node id
 * @param shadowName - Shadow name of the node's group
 * @param params - Params by device name
 */
export async function reportDerivedShadowParams(
  nodeId: string,
  shadowName: string,
  params: DerivedParams,
): Promise<void> {
  const topic = `${buildShadowBase(nodeId, shadowName)}/update`;
  const pending = unsent.get(topic) ?? {};
  mergeParams(pending, params);
  unsent.set(topic, pending);
  watchConnection();
  await publishUnsent(topic);
}
