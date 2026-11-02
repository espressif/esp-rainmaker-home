/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ESPCDFLoginRequestPayload,
    ESPCDFLoginWithOauthRequestPayload,
    ESPCDFSetNewPasswordRequestPayload,
    ESPSDKAdaptor,
    ESPSDKAdaptorAPIDataResponse,
    ESPSDKAdaptorAPIRequest,
    ESPSDKAdaptorAPIResponse
} from "@store";
import { ESPRMBase, ESPRMAuth, ESPRMBaseConfig, ESPTransportMode } from "@espressif/rainmaker-base-sdk";
import { ESPCDFConfirmSignUpRequestPayload, ESPCDFGetSignUpCodeRequestPayload, ESPCDFUser } from "@store";
import { ESPCDFForgotPasswordRequestPayload } from "@store";
// import { getGroups } from "./groups/getGroups";
import { transformToESPCDFUser } from "./transformers";
import { ESPRMBaseAdaptorIdentifier } from "./constants";

export { ESPRMBaseAdaptorIdentifier };

export class ESPRMBaseSDKAdaptor implements ESPSDKAdaptor {
    config: ESPRMBaseConfig;
    _identifier: string = ESPRMBaseAdaptorIdentifier;

    _authInstance!: ESPRMAuth;

    constructor(config: ESPRMBaseConfig) {
        this.config = config;
    }

    /**
     * Configures the underlying SDK and caches its auth instance.
     *
     * Called by the bootstrap on the adaptor it makes active, never from the
     * constructor: every adaptor is built on every start, and configuring one
     * that is not active reaches shared state the live stack is using.
     * @returns CDF response indicating successful initialization.
     */
    async initializeSDK(): Promise<ESPSDKAdaptorAPIResponse> {
        ESPRMBase.setTransportOrder([
            ESPTransportMode.local,
            ESPTransportMode.cloud,
        ]);
        ESPRMBase.configure(this.config);
        this._authInstance = ESPRMBase.getAuthInstance();
        return {
            status: "success",
            description: "SDK initialized successfully",
        };
    }

    async loginWithOauth(input: ESPSDKAdaptorAPIRequest<ESPCDFLoginWithOauthRequestPayload>): Promise<ESPSDKAdaptorAPIDataResponse<ESPCDFUser>> {
        const provider = input.request as unknown as { identityProvider: string };
        const esprmUser = await this._authInstance.loginWithOauth(provider.identityProvider);
        const cdfUser = transformToESPCDFUser(esprmUser);
        return {
            status: "success",
            data: cdfUser,
        };
    }

    async login(input: ESPSDKAdaptorAPIRequest<ESPCDFLoginRequestPayload>): Promise<ESPSDKAdaptorAPIDataResponse<ESPCDFUser>> {
        const { username, password } = input.request as { username: string, password: string };
        const esprmUser = await this._authInstance.login(
            username,
            password,
        );
        if (!esprmUser) {
            throw new Error("Login failed: No user returned");
        }
        const cdfUser = transformToESPCDFUser(esprmUser);
        return {
            status: "success",
            description: "Login successful",
            data: cdfUser,
        };
    }

    async getCurrentLoggedInUser(): Promise<ESPSDKAdaptorAPIDataResponse<ESPCDFUser>> {
        const esprmUser = await this._authInstance.getLoggedInUser();
        if (!esprmUser) {
            throw new Error("No logged in user found");
        }
        const cdfUser = transformToESPCDFUser(esprmUser);
        return {
            status: "success",
            description: "Current logged in user fetched successfully",
            data: cdfUser,
        };
    }

    async getSignUpCode(input: ESPSDKAdaptorAPIRequest<ESPCDFGetSignUpCodeRequestPayload>): Promise<ESPSDKAdaptorAPIResponse> {
        const { username, password } = input.request as { username: string, password: string };
        const response = await this._authInstance.sendSignUpCode(username, password);
        return {
            status: "success",
            description: response?.description || "Signup code fetched successfully",
        };
    }

    async confirmSignUp(input: ESPSDKAdaptorAPIRequest<ESPCDFConfirmSignUpRequestPayload>): Promise<ESPSDKAdaptorAPIResponse> {
        const { username, verificationCode } = input.request as { username: string, verificationCode: string };
        const response = await this._authInstance.confirmSignUp(username, verificationCode);
        if (!response) {
            throw new Error("Signup confirmation failed: No response returned");
        }
        return {
            status: "success",
            description: response?.description || "Signup confirmation successful",
        };
    }

    async forgotPassword(input: ESPSDKAdaptorAPIRequest<ESPCDFForgotPasswordRequestPayload>): Promise<ESPSDKAdaptorAPIResponse> {
        const { username } = input.request as { username: string };
        const response = await this._authInstance.forgotPassword(username);
        return {
            status: "success",
            description: response?.description || "Forgot password successful",
        };
    }

    async setNewPassword(input: ESPSDKAdaptorAPIRequest<ESPCDFSetNewPasswordRequestPayload>): Promise<ESPSDKAdaptorAPIResponse> {
        const { username, newPassword, verificationCode } = input.request!
        const response = await this._authInstance.setNewPassword(username, newPassword, verificationCode);
        return {
            status: "success",
            description: response?.description || "New password set successfully",
        };
    }
}

export type { ESPRMBaseConfig };