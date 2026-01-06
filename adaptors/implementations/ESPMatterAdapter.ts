/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { NativeEventEmitter, Platform } from "react-native";
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
import {
  MATTER_COMMISSIONING_EVENT,
  MATTER_EVENT_NODE_NOC_REQUEST,
  MATTER_EVENT_COMMISSIONING_CONFIRMATION_REQUEST,
  MATTER_EVENT_COMMISSIONING_CONFIRMATION_RESPONSE,
  MATTER_EVENT_COMMISSIONING_COMPLETE,
  MATTER_EVENT_COMMISSIONING_ERROR,
  HEADLESS_HANDLED_TYPES,
} from "@/utils/constants";

/**
 * Matter Adapter: Bridge between React Native and native Matter commissioning.
 *
 * Platform behavior:
 * - Android: HeadlessJS tasks handle API calls in background
 * - iOS: SDK makes API calls directly via event handlers
 */
export const matterAdapter: ESPMatterAdapterInterface = {
  /**
   * Generates CSR for fabric certificate using native secure storage.
   * @param fabricInfo - Fabric info containing groupId, fabricId, and name
   * @returns CSR generation result with csr, requestBody, and metadata
   */
  async generateCSR(
    fabricInfo: ESPRMGenerateCSRRequest
  ): Promise<ESPRMCSRGenerationResult> {
    const nativeGenerateCSR =
      ESPMatterModule?.generateCSR ?? (ESPMatterModule as any)?.generateUserNOC;

    if (!nativeGenerateCSR) {
      throw new Error("Native module method generateCSR not available");
    }

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
  },

  /**
   * Initiates Matter commissioning and listens for native events.
   * @param onboardingPayload - QR code payload from the device
   * @param fabric - Fabric to commission the device to
   * @param onEvent - Callback for commissioning events (iOS only)
   * @returns Cleanup function to remove event listeners
   */
  async startEcosystemCommissioning(
    onboardingPayload: string,
    fabric: ESPRMFabric,
    onEvent: (
      eventType: string,
      data: ESPRMNoCRequestEventData | ESPRMConfirmRequestEventData
    ) => void
  ): Promise<() => void> {
    if (!onboardingPayload?.trim()) {
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

    const isIOS = Platform.OS === "ios";
    let eventListener: any = null;

    const eventEmitter = new NativeEventEmitter(ESPMatterModule as any);

    eventListener = eventEmitter.addListener(
      MATTER_COMMISSIONING_EVENT,
      (event: any) => {
        let normalizedEvent: any;

        switch (event.eventType) {
          case MATTER_EVENT_NODE_NOC_REQUEST:
            // Android: HeadlessJS handles; iOS: forward to SDK
            if (!isIOS) return;

            let nocRequestData: any = {};
            if (typeof event.requestBody === "string") {
              try {
                nocRequestData = JSON.parse(event.requestBody);
              } catch {
                nocRequestData = {};
              }
            } else if (event.requestBody && typeof event.requestBody === "object") {
              nocRequestData = event.requestBody;
            }

            normalizedEvent = {
              eventType: MATTER_EVENT_NODE_NOC_REQUEST,
              requestData: {
                csr: nocRequestData.csr ?? event.csr ?? "",
                deviceId: nocRequestData.deviceId ?? event.deviceId ?? "",
                groupId: nocRequestData.groupId ?? event.groupId ?? "",
                fabricId: nocRequestData.fabricId ?? event.fabricId ?? "",
              },
            };
            break;

          case MATTER_EVENT_COMMISSIONING_CONFIRMATION_REQUEST:
            // Android: HeadlessJS handles; iOS: forward to SDK
            if (!isIOS) return;

            const confirmData = event.requestBody || event.requestData || event;
            normalizedEvent = {
              eventType: MATTER_EVENT_COMMISSIONING_CONFIRMATION_REQUEST,
              requestData: {
                rainmakerNodeId: confirmData.rainmakerNodeId ?? "",
                matterNodeId: confirmData.matterNodeId ?? "",
                challengeResponse: confirmData.challengeResponse ?? "",
                deviceId: confirmData.deviceId ?? "",
                requestId: confirmData.requestId ?? "",
                challenge: confirmData.challenge ?? confirmData.challengeResponse ?? "",
                ...(confirmData.metadata && { metadata: confirmData.metadata }),
              },
            };
            break;

          case MATTER_EVENT_COMMISSIONING_CONFIRMATION_RESPONSE:
          case MATTER_EVENT_COMMISSIONING_COMPLETE:
          case MATTER_EVENT_COMMISSIONING_ERROR:
            // UI handles these directly
            return;

          default:
            normalizedEvent = event;
            break;
        }

        if (normalizedEvent) {
          onEvent(normalizedEvent.eventType, normalizedEvent);
        }
      }
    );

    await (ESPMatterModule as any).startEcosystemCommissioning(
      onboardingPayload,
      fabric
    );

    return () => {
      eventListener?.remove();
      eventListener = null;
    };
  },

  /**
   * Sends payload to native platform.
   * @param payload - Data payload with type and data to send
   * @returns Native response (Android skips HeadlessJS-handled types)
   */
  async postMessage(payload: ESPRMNativeDataPayload): Promise<any> {
    const isIOS = Platform.OS === "ios";

    // Android: HeadlessJS handles these; iOS: SDK handles
    if (!isIOS && HEADLESS_HANDLED_TYPES.includes(payload.type)) {
      return;
    }

    if (!ESPMatterModule?.postMessage) {
      throw new Error("Native module method postMessage not available");
    }

    return ESPMatterModule.postMessage(payload);
  },
};

export default matterAdapter;