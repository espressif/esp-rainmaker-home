import {
    ESPCDFLoginRequestPayload,
    ESPCDFLoginWithOauthRequestPayload,
    ESPCDFSetNewPasswordRequestPayload,
    ESPSDKAdaptor,
    ESPSDKAdaptorAPIDataResponse,
    ESPSDKAdaptorAPIRequest,
    ESPSDKAdaptorAPIResponse
} from "@store";
import { ESPRMNGBase, ESPRMNGAuth, ESPRMNGBaseConfig } from "@espressif/rmng-base-sdk";
import { ESPCDFUser } from "@store";
import { transformToESPCDFUser } from "./transformers/transformToESPCDFUser";
import { assertSignupPasswordPolicy } from "./utils/common";
import { mapRMNGLoginCatchError } from "./utils/common";
import { ESPRMNGBaseAdaptorIdentifier } from "@config/sdk.identifiers";

export { ESPRMNGBaseAdaptorIdentifier };

export class ESPRMNGBaseSDKAdaptor implements ESPSDKAdaptor {
    config: ESPRMNGBaseConfig;
    _identifier: string = ESPRMNGBaseAdaptorIdentifier;

    _authInstance!: ESPRMNGAuth;

    constructor(config: ESPRMNGBaseConfig) {
        this.config = config;
        this.initializeSDK(this.config);
    }

    async initializeSDK(config: ESPRMNGBaseConfig): Promise<ESPSDKAdaptorAPIResponse> {
        ESPRMNGBase.init(config);
        this._authInstance = ESPRMNGBase.getAuthInstance();
        return {
            status: "success",
            description: "SDK initialized successfully",
        };
    }

    async loginWithOauth(_input: ESPSDKAdaptorAPIRequest<ESPCDFLoginWithOauthRequestPayload>): Promise<ESPSDKAdaptorAPIDataResponse<ESPCDFUser>> {
        throw new Error("RMNGBase SDK does not support loginWithOauth");
    }

    async loginWithCode(_input: ESPSDKAdaptorAPIRequest<ESPCDFLoginWithOauthRequestPayload>): Promise<ESPSDKAdaptorAPIDataResponse<ESPCDFUser>> {
        throw new Error("RMNGBase SDK does not support loginWithCode");
    }

    async login(input: ESPSDKAdaptorAPIRequest<ESPCDFLoginRequestPayload>): Promise<ESPSDKAdaptorAPIDataResponse<ESPCDFUser>> {
        const { username, password } = input.request as { username: string, password: string };
        try {
            const esprmngUser = await this._authInstance.login(username, password);
            if (!esprmngUser) {
                throw new Error("Login failed: No user returned");
            }
            const cdfUser = transformToESPCDFUser(esprmngUser);
            console.log("[ESPRMNGBaseSDKAdaptor] User logged in");
            return {
                status: "success",
                description: "Login successful",
                data: cdfUser,
            };
        } catch (error) {
            console.error("[ESPRMNGBaseSDKAdaptor] login RAW SDK error:", error);
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
            const cdfUser = transformToESPCDFUser(esprmngUser);
            return {
                status: "success",
                description: "Current logged in user fetched successfully",
                data: cdfUser,
            };
        } catch (error) {
            console.error("[ESPRMNGBaseSDKAdaptor] getCurrentLoggedInUser RAW SDK error:", error);
            throw error;
        }
    }

    async getSignUpCode(input: ESPSDKAdaptorAPIRequest): Promise<ESPSDKAdaptorAPIResponse> {
        const { username, password } = input.request as { username: string, password: string };
        assertSignupPasswordPolicy(password);
        await this._authInstance.sendSignUpCode(username, password);
        return {
            status: "success",
            description: "Signup code sent successfully",
        };
    }

    async confirmSignUp(input: ESPSDKAdaptorAPIRequest): Promise<ESPSDKAdaptorAPIResponse> {
        const { username, verificationCode } = input.request as { username: string, verificationCode: string };
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

    async setNewPassword(input: ESPSDKAdaptorAPIRequest<ESPCDFSetNewPasswordRequestPayload>): Promise<ESPSDKAdaptorAPIResponse> {
        const { username, newPassword, verificationCode } = input.request!;
        const response = await this._authInstance.setNewPassword(username, newPassword, verificationCode);
        return {
            status: "success",
            description: response.message || "New password set successfully",
        };
    }
}