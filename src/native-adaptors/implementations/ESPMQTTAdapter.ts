/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ESPMQTTConfig, ESPMQTTInterface } from "../interfaces/ESPMQTTInterface";
import {
    NativeEventEmitter,
    NativeModules,
    type EmitterSubscription
} from "react-native";

const { ESPMQTTModule } = NativeModules;

const MQTT_MESSAGE_EVENT = "mqttMessageReceived";
const MQTT_CONNECTION_STATUS_EVENT = "mqttConnectionStatus";

const topicHandlers = new Map<
    string,
    Set<(topic: string, payload: Buffer) => void>
>();

let bridgeSubscription: EmitterSubscription | null = null;
let connectionBridgeSubscription: EmitterSubscription | null = null;

/** Optional post-dispatch observers (sdk-adaptors register; keeps layering clean). */
type MqttMessageHook = (topic: string, message: string) => void;
const mqttMessageHooks = new Set<MqttMessageHook>();

/** Transport connection-status observers. */
type MqttConnectionStatus = { connected: boolean };
type MqttConnectionHook = (status: MqttConnectionStatus) => void;
const mqttConnectionHooks = new Set<MqttConnectionHook>();

/**
 * Registers a hook invoked after each native MQTT message is dispatched to
 * topic handlers. Returns an unsubscribe function.
 */
export function addMqttMessageHook(hook: MqttMessageHook): () => void {
    mqttMessageHooks.add(hook);
    return () => {
        mqttMessageHooks.delete(hook);
    };
}

/**
 * Registers a listener for native MQTT transport connect/disconnect.
 * Returns an unsubscribe function.
 */
export function addMqttConnectionListener(
    hook: MqttConnectionHook
): () => void {
    mqttConnectionHooks.add(hook);
    ensureConnectionBridgeListener();
    return () => {
        mqttConnectionHooks.delete(hook);
        removeConnectionBridgeListenerIfIdle();
    };
}

/**
 * Serializes native `ESPMQTTModule.subscribe`/`unsubscribe` calls per topic.
 *
 * `subscribe()`/`unsubscribe()` below only call into the native module when the
 * JS-side handler count for a topic transitions to/from zero, which can happen
 * back-to-back for the same topic (e.g. two overlapping shadow `get` requests
 * settling one after another). Without this queue, the native "unsubscribe"
 * for the last handler leaving and the native "resubscribe" for the next
 * handler arriving are independent, unawaited native bridge calls with no
 * ordering guarantee between them — if the bridge applies them out of order,
 * the client ends up silently unsubscribed at the broker even though
 * `topicHandlers` shows an active listener, and further messages/responses
 * for that topic are never delivered until something else resubscribes.
 */
const topicOpQueue = new Map<string, Promise<unknown>>();

function runExclusive<T>(topic: string, op: () => Promise<T>): Promise<T> {
    const prior = topicOpQueue.get(topic) ?? Promise.resolve();
    const result = prior.then(op, op);
    topicOpQueue.set(
        topic,
        result.then(
            () => undefined,
            () => undefined
        )
    );
    return result;
}

function logMqttJson(event: string, data: Record<string, unknown>): void {
    console.log(JSON.stringify({ event, ...data }));
}

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

function dispatchMessage(topic: string, payload: Buffer): void {
    for (const [pattern, handlers] of topicHandlers) {
        if (topicMatches(pattern, topic)) {
            logMqttJson("mqtt.dispatch", {
                topic,
                pattern,
                payload: payload.toString("utf8")
            });
            handlers.forEach((h) => {
                h(topic, payload);
            });
        }
    }
}

function ensureBridgeListener(): void {
    if (bridgeSubscription != null) {
        return;
    }
    const emitter = new NativeEventEmitter(ESPMQTTModule);
    bridgeSubscription = emitter.addListener(
        MQTT_MESSAGE_EVENT,
        (event: { topic?: string; message?: string }) => {
            const t = event.topic;
            if (t == null || event.message == null) {
                return;
            }
            logMqttJson("mqtt.received", { topic: t, message: event.message });
            const payload = Buffer.from(event.message, "utf8");
            dispatchMessage(t, payload);
            for (const hook of mqttMessageHooks) {
                try {
                    hook(t, event.message);
                } catch (error) {
                    console.warn("[ESPMQTTAdapter] mqtt message hook failed:", error);
                }
            }
        }
    );
}

function ensureConnectionBridgeListener(): void {
    if (connectionBridgeSubscription != null) {
        return;
    }
    const emitter = new NativeEventEmitter(ESPMQTTModule);
    connectionBridgeSubscription = emitter.addListener(
        MQTT_CONNECTION_STATUS_EVENT,
        (event: { connected?: boolean }) => {
            const status: MqttConnectionStatus = {
                connected: event?.connected === true,
            };
            console.log(
                `[MQTT_CONN_CB] native mqttConnectionStatus received connected=${status.connected} hooks=${mqttConnectionHooks.size}`
            );
            logMqttJson("mqtt.connectionStatus", status);
            for (const hook of mqttConnectionHooks) {
                try {
                    hook(status);
                } catch (error) {
                    console.warn(
                        "[MQTT_CONN_CB] mqtt connection hook failed:",
                        error
                    );
                }
            }
        }
    );
}

function removeBridgeListenerIfIdle(): void {
    if (topicHandlers.size > 0) {
        return;
    }
    bridgeSubscription?.remove();
    bridgeSubscription = null;
}

function removeConnectionBridgeListenerIfIdle(): void {
    if (mqttConnectionHooks.size > 0) {
        return;
    }
    connectionBridgeSubscription?.remove();
    connectionBridgeSubscription = null;
}

function payloadToString(payload: string | Buffer): string {
    if (typeof payload === "string") {
        return payload;
    }
    return payload.toString("utf8");
}

export const ESPMQTTAdapter: ESPMQTTInterface = {
    connect: async (config: ESPMQTTConfig) => {
        const _config: Record<string, unknown> = {
            accessKeyId: config.accessKey,
            secretAccessKey: config.secretKey,
            sessionToken: config.sessionToken,
            endpoint: config.endpoint,
            clientId: config.clientId
        };
        if (config.region != null && config.region !== "") {
            _config.region = config.region;
        }
        return ESPMQTTModule.connect(_config);
    },
    disconnect: async () => {
        topicHandlers.clear();
        topicOpQueue.clear();
        bridgeSubscription?.remove();
        bridgeSubscription = null;
        return ESPMQTTModule.disconnect();
    },
    isConnected: async () => {
        return ESPMQTTModule.isConnected();
    },
    onConnectionStatusChange: (callback) => addMqttConnectionListener(callback),
    publish: async (topic: string, payload: string | Buffer) => {
        const body = payloadToString(payload);
        logMqttJson("mqtt.publish", { topic, payload: body });
        return ESPMQTTModule.publish(topic, body);
    },
    subscribe: async (
        topic: string,
        handler: (topic: string, payload: Buffer) => void
    ) => {
        const connected = await ESPMQTTModule.isConnected();
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
            await runExclusive(topic, () => ESPMQTTModule.subscribe(topic));
        }
    },
    unsubscribe: async (
        topic: string,
        handler?: (topic: string, payload: Buffer) => void
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

        const connected = await ESPMQTTModule.isConnected();
        if (connected) {
            await runExclusive(topic, () => ESPMQTTModule.unsubscribe(topic));
        }
        removeBridgeListenerIfIdle();
    }
};
