/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFProvisioningDevice, ESPCDFProvisioningDeviceInterface, ESPCDFProvisioningDeviceOperations, } from "@store";
import { ESPDevice, ChallengeResponseHelper, ClaimCapabilities } from "@espressif/rainmaker-base-sdk";

/**
 * Transforms ESPDevice from the RainMaker SDK to ESPCDFProvisioningDevice format.
 *
 * This utility converts the SDK device object to the CDF provisioning device format with:
 * - Device properties (name, transport, security, etc.)
 * - Operations wrapper that delegates to ESPDevice methods
 * - Raw reference to the original ESPDevice
 * @param espDevice - The ESPDevice instance from the SDK
 * @returns ESPCDFProvisioningDevice instance with all required operations
 */
export function transformToESPCDFProvisioningDevice(
    espDevice: ESPDevice
): ESPCDFProvisioningDevice {
    if (!espDevice) {
        throw new Error("ESPDevice is required for transformation");
    }

    // Create operations object that wraps ESPDevice methods
    const operations: ESPCDFProvisioningDeviceOperations = {
        async connect(): Promise<boolean> {
            const response = await espDevice.connect();
            return response === 0;
        },

        async disconnect(): Promise<void> {
            await espDevice.disconnect();
        },

        async getDeviceCapabilities(): Promise<string[]> {
            return await espDevice.getDeviceCapabilities();
        },

        async getDeviceVersionInfo(): Promise<Record<string, any>> {
            return await espDevice.getDeviceVersionInfo();
        },

        async setProofOfPossession(pop: string): Promise<boolean> {
            return await espDevice.setProofOfPossession(pop);
        },

        async initializeSession(): Promise<boolean> {
            return await espDevice.initializeSession();
        },

        async scanWifiList(): Promise<any[]> {
            return await espDevice.scanWifiList();
        },

        async provision(
            ssid: string,
            password: string,
            onProgress?: (response: any) => void,
            homeId?: string,
            provisionType?: string
        ): Promise<void> {
            await espDevice.provision(
                ssid,
                password,
                onProgress ?? (() => {}),
                homeId,
                provisionType);
        },

        async initiateUserNodeMapping(params?: Record<string, any>): Promise<any> {
            return await espDevice.initiateUserNodeMapping(params || {});
        },

        async verifyUserNodeMapping(params: any): Promise<any> {
            return await espDevice.verifyUserNodeMapping(params);
        },

        async setNetworkCredentials(ssid: string, password: string): Promise<number> {
            return await espDevice.setNetworkCredentials(ssid, password);
        },

        async sendData(endPoint: string, data: string): Promise<string> {
            return await espDevice.sendData(endPoint, data);
        },

        async startAssistedClaiming(onProgress?: (response: any) => void, claimCapability?: string): Promise<void> {
            await espDevice.startAssistedClaiming(onProgress, claimCapability as ClaimCapabilities);
        },

        async checkChallengeResponseSupport(): Promise<boolean> {
            const versionInfo = await espDevice.getDeviceVersionInfo();
            const isChallengeResponseSupported = ChallengeResponseHelper.checkChallengeResponseCapability(
                versionInfo,
            );
            return isChallengeResponseSupported;
        },

        async resetWifiStatus(): Promise<boolean> {
            return await espDevice.resetWifiStatus();
        },

        async retryNetworkCredentials(
            ssid: string,
            password: string,
            onProgress?: (response: any) => void
        ): Promise<void> {
            await espDevice.retryNetworkCredentials(
                ssid,
                password,
                onProgress ?? (() => {})
            );
        },
    };

    // Create device interface
    const deviceData: ESPCDFProvisioningDeviceInterface = {
        name: espDevice.name,
        transport: espDevice.transport,
        security: espDevice.security,
        connected: espDevice.connected,
        username: espDevice.username,
        versionInfo: espDevice.versionInfo,
        capabilities: espDevice.capabilities,
        advertisementData: (espDevice as any).advertisementData,
        operations: operations,
        _raw: espDevice,
    };

    // Create ESPCDFProvisioningDevice instance
    return new ESPCDFProvisioningDevice(deviceData);
}
