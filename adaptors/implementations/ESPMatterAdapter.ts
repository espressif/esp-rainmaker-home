/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { NativeEventEmitter } from "react-native";
import ESPMatterModule from "../interfaces/ESPMatterInterface";
import {
  ESPMatterAdapterInterface,
  ESPRMConfirmRequestEventData,
  ESPRMCSRGenerationResult,
  ESPRMFabric,
  ESPRMGenerateCSRRequest,
  ESPRMNativeDataPayload,
  ESPRMNoCRequestEventData,
} from "@espressif/rainmaker-matter-sdk";

/**
 * ESP Matter Adapter Implementation
 *
 * This adapter implements the ESPMatterAdapterInterface to provide
 * Matter device commissioning capabilities. It bridges the React Native layer
 * with the native Android/iOS Matter commissioning modules.
 */
export const matterAdapter: ESPMatterAdapterInterface = {
  /**
   * Generate Certificate Signing Request using native secure storage
   * This method coordinates with native platform (Android KeyStore / iOS Keychain)
   * to generate CSR for Matter certificates
   *
   * @param params - Parameters for CSR generation
   * @param params.groupId - Group ID for the fabric
   * @param params.fabricId - Fabric ID for the CSR
   * @param params.name - Fabric name
   * @returns Promise<ESPRMCSRGenerationResult> - CSR generation result
   */
  async generateCSR(
    fabricInfo: ESPRMGenerateCSRRequest
  ): Promise<ESPRMCSRGenerationResult> {
    const nativeGenerateCSR =
      ESPMatterModule?.generateCSR ?? (ESPMatterModule as any)?.generateUserNOC;

    if (!nativeGenerateCSR) {
      throw new Error("Native module method generateCSR not available");
    }

    try {
      const csrResult = await nativeGenerateCSR.call(ESPMatterModule, {
        groupId: fabricInfo.groupId,
        fabricId: fabricInfo.fabricId,
        name: fabricInfo.name,
      });

      return {
        csr: csrResult.csr,
        requestBody: csrResult.requestBody,
        metadata: csrResult.metadata,
      };
    } catch (error) {
      console.error("[MatterAdapter] CSR generation failed:", error);
      throw error;
    }
  },

  /**
   * Start Matter device commissioning with event-based communication
   * This method starts the native commissioning process and sets up event listeners
   * for bidirectional communication between SDK and native platform
   *
   * @param onboardingPayload - Onboarding payload data
   * @param fabric - Prepared fabric object
   * @param onEvent - Callback function to handle events from native (NODE_NOC_REQUEST, commissioning_confirmation_request, etc.)
   * @returns Promise<() => void> - Cleanup function to remove event listeners
   */
  async startEcosystemCommissioning(
    onboardingPayload: string,
    fabric: ESPRMFabric,
    onEvent: (
      eventType: string,
      data: ESPRMNoCRequestEventData | ESPRMConfirmRequestEventData
    ) => void
  ): Promise<() => void> {
    if (!onboardingPayload || onboardingPayload.trim() === "") {
      throw new Error("Onboarding payload is required for commissioning");
    }

    if (!ESPMatterModule?.startEcosystemCommissioning) {
      throw new Error(
        "Native module method startEcosystemCommissioning not available"
      );
    }

    if (!fabric?.fabricId) {
      throw new Error("Fabric fabricId is required for commissioning");
    }

    let eventListener: any = null;

    try {
      const eventEmitter = new NativeEventEmitter(ESPMatterModule as any);

        eventListener = eventEmitter.addListener(
          "MatterCommissioningEvent",
          (event: any) => {
            let standardizedEvent: any;
            switch (event.eventType) {
              case "NODE_NOC_REQUEST":
                let nocRequestData: any = {};

                if (typeof event.requestBody === "string") {
                  try {
                    nocRequestData = JSON.parse(event.requestBody);
                  } catch (e) {
                    nocRequestData = {};
                  }
                } else if (
                  event.requestBody &&
                  typeof event.requestBody === "object"
                ) {
                  nocRequestData = event.requestBody;
                }

                standardizedEvent = {
                  eventType: "NODE_NOC_REQUEST",
                  requestData: {
                    csr: nocRequestData.csr ?? event.csr ?? "",
                    deviceId: nocRequestData.deviceId ?? event.deviceId ?? "",
                    groupId: nocRequestData.groupId ?? event.groupId ?? "",
                    fabricId: nocRequestData.fabricId ?? event.fabricId ?? "",
                  },
                };
                break;

              case "COMMISSIONING_CONFIRMATION_REQUEST":
                const confirmData =
                  event.requestBody || event.requestData || event;
                const requestData: any = {
                  rainmakerNodeId: confirmData.rainmakerNodeId ?? "",
                  matterNodeId: confirmData.matterNodeId ?? "",
                  challengeResponse: confirmData.challengeResponse ?? "",
                  deviceId: confirmData.deviceId ?? "",
                  requestId: confirmData.requestId ?? "",
                  challenge:
                    confirmData.challenge ??
                    confirmData.challengeResponse ??
                    "",
                };

                if (confirmData.metadata) {
                  requestData.metadata = confirmData.metadata;
                }

                standardizedEvent = {
                  eventType: "COMMISSIONING_CONFIRMATION_REQUEST",
                  requestData,
                };
                break;

              case "COMMISSIONING_CONFIRMATION_RESPONSE":
                return;

              case "COMMISSIONING_COMPLETE":
                return;

              default:
                standardizedEvent = event;
                break;
            }

            if (standardizedEvent) {
              onEvent(standardizedEvent.eventType, standardizedEvent);
            }
          }
        );

      await ESPMatterModule.startEcosystemCommissioning(
        onboardingPayload,
        fabric
      );

      return () => {
        if (eventListener) {
          eventListener.remove();
          eventListener = null;
        }
      };
    } catch (error) {
      console.error(
        "[MatterAdapter] Failed to start ecosystem commissioning:",
        error
      );

      if (eventListener) {
        eventListener.remove();
        eventListener = null;
      }

      throw error;
    }
  },

  /**
   * Send typed data to native platform
   * This unified method routes different types of data to appropriate native methods
   * based on the data type (NOC_RESPONSE, COMMISSIONING_CONFIRMATION_RESPONSE, ISSUE_NODE_NOC_RESPONSE, etc.)
   *
   * @param payload - Typed payload with data type and content
   * @returns Promise<any> - Response from native platform
   */
  async postMessage(payload: ESPRMNativeDataPayload): Promise<any> {
    if (!ESPMatterModule?.postMessage) {
      throw new Error("Native module method postMessage not available");
    }

    try {
      return await ESPMatterModule.postMessage(payload);
    } catch (error) {
      console.error("[MatterAdapter] Failed to send data to native:", error);
      throw error;
    }
  },
};

export default matterAdapter;