/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ESPCDFChallengeResponseVerificationRequest,
    ESPCDFProvisioningDevice,
    ESPCDFProvisioningDeviceInterface,
    ESPCDFProvisioningDeviceOperations,
} from "@store";
import { ChallengeResponseHelper } from "@espressif/rainmaker-base-sdk";
import { ESPDevice } from "@espressif/rmng-base-sdk";

/** Device descriptor returned by provision adapter (searchESPDevices / createESPDevice). */
export interface AdapterDeviceDescriptor {
    name: string;
    transport?: string;
    security?: number;
    connected?: boolean;
    username?: string;
    versionInfo?: Record<string, any>;
    capabilities?: string[];
    advertisementData?: { [key: string]: any }[];
    [key: string]: any;
}

/**
 * Builds ESPCDFProvisioningDevice from a descriptor returned by the provision adapter.
 * All operations delegate to provisionAdapter (shared adapter for both RM and RMNG).
 * Use this for devices returned by user.searchESPDevices / searchESPBLEDevices / createProvisioningDevice when using RMNG.
 */
export function createCDFProvisioningDeviceFromAdapterDescriptor(
    device: ESPDevice
): ESPCDFProvisioningDevice {
    const operations: ESPCDFProvisioningDeviceOperations = {
        async connect(): Promise<boolean> {
            const response = await device.connect();
            return response === 0;
        },
        async disconnect(): Promise<void> {
            await device.disconnect();
        },
        async getDeviceCapabilities(): Promise<string[]> {
            return device.getDeviceCapabilities();
        },
        async getDeviceVersionInfo(): Promise<Record<string, any>> {
            return device.getDeviceVersion();
        },
        async setProofOfPossession(pop: string): Promise<boolean> {
            return device.setProofOfPossession(pop);
        },
        async initializeSession(): Promise<boolean> {
            return device.initializeSession();
        },
        async scanWifiList(): Promise<any[]> {
            return device.scanWifiList();
        },
        async provision(
            ssid: string,
            password: string,
            onProgress?: (response: any) => void,
            groupId?: string,
            provisionType?: string,
            options?: Record<string, any>
        ): Promise<void> {
            const LOG = "[RMNG-provision]";

            // Check if device supports challenge-response
            let supportsChalResp = false;
            try {
                const versionInfo = await device.getDeviceVersion();
                const extraCap = versionInfo?.rmaker_extra?.cap;
                supportsChalResp = Array.isArray(extraCap) && extraCap.includes("ch_resp");
            } catch {
                console.warn(`${LOG} Could not fetch versionInfo, skipping ch_resp`);
            }

            if (supportsChalResp && groupId) {
                console.log(`${LOG} Running challenge-response flow for group=${groupId}`);
            }
            const progress = onProgress ?? (() => {});
            const gid = groupId ?? "";
            await device.provision(ssid, password, progress, gid, provisionType, options);
            console.log(`${LOG} WiFi provision OK`);
        },
        async initiateUserNodeMapping(_params?: Record<string, any>): Promise<any> {
            throw new Error(
                "RMNG adapter-created device does not support initiateUserNodeMapping; use group.initiateNodeAssociation for claiming."
            );
        },
        async verifyUserNodeMapping(_params: any): Promise<any> {
            throw new Error(
                "RMNG adapter-created device does not support verifyUserNodeMapping; use group.verifyNodeAssociation for claiming."
            );
        },
        async setNetworkCredentials(_ssid: string, _password: string): Promise<number> {
            throw new Error("RMNG adapter-created device does not support setNetworkCredentials.");
        },
        async sendData(endPoint: string, data: string): Promise<string> {
            return device.sendData(endPoint, data);
        },
        async startAssistedClaiming(_onProgress?: (response: any) => void, _claimCapability?: string): Promise<void> {
            throw new Error("RMNG adapter-created device does not support startAssistedClaiming.");
        },
        async checkChallengeResponseSupport(): Promise<boolean> {
            const versionInfo = await device.getDeviceVersion();
            return ChallengeResponseHelper.checkChallengeResponseCapability(versionInfo);
        },
    };

    const deviceData: ESPCDFProvisioningDeviceInterface = {
        name: device.name,
        transport: device.transport ?? "ble",
        security: device.security ?? 2,
        connected: false,
        username: "",
        versionInfo: {} as any,
        capabilities: [] as any,
        advertisementData: (device as AdapterDeviceDescriptor).advertisementData ?? ([] as any),
        operations,
        _raw: device,
    };

    return new ESPCDFProvisioningDevice(deviceData);
}

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
            return await espDevice.getDeviceVersion();
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
            homeId?: string
        ): Promise<void> {
            await espDevice.provision(
                ssid,
                password,
                onProgress ?? (() => {}),
                homeId ?? ""
            );
        },

        async initiateUserNodeMapping(params?: Record<string, any>): Promise<any> {
            const groupId = String(
                params?.groupId ?? params?.group_id ?? ""
            );
            return await espDevice.initiateUserNodeMapping(groupId, params);
        },

        async verifyUserNodeMapping(
            params: ESPCDFChallengeResponseVerificationRequest
        ): Promise<any> {
            const groupId = String(params.group_id ?? "");
            return await espDevice.verifyUserNodeMapping(
                groupId,
                params.request_id,
                params
            );
        },

        async setNetworkCredentials(ssid: string, password: string): Promise<number> {
            return await espDevice.setNetworkCredentials(ssid, password);
        },

        async sendData(endPoint: string, data: string): Promise<string> {
            return await espDevice.sendData(endPoint, data);
        },

        async startAssistedClaiming(onProgress?: (response: any) => void): Promise<void> {
            await espDevice.startAssistedClaiming(onProgress);
        },
        async checkChallengeResponseSupport(): Promise<boolean> {
            const versionInfo = await espDevice.getDeviceVersion();
            return ChallengeResponseHelper.checkChallengeResponseCapability(versionInfo);
        },
    };

    const descriptor = espDevice as unknown as AdapterDeviceDescriptor;

    // Create device interface
    const deviceData: ESPCDFProvisioningDeviceInterface = {
        name: espDevice.name,
        transport: espDevice.transport,
        security: espDevice.security,
        connected: descriptor.connected ?? false,
        username: descriptor.username ?? "",
        versionInfo: (descriptor.versionInfo as { [key: string]: any }[] | undefined) ?? [],
        capabilities: descriptor.capabilities ?? [],
        advertisementData: descriptor.advertisementData ?? [],
        operations: operations,
        _raw: espDevice,
    };

    // Create ESPCDFProvisioningDevice instance
    return new ESPCDFProvisioningDevice(deviceData);
}
