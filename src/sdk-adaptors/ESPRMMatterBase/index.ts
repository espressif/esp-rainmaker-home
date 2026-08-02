/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ESPSDKAdaptorAPIDataResponse,
    ESPSDKAdaptorAPIRequest,
    ESPSDKAdaptorAPIResponse,
    ESPCDFUser,
    ESPCDFLoginRequestPayload,
    ESPCDFLoginWithOauthRequestPayload,
} from "@store";
import {
    ESPRMMatterBase,
    type ESPRMMatterBaseConfig,
    ESPRMAuth,
    ESPRMBaseConfig,
    ESPTransportMode,
    ESPRMBase,
    MatterSubscriptionChannelIds,
    SubscriptionChannelIds,
} from "@espressif/rainmaker-matter-sdk";
import { transformToESPCDFUser } from "./transformers";
import { ESPRMMatterBaseAdaptorIdentifier } from "./constants";
import { getActiveMatterFabricId } from "@native-adaptors/implementations/ESPMatterUtilityAdapter";
import { installCrossClusterInvokePatch } from "./installCrossClusterInvokePatch";
import { getResolvedActiveSdk, isRmneoStackSdkId } from "@config/sdk.config";

export { ESPRMMatterBaseAdaptorIdentifier };
export type {
    ClusterConfigMap,
    ClusterRegistryEntry,
} from "@espressif/rainmaker-matter-sdk";

/**
 * Installs a one-shot prototype patch on `ESPRMMatterDeviceParam.setValue`
 * that honors the `__matterCrossClusterInvoke` marker emitted by a
 * resolver's `encodeValue`. When the marker is present, the patched
 * setValue calls `ESPMatterControlAdapter.invoke()` with the override
 * `(clusterId, commandId, payload)` instead of the param's host cluster.
 *
 * Why prototype-patch: the SDK's `SetValue.js` always reads `clusterId`
 * and `endpointId` from the param instance — there is no per-write
 * cluster override hook. Touching the SDK source would force every app
 * to rebuild and republish the matter SDK; the patch lets the cluster
 * config own cross-cluster decisions (e.g. RVC `Start` → `0x54` cmd
 * `0x00` instead of `0x61` cmd `0x02`) without forking the SDK.
 *
 * Idempotent — guarded by a module-local flag so re-initialization (hot
 * reload, multi-config) doesn't stack patches.
 */
export class ESPRMMatterBaseSDKAdaptor {
    config: ESPRMMatterBaseConfig;
    _identifier: string = ESPRMMatterBaseAdaptorIdentifier;
    _authInstance!: ESPRMAuth;

    constructor(config: ESPRMMatterBaseConfig) {
        this.config = config;
        this.initializeSDK(this.config);
    }

    async initializeSDK(config: ESPRMMatterBaseConfig): Promise<ESPSDKAdaptorAPIResponse> {
        ESPRMMatterBase.setTransportOrder([
            ESPTransportMode.local,
            ESPTransportMode.cloud,
        ]);
        ESPRMMatterBase.configure(config);
        this._authInstance = ESPRMMatterBase.getAuthInstance();

        // Install the cross-cluster invoke prototype patch *after*
        // `configure` so the SDK's own `SetValue` setup (prototype assign
        // in `methods/ESPRMMatterDeviceParam/SetValue.js`) is in place
        // — we wrap it, not the other way around.
        installCrossClusterInvokePatch();

        // Register the Matter subscription channel with `ESPRMBase.subscriptionManager`
        // and put it ahead of the notification channel in the global order.
        //
        // Two steps are required for `subscribeToAllNodes()` to find the channel:
        //   1. `initializeMatterSubscription()` registers the channel built by
        //      `configure(config)` on the base SDK's subscription manager.
        //   2. `setGlobalChannelOrder([...])` puts it in the priority list —
        //      `getAvailableChannelsForNode(node)` ignores any channel not in
        //      the global order, even if registered.
        //
        // The base SDK's `configure()` already sets the order to
        // `[NOTIFICATION]` when a `notificationAdapter` is configured, which
        // overwrites whatever we set here if it runs later. To survive that,
        // we re-set the order *after* the registration completes; if the
        // notification setter happens to land afterwards we lose Matter
        // until `setGlobalChannelOrder` runs again — acceptable since this
        // path is only relevant on cold start where order is fluid anyway.
        // Best-effort: a registration failure should not block SDK init —
        // we still want commissioning / control paths to work, just without
        // matter-channel subscriptions until the next login.
        //
        // In an RMNG build this RM Matter adaptor is still constructed (for
        // potential SDK switching) but is NOT the active stack. It shares the
        // SAME native Matter adapters as the RMNG stack, so initializing the RM
        // Matter subscription here co-initializes the shared native Matter layer
        // and re-orders the global channel list — churn that destabilizes the
        // RMNG stack's operational discovery. Skip it unless RM is active.
        const isRmngActive = isRmneoStackSdkId(getResolvedActiveSdk());
        if (config.matterSubscriptionAdapter && !isRmngActive) {
            try {
                // `registerChannel` throws when the id is already present, which
                // happens on an in-place SDK re-init (deployment switch): the
                // base SDK's subscription manager lives on module statics and
                // outlives the CDF runtime. An existing registration is the
                // desired end state, so treat it as success — the resolver and
                // channel order below still have to be applied to the surviving
                // channel, or `subscribe()` fails with "Fabric ID resolver not
                // configured".
                try {
                    await ESPRMMatterBase.initializeMatterSubscription();
                } catch (error) {
                    const alreadyRegistered =
                        error instanceof Error &&
                        error.message.includes("already registered");
                    if (!alreadyRegistered) throw error;
                }

                // Wire the matter subscription channel's `fabricIdResolver`.
                // The matter SDK's `MatterSubscriptionChannel.subscribe()`
                // calls `await fabricIdResolver(rmNodeId)` and throws
                // "Fabric ID resolver not configured" if none is set.
                // Our native control adapter does its own per-node
                // (rmNodeId → matterNodeId) lookup and ignores the
                // fabricId, so returning the active fabric id from the
                // module-level cache populated by `syncFabricSession` is
                // sufficient. Returning empty string before the first
                // sync is harmless — the matter channel forwards it to
                // the adapter which ignores it.
                const matterChannel = (
                    ESPRMMatterBase as unknown as {
                        getMatterSubscriptionChannel?: () => {
                            setFabricIdResolver?: (
                                resolver: (nodeId: string) => Promise<string>,
                            ) => void;
                        } | undefined;
                    }
                ).getMatterSubscriptionChannel?.();
                if (matterChannel?.setFabricIdResolver) {
                    matterChannel.setFabricIdResolver(async (_nodeId: string) => {
                        return getActiveMatterFabricId() ?? "";
                    });
                    console.log(
                        "[ESPRMMatterBaseSDKAdaptor] matter channel fabricIdResolver wired",
                    );
                } else {
                    console.warn(
                        "[ESPRMMatterBaseSDKAdaptor] could not wire fabricIdResolver — channel.setFabricIdResolver not available",
                    );
                }

                const subscriptionManager = (
                    ESPRMBase as unknown as {
                        subscriptionManager: {
                            getGlobalChannelOrder?: () => string[];
                            setGlobalChannelOrder: (ids: string[]) => void;
                        };
                    }
                ).subscriptionManager;
                if (subscriptionManager) {
                    const currentOrder =
                        subscriptionManager.getGlobalChannelOrder?.() ?? [];
                    const desiredOrder = Array.from(
                        new Set([
                            MatterSubscriptionChannelIds.MATTER,
                            ...currentOrder,
                            SubscriptionChannelIds.NOTIFICATION,
                        ]),
                    );
                    subscriptionManager.setGlobalChannelOrder(desiredOrder);
                    console.log(
                        "[ESPRMMatterBaseSDKAdaptor] matter subscription channel registered; channel order:",
                        desiredOrder,
                    );
                }
            } catch (error) {
                console.warn(
                    "[ESPRMMatterBaseSDKAdaptor] initializeMatterSubscription failed:",
                    error,
                );
            }
        }

        return {
            status: "success",
            description: "SDK initialized successfully with Matter support",
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
        const esprmUser = await this._authInstance.login(username, password);
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

    async getSignUpCode(input: ESPSDKAdaptorAPIRequest<any>): Promise<ESPSDKAdaptorAPIResponse> {
        const { username, password } = input.request as { username: string, password: string };
        const response = await this._authInstance.sendSignUpCode(username, password);
        return {
            status: "success",
            description: response?.description || "Signup code fetched successfully",
        };
    }

    async confirmSignUp(input: ESPSDKAdaptorAPIRequest<any>): Promise<ESPSDKAdaptorAPIResponse> {
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

    async forgotPassword(input: ESPSDKAdaptorAPIRequest<any>): Promise<ESPSDKAdaptorAPIResponse> {
        const { username } = input.request as { username: string };
        const response = await this._authInstance.forgotPassword(username);
        return {
            status: "success",
            description: response?.description || "Forgot password successful",
        };
    }

    async setNewPassword(input: ESPSDKAdaptorAPIRequest<any>): Promise<ESPSDKAdaptorAPIResponse> {
        const { username, newPassword, verificationCode } = input.request!
        const response = await this._authInstance.setNewPassword(username, newPassword, verificationCode);
        return {
            status: "success",
            description: response?.description || "New password set successfully",
        };
    }
}

export type { ESPRMBaseConfig };
