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
    type ESPRMNeoUser,
} from "@espressif/rainmaker-neo-base-sdk";
import { ESPCDFUser } from "@store";
import { transformToESPCDFUser } from "./transformers/transformToESPCDFUser";
import { getRmneoUserIdFromIdToken } from "./utils/helpers/userCustomDataHelpers";
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
import { setCloudUpdateFilter } from "./utils/helpers/cloudUpdateFilter";
import { clearParamDeliveries } from "./utils/helpers/paramDeliveryHelpers";
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
     * Builds the CDF user from an SDK user.
     *
     * A seam, not a convenience: subclasses that add capabilities to groups or
     * nodes (e.g. the Neo Matter adaptor) override this so every auth path
     * returns their enriched user, instead of reimplementing login and its
     * error mapping.
     * @param user - SDK user, or null when not signed in.
     * @param initialUserId - User id read from the id token.
     * @returns CDF user.
     */
    protected transformUser(
        user: ESPRMNeoUser | null,
        initialUserId?: string,
    ): ESPCDFUser {
        return transformToESPCDFUser(user, initialUserId);
    }

    /**
     * Stores the SDK config. Configuring the SDK is the bootstrap's job.
     * @param config - RMNeoBase SDK configuration (endpoints, transport, credentials).
     */
    constructor(config: ESPRMNeoBaseConfig) {
        this.config = config;
    }

    /**
     * Configures the RMNeoBase SDK and caches its auth instance.
     *
     * Sets transport preference to local first, then MQTT, applies `this.config`,
     * and resolves the shared auth instance used by every other method. Called by
     * the bootstrap on the adaptor it makes active, never from the constructor.
     * @returns CDF response indicating successful initialization.
     */
    async initializeSDK(): Promise<ESPSDKAdaptorAPIResponse> {
        ESPRMNeoBase.setTransportOrder([
            ESPTransportMode.local,
            ESPTransportMode.mqtt,
        ]);
        ESPRMNeoBase.configure(this.config);
        // Plain Neo has no Matter link, so no cloud update is dropped.
        setCloudUpdateFilter(undefined);
        // Forget live-channel deliveries noted before this start.
        clearParamDeliveries();
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
            const esprmneoUser = await this._authInstance.login(username, password);
            if (!esprmneoUser) {
                throw new Error(ESPRMNEO_AUTH_ERR_LOGIN_NO_USER);
            }
            const cdfUser = this.transformUser(
                esprmneoUser,
                await getRmneoUserIdFromIdToken(esprmneoUser),
            );
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
            const esprmneoUser = await this._authInstance.getLoggedInUser();
            if (!esprmneoUser) {
                throw new Error(ESPRMNEO_AUTH_ERR_NO_LOGGED_IN_USER);
            }
            const cdfUser = this.transformUser(
                esprmneoUser,
                await getRmneoUserIdFromIdToken(esprmneoUser),
            );
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
     * @returns CDF response using the API message when present (it carries the
     * backend's "existing users should log in instead" hint), else a default.
     * @throws Error when the password policy fails, or a normalized error on API failure.
     */
    async getSignUpCode(input: ESPSDKAdaptorAPIRequest<ESPCDFGetSignUpCodeRequestPayload>): Promise<ESPSDKAdaptorAPIResponse> {
        const { username, password } = input.request as { username: string, password: string };
        assertSignupPasswordPolicy(password);
        try {
            const response = await this._authInstance.sendSignUpCode(username, password);
            return {
                status: SUCESS,
                description: response.message || ESPRMNEO_AUTH_DESC_SIGNUP_CODE_SENT,
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
