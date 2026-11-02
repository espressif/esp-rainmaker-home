/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { NativeEventEmitter, Platform } from "react-native";
import ESPMatterModule from "../interfaces/ESPMatterInterface";
import {
  ESPMatterCommissioningAdapterInterface,
  ESPMatterFabricRef,
  ESPMatterConfirmRequestEventData,
  ESPMatterCSRGenerationResult,
  ESPMatterGenerateCSRRequest,
  ESPMatterNativeDataPayload,
  ESPMatterNoCRequestEventData,
} from "../contracts/matter";
import {
  MATTER_COMMISSIONING_EVENT,
  MATTER_EVENT_NODE_NOC_REQUEST,
  MATTER_EVENT_COMMISSIONING_CONFIRMATION_REQUEST,
  MATTER_EVENT_COMMISSIONING_CONFIRMATION_RESPONSE,
  MATTER_EVENT_COMMISSIONING_COMPLETE,
  MATTER_EVENT_COMMISSIONING_ERROR,
  MATTER_EVENT_RMNEO_ATTESTATION_CHALLENGE,
  MATTER_EVENT_RMNEO_MATTER_ATTESTATION_DATA,
  HEADLESS_HANDLED_TYPES,
} from "@shared/utils/constants";

/**
 * Matter Adapter: Bridge between React Native and native Matter commissioning.
 *
 * Platform behavior:
 * - Android: HeadlessJS tasks handle API calls in background
 * - iOS: SDK makes API calls directly via event handlers
 */
/**
 * Fabric ids whose NEXT CSR generation must regenerate the keypair even though
 * a NOC chain already sits in the KeyStore (Android short-circuits otherwise).
 *
 * Used by the CAT-rotation stale-NOC re-issue: the SDK owns the `generateCSR`
 * call, so the app marks the fabric here right before `issueUserNoC` and the
 * adapter consumes the marker on the next call (one-shot).
 */
const forceFreshCsrFabricIds = new Set<string>();

/**
 * Marks the fabric so its next `generateCSR` regenerates the keypair despite a
 * stored NOC chain. Call only from a flow that immediately re-issues and
 * re-stores the NOC (key + NOC must always be rebound together).
 * @param fabricId - Fabric whose next CSR must use a fresh keypair.
 */
export function markForceFreshCsrForFabric(fabricId: string): void {
  if (fabricId) {
    forceFreshCsrFabricIds.add(fabricId);
  }
}

export const matterCommissioningAdaptor: ESPMatterCommissioningAdapterInterface = {
  /**
   * Generates CSR for fabric certificate using native secure storage.
   * @param fabricInfo - Fabric info containing groupId, fabricId, and name
   * @returns CSR generation result with csr, requestBody, and metadata
   */
  async generateCSR(
    fabricInfo: ESPMatterGenerateCSRRequest
  ): Promise<ESPMatterCSRGenerationResult> {
    const nativeGenerateCSR =
      ESPMatterModule?.generateCSR ?? (ESPMatterModule as any)?.generateUserNOC;

    if (!nativeGenerateCSR) {
      throw new Error("Native module method generateCSR not available");
    }

    // One-shot: consume the CAT-rotation force-fresh marker for this fabric.
    const forceNewKey = fabricInfo.fabricId
      ? forceFreshCsrFabricIds.delete(fabricInfo.fabricId)
      : false;
    // iOS native rejects a missing `name`; the RMNeo SDK forwards the group
    // name verbatim, which can be absent on freshly converted fabrics.
    const csrResult = await nativeGenerateCSR.call(ESPMatterModule, {
      groupId: fabricInfo.groupId,
      fabricId: fabricInfo.fabricId,
      name: fabricInfo.name || "Matter",
      // Android skips its "NOC already stored" short-circuit when set; iOS
      // always generates and ignores the extra key.
      forceNewKey,
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
    fabric: ESPMatterFabricRef,
    onEvent: (
      eventType: string,
      data: ESPMatterNoCRequestEventData | ESPMatterConfirmRequestEventData
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
    let isRmneoSession = false;

    const eventEmitter = new NativeEventEmitter(ESPMatterModule as any);

    eventListener = eventEmitter.addListener(
      MATTER_COMMISSIONING_EVENT,
      (event: any) => {
        // On Android most of these are owned by HeadlessJS and return early from
        // the isIOS guards below; iOS is what actually forwards to `onEvent`.
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

          case MATTER_EVENT_RMNEO_ATTESTATION_CHALLENGE: {
            if (!isIOS) return;
            isRmneoSession = true;

            const challengeBody =
              event.requestBody && typeof event.requestBody === "object"
                ? event.requestBody
                : event;
            normalizedEvent = {
              eventType: MATTER_EVENT_RMNEO_ATTESTATION_CHALLENGE,
              requestData: {
                attestationChallenge: challengeBody.attestationChallenge ?? "",
              },
            };
            break;
          }

          case MATTER_EVENT_RMNEO_MATTER_ATTESTATION_DATA: {
            if (!isIOS) return;
            isRmneoSession = true;

            const attestationBody =
              event.requestBody && typeof event.requestBody === "object"
                ? event.requestBody
                : event;
            normalizedEvent = {
              eventType: MATTER_EVENT_RMNEO_MATTER_ATTESTATION_DATA,
              requestData: {
                requestId: attestationBody.requestId ?? "",
                nocsrElements: attestationBody.nocsrElements ?? "",
                attestationSignature: attestationBody.attestationSignature ?? "",
                ...(attestationBody.attestationChallenge
                  ? { attestationChallenge: attestationBody.attestationChallenge }
                  : {}),
              },
            };
            break;
          }

          case MATTER_EVENT_COMMISSIONING_COMPLETE: {
            if (!isIOS || !isRmneoSession) return;

            const completeBody =
              event.requestBody && typeof event.requestBody === "object"
                ? event.requestBody
                : event;

            // iOS also emits COMMISSIONING_COMPLETE with `success:false` on
            // native failures; the SDK's complete handler would still run the
            // cloud confirm, so only successful completions cross into it.
            if (completeBody.success === false) return;

            normalizedEvent = {
              eventType: MATTER_EVENT_COMMISSIONING_COMPLETE,
              requestData: completeBody,
            };
            break;
          }

          case MATTER_EVENT_COMMISSIONING_CONFIRMATION_RESPONSE:
          case MATTER_EVENT_COMMISSIONING_ERROR:
          default:
            return;
        }

        if (normalizedEvent) {
          onEvent(normalizedEvent.eventType, normalizedEvent);
        }
      }
    );

    // The listener is live from here, so a failed handoff has to take it down —
    // the caller never receives the teardown below when this throws.
    try {
      await (ESPMatterModule as any).startEcosystemCommissioning(
        onboardingPayload,
        fabric
      );
    } catch (error) {
      eventListener?.remove();
      eventListener = null;
      throw error;
    }

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
  async postMessage(payload: ESPMatterNativeDataPayload): Promise<any> {
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

  /**
   * Ends the native commissioning session, if any. A native build without the
   * method (Android, whose next start never waits on an old one) does nothing.
   */
  async cancelCommissioning(): Promise<void> {
    if (typeof ESPMatterModule?.cancelCommissioning !== "function") {
      return;
    }
    try {
      await ESPMatterModule.cancelCommissioning();
    } catch (error) {
      console.warn("[ESPMatterAdapter] cancelCommissioning failed:", error);
    }
  },
};

export default matterCommissioningAdaptor;