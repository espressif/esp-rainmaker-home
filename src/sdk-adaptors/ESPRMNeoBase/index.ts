/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ESPCDFConfirmSignUpRequestPayload,
    ESPCDFForgotPasswordRequestPayload,
    ESPCDFGetSignUpCodeRequestPayload,
    ESPCDFLoginRequestPayload,
    ESPCDFLoginWithOauthRequestPayload,
    ESPCDFSetNewPasswordRequestPayload,
    ESPSDKAdaptor,
    ESPSDKAdaptorAPIDataResponse,
    ESPSDKAdaptorAPIRequest,
    ESPSDKAdaptorAPIResponse
} from "@store";
import {
    ESPRMNeoBase,
    ESPRMNeoAuth,
    ESPRMNeoBaseConfig,
    ESPTransportMode,
} from "@espressif/rainmaker-neo-base-sdk";
import { ESPCDFUser } from "@store";
import { transformToESPCDFUser } from "./transformers/transformToESPCDFUser";
import {
    assertSignupPasswordPolicy,
    mapRMNeoLoginCatchError,
    throwNormalizedRmneoError,
} from "./utils/helpers/sharedHelpers";
import {
    ESPRMNEO_AUTH_DESC_CURRENT_USER_FETCHED,
    ESPRMNEO_AUTH_DESC_LOGIN_SUCCESS,
    ESPRMNEO_AUTH_DESC_NEW_PASSWORD_SET,
    ESPRMNEO_AUTH_DESC_SDK_INITIALIZED,
    ESPRMNEO_AUTH_DESC_SIGNUP_CODE_SENT,
    ESPRMNEO_AUTH_DESC_SIGNUP_CONFIRMATION_SUCCESS,
    ESPRMNEO_AUTH_ERR_GET_CURRENT_USER,
    ESPRMNEO_AUTH_ERR_LOGIN_FAILED,
    ESPRMNEO_AUTH_ERR_LOGIN_NO_USER,
    ESPRMNEO_AUTH_ERR_LOGIN_WITH_CODE_UNSUPPORTED,
    ESPRMNEO_AUTH_ERR_LOGIN_WITH_OAUTH_UNSUPPORTED,
    ESPRMNEO_AUTH_ERR_NO_LOGGED_IN_USER,
    ESPRMNEO_AUTH_ERR_RESET_PASSWORD,
    ESPRMNEO_AUTH_ERR_SEND_PASSWORD_RECOVERY_CODE,
    ESPRMNEO_AUTH_ERR_SEND_SIGNUP_CODE,
    ESPRMNEO_AUTH_ERR_SIGNUP_CONFIRMATION,
    ESPRMNEO_AUTH_LOG_GET_CURRENT_USER_RAW_SDK_ERROR,
    ESPRMNEO_AUTH_LOG_LOGIN_RAW_SDK_ERROR,
    formatVerificationCodeSentDescription,
} from "./utils/constants";
import { Logger } from "./utils/logger";
import { SUCESS } from "@shared/utils/constants";
import { ESPRMNeoBaseAdaptorIdentifier } from "@config/sdk.identifiers";

export { ESPRMNeoBaseAdaptorIdentifier };

/**
 * SDK adaptor that bridges the RMNeoBase auth SDK to the app's CDF layer.
 *
 * Wraps `ESPRMNeoAuth` and exposes the auth surface (`login`, signup, password
 * recovery, current-user lookup) as CDF `{ status, description, data? }` responses.
 * All errors are normalized via {@link throwNormalizedRmneoError} so auth hooks can
 * surface a consistent `description` in toasts. OAuth/code login are intentionally
 * unsupported and throw.
 */
export class ESPRMNeoBaseSDKAdaptor implements ESPSDKAdaptor {
    config: ESPRMNeoBaseConfig;
    _identifier: string = ESPRMNeoBaseAdaptorIdentifier;

    _authInstance!: ESPRMNeoAuth;

    /**
     * Stores the SDK config and eagerly initializes the underlying RMNeoBase SDK.
     * @param config - RMNeoBase SDK configuration (endpoints, transport, credentials).
     */
    constructor(config: ESPRMNeoBaseConfig) {
        this.config = config;
        this.initializeSDK(this.config);
    }

    /**
     * Configures the RMNeoBase SDK and caches its auth instance.
     *
     * Sets transport preference to local first, then MQTT, applies `config`, and
     * resolves the shared auth instance used by every other method.
     * @param config - RMNeoBase SDK configuration to apply.
     * @returns CDF response indicating successful initialization.
     */
    async initializeSDK(config: ESPRMNeoBaseConfig): Promise<ESPSDKAdaptorAPIResponse> {
        ESPRMNeoBase.setTransportOrder([
            ESPTransportMode.local,
            ESPTransportMode.mqtt,
        ]);
        ESPRMNeoBase.configure(config);
        this._authInstance = ESPRMNeoBase.getAuthInstance();
        return {
            status: SUCESS,
            description: ESPRMNEO_AUTH_DESC_SDK_INITIALIZED,
        };
    }

    /**
     * Not supported by RMNeoBase — OAuth login is unavailable in this SDK.
     * @param _input - Unused OAuth login request payload.
     * @returns Never resolves; always throws.
     * @throws Error indicating OAuth login is unsupported.
     */
    async loginWithOauth(_input: ESPSDKAdaptorAPIRequest<ESPCDFLoginWithOauthRequestPayload>): Promise<ESPSDKAdaptorAPIDataResponse<ESPCDFUser>> {
        throw new Error(ESPRMNEO_AUTH_ERR_LOGIN_WITH_OAUTH_UNSUPPORTED);
    }

    /**
     * Not supported by RMNeoBase — code-based login is unavailable in this SDK.
     * @param _input - Unused code login request payload.
     * @returns Never resolves; always throws.
     * @throws Error indicating code login is unsupported.
     */
    async loginWithCode(_input: ESPSDKAdaptorAPIRequest<ESPCDFLoginWithOauthRequestPayload>): Promise<ESPSDKAdaptorAPIDataResponse<ESPCDFUser>> {
        throw new Error(ESPRMNEO_AUTH_ERR_LOGIN_WITH_CODE_UNSUPPORTED);
    }

    /**
     * Signs in with username/password and returns a CDF user.
     *
     * Cognito `NotAuthorized` messages are trimmed to a friendly `description`;
     * other API errors are normalized to `{ description }` for auth-hook toasts.
     * @param input - Request payload carrying `username` and `password`.
     * @returns CDF response with the authenticated user in `data`.
     * @throws Normalized error (or mapped login error) when authentication fails.
     */
    async login(input: ESPSDKAdaptorAPIRequest<ESPCDFLoginRequestPayload>): Promise<ESPSDKAdaptorAPIDataResponse<ESPCDFUser>> {
        const { username, password } = input.request as { username: string, password: string };
        try {
            const esprmngUser = await this._authInstance.login(username, password);
            if (!esprmngUser) {
                throw new Error(ESPRMNEO_AUTH_ERR_LOGIN_NO_USER);
            }
            const cdfUser = transformToESPCDFUser(esprmngUser);
            return {
                status: SUCESS,
                description: ESPRMNEO_AUTH_DESC_LOGIN_SUCCESS,
                data: cdfUser,
            };
        } catch (error) {
            Logger.error(ESPRMNEO_AUTH_LOG_LOGIN_RAW_SDK_ERROR, error);
            const mapped = mapRMNeoLoginCatchError(error);
            if (mapped) throw mapped;
            throwNormalizedRmneoError(error, ESPRMNEO_AUTH_ERR_LOGIN_FAILED);
        }
    }

    /**
     * Fetches the currently authenticated user, if a session exists.
     * @returns CDF response with the logged-in user in `data`.
     * @throws Normalized error when no user is logged in or the lookup fails.
     */
    async getCurrentLoggedInUser(): Promise<ESPSDKAdaptorAPIDataResponse<ESPCDFUser>> {
        try {
            const esprmngUser = await this._authInstance.getLoggedInUser();
            if (!esprmngUser) {
                throw new Error(ESPRMNEO_AUTH_ERR_NO_LOGGED_IN_USER);
            }
            const cdfUser = transformToESPCDFUser(esprmngUser);
            return {
                status: SUCESS,
                description: ESPRMNEO_AUTH_DESC_CURRENT_USER_FETCHED,
                data: cdfUser,
            };
        } catch (error) {
            Logger.error(
                ESPRMNEO_AUTH_LOG_GET_CURRENT_USER_RAW_SDK_ERROR,
                error,
            );
            throwNormalizedRmneoError(error, ESPRMNEO_AUTH_ERR_GET_CURRENT_USER);
        }
    }

    /**
     * Sends a signup verification code for the given username.
     *
     * Enforces the signup password policy before requesting the code.
     * @param input - Request payload carrying `username` and `password`.
     * @returns CDF response confirming the code was sent.
     * @throws Error when the password policy fails, or a normalized error on API failure.
     */
    async getSignUpCode(input: ESPSDKAdaptorAPIRequest<ESPCDFGetSignUpCodeRequestPayload>): Promise<ESPSDKAdaptorAPIResponse> {
        const { username, password } = input.request as { username: string, password: string };
        assertSignupPasswordPolicy(password);
        try {
            await this._authInstance.sendSignUpCode(username, password);
            return {
                status: SUCESS,
                description: ESPRMNEO_AUTH_DESC_SIGNUP_CODE_SENT,
            };
        } catch (error) {
            throwNormalizedRmneoError(error, ESPRMNEO_AUTH_ERR_SEND_SIGNUP_CODE);
        }
    }

    /**
     * Confirms signup with the emailed / SMS verification code.
     * @param input - Request payload carrying `username` and `verificationCode`.
     * @returns CDF response using the API message when present, else a default.
     * @throws Normalized error when confirmation fails.
     */
    async confirmSignUp(input: ESPSDKAdaptorAPIRequest<ESPCDFConfirmSignUpRequestPayload>): Promise<ESPSDKAdaptorAPIResponse> {
        const { username, verificationCode } = input.request as { username: string, verificationCode: string };
        try {
            const response = await this._authInstance.confirmSignUp(username, verificationCode);
            return {
                status: SUCESS,
                description: response.message || ESPRMNEO_AUTH_DESC_SIGNUP_CONFIRMATION_SUCCESS,
            };
        } catch (error) {
            throwNormalizedRmneoError(error, ESPRMNEO_AUTH_ERR_SIGNUP_CONFIRMATION);
        }
    }

    /**
     * Starts password recovery by sending a verification code to the user.
     * @param input - Request payload carrying the `username` to recover.
     * @returns CDF response using the API message when present, else a
     * generated "verification code sent" description.
     * @throws Normalized error when the recovery request fails.
     */
    async forgotPassword(input: ESPSDKAdaptorAPIRequest<ESPCDFForgotPasswordRequestPayload>): Promise<ESPSDKAdaptorAPIResponse> {
        const { username } = input.request as { username: string };
        try {
            let response = await this._authInstance.forgotPassword(username);
            return {
                status: SUCESS,
                description: response.message || formatVerificationCodeSentDescription(username),
            };
        } catch (error) {
            throwNormalizedRmneoError(error, ESPRMNEO_AUTH_ERR_SEND_PASSWORD_RECOVERY_CODE);
        }
    }

    /**
     * Completes password recovery with verification code + new password.
     *
     * API body messages (e.g. "Invalid verification code") become `description`.
     * @param input - Request payload carrying `username`, `newPassword`, and `verificationCode`.
     * @returns CDF response using the API message when present, else a default.
     * @throws Normalized error when the password reset fails.
     */
    async setNewPassword(input: ESPSDKAdaptorAPIRequest<ESPCDFSetNewPasswordRequestPayload>): Promise<ESPSDKAdaptorAPIResponse> {
        const { username, newPassword, verificationCode } = input.request!;
        try {
            const response = await this._authInstance.setNewPassword(username, newPassword, verificationCode);
            return {
                status: SUCESS,
                description: response.message || ESPRMNEO_AUTH_DESC_NEW_PASSWORD_SET,
            };
        } catch (error) {
            throwNormalizedRmneoError(error, ESPRMNEO_AUTH_ERR_RESET_PASSWORD);
        }
    }
}
