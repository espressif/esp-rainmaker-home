/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */
import { NativeModules } from "react-native";
const { ESPMQTTModule } = NativeModules;

export interface ESPMQTTConfig {
    endpoint: string;
    clientId: string;
    accessKey: string;
    secretKey: string;
    sessionToken: string;
    /** AWS region id (e.g. us-east-1) when the endpoint hostname does not contain `.iot.<region>.` */
    region?: string;
}
/**
 * MQTT Transport interface - abstraction over MQTT client.
 * Used by NodeMQTTOrchestrator for all MQTT operations.
 */
/** Status payload for transport-level MQTT connect/disconnect. */
export type ESPMQTTConnectionStatus = { connected: boolean };

export interface ESPMQTTInterface {
    // Connection
    connect(config: ESPMQTTConfig): Promise<void>;
    disconnect(): Promise<void>;
    isConnected(): Promise<boolean>;

    /**
     * Optional push notification when the native MQTT transport connects or
     * drops. Returns an unsubscribe function. Intentional `disconnect()` /
     * reconnect teardown must not fire `connected: false`.
     */
    onConnectionStatusChange?(
        callback: (status: ESPMQTTConnectionStatus) => void
    ): () => void;

    // Messaging
    publish(topic: string, payload: string | Buffer): Promise<void>;

    // Subscription
    subscribe(
        topic: string,
        handler: (topic: string, payload: Buffer) => void
    ): Promise<void>;

    unsubscribe(
        topic: string,
        handler?: (topic: string, payload: Buffer) => void
    ): Promise<void>;

    // Optional - useful for request-response patterns
    once?(
        topic: string,
        handler: (topic: string, payload: Buffer) => void
    ): Promise<void>;
}

export default ESPMQTTModule as ESPMQTTInterface;
