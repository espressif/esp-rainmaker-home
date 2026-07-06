/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ESPCDFLoginRequestPayload,
  ESPCDFLoginWithOauthRequestPayload,
  ESPCDFSetNewPasswordRequestPayload,
  ESPCDFUser,
  ESPSDKAdaptor,
  ESPSDKAdaptorAPIDataResponse,
  ESPSDKAdaptorAPIRequest,
  ESPSDKAdaptorAPIResponse,
} from "@store";
import {
  ESPRMNGBase,
  ESPRMNGAuth,
  ESPRMNGBaseConfig,
  ESPRMNGMqtt,
  NodeMQTTOrchestrator,
} from "@espressif/rmng-base-sdk";
import { transformToESPCDFUser } from "./transformers/transformToESPCDFUser";
import {
  assertSignupPasswordPolicy,
  mapRMNGLoginCatchError,
} from "@sdk-adaptors/ESPRMNGBase/utils/common";
import { ESPRMNGMatterBaseAdaptorIdentifier } from "./constants";
import { ensureRmngMatterSdkConfigured } from "./ensureMatterSDK";
import { registerRmngMatterNcfgRefreshHooks } from "./registerRmngNcfgRefreshHooks";

export { ESPRMNGMatterBaseAdaptorIdentifier };

/**
 * RMNG + Matter SDK adaptor — structural mirror of {@link ESPRMMatterBaseSDKAdaptor}:
 * own adaptor class in this module, Matter user transform from `./transformers`.
 */
export class ESPRMNGMatterBaseSDKAdaptor implements ESPSDKAdaptor {
  config: ESPRMNGBaseConfig;
  _identifier: string = ESPRMNGMatterBaseAdaptorIdentifier;

  _authInstance!: ESPRMNGAuth;

  constructor(config: ESPRMNGBaseConfig) {
    this.config = config;
    void this.initializeSDK(this.config);
  }

  async initializeSDK(config: ESPRMNGBaseConfig): Promise<ESPSDKAdaptorAPIResponse> {
    ESPRMNGBase.init(config);
    this._authInstance = ESPRMNGBase.getAuthInstance();
    registerRmngMatterNcfgRefreshHooks();
    await ensureRmngMatterSdkConfigured();
    return {
      status: "success",
      description: "RMNG Matter SDK initialized successfully",
    };
  }

  async loginWithOauth(
    _input: ESPSDKAdaptorAPIRequest<ESPCDFLoginWithOauthRequestPayload>,
  ): Promise<ESPSDKAdaptorAPIDataResponse<ESPCDFUser>> {
    throw new Error("RMNGMatter SDK does not support loginWithOauth");
  }

  async loginWithCode(
    _input: ESPSDKAdaptorAPIRequest<ESPCDFLoginWithOauthRequestPayload>,
  ): Promise<ESPSDKAdaptorAPIDataResponse<ESPCDFUser>> {
    throw new Error("RMNGMatter SDK does not support loginWithCode");
  }

  async login(
    input: ESPSDKAdaptorAPIRequest<ESPCDFLoginRequestPayload>,
  ): Promise<ESPSDKAdaptorAPIDataResponse<ESPCDFUser>> {
    const { username, password } = input.request as {
      username: string;
      password: string;
    };
    try {
      const esprmngUser = await this._authInstance.login(username, password);
      if (!esprmngUser) {
        throw new Error("Login failed: No user returned");
      }
      NodeMQTTOrchestrator.initialize(ESPRMNGMqtt.getInstance());
      const cdfUser = transformToESPCDFUser(esprmngUser);
      cdfUser.identifier = ESPRMNGMatterBaseAdaptorIdentifier;
      console.log("[ESPRMNGMatterBaseSDKAdaptor] User logged in");
      return {
        status: "success",
        description: "Login successful",
        data: cdfUser,
      };
    } catch (error) {
      console.error("[ESPRMNGMatterBaseSDKAdaptor] login RAW SDK error:", error);
      const mapped = mapRMNGLoginCatchError(error);
      if (mapped) throw mapped;
      throw error;
    }
  }

  async getCurrentLoggedInUser(): Promise<ESPSDKAdaptorAPIDataResponse<ESPCDFUser>> {
    try {
      const esprmngUser = await this._authInstance.getLoggedInUser();
      if (!esprmngUser) {
        throw new Error("No logged in user found");
      }
      NodeMQTTOrchestrator.initialize(ESPRMNGMqtt.getInstance());
      const cdfUser = transformToESPCDFUser(esprmngUser);
      cdfUser.identifier = ESPRMNGMatterBaseAdaptorIdentifier;
      return {
        status: "success",
        description: "Current logged in user fetched successfully",
        data: cdfUser,
      };
    } catch (error) {
      console.error(
        "[ESPRMNGMatterBaseSDKAdaptor] getCurrentLoggedInUser RAW SDK error:",
        error,
      );
      throw error;
    }
  }

  async getSignUpCode(input: ESPSDKAdaptorAPIRequest): Promise<ESPSDKAdaptorAPIResponse> {
    const { username, password } = input.request as {
      username: string;
      password: string;
    };
    assertSignupPasswordPolicy(password);
    await this._authInstance.sendSignUpCode(username, password);
    return {
      status: "success",
      description: "Signup code sent successfully",
    };
  }

  async confirmSignUp(input: ESPSDKAdaptorAPIRequest): Promise<ESPSDKAdaptorAPIResponse> {
    const { username, verificationCode } = input.request as {
      username: string;
      verificationCode: string;
    };
    const response = await this._authInstance.confirmSignUp(username, verificationCode);
    return {
      status: "success",
      description: response.message || "Signup confirmation successful",
    };
  }

  async forgotPassword(input: ESPSDKAdaptorAPIRequest): Promise<ESPSDKAdaptorAPIResponse> {
    const { username } = input.request as { username: string };
    const response = await this._authInstance.forgotPassword(username);
    return {
      status: "success",
      description: `Verification code sent to ${response.codeDeliveryDestination || "your email"}`,
    };
  }

  async setNewPassword(
    input: ESPSDKAdaptorAPIRequest<ESPCDFSetNewPasswordRequestPayload>,
  ): Promise<ESPSDKAdaptorAPIResponse> {
    const { username, newPassword, verificationCode } = input.request!;
    const response = await this._authInstance.setNewPassword(
      username,
      newPassword,
      verificationCode,
    );
    return {
      status: "success",
      description: response.message || "New password set successfully",
    };
  }
}

/* eslint-disable import/export -- Intentional aggregation barrel: ./transformers, ./utils and ./bridge legitimately re-export overlapping symbols. */
export { ensureRmngMatterSdkConfigured } from "./ensureMatterSDK";
export { registerRmngMatterLocalDiscoveryHooks } from "./registerRmngMatterLocalDiscoveryHooks";
export { collectRmngNodesForGroup } from "./collectRmngGroupNodes";
export * from "./groupSync";
export * from "./transformers";
export * from "./utils";
export * from "./bridge";
