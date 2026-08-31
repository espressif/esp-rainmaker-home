/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ESPMQTTConfig,
  ESPMQTTInterface,
} from "../interfaces/ESPMQTTInterface";

import { webMqttManager } from "@modules/mqtt/web";
import { logWebDebugJson } from "@shared/utils/webDebugLog";

const topicHandlers = new Map<
  string,
  Set<(topic: string, payload: Buffer) => void>
>();

/** Optional post-dispatch observers (sdk-adaptors register; keeps layering clean). */
type MqttMessageHook = (topic: string, message: string) => void;
const mqttMessageHooks = new Set<MqttMessageHook>();

/** Transport connection-status observers (parallel to native). */
type MqttConnectionStatus = { connected: boolean };
type MqttConnectionHook = (status: MqttConnectionStatus) => void;
const mqttConnectionHooks = new Set<MqttConnectionHook>();

/**
 * Serializes broker subscribe/unsubscribe calls per topic (same rationale as native).
 */
const topicOpQueue = new Map<string, Promise<unknown>>();

let bridgeListening = false;
let connectionBridgeListening = false;

/**
 * Registers a hook invoked after each MQTT message is dispatched to topic
 * handlers. Returns an unsubscribe function.
 * @param hook - Observer for topic + UTF-8 message body
 * @returns Function that removes the hook
 */
export function addMqttMessageHook(hook: MqttMessageHook): () => void {
  mqttMessageHooks.add(hook);
  return () => {
    mqttMessageHooks.delete(hook);
  };
}

/**
 * Registers a listener for web MQTT transport connect/disconnect. Mirrors the
 * native adapter's export so shared code (`mqttConnectionHelpers`) works
 * identically on both platforms. Returns an unsubscribe function.
 * @param hook - Observer for `{ connected }` transitions
 * @returns Function that removes the hook
 */
export function addMqttConnectionListener(
  hook: MqttConnectionHook,
): () => void {
  mqttConnectionHooks.add(hook);
  ensureConnectionBridgeListener();
  return () => {
    mqttConnectionHooks.delete(hook);
    removeConnectionBridgeListenerIfIdle();
  };
}

/**
 * Runs an async op exclusively per topic so sub/unsub cannot race at the broker.
 * @param topic - Topic key for the queue
 * @param op - Exclusive operation
 * @returns Result of `op`
 */
function runExclusive<T>(topic: string, op: () => Promise<T>): Promise<T> {
  const prior = topicOpQueue.get(topic) ?? Promise.resolve();
  const result = prior.then(op, op);
  topicOpQueue.set(
    topic,
    result.then(
      () => undefined,
      () => undefined,
    ),
  );
  return result;
}

/**
 * Logs a structured MQTT adaptor event for debugging.
 * @param event - Event name
 * @param data - Extra fields
 */
function logMqttJson(event: string, data: Record<string, unknown>): void {
  logWebDebugJson(event, data);
}

/**
 * MQTT topic filter match (`+` / `#`).
 * @param filter - Subscription pattern
 * @param topic - Concrete topic
 * @returns Whether the topic matches the filter
 */
function topicMatches(filter: string, topic: string): boolean {
  const fSegs = filter.split("/");
  const tSegs = topic.split("/");

  for (let i = 0; i < fSegs.length; i++) {
    const f = fSegs[i];
    if (f === "#") {
      return i === fSegs.length - 1;
    }
    if (i >= tSegs.length) {
      return false;
    }
    if (f === "+") {
      continue;
    }
    if (f !== tSegs[i]) {
      return false;
    }
  }
  return fSegs.length === tSegs.length;
}

/**
 * Dispatches a broker message to all matching JS handlers.
 * @param topic - Concrete topic
 * @param payload - Message body
 */
function dispatchMessage(topic: string, payload: Buffer): void {
  for (const [pattern, handlers] of topicHandlers) {
    if (topicMatches(pattern, topic)) {
      // Body only under __DEV__ so end-user DevTools never sees payload PII.
      logMqttJson("mqtt.dispatch", {
        topic,
        pattern,
        bytes: payload.length,
        ...(__DEV__ ? { payload: payload.toString("utf8") } : {}),
      });
      handlers.forEach((h) => {
        h(topic, payload);
      });
    }
  }
}

/**
 * Forwards package-level messages into topic handlers and CDF hooks.
 * @param topic - Concrete topic
 * @param payload - Message body
 */
function onTransportMessage(topic: string, payload: Buffer): void {
  const message = payload.toString("utf8");
  logMqttJson("mqtt.received", {
    topic,
    bytes: payload.length,
    ...(__DEV__ ? { message } : {}),
  });
  dispatchMessage(topic, payload);
  for (const hook of mqttMessageHooks) {
    try {
      hook(topic, message);
    } catch (error) {
      console.warn("[ESPMQTTAdapter] mqtt message hook failed:", error);
    }
  }
}

/**
 * Ensures the web transport delivers messages into this adaptor.
 */
function ensureBridgeListener(): void {
  if (bridgeListening) {
    return;
  }
  webMqttManager.setMessageHandler(onTransportMessage);
  bridgeListening = true;
}

/**
 * Clears the transport message handler when no topic handlers remain.
 */
function removeBridgeListenerIfIdle(): void {
  if (topicHandlers.size > 0) {
    return;
  }
  webMqttManager.setMessageHandler(null);
  bridgeListening = false;
}

/**
 * Forwards transport status changes to all registered connection hooks.
 * @param status - Transport connect/disconnect status
 */
function onTransportStatus(status: MqttConnectionStatus): void {
  for (const hook of mqttConnectionHooks) {
    try {
      hook(status);
    } catch (error) {
      console.warn("[ESPMQTTAdapter] mqtt connection hook failed:", error);
    }
  }
}

/**
 * Ensures the web transport delivers status changes into this adaptor.
 */
function ensureConnectionBridgeListener(): void {
  if (connectionBridgeListening) {
    return;
  }
  webMqttManager.setStatusHandler(onTransportStatus);
  connectionBridgeListening = true;
}

/**
 * Clears the transport status handler when no connection hooks remain.
 */
function removeConnectionBridgeListenerIfIdle(): void {
  if (mqttConnectionHooks.size > 0) {
    return;
  }
  webMqttManager.setStatusHandler(null);
  connectionBridgeListening = false;
}

/**
 * Normalizes publish payloads to UTF-8 strings for logging.
 * @param payload - String or Buffer
 * @returns UTF-8 string
 */
function payloadToString(payload: string | Buffer): string {
  if (typeof payload === "string") {
    return payload;
  }
  return payload.toString("utf8");
}

/**
 * Web MQTT adaptor — thin bridge over `@modules/mqtt` AWS IoT WSS client.
 * Keeps the same JS-side subscription fan-out / exclusive queue / hooks as native.
 */
export const ESPMQTTAdapter: ESPMQTTInterface = {
  connect: async (config: ESPMQTTConfig) => {
    ensureBridgeListener();
    return webMqttManager.connect({
      endpoint: config.endpoint,
      clientId: config.clientId,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
      sessionToken: config.sessionToken,
      region: config.region,
    });
  },
  disconnect: async () => {
    topicHandlers.clear();
    topicOpQueue.clear();
    webMqttManager.setMessageHandler(null);
    bridgeListening = false;
    return webMqttManager.disconnect();
  },
  isConnected: async () => {
    return webMqttManager.isConnected();
  },
  onConnectionStatusChange: (callback) => addMqttConnectionListener(callback),
  publish: async (topic: string, payload: string | Buffer) => {
    const body = payloadToString(payload);
    logMqttJson("mqtt.publish", {
      topic,
      bytes: Buffer.byteLength(body, "utf8"),
      ...(__DEV__ ? { payload: body } : {}),
    });
    return webMqttManager.publish(topic, body);
  },
  subscribe: async (
    topic: string,
    handler: (topic: string, payload: Buffer) => void,
  ) => {
    const connected = await webMqttManager.isConnected();
    if (!connected) {
      throw new Error("ESPMQTTAdapter: not connected");
    }

    ensureBridgeListener();

    let set = topicHandlers.get(topic);
    const firstForPattern = !set || set.size === 0;
    if (!set) {
      set = new Set();
      topicHandlers.set(topic, set);
    }
    set.add(handler);

    if (firstForPattern) {
      await runExclusive(topic, () => webMqttManager.subscribe(topic));
    }
  },
  unsubscribe: async (
    topic: string,
    handler?: (topic: string, payload: Buffer) => void,
  ) => {
    const set = topicHandlers.get(topic);
    if (!set) {
      return;
    }

    if (handler) {
      set.delete(handler);
      if (set.size > 0) {
        return;
      }
      topicHandlers.delete(topic);
    } else {
      topicHandlers.delete(topic);
    }

    const connected = await webMqttManager.isConnected();
    if (connected) {
      await runExclusive(topic, () => webMqttManager.unsubscribe(topic));
    }
    removeBridgeListenerIfIdle();
  },
};

export default ESPMQTTAdapter;
