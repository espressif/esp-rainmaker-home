/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Challenge Response Helper for ESP RainMaker Challenge-Response Flow
 * Uses generated TypeScript from .proto files via protoc-gen-ts
 * Handles only device-to-device communication (challenge-response)
 * Cloud API calls are handled by @espressif/rainmaker-base-cdf SDK
 */

import { ESPDevice } from "@espressif/rainmaker-base-sdk";
import { rmaker_misc } from "../proto-ts/esp_rmaker_chal_resp";
import {
  ESP_CHALLENGE_RESPONSE_CONSTANTS,
  TRANSPORT_BLE,
  BLE,
} from "./constants";
import { uint8ArrayToBase64, base64ToUint8Array } from "./common";
import { DeviceChallengeResponse } from "@/types/global";
import i18n from "../i18n";

export class ChallengeResponseHelper {
  /**
   * Create challenge request using proper protobuf
   * CmdCRPayload.newBuilder().setPayload(ByteString.copyFrom(challengeBytes)).build()
   * RMakerMiscPayload.newBuilder().setMsg(TypeCmdChallengeResponse).setStatus(Success)...
   */
  static createChallengeRequest(challenge: string): Uint8Array {
    const challengeBytes = new TextEncoder().encode(challenge);

    // Use the correct constructor pattern from generated proto
    const cmdPayload = new rmaker_misc.CmdCRPayload({
      payload: challengeBytes,
    });

    const miscPayload = new rmaker_misc.RMakerMiscPayload({
      msg: rmaker_misc.RMakerMiscMsgType.TypeCmdChallengeResponse,
      status: rmaker_misc.RMakerMiscStatus.Success,
      cmdChallengeResponsePayload: cmdPayload,
    });

    // Use the serialize method from the generated class
    return miscPayload.serialize();
  }

  /**
   * Parse device response using proper protobuf
   * RMakerMiscPayload.parseFrom(returnData)
   */
  static parseDeviceResponse(
    responseData: Uint8Array
  ): DeviceChallengeResponse {
    try {
      const response = rmaker_misc.RMakerMiscPayload.deserialize(responseData);

      if (response.status !== rmaker_misc.RMakerMiscStatus.Success) {
        return {
          success: false,
          error: i18n.t("error.challengeResponse.deviceUnsuccessfulStatus"),
        };
      }

      const resp = response.respChallengeResponsePayload;

      if (!resp) {
        return {
          success: false,
          error: i18n.t("error.challengeResponse.missingResponsePayload"),
        };
      }

      if (!resp.payload || !resp.node_id) {
        return {
          success: false,
          error: i18n.t("error.challengeResponse.invalidResponsePayload"),
        };
      }

      return {
        success: true,
        nodeId: resp.node_id,
        signedChallenge: Array.from(resp.payload)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(""),
      };
    } catch (error: any) {
      return {
        success: false,
        error: i18n.t("error.challengeResponse.parseResponseFailed", {
          message: error?.message || String(error),
        }),
      };
    }
  }

  /**
   * Send challenge to device using proper binary protocol
   * This is the ONLY device communication needed - cloud APIs are handled by SDK
   */
  static async sendChallengeToDevice(
    device: ESPDevice,
    challenge: string
  ): Promise<DeviceChallengeResponse> {
    try {
      if (!device) {
        return {
          success: false,
          error: i18n.t("error.challengeResponse.noConnectedDevice"),
        };
      }
      // Create the binary protobuf payload for device communication
      const requestPayload = this.createChallengeRequest(challenge);
      // Convert Uint8Array to Base64 string for transmission
      const base64Payload = uint8ArrayToBase64(requestPayload);
      // Send Base64 encoded data to device using the custom endpoint
      const response = await device.sendData(
        ESP_CHALLENGE_RESPONSE_CONSTANTS.CH_RESP_ENDPOINT,
        base64Payload
      );

      if (!response) {
        return {
          success: false,
          error: i18n.t("error.challengeResponse.noResponseFromDevice"),
        };
      }
      // Convert Base64 response back to Uint8Array for protobuf parsing
      const responseData = base64ToUint8Array(response);

      // Parse the binary protobuf response
      return this.parseDeviceResponse(responseData);
    } catch (error: any) {
      console.error("Error in challenge-response communication:", error);
      return {
        success: false,
        error: i18n.t("error.challengeResponse.communicationError", {
          message: error.message,
        }),
      };
    }
  }

  /**
   * Validate challenge response format
   */
  static validateChallengeResponse(response: DeviceChallengeResponse): boolean {
    if (!response.success || !response.nodeId || !response.signedChallenge) {
      return false;
    }

    // Validate hex characters
    const hexRegex = /^[0-9a-fA-F]+$/;
    if (!hexRegex.test(response.signedChallenge)) {
      return false;
    }

    return true;
  }

  /**
   * Checks if the ESP device supports challenge-response authentication flow.
   *
   * Challenge-response is a security mechanism that:
   * 1. Server sends a challenge to the device
   * 2. Device signs the challenge with its private key
   * 3. Server verifies the signature to authenticate the device
   *
   * This capability is indicated by "ch_resp" in the device's rmaker_extra.cap array
   * and is only supported for BLE transport.
   *
   * @param versionInfo - The version info object from the ESP device
   * @param transportType - The transport type ('BLE' or 'SOFTAP')
   * @returns true if challenge-response is supported, false otherwise
   */
  static checkChallengeResponseCapability(
    versionInfo: { [key: string]: any },
    transportType: string
  ): boolean {
    // Challenge-response is only supported for BLE transport
    const upperTransportType = transportType.toUpperCase();
    if (upperTransportType !== TRANSPORT_BLE && upperTransportType !== BLE) {
      return false;
    }

    try {
      // Check if rmaker_extra exists and has capabilities array
      const rmakerExtra = versionInfo?.rmaker_extra;
      if (!rmakerExtra || typeof rmakerExtra !== "object") {
        return false;
      }

      const extraCapabilities = rmakerExtra.cap;
      if (!Array.isArray(extraCapabilities)) {
        return false;
      }

      // Check if "ch_resp" capability is present
      return extraCapabilities.includes(
        ESP_CHALLENGE_RESPONSE_CONSTANTS.CHALLENGE_RESPONSE_CAPABILITY
      );
    } catch (error) {
      console.error("Error checking challenge-response capability:", error);
      return false;
    }
  }
}
